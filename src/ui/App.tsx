import { useEffect } from 'react';
import { LANGS, useI18n, type Lang } from '../i18n';
import { N_ } from '../i18n/mark';
import { usePref } from '../state/prefs';
import { useStore } from '../state/store';
import { ComparePage } from './ComparePage';
import { ErrorBoundary } from './ErrorBoundary';
import { HouseholdPage } from './HouseholdPage';
import { ScenariosPage } from './ScenariosPage';
import { SettingsPage } from './SettingsPage';

type Tab = 'compare' | 'scenarios' | 'household' | 'settings';
export type Theme = 'auto' | 'light' | 'dark';

const TABS: { id: Tab; label: string; ico: string }[] = [
  { id: 'compare', label: N_('Compare'), ico: '📈' },
  { id: 'scenarios', label: N_('Scenarios'), ico: '🔀' },
  { id: 'household', label: N_('Household'), ico: '🏠' },
  { id: 'settings', label: N_('Settings'), ico: '⚙︎' },
];

const THEME_ICON: Record<Theme, string> = { auto: '◐', light: '☀︎', dark: '☾' };
const THEME_LABEL: Record<Theme, string> = { auto: N_('Theme: automatic'), light: N_('Theme: light'), dark: N_('Theme: dark') };
const NEXT_THEME: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };

/** Applies the theme to <html data-theme>; "auto" follows the system setting. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = usePref<Theme>('theme', 'auto');
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', dark ? '#1a1a19' : '#fcfcfb');
  }, [theme]);
  return [theme, setTheme];
}

function SyncChip({ onClick }: { onClick: () => void }) {
  const { sync } = useStore();
  const { t } = useI18n();
  if (sync.state === 'off')
    return (
      <button type="button" className="sync" onClick={onClick} title={t('Data is only on this device')}>
        {t('This device only')}
      </button>
    );
  if (sync.state === 'error')
    return (
      <button type="button" className="sync error" onClick={onClick} title={t(sync.message)}>
        ⚠ {t('Not synced')}
      </button>
    );
  if (sync.state === 'saved')
    return (
      <button type="button" className="sync saved" onClick={onClick}>
        ✓ {t('Synced')}
      </button>
    );
  return (
    <button type="button" className="sync" onClick={onClick}>
      {t('Syncing…')}
    </button>
  );
}

export function App() {
  const [tab, setTab] = usePref<Tab>('tab', 'compare');
  const [theme, setTheme] = useTheme();
  const { t, lang, setLang } = useI18n();
  return (
    <div className="app">
      <header className="topbar">
        <h1>{t('Our Finances')}</h1>
        <nav className="tabs-top">
          {TABS.map((x) => (
            <button key={x.id} type="button" className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>
              {t(x.label)}
            </button>
          ))}
        </nav>
        <select className="lang-pick" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('Language')} title={t('Language')}>
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.short}
            </option>
          ))}
        </select>
        <button type="button" className="icon-btn" onClick={() => setTheme(NEXT_THEME[theme])} title={t(THEME_LABEL[theme])} aria-label={t(THEME_LABEL[theme])}>
          {THEME_ICON[theme]}
        </button>
        <SyncChip onClick={() => setTab('settings')} />
      </header>
      <main className="page">
        <ErrorBoundary key={tab}>
          {tab === 'compare' && <ComparePage onOpen={setTab} />}
          {tab === 'scenarios' && <ScenariosPage />}
          {tab === 'household' && <HouseholdPage />}
          {tab === 'settings' && <SettingsPage theme={theme} setTheme={setTheme} />}
        </ErrorBoundary>
      </main>
      <nav className="tabbar">
        {TABS.map((x) => (
          <button key={x.id} type="button" className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>
            <span className="ico" aria-hidden>
              {x.ico}
            </span>
            {t(x.label)}
          </button>
        ))}
      </nav>
    </div>
  );
}
