import { useMemo, useState } from 'react';
import { Event } from '@qabila/types';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, rounded, typography } from '../ui/theme';
import { formatDateWithHijri, formatMonthWithHijri } from '../lib/date';

interface OccasionsCalendarProps {
  events: Event[];
  onEventPress?: (eventId: string) => void;
}

export default function OccasionsCalendar({ events, onEventPress }: OccasionsCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());
  const [detailsVisible, setDetailsVisible] = useState(false);

  const getStatusLabel = (status?: Event['status']) => {
    switch (status) {
      case 'ONGOING':
        return 'مستمرة الآن';
      case 'COMPLETED':
        return 'اكتملت';
      case 'CANCELLED':
        return 'ألغيت';
      default:
        return 'قادمة';
    }
  };

  const eventsByDate = useMemo(() => {
    const map: Record<string, Event[]> = {};
    events.forEach((event) => {
      const date = new Date(event.eventDate);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(event);
    });
    return map;
  }, [events]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysCount = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = Array.from({ length: daysCount }, (_, index) => {
      const day = index + 1;
      const date = new Date(year, month, day);
      const key = `${year}-${month}-${day}`;
      const dayEvents = eventsByDate[key] || [];
      return {
        day,
        date,
        events: dayEvents,
        isToday:
          new Date().getFullYear() === year &&
          new Date().getMonth() === month &&
          new Date().getDate() === day,
        hijriDay: formatDateWithHijri(date).hijriDay,
      };
    });

    return { days, startingDayOfWeek };
  }, [currentMonth, eventsByDate]);

  const emptyCells = Array.from({ length: calendarDays.startingDayOfWeek }, (_, index) => index);
  const selectedCalendarDay = calendarDays.days.find((day) => day.day === selectedDay) || calendarDays.days[0] || null;
  const selectedEvents = selectedCalendarDay?.events || [];

  const openDay = (day: number) => {
    setSelectedDay(day);
    setDetailsVisible(true);
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    setSelectedDay(1);
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    setSelectedDay(1);
  };

  const weekDays = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>تقويم المناسبات</Text>
          <Text style={styles.subtitle}>اضغط على أي يوم لعرض المناسبات والهجرية والميلادية</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.monthButton} onPress={prevMonth}>
            <Text style={styles.monthButtonText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.monthButton} onPress={nextMonth}>
            <Text style={styles.monthButtonText}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.monthLabelWrap}>
        <Text style={styles.monthLabel}>{formatMonthWithHijri(currentMonth).combined}</Text>
      </View>

      <View style={styles.weekRow}>
        {weekDays.map((day) => (
          <Text key={day} style={styles.weekDay}>{day}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {emptyCells.map((index) => <View key={`empty-${index}`} style={styles.emptyCell} />)}

        {calendarDays.days.map((day) => {
          const isSelected = selectedDay === day.day;
          return (
            <TouchableOpacity
              key={`${day.date.getFullYear()}-${day.date.getMonth()}-${day.day}`}
              style={[
                styles.dayCell,
                day.isToday && styles.todayCell,
                day.events.length > 0 && styles.hasEventsCell,
                isSelected && styles.selectedCell,
              ]}
              onPress={() => openDay(day.day)}
              activeOpacity={0.85}
            >
              <View style={styles.dayNumbersRow}>
                <Text style={[styles.dayNumber, (day.isToday || isSelected) && styles.dayNumberActive]}>{day.day}</Text>
                <Text style={[styles.hijriDay, (day.isToday || isSelected) && styles.dayNumberActive]}>{day.hijriDay}</Text>
              </View>
              <Text style={[styles.dayMonth, (day.isToday || isSelected) && styles.dayNumberActive]}>{formatDateWithHijri(day.date).gregMonthShort}</Text>
              <Text style={[styles.hijriText, (day.isToday || isSelected) && styles.dayNumberActive]} numberOfLines={1}>{formatDateWithHijri(day.date).hijriShort}</Text>
              <Text style={[styles.eventsBadge, (day.isToday || isSelected) && styles.dayNumberActive]}>{day.events.length > 0 ? `${day.events.length} مناسبة` : ' '}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={detailsVisible} transparent animationType="fade" onRequestClose={() => setDetailsVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTextWrap}>
                <Text style={styles.modalTitle}>مناسبات اليوم</Text>
                <Text style={styles.modalSub}>{selectedCalendarDay ? formatDateWithHijri(selectedCalendarDay.date).combined : 'اختر يوماً'}</Text>
              </View>
              <TouchableOpacity onPress={() => setDetailsVisible(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
              {selectedEvents.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>لا توجد مناسبات في هذا اليوم.</Text>
                </View>
              ) : (
                selectedEvents.map((event, index) => (
                  <TouchableOpacity
                    key={event._id || event.id || index}
                    style={styles.eventCard}
                    onPress={() => {
                      if (onEventPress) {
                        onEventPress(String(event._id || event.id));
                      }
                      setDetailsVisible(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={styles.eventHeader}>
                      <View style={styles.eventDateChip}>
                        <Text style={styles.eventDateChipText}>{formatDateWithHijri(event.eventDate).gregDay}</Text>
                        <Text style={styles.eventDateChipSub}>{formatDateWithHijri(event.eventDate).hijriShort}</Text>
                      </View>
                      <View style={styles.eventTitleWrap}>
                        <Text style={styles.eventTitle}>{event.title}</Text>
                        <Text style={styles.eventDesc} numberOfLines={2}>{event.description || 'اضغط لفتح التفاصيل الكاملة.'}</Text>
                        <View style={styles.eventMetaRow}>
                          <View style={styles.eventMetaPill}>
                            <Text style={styles.eventMetaPillText}>{getStatusLabel(event.status)}</Text>
                          </View>
                          <Text style={styles.eventLocation} numberOfLines={1}>{event.location || 'بدون موقع محدد'}</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={styles.eventCta}>عرض التفاصيل</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: rounded.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    ...typography.bodyLg,
    color: colors.text,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'right',
  },
  headerButtons: {
    flexDirection: 'row-reverse',
    gap: spacing.xs,
  },
  monthButton: {
    width: 36,
    height: 36,
    borderRadius: rounded.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthButtonText: {
    fontSize: 22,
    color: colors.text,
    lineHeight: 22,
  },
  monthLabelWrap: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: rounded.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  monthLabel: {
    ...typography.labelMd,
    color: colors.primary,
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  weekDay: {
    ...typography.labelMd,
    color: colors.textMuted,
    width: `${100 / 7}%`,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  emptyCell: {
    width: '13.2%',
    aspectRatio: 1,
  },
  dayCell: {
    width: '13.2%',
    aspectRatio: 1,
    borderRadius: rounded.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 4,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  todayCell: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  hasEventsCell: {
    backgroundColor: colors.secondaryContainer,
    borderColor: colors.secondary,
  },
  selectedCell: {
    transform: [{ scale: 1.03 }],
  },
  dayNumbersRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  hijriDay: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  dayNumberActive: {
    color: colors.surface,
  },
  dayMonth: {
    fontSize: 9,
    color: colors.textMuted,
  },
  hijriText: {
    fontSize: 8,
    color: colors.textMuted,
    textAlign: 'center',
  },
  eventsBadge: {
    fontSize: 8,
    color: colors.secondary,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.md,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalHeaderTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  modalTitle: {
    ...typography.headlineMd,
    color: colors.text,
  },
  modalSub: {
    ...typography.bodyMd,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: rounded.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 22,
    color: colors.text,
    lineHeight: 22,
  },
  modalScroll: {
    marginTop: spacing.md,
  },
  modalScrollContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  emptyState: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  emptyStateText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  eventHeader: {
    flexDirection: 'row-reverse',
    gap: spacing.sm,
  },
  eventDateChip: {
    width: 60,
    borderRadius: rounded.md,
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  eventDateChipText: {
    ...typography.bodyLg,
    fontWeight: '700',
    color: colors.onSecondaryContainer,
  },
  eventDateChipSub: {
    ...typography.labelMd,
    color: colors.onSecondaryContainer,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 2,
  },
  eventTitleWrap: {
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
  eventMetaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  eventMetaPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: rounded.full,
    backgroundColor: colors.secondaryContainer,
  },
  eventMetaPillText: {
    ...typography.labelMd,
    color: colors.onSecondaryContainer,
  },
  eventLocation: {
    ...typography.bodyMd,
    color: colors.textMuted,
    flex: 1,
    textAlign: 'right',
  },
  eventCta: {
    ...typography.labelMd,
    color: colors.primary,
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
});
