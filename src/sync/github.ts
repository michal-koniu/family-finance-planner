// Stores the plan as one JSON file in a private GitHub repository, through the
// GitHub REST "contents" API. Every save is a commit, so the repo keeps full history.
import type { PlanDocument } from '../engine/types';
import { N_ } from '../i18n/mark';

export interface SyncConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string;
}

const CONFIG_KEY = 'ffp.sync';

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as SyncConfig;
    return c.owner && c.repo && c.token ? c : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(c: SyncConfig | null): void {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* storage unavailable (private mode) – sync just won't be remembered */
  }
}

export class SyncError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function url(c: SyncConfig): string {
  const path = c.path.split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${path}`;
}

function headers(c: SyncConfig): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${c.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function explain(status: number): string {
  if (status === 401) return N_('GitHub rejected the access key (expired or mistyped).');
  if (status === 403) return N_('The access key is not allowed to read/write this repository, or GitHub rate-limited us.');
  if (status === 404) return N_('Repository or branch not found — check owner, repository name and that the key can access it.');
  if (status === 409 || status === 422) return N_('Someone else saved at the same time.');
  return N_('GitHub returned an unexpected error.');
}

/** Returns the stored document and its version id (sha), or null if the file doesn't exist yet. */
export async function pull(c: SyncConfig): Promise<{ doc: unknown; sha: string } | null> {
  const res = await fetch(`${url(c)}?ref=${encodeURIComponent(c.branch)}&t=${Date.now()}`, {
    headers: headers(c),
    cache: 'no-store',
  });
  if (res.status === 404) {
    // Distinguish "file missing" from "repo missing / no access".
    const repo = await fetch(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`, {
      headers: headers(c),
      cache: 'no-store',
    });
    if (repo.ok) return null;
    throw new SyncError(explain(repo.status), repo.status);
  }
  if (!res.ok) throw new SyncError(explain(res.status), res.status);
  const body = (await res.json()) as { content?: string; sha: string; download_url?: string };
  let text: string;
  if (body.content) {
    text = fromBase64(body.content);
  } else {
    // Files over 1 MB come without inline content; fetch the raw blob instead.
    const raw = await fetch(`${url(c)}?ref=${encodeURIComponent(c.branch)}`, {
      headers: { ...headers(c), Accept: 'application/vnd.github.raw+json' },
      cache: 'no-store',
    });
    if (!raw.ok) throw new SyncError(explain(raw.status), raw.status);
    text = await raw.text();
  }
  return { doc: JSON.parse(text), sha: body.sha };
}

/** Writes the document. `sha` must be the version we last saw (null when creating the file). */
export async function push(c: SyncConfig, doc: PlanDocument, sha: string | null, device: string): Promise<string> {
  const res = await fetch(url(c), {
    method: 'PUT',
    headers: { ...headers(c), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Update plan from ${device}`,
      content: toBase64(JSON.stringify(doc, null, 1)),
      branch: c.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new SyncError(explain(res.status), res.status);
  const body = (await res.json()) as { content: { sha: string } };
  return body.content.sha;
}

export function deviceName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'browser';
}
