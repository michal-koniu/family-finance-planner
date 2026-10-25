// Data model for the planner. Everything the user edits is plain JSON so it can be
// persisted to GitHub as-is.
//
// Money conventions:
// - Amounts marked "today's money" are expressed in prices of the plan's start
//   month and get indexed with inflation (when enabled) as time passes.
// - Amounts marked "nominal" are fixed numbers of currency at the moment they apply.
// - Rates are annual, as decimals (0.07 = 7%/yr) unless stated otherwise.
// - Dates are "YYYY-MM" strings; the engine works in whole months.

export type YearMonth = string; // "2026-10"

export interface Person {
  id: string;
  name: string;
  birth: YearMonth;
  /** Monthly take-home pay (after income tax), today's money. */
  netSalary: number;
  /** Extra yearly pay growth above inflation (career progression). */
  realSalaryGrowth: number;
  /** Age at which this person stops working by default. Empty = never by default. */
  retirementAge: number | null;
  /** Monthly state pension (after tax), today's money. */
  pension: number;
  /** Age from which the pension is paid. */
  pensionAge: number;
}

export type AccountKind = 'cash' | 'deposit' | 'investment';

/**
 * How gains on an account are taxed.
 * - interest: gains are taxed every month as they accrue (bank deposits, bonds).
 * - onSale:   gains are taxed when sold, on the gain above cost basis (stocks, crypto).
 * - none:     tax-free wrapper (e.g. IKE) or untaxed cash.
 */
export type TaxMode = 'interest' | 'onSale' | 'none';

export interface ReturnPeriod {
  from: YearMonth;
  /** Annual nominal return from this month onwards (until the next period). */
  rate: number;
}

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** Current value, nominal (= today's money at the start). */
  value: number;
  /** What was paid for the current holdings; the base for capital gains tax. */
  costBasis: number;
  taxMode: TaxMode;
  /** Annual nominal return, used until the first schedule entry. */
  rate: number;
  /** Optional changes of the return rate over time (e.g. bull run then bear market). */
  schedule: ReturnPeriod[];
}

export type PropertyUse = 'home' | 'rental' | 'vacant';

export interface PropertySpec {
  name: string;
  use: PropertyUse;
  /** Yearly price growth above inflation (0 = property prices just follow inflation). */
  realGrowth: number;
  /** Monthly fixed costs: building fees (czynsz administracyjny), media you pay as owner, insurance. Today's money. */
  monthlyCosts: number;
  /** Yearly repairs/maintenance as a share of the property's value. */
  maintenancePct: number;
  /** Monthly rent received if rented out, today's money. */
  rentIncome: number;
  /** Share of the year the flat stands empty (0.08 ≈ one month a year). */
  vacancyPct: number;
  /** Tax on rental income, as share of rent received (Polish lump-sum tax). */
  rentalTaxRate: number;
  /** Management/agency fee as share of rent received. */
  managementPct: number;
}

export interface Property extends PropertySpec {
  id: string;
  value: number; // nominal market value
  /** Purchase price plus purchase costs, nominal: the base for gain tax when sold. */
  costBasis: number;
  /** Month the property was acquired (for the Polish 5-year exemption). */
  acquired: YearMonth;
}

export type InstallmentType = 'equal' | 'decreasing';

export interface Loan {
  id: string;
  name: string;
  /** Outstanding principal, nominal. */
  balance: number;
  rate: number;
  /** Remaining number of monthly installments. */
  remainingMonths: number;
  type: InstallmentType;
  /** Other fixed monthly costs tied to the loan (insurance, account fee), nominal. */
  monthlyFees: number;
  /** Asset this loan is secured on, repaid automatically if that asset is sold. */
  securedOn?: string;
}

export interface Good {
  id: string;
  name: string;
  value: number;
  /** Yearly loss of value (0.15 = loses 15% of its value every year). */
  depreciation: number;
  /** Monthly running costs (insurance, fuel, service), today's money. */
  runningCosts: number;
}

export interface RecurringFlow {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  /** Monthly amount in today's money (or nominal when not indexed). */
  amount: number;
  /** Rises with inflation. */
  indexed: boolean;
  start?: YearMonth;
  end?: YearMonth;
}

export interface KidCostBand {
  fromAge: number;
  toAge: number; // exclusive
  monthly: number; // today's money
}

export interface Allocation {
  /** Account that receives income and pays bills. */
  cashAccountId: string;
  /** Keep this much in the cash account before investing the rest, expressed in months of expenses. */
  bufferMonths: number;
  /** Where the monthly surplus above the buffer goes. Shares should add to 1; the rest stays in cash. */
  surplus: { accountId: string; share: number }[];
  /** Order of accounts to sell from when cash runs short. */
  withdrawalOrder: string[];
}

export interface Household {
  people: Person[];
  /** Current monthly rent, today's money. 0 = not renting. */
  rent: number;
  flows: RecurringFlow[];
  accounts: Account[];
  properties: Property[];
  loans: Loan[];
  goods: Good[];
  allocation: Allocation;
  /** Life events shared by every scenario (kids, planned retirement…). */
  commonEvents: PlanEvent[];
  updatedAt: number;
}

export interface Settings {
  /** Display label only; the planner never converts currencies. */
  currency: string;
  /** First simulated month. The values you enter describe the end of the month before it. */
  startMonth: YearMonth;
  horizonYears: number;
  inflationEnabled: boolean;
  inflationRate: number;
  /** Tax on investment gains and deposit interest (Belka tax, 19% in 2026). */
  capitalGainsTaxRate: number;
  /** Tax on the gain when a property is sold before the exemption period ends. */
  propertyGainTaxRate: number;
  /** Property gain is tax-free once this many full calendar years passed after the purchase year. */
  propertyExemptionYears: number;
  /** Default costs when buying property: tax (PCC), notary, agency, as share of price. */
  propertyBuyCostPct: number;
  /** Default costs when selling property (agency, notary), as share of price. */
  propertySellCostPct: number;
  kidCostBands: KidCostBand[];
  /** Child benefit (800+), monthly, until age 18. */
  childBenefit: number;
  childBenefitIndexed: boolean;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Events

export type Trigger =
  | { type: 'date'; date: YearMonth }
  | { type: 'age'; personId: string; age: number }
  /** Fires the first month the chosen wealth measure (in today's money) reaches the threshold. */
  | { type: 'wealth'; measure: 'liquid' | 'netWorth'; threshold: number }
  /** Fires the first month an account's value reaches the threshold. */
  | { type: 'accountValue'; accountId: string; threshold: number; real: boolean };

export type AmountSpec =
  | { mode: 'all' }
  | { mode: 'share'; value: number } // 0..1 of the source value
  | { mode: 'fixed'; value: number; real: boolean }; // real = today's money

export interface MortgageSpec {
  /** 'ltv' = share of the price; 'amount' = fixed loan amount (today's money if priced in today's money). */
  mode: 'ltv' | 'amount';
  value: number;
  rate: number;
  termYears: number;
  type: InstallmentType;
  /** Bank commission, share of loan, paid upfront. */
  commissionPct: number;
  monthlyFees: number;
}

export type GoodFinancing =
  | { type: 'cash' }
  | { type: 'loan'; downPaymentPct: number; rate: number; termMonths: number; commissionPct: number }
  | {
      type: 'lease';
      /** Upfront payment, share of price. */
      initialPct: number;
      /** Monthly lease payment, nominal, fixed for the whole term. */
      monthly: number;
      termMonths: number;
      /** Buy-out price at the end, share of the original price. */
      buyoutPct: number;
      buyout: boolean;
    };

interface EventBase {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
}

export type PlanEvent = EventBase &
  (
    | { kind: 'transfer'; from: string; to: string; amount: AmountSpec; feePct: number }
    | { kind: 'setReturn'; accountId: string; rate: number }
    | {
        kind: 'buyProperty';
        price: number;
        priceReal: boolean;
        buyCostPct: number;
        /** Extra one-off cost: renovation, furniture. Same money basis as the price. */
        extraCosts: number;
        mortgage: MortgageSpec | null;
        /** Accounts to pay the own contribution from, in order. Empty = cash then withdrawal order. */
        fundFrom: string[];
        endsRent: boolean;
        property: PropertySpec;
      }
    | { kind: 'sellProperty'; propertyId: string; sellCostPct: number; to: string }
    | {
        kind: 'purchase';
        price: number;
        priceReal: boolean;
        depreciation: number;
        runningCosts: number;
        financing: GoodFinancing;
        fundFrom: string[];
        /** Replace it every N years (0 = once). The old item is sold at its depreciated value. */
        repeatYears: number;
        /** An item owned now (Household) that this purchase replaces; it's sold at the first purchase. */
        replaces?: string;
      }
    | { kind: 'child'; childName: string; birthCost: number }
    | { kind: 'retire'; personId: string | 'all' }
    | { kind: 'setSalary'; personId: string; netSalary: number }
    | { kind: 'setRent'; rent: number }
    | { kind: 'oneOff'; flowKind: 'income' | 'expense'; amount: number; real: boolean; to: string }
    | { kind: 'recurring'; flowKind: 'income' | 'expense'; amount: number; indexed: boolean; months: number }
    | { kind: 'overpay'; loanId: string; amount: number; real: boolean; monthly: boolean; months: number; strategy: 'shorten' | 'lower' }
    | { kind: 'loanRate'; loanId: string; rate: number }
    | { kind: 'setAllocation'; surplus: { accountId: string; share: number }[] }
  );

export type EventKind = PlanEvent['kind'];

export interface Scenario {
  id: string;
  name: string;
  /** Categorical palette slot (0-7). Follows the scenario, never its position in a list. */
  colorSlot: number;
  notes: string;
  events: PlanEvent[];
  /** Common (household) events switched off for this scenario. */
  excludedCommon: string[];
  updatedAt: number;
}

export interface PlanDocument {
  schemaVersion: number;
  household: Household;
  settings: Settings;
  scenarios: Scenario[];
  /** Deleted scenario ids with deletion time, so deletions survive a merge with another device. */
  deleted: Record<string, number>;
  /** True while this is the built-in example data nobody has edited yet. */
  isExample?: boolean;
}

// ---------------------------------------------------------------------------
// Simulation output

/** A translatable message: English template with {placeholders} (also the translation key) + values. */
export interface LogEntry {
  k: string;
  p?: Record<string, string | number>;
}

export interface MonthFlows {
  income: Record<string, number>;
  expense: Record<string, number>;
}

export interface MonthSnapshot {
  index: number; // 0 = start of plan (today)
  date: YearMonth;
  /** Price level relative to the start month (1 = today's prices). */
  cpi: number;
  accounts: Record<string, number>;
  properties: Record<string, number>;
  goods: Record<string, number>;
  loans: Record<string, number>;
  flows: MonthFlows;
  /** Interest part of loan installments paid this month. */
  interestPaid: number;
  /** All taxes paid this month (capital gains, deposit interest, rental, property sale). */
  taxPaid: number;
  /** One-off costs paid at events this month (purchase taxes, notary, commissions, selling costs). */
  eventCosts: Record<string, number>;
  /** Extra loan repayments (overpayments) this month. Not spending, so not in the costs. */
  debtRepaid: number;
  /** Own money paid at events this month: purchases, own contributions, lease payments upfront, buy-outs. */
  eventOutflows: number;
  /** Income minus expenses this month (before investing / withdrawing). */
  netCashFlow: number;
  netWorth: number;
  /** Net worth minus taxes and selling costs you would pay if you sold everything now. */
  netWorthAfterTax: number;
  /** Cash + accounts (sellable within days), net of nothing. */
  liquid: number;
  /** Cash that had to be borrowed because every account ran dry. */
  shortfall: number;
  events: LogEntry[];
}

export interface SimulationResult {
  scenarioId: string;
  months: MonthSnapshot[];
  /** Names for every id that appears in the snapshots. */
  labels: Record<string, string>;
  retirements: Record<string, number>; // personId -> month index
  warnings: LogEntry[];
}
