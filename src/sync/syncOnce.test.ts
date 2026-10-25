import { describe, expect, it } from 'vitest';
import type { PlanDocument } from '../engine/types';
import { emptyDocument, exampleDocument } from '../model/defaults';
import { SyncError } from './github';
import { syncOnce, type Remote } from './syncOnce';

/** In-memory stand-in for the GitHub file with sha-based optimistic locking. */
function fakeRemote(initial: PlanDocument | null) {
  let stored: string | null = initial ? JSON.stringify(initial) : null;
  let version = 0;
  let pushes = 0;
  let interfere: (() => void) | null = null;
  const remote: Remote = {
    pull: async () => (stored ? { doc: JSON.parse(stored), sha: `v${version}` } : null),
    push: async (doc, sha) => {
      if (interfere) {
        const f = interfere;
        interfere = null;
        f();
      }
      if ((stored ? `v${version}` : null) !== sha) throw new SyncError('conflict', 409);
      stored = JSON.stringify(doc);
      version++;
      pushes++;
      return `v${version}`;
    },
  };
  return {
    remote,
    get doc(): PlanDocument | null {
      return stored ? JSON.parse(stored) : null;
    },
    set(d: PlanDocument) {
      stored = JSON.stringify(d);
      version++;
    },
    get pushes() {
      return pushes;
    },
    interfereOnce(f: () => void) {
      interfere = f;
    },
  };
}

describe('syncOnce', () => {
  it('creates the file on first sync', async () => {
    const r = fakeRemote(null);
    const local = exampleDocument();
    await syncOnce(r.remote, local, false);
    expect(r.doc?.scenarios.length).toBe(local.scenarios.length);
  });

  it('a new device takes the GitHub copy and never uploads its example data', async () => {
    const real = emptyDocument();
    real.scenarios[0].name = 'Our real plan';
    const r = fakeRemote(real);
    const result = await syncOnce(r.remote, exampleDocument(), true);
    expect(result.scenarios.map((s) => s.name)).toEqual(['Our real plan']);
    expect(r.pushes).toBe(0);
  });

  it('does not push when nothing changed', async () => {
    const d = exampleDocument();
    const r = fakeRemote(d);
    await syncOnce(r.remote, structuredClone(d), false);
    expect(r.pushes).toBe(0);
  });

  it('merges edits from two devices and keeps both', async () => {
    const base = exampleDocument();
    const r = fakeRemote(base);
    const laptop = structuredClone(base);
    laptop.scenarios[0] = { ...laptop.scenarios[0], name: 'Laptop edit', updatedAt: Date.now() + 1000 };
    // phone saved something meanwhile
    const phone = structuredClone(base);
    phone.scenarios[1] = { ...phone.scenarios[1], name: 'Phone edit', updatedAt: Date.now() + 2000 };
    r.set(phone);
    const result = await syncOnce(r.remote, laptop, false);
    expect(result.scenarios[0].name).toBe('Laptop edit');
    expect(result.scenarios[1].name).toBe('Phone edit');
    expect(r.doc?.scenarios[0].name).toBe('Laptop edit');
    expect(r.doc?.scenarios[1].name).toBe('Phone edit');
  });

  it('retries when another device saves between our pull and push', async () => {
    const base = exampleDocument();
    const r = fakeRemote(base);
    const laptop = structuredClone(base);
    laptop.scenarios[0] = { ...laptop.scenarios[0], name: 'Laptop edit', updatedAt: Date.now() + 1000 };
    r.interfereOnce(() => {
      const phone = structuredClone(base);
      phone.scenarios[2] = { ...phone.scenarios[2], name: 'Phone edit', updatedAt: Date.now() + 2000 };
      r.set(phone);
    });
    await syncOnce(r.remote, laptop, false);
    expect(r.doc?.scenarios[0].name).toBe('Laptop edit');
    expect(r.doc?.scenarios[2].name).toBe('Phone edit');
  });
});
