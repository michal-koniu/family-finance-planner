import type { YearMonth } from './types';

export function parseYM(ym: YearMonth): { y: number; m: number } {
  const [y, m] = ym.split('-').map(Number);
  return { y, m };
}

/** Whole months from `a` to `b` (b - a). */
export function monthsBetween(a: YearMonth, b: YearMonth): number {
  const pa = parseYM(a);
  const pb = parseYM(b);
  return (pb.y - pa.y) * 12 + (pb.m - pa.m);
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const { y, m } = parseYM(ym);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function currentYM(now = new Date()): YearMonth {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Age in whole years at a given month. */
export function ageAt(birth: YearMonth, at: YearMonth): number {
  return Math.floor(monthsBetween(birth, at) / 12);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatYM(ym: YearMonth): string {
  const { y, m } = parseYM(ym);
  return `${MONTHS[m - 1]} ${y}`;
}

export function isValidYM(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
