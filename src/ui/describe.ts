import type { AmountSpec, Household, PlanEvent, Scenario, Trigger } from '../engine/types';
import type { TFn } from '../i18n';
import { accountRefs, loanRefs, propertyRefs } from '../model/refs';
import { compact, pct } from './format';

export function describeTrigger(tr: Trigger, h: Household, t: TFn, month: (ym: string) => string): string {
  switch (tr.type) {
    case 'date':
      return month(tr.date);
    case 'age': {
      const p = h.people.find((x) => x.id === tr.personId);
      return t('when {name} turns {age}', { name: p?.name ?? '?', age: tr.age });
    }
    case 'wealth':
      return tr.measure === 'liquid'
        ? t("when savings & investments reach {amount} (today's money)", { amount: compact(tr.threshold) })
        : t("when net worth reaches {amount} (today's money)", { amount: compact(tr.threshold) });
    case 'accountValue': {
      const a = h.accounts.find((x) => x.id === tr.accountId);
      return tr.real
        ? t("when {account} is worth {amount} (today's money)", { account: a?.name ?? '?', amount: compact(tr.threshold) })
        : t('when {account} is worth {amount}', { account: a?.name ?? '?', amount: compact(tr.threshold) });
    }
  }
}

function amount(a: AmountSpec, t: TFn): string {
  if (a.mode === 'all') return t('everything');
  if (a.mode === 'share') return pct(a.value, 0);
  return compact(a.value);
}

export function describeEvent(e: PlanEvent, h: Household, s: Scenario | null, t: TFn): string {
  const acc = (id: string) => accountRefs(h).find((r) => r.id === id)?.label ?? '?';
  const person = (id: string) => h.people.find((p) => p.id === id)?.name ?? '?';
  const loan = (id: string) => loanRefs(h, s).find((r) => r.id === id)?.label ?? '?';
  switch (e.kind) {
    case 'transfer':
      return t('Move {amount} from {from} to {to}', { amount: amount(e.amount, t), from: acc(e.from), to: acc(e.to) });
    case 'setReturn':
      return t('{account} earns {rate} a year from now on', { account: acc(e.accountId), rate: pct(e.rate) });
    case 'setAllocation':
      return e.surplus.length
        ? t('Savings go to: {list}', { list: e.surplus.map((x) => `${acc(x.accountId)} ${pct(x.share, 0)}`).join(', ') })
        : t('Savings stay in the current account');
    case 'oneOff':
      return `${e.flowKind === 'income' ? '+' : '−'}${compact(e.amount)}${e.real ? ` (${t("today's money")})` : ''}`;
    case 'recurring':
      return e.months
        ? t('{amount}/month for {months} months', { amount: `${e.flowKind === 'income' ? '+' : '−'}${compact(e.amount)}`, months: e.months })
        : t('{amount}/month', { amount: `${e.flowKind === 'income' ? '+' : '−'}${compact(e.amount)}` });
    case 'buyProperty': {
      const m = e.mortgage;
      const loanText = !m
        ? t('no mortgage')
        : m.mode === 'ltv'
          ? t('{share} mortgage at {rate}, {years} yrs', { share: pct(m.value, 0), rate: pct(m.rate, 2), years: m.termYears })
          : t('mortgage {amount} at {rate}', { amount: compact(m.value), rate: pct(m.rate, 2) });
      const parts = [`${e.property.name} — ${compact(e.price)}${e.priceReal ? ` (${t("today's prices")})` : ''}`, loanText];
      if (e.property.use === 'rental') parts.push(t('rented out'));
      return parts.join(', ');
    }
    case 'sellProperty':
      return t('Sell {property}', { property: propertyRefs(h, s).find((r) => r.id === e.propertyId)?.label ?? '?' });
    case 'setRent':
      return e.rent > 0 ? t('Rent {amount}/month', { amount: compact(e.rent) }) : t('Stop paying rent');
    case 'purchase': {
      const f = e.financing;
      const how =
        f.type === 'cash'
          ? t('cash')
          : f.type === 'loan'
            ? t('loan {rate}, {months} months', { rate: pct(f.rate, 1), months: f.termMonths })
            : t('lease {amount}/month for {months} months', { amount: compact(f.monthly), months: f.termMonths });
      const parts = [compact(e.price), how];
      if (e.repeatYears) parts.push(t('every {years} yrs', { years: e.repeatYears }));
      return parts.join(', ');
    }
    case 'child':
      return t('{name} is born', { name: e.childName });
    case 'retire':
      return e.personId === 'all' ? t('Everyone stops working') : t('{name} stops working', { name: person(e.personId) });
    case 'setSalary':
      return t('{name}: {amount}/month take-home', { name: person(e.personId), amount: compact(e.netSalary) });
    case 'overpay':
      return e.monthly
        ? t('{amount}/month into {loan}', { amount: compact(e.amount), loan: loan(e.loanId) })
        : t('{amount} once into {loan}', { amount: compact(e.amount), loan: loan(e.loanId) });
    case 'loanRate':
      return `${loan(e.loanId)}: ${pct(e.rate, 2)}`;
  }
}
