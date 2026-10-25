import { addMonths, currentYM } from '../engine/dates';
import type {
  Account,
  EventKind,
  Household,
  PlanDocument,
  PlanEvent,
  PropertySpec,
  Scenario,
  Settings,
  Trigger,
} from '../engine/types';

export const SCHEMA_VERSION = 1;

/** Translates default names/texts into the user's language when data is created. */
export type Tr = (english: string) => string;
const same: Tr = (s) => s;

export function uid(prefix = ''): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return prefix + r;
}

export function defaultSettings(): Settings {
  return {
    currency: 'PLN',
    startMonth: addMonths(currentYM(), 1),
    horizonYears: 40,
    inflationEnabled: true,
    inflationRate: 0.035,
    capitalGainsTaxRate: 0.19,
    propertyGainTaxRate: 0.19,
    propertyExemptionYears: 5,
    propertyBuyCostPct: 0.03,
    propertySellCostPct: 0.03,
    kidCostBands: [
      { fromAge: 0, toAge: 1, monthly: 2000 },
      { fromAge: 1, toAge: 3, monthly: 2600 },
      { fromAge: 3, toAge: 7, monthly: 2000 },
      { fromAge: 7, toAge: 13, monthly: 1800 },
      { fromAge: 13, toAge: 19, monthly: 2300 },
      { fromAge: 19, toAge: 25, monthly: 2000 },
    ],
    childBenefit: 800,
    childBenefitIndexed: false,
    updatedAt: 0,
  };
}

export function newAccount(kind: Account['kind'] = 'investment', tr: Tr = same): Account {
  return {
    id: uid('acc-'),
    name: tr(kind === 'cash' ? 'Current account' : kind === 'deposit' ? 'Savings deposit' : 'Investments'),
    kind,
    value: 0,
    costBasis: 0,
    taxMode: kind === 'investment' ? 'onSale' : kind === 'deposit' ? 'interest' : 'none',
    rate: kind === 'investment' ? 0.07 : kind === 'deposit' ? 0.045 : 0,
    schedule: [],
  };
}

export function defaultPropertySpec(use: PropertySpec['use'] = 'home', tr: Tr = same): PropertySpec {
  return {
    name: tr(use === 'rental' ? 'Rental flat' : 'Our flat'),
    use,
    realGrowth: 0,
    monthlyCosts: 800,
    maintenancePct: 0.005,
    rentIncome: use === 'rental' ? 3200 : 0,
    vacancyPct: use === 'rental' ? 0.08 : 0,
    rentalTaxRate: 0.085,
    managementPct: 0,
  };
}

export function emptyHousehold(tr: Tr = same): Household {
  const cash = newAccount('cash', tr);
  return {
    people: [],
    rent: 0,
    flows: [],
    accounts: [cash],
    properties: [],
    loans: [],
    goods: [],
    allocation: { cashAccountId: cash.id, bufferMonths: 3, surplus: [], withdrawalOrder: [] },
    commonEvents: [],
    updatedAt: 0,
  };
}

export function newScenario(name: string, colorSlot: number): Scenario {
  return { id: uid('sc-'), name, colorSlot, notes: '', events: [], excludedCommon: [], updatedAt: Date.now() };
}

export function emptyDocument(tr: Tr = same): PlanDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    household: emptyHousehold(tr),
    settings: defaultSettings(),
    scenarios: [newScenario(tr('Baseline'), 0)],
    deleted: {},
    isExample: false,
  };
}

// ---------------------------------------------------------------------------
// Event catalogue

export interface EventKindInfo {
  kind: EventKind;
  label: string;
  hint: string;
  group: 'Money' | 'Home' | 'Things' | 'Life' | 'Loans';
}

export const EVENT_KINDS: EventKindInfo[] = [
  { kind: 'transfer', label: 'Move / sell / buy investments', hint: 'Sell BTC into the deposit, buy stocks with cash… Tax is paid on gains automatically.', group: 'Money' },
  { kind: 'setReturn', label: 'Change expected return', hint: 'From this point an account earns a different yearly return (e.g. bear market).', group: 'Money' },
  { kind: 'setAllocation', label: 'Change where savings go', hint: 'Redirect monthly savings, e.g. into the deposit during a bear market.', group: 'Money' },
  { kind: 'oneOff', label: 'One-off income or expense', hint: 'Inheritance, bonus, wedding, big trip…', group: 'Money' },
  { kind: 'recurring', label: 'New regular income or expense', hint: 'Side income, a new subscription, private school…', group: 'Money' },
  { kind: 'buyProperty', label: 'Buy property', hint: 'Cash or mortgage, to live in or to rent out.', group: 'Home' },
  { kind: 'sellProperty', label: 'Sell property', hint: 'Repays its mortgage; gain tax if sold within the exemption period.', group: 'Home' },
  { kind: 'setRent', label: 'Change rent', hint: 'Start renting, move to a different flat, or stop renting.', group: 'Home' },
  { kind: 'purchase', label: 'Buy a car or other big item', hint: 'Cash, loan or lease. Can repeat every few years.', group: 'Things' },
  { kind: 'child', label: 'Child', hint: 'Adds age-based costs (Settings) and child benefit.', group: 'Life' },
  { kind: 'retire', label: 'Retire', hint: 'Stop working at a date, an age, or when savings reach a target.', group: 'Life' },
  { kind: 'setSalary', label: 'Change take-home pay', hint: 'New job, part-time, sabbatical (0)…', group: 'Life' },
  { kind: 'overpay', label: 'Overpay a loan', hint: 'One-off or monthly; shorten the term or lower the installment.', group: 'Loans' },
  { kind: 'loanRate', label: 'Loan rate changes', hint: 'Variable-rate change; the installment is recalculated.', group: 'Loans' },
];

export function kindInfo(kind: EventKind): EventKindInfo {
  return EVENT_KINDS.find((k) => k.kind === kind)!;
}

export function newEvent(kind: EventKind, household: Household, settings: Settings, tr: Tr = same): PlanEvent {
  const trigger: Trigger = { type: 'date', date: addMonths(settings.startMonth, 12) };
  const base = { id: uid('ev-'), enabled: true, trigger };
  const cashId = household.allocation.cashAccountId;
  const firstInvest = household.accounts.find((a) => a.kind !== 'cash')?.id ?? cashId;
  const firstPerson = household.people[0]?.id ?? '';
  switch (kind) {
    case 'transfer':
      return { ...base, kind, name: tr('Sell investments'), from: firstInvest, to: cashId, amount: { mode: 'all' }, feePct: 0 };
    case 'setReturn':
      return { ...base, kind, name: tr('Bear market'), accountId: firstInvest, rate: -0.5 };
    case 'setAllocation':
      return { ...base, kind, name: tr('New savings split'), surplus: household.allocation.surplus.map((s) => ({ ...s })) };
    case 'oneOff':
      return { ...base, kind, name: tr('One-off expense'), flowKind: 'expense', amount: 20000, real: true, to: cashId };
    case 'recurring':
      return { ...base, kind, name: tr('New regular expense'), flowKind: 'expense', amount: 500, indexed: true, months: 0 };
    case 'buyProperty':
      return {
        ...base,
        kind,
        name: tr('Buy a flat'),
        price: 700000,
        priceReal: true,
        buyCostPct: settings.propertyBuyCostPct,
        extraCosts: 50000,
        mortgage: { mode: 'ltv', value: 0.8, rate: 0.065, termYears: 25, type: 'equal', commissionPct: 0, monthlyFees: 0 },
        fundFrom: [],
        endsRent: true,
        property: defaultPropertySpec('home', tr),
      };
    case 'sellProperty':
      return { ...base, kind, name: tr('Sell property'), propertyId: household.properties[0]?.id ?? '', sellCostPct: settings.propertySellCostPct, to: cashId };
    case 'setRent':
      return { ...base, kind, name: tr('Stop renting'), rent: 0 };
    case 'purchase':
      return {
        ...base,
        kind,
        name: tr('Car'),
        price: 150000,
        priceReal: true,
        depreciation: 0.15,
        runningCosts: 700,
        financing: { type: 'cash' },
        fundFrom: [],
        repeatYears: 0,
      };
    case 'child':
      return { ...base, kind, name: tr('Child'), childName: tr('Child'), birthCost: 10000 };
    case 'retire':
      return { ...base, kind, name: tr('Retire'), personId: 'all', trigger: { type: 'wealth', measure: 'liquid', threshold: 3000000 } };
    case 'setSalary':
      return { ...base, kind, name: tr('New job'), personId: firstPerson, netSalary: household.people[0]?.netSalary ?? 10000 };
    case 'overpay':
      return { ...base, kind, name: tr('Overpay mortgage'), loanId: '', amount: 1000, real: false, monthly: true, months: 0, strategy: 'shorten' };
    case 'loanRate':
      return { ...base, kind, name: tr('Rate change'), loanId: '', rate: 0.06 };
  }
}

// ---------------------------------------------------------------------------
// Example data (made-up numbers to show how things work)

export function exampleDocument(tr: Tr = same): PlanDocument {
  const settings = defaultSettings();
  const s0 = settings.startMonth;
  const at = (months: number) => addMonths(s0, months);

  const cash: Account = { ...newAccount('cash'), id: 'acc-cash', name: tr('Current account'), value: 45000, costBasis: 45000 };
  const deposit: Account = { ...newAccount('deposit'), id: 'acc-deposit', name: tr('Savings deposit'), value: 100000, costBasis: 100000, rate: 0.045 };
  const etf: Account = { ...newAccount('investment'), id: 'acc-etf', name: tr('Stocks ETF'), value: 180000, costBasis: 140000, rate: 0.07 };
  const btc: Account = {
    ...newAccount('investment'),
    id: 'acc-btc',
    name: tr('Bitcoin (3 BTC)'),
    value: 225000,
    costBasis: 225000,
    // ≈ ×3 in 30 months, then a bear market, recovery, and a calmer long run.
    rate: 0.552,
    schedule: [
      { from: at(30), rate: -0.6 },
      { from: at(42), rate: 0.35 },
      { from: at(90), rate: 0.08 },
    ],
  };

  const household: Household = {
    people: [
      { id: 'p-me', name: tr('Me'), birth: '1992-05', netSalary: 14000, realSalaryGrowth: 0.01, retirementAge: 65, pension: 3500, pensionAge: 65 },
      { id: 'p-partner', name: tr('Partner'), birth: '1993-09', netSalary: 11000, realSalaryGrowth: 0.01, retirementAge: 65, pension: 3000, pensionAge: 65 },
    ],
    rent: 4500,
    flows: [
      { id: 'f-living', name: tr('Living costs'), kind: 'expense', amount: 9000, indexed: true },
      { id: 'f-holidays', name: tr('Holidays'), kind: 'expense', amount: 1000, indexed: true },
    ],
    accounts: [cash, deposit, etf, btc],
    properties: [],
    loans: [],
    goods: [],
    allocation: {
      cashAccountId: cash.id,
      bufferMonths: 3,
      surplus: [
        { accountId: etf.id, share: 0.7 },
        { accountId: deposit.id, share: 0.3 },
      ],
      withdrawalOrder: [deposit.id, etf.id, btc.id],
    },
    commonEvents: [
      { id: 'ev-kid1', name: tr('First child'), enabled: true, trigger: { type: 'date', date: at(20) }, kind: 'child', childName: tr('Kid 1'), birthCost: 10000 },
      { id: 'ev-kid2', name: tr('Second child'), enabled: true, trigger: { type: 'date', date: at(52) }, kind: 'child', childName: tr('Kid 2'), birthCost: 10000 },
    ],
    updatedAt: Date.now(),
  };

  const btcTrade: PlanEvent[] = [
    {
      id: 'ev-sell-btc',
      name: tr('Sell BTC at the top'),
      enabled: true,
      trigger: { type: 'accountValue', accountId: btc.id, threshold: 660000, real: false },
      kind: 'transfer',
      from: btc.id,
      to: deposit.id,
      amount: { mode: 'all' },
      feePct: 0.002,
    },
    {
      id: 'ev-rebuy-btc',
      name: tr('Buy BTC back after the drop'),
      enabled: true,
      trigger: { type: 'date', date: at(42) },
      kind: 'transfer',
      from: deposit.id,
      to: btc.id,
      amount: { mode: 'share', value: 0.6 },
      feePct: 0.002,
    },
  ];

  const flat = (name: string): PropertySpec => ({ ...defaultPropertySpec('home', tr), name, realGrowth: 0.01 });

  const scenarios: Scenario[] = [
    {
      ...newScenario(tr('Rent + trade crypto'), 0),
      id: 'sc-rent',
      notes: tr('Keep renting. Sell BTC when the 3 BTC are worth ~660k zł (≈180k USD), park it in the deposit, buy back after the bear market.'),
      events: btcTrade.map((e) => ({ ...e })),
    },
    {
      ...newScenario(tr('Sell everything, buy flat in cash'), 1),
      id: 'sc-cash-flat',
      notes: tr('Sell crypto, stocks and deposit now and buy a flat without a mortgage.'),
      events: [
        {
          id: 'ev-cash-flat',
          name: tr('Buy flat for cash'),
          enabled: true,
          trigger: { type: 'date', date: at(1) },
          kind: 'buyProperty',
          price: 500000,
          priceReal: true,
          buyCostPct: 0.03,
          extraCosts: 30000,
          mortgage: null,
          fundFrom: [btc.id, deposit.id, etf.id],
          endsRent: true,
          property: flat(tr('Our flat')),
        },
      ],
    },
    {
      ...newScenario(tr('Mortgage + part of crypto'), 2),
      id: 'sc-mortgage',
      notes: tr('20% own contribution from BTC, 80% mortgage. Rate drops after 5 years (variable).'),
      events: [
        {
          id: 'ev-mort-flat',
          name: tr('Buy flat with mortgage'),
          enabled: true,
          trigger: { type: 'date', date: at(1) },
          kind: 'buyProperty',
          price: 500000,
          priceReal: true,
          buyCostPct: 0.03,
          extraCosts: 30000,
          mortgage: { mode: 'ltv', value: 0.8, rate: 0.065, termYears: 25, type: 'equal', commissionPct: 0, monthlyFees: 0 },
          fundFrom: [btc.id],
          endsRent: true,
          property: flat(tr('Our flat')),
        },
        { id: 'ev-mort-rate', name: tr('Rate drops'), enabled: true, trigger: { type: 'date', date: at(61) }, kind: 'loanRate', loanId: 'ev-mort-flat:loan', rate: 0.055 },
      ],
    },
    {
      ...newScenario(tr('Rent + crypto + car in cash'), 3),
      id: 'sc-car-cash',
      notes: tr('Like "Rent + trade crypto", plus a car bought for cash and replaced every 6 years.'),
      events: [
        ...btcTrade.map((e) => ({ ...e, id: e.id + '-cc' })),
        {
          id: 'ev-car-cash',
          name: tr('Car (cash)'),
          enabled: true,
          trigger: { type: 'date', date: at(2) },
          kind: 'purchase',
          price: 160000,
          priceReal: true,
          depreciation: 0.15,
          runningCosts: 800,
          financing: { type: 'cash' },
          fundFrom: [],
          repeatYears: 6,
        },
      ],
    },
    {
      ...newScenario(tr('Rent + crypto + car lease'), 4),
      id: 'sc-car-lease',
      notes: tr('Same car leased for 4 years at a time, handed back at the end.'),
      events: [
        ...btcTrade.map((e) => ({ ...e, id: e.id + '-cl' })),
        {
          id: 'ev-car-lease',
          name: tr('Car (lease)'),
          enabled: true,
          trigger: { type: 'date', date: at(2) },
          kind: 'purchase',
          price: 160000,
          priceReal: true,
          depreciation: 0.15,
          runningCosts: 800,
          financing: { type: 'lease', initialPct: 0.1, monthly: 2900, termMonths: 48, buyoutPct: 0.45, buyout: false },
          fundFrom: [],
          repeatYears: 4,
        },
      ],
    },
    {
      ...newScenario(tr('Sell all, 2 flats on credit'), 5),
      id: 'sc-two-flats',
      notes: tr('Sell stocks and crypto, buy one flat to live in and one to rent out, both 80% mortgage.'),
      events: [
        { id: 'ev-2f-btc', name: tr('Sell BTC'), enabled: true, trigger: { type: 'date', date: at(1) }, kind: 'transfer', from: btc.id, to: cash.id, amount: { mode: 'all' }, feePct: 0.002 },
        { id: 'ev-2f-etf', name: tr('Sell ETF'), enabled: true, trigger: { type: 'date', date: at(1) }, kind: 'transfer', from: etf.id, to: cash.id, amount: { mode: 'all' }, feePct: 0 },
        {
          id: 'ev-2f-home',
          name: tr('Buy flat to live in'),
          enabled: true,
          trigger: { type: 'date', date: at(1) },
          kind: 'buyProperty',
          price: 500000,
          priceReal: true,
          buyCostPct: 0.03,
          extraCosts: 30000,
          mortgage: { mode: 'ltv', value: 0.8, rate: 0.065, termYears: 25, type: 'equal', commissionPct: 0, monthlyFees: 0 },
          fundFrom: [cash.id],
          endsRent: true,
          property: flat(tr('Our flat')),
        },
        {
          id: 'ev-2f-rental',
          name: tr('Buy flat to rent out'),
          enabled: true,
          trigger: { type: 'date', date: at(1) },
          kind: 'buyProperty',
          price: 450000,
          priceReal: true,
          buyCostPct: 0.03,
          extraCosts: 25000,
          mortgage: { mode: 'ltv', value: 0.8, rate: 0.068, termYears: 25, type: 'equal', commissionPct: 0, monthlyFees: 0 },
          fundFrom: [cash.id],
          endsRent: false,
          property: { ...defaultPropertySpec('rental', tr), name: tr('Rental flat'), realGrowth: 0.01, rentIncome: 2800 },
        },
      ],
    },
  ];

  return { schemaVersion: SCHEMA_VERSION, household, settings: { ...settings, updatedAt: Date.now() }, scenarios, deleted: {}, isExample: true };
}
