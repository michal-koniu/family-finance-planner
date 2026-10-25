import { usePref, useStore } from '../state/store';
import { ComparePage } from './ComparePage';
import { ErrorBoundary } from './ErrorBoundary';
import { HouseholdPage } from './HouseholdPage';
import { ScenariosPage } from './ScenariosPage';
import { SettingsPage } from './SettingsPage';

type Tab = 'compare' | 'scenarios' | 'household' | 'settings';

const TABS: { id: Tab; label: string; ico: string }[] = [
  { id: 'compare', label: 'Compare', ico: '📈' },
  { id: 'scenarios', label: 'Scenarios', ico: '🔀' },
  { id: 'household', label: 'Household', ico: '🏠' },
  { id: 'settings', label: 'Settings', ico: '⚙︎' },
];

function SyncChip({ onClick }: { onClick: () => void }) {
  const { sync } = useStore();
  if (sync.state === 'off')
    return (
      <button type="button" className="sync" onClick={onClick} title="Data is only on this device">
        This device only
      </button>
    );
  if (sync.state === 'error')
    return (
      <button type="button" className="sync error" onClick={onClick} title={sync.message}>
        ⚠ Not synced
      </button>
    );
  if (sync.state === 'saved')
    return (
      <button type="button" className="sync saved" onClick={onClick}>
        ✓ Synced
      </button>
    );
  return (
    <button type="button" className="sync" onClick={onClick}>
      Syncing…
    </button>
  );
}

export function App() {
  const [tab, setTab] = usePref<Tab>('tab', 'compare');
  return (
    <div className="app">
      <header className="topbar">
        <h1>Our Finances</h1>
        <nav className="tabs-top">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <SyncChip onClick={() => setTab('settings')} />
      </header>
      <main className="page">
        <ErrorBoundary key={tab}>
          {tab === 'compare' && <ComparePage />}
          {tab === 'scenarios' && <ScenariosPage />}
          {tab === 'household' && <HouseholdPage />}
          {tab === 'settings' && <SettingsPage />}
        </ErrorBoundary>
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="ico" aria-hidden>
              {t.ico}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
