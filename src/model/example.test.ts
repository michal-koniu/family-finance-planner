import { describe, expect, it } from 'vitest';
import { simulate } from '../engine/simulate';
import { exampleDocument } from './defaults';

describe('example data', () => {
  it('every example scenario simulates to finite numbers', () => {
    const d = exampleDocument();
    for (const sc of d.scenarios) {
      const r = simulate({ household: d.household, settings: d.settings, scenario: sc });
      expect(r.months).toHaveLength(d.settings.horizonYears * 12 + 1);
      for (const m of r.months) expect(Number.isFinite(m.netWorth)).toBe(true);
      if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SHOW_EXAMPLE) {
        const pick = (y: number) => Math.round(r.months[y * 12].netWorth / r.months[y * 12].cpi / 1000);
        console.log(sc.name.padEnd(36), [0, 5, 10, 20, 30, 40].map((y) => `${y}y:${pick(y)}k`).join(' '), r.warnings);
      }
    }
  });
});
