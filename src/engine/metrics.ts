import { ageAt } from './dates';
import type { Household, MonthSnapshot, SimulationResult } from './types';

export type MoneyView = 'real' | 'nominal';
export type WorthBasis = 'market' | 'afterTax';

/** Converts a nominal amount at a snapshot into the chosen money view. */
export function inView(v: number, s: MonthSnapshot, view: MoneyView): number {
  return view === 'real' ? v / s.cpi : v;
}

export function worth(s: MonthSnapshot, basis: WorthBasis): number {
  return basis === 'market' ? s.netWorth : s.netWorthAfterTax;
}

export interface Totals {
  taxes: number;
  interest: number;
  rent: number;
  eventCosts: number;
}

/** Sums up to and including snapshot `upTo`, each month converted to the chosen view first. */
export function totalsUpTo(r: SimulationResult, upTo: number, view: MoneyView): Totals {
  const t: Totals = { taxes: 0, interest: 0, rent: 0, eventCosts: 0 };
  for (let i = 1; i <= upTo && i < r.months.length; i++) {
    const s = r.months[i];
    const k = view === 'real' ? 1 / s.cpi : 1;
    t.taxes += s.taxPaid * k;
    t.interest += s.interestPaid * k;
    t.rent += (s.flows.expense['Rent'] ?? 0) * k;
    for (const c in s.eventCosts) t.eventCosts += s.eventCosts[c] * k;
  }
  return t;
}

export interface Milestones {
  netWorthAt: { years: number; value: number | null }[];
  endAfterTax: number;
  /** Month and age of retirement, or null when it doesn't happen within the plan. */
  retirement: { personId: string; name: string; date: string | null; age: number | null }[];
  lowestLiquid: { value: number; date: string };
  firstShortfall: string | null;
  totals: Totals;
}

export function milestones(
  r: SimulationResult,
  household: Household,
  view: MoneyView,
  basis: WorthBasis,
  years: number[],
): Milestones {
  const last = r.months[r.months.length - 1];
  const netWorthAt = years.map((y) => {
    const s = r.months[y * 12];
    return { years: y, value: s ? inView(worth(s, basis), s, view) : null };
  });
  const retirement = household.people.map((p) => {
    const m = r.retirements[p.id];
    if (m == null) return { personId: p.id, name: p.name, date: null, age: null };
    const s = r.months[m];
    return { personId: p.id, name: p.name, date: s.date, age: ageAt(p.birth, s.date) };
  });
  let lowest = { value: Infinity, date: '' };
  let firstShortfall: string | null = null;
  for (let i = 1; i < r.months.length; i++) {
    const s = r.months[i];
    const v = inView(s.liquid, s, view);
    if (v < lowest.value) lowest = { value: v, date: s.date };
    if (!firstShortfall && s.shortfall > 0.5) firstShortfall = s.date;
  }
  return {
    netWorthAt,
    endAfterTax: inView(last.netWorthAfterTax, last, view),
    retirement,
    lowestLiquid: lowest,
    firstShortfall,
    totals: totalsUpTo(r, r.months.length - 1, view),
  };
}
