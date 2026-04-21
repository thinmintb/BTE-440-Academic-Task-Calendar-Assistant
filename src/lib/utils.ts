import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, getISOWeek, getISOWeekYear, parseISO, isSameDay } from 'date-fns';
import type { Event } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getISOWeekKey(date: Date): string {
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, '0')}`;
}

export function groupEventsByDay(events: Event[], days: Date[]): Map<string, Event[]> {
  const map = new Map<string, Event[]>();
  for (const day of days) {
    const key = format(day, 'yyyy-MM-dd');
    map.set(key, events.filter(e => isSameDay(parseISO(e.date), day)));
  }
  return map;
}
