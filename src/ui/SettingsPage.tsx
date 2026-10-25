import { useRef, useState } from 'react';
import type { Settings } from '../engine/types';
import { emptyDocument, exampleDocument } from '../model/defaults';
import { normalize } from '../model/merge';
import { useStore } from '../state/store';
import type { SyncConfig } from '../sync/github';
import { Check, ConfirmButton, Month, Num, removeAt, Text, updateAt } from './fields';

export function SettingsPage() {
  const { doc, updateSettings } = useStore();
  const s = doc.settings;
  const set = (patch: Partial<Settings>) => updateSettings((x) => ({ ...x, ...patch }));

  return (
    <div>
      <section className="card stack">
        <div className="card-head">
          <h3>Assumptions</h3>
        </div>
        <div className="grid">
          <Month label="Plan starts" value={s.startMonth} onChange={(startMonth) => startMonth && set({ startMonth })} hint="First simulated month. Move it forward when you update your numbers." />
          <Num label="Plan length" suffix="yrs" value={s.horizonYears} onChange={(v) => set({ horizonYears: Math.min(80, Math.max(1, Math.round(v))) })} />
          <Text label="Currency label" value={s.currency} onChange={(currency) => set({ currency })} hint="Display only" />
        </div>
        <div className="subcard">
          <Check label={<b>Inflation</b>} checked={s.inflationEnabled} onChange={(inflationEnabled) => set({ inflationEnabled })} />
          <div className="grid" style={{ marginTop: 8 }}>
            <Num label="Yearly inflation" kind="pct" value={s.inflationRate} onChange={(inflationRate) => set({ inflationRate })} />
          </div>
          <small className="hint">
            When on: prices rise by this much every year, compounded. Cash keeps its nominal amount and loses value; salaries, rent,
            living and kids' costs and property prices rise with it; loan installments stay fixed so they weigh less over time.
            Investment returns you enter are nominal.
          </small>
        </div>
        <div className="grid">
          <Num label="Tax on investment gains & interest" kind="pct" value={s.capitalGainsTaxRate} onChange={(capitalGainsTaxRate) => set({ capitalGainsTaxRate })} hint="Belka tax" />
          <Num label="Tax on property sale gain" kind="pct" value={s.propertyGainTaxRate} onChange={(propertyGainTaxRate) => set({ propertyGainTaxRate })} />
          <Num
            label="Property gain tax-free after"
            suffix="yrs"
            value={s.propertyExemptionYears}
            onChange={(v) => set({ propertyExemptionYears: Math.max(0, Math.round(v)) })}
            hint="Full calendar years after the purchase year"
          />
          <Num label="Default property purchase costs" kind="pct" value={s.propertyBuyCostPct} onChange={(propertyBuyCostPct) => set({ propertyBuyCostPct })} hint="PCC 2%, notary, agency" />
          <Num label="Property selling costs" kind="pct" value={s.propertySellCostPct} onChange={(propertySellCostPct) => set({ propertySellCostPct })} hint="Used for “after tax” net worth too" />
        </div>
      </section>

      <section className="card stack">
        <div className="card-head">
          <h3>Kids</h3>
        </div>
        <small className="hint">Monthly cost per child by age, in today's money (food, clothes, nursery, school, activities…).</small>
        {s.kidCostBands.map((b, i) => (
          <div className="list-row" key={i}>
            <Num label="From age" value={b.fromAge} onChange={(fromAge) => set({ kidCostBands: updateAt(s.kidCostBands, i, { ...b, fromAge: Math.round(fromAge) }) })} />
            <Num label="To age (excl.)" value={b.toAge} onChange={(toAge) => set({ kidCostBands: updateAt(s.kidCostBands, i, { ...b, toAge: Math.round(toAge) }) })} />
            <Num label="Per month" kind="money" value={b.monthly} onChange={(monthly) => set({ kidCostBands: updateAt(s.kidCostBands, i, { ...b, monthly }) })} />
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
          + Add age band
        </button>
        <div className="grid">
          <Num label="Child benefit / month (until 18)" kind="money" value={s.childBenefit} onChange={(childBenefit) => set({ childBenefit })} hint="800+" />
        </div>
        <Check label="Child benefit rises with inflation" checked={s.childBenefitIndexed} onChange={(childBenefitIndexed) => set({ childBenefitIndexed })} />
      </section>

      <SyncSettings />
      <DataSettings />
      <HowItWorks />
    </div>
  );
}

function SyncSettings() {
  const { syncConfig, setSyncConfig, sync, syncNow } = useStore();
  const [draft, setDraft] = useState<SyncConfig>(
    syncConfig ?? { owner: '', repo: 'finance-data', branch: 'main', path: 'plan.json', token: '' },
  );
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
        <h3>Sync between our devices (GitHub)</h3>
      </div>
      <small className="hint">
        Your plan is saved as a file in a <b>private</b> GitHub repository, so you both see the same data on every device. The access
        key stays only in this browser. See docs/SETUP.md for how to create the repository and the key.
      </small>
      <div className="grid">
        <Text label="GitHub user / organisation" value={draft.owner} onChange={(owner) => set({ owner })} placeholder="your-github-name" />
        <Text label="Private data repository" value={draft.repo} onChange={(repo) => set({ repo })} />
        <Text label="Branch" value={draft.branch} onChange={(branch) => set({ branch })} />
        <Text label="File" value={draft.path} onChange={(path) => set({ path })} />
        <Text label="Access key (token)" type="password" value={draft.token} onChange={(token) => set({ token })} placeholder="github_pat_…" />
      </div>
      {syncConfig ? (
        <>
          <p>
            Status:{' '}
            <b>
              {sync.state === 'saved' && `synced at ${new Date(sync.at).toLocaleTimeString()}`}
              {sync.state === 'syncing' && 'syncing…'}
              {sync.state === 'pending' && 'waiting to sync'}
              {sync.state === 'error' && <span style={{ color: 'var(--critical)' }}>{sync.message}</span>}
            </b>
          </p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => void syncNow()}>
              Sync now
            </button>
            <button type="button" className="btn" disabled={!ready} onClick={() => setSyncConfig(clean())}>
              Save changed settings
            </button>
            <ConfirmButton onConfirm={() => setSyncConfig(null)}>Disconnect this device</ConfirmButton>
          </div>
        </>
      ) : (
        <div className="row">
          <button type="button" className="btn primary" disabled={!ready} onClick={() => setSyncConfig(clean(), true)}>
            Connect — use the data already on GitHub
          </button>
          <button type="button" className="btn" disabled={!ready} onClick={() => setSyncConfig(clean(), false)}>
            Connect — merge this device's data in
          </button>
        </div>
      )}
      <small className="hint">
        First device: either button creates the file. Second device (e.g. the other phone): use “use the data already on GitHub”.
      </small>
    </section>
  );
}

function DataSettings() {
  const { doc, replaceDocument } = useStore();
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
        <h3>Data</h3>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={download}>
          Download backup (JSON)
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Restore from file…
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
              setMsg('Restored.');
            } catch {
              setMsg('That file could not be read.');
            }
            e.target.value = '';
          }}
        />
      </div>
      <div className="row">
        <ConfirmButton onConfirm={() => replaceDocument(exampleDocument())}>Replace everything with example data</ConfirmButton>
        <ConfirmButton onConfirm={() => replaceDocument(emptyDocument())}>Start from scratch</ConfirmButton>
      </div>
      {msg && <p>{msg}</p>}
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="card prose">
      <details className="help">
        <summary>How the calculations work</summary>
        <ul>
          <li>The plan runs month by month from the start month. Values you enter describe the end of the month before.</li>
          <li>
            Each month: events happen first (purchases, sales, retirement…), then investments grow at their yearly return converted
            to a monthly rate ((1+r)^(1/12)), then income comes in and bills are paid from the current account.
          </li>
          <li>
            Everything in the current account above the buffer is invested by your savings split. If the current account goes
            below zero, investments are sold (withdrawal order first, then the rest), with capital gains tax paid on the gain part.
          </li>
          <li>
            Capital gains tax is charged on (sale value − fees − proportional purchase price) at the moment of sale. Deposit
            interest is taxed every month. Losses don't create tax refunds.
          </li>
          <li>
            Loans: interest is balance × rate / 12 each month. Equal installments use the standard annuity formula; a rate change
            recalculates the installment over the remaining term (as banks do for variable rates).
          </li>
          <li>
            Inflation: price level after n months is (1+X)^(n/12). “Today's money” divides every amount by that, so it shows what
            future money would buy today.
          </li>
          <li>
            Net worth = savings + investments + property value + things − debts. “After tax” also subtracts the tax you'd pay on
            unrealised gains and the costs and tax of selling property right now.
          </li>
          <li>Income is entered after tax; the planner never calculates income tax.</li>
        </ul>
      </details>
    </section>
  );
}
