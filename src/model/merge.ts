import type { PlanDocument, Scenario } from '../engine/types';
import { defaultSettings, emptyHousehold, SCHEMA_VERSION } from './defaults';

/**
 * Combines two copies of the plan edited on different devices.
 * Household and settings: the most recently edited copy wins as a whole.
 * Scenarios: merged one by one, the most recently edited version wins; a deletion
 * wins over edits made before it.
 */
export function mergeDocuments(a: PlanDocument, b: PlanDocument): PlanDocument {
  const deleted: Record<string, number> = { ...a.deleted };
  for (const [id, t] of Object.entries(b.deleted)) deleted[id] = Math.max(deleted[id] ?? 0, t);

  const byId = new Map<string, Scenario>();
  const order: string[] = [];
  for (const s of [...a.scenarios, ...b.scenarios]) {
    const cur = byId.get(s.id);
    if (!cur) order.push(s.id);
    if (!cur || s.updatedAt > cur.updatedAt) byId.set(s.id, s);
  }
  const scenarios = order
    .map((id) => byId.get(id)!)
    .filter((s) => !(deleted[s.id] != null && deleted[s.id] >= s.updatedAt));

  return {
    schemaVersion: SCHEMA_VERSION,
    household: b.household.updatedAt > a.household.updatedAt ? b.household : a.household,
    settings: b.settings.updatedAt > a.settings.updatedAt ? b.settings : a.settings,
    scenarios,
    deleted,
  };
}

/** Fills in anything missing from older or hand-edited files. */
export function normalize(raw: unknown): PlanDocument {
  const d = (raw ?? {}) as Partial<PlanDocument>;
  const hh = { ...emptyHousehold(), ...(d.household ?? {}) };
  hh.allocation = { ...emptyHousehold().allocation, ...(d.household?.allocation ?? {}) };
  if (!d.household?.allocation?.cashAccountId && hh.accounts.length) {
    hh.allocation.cashAccountId = (hh.accounts.find((a) => a.kind === 'cash') ?? hh.accounts[0]).id;
  }
  const settings = { ...defaultSettings(), updatedAt: 0, ...(d.settings ?? {}) };
  const scenarios = (d.scenarios ?? []).map((s, i) => ({
    ...({ notes: '', excludedCommon: [], events: [], colorSlot: i % 8, updatedAt: 0 } as const),
    ...s,
  })) as PlanDocument['scenarios'];
  return { schemaVersion: SCHEMA_VERSION, household: hh, settings, scenarios, deleted: d.deleted ?? {} };
}

/** JSON with object keys sorted, so key order (which normalize() changes) doesn't count as a difference. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );
}

export function sameDocument(a: PlanDocument, b: PlanDocument): boolean {
  return stable(a) === stable(b);
}
