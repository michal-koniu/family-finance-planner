import { useEffect, useState, type ReactNode } from 'react';
import { isValidYM } from '../engine/dates';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function parseNumber(s: string): number | null {
  const t = s.replace(/[\s ]/g, '').replace(',', '.').replace('−', '-');
  if (t === '' || t === '-' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const groupFmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 4 });

interface NumProps {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  /** 'pct' shows 7 for 0.07 */
  kind?: 'money' | 'pct' | 'plain';
  suffix?: string;
  hint?: ReactNode;
  min?: number;
  max?: number;
}

/** Number input that tolerates spaces and comma decimals and doesn't fight the cursor while typing. */
export function Num({ label, value, onChange, kind = 'plain', suffix, hint, min, max }: NumProps) {
  const scale = kind === 'pct' ? 100 : 1;
  const show = (v: number) => {
    const x = Math.round(v * scale * 10000) / 10000;
    return kind === 'money' ? groupFmt.format(x) : String(x);
  };
  const [text, setText] = useState(() => show(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  const sfx = suffix ?? (kind === 'pct' ? '%' : undefined);
  return (
    <Field label={label} hint={hint}>
      <div className="input-wrap">
        <input
          className="input num"
          inputMode="decimal"
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(show(value));
          }}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseNumber(e.target.value);
            if (n == null) return;
            let v = n / scale;
            if (min != null) v = Math.max(min, v);
            if (max != null) v = Math.min(max, v);
            onChange(v);
          }}
        />
        {sfx && <span className="suffix">{sfx}</span>}
      </div>
    </Field>
  );
}

export function Text({ label, value, onChange, hint, placeholder, type = 'text' }: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  placeholder?: string;
  type?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
    </Field>
  );
}

export function Select<T extends string>({ label, value, onChange, options, hint }: {
  label: ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: ReactNode;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <Field label={label} hint={hint}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {!known && <option value={value}>— choose —</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Month picker. Uses a plain YYYY-MM text box where <input type=month> isn't supported. */
export function Month({ label, value, onChange, hint, optional }: {
  label: ReactNode;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  hint?: ReactNode;
  optional?: boolean;
}) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  return (
    <Field label={label} hint={hint}>
      <input
        className="input"
        type="month"
        placeholder="YYYY-MM"
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (isValidYM(v)) onChange(v);
          else if (v === '' && optional) onChange(undefined);
        }}
      />
    </Field>
  );
}

export function Check({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Seg<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A button that asks for a second click instead of a blocking confirm() dialog. */
export function ConfirmButton({ children, onConfirm, className = 'btn danger' }: {
  children: ReactNode;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? 'Click again to confirm' : children}
    </button>
  );
}

/** Generic editable list helpers. */
export function updateAt<T>(list: T[], i: number, v: T): T[] {
  return list.map((x, j) => (j === i ? v : x));
}
export function removeAt<T>(list: T[], i: number): T[] {
  return list.filter((_, j) => j !== i);
}
export function move<T>(list: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const c = list.slice();
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}
