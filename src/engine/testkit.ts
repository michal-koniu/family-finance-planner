// Small builders for engine tests.
import type { Account, Household, PlanEvent, Scenario, Settings } from './types';

export function settings(over: Partial<Settings> = {}): Settings {
  return {
    currency: 'PLN',
    startMonth: '2027-01',
    horizonYears: 10,
    inflationEnabled: false,
    inflationRate: 0.05,
    capitalGainsTaxRate: 0.19,
    propertyGainTaxRate: 0.19,
    propertyExemptionYears: 5,
    propertyBuyCostPct: 0.03,
    propertySellCostPct: 0.03,
    kidCostBands: [{ fromAge: 0, toAge: 18, monthly: 1000 }],
    childBenefit: 0,
    childBenefitIndexed: false,
    updatedAt: 0,
    ...over,
  };
}

export function account(id: string, over: Partial<Account> = {}): Account {
  return {
    id,
    name: id,
    kind: 'investment',
    value: 0,
    costBasis: over.value ?? 0,
    taxMode: 'none',
    rate: 0,
    schedule: [],
    ...over,
  };
}

export function household(over: Partial<Household> = {}): Household {
  return {
    people: [],
    rent: 0,
    flows: [],
    accounts: [account('cash', { kind: 'cash' })],
    properties: [],
    loans: [],
    goods: [],
    allocation: { cashAccountId: 'cash', bufferMonths: 0, surplus: [], withdrawalOrder: [] },
    commonEvents: [],
    updatedAt: 0,
    ...over,
  };
}

export function scenario(events: PlanEvent[] = []): Scenario {
  return { id: 's', name: 's', colorSlot: 0, notes: '', events, excludedCommon: [], updatedAt: 0 };
}

export function ev<E extends Omit<PlanEvent, 'id' | 'name' | 'enabled'>>(e: E): PlanEvent {
  return { id: Math.random().toString(36).slice(2), name: 'event', enabled: true, ...e } as unknown as PlanEvent;
}
