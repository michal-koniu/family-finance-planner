// Lists of things an event can point at (accounts, properties, loans), including the
// ones created by earlier events in the same scenario.
import type { Household, PlanEvent, Scenario } from '../engine/types';

export interface Ref {
  id: string;
  label: string;
}

function allEvents(h: Household, s: Scenario | null): PlanEvent[] {
  return [...h.commonEvents, ...(s?.events ?? [])];
}

export function accountRefs(h: Household): Ref[] {
  return h.accounts.map((a) => ({ id: a.id, label: a.name }));
}

export function propertyRefs(h: Household, s: Scenario | null): Ref[] {
  const refs = h.properties.map((p) => ({ id: p.id, label: p.name }));
  for (const e of allEvents(h, s)) {
    if (e.kind === 'buyProperty') refs.push({ id: e.id, label: `${e.property.name} (bought in “${e.name}”)` });
  }
  return refs;
}

export function loanRefs(h: Household, s: Scenario | null): Ref[] {
  const refs = h.loans.map((l) => ({ id: l.id, label: l.name }));
  for (const e of allEvents(h, s)) {
    if (e.kind === 'buyProperty' && e.mortgage) refs.push({ id: `${e.id}:loan`, label: `Mortgage: ${e.property.name} (“${e.name}”)` });
    if (e.kind === 'purchase' && e.financing.type === 'loan') refs.push({ id: `${e.id}#0:loan`, label: `Loan: ${e.name}` });
  }
  return refs;
}

export function personRefs(h: Household): Ref[] {
  return h.people.map((p) => ({ id: p.id, label: p.name }));
}
