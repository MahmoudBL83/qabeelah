import { useMemo, useState } from 'react';
import { Event } from '@qabila/types';
import { formatDateWithHijri, formatMonthWithHijri } from '../lib/date';
import { Link } from 'react-router-dom';

interface OccasionsCalendarProps {
  events: Event[];
  tenantPrefix?: string;
}

export default function OccasionsCalendar({ events, tenantPrefix = '' }: OccasionsCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDate());

  const monthName = (date: Date) => formatMonthWithHijri(date).combined;

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
      const eventList = eventsByDate[key] || [];
      return {
        day,
        date,
        key,
        events: eventList,
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
  const selectedCalendarDay = calendarDays.days.find((item) => item.day === selectedDay) || calendarDays.days[0] || null;
  const selectedEvents = selectedCalendarDay?.events || [];

  const prevMonth = () => {
    const nextDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    setCurrentMonth(nextDate);
    setSelectedDay(1);
  };

  const nextMonth = () => {
    const nextDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    setCurrentMonth(nextDate);
    setSelectedDay(1);
  };

  const weekDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  return (
    <div className="bg-surface-container-lowest p-6 rounded-2xl border border-surface-variant shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-5">
        <div className="text-right">
          <h3 className="text-xl font-bold text-on-surface">تقويم المناسبات</h3>
          <p className="text-sm text-on-surface-variant mt-1">اختيار اليوم يعرض مناسباته مع التاريخين الهجري والميلادي</p>
        </div>
        <div className="flex items-center gap-2 self-end">
          <button
            onClick={prevMonth}
            className="px-3 py-2 rounded-xl border border-surface-variant hover:bg-surface transition-colors text-sm font-bold"
            title="الشهر السابق"
          >
            السابق
          </button>
          <button
            onClick={nextMonth}
            className="px-3 py-2 rounded-xl border border-surface-variant hover:bg-surface transition-colors text-sm font-bold"
            title="الشهر القادم"
          >
            التالي
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-variant bg-surface p-4 mb-5">
        <div className="flex flex-col gap-1 text-right">
          <p className="text-xs text-on-surface-variant">الشهر الحالي</p>
          <p className="text-lg font-bold text-on-surface">{monthName(currentMonth)}</p>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-4">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-xs font-bold text-on-surface-variant py-2 border-b border-surface-variant">
            {day}
          </div>
        ))}

        {emptyCells.map((index) => (
          <div key={`empty-${index}`} className="aspect-square" />
        ))}

        {calendarDays.days.map((item) => {
          const isSelected = selectedDay === item.day;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelectedDay(item.day)}
              className={`aspect-square rounded-xl border transition-all p-2 flex flex-col items-center justify-between text-center hover:shadow-md focus:outline-none focus:ring-2 focus:ring-secondary ${
                isSelected
                  ? 'bg-secondary text-on-secondary border-secondary'
                  : item.isToday
                    ? 'bg-primary text-on-primary border-primary'
                    : item.events.length > 0
                      ? 'bg-secondary-container text-on-secondary-container border-secondary'
                      : 'bg-surface text-on-surface border-surface-variant'
              }`}
              aria-label={`${item.day} ${formatDateWithHijri(item.date).hijriShort}`}
            >
              <div className="w-full flex items-start justify-between text-[10px] font-bold leading-none">
                <span>{item.day}</span>
                <span>{item.hijriDay}</span>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 flex-1">
                <span className="text-[11px] font-medium leading-none">{formatDateWithHijri(item.date).gregMonthShort}</span>
                <span className="text-[10px] opacity-80 leading-none">{formatDateWithHijri(item.date).hijriShort}</span>
              </div>
              <div className="w-full flex items-center justify-between text-[10px] font-bold leading-none">
                <span>{formatDateWithHijri(item.date).gregWeekdayShort}</span>
                <span>{item.events.length > 0 ? `${item.events.length}` : ''}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-surface-variant bg-surface p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-right">
              <p className="text-xs text-on-surface-variant">اليوم المختار</p>
              <p className="text-sm font-bold text-on-surface">{selectedCalendarDay ? formatDateWithHijri(selectedCalendarDay.date).combined : 'اختر يوماً'}</p>
            </div>
            <div className="px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold">
              {selectedEvents.length} مناسبة
            </div>
          </div>

          {selectedEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-surface-variant bg-surface-container-lowest p-5 text-center text-sm text-on-surface-variant">
              لا توجد مناسبات في هذا اليوم.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {selectedEvents.map((event, index) => (
                <Link
                  key={event._id || event.id || index}
                  to={`${tenantPrefix}/events/${event._id || event.id}`}
                  className="block rounded-xl border border-surface-variant bg-surface-container-lowest p-3 text-right hover:bg-surface-variant/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-on-surface truncate">{event.title}</p>
                      <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{event.description || 'اضغط لفتح التفاصيل الكاملة'}</p>
                    </div>
                    <div className="shrink-0 text-left">
                      <p className="text-[11px] text-on-surface-variant">{formatDateWithHijri(event.eventDate).gregDay} {formatDateWithHijri(event.eventDate).gregMonthShort}</p>
                      <p className="text-[10px] text-secondary font-bold">{formatDateWithHijri(event.eventDate).hijriShort}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-surface-variant bg-surface p-4">
          <p className="text-xs text-on-surface-variant mb-2">دليل الألوان</p>
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-primary"></div>
              <span className="text-on-surface-variant">اليوم الحالي</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-secondary-container border border-secondary"></div>
              <span className="text-on-surface-variant">أيام تحتوي على مناسبات</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-surface border border-surface-variant"></div>
              <span className="text-on-surface-variant">أيام عادية</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
