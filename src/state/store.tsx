import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Household, PlanDocument, Scenario, Settings } from '../engine/types';
import { exampleDocument } from '../model/defaults';
import { normalize, sameDocument } from '../model/merge';
import { deviceName, loadSyncConfig, pull, push, saveSyncConfig, type SyncConfig } from '../sync/github';
import { syncOnce } from '../sync/syncOnce';

const LOCAL_KEY = 'ffp.doc';

export type SyncState =
  | { state: 'off' }
  | { state: 'syncing' }
  | { state: 'saved'; at: number }
  | { state: 'pending' }
  | { state: 'error'; message: string };

interface Store {
  doc: PlanDocument;
  updateHousehold: (fn: (h: Household) => Household) => void;
  updateSettings: (fn: (s: Settings) => Settings) => void;
  updateScenario: (id: string, fn: (s: Scenario) => Scenario) => void;
  addScenario: (s: Scenario) => void;
  deleteScenario: (id: string) => void;
  replaceDocument: (d: PlanDocument) => void;
  sync: SyncState;
  syncConfig: SyncConfig | null;
  /** `preferRemote`: this device's data is replaced by the GitHub copy if one exists. */
  setSyncConfig: (c: SyncConfig | null, preferRemote?: boolean) => void;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

function loadLocal(): PlanDocument | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function saveLocal(d: PlanDocument): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
  } catch {
    /* private mode / quota – GitHub sync still works */
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<PlanDocument>(() => loadLocal() ?? exampleDocument());
  const [syncConfig, setSyncConfigState] = useState<SyncConfig | null>(() => loadSyncConfig());
  const [sync, setSync] = useState<SyncState>(() => (loadSyncConfig() ? { state: 'pending' } : { state: 'off' }));

  const docRef = useRef(doc);
  docRef.current = doc;
  const configRef = useRef(syncConfig);
  configRef.current = syncConfig;
  const editVersion = useRef(0); // bumps on every local edit
  const pushedVersion = useRef(0); // edit version that's safely on GitHub
  // True while this device has never been edited nor synced: the GitHub copy then wins outright,
  // so a new phone never pushes example data over the real plan.
  const pristine = useRef(loadLocal() == null);
  const busy = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const syncNow = useCallback(async () => {
    const c = configRef.current;
    if (!c) return;
    if (busy.current) {
      schedule(1500);
      return;
    }
    busy.current = true;
    setSync({ state: 'syncing' });
    const startVersion = editVersion.current;
    try {
      const merged = await syncOnce(
        { pull: () => pull(c), push: (d, sha) => push(c, d, sha, deviceName()) },
        docRef.current,
        pristine.current,
      );
      // Show what the other device changed, unless the user typed something meanwhile.
      if (editVersion.current === startVersion && !sameDocument(merged, docRef.current)) setDoc(merged);
      pushedVersion.current = startVersion;
      pristine.current = false;
      setSync(editVersion.current === startVersion ? { state: 'saved', at: Date.now() } : { state: 'pending' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setSync({ state: 'error', message: navigator.onLine ? message : 'Offline — changes are kept on this device and will sync later.' });
    } finally {
      busy.current = false;
      if (editVersion.current !== pushedVersion.current) schedule(2500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function schedule(ms: number) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void syncNow(), ms);
  }

  // Persist locally on every change; push to GitHub shortly after the last edit.
  useEffect(() => {
    saveLocal(doc);
    if (configRef.current && editVersion.current !== pushedVersion.current) {
      setSync((s) => (s.state === 'syncing' ? s : { state: 'pending' }));
      schedule(2500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Pull when the app starts, comes back to the foreground, or every 2 minutes.
  useEffect(() => {
    if (!syncConfig) return;
    void syncNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    const iv = window.setInterval(() => {
      if (document.visibilityState === 'visible') void syncNow();
    }, 120_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      window.clearInterval(iv);
    };
  }, [syncConfig, syncNow]);

  const edit = useCallback((fn: (d: PlanDocument) => PlanDocument) => {
    editVersion.current += 1;
    pristine.current = false;
    setDoc(fn);
  }, []);

  const store = useMemo<Store>(
    () => ({
      doc,
      updateHousehold: (fn) => edit((d) => ({ ...d, household: { ...fn(d.household), updatedAt: Date.now() } })),
      updateSettings: (fn) => edit((d) => ({ ...d, settings: { ...fn(d.settings), updatedAt: Date.now() } })),
      updateScenario: (id, fn) =>
        edit((d) => ({ ...d, scenarios: d.scenarios.map((s) => (s.id === id ? { ...fn(s), updatedAt: Date.now() } : s)) })),
      addScenario: (s) => edit((d) => ({ ...d, scenarios: [...d.scenarios, { ...s, updatedAt: Date.now() }] })),
      deleteScenario: (id) =>
        edit((d) => ({ ...d, scenarios: d.scenarios.filter((s) => s.id !== id), deleted: { ...d.deleted, [id]: Date.now() } })),
      replaceDocument: (nd) => {
        const now = Date.now();
        const deleted = { ...doc.deleted };
        for (const s of doc.scenarios) if (!nd.scenarios.some((x) => x.id === s.id)) deleted[s.id] = now;
        edit(() => ({
          ...nd,
          household: { ...nd.household, updatedAt: now },
          settings: { ...nd.settings, updatedAt: now },
          scenarios: nd.scenarios.map((s) => ({ ...s, updatedAt: now })),
          deleted,
        }));
      },
      sync,
      syncConfig,
      setSyncConfig: (c, preferRemote = false) => {
        if (preferRemote) pristine.current = true;
        saveSyncConfig(c);
        setSyncConfigState(c);
        setSync(c ? { state: 'pending' } : { state: 'off' });
      },
      syncNow,
    }),
    [doc, sync, syncConfig, edit, syncNow],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

// Per-device view preferences (which scenarios are compared, money view…).
export function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`ffp.pref.${key}`);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (nv: T) => {
      setV(nv);
      try {
        localStorage.setItem(`ffp.pref.${key}`, JSON.stringify(nv));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [v, set];
}
