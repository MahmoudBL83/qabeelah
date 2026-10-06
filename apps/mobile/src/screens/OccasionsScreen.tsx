import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { Event } from '@qabila/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, rounded, spacing, typography } from '../ui/theme';
import OccasionsCalendar from '../components/OccasionsCalendar';
import ScreenHeader from '../components/ScreenHeader';
import { formatDateWithHijri } from '../lib/date';
import { useAuth } from '../contexts/AuthContext';
import useSuperAdminTenantSelection from '../hooks/useSuperAdminTenantSelection';
import { UserRole } from '@qabila/types';
import { Modal } from 'react-native';

export default function OccasionsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const {
    tenants,
    selectedTenantId,
    selectedTenant,
    setSelectedTenantId,
    loading: tenantSelectionLoading,
  } = useSuperAdminTenantSelection(Boolean(isSuperAdmin));
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTenantPicker, setShowTenantPicker] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
      if (isSuperAdmin && tenantSelectionLoading) return;

      try {
        if (isSuperAdmin) {
          if (!selectedTenantId) {
            setEvents([]);
            return;
          }

          const data = await apiClient.getEvents(selectedTenantId, 12);
          setEvents(data || []);
          return;
        }

        const seed = await apiClient.seedDatabase();
        if (!seed?.tenantId) return;
        const data = await apiClient.getEvents(seed.tenantId, 12);
        setEvents(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, [isSuperAdmin, selectedTenantId, tenantSelectionLoading]);

  const upcomingEvents = useMemo(() => {
    return [...events]
      .filter((event) => event.eventDate)
      .sort((left, right) => new Date(left.eventDate).getTime() - new Date(right.eventDate).getTime())
      .slice(0, 6);
  }, [events]);

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="المناسبات" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isSuperAdmin ? (
          <View style={styles.tenantPickerCard}>
            <View style={styles.tenantPickerTextBlock}>
              <Text style={styles.tenantPickerLabel}>العائلة المعروضة</Text>
              <Text style={styles.tenantPickerTitle}>{selectedTenant?.name || 'اختر عائلة'}</Text>
              <Text style={styles.tenantPickerSubtitle}>تظهر المناسبات بحسب العائلة المختارة للمشرف العام.</Text>
            </View>
            <TouchableOpacity style={styles.tenantPickerButton} onPress={() => setShowTenantPicker(true)} activeOpacity={0.9}>
              <Text style={styles.tenantPickerButtonText}>تغيير العائلة</Text>
              <Ionicons name="chevron-down" size={16} color={colors.surface} />
            </TouchableOpacity>
          </View>
        ) : null}

      

        <OccasionsCalendar
          events={events}
          onEventPress={(eventId) => navigation.navigate('OccasionDetail', { eventId })}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>المناسبات القادمة</Text>
          <Text style={styles.sectionMeta}>{loading ? 'جارٍ التحميل...' : `${upcomingEvents.length} مناسبة`}</Text>
        </View>

        {upcomingEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>لا توجد مناسبات متاحة حالياً.</Text>
          </View>
        ) : (
          upcomingEvents.map((event) => {
            const formatted = formatDateWithHijri(event.eventDate);
            return (
              <TouchableOpacity
                key={event._id || event.id}
                style={styles.eventCard}
                onPress={() => navigation.navigate('OccasionDetail', { eventId: String(event._id || event.id) })}
                activeOpacity={0.85}
              >
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventDesc} numberOfLines={2}>
                    {event.description || 'اضغط لعرض التفاصيل الكاملة.'}
                  </Text>
                </View>
                <View style={styles.eventDate}>
                  <Text style={styles.eventDateDay}>{formatted.gregDay}</Text>
                  <Text style={styles.eventDateMonth}>{formatted.gregMonthShort}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal visible={showTenantPicker} transparent animationType="fade" onRequestClose={() => setShowTenantPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.tenantPickerModal}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>اختيار العائلة</Text>
                <Text style={styles.modalSubtitle}>اختر العائلة التي تريد عرض مناسباتها.</Text>
              </View>
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowTenantPicker(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.tenantPickerList} contentContainerStyle={styles.tenantPickerListContent}>
              {tenants.map((tenant) => {
                const isSelected = tenant._id === selectedTenantId;
                return (
                  <TouchableOpacity
                    key={tenant._id}
                    style={[styles.tenantPickerOption, isSelected && styles.tenantPickerOptionSelected]}
                    onPress={() => {
                      setSelectedTenantId(tenant._id);
                      setShowTenantPicker(false);
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.tenantPickerOptionTitle, isSelected && styles.tenantPickerOptionTitleSelected]}>{tenant.name}</Text>
                    <Text style={[styles.tenantPickerOptionSub, isSelected && styles.tenantPickerOptionTitleSelected]}>{tenant.subdomain}.qabila.com</Text>
                  </TouchableOpacity>
                );
              })}

              {tenants.length === 0 ? (
                <View style={styles.tenantPickerEmpty}>
                  <Text style={styles.tenantPickerEmptyText}>لا توجد عائلات متاحة حالياً.</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  tenantPickerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: spacing.md,
    gap: spacing.md,
  },
  tenantPickerTextBlock: {
    gap: 4,
  },
  tenantPickerLabel: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  tenantPickerTitle: {
    ...typography.headlineMd,
    color: colors.text,
    fontWeight: '700',
  },
  tenantPickerSubtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  tenantPickerButton: {
    flexDirection: 'row-reverse',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: rounded.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tenantPickerButtonText: {
    ...typography.button,
    color: colors.surface,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  tenantPickerModal: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: spacing.lg,
    maxHeight: '72%',
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  modalTitle: {
    ...typography.headlineMd,
    color: colors.text,
    fontWeight: '700',
  },
  modalSubtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
    marginTop: 4,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: rounded.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tenantPickerList: {
    maxHeight: 340,
  },
  tenantPickerListContent: {
    gap: spacing.sm,
  },
  tenantPickerOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: spacing.md,
    alignItems: 'flex-end',
    backgroundColor: colors.background,
  },
  tenantPickerOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.secondaryContainer,
  },
  tenantPickerOptionTitle: {
    ...typography.bodyLg,
    color: colors.text,
    fontWeight: '700',
  },
  tenantPickerOptionTitleSelected: {
    color: colors.primary,
  },
  tenantPickerOptionSub: {
    ...typography.bodyMd,
    color: colors.textMuted,
    marginTop: 4,
  },
  tenantPickerEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  tenantPickerEmptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  heroCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: 28,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroTag: {
    ...typography.labelMd,
    color: colors.surface,
    opacity: 0.92,
  },
  heroTitle: {
    ...typography.headlineMd,
    color: colors.surface,
    fontWeight: '700',
  },
  heroSubtitle: {
    ...typography.bodyMd,
    color: 'rgba(255, 255, 255, 0.84)',
  },
  heroButton: {
    flexDirection: 'row-reverse',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.secondary,
    borderRadius: rounded.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  heroButtonText: {
    ...typography.button,
    color: colors.surface,
  },
  sectionHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  sectionTitle: {
    ...typography.headlineMd,
    color: colors.text,
    fontWeight: '700',
  },
  sectionMeta: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  eventCard: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: spacing.md,
    gap: spacing.md,
  },
  eventInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  eventTitle: {
    ...typography.bodyLg,
    color: colors.text,
    fontWeight: '700',
    textAlign: 'right',
  },
  eventDesc: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  eventDate: {
    width: 64,
    borderRadius: 18,
    backgroundColor: colors.secondaryContainer,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDateDay: {
    ...typography.bodyLg,
    color: colors.onSecondaryContainer,
    fontWeight: '700',
  },
  eventDateMonth: {
    ...typography.labelMd,
    color: colors.onSecondaryContainer,
  },
});
