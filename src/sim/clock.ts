import { DAY_NAMES, HOURS_PER_WEEK } from './catalog';
import { isOpenHour } from './store';

export const MS_PER_OPEN_HOUR = 4000;
export const MS_PER_CLOSED_HOUR = 400;
export const SPEEDS = [0, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export const msPerGameHour = (hour: number): number => (isOpenHour(hour % 24) ? MS_PER_OPEN_HOUR : MS_PER_CLOSED_HOUR);

export interface ClockInfo {
  day: number;
  week: number;
  dayName: string;
  hourOfDay: number;
}

export function clockInfo(hour: number): ClockInfo {
  const dayIndex = Math.floor(hour / 24);
  return {
    day: dayIndex + 1,
    week: Math.floor(hour / HOURS_PER_WEEK) + 1,
    dayName: DAY_NAMES[dayIndex % 7] ?? '',
    hourOfDay: hour % 24,
  };
}

export function formatTime(hourOfDay: number, minutes = 0): string {
  const h12 = hourOfDay % 12 === 0 ? 12 : hourOfDay % 12;
  return `${h12}:${String(minutes).padStart(2, '0')} ${hourOfDay < 12 ? 'AM' : 'PM'}`;
}

// Away time: one game day per real hour, never less than 5 minutes away, capped at two game weeks.
export const OFFLINE_MIN_MS = 5 * 60 * 1000;
export const OFFLINE_MAX_HOURS = 14 * 24;

export function offlineHours(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < OFFLINE_MIN_MS) return 0;
  return Math.min(OFFLINE_MAX_HOURS, Math.floor((elapsedMs / 3_600_000) * 24));
}
