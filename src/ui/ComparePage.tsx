import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addMonths, formatYM, isValidYM, monthsBetween, parseYM } from '../engine/dates';
import { inView, worth, type MoneyView, type WorthBasis } from '../engine/metrics';
import { simulate } from '../engine/simulate';
import type { Scenario, SimulationResult } from '../engine/types';
import { useStore, usePref } from '../state/store';
import { FullTable, MilestonesTable, MomentDetails } from './CompareTables';
import { Num, Seg } from './fields';
import { compact, money, seriesColor } from './format';

function useWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export interface CompareRun {
  scenario: Scenario;
  result: SimulationResult;
}

export function ComparePage() {
  const { doc, updateSettings } = useStore();
  const { household, settings, scenarios } = doc;
  const [selected, setSelected] = usePref<string[] | null>('compare', null);
  const [view, setView] = usePref<MoneyView>('view', 'real');
  const [basis, setBasis] = usePref<WorthBasis>('basis', 'market');
  const [tab, setTab] = usePref<'moment' | 'milestones' | 'table'>('compareTab', 'moment');
  const [momentDate, setMomentDate] = usePref<string>('momentDate', addMonths(settings.startMonth, 119));
  const width = useWidth();

  const active = scenarios.filter((s) => (selected ?? scenarios.slice(0, 3).map((x) => x.id)).includes(s.id));

  const runs: CompareRun[] = useMemo(
    () => active.map((scenario) => ({ scenario, result: simulate({ household, settings, scenario }) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [household, settings, active.map((s) => `${s.id}:${s.updatedAt}`).join(',')],
  );

  const total = Math.round(settings.horizonYears * 12);
  const firstDate = addMonths(settings.startMonth, -1);
  const moment = Math.min(total, Math.max(0, isValidYM(momentDate) ? monthsBetween(firstDate, momentDate) : 120));
  const setMoment = (i: number) => setMomentDate(addMonths(firstDate, Math.min(total, Math.max(0, i))));

  const data = useMemo(() => {
    const rows: Record<string, number | string>[] = [];
    for (let i = 0; i <= total; i++) {
      const row: Record<string, number | string> = { i };
      for (const r of runs) {
        const s = r.result.months[i];
        if (s) row[r.scenario.id] = inView(worth(s, basis), s, view);
      }
      rows.push(row);
    }
    return rows;
  }, [runs, total, view, basis]);

  const step = settings.horizonYears > 25 ? 60 : settings.horizonYears > 10 ? 24 : 12;
  const ticks: number[] = [];
  for (let i = 0; i <= total; i += step) ticks.push(i);
  const yearOf = (i: number) => parseYM(addMonths(firstDate, i)).y;
  const directLabels = runs.length <= 4 && width >= 760;

  const toggle = (id: string) => {
    const cur = active.map((s) => s.id);
    setSelected(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  const warnings = runs.flatMap((r) => r.result.warnings.map((w) => ({ s: r.scenario, w })));

  return (
    <div>
      <div className="card">
        <div className="legend" aria-label="Scenarios to compare">
          {scenarios.map((s) => {
            const on = active.includes(s);
            return (
              <span key={s.id} className={`chip ${on ? 'on' : 'off'}`} onClick={() => toggle(s.id)} role="checkbox" aria-checked={on}>
                <span className="swatch line" style={{ background: seriesColor(s.colorSlot) }} />
                {s.name}
              </span>
            );
          })}
        </div>
        <div className="toolbar">
          <Seg
            value={view}
            onChange={setView}
            options={[
              { value: 'real', label: "Today's money" },
              { value: 'nominal', label: 'Future money' },
            ]}
          />
          <Seg
            value={basis}
            onChange={setBasis}
            options={[
              { value: 'market', label: 'Market value' },
              { value: 'afterTax', label: 'After tax & selling costs' },
            ]}
          />
          <label className="check">
            <input type="checkbox" checked={settings.inflationEnabled} onChange={(e) => updateSettings((s) => ({ ...s, inflationEnabled: e.target.checked }))} />
            Inflation
          </label>
          {settings.inflationEnabled && (
            <div style={{ width: 90 }}>
              <Num label="" kind="pct" value={settings.inflationRate} onChange={(inflationRate) => updateSettings((s) => ({ ...s, inflationRate }))} />
            </div>
          )}
        </div>

        <h3 style={{ marginBottom: 4 }}>
          Net worth{' '}
          <small className="muted" style={{ fontWeight: 400 }}>
            {view === 'real' ? "in today's money" : 'in future (nominal) money'}, {settings.currency}
            {basis === 'afterTax' ? ', after tax & selling costs' : ''}
          </small>
        </h3>
        {runs.length === 0 ? (
          <p className="muted">Pick at least one scenario above.</p>
        ) : (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 10, right: directLabels ? 130 : 12, bottom: 0, left: 0 }}
                onClick={(st) => {
                  if (st && st.activeLabel != null) setMoment(Number(st.activeLabel));
                }}
              >
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis
                  dataKey="i"
                  type="number"
                  domain={[0, total]}
                  ticks={ticks}
                  tickFormatter={(i: number) => (i === 0 ? 'Now' : String(yearOf(i)))}
                  stroke="var(--axis)"
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => compact(v)}
                  stroke="var(--axis)"
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  width={52}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }}
                  isAnimationActive={false}
                  content={({ active: on, label }) => {
                    if (!on || label == null) return null;
                    const i = Number(label);
                    return (
                      <div className="tooltip">
                        <b>{formatYM(addMonths(firstDate, i))}</b>
                        {[...runs]
                          .sort((a, b) => Number(data[i]?.[b.scenario.id] ?? 0) - Number(data[i]?.[a.scenario.id] ?? 0))
                          .map((r) => (
                            <div key={r.scenario.id}>
                              <div className="t-row">
                                <span className="swatch line" style={{ background: seriesColor(r.scenario.colorSlot) }} />
                                <span>{r.scenario.name}</span>
                                <span className="v">{money(Number(data[i]?.[r.scenario.id] ?? 0))}</span>
                              </div>
                              {r.result.months[i]?.events.map((ev, k) => (
                                <div className="t-ev" key={k}>
                                  • {ev}
                                </div>
                              ))}
                            </div>
                          ))}
                        <div className="muted" style={{ marginTop: 4 }}>
                          Click to see details
                        </div>
                      </div>
                    );
                  }}
                />
                <ReferenceLine x={moment} stroke="var(--accent)" strokeWidth={1.5} />
                {runs.map((r) => (
                  <Line
                    key={r.scenario.id}
                    dataKey={r.scenario.id}
                    name={r.scenario.name}
                    type="linear"
                    stroke={seriesColor(r.scenario.colorSlot)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
                    isAnimationActive={false}
                    label={
                      directLabels
                        ? (p: { index?: number; x?: number; y?: number }) =>
                            p.index === total ? (
                              <text x={(p.x ?? 0) + 8} y={(p.y ?? 0) + 4} fill="var(--ink-2)" fontSize={12}>
                                {r.scenario.name.length > 18 ? r.scenario.name.slice(0, 17) + '…' : r.scenario.name}
                              </text>
                            ) : (
                              <g />
                            )
                        : undefined
                    }
                  />
                ))}
                {runs.flatMap((r) =>
                  r.result.months
                    .filter((s) => s.events.length > 0)
                    .map((s) => (
                      <ReferenceDot
                        key={`${r.scenario.id}-${s.index}`}
                        x={s.index}
                        y={Number(data[s.index]?.[r.scenario.id] ?? 0)}
                        r={4}
                        fill={seriesColor(r.scenario.colorSlot)}
                        stroke="var(--surface)"
                        strokeWidth={2}
                        ifOverflow="extendDomain"
                      />
                    )),
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="moment">
          <button type="button" className="btn small" onClick={() => setMoment(moment - 12)} aria-label="One year back">
            «
          </button>
          <button type="button" className="btn small" onClick={() => setMoment(moment - 1)} aria-label="One month back">
            ◀
          </button>
          <input type="range" min={0} max={total} value={moment} onChange={(e) => setMoment(Number(e.target.value))} aria-label="Moment" />
          <button type="button" className="btn small" onClick={() => setMoment(moment + 1)} aria-label="One month forward">
            ▶
          </button>
          <button type="button" className="btn small" onClick={() => setMoment(moment + 12)} aria-label="One year forward">
            »
          </button>
          <input
            className="input"
            type="month"
            style={{ width: 170 }}
            value={addMonths(firstDate, moment)}
            onChange={(e) => isValidYM(e.target.value) && setMomentDate(e.target.value)}
          />
        </div>
        <small className="hint">Dots mark events (hover or tap for what happened). Click the chart or use the slider to pick a moment.</small>
      </div>

      {warnings.length > 0 && (
        <div className="notice">
          {warnings.map(({ s, w }, k) => (
            <div key={k}>
              ⚠ <b>{s.name}:</b> {w}
            </div>
          ))}
        </div>
      )}

      {runs.length > 0 && (
        <div className="card">
          <div className="subtabs">
            <button type="button" className={tab === 'moment' ? 'on' : ''} onClick={() => setTab('moment')}>
              Moment: {formatYM(addMonths(firstDate, moment))}
            </button>
            <button type="button" className={tab === 'milestones' ? 'on' : ''} onClick={() => setTab('milestones')}>
              Milestones
            </button>
            <button type="button" className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>
              Full table
            </button>
          </div>
          {tab === 'moment' && <MomentDetails runs={runs} index={moment} view={view} />}
          {tab === 'milestones' && <MilestonesTable runs={runs} household={household} view={view} basis={basis} horizonYears={settings.horizonYears} />}
          {tab === 'table' && <FullTable runs={runs} view={view} currency={settings.currency} />}
        </div>
      )}
    </div>
  );
}
