import type { PlanDocument } from '../engine/types';
import { mergeDocuments, normalize, sameDocument } from '../model/merge';
import { SyncError } from './github';

export interface Remote {
  pull: () => Promise<{ doc: unknown; sha: string } | null>;
  push: (doc: PlanDocument, sha: string | null) => Promise<string>;
}

/**
 * One sync round: pull the GitHub copy, merge it with ours, and push the result if it
 * differs from what's stored. Retries when another device saved in between.
 * Returns the document both sides now hold.
 */
export async function syncOnce(remote: Remote, local: PlanDocument, pristine: boolean): Promise<PlanDocument> {
  for (let attempt = 0; ; attempt++) {
    const r = await remote.pull();
    const remoteDoc = r ? normalize(r.doc) : null;
    const merged = remoteDoc ? (pristine ? remoteDoc : mergeDocuments(local, remoteDoc)) : local;
    if (remoteDoc && sameDocument(remoteDoc, merged)) return merged;
    try {
      await remote.push(merged, r?.sha ?? null);
      return merged;
    } catch (e) {
      if (e instanceof SyncError && (e.status === 409 || e.status === 422) && attempt < 3) continue;
      throw e;
    }
  }
}
