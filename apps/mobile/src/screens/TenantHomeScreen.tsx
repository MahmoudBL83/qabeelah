import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, typography, rounded } from '../ui/theme';
import Skeleton from '../components/ui/Skeleton';
import ScreenHeader from '../components/ScreenHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Event } from '@qabila/types';
import { Ionicons } from '@expo/vector-icons';
import BrandMark from '../components/BrandMark';
import OccasionsCalendar from '../components/OccasionsCalendar';
import { getUserAvatarUrl } from '../lib/user';
import { formatDateWithHijri } from '../lib/date';

interface Activity {
  _id: string;
  type: string;
  userName: string;
  description?: string;
  createdAt: string;
}

export default function TenantHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const userAvatar = getUserAvatarUrl(user);
  const [persons, setPersons] = useState<any[]>([]);
  const [tenantName, setTenantName] = useState('العائلة');
  const [events, setEvents] = useState<Event[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const seedResult = await apiClient.seedDatabase();
        if (!seedResult?.tenantId) return;
        const [peopleData, tenant, eventsData, activitiesData] = await Promise.all([
          apiClient.getPersons(seedResult.tenantId),
          apiClient.getTenant(seedResult.tenantId),
          apiClient.getEvents(seedResult.tenantId, 4),
          apiClient.getActivities(seedResult.tenantId, 8, 0)
        ]);
        setPersons(peopleData);
        setTenantName(tenant?.name || 'العائلة');
        setEvents(eventsData);
        setActivities(activitiesData || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const recentAdditions = useMemo(() => {
    return [...persons]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 4);
  }, [persons]);

  const getDisplayFirstName = (person?: any) => person?.firstName?.trim() || '—';

  const formatEventDate = (isoDate?: string) => {
    if (!isoDate) return { day: '00', month: 'غير محدد', hijri: '' };
    const parts = formatDateWithHijri(isoDate);
    return { day: parts.gregDay, month: parts.gregMonthShort, hijri: parts.hijriShort };
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title="الرئيسية"
        actionLabel="الحساب"
        onAction={() => navigation.getParent()?.navigate('MainTabs' as any, { screen: 'Account' } as any)}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroLogoWrap}>
            <BrandMark />
          </View>
          <View style={styles.heroChipRow}>
            <View style={styles.heroChip}><Text style={styles.heroChipText}>مساحة العائلة الخاصة</Text></View>
            <View style={styles.heroChipAlt}><Text style={styles.heroChipAltText}>لوحة سريعة</Text></View>
          </View>
          <Text style={styles.heroTitle}>عائلة {tenantName}</Text>
          <Text style={styles.heroSubtitle}>
            نحفظ الإرث، ونوثق الجذور، لتمهيد الطريق للأجيال القادمة.
          </Text>
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.heroButton} onPress={() => navigation.navigate('FamilyTree')} activeOpacity={0.9}>
              <Text style={styles.heroButtonText}>استكشاف الشجرة</Text>
              <Ionicons name="arrow-back" size={16} color={colors.surface} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroSecondaryButton} onPress={() => navigation.getParent()?.navigate('MainTabs' as any, { screen: 'Notifications' } as any)} activeOpacity={0.9}>
              <Ionicons name="notifications-outline" size={16} color={colors.text} />
              <Text style={styles.heroSecondaryText}>الإشعارات</Text>
            </TouchableOpacity>
          </View>
        </View>

        <OccasionsCalendar
          events={events}
          onEventPress={(eventId) => navigation.navigate('OccasionDetail', { eventId })}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>أحدث الإضافات</Text>
          <TouchableOpacity onPress={() => navigation.navigate('FamilyTree')}>
            <Text style={styles.sectionAction}>عرض الشجرة</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ paddingVertical: spacing.md }}>
            <Skeleton style={{ height: 190, borderRadius: 28, marginBottom: spacing.md }} aria-label="loading-hero" />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, justifyContent: 'space-between' }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} style={{ height: 104, width: '30%', borderRadius: 22 }} aria-label={`loading-card-${i}`} />
              ))}
            </View>
            <Skeleton style={{ height: 220, borderRadius: 28 }} aria-label="loading-list" />
          </View>
        ) : recentAdditions.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد إضافات حديثة.</Text>
        ) : (
          <View style={styles.grid}>
            {recentAdditions.map((person) => (
              <View key={person._id} style={styles.personCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {person.firstName?.trim()?.[0] || '؟'}
                  </Text>
                </View>
                <Text style={styles.personName}>{getDisplayFirstName(person)}</Text>
                <Text style={styles.personMeta}>
                  {person.birthYear ? `مواليد ${person.birthYear}` : 'سنة الميلاد غير متوفرة'}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.statsCard}>
          <View style={styles.statsIconWrapper}>
            <Ionicons name="stats-chart" size={24} color={colors.secondary} />
          </View>
          <View style={styles.statsTextWrapper}>
            <Text style={styles.statsTitle}>إحصائيات العائلة</Text>
            <Text style={styles.statsLabel}>إجمالي {persons.length} فرد مسجلين وموثقين رسمياً.</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>المناسبات القادمة</Text>
        </View>

        {events.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد مناسبات قادمة حالياً.</Text>
        ) : (
          events.map((event) => {
            const dateObj = formatEventDate(event.eventDate);
            return (
              <TouchableOpacity
                key={event._id || event.id}
                style={styles.eventCard}
                onPress={() => navigation.navigate('OccasionDetail', { eventId: String(event._id || event.id) })}
              >
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventDesc} numberOfLines={2}>
                    {event.description || 'تفاصيل المناسبة متاحة داخل الصفحة.'}
                  </Text>
                </View>
                <View style={styles.eventDate}>
                  <Text style={styles.eventDateDay}>{dateObj.day}</Text>
                  <Text style={styles.eventDateMonth}>{dateObj.month}</Text>
                </View>
              </TouchableOpacity>
            )
          })
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>النشاط الأخير</Text>
        </View>

        {activities.length === 0 ? (
          <Text style={styles.emptyText}>لا يوجد نشاط حالياً.</Text>
        ) : (
          activities.slice(0, 6).map((activity) => {
            const timeAgo = new Date(activity.createdAt);
            const now = new Date();
            const diffMs = now.getTime() - timeAgo.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            let timeText = 'للتو';
            if (diffMins > 0 && diffMins < 60) timeText = `منذ ${diffMins}د`;
            else if (diffHours > 0 && diffHours < 24) timeText = `منذ ${diffHours}س`;
            else if (diffDays > 0) timeText = `منذ ${diffDays}يوم`;

            return (
              <View key={activity._id} style={styles.activityCard}>
                <View style={styles.activityAvatar}>
                  <Text style={styles.activityAvatarText}>
                    {activity.userName?.[0] || '؟'}
                  </Text>
                </View>
                <View style={styles.activityContent}>
                  <Text style={styles.activityTime}>{timeText}</Text>
                  <Text style={styles.activityDesc} numberOfLines={2}>
                    {activity.description || activity.type}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  topBar: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  userSection: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  topActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  userTextWrapper: {
    alignItems: 'flex-end',
    gap: 2,
  },
  brandTitle: {
    ...typography.bodyLg,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 1.2,
  },
  brandSubtitle: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: rounded.full,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerAvatar: {
    width: '100%',
    height: '100%',
  },
  headerAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    ...typography.labelMd,
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl
  },
  heroCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: 28,
    padding: spacing.xl,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroLogoWrap: {
    position: 'absolute',
    left: -6,
    bottom: -6,
    opacity: 0.1,
    transform: [{ scale: 1.75 }],
  },
  heroChipRow: {
    flexDirection: 'row-reverse',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    alignSelf: 'flex-end'
  },
  heroChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: rounded.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroChipAlt: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: rounded.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroChipText: {
    ...typography.labelMd,
    color: colors.secondaryContainer,
  },
  heroChipAltText: {
    ...typography.labelMd,
    color: colors.surface,
  },
  heroTitle: {
    ...typography.headlineLg,
    color: colors.surface,
    marginBottom: spacing.xs,
    textAlign: 'right',
  },
  heroSubtitle: {
    ...typography.bodyMd,
    color: '#e5e2e1',
    marginBottom: spacing.lg,
    textAlign: 'right',
  },
  heroActions: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    justifyContent: 'flex-end'
  },
  heroButton: {
    backgroundColor: colors.secondary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
  },
  heroSecondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroButtonText: {
    ...typography.button,
    color: colors.surface,
  },
  heroSecondaryText: {
    ...typography.button,
    color: colors.text,
  },
  sectionHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionTitle: {
    ...typography.headlineMd,
    fontSize: 20,
    color: colors.text
  },
  sectionAction: {
    ...typography.labelMd,
    color: colors.secondary,
    textDecorationLine: 'underline',
  },
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  personCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: {
    ...typography.headlineMd,
    color: colors.secondary,
  },
  personName: {
    ...typography.bodyMd,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  personMeta: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center'
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row-reverse',
    gap: spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  statsIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: rounded.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.secondaryContainer,
  },
  statsTextWrapper: {
    flex: 1,
    alignItems: 'flex-end',
  },
  statsTitle: {
    ...typography.bodyLg,
    fontWeight: '600',
    color: colors.primary,
  },
  statsLabel: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'right',
  },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: 'row-reverse',
    gap: spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  eventDate: {
    width: 64,
    height: 64,
    borderRadius: rounded.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.secondaryContainer,
  },
  eventDateDay: {
    ...typography.headlineMd,
    color: colors.secondary,
    lineHeight: 28,
  },
  eventDateMonth: {
    ...typography.labelMd,
    color: colors.textMuted,
  },
  eventInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  eventTitle: {
    ...typography.bodyLg,
    fontWeight: '600',
    color: colors.primary,
  },
  eventDesc: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: 'right',
  },
  activityCard: {
    marginHorizontal: spacing.xs,
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row-reverse',
    gap: spacing.md,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  activityAvatar: {
    width: 36,
    height: 36,
    borderRadius: rounded.full,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  activityAvatarText: {
    ...typography.labelMd,
    color: colors.primary,
    fontWeight: '700',
  },
  activityContent: {
    flex: 1,
    alignItems: 'flex-end',
  },
  activityTime: {
    ...typography.labelMd,
    color: colors.textMuted,
    marginBottom: 4,
  },
  activityDesc: {
    ...typography.bodyMd,
    color: colors.text,
    fontWeight: '500',
    textAlign: 'right',
  },
});