import type { InstallmentType } from './types';

/** Monthly installment of an equal-installment (annuity) loan. */
export function annuityPayment(principal: number, annualRate: number, months: number): number {
  if (months <= 0) return principal;
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** Number of months needed to repay `principal` with a fixed `payment`. */
export function monthsToRepay(principal: number, annualRate: number, payment: number): number {
  const r = annualRate / 12;
  if (r === 0) return Math.ceil(principal / payment);
  const x = 1 - (principal * r) / payment;
  if (x <= 0) return Infinity; // payment doesn't even cover interest
  return Math.ceil(-Math.log(x) / Math.log(1 + r) - 1e-9);
}

export interface LoanState {
  balance: number;
  rate: number;
  remainingMonths: number;
  type: InstallmentType;
  /** Fixed installment for equal-installment loans (recomputed on rate change or "lower" overpayment). */
  payment: number;
}

export function initLoanState(balance: number, rate: number, months: number, type: InstallmentType): LoanState {
  return { balance, rate, remainingMonths: months, type, payment: annuityPayment(balance, rate, months) };
}

/**
 * Pays one month's installment. Interest accrues monthly at rate/12 on the
 * outstanding balance, which is how Polish banks calculate it in practice.
 */
export function payInstallment(s: LoanState): { interest: number; principal: number; installment: number } {
  if (s.balance <= 0.005) {
    s.balance = 0;
    s.remainingMonths = 0;
    return { interest: 0, principal: 0, installment: 0 };
  }
  if (s.remainingMonths <= 0) s.remainingMonths = 1; // term ran out: the rest is due now
  const interest = s.balance * (s.rate / 12);
  let principal: number;
  if (s.type === 'equal') {
    principal = s.remainingMonths === 1 ? s.balance : Math.min(s.balance, s.payment - interest);
  } else {
    principal = s.remainingMonths === 1 ? s.balance : s.balance / s.remainingMonths;
  }
  s.balance -= principal;
  s.remainingMonths -= 1;
  if (s.balance < 0.005) {
    s.balance = 0;
    s.remainingMonths = 0;
  }
  return { interest, principal, installment: interest + principal };
}

/** Variable rate changed: the bank recalculates the installment over the remaining term. */
export function changeRate(s: LoanState, rate: number): void {
  s.rate = rate;
  s.payment = annuityPayment(s.balance, rate, s.remainingMonths);
}

/**
 * Overpayment. 'shorten' keeps the installment and shortens the term;
 * 'lower' keeps the term and lowers the installment.
 * Returns the amount actually applied (can't exceed the balance).
 */
export function overpay(s: LoanState, amount: number, strategy: 'shorten' | 'lower'): number {
  const applied = Math.min(amount, s.balance);
  s.balance -= applied;
  if (s.balance < 0.005) {
    s.balance = 0;
    s.remainingMonths = 0;
    return applied;
  }
  if (s.type === 'equal') {
    if (strategy === 'lower') {
      s.payment = annuityPayment(s.balance, s.rate, s.remainingMonths);
    } else {
      s.remainingMonths = Math.min(s.remainingMonths, monthsToRepay(s.balance, s.rate, s.payment));
    }
  } else if (strategy === 'shorten') {
    // Keep the principal part per month the same, so fewer months remain.
    const perMonth = (s.balance + applied) / s.remainingMonths;
    s.remainingMonths = Math.max(1, Math.ceil(s.balance / perMonth - 1e-9));
  }
  return applied;
}
