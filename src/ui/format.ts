/** Full amount with thousands separators: 1 234 567 (also groups 4-digit numbers, unlike pl-PL). */
export function money(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const r = Math.round(v);
  if (r === 0) return '0';
  const digits = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return (r < 0 ? '−' : '') + digits;
}

/** Short form for axes and tight spaces: 1.23M, 456k */
export function compact(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e3)}k`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}k`;
  return `${sign}${Math.round(a)}`;
}

export function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits).replace(/\.0+$/, '')}%`;
}

export function seriesColor(slot: number): string {
  return `var(--series-${(((slot % 8) + 8) % 8) + 1})`;
}
