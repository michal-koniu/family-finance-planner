import { formatYM } from '../engine/dates';
import type { AmountSpec, Household, PlanEvent, Scenario, Trigger } from '../engine/types';
import { accountRefs, loanRefs, propertyRefs } from '../model/refs';
import { compact, pct } from './format';

export function describeTrigger(t: Trigger, h: Household): string {
  switch (t.type) {
    case 'date':
      return formatYM(t.date);
    case 'age': {
      const p = h.people.find((x) => x.id === t.personId);
      return `when ${p?.name ?? '?'} turns ${t.age}`;
    }
    case 'wealth':
      return `when ${t.measure === 'liquid' ? 'savings & investments' : 'net worth'} reach ${compact(t.threshold)} (today's money)`;
    case 'accountValue': {
      const a = h.accounts.find((x) => x.id === t.accountId);
      return `when ${a?.name ?? '?'} is worth ${compact(t.threshold)}${t.real ? " (today's money)" : ''}`;
    }
  }
}

function amount(a: AmountSpec): string {
  if (a.mode === 'all') return 'everything';
  if (a.mode === 'share') return pct(a.value, 0);
  return compact(a.value);
}

export function describeEvent(e: PlanEvent, h: Household, s: Scenario | null): string {
  const acc = (id: string) => accountRefs(h).find((r) => r.id === id)?.label ?? '?';
  switch (e.kind) {
    case 'transfer':
      return `Move ${amount(e.amount)} from ${acc(e.from)} to ${acc(e.to)}`;
    case 'setReturn':
      return `${acc(e.accountId)} earns ${pct(e.rate)}/yr from now on`;
    case 'setAllocation':
      return `Savings go to: ${e.surplus.map((x) => `${acc(x.accountId)} ${pct(x.share, 0)}`).join(', ') || 'stay in cash'}`;
    case 'oneOff':
      return `${e.flowKind === 'income' ? '+' : '−'}${compact(e.amount)}${e.real ? " (today's money)" : ''}`;
    case 'recurring':
      return `${e.flowKind === 'income' ? '+' : '−'}${compact(e.amount)}/month${e.months ? ` for ${e.months} months` : ''}`;
    case 'buyProperty': {
      const m = e.mortgage;
      const loan = m ? (m.mode === 'ltv' ? `${pct(m.value, 0)} mortgage at ${pct(m.rate, 2)}, ${m.termYears} yrs` : `mortgage ${compact(m.value)} at ${pct(m.rate, 2)}`) : 'no mortgage';
      return `${e.property.name} for ${compact(e.price)}${e.priceReal ? " (today's prices)" : ''}, ${loan}${e.property.use === 'rental' ? ', rented out' : ''}`;
    }
    case 'sellProperty':
      return `Sell ${propertyRefs(h, s).find((r) => r.id === e.propertyId)?.label ?? '?'}`;
    case 'setRent':
      return e.rent > 0 ? `Rent ${compact(e.rent)}/month` : 'Stop paying rent';
    case 'purchase': {
      const f = e.financing;
      const how = f.type === 'cash' ? 'cash' : f.type === 'loan' ? `loan ${pct(f.rate, 1)}, ${f.termMonths} months` : `lease ${compact(f.monthly)}/month for ${f.termMonths} months`;
      return `${compact(e.price)}, ${how}${e.repeatYears ? `, every ${e.repeatYears} yrs` : ''}`;
    }
    case 'child':
      return `${e.childName} is born`;
    case 'retire':
      return e.personId === 'all' ? 'Both stop working' : `${h.people.find((p) => p.id === e.personId)?.name ?? '?'} stops working`;
    case 'setSalary':
      return `${h.people.find((p) => p.id === e.personId)?.name ?? '?'}: ${compact(e.netSalary)}/month take-home`;
    case 'overpay':
      return `${compact(e.amount)}${e.monthly ? '/month' : ' once'} into ${loanRefs(h, s).find((r) => r.id === e.loanId)?.label ?? '?'}`;
    case 'loanRate':
      return `${loanRefs(h, s).find((r) => r.id === e.loanId)?.label ?? '?'}: ${pct(e.rate, 2)}`;
  }
}
