import { useState } from 'react';
import type { EventKind, Household, PlanEvent, Scenario, Settings } from '../engine/types';
import { EVENT_KINDS, kindInfo, newEvent, uid } from '../model/defaults';
import { describeEvent, describeTrigger } from './describe';
import { EventEditor } from './EventEditor';
import { ConfirmButton, move, removeAt, updateAt } from './fields';

interface Props {
  events: PlanEvent[];
  onChange: (events: PlanEvent[]) => void;
  household: Household;
  settings: Settings;
  scenario: Scenario | null;
  addLabel?: string;
}

export function EventList({ events, onChange, household, settings, scenario, addLabel = '+ Add event' }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const add = (kind: EventKind) => {
    const e = newEvent(kind, household, settings);
    onChange([...events, e]);
    setOpen(e.id);
    setAdding(false);
  };

  return (
    <div>
      {events.length === 0 && <p className="muted">No events yet.</p>}
      {events.map((e, i) => (
        <div key={e.id} className={`event${e.enabled ? '' : ' disabled'}`}>
          <div className="event-head" onClick={() => setOpen(open === e.id ? null : e.id)}>
            <input
              type="checkbox"
              checked={e.enabled}
              title="Include this event"
              onClick={(x) => x.stopPropagation()}
              onChange={(x) => onChange(updateAt(events, i, { ...e, enabled: x.target.checked }))}
              style={{ width: 18, height: 18, marginTop: 2 }}
            />
            <div className="title">
              <b>{e.name}</b>
              <small>
                {kindInfo(e.kind).label} · {describeTrigger(e.trigger, household)} · {describeEvent(e, household, scenario)}
              </small>
            </div>
            <span className="muted">{open === e.id ? '▴' : '▾'}</span>
          </div>
          {open === e.id && (
            <div className="event-body">
              <EventEditor event={e} onChange={(ne) => onChange(updateAt(events, i, ne))} household={household} settings={settings} scenario={scenario} />
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn small" onClick={() => onChange(move(events, i, -1))} disabled={i === 0} title="Earlier in the same month">
                  ↑
                </button>
                <button type="button" className="btn small" onClick={() => onChange(move(events, i, 1))} disabled={i === events.length - 1}>
                  ↓
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    const copy = { ...structuredClone(e), id: uid('ev-'), name: `${e.name} (copy)` };
                    onChange([...events.slice(0, i + 1), copy, ...events.slice(i + 1)]);
                    setOpen(copy.id);
                  }}
                >
                  Duplicate
                </button>
                <span className="spacer" />
                <ConfirmButton className="btn small danger" onConfirm={() => onChange(removeAt(events, i))}>
                  Delete
                </ConfirmButton>
              </div>
            </div>
          )}
        </div>
      ))}
      <button type="button" className="btn" onClick={() => setAdding(!adding)}>
        {adding ? 'Cancel' : addLabel}
      </button>
      {adding && (
        <div className="kind-menu">
          {EVENT_KINDS.map((k) => (
            <button key={k.kind} type="button" onClick={() => add(k.kind)}>
              <b>{k.label}</b>
              <small className="hint">{k.hint}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
