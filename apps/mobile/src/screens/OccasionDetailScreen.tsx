import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { colors, rounded, spacing, typography } from '../ui/theme';
import ScreenHeader from '../components/ScreenHeader';
import Skeleton from '../components/ui/Skeleton';
import { Ionicons } from '@expo/vector-icons';
import { Event } from '@qabila/types';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '@qabila/types';
import useSuperAdminTenantSelection from '../hooks/useSuperAdminTenantSelection';
import { formatDateWithHijri } from '../lib/date';

export default function OccasionDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'OccasionDetail'>>();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const { selectedTenantId, loading: tenantSelectionLoading } = useSuperAdminTenantSelection(Boolean(isSuperAdmin));
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [registered, setRegistered] = useState(false);
  const [processing, setProcessing] = useState(false);
  const eventId = useMemo(() => route.params?.eventId, [route.params?.eventId]);

  const formattedDate = useMemo(() => {
    if (!event?.eventDate) {
      return null;
    }

    return formatDateWithHijri(event.eventDate);
  }, [event?.eventDate]);

  const statusCopy = useMemo(() => {
    switch (event?.status) {
      case 'ONGOING':
        return { label: 'مستمرة الآن', tone: styles.statusLive };
      case 'COMPLETED':
        return { label: 'اكتملت', tone: styles.statusDone };
      case 'CANCELLED':
        return { label: 'ألغيت', tone: styles.statusCancelled };
      default:
        return { label: 'قادمة', tone: styles.statusUpcoming };
    }
  }, [event?.status]);

  const mediaSource = useMemo(() => {
    const candidate = event?.mainImage || event?.images?.[0];
    return candidate ? { uri: candidate } : null;
  }, [event?.images, event?.mainImage]);

  const eventDateText = formattedDate?.combined || 'غير محدد';
  const eventLocationText = event?.location || 'سيتم تحديد الموقع لاحقاً';
  const capacityText = event?.capacity ? `${event.registeredCount || 0} / ${event.capacity}` : 'غير محددة';
  const isAtCapacity = Boolean(event?.capacity && (event.registeredCount || 0) >= event.capacity && !registered);
  const canToggleRegistration = Boolean(event?.registrationRequired && !isAtCapacity);

  useEffect(() => {
    const loadEvent = async () => {
      if (!eventId) {
        setError('لم يتم العثور على المناسبة المطلوبة.');
        setLoading(false);
        return;
      }

      if (isSuperAdmin && tenantSelectionLoading) {
        return;
      }

      try {
        const tenant = isSuperAdmin
          ? (tenantSelectionLoading ? '' : selectedTenantId)
          : (tenantId || (await apiClient.seedDatabase())?.tenantId);
        if (!tenant) {
          setError('تعذر تحديد مساحة العائلة الخاصة بك.');
          setLoading(false);
          return;
        }
        if (!tenantId) setTenantId(tenant);
        const data = await apiClient.getEventById(tenant, eventId);
        setEvent(data);
        try {
          const users = Array.isArray(data?.registeredUsers) ? data.registeredUsers : [];
          setRegistered(Boolean(user && users.some((u: any) => String(u) === String(user.id) || String(u) === String(user._id))));
        } catch (e) {
          setRegistered(false);
        }
      } catch (err) {
        console.error(err);
        setError('تعذر تحميل تفاصيل المناسبة.');
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [eventId, isSuperAdmin, selectedTenantId, tenantSelectionLoading, tenantId, user]);

  const handleToggleRegistration = async () => {
    if (!event) return;

    if (!user) {
      navigation.navigate('Login');
      return;
    }

    if (processing || !canToggleRegistration) return;

    setProcessing(true);
    try {
      const tid = isSuperAdmin
        ? (tenantSelectionLoading ? '' : selectedTenantId)
        : (tenantId || (await apiClient.seedDatabase())?.tenantId);
      if (!tid) throw new Error('No tenant');

      const eventKey = event._id || event.id;
      if (!eventKey) throw new Error('Missing event id');

      if (!registered) {
        await apiClient.registerForEvent(eventKey, tid);
        setRegistered(true);
        setEvent((prev) => {
          if (!prev) return prev;
          const prevUsers = Array.isArray(prev.registeredUsers) ? prev.registeredUsers : [];
          const nextUsers = user ? [...prevUsers, user.id] : prevUsers;
          return { ...prev, registeredCount: (prev.registeredCount || 0) + 1, registeredUsers: nextUsers } as Event;
        });
      } else {
        await apiClient.unregisterFromEvent(eventKey, tid);
        setRegistered(false);
        setEvent((prev) => {
          if (!prev) return prev;
          const prevUsers = Array.isArray(prev.registeredUsers) ? prev.registeredUsers : [];
          const nextUsers = user ? prevUsers.filter((u: any) => String(u) !== String(user.id) && String(u) !== String(user._id)) : prevUsers;
          return { ...prev, registeredCount: Math.max((prev.registeredCount || 1) - 1, 0), registeredUsers: nextUsers } as Event;
        });
      }
    } catch (err) {
      console.error(err);
      setError('حدثت مشكلة أثناء التسجيل. حاول مرة أخرى.');
    } finally {
      setProcessing(false);
    }
  };

  const openMaps = async () => {
    if (!event?.googleMapsUrl) return;
    try {
      await Linking.openURL(event.googleMapsUrl);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="تفاصيل المناسبة" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ padding: spacing.md }}>
            <Skeleton style={{ height: 240, borderRadius: 28, marginBottom: spacing.md }} aria-label="loading-hero" />
            <View style={styles.loadingRow}>
              <Skeleton style={styles.loadingTile} aria-label="loading-meta-1" />
              <Skeleton style={styles.loadingTile} aria-label="loading-meta-2" />
            </View>
            <View style={styles.loadingRow}>
              <Skeleton style={styles.loadingTile} aria-label="loading-meta-3" />
              <Skeleton style={styles.loadingTile} aria-label="loading-meta-4" />
            </View>
            <Skeleton style={{ height: 110, borderRadius: 22, marginTop: spacing.sm }} aria-label="loading-description" />
            <Skeleton style={{ height: 120, borderRadius: 22, marginTop: spacing.sm }} aria-label="loading-action" />
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>تعذر عرض المناسبة</Text>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : event ? (
          <View style={styles.pageShell}>
            <View style={styles.heroCard}>
              {mediaSource ? (
                <ImageBackground source={mediaSource} style={styles.heroMedia} imageStyle={styles.heroMediaImage}>
                  <View style={styles.heroOverlay} />
                  <View style={styles.heroTopRow}>
                    <View style={[styles.statusPill, statusCopy.tone]}>
                      <Text style={styles.statusPillText}>{statusCopy.label}</Text>
                    </View>
                    <Text style={styles.heroTag}>مناسبة عائلية</Text>
                  </View>
                  <View style={styles.heroBottomBlock}>
                    <Text style={styles.heroTitle}>{event.title}</Text>
                    <Text style={styles.heroDate}>{eventDateText}</Text>
                  </View>
                </ImageBackground>
              ) : (
                <View style={styles.heroMediaFallback}>
                  <View style={styles.heroTopRow}>
                    <View style={[styles.statusPill, statusCopy.tone]}>
                      <Text style={styles.statusPillText}>{statusCopy.label}</Text>
                    </View>
                    <Text style={styles.heroTag}>مناسبة عائلية</Text>
                  </View>
                  <View style={styles.heroBottomBlock}>
                    <Text style={styles.heroTitle}>{event.title}</Text>
                    <Text style={styles.heroDate}>{eventDateText}</Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.quickGrid}>
              <View style={styles.quickCard}>
                <Text style={styles.quickLabel}>الموقع</Text>
                <Text style={styles.quickValue}>{eventLocationText}</Text>
              </View>
              <View style={styles.quickCard}>
                <Text style={styles.quickLabel}>السعة</Text>
                <Text style={styles.quickValue}>{capacityText}</Text>
              </View>
            </View>

            <View style={styles.quickGrid}>
              <View style={styles.quickCard}>
                <Text style={styles.quickLabel}>تاريخ ميلادي/هجري</Text>
                <Text style={styles.quickValue}>{eventDateText}</Text>
              </View>
              <View style={styles.quickCard}>
                <Text style={styles.quickLabel}>التسجيل</Text>
                <Text style={styles.quickValue}>{event.registrationRequired ? 'مطلوب' : 'اختياري'}</Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>الوصف</Text>
              <Text style={styles.sectionText}>{event.description || 'لا توجد تفاصيل إضافية حالياً.'}</Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>معلومات إضافية</Text>
              <View style={styles.detailRows}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>الحالة</Text>
                  <Text style={styles.detailValue}>{statusCopy.label}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>عدد المسجلين</Text>
                  <Text style={styles.detailValue}>{event.registeredCount || 0}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>التاريخ</Text>
                  <Text style={styles.detailValue}>{eventDateText}</Text>
                </View>
              </View>
            </View>

            {event.googleMapsUrl ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>الموقع على الخريطة</Text>
                <Text style={styles.sectionText}>{event.location || 'يمكن فتح الموقع مباشرة عبر خرائط Google.'}</Text>
                <TouchableOpacity style={styles.mapButton} onPress={openMaps} activeOpacity={0.9}>
                  <Ionicons name="location-outline" size={18} color={colors.surface} />
                  <Text style={styles.mapButtonText}>فتح خرائط Google</Text>
                </TouchableOpacity>
                <Text style={styles.mapHint} numberOfLines={1}>{event.googleMapsUrl}</Text>
              </View>
            ) : null}

            <View style={styles.actionCard}>
              <View style={styles.actionCardText}>
                <Text style={styles.actionTitle}>{registered ? 'أنت مسجل في هذه المناسبة' : 'تسجيل الحضور'}</Text>
                <Text style={styles.actionText}>
                  {event.registrationRequired
                    ? registered
                      ? 'يمكنك إلغاء التسجيل في أي وقت قبل الموعد.'
                      : 'اضغط للتسجيل وحفظ حضورك ضمن قائمة المشاركين.'
                    : 'هذه المناسبة لا تتطلب تسجيل حضور.'}
                </Text>
              </View>

              <View style={styles.actionButtons}>
                {event.googleMapsUrl ? (
                  <TouchableOpacity style={styles.secondaryButton} onPress={openMaps} activeOpacity={0.85}>
                    <Text style={styles.secondaryButtonText}>فتح الخريطة</Text>
                  </TouchableOpacity>
                ) : null}

                {event.registrationRequired ? (
                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      processing && styles.buttonDisabled,
                      isAtCapacity && !registered ? styles.buttonDisabled : undefined
                    ]}
                    onPress={handleToggleRegistration}
                    disabled={processing || (isAtCapacity && !registered)}
                    activeOpacity={0.9}
                  >
                    {processing ? (
                      <ActivityIndicator color={colors.surface} />
                    ) : (
                      <Text style={styles.primaryButtonText}>{registered ? 'إلغاء التسجيل' : 'سجل حضور'}</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.informationalButton}>
                    <Text style={styles.informationalButtonText}>لا يلزم تسجيل</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl
  },
  pageShell: {
    gap: spacing.md
  },
  heroCard: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  heroMedia: {
    minHeight: 260,
    padding: spacing.lg,
    justifyContent: 'space-between'
  },
  heroMediaFallback: {
    minHeight: 260,
    padding: spacing.lg,
    justifyContent: 'space-between',
    backgroundColor: colors.primaryDark
  },
  heroMediaImage: {
    borderRadius: 28
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.34)'
  },
  heroTopRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  heroTag: {
    ...typography.labelMd,
    color: colors.surface,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: rounded.full,
    overflow: 'hidden'
  },
  heroBottomBlock: {
    gap: spacing.xs
  },
  heroTitle: {
    ...typography.headlineMd,
    color: colors.surface,
    fontWeight: '700'
  },
  heroDate: {
    ...typography.bodyMd,
    color: 'rgba(255, 255, 255, 0.92)'
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: rounded.full
  },
  statusPillText: {
    ...typography.labelMd,
    color: colors.surface
  },
  statusUpcoming: {
    backgroundColor: 'rgba(0, 0, 0, 0.42)'
  },
  statusLive: {
    backgroundColor: '#166534'
  },
  statusDone: {
    backgroundColor: '#4b5563'
  },
  statusCancelled: {
    backgroundColor: '#b91c1c'
  },
  quickGrid: {
    flexDirection: 'row-reverse',
    gap: spacing.sm
  },
  quickCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing.md,
    gap: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  quickLabel: {
    ...typography.labelMd,
    color: colors.textMuted
  },
  quickValue: {
    ...typography.bodyMd,
    color: colors.text,
    fontWeight: '600'
  },
  loadingRow: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  loadingTile: {
    flex: 1,
    height: 88,
    borderRadius: 22
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing.md,
    gap: spacing.sm
  },
  sectionTitle: {
    ...typography.headlineMd,
    color: colors.text,
    fontWeight: '700'
  },
  sectionText: {
    ...typography.bodyMd,
    color: colors.textMuted
  },
  mapButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.secondary,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs
  },
  mapButtonText: {
    ...typography.button,
    color: colors.surface
  },
  mapHint: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginTop: spacing.sm
  },
  detailRows: {
    gap: spacing.sm
  },
  detailRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 18,
    padding: spacing.md
  },
  detailLabel: {
    ...typography.labelMd,
    color: colors.textMuted
  },
  detailValue: {
    ...typography.bodyMd,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'left'
  },
  actionCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: 26,
    padding: spacing.lg,
    gap: spacing.md
  },
  actionCardText: {
    gap: spacing.xs
  },
  actionTitle: {
    ...typography.headlineMd,
    color: colors.surface,
    fontWeight: '700'
  },
  actionText: {
    ...typography.bodyMd,
    color: 'rgba(255, 255, 255, 0.84)'
  },
  actionButtons: {
    gap: spacing.sm
  },
  primaryButton: {
    backgroundColor: colors.secondary,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.surface
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    alignItems: 'center'
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.surface
  },
  informationalButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 14,
    alignItems: 'center'
  },
  informationalButtonText: {
    ...typography.button,
    color: colors.surface
  },
  buttonDisabled: {
    opacity: 0.55
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing.lg,
    gap: spacing.xs
  },
  errorTitle: {
    ...typography.headlineMd,
    color: colors.text,
    fontWeight: '700'
  },
  error: {
    color: colors.error,
    ...typography.bodyMd
  }
});
