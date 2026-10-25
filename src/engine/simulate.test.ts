import { describe, expect, it } from 'vitest';
import { simulate } from './simulate';
import { account, ev, household, scenario, settings } from './testkit';
import type { PropertySpec } from './types';

const home: PropertySpec = {
  name: 'Flat',
  use: 'home',
  realGrowth: 0,
  monthlyCosts: 0,
  maintenancePct: 0,
  rentIncome: 0,
  vacancyPct: 0,
  rentalTaxRate: 0,
  managementPct: 0,
};

describe('inflation', () => {
  it('cash loses purchasing power compounded yearly: 1/(1+X)^n', () => {
    const r = simulate({
      household: household({ accounts: [account('cash', { kind: 'cash', value: 100_000 })] }),
      settings: settings({ inflationEnabled: true, inflationRate: 0.05, horizonYears: 10 }),
      scenario: scenario(),
    });
    const last = r.months[120];
    expect(last.accounts.cash).toBeCloseTo(100_000, 6); // nominal unchanged
    expect(last.accounts.cash / last.cpi).toBeCloseTo(100_000 / Math.pow(1.05, 10), 4); // 61 391.33
    expect(r.months[12].cpi).toBeCloseTo(1.05, 12);
  });

  it('investments grow at the nominal rate; real value is return minus inflation', () => {
    const r = simulate({
      household: household({
        accounts: [account('cash', { kind: 'cash' }), account('etf', { value: 100_000, rate: 0.07, taxMode: 'onSale' })],
      }),
      settings: settings({ inflationEnabled: true, inflationRate: 0.03, horizonYears: 10 }),
      scenario: scenario(),
    });
    const last = r.months[120];
    expect(last.accounts.etf).toBeCloseTo(100_000 * Math.pow(1.07, 10), 4); // 196 715.14
    expect(last.accounts.etf / last.cpi).toBeCloseTo((100_000 * Math.pow(1.07, 10)) / Math.pow(1.03, 10), 4);
  });

  it('salary and costs rise with inflation, so their real value stays flat', () => {
    const r = simulate({
      household: household({
        people: [
          { id: 'a', name: 'A', birth: '1990-01', netSalary: 10_000, realSalaryGrowth: 0, retirementAge: null, pension: 0, pensionAge: 65 },
        ],
        flows: [{ id: 'l', name: 'Living', kind: 'expense', amount: 4_000, indexed: true }],
        rent: 3_000,
      }),
      settings: settings({ inflationEnabled: true, inflationRate: 0.04, horizonYears: 20 }),
      scenario: scenario(),
    });
    const m = r.months[240];
    expect(m.flows.income['Salary: A'] / m.cpi).toBeCloseTo(10_000, 6);
    expect(m.flows.expense['Living'] / m.cpi).toBeCloseTo(4_000, 6);
    expect(m.flows.expense['Rent'] / m.cpi).toBeCloseTo(3_000, 6);
  });

  it('loan installments stay fixed in nominal terms, so their real burden shrinks', () => {
    const r = simulate({
      household: household({
        accounts: [account('cash', { kind: 'cash', value: 10_000_000 })],
        loans: [{ id: 'm', name: 'M', balance: 500_000, rate: 0.07, remainingMonths: 300, type: 'equal', monthlyFees: 0 }],
      }),
      settings: settings({ inflationEnabled: true, inflationRate: 0.05, horizonYears: 20 }),
      scenario: scenario(),
    });
    const i1 = r.months[1].flows.expense['Installment: M'];
    const i240 = r.months[240].flows.expense['Installment: M'];
    expect(i1).toBeCloseTo(3533.9, 1);
    expect(i240).toBeCloseTo(i1, 8);
    expect(i240 / r.months[240].cpi).toBeCloseTo(i1 / Math.pow(1.05, 20), 6);
  });

  it('property prices rise with inflation (plus optional real growth)', () => {
    const r = simulate({
      household: household({
        properties: [{ ...home, id: 'p', value: 800_000, costBasis: 800_000, acquired: '2020-01', realGrowth: 0.01 }],
      }),
      settings: settings({ inflationEnabled: true, inflationRate: 0.04, horizonYears: 10 }),
      scenario: scenario(),
    });
    expect(r.months[120].properties.p).toBeCloseTo(800_000 * Math.pow(1.04 * 1.01, 10), 3);
  });

  it('with inflation off, nothing is indexed', () => {
    const r = simulate({
      household: household({ flows: [{ id: 'l', name: 'Living', kind: 'expense', amount: 1000, indexed: true }] }),
      settings: settings({ inflationEnabled: false }),
      scenario: scenario(),
    });
    expect(r.months[60].cpi).toBe(1);
    expect(r.months[60].flows.expense.Living).toBe(1000);
  });
});

describe('taxes on investments', () => {
  it('selling 3 BTC bought for 60k at 180k pays 19% on the 120k gain', () => {
    const r = simulate({
      household: household({
        accounts: [account('cash', { kind: 'cash' }), account('btc', { value: 180_000, costBasis: 60_000, taxMode: 'onSale' })],
      }),
      settings: settings(),
      scenario: scenario([ev({ kind: 'transfer', trigger: { type: 'date', date: '2027-01' }, from: 'btc', to: 'cash', amount: { mode: 'all' }, feePct: 0 })]),
    });
    expect(r.months[1].accounts.btc).toBe(0);
    expect(r.months[1].accounts.cash).toBeCloseTo(180_000 - 0.19 * 120_000, 6); // 157 200
    expect(r.months[1].taxPaid).toBeCloseTo(22_800, 6);
  });

  it('selling part of a position uses the proportional cost basis', () => {
    const r = simulate({
      household: household({
        accounts: [account('cash', { kind: 'cash' }), account('btc', { value: 180_000, costBasis: 60_000, taxMode: 'onSale' })],
      }),
      settings: settings(),
      scenario: scenario([ev({ kind: 'transfer', trigger: { type: 'date', date: '2027-01' }, from: 'btc', to: 'cash', amount: { mode: 'share', value: 0.5 }, feePct: 0 })]),
    });
    expect(r.months[1].accounts.cash).toBeCloseTo(90_000 - 0.19 * 60_000, 6);
    // remaining half still has a 60k latent gain → after-tax net worth accounts for it
    expect(r.months[1].netWorthAfterTax).toBeCloseTo(r.months[1].netWorth - 0.19 * 60_000, 6);
  });

  it('deposit interest is taxed monthly as it accrues', () => {
    const r = simulate({
      household: household({
        accounts: [account('cash', { kind: 'cash' }), account('dep', { kind: 'deposit', value: 100_000, rate: 0.05, taxMode: 'interest' })],
      }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario(),
    });
    const monthly = (Math.pow(1.05, 1 / 12) - 1) * 0.81;
    expect(r.months[12].accounts.dep).toBeCloseTo(100_000 * Math.pow(1 + monthly, 12), 6);
  });

  it('covers a shortfall by selling investments, grossing up for tax', () => {
    const r = simulate({
      household: household({
        flows: [{ id: 'l', name: 'Living', kind: 'expense', amount: 10_000, indexed: false }],
        accounts: [account('cash', { kind: 'cash' }), account('etf', { value: 100_000, costBasis: 50_000, taxMode: 'onSale' })],
        allocation: { cashAccountId: 'cash', bufferMonths: 0, surplus: [], withdrawalOrder: ['etf'] },
      }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario(),
    });
    const gross = 10_000 / (1 - 0.19 * 0.5);
    expect(r.months[1].accounts.cash).toBeCloseTo(0, 6);
    expect(r.months[1].accounts.etf).toBeCloseTo(100_000 - gross, 6);
    expect(r.months[1].taxPaid).toBeCloseTo(gross - 10_000, 6);
  });

  it('flags a shortfall when every account is empty', () => {
    const r = simulate({
      household: household({ flows: [{ id: 'l', name: 'Living', kind: 'expense', amount: 1000, indexed: false }] }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario(),
    });
    expect(r.months[3].shortfall).toBeCloseTo(3000, 6);
    expect(r.warnings.some((w) => w.includes('Money runs out'))).toBe(true);
  });
});

describe('return schedules and conditional triggers', () => {
  it('applies a different return from a given month', () => {
    const r = simulate({
      household: household({
        accounts: [
          account('cash', { kind: 'cash' }),
          account('btc', { value: 100_000, taxMode: 'onSale', rate: 0.5, schedule: [{ from: '2028-01', rate: -0.6 }] }),
        ],
      }),
      settings: settings({ horizonYears: 2 }),
      scenario: scenario(),
    });
    expect(r.months[12].accounts.btc).toBeCloseTo(150_000, 4);
    expect(r.months[24].accounts.btc).toBeCloseTo(60_000, 4);
  });

  it('sells BTC the first month it is worth at least a target value', () => {
    const r = simulate({
      household: household({
        accounts: [account('cash', { kind: 'cash' }), account('btc', { value: 100_000, costBasis: 100_000, taxMode: 'onSale', rate: 1.0 })],
      }),
      settings: settings({ horizonYears: 3 }),
      scenario: scenario([
        ev({ kind: 'transfer', trigger: { type: 'accountValue', accountId: 'btc', threshold: 200_000, real: false }, from: 'btc', to: 'cash', amount: { mode: 'all' }, feePct: 0 }),
      ]),
    });
    // doubles in exactly 12 months → condition seen at end of month 12, sale at start of month 13
    expect(r.months[12].accounts.btc).toBeCloseTo(200_000, 4);
    expect(r.months[13].accounts.btc).toBe(0);
    expect(r.months[13].accounts.cash).toBeCloseTo(200_000 - 0.19 * 100_000, 4);
  });

  it('retires when liquid savings reach a threshold in today\'s money', () => {
    const r = simulate({
      household: household({
        people: [
          { id: 'a', name: 'A', birth: '1990-01', netSalary: 10_000, realSalaryGrowth: 0, retirementAge: null, pension: 0, pensionAge: 65 },
        ],
        accounts: [account('cash', { kind: 'cash', value: 0 })],
      }),
      settings: settings({ horizonYears: 2 }),
      scenario: scenario([ev({ kind: 'retire', trigger: { type: 'wealth', measure: 'liquid', threshold: 50_000 }, personId: 'a' })]),
    });
    expect(r.retirements.a).toBe(6); // 50k reached end of month 5
    expect(r.months[6].flows.income['Salary: A']).toBeUndefined();
    expect(r.months[24].accounts.cash).toBeCloseTo(50_000, 6);
  });

  it('retires at the default retirement age and starts the pension', () => {
    const r = simulate({
      household: household({
        people: [
          { id: 'a', name: 'A', birth: '1962-06', netSalary: 10_000, realSalaryGrowth: 0, retirementAge: 65, pension: 3_000, pensionAge: 65 },
        ],
      }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario(),
    });
    expect(r.months[5].flows.income['Salary: A']).toBe(10_000); // May 2027, age 64
    expect(r.months[6].flows.income['Salary: A']).toBeUndefined(); // June 2027, age 65
    expect(r.months[6].flows.income['Pension: A']).toBe(3_000);
  });
});

describe('property', () => {
  it('buying with a mortgage: own contribution, loan and the end of rent', () => {
    const r = simulate({
      household: household({ rent: 4_000, accounts: [account('cash', { kind: 'cash', value: 300_000 })] }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario([
        ev({
          kind: 'buyProperty',
          trigger: { type: 'date', date: '2027-03' },
          price: 800_000,
          priceReal: false,
          buyCostPct: 0.03,
          extraCosts: 0,
          mortgage: { mode: 'ltv', value: 0.8, rate: 0.07, termYears: 25, type: 'equal', commissionPct: 0, monthlyFees: 0 },
          fundFrom: [],
          endsRent: true,
          property: home,
        }),
      ]),
    });
    const before = r.months[2];
    const m = r.months[3];
    expect(before.flows.expense.Rent).toBe(4_000);
    expect(m.flows.expense.Rent).toBeUndefined();
    const id = Object.keys(m.properties)[0];
    expect(m.properties[id]).toBe(800_000);
    const loanId = Object.keys(m.loans)[0];
    const inst = m.flows.expense['Installment: Mortgage: Flat'];
    expect(inst).toBeCloseTo((640_000 * 0.07) / 12 / (1 - Math.pow(1 + 0.07 / 12, -300)), 6);
    expect(m.loans[loanId]).toBeCloseTo(640_000 - (inst - (640_000 * 0.07) / 12), 6);
    // cash: 300k − 2×4000 rent − (160k + 24k) own − first installment
    expect(m.accounts.cash).toBeCloseTo(300_000 - 8_000 - 184_000 - inst, 6);
    expect(m.eventCosts['Property purchase costs']).toBeCloseTo(24_000, 6);
  });

  it('property sale gain is taxed within the exemption period and free after it', () => {
    const run = (date: string) =>
      simulate({
        household: household({
          properties: [{ ...home, id: 'p', value: 1_000_000, costBasis: 600_000, acquired: '2023-05' }],
        }),
        settings: settings({ startMonth: '2027-01', horizonYears: 6 }),
        scenario: scenario([ev({ kind: 'sellProperty', trigger: { type: 'date', date }, propertyId: 'p', sellCostPct: 0, to: 'cash' })]),
      });
    const taxed = run('2028-12'); // 2023 + 5 → exempt from 2029
    const free = run('2029-01');
    const t = taxed.months.find((s) => s.date === '2028-12')!;
    const f = free.months.find((s) => s.date === '2029-01')!;
    expect(t.taxPaid).toBeCloseTo(0.19 * 400_000, 6);
    expect(t.accounts.cash).toBeCloseTo(1_000_000 - 76_000, 6);
    expect(f.taxPaid).toBe(0);
    expect(f.accounts.cash).toBeCloseTo(1_000_000, 6);
  });

  it('rental property: rent received after vacancy, lump-sum tax and management', () => {
    const r = simulate({
      household: household({
        properties: [
          { ...home, id: 'p', use: 'rental', value: 600_000, costBasis: 600_000, acquired: '2020-01', rentIncome: 3_000, vacancyPct: 0.1, rentalTaxRate: 0.085, managementPct: 0.05 },
        ],
      }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario(),
    });
    const f = r.months[1].flows;
    expect(f.income['Rent received: Flat']).toBeCloseTo(2_700, 6);
    expect(f.expense['Rental income tax']).toBeCloseTo(229.5, 6);
    expect(f.expense['Rental management']).toBeCloseTo(135, 6);
  });
});

describe('kids, purchases, leases', () => {
  it('kid costs follow age bands and child benefit stops at 18', () => {
    const r = simulate({
      household: household(),
      settings: settings({
        horizonYears: 20,
        kidCostBands: [
          { fromAge: 0, toAge: 3, monthly: 1500 },
          { fromAge: 3, toAge: 25, monthly: 2000 },
        ],
        childBenefit: 800,
      }),
      scenario: scenario([ev({ kind: 'child', trigger: { type: 'date', date: '2027-01' }, childName: 'Ola', birthCost: 5000 })]),
    });
    expect(r.months[1].flows.expense['Kid: Ola']).toBe(1500);
    expect(r.months[1].eventCosts['Birth: Ola']).toBe(5000);
    expect(r.months[37].flows.expense['Kid: Ola']).toBe(2000);
    expect(r.months[216].flows.income['Child benefit']).toBe(800); // age 17
    expect(r.months[217].flows.income['Child benefit']).toBeUndefined(); // age 18
  });

  it('lease: upfront payment, fixed monthly payments for the term, optional buy-out', () => {
    const r = simulate({
      household: household({ accounts: [account('cash', { kind: 'cash', value: 1_000_000 })] }),
      settings: settings({ horizonYears: 4 }),
      scenario: scenario([
        ev({
          kind: 'purchase',
          name: 'Car',
          trigger: { type: 'date', date: '2027-01' },
          price: 150_000,
          priceReal: false,
          depreciation: 0.15,
          runningCosts: 0,
          financing: { type: 'lease', initialPct: 0.1, monthly: 2_500, termMonths: 36, buyoutPct: 0.4, buyout: true },
          fundFrom: [],
          repeatYears: 0,
        }),
      ]),
    });
    const paid = r.months.filter((s) => s.flows.expense['Lease: event'] || s.flows.expense['Lease: Car']).length;
    expect(paid).toBe(36);
    expect(r.months[36].accounts.cash).toBeCloseTo(1_000_000 - 15_000 - 36 * 2_500 - 60_000, 6);
    const owned = Object.values(r.months[37].goods)[0];
    expect(owned).toBeCloseTo(150_000 * Math.pow(0.85, 3) * Math.pow(0.85, 1 / 12), 4);
  });

  it('repeated purchase sells the old item and buys a new one', () => {
    const r = simulate({
      household: household({ accounts: [account('cash', { kind: 'cash', value: 1_000_000 })] }),
      settings: settings({ horizonYears: 6 }),
      scenario: scenario([
        ev({
          kind: 'purchase',
          name: 'Car',
          trigger: { type: 'date', date: '2027-01' },
          price: 100_000,
          priceReal: false,
          depreciation: 0.2,
          runningCosts: 0,
          financing: { type: 'cash' },
          fundFrom: [],
          repeatYears: 5,
        }),
      ]),
    });
    const at = r.months[61];
    expect(Object.keys(at.goods)).toHaveLength(1);
    const oldValue = 100_000 * Math.pow(0.8, 5);
    expect(at.accounts.cash).toBeCloseTo(1_000_000 - 100_000 + oldValue - 100_000, 4);
  });

  it('monthly savings top up the buffer first, then follow the allocation', () => {
    const r = simulate({
      household: household({
        people: [
          { id: 'a', name: 'A', birth: '1990-01', netSalary: 10_000, realSalaryGrowth: 0, retirementAge: null, pension: 0, pensionAge: 65 },
        ],
        flows: [{ id: 'l', name: 'Living', kind: 'expense', amount: 5_000, indexed: false }],
        accounts: [account('cash', { kind: 'cash' }), account('etf', { taxMode: 'onSale' })],
        allocation: { cashAccountId: 'cash', bufferMonths: 2, surplus: [{ accountId: 'etf', share: 1 }], withdrawalOrder: [] },
      }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario(),
    });
    expect(r.months[1].accounts.cash).toBe(5_000);
    expect(r.months[2].accounts.cash).toBe(10_000);
    expect(r.months[3].accounts.cash).toBe(10_000);
    expect(r.months[3].accounts.etf).toBe(5_000);
  });

  it('overpaying a mortgage reduces total interest', () => {
    const base = {
      household: household({
        accounts: [account('cash', { kind: 'cash', value: 2_000_000 })],
        loans: [{ id: 'm', name: 'M', balance: 500_000, rate: 0.07, remainingMonths: 300, type: 'equal' as const, monthlyFees: 0 }],
      }),
      settings: settings({ horizonYears: 25 }),
    };
    const interest = (s: ReturnType<typeof simulate>) => s.months.reduce((a, m) => a + m.interestPaid, 0);
    const plain = simulate({ ...base, scenario: scenario() });
    const over = simulate({
      ...base,
      scenario: scenario([
        ev({ kind: 'overpay', trigger: { type: 'date', date: '2027-01' }, loanId: 'm', amount: 1_000, real: false, monthly: true, months: 0, strategy: 'shorten' }),
      ]),
    });
    expect(interest(plain)).toBeCloseTo(3533.9 * 300 - 500_000, -1);
    expect(interest(over)).toBeLessThan(interest(plain) - 100_000);
    expect(over.months[300].loans.m).toBeUndefined();
  });
});

describe('review regressions', () => {
  it('sells investments outside the withdrawal order before declaring a shortfall', () => {
    const r = simulate({
      household: household({
        flows: [{ id: 'l', name: 'Living', kind: 'expense', amount: 5_000, indexed: false }],
        accounts: [account('cash', { kind: 'cash' }), account('etf', { value: 1_000_000, costBasis: 1_000_000, taxMode: 'onSale', rate: 0.07 })],
        allocation: { cashAccountId: 'cash', bufferMonths: 0, surplus: [], withdrawalOrder: [] },
      }),
      settings: settings({ horizonYears: 2 }),
      scenario: scenario(),
    });
    expect(r.months[24].shortfall).toBe(0);
    expect(r.months[24].accounts.etf).toBeLessThan(1_000_000 * Math.pow(1.07, 2) - 100_000);
    expect(r.warnings).toEqual([]);
  });

  it('reports a real shortfall once, with the number of months', () => {
    const r = simulate({
      household: household({ flows: [{ id: 'l', name: 'Living', kind: 'expense', amount: 1000, indexed: false }] }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario(),
    });
    expect(r.warnings.filter((w) => w.includes('Money runs out'))).toHaveLength(1);
    expect(r.warnings[0]).toContain('12 month');
  });

  it('a child born before the plan keeps its age and costs no birth costs', () => {
    const r = simulate({
      household: household({ accounts: [account('cash', { kind: 'cash', value: 10_000_000 })] }),
      settings: settings({
        startMonth: '2027-01',
        horizonYears: 15,
        childBenefit: 800,
        kidCostBands: [
          { fromAge: 0, toAge: 7, monthly: 2000 },
          { fromAge: 7, toAge: 18, monthly: 1800 },
        ],
      }),
      scenario: scenario([ev({ kind: 'child', trigger: { type: 'date', date: '2020-06' }, childName: 'Ola', birthCost: 5000 })]),
    });
    expect(r.months[1].eventCosts['Birth: Ola']).toBeUndefined();
    expect(r.months[1].flows.expense['Kid: Ola']).toBe(2000); // Jan 2027: age 6
    expect(r.months.find((s) => s.date === '2027-06')!.flows.expense['Kid: Ola']).toBe(1800); // age 7
    expect(r.months.find((s) => s.date === '2038-05')!.flows.income['Child benefit']).toBe(800); // age 17
    expect(r.months.find((s) => s.date === '2038-06')!.flows.income['Child benefit']).toBeUndefined(); // 18
    expect(r.warnings.some((w) => w.includes('before the plan start'))).toBe(true);
  });

  it('lump sums landing in cash are invested by the savings split', () => {
    const r = simulate({
      household: household({
        properties: [{ ...home, id: 'p', value: 1_000_000, costBasis: 1_000_000, acquired: '2010-01' }],
        accounts: [account('cash', { kind: 'cash' }), account('etf', { taxMode: 'onSale' })],
        allocation: { cashAccountId: 'cash', bufferMonths: 0, surplus: [{ accountId: 'etf', share: 0.5 }], withdrawalOrder: [] },
      }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario([ev({ kind: 'sellProperty', trigger: { type: 'date', date: '2027-01' }, propertyId: 'p', sellCostPct: 0, to: 'cash' })]),
    });
    // shares are proportions: a single 50% target still receives everything above the buffer
    expect(r.months[1].accounts.etf).toBeCloseTo(1_000_000, 6);
    expect(r.months[1].accounts.cash).toBeCloseTo(0, 6);
  });

  it('a lease buy-out is paid from the month\'s money before investing (no needless tax)', () => {
    const r = simulate({
      household: household({
        people: [
          { id: 'a', name: 'A', birth: '1990-01', netSalary: 20_000, realSalaryGrowth: 0, retirementAge: null, pension: 0, pensionAge: 65 },
        ],
        accounts: [account('cash', { kind: 'cash' }), account('etf', { value: 200_000, costBasis: 100_000, taxMode: 'onSale' })],
        allocation: { cashAccountId: 'cash', bufferMonths: 0, surplus: [{ accountId: 'etf', share: 1 }], withdrawalOrder: ['etf'] },
      }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario([
        ev({
          kind: 'purchase',
          name: 'Car',
          trigger: { type: 'date', date: '2027-01' },
          price: 50_000,
          priceReal: false,
          depreciation: 0.1,
          runningCosts: 0,
          financing: { type: 'lease', initialPct: 0, monthly: 1_000, termMonths: 3, buyoutPct: 0.3, buyout: true },
          fundFrom: [],
          repeatYears: 0,
        }),
      ]),
    });
    expect(r.months[3].taxPaid).toBe(0);
    expect(r.months[3].eventOutflows).toBeCloseTo(15_000, 6);
    expect(r.months[3].accounts.etf).toBeCloseTo(200_000 + 19_000 * 2 + 4_000, 6);
  });

  it('overpayments are debt repayment, not costs; purchases show as event outflows', () => {
    const r = simulate({
      household: household({
        accounts: [account('cash', { kind: 'cash', value: 1_000_000 })],
        loans: [{ id: 'm', name: 'M', balance: 100_000, rate: 0.06, remainingMonths: 120, type: 'equal', monthlyFees: 0 }],
      }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario([
        ev({ kind: 'overpay', trigger: { type: 'date', date: '2027-01' }, loanId: 'm', amount: 1_000, real: false, monthly: true, months: 0, strategy: 'shorten' }),
        ev({ kind: 'purchase', name: 'TV', trigger: { type: 'date', date: '2027-02' }, price: 8_000, priceReal: false, depreciation: 0.3, runningCosts: 0, financing: { type: 'cash' }, fundFrom: [], repeatYears: 0 }),
      ]),
    });
    expect(r.months[1].debtRepaid).toBe(1_000);
    expect(Object.keys(r.months[1].flows.expense).some((k) => k.startsWith('Overpayment'))).toBe(false);
    expect(r.months[2].eventOutflows).toBe(8_000);
  });

  it("a property priced in today's money is bought at start-of-month prices", () => {
    const owned = simulate({
      household: household({ properties: [{ ...home, id: 'p', value: 800_000, costBasis: 800_000, acquired: '2020-01' }] }),
      settings: settings({ inflationEnabled: true, inflationRate: 0.05, horizonYears: 1 }),
      scenario: scenario(),
    });
    const bought = simulate({
      household: household({ accounts: [account('cash', { kind: 'cash', value: 2_000_000 })] }),
      settings: settings({ inflationEnabled: true, inflationRate: 0.05, horizonYears: 1 }),
      scenario: scenario([
        ev({ kind: 'buyProperty', trigger: { type: 'date', date: '2027-01' }, price: 800_000, priceReal: true, buyCostPct: 0, extraCosts: 0, mortgage: null, fundFrom: [], endsRent: false, property: home }),
      ]),
    });
    expect(Object.values(bought.months[1].properties)[0]).toBeCloseTo(owned.months[1].properties.p, 6);
  });

  it('transaction fees reduce the taxable gain', () => {
    const r = simulate({
      household: household({ accounts: [account('cash', { kind: 'cash' }), account('btc', { value: 1_000, costBasis: 0, taxMode: 'onSale' })] }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario([ev({ kind: 'transfer', trigger: { type: 'date', date: '2027-01' }, from: 'btc', to: 'cash', amount: { mode: 'all' }, feePct: 0.1 })]),
    });
    expect(r.months[1].taxPaid).toBeCloseTo(0.19 * 900, 6);
    expect(r.months[1].accounts.cash).toBeCloseTo(900 - 171, 6);
  });

  it('a loan with no months left is repaid, not forgiven', () => {
    const r = simulate({
      household: household({
        accounts: [account('cash', { kind: 'cash', value: 100_000 })],
        loans: [{ id: 'l', name: 'L', balance: 50_000, rate: 0.06, remainingMonths: 0, type: 'equal', monthlyFees: 0 }],
      }),
      settings: settings({ horizonYears: 1 }),
      scenario: scenario(),
    });
    expect(r.months[1].loans.l).toBeUndefined();
    expect(r.months[1].accounts.cash).toBeCloseTo(100_000 - 50_000 - 250, 6);
  });

  it('a purchase can replace a car owned now, and a repeated lease ends the previous one', () => {
    const r = simulate({
      household: household({
        accounts: [account('cash', { kind: 'cash', value: 500_000 })],
        goods: [{ id: 'old', name: 'Old car', value: 30_000, depreciation: 0, runningCosts: 500 }],
      }),
      settings: settings({ horizonYears: 4 }),
      scenario: scenario([
        {
          ...ev({
            kind: 'purchase',
            name: 'New car',
            trigger: { type: 'date', date: '2027-01' },
            price: 100_000,
            priceReal: false,
            depreciation: 0,
            runningCosts: 0,
            financing: { type: 'lease', initialPct: 0, monthly: 1_000, termMonths: 36, buyoutPct: 0, buyout: false },
            fundFrom: [],
            repeatYears: 2,
          }),
          replaces: 'old',
        } as never,
      ]),
    });
    expect(r.months[1].goods.old).toBeUndefined();
    expect(r.months[1].flows.expense['Running costs: Old car']).toBeUndefined();
    // at month 25 a new lease starts; only one lease payment that month
    expect(r.months[25].flows.expense['Lease: New car']).toBe(1_000);
    expect(r.months[1].accounts.cash).toBeCloseTo(500_000 + 30_000 - 1_000, 6);
  });
});
