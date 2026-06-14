import { ReportPeriod } from '../models/report.model';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getMonthKey(date: string): string {
  return date.slice(0, 7);
}

export function getYearKey(date: string): string {
  return date.slice(0, 4);
}

export function isDateInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

export function resolveCurrentWeekPeriod(): ReportPeriod {
  return resolveWeekPeriod(getIsoWeekKey(new Date()));
}

export function resolveCurrentMonthPeriod(): ReportPeriod {
  const today = new Date();
  return resolveMonthPeriod(`${today.getFullYear()}-${pad(today.getMonth() + 1)}`);
}

export function resolveCurrentYearPeriod(): ReportPeriod {
  return resolveYearPeriod(`${new Date().getFullYear()}`);
}

export function resolveWeekPeriod(weekKey: string): ReportPeriod {
  const [yearText, weekText] = weekKey.split('-W');
  const year = Number(yearText);
  const week = Number(weekText);
  const janFourth = new Date(year, 0, 4);
  const janFourthDay = janFourth.getDay() || 7;
  const firstMonday = addDays(janFourth, 1 - janFourthDay);
  const start = addDays(firstMonday, (week - 1) * 7);
  const end = addDays(start, 6);

  return {
    type: 'week',
    key: weekKey,
    startDate: formatDate(start),
    endDate: formatDate(end)
  };
}

export function resolveMonthPeriod(monthKey: string): ReportPeriod {
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);

  return {
    type: 'month',
    key: monthKey,
    startDate: formatDate(start),
    endDate: formatDate(end)
  };
}

export function resolveYearPeriod(yearKey: string): ReportPeriod {
  return {
    type: 'year',
    key: yearKey,
    startDate: `${yearKey}-01-01`,
    endDate: `${yearKey}-12-31`
  };
}

export function resolveRangePeriod(startDate: string, endDate: string): ReportPeriod {
  return {
    type: 'range',
    startDate: startDate <= endDate ? startDate : endDate,
    endDate: endDate >= startDate ? endDate : startDate
  };
}

export function createTrendBuckets(period: ReportPeriod): ReportPeriod[] {
  if (period.type === 'year') {
    const startYear = Number(getYearKey(period.startDate));
    return Array.from({ length: 12 }, (_, index) => resolveMonthPeriod(`${startYear}-${pad(index + 1)}`));
  }

  const days = getDaySpan(period.startDate, period.endDate);

  if (period.type === 'week' || days <= 31) {
    return createDayBuckets(period);
  }

  if (days <= 120) {
    return createWeekBuckets(period);
  }

  return createMonthBuckets(period);
}

export function getIsoWeekKey(date: Date): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() + 4 - day);
  const yearStart = new Date(copy.getFullYear(), 0, 1);
  const week = Math.ceil(((copy.getTime() - yearStart.getTime()) / DAY_IN_MS + 1) / 7);

  return `${copy.getFullYear()}-W${pad(week)}`;
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function getDaySpan(startDate: string, endDate: string): number {
  return Math.floor((parseDate(endDate).getTime() - parseDate(startDate).getTime()) / DAY_IN_MS) + 1;
}

function createDayBuckets(period: ReportPeriod): ReportPeriod[] {
  const buckets: ReportPeriod[] = [];
  let cursor = parseDate(period.startDate);
  const end = parseDate(period.endDate);

  while (cursor <= end) {
    const date = formatDate(cursor);
    buckets.push({ type: 'range', startDate: date, endDate: date });
    cursor = addDays(cursor, 1);
  }

  return buckets;
}

function createWeekBuckets(period: ReportPeriod): ReportPeriod[] {
  const buckets: ReportPeriod[] = [];
  let cursor = parseDate(period.startDate);
  const finalDate = parseDate(period.endDate);

  while (cursor <= finalDate) {
    const bucketEnd = minDate(addDays(cursor, 6), finalDate);
    buckets.push({
      type: 'range',
      startDate: formatDate(cursor),
      endDate: formatDate(bucketEnd)
    });
    cursor = addDays(bucketEnd, 1);
  }

  return buckets;
}

function createMonthBuckets(period: ReportPeriod): ReportPeriod[] {
  const buckets: ReportPeriod[] = [];
  let cursor = new Date(parseDate(period.startDate).getFullYear(), parseDate(period.startDate).getMonth(), 1);
  const finalDate = parseDate(period.endDate);

  while (cursor <= finalDate) {
    const month = resolveMonthPeriod(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`);
    buckets.push({
      type: 'range',
      startDate: month.startDate < period.startDate ? period.startDate : month.startDate,
      endDate: month.endDate > period.endDate ? period.endDate : month.endDate
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return buckets;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function minDate(first: Date, second: Date): Date {
  return first <= second ? first : second;
}

function pad(value: number): string {
  return `${value}`.padStart(2, '0');
}
