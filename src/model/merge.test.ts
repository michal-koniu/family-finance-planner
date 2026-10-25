import { describe, expect, it } from 'vitest';
import { exampleDocument } from './defaults';
import { mergeDocuments, normalize } from './merge';

describe('mergeDocuments', () => {
  it('keeps the newest version of each scenario and of the household', () => {
    const base = exampleDocument();
    const a = structuredClone(base);
    const b = structuredClone(base);
    a.scenarios[0] = { ...a.scenarios[0], name: 'edited on laptop', updatedAt: Date.now() + 200 };
    b.scenarios[1] = { ...b.scenarios[1], name: 'edited on phone', updatedAt: Date.now() + 300 };
    b.household = { ...b.household, rent: 5000, updatedAt: base.household.updatedAt + 10 };
    const m = mergeDocuments(a, b);
    expect(m.scenarios[0].name).toBe('edited on laptop');
    expect(m.scenarios[1].name).toBe('edited on phone');
    expect(m.household.rent).toBe(5000);
  });

  it('keeps scenarios added on either side and respects deletions', () => {
    const base = exampleDocument();
    const a = structuredClone(base);
    const b = structuredClone(base);
    a.scenarios.push({ ...a.scenarios[0], id: 'new-a', updatedAt: 5 });
    const gone = b.scenarios[2].id;
    b.scenarios = b.scenarios.filter((s) => s.id !== gone);
    b.deleted[gone] = Date.now() + 1000;
    const m = mergeDocuments(a, b);
    expect(m.scenarios.some((s) => s.id === 'new-a')).toBe(true);
    expect(m.scenarios.some((s) => s.id === gone)).toBe(false);
  });
});

describe('normalize', () => {
  it('fills defaults into a partial document', () => {
    const d = normalize({ scenarios: [{ id: 'x', name: 'X' }] });
    expect(d.settings.capitalGainsTaxRate).toBe(0.19);
    expect(d.scenarios[0].events).toEqual([]);
    expect(d.household.accounts.length).toBeGreaterThan(0);
  });
});

describe('example-data flag', () => {
  it('example data is flagged; merging with real data clears the flag', () => {
    const ex = exampleDocument();
    expect(ex.isExample).toBe(true);
    const real = { ...structuredClone(ex), isExample: false };
    expect(mergeDocuments(ex, real).isExample).toBe(false);
    expect(mergeDocuments(ex, structuredClone(ex)).isExample).toBe(true);
  });

  it('recognises example data saved before the flag existed', () => {
    const legacy = structuredClone(exampleDocument()) as Partial<ReturnType<typeof exampleDocument>>;
    delete legacy.isExample;
    expect(normalize(legacy).isExample).toBe(true);
    legacy.household!.people[0].netSalary = 15000;
    expect(normalize(legacy).isExample).toBe(false);
  });
});
