export function formatDateWithHijri(isoDate?: string | Date) {
  if (!isoDate) return {
    gregFull: '', hijriFull: '', combined: '', gregDay: '', gregMonthShort: '', gregWeekdayShort: '', hijriDay: '', hijriMonthShort: '', hijriShort: '', monthYearCombined: ''
  };
  const d = typeof isoDate === 'string' ? new Date(isoDate) : isoDate instanceof Date ? isoDate : new Date(isoDate as any);
  const gregFull = new Intl.DateTimeFormat('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  const hijriFull = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
  const gregDay = new Intl.DateTimeFormat('ar-SA', { day: 'numeric' }).format(d);
  const gregMonthShort = new Intl.DateTimeFormat('ar-SA', { month: 'short' }).format(d);
  const gregWeekdayShort = new Intl.DateTimeFormat('ar-SA', { weekday: 'short' }).format(d);
  const hijriDay = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric' }).format(d);
  const hijriMonthShort = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { month: 'short' }).format(d);
  const hijriShort = `${hijriDay} ${hijriMonthShort}`;
  const combined = `${gregFull} • ${hijriFull}`;
  const monthYearCombined = `${new Intl.DateTimeFormat('ar-SA', { month: 'long', year: 'numeric' }).format(d)} • ${new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { month: 'long', year: 'numeric' }).format(d)}`;
  return { gregFull, hijriFull, combined, gregDay, gregMonthShort, gregWeekdayShort, hijriDay, hijriMonthShort, hijriShort, monthYearCombined };
}

export function formatMonthWithHijri(date: Date = new Date()) {
  const d = date instanceof Date ? date : new Date(date as any);
  const greg = new Intl.DateTimeFormat('ar-SA', { month: 'long', year: 'numeric' }).format(d);
  const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { month: 'long', year: 'numeric' }).format(d);
  return { greg, hijri, combined: `${greg} • ${hijri}` };
}
