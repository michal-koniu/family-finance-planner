import { useState } from 'react';
import { describeEvent, describeTrigger } from './describe';
import { EventList } from './EventList';
import { ConfirmButton, Text } from './fields';
import { seriesColor } from './format';
import { newScenario, uid } from '../model/defaults';
import { useI18n } from '../i18n';
import { usePref } from '../state/prefs';
import { useStore } from '../state/store';

export function ScenariosPage() {
  const { doc, updateScenario, addScenario, deleteScenario } = useStore();
  const { household, settings, scenarios } = doc;
  const { t, month } = useI18n();
  const [selectedId, setSelectedId] = usePref<string>('scenarioEdit', scenarios[0]?.id ?? '');
  const [compare, setCompare] = usePref<string[] | null>('compare', null);
  const sc = scenarios.find((s) => s.id === selectedId) ?? scenarios[0];
  const [showCommon, setShowCommon] = useState(false);

  const freeSlot = () => {
    for (let i = 0; i < 8; i++) if (!scenarios.some((s) => s.colorSlot === i)) return i;
    return scenarios.length % 8;
  };
  const create = (from?: typeof sc) => {
    const n = from
      ? { ...structuredClone(from), id: uid('sc-'), name: t('{name} (copy)', { name: from.name }), colorSlot: freeSlot() }
      : newScenario(t('Scenario {n}', { n: scenarios.length + 1 }), freeSlot());
    if (from) n.events = n.events.map((e) => ({ ...e, id: uid('ev-') }));
    addScenario(n);
    setSelectedId(n.id);
    if (compare) setCompare([...compare, n.id]);
  };

  return (
    <div className="two-col">
      <div className="card">
        <div className="card-head">
          <h3>{t('Scenarios')}</h3>
        </div>
        <div className="scn-list">
          {scenarios.map((s) => (
            <button key={s.id} type="button" className={s.id === sc?.id ? 'on' : ''} onClick={() => setSelectedId(s.id)}>
              <span className="swatch" style={{ background: seriesColor(s.colorSlot) }} />
              <span>{s.name}</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary" onClick={() => create()}>
            {t('+ New')}
          </button>
          {sc && (
            <button type="button" className="btn" onClick={() => create(sc)}>
              {t('Duplicate')}
            </button>
          )}
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          {t('A scenario is your household (Household tab) plus its own planned events. Duplicate one and change a single event to see exactly what that decision changes.')}
        </p>
      </div>

      {sc ? (
        <div>
          <div className="card stack">
            <div className="grid wide">
              <Text label={t('Name')} value={sc.name} onChange={(name) => updateScenario(sc.id, (s) => ({ ...s, name }))} />
              <label className="field">
                <span className="lbl">{t('Colour')}</span>
                <div className="color-pick">
                  {Array.from({ length: 8 }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={t('Colour {n}', { n: i + 1 })}
                      className={sc.colorSlot === i ? 'on' : ''}
                      style={{ background: seriesColor(i) }}
                      onClick={() => updateScenario(sc.id, (s) => ({ ...s, colorSlot: i }))}
                    />
                  ))}
                </div>
              </label>
            </div>
            <label className="field">
              <span className="lbl">{t('Notes')}</span>
              <textarea className="input" rows={2} value={sc.notes} onChange={(e) => updateScenario(sc.id, (s) => ({ ...s, notes: e.target.value }))} />
            </label>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>{t('Planned events')}</h3>
            </div>
            <p className="hint" style={{ marginTop: -4 }}>
              {t('Events happen at the start of their month, in this order. Conditions (“when savings reach…”) are checked against the end of the previous month.')}
            </p>
            <EventList
              events={sc.events}
              onChange={(events) => updateScenario(sc.id, (s) => ({ ...s, events }))}
              household={household}
              settings={settings}
              scenario={sc}
            />
          </div>

          <div className="card">
            <div className="card-head">
              <h3>{t('Shared life events')}</h3>
              <button type="button" className="btn small" onClick={() => setShowCommon(!showCommon)}>
                {showCommon ? t('Hide') : t('Show ({n})', { n: household.commonEvents.length })}
              </button>
            </div>
            {showCommon && (
              <>
                <p className="hint">{t('Defined in Household and applied to every scenario. Untick to leave one out of this scenario only.')}</p>
                {household.commonEvents.map((e) => {
                  const on = !sc.excludedCommon.includes(e.id);
                  return (
                    <label key={e.id} className="check" style={{ marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(x) =>
                          updateScenario(sc.id, (s) => ({
                            ...s,
                            excludedCommon: x.target.checked ? s.excludedCommon.filter((id) => id !== e.id) : [...s.excludedCommon, e.id],
                          }))
                        }
                      />
                      <span>
                        <b>{e.name}</b>{' '}
                        <small>
                          {describeTrigger(e.trigger, household, t, month)} · {describeEvent(e, household, sc, t)}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </>
            )}
          </div>

          {scenarios.length > 1 && (
            <ConfirmButton
              onConfirm={() => {
                deleteScenario(sc.id);
                setSelectedId(scenarios.find((s) => s.id !== sc.id)?.id ?? '');
                if (compare) setCompare(compare.filter((id) => id !== sc.id));
              }}
            >
              {t('Delete this scenario')}
            </ConfirmButton>
          )}
        </div>
      ) : (
        <p>{t('No scenarios.')}</p>
      )}
    </div>
  );
}
