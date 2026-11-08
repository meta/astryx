// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A topic split into a namespace of guides indexes each term once, a
 * policy of the docs split itself (no spec clause states it). Below the CLI's own
 * root namespaces (every one but `cli`, its command and API reference, and
 * `authoring`, the integration guides `cli` held before this rule), a
 * guide's search keywords are its own: none repeats a keyword its namespace,
 * a sibling, or a guide of another split topic declares. A term several
 * guides share belongs to their namespace, or to none.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const TREE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/docs/tree',
);

/** @returns {Promise<Map<string, any>>} every CLI tree doc, by name */
async function treeDocs() {
  /** @type {Map<string, any>} */
  const docs = new Map();
  for (const file of fs.readdirSync(TREE_DIR)) {
    if (!/^[\w-]+\.doc\.mjs$/.test(file)) continue;
    const {docs: doc} = await import(path.join(TREE_DIR, file));
    docs.set(doc.name, doc);
  }
  return docs;
}

/** @param {any} doc @returns {string | null} */
const parentOf = doc =>
  /^namespace:(.+)$/.exec(doc.placement?.parent ?? '')?.[1] ?? null;

describe('the keywords of a split topic', () => {
  it("are each declared once, and a guide's are its own", async () => {
    const docs = await treeDocs();
    /** @param {string} name */
    const rootOf = name => {
      let doc = docs.get(name);
      while (doc && parentOf(doc)) doc = docs.get(parentOf(doc));
      return doc?.name;
    };
    const roots = [...docs.values()]
      .filter(doc => doc.type === 'namespace' && !parentOf(doc) && !['cli', 'authoring'].includes(doc.name))
      .map(doc => doc.name);
    expect(roots).toContain('layout');

    /** @type {Map<string, any[]>} */
    const owners = new Map();
    for (const doc of docs.values()) {
      if (!roots.includes(rootOf(doc.name))) continue;
      const own = new Set((doc.keywords ?? []).map(k => String(k).toLowerCase()));
      for (const keyword of own) {
        owners.set(keyword, [...(owners.get(keyword) ?? []), doc]);
      }
    }
    const repeats = [...owners]
      .filter(([, holders]) => holders.length > 1 && holders.some(d => d.type !== 'namespace'))
      .map(([keyword, holders]) => `${keyword}: ${holders.map(d => d.name).join(', ')}`);
    expect(repeats).toEqual([]);
  });

  it('are not repeated inside one doc', async () => {
    for (const doc of (await treeDocs()).values()) {
      const keywords = (doc.keywords ?? []).map(k => String(k).toLowerCase());
      expect(new Set(keywords).size, doc.name).toBe(keywords.length);
    }
  });
});
