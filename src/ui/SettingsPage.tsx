import { useRef, useState } from 'react';
import type { Settings } from '../engine/types';
import { LANGS, useI18n, type Lang } from '../i18n';
import { emptyDocument, exampleDocument } from '../model/defaults';
import { normalize } from '../model/merge';
import { useStore } from '../state/store';
import type { SyncConfig } from '../sync/github';
import type { Theme } from './App';
import { N_ } from '../i18n/mark';
import { Check, ConfirmButton, Month, Num, removeAt, Seg, Text, updateAt } from './fields';

export function SettingsPage({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const { doc, updateSettings } = useStore();
  const { t, lang, setLang } = useI18n();
  const s = doc.settings;
  const set = (patch: Partial<Settings>) => updateSettings((x) => ({ ...x, ...patch }));

  return (
    <div>
      <section className="card stack">
        <div className="card-head">
          <h3>{t('Display')}</h3>
        </div>
        <div className="row">
          <span style={{ minWidth: 110 }}>{t('Language')}</span>
          <Seg value={lang} onChange={(l: Lang) => setLang(l)} options={LANGS.map((l) => ({ value: l.code, label: `${l.short} · ${l.name}` }))} />
        </div>
        <div className="row">
          <span style={{ minWidth: 110 }}>{t('Theme')}</span>
          <Seg
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'auto', label: `◐ ${t('Automatic')}` },
              { value: 'light', label: `☀︎ ${t('Light')}` },
              { value: 'dark', label: `☾ ${t('Dark')}` },
            ]}
          />
        </div>
        <small className="hint">{t('Saved on this device only. “Automatic” follows the phone or computer setting.')}</small>
      </section>

      <section className="card stack">
        <div className="card-head">
          <h3>{t('Assumptions')}</h3>
        </div>
        <div className="grid">
          <Month
            label={t('Plan starts')}
            value={s.startMonth}
            onChange={(startMonth) => startMonth && set({ startMonth })}
            hint={t('First simulated month. Move it forward when you update your numbers.')}
          />
          <Num label={t('Plan length')} suffix={t('yrs')} value={s.horizonYears} onChange={(v) => set({ horizonYears: Math.min(80, Math.max(1, Math.round(v))) })} />
          <Text label={t('Currency label')} value={s.currency} onChange={(currency) => set({ currency })} hint={t('Display only')} />
        </div>
        <div className="subcard">
          <Check label={<b>{t('Inflation')}</b>} checked={s.inflationEnabled} onChange={(inflationEnabled) => set({ inflationEnabled })} />
          <div className="grid" style={{ marginTop: 8 }}>
            <Num label={t('Yearly inflation')} kind="pct" value={s.inflationRate} onChange={(inflationRate) => set({ inflationRate })} />
          </div>
          <small className="hint">
            {t(
              "When on: prices rise by this much every year, compounded. Cash keeps its nominal amount and loses value; salaries, rent, living and kids' costs and property prices rise with it; loan installments stay fixed so they weigh less over time. Investment returns you enter are nominal.",
            )}
          </small>
        </div>
        <div className="grid">
          <Num
            label={t('Tax on investment gains & interest')}
            kind="pct"
            value={s.capitalGainsTaxRate}
            onChange={(capitalGainsTaxRate) => set({ capitalGainsTaxRate })}
            hint={t('Belka tax')}
          />
          <Num label={t('Tax on property sale gain')} kind="pct" value={s.propertyGainTaxRate} onChange={(propertyGainTaxRate) => set({ propertyGainTaxRate })} />
          <Num
            label={t('Property gain tax-free after')}
            suffix={t('yrs')}
            value={s.propertyExemptionYears}
            onChange={(v) => set({ propertyExemptionYears: Math.max(0, Math.round(v)) })}
            hint={t('Full calendar years after the purchase year')}
          />
          <Num
            label={t('Default property purchase costs')}
            kind="pct"
            value={s.propertyBuyCostPct}
            onChange={(propertyBuyCostPct) => set({ propertyBuyCostPct })}
            hint={t('PCC 2%, notary, agency')}
          />
          <Num
            label={t('Property selling costs')}
            kind="pct"
            value={s.propertySellCostPct}
            onChange={(propertySellCostPct) => set({ propertySellCostPct })}
            hint={t('Used for “after tax” net worth too')}
          />
        </div>
      </section>

      <section className="card stack">
        <div className="card-head">
          <h3>{t('Kids')}</h3>
        </div>
        <small className="hint">{t("Monthly cost per child by age, in today's money (food, clothes, nursery, school, activities…).")}</small>
        {s.kidCostBands.map((b, i) => (
          <div className="list-row" key={i}>
            <Num label={t('From age')} value={b.fromAge} onChange={(fromAge) => set({ kidCostBands: updateAt(s.kidCostBands, i, { ...b, fromAge: Math.round(fromAge) }) })} />
            <Num label={t('To age (excl.)')} value={b.toAge} onChange={(toAge) => set({ kidCostBands: updateAt(s.kidCostBands, i, { ...b, toAge: Math.round(toAge) }) })} />
            <Num label={t('Per month')} kind="money" value={b.monthly} onChange={(monthly) => set({ kidCostBands: updateAt(s.kidCostBands, i, { ...b, monthly }) })} />
            <button type="button" className="btn small ghost" onClick={() => set({ kidCostBands: removeAt(s.kidCostBands, i) })}>
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn small"
          onClick={() => {
            const last = s.kidCostBands[s.kidCostBands.length - 1];
            set({ kidCostBands: [...s.kidCostBands, { fromAge: last?.toAge ?? 0, toAge: (last?.toAge ?? 0) + 5, monthly: last?.monthly ?? 2000 }] });
          }}
        >
          {t('+ Add age band')}
        </button>
        <div className="grid">
          <Num label={t('Child benefit / month (until 18)')} kind="money" value={s.childBenefit} onChange={(childBenefit) => set({ childBenefit })} hint="800+" />
        </div>
        <Check label={t('Child benefit rises with inflation')} checked={s.childBenefitIndexed} onChange={(childBenefitIndexed) => set({ childBenefitIndexed })} />
      </section>

      <SyncSettings />
      <DataSettings />
      <HowItWorks />
    </div>
  );
}

function SyncSettings() {
  const { syncConfig, setSyncConfig, sync, syncNow } = useStore();
  const { t } = useI18n();
  const [draft, setDraft] = useState<SyncConfig>(syncConfig ?? { owner: '', repo: 'finance-data', branch: 'main', path: 'plan.json', token: '' });
  const set = (patch: Partial<SyncConfig>) => setDraft((d) => ({ ...d, ...patch }));
  const ready = draft.owner.trim() && draft.repo.trim() && draft.token.trim();
  const clean = (): SyncConfig => ({
    owner: draft.owner.trim(),
    repo: draft.repo.trim(),
    branch: draft.branch.trim() || 'main',
    path: draft.path.trim() || 'plan.json',
    token: draft.token.trim(),
  });

  return (
    <section className="card stack">
      <div className="card-head">
        <h3>{t('Sync between our devices (GitHub)')}</h3>
      </div>
      <small className="hint">
        {t(
          'Your plan is saved as a file in a private GitHub repository, so you both see the same data on every device. The access key stays only in this browser. See docs/SETUP.md for how to create the repository and the key.',
        )}
      </small>
      <div className="grid">
        <Text label={t('GitHub user / organisation')} value={draft.owner} onChange={(owner) => set({ owner })} placeholder="your-github-name" />
        <Text label={t('Private data repository')} value={draft.repo} onChange={(repo) => set({ repo })} />
        <Text label={t('Branch')} value={draft.branch} onChange={(branch) => set({ branch })} />
        <Text label={t('File')} value={draft.path} onChange={(path) => set({ path })} />
        <Text label={t('Access key (token)')} type="password" value={draft.token} onChange={(token) => set({ token })} placeholder="github_pat_…" />
      </div>
      {syncConfig ? (
        <>
          <p>
            {t('Status:')}{' '}
            <b>
              {sync.state === 'saved' && t('synced at {time}', { time: new Date(sync.at).toLocaleTimeString() })}
              {sync.state === 'syncing' && t('syncing…')}
              {sync.state === 'pending' && t('waiting to sync')}
              {sync.state === 'error' && <span style={{ color: 'var(--critical)' }}>{t(sync.message)}</span>}
            </b>
          </p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => void syncNow()}>
              {t('Sync now')}
            </button>
            <button type="button" className="btn" disabled={!ready} onClick={() => setSyncConfig(clean())}>
              {t('Save changed settings')}
            </button>
            <ConfirmButton onConfirm={() => setSyncConfig(null)}>{t('Disconnect this device')}</ConfirmButton>
          </div>
        </>
      ) : (
        <div className="row">
          <button type="button" className="btn primary" disabled={!ready} onClick={() => setSyncConfig(clean(), true)}>
            {t('Connect — use the data already on GitHub')}
          </button>
          <button type="button" className="btn" disabled={!ready} onClick={() => setSyncConfig(clean(), false)}>
            {t('Connect — merge this device’s data in')}
          </button>
        </div>
      )}
      <small className="hint">{t('First device: either button creates the file. Next devices (e.g. the phones): use “use the data already on GitHub”.')}</small>
    </section>
  );
}

function DataSettings() {
  const { doc, replaceDocument } = useStore();
  const { t } = useI18n();
  const tr = (k: string) => t(k);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  const download = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finance-plan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="card stack">
      <div className="card-head">
        <h3>{t('Data')}</h3>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={download}>
          {t('Download backup (JSON)')}
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          {t('Restore from file…')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              replaceDocument(normalize(JSON.parse(await f.text())));
              setMsg(t('Restored.'));
            } catch {
              setMsg(t('That file could not be read.'));
            }
            e.target.value = '';
          }}
        />
      </div>
      <div className="row">
        <ConfirmButton onConfirm={() => replaceDocument(exampleDocument(tr))}>{t('Replace everything with example data')}</ConfirmButton>
        <ConfirmButton onConfirm={() => replaceDocument(emptyDocument(tr))}>{t('Start from scratch')}</ConfirmButton>
      </div>
      {msg && <p>{msg}</p>}
    </section>
  );
}

const HOW_IT_WORKS = [
  N_('The plan runs month by month from the start month. Values you enter describe the end of the month before.'),
  N_('Each month: events happen first (purchases, sales, retirement…), then investments grow at their yearly return converted to a monthly rate ((1+r)^(1/12)), then income comes in and bills are paid from the current account.'),
  N_('Everything in the current account above the buffer is invested by your savings split. If the current account goes below zero, investments are sold (withdrawal order first, then the rest), with capital gains tax paid on the gain part.'),
  N_('Capital gains tax is charged on (sale value − fees − proportional purchase price) at the moment of sale. Deposit interest is taxed every month. Losses don’t create tax refunds.'),
  N_('Loans: interest is balance × rate / 12 each month. Equal installments use the standard annuity formula; a rate change recalculates the installment over the remaining term (as banks do for variable rates).'),
  N_('Inflation: price level after n months is (1+X)^(n/12). “Today’s money” divides every amount by that, so it shows what future money would buy today.'),
  N_('Net worth = savings + investments + property value + things − debts. “After tax” also subtracts the tax you’d pay on unrealised gains and the costs and tax of selling property right now.'),
  N_('Income is entered after tax; the planner never calculates income tax.'),
];

function HowItWorks() {
  const { t } = useI18n();
  return (
    <section className="card prose">
      <details className="help">
        <summary>{t('How the calculations work')}</summary>
        <ul>
          {HOW_IT_WORKS.map((x) => (
            <li key={x}>{t(x)}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

