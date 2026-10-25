import { useState, type ReactNode } from 'react';
import { milestones, totalsUpTo, type MoneyView, type WorthBasis } from '../engine/metrics';
import type { Household, MonthSnapshot } from '../engine/types';
import { useI18n } from '../i18n';
import type { CompareRun } from './ComparePage';
import { Seg, Select } from './fields';
import { money, seriesColor } from './format';

type Best = 'max' | 'min' | undefined;
type RowSpec =
  | { group: string }
  | { label: string; values: (number | null)[]; best?: Best; total?: boolean; neg?: boolean };

function ScenarioHeader({ runs }: { runs: CompareRun[] }) {
  return (
    <>
      {runs.map((r) => (
        <th key={r.scenario.id}>
          <span className="th-scn">
            <span className="swatch line" style={{ background: seriesColor(r.scenario.colorSlot) }} />
            {r.scenario.name}
          </span>
        </th>
      ))}
    </>
  );
}

function bestIndex(values: (number | null)[], best: Best): number {
  if (!best || values.filter((v) => v != null).length < 2) return -1;
  let idx = -1;
  values.forEach((v, i) => {
    if (v == null) return;
    if (idx === -1 || (best === 'max' ? v > values[idx]! + 0.5 : v < values[idx]! - 0.5)) idx = i;
  });
  // no highlight when all equal
  const vals = values.filter((v): v is number => v != null);
  if (Math.max(...vals) - Math.min(...vals) < 1) return -1;
  return idx;
}

function Rows({ rows, cols }: { rows: RowSpec[]; cols: number }) {
  return (
    <>
      {rows.map((r, k) => {
        if ('group' in r)
          return (
            <tr key={k} className="group">
              <td colSpan={cols + 1}>{r.group}</td>
            </tr>
          );
        const b = bestIndex(r.values, r.best);
        return (
          <tr key={k} className={r.total ? 'total' : ''}>
            <td className="indent">{r.label}</td>
            {r.values.map((v, i) => (
              <td key={i} className={`${i === b ? 'best' : ''} ${v != null && v < -0.5 ? 'neg' : ''}`}>
                {v == null ? '—' : money(r.neg ? -v : v)}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}

function unionKeys(snaps: (MonthSnapshot | undefined)[], pick: (s: MonthSnapshot) => Record<string, number>): string[] {
  const keys: string[] = [];
  for (const s of snaps) if (s) for (const k of Object.keys(pick(s))) if (!keys.includes(k)) keys.push(k);
  return keys;
}

// ---------------------------------------------------------------------------

export function MomentDetails({ runs, index, view }: { runs: CompareRun[]; index: number; view: MoneyView }) {
  const { t, label: tl, month } = useI18n();
  const snaps = runs.map((r) => r.result.months[index]);
  const conv = (v: number | undefined, s: MonthSnapshot | undefined) => (s == null || v == null ? null : view === 'real' ? v / s.cpi : v);
  const label = (id: string) => {
    for (const r of runs) if (r.result.labels[id]) return tl(r.result.labels[id]);
    return id;
  };
  const rows: RowSpec[] = [];
  const section = (title: string, pick: (s: MonthSnapshot) => Record<string, number>, opts: { best?: Best; neg?: boolean; labelFn?: (k: string) => string } = {}) => {
    const keys = unionKeys(snaps, pick);
    if (!keys.length) return;
    rows.push({ group: title });
    // Rows are keyed by name, so "Our flat" bought by different events in different scenarios lines up.
    const byLabel = new Map<string, string[]>();
    for (const k of keys) {
      const l = (opts.labelFn ?? label)(k);
      byLabel.set(l, [...(byLabel.get(l) ?? []), k]);
    }
    for (const [l, ids] of byLabel) {
      rows.push({
        label: l,
        values: snaps.map((s) => {
          if (!s) return null;
          const present = ids.filter((id) => pick(s)[id] != null);
          return present.length ? conv(present.reduce((a, id) => a + pick(s)[id], 0), s) : null;
        }),
        neg: opts.neg,
      });
    }
  };

  rows.push({ group: t('Net worth') });
  rows.push({ label: t('Net worth'), values: snaps.map((s) => conv(s?.netWorth, s)), best: 'max', total: true });
  rows.push({ label: t('After tax & selling costs'), values: snaps.map((s) => conv(s?.netWorthAfterTax, s)), best: 'max' });
  rows.push({ label: t('Savings & investments (liquid)'), values: snaps.map((s) => conv(s?.liquid, s)), best: 'max' });
  section(t('Savings & investments'), (s) => s.accounts);
  section(t('Property (market value)'), (s) => s.properties);
  section(t('Things'), (s) => s.goods);
  section(t('Debts left to repay'), (s) => s.loans, { neg: true });

  if (index > 0) {
    section(t('Income this month'), (s) => s.flows.income, { labelFn: tl });
    rows.push({ label: t('Total income'), values: snaps.map((s) => conv(s ? sumOf(s.flows.income) : undefined, s)), total: true });
    section(t('Costs this month'), (s) => s.flows.expense, { labelFn: tl, neg: true });
    rows.push({ label: t('Total costs'), values: snaps.map((s) => conv(s ? -sumOf(s.flows.expense) : undefined, s)), total: true });
    rows.push({ group: t('Result this month') });
    rows.push({ label: t('Income − costs'), values: snaps.map((s) => conv(s?.netCashFlow, s)), total: true });
    rows.push({ label: t('Own money paid at events (purchases, down payments…)'), values: snaps.map((s) => conv(s ? -s.eventOutflows : undefined, s)) });
    rows.push({ label: t('Extra loan repayments'), values: snaps.map((s) => conv(s ? -s.debtRepaid : undefined, s)) });
    rows.push({ label: t('Taxes paid (incl. on sales)'), values: snaps.map((s) => conv(s?.taxPaid, s)) });
    rows.push({ label: t('Loan interest paid'), values: snaps.map((s) => conv(s?.interestPaid, s)) });
    section(t('One-off costs at events this month'), (s) => s.eventCosts, { labelFn: tl });

    rows.push({ group: t('Totals from the start until now') });
    const tots = runs.map((r) => totalsUpTo(r.result, index, view));
    rows.push({ label: t('Taxes'), values: tots.map((x) => x.taxes), best: 'min' });
    rows.push({ label: t('Loan interest'), values: tots.map((x) => x.interest), best: 'min' });
    rows.push({ label: t('Rent'), values: tots.map((x) => x.rent), best: 'min' });
    rows.push({ label: t('One-off costs (purchase taxes, fees…)'), values: tots.map((x) => x.eventCosts), best: 'min' });
  }

  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>
        {view === 'real' ? t("All amounts in today's money.") : t('All amounts in money of that time (nominal).')} {t('State at the end of the month.')}
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>{index === 0 ? t('Now') : month(snaps.find(Boolean)?.date ?? '')}</th>
              <ScenarioHeader runs={runs} />
            </tr>
          </thead>
          <tbody>
            <Rows rows={rows} cols={runs.length} />
            <tr className="group">
              <td colSpan={runs.length + 1}>{t('What happened')}</td>
            </tr>
            <tr>
              <td className="indent">{t('This month')}</td>
              {snaps.map((s, i) => (
                <td key={i} className="wrap">
                  {s?.events.length ? s.events.map((e, k) => <div key={k}>• {t(e.k, e.p)}</div>) : <span className="muted">—</span>}
                </td>
              ))}
            </tr>
            <tr>
              <td className="indent">{t('Earlier')}</td>
              {runs.map((r, i) => {
                const past = r.result.months.slice(1, index).filter((s) => s.events.length).slice(-6);
                return (
                  <td key={i} className="wrap">
                    {past.length ? (
                      past.map((s) => (
                        <div key={s.index}>
                          <span className="muted">{month(s.date)}:</span> {s.events.map((e) => t(e.k, e.p)).join('; ')}
                        </div>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function sumOf(r: Record<string, number>): number {
  let s = 0;
  for (const k in r) s += r[k];
  return s;
}

// ---------------------------------------------------------------------------

export function MilestonesTable({ runs, household, view, basis, horizonYears }: {
  runs: CompareRun[];
  household: Household;
  view: MoneyView;
  basis: WorthBasis;
  horizonYears: number;
}) {
  const { t, month } = useI18n();
  const years = [1, 5, 10, 15, 20, 25, 30, 40, 50, 60].filter((y) => y < horizonYears);
  years.push(horizonYears);
  const ms = runs.map((r) => milestones(r.result, household, view, basis, years));
  const textRow = (label: string, cells: ReactNode[]) => (
    <tr key={label}>
      <td className="indent">{label}</td>
      {cells.map((c, i) => (
        <td key={i}>{c}</td>
      ))}
    </tr>
  );
  const rows: RowSpec[] = [{ group: basis === 'afterTax' ? t('Net worth after tax & selling costs') : t('Net worth') }];
  years.forEach((y, k) => rows.push({ label: t('In {years} years', { years: y }), values: ms.map((m) => m.netWorthAt[k].value), best: 'max', total: y === horizonYears }));
  if (basis === 'market') rows.push({ label: t('At the end, after tax & selling costs'), values: ms.map((m) => m.endAfterTax), best: 'max' });
  rows.push({ group: t('Safety') });
  rows.push({ label: t('Lowest savings & investments'), values: ms.map((m) => m.lowestLiquid.value), best: 'max' });
  const totalsRows: RowSpec[] = [
    { group: t('Paid over the whole plan') },
    { label: t('Taxes'), values: ms.map((m) => m.totals.taxes), best: 'min' },
    { label: t('Loan interest'), values: ms.map((m) => m.totals.interest), best: 'min' },
    { label: t('Rent'), values: ms.map((m) => m.totals.rent), best: 'min' },
    { label: t('One-off costs (purchase taxes, fees…)'), values: ms.map((m) => m.totals.eventCosts), best: 'min' },
  ];
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>{view === 'real' ? t("Today's money") : t('Future money')}</th>
            <ScenarioHeader runs={runs} />
          </tr>
        </thead>
        <tbody>
          <Rows rows={rows} cols={runs.length} />
          {textRow(t('…reached in'), ms.map((m) => (m.lowestLiquid.date ? month(m.lowestLiquid.date) : '—')))}
          {textRow(t('Money runs out'), ms.map((m) => (m.firstShortfall ? <span style={{ color: 'var(--critical)' }}>⚠ {month(m.firstShortfall)}</span> : t('never'))))}
          <tr className="group">
            <td colSpan={runs.length + 1}>{t('Retirement')}</td>
          </tr>
          {household.people.map((p) =>
            textRow(
              p.name,
              ms.map((m) => {
                const x = m.retirement.find((y) => y.personId === p.id);
                if (!x) return '—';
                return x.date ? t('{date} (age {age})', { date: x.date, age: x.age ?? '' }) : t('not within the plan');
              }),
            ),
          )}
          <Rows rows={totalsRows} cols={runs.length} />
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function FullTable({ runs, view, currency }: { runs: CompareRun[]; view: MoneyView; currency: string }) {
  const { t, label: tl, month } = useI18n();
  const [sid, setSid] = useState(runs[0].scenario.id);
  const [gran, setGran] = useState<'year' | 'month'>('year');
  const run = runs.find((r) => r.scenario.id === sid) ?? runs[0];
  const r = run.result;
  const months = r.months;

  const accountIds = unionKeys(months, (s) => s.accounts);
  const propIds = unionKeys(months, (s) => s.properties);
  const goodIds = unionKeys(months, (s) => s.goods);
  const loanIds = unionKeys(months, (s) => s.loans);
  const incomeKeys = unionKeys(months, (s) => s.flows.income);
  const expenseKeys = unionKeys(months, (s) => s.flows.expense);

  // Rows: every month, or every 12th month with flows summed over the year before it.
  const idx: number[] = [];
  for (let i = 0; i < months.length; i += gran === 'year' ? 12 : 1) idx.push(i);
  if (idx[idx.length - 1] !== months.length - 1) idx.push(months.length - 1);

  const k = (s: MonthSnapshot) => (view === 'real' ? 1 / s.cpi : 1);
  const period = (i: number, j: number) => {
    // months (prev, i]
    const from = j === 0 ? i : idx[j - 1] + 1;
    const p = { income: {} as Record<string, number>, expense: {} as Record<string, number>, tax: 0, interest: 0, net: 0, outflows: 0, repaid: 0, events: [] as string[] };
    for (let m = Math.max(1, from); m <= i; m++) {
      const s = months[m];
      const f = k(s);
      for (const key in s.flows.income) p.income[key] = (p.income[key] ?? 0) + s.flows.income[key] * f;
      for (const key in s.flows.expense) p.expense[key] = (p.expense[key] ?? 0) + s.flows.expense[key] * f;
      p.tax += s.taxPaid * f;
      p.interest += s.interestPaid * f;
      p.net += s.netCashFlow * f;
      p.outflows += s.eventOutflows * f;
      p.repaid += s.debtRepaid * f;
      for (const e of s.events) p.events.push(gran === 'year' ? `${month(s.date)}: ${t(e.k, e.p)}` : t(e.k, e.p));
    }
    return p;
  };

  const table = idx.map((i, j) => {
    const s = months[i];
    const f = k(s);
    const p = period(i, j);
    return {
      date: i === 0 ? t('Now') : month(s.date),
      netWorth: s.netWorth * f,
      afterTax: s.netWorthAfterTax * f,
      liquid: s.liquid * f,
      accounts: accountIds.map((id) => (s.accounts[id] ?? 0) * f),
      props: propIds.map((id) => (s.properties[id] ?? 0) * f),
      goods: goodIds.map((id) => (s.goods[id] ?? 0) * f),
      loans: loanIds.map((id) => (s.loans[id] ?? 0) * f),
      income: sumOf(p.income),
      expense: sumOf(p.expense),
      incomeItems: incomeKeys.map((key) => p.income[key] ?? 0),
      expenseItems: expenseKeys.map((key) => p.expense[key] ?? 0),
      net: p.net,
      outflows: p.outflows,
      repaid: p.repaid,
      tax: p.tax,
      interest: p.interest,
      events: p.events,
    };
  });

  const lbl = (id: string) => tl(r.labels[id] ?? id);

  const downloadCsv = () => {
    const head = [
      t('Date'),
      t('Net worth'),
      t('After tax'),
      t('Liquid'),
      ...accountIds.map(lbl),
      ...propIds.map(lbl),
      ...goodIds.map(lbl),
      ...loanIds.map((id) => t('Debt: {name}', { name: lbl(id) })),
      ...incomeKeys.map((x) => t('Income: {name}', { name: tl(x) })),
      ...expenseKeys.map((x) => t('Cost: {name}', { name: tl(x) })),
      t('Total income'),
      t('Total costs'),
      t('Income − costs'),
      t('Paid at events'),
      t('Extra loan repayments'),
      t('Taxes'),
      t('Loan interest'),
      t('Events'),
    ];
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const n = (v: number) => String(Math.round(v));
    const lines = [head.map(q).join(';')];
    for (const t of table) {
      lines.push(
        [
          q(t.date),
          n(t.netWorth),
          n(t.afterTax),
          n(t.liquid),
          ...t.accounts.map(n),
          ...t.props.map(n),
          ...t.goods.map(n),
          ...t.loans.map((v) => n(-v)),
          ...t.incomeItems.map(n),
          ...t.expenseItems.map((v) => n(-v)),
          n(t.income),
          n(-t.expense),
          n(t.net),
          n(-t.outflows),
          n(-t.repaid),
          n(t.tax),
          n(t.interest),
          q(t.events.join(' | ')),
        ].join(';'),
      );
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${run.scenario.name.replace(/[^\w-]+/g, '_')}-${gran}-${view === 'real' ? 'todays-money' : 'nominal'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <div style={{ minWidth: 220 }}>
          <Select label={t('Scenario')} value={run.scenario.id} onChange={setSid} options={runs.map((x) => ({ value: x.scenario.id, label: x.scenario.name }))} />
        </div>
        <Seg
          value={gran}
          onChange={setGran}
          options={[
            { value: 'year', label: t('Years') },
            { value: 'month', label: t('Months') },
          ]}
        />
        <button type="button" className="btn" onClick={downloadCsv}>
          ⬇ {t('CSV (Excel / Sheets)')}
        </button>
      </div>
      <small className="hint">
        {gran === 'year'
          ? t('Balances at the end of each year; income, costs, taxes and interest summed over the year.')
          : t('Balances at the end of each month; income, costs, taxes and interest for that month.')}{' '}
        {view === 'real' ? t("Today's money") : t('Nominal money')}, {currency}. {t('The CSV also lists every income and cost item.')}
      </small>
      <div className="table-wrap" style={{ maxHeight: '70vh' }}>
        <table className="data">
          <thead>
            <tr>
              <th>{gran === 'year' ? t('Year ending') : t('Month')}</th>
              <th>{t('Net worth')}</th>
              <th>{t('After tax')}</th>
              <th>{t('Liquid')}</th>
              {accountIds.map((id) => (
                <th key={id}>{lbl(id)}</th>
              ))}
              {propIds.map((id) => (
                <th key={id}>{lbl(id)}</th>
              ))}
              {goodIds.map((id) => (
                <th key={id}>{lbl(id)}</th>
              ))}
              {loanIds.map((id) => (
                <th key={id}>{lbl(id)}</th>
              ))}
              <th>{t('Income')}</th>
              <th>{t('Costs')}</th>
              <th>{t('Income − costs')}</th>
              <th>{t('Paid at events')}</th>
              <th>{t('Extra repayments')}</th>
              <th>{t('Taxes')}</th>
              <th>{t('Interest')}</th>
              <th style={{ textAlign: 'left' }}>{t('Events')}</th>
            </tr>
          </thead>
          <tbody>
            {table.map((t, j) => (
              <tr key={j}>
                <td>{t.date}</td>
                <td>
                  <b>{money(t.netWorth)}</b>
                </td>
                <td>{money(t.afterTax)}</td>
                <td>{money(t.liquid)}</td>
                {t.accounts.map((v, i) => (
                  <td key={`a${i}`}>{money(v)}</td>
                ))}
                {t.props.map((v, i) => (
                  <td key={`p${i}`}>{money(v)}</td>
                ))}
                {t.goods.map((v, i) => (
                  <td key={`g${i}`}>{money(v)}</td>
                ))}
                {t.loans.map((v, i) => (
                  <td key={`l${i}`} className={v > 0.5 ? 'neg' : ''}>
                    {v > 0.5 ? money(-v) : '—'}
                  </td>
                ))}
                <td>{money(t.income)}</td>
                <td>{money(-t.expense)}</td>
                <td className={t.net < -0.5 ? 'neg' : ''}>{money(t.net)}</td>
                <td>{t.outflows > 0.5 ? money(-t.outflows) : '—'}</td>
                <td>{t.repaid > 0.5 ? money(-t.repaid) : '—'}</td>
                <td>{money(t.tax)}</td>
                <td>{money(t.interest)}</td>
                <td className="wrap">
                  <small>{t.events.join(' · ')}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
