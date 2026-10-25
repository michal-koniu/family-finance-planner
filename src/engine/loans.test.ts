import { describe, expect, it } from 'vitest';
import { annuityPayment, changeRate, initLoanState, monthsToRepay, overpay, payInstallment } from './loans';

describe('annuityPayment', () => {
  it('matches the textbook formula (500k, 7%, 25 years)', () => {
    // r = 0.07/12, n = 300 → P = L·r / (1 − (1+r)^−n) = 3533.90
    expect(annuityPayment(500_000, 0.07, 300)).toBeCloseTo(3533.9, 1);
  });
  it('handles a zero rate', () => {
    expect(annuityPayment(120_000, 0, 120)).toBe(1000);
  });
});

describe('payInstallment', () => {
  it('equal installments repay the loan exactly and keep the installment constant', () => {
    const s = initLoanState(300_000, 0.065, 240, 'equal');
    const first = payInstallment(s);
    let interest = first.interest;
    let principal = first.principal;
    for (let i = 1; i < 240; i++) {
      const r = payInstallment(s);
      if (i < 239) expect(r.installment).toBeCloseTo(first.installment, 6);
      interest += r.interest;
      principal += r.principal;
    }
    expect(s.balance).toBe(0);
    expect(principal).toBeCloseTo(300_000, 4);
    expect(interest).toBeCloseTo(first.installment * 240 - 300_000, 2);
  });

  it('decreasing installments: total interest = L·r·(n+1)/2', () => {
    const L = 240_000;
    const n = 240;
    const r = 0.06 / 12;
    const s = initLoanState(L, 0.06, n, 'decreasing');
    let interest = 0;
    const firstInst = payInstallment(s);
    interest += firstInst.interest;
    for (let i = 1; i < n; i++) interest += payInstallment(s).interest;
    expect(interest).toBeCloseTo((L * r * (n + 1)) / 2, 4);
    expect(firstInst.installment).toBeCloseTo(L / n + L * r, 6);
  });
});

describe('rate changes and overpayments', () => {
  it('rate change recalculates the installment over the remaining term', () => {
    const s = initLoanState(400_000, 0.06, 300, 'equal');
    for (let i = 0; i < 60; i++) payInstallment(s);
    const balance = s.balance;
    changeRate(s, 0.08);
    expect(s.payment).toBeCloseTo(annuityPayment(balance, 0.08, 240), 8);
  });

  it("'shorten' keeps the installment and cuts months", () => {
    const s = initLoanState(400_000, 0.07, 300, 'equal');
    const pay = s.payment;
    overpay(s, 100_000, 'shorten');
    expect(s.payment).toBe(pay);
    expect(s.remainingMonths).toBe(monthsToRepay(300_000, 0.07, pay));
    expect(s.remainingMonths).toBeLessThan(300);
  });

  it("'lower' keeps the term and lowers the installment", () => {
    const s = initLoanState(400_000, 0.07, 300, 'equal');
    overpay(s, 100_000, 'lower');
    expect(s.remainingMonths).toBe(300);
    expect(s.payment).toBeCloseTo(annuityPayment(300_000, 0.07, 300), 8);
  });
});
