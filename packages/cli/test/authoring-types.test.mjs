// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The typed example docs in test/authoring-types load. The authoring
 * contract typecheck proves each one matches its published type; this proves
 * the CLI loads what the type allows, for every doc kind in both styles.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {parseDoc} from '../authoring/doctypes/parse.mjs';
import {AuthoredDocKindSchema} from '../authoring/doctypes/_schema.mjs';
import {problemsInTopic} from '../foundation/discovery/docs-discovery.mjs';
import * as satisfiesDocs from './authoring-types/all-kinds.doc.ts';

const DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'authoring-types',
);
const KINDS = AuthoredDocKindSchema.options;

const jsdocDocs = await Promise.all(
  fs
    .readdirSync(DIR)
    .filter(file => file.endsWith('.doc.mjs'))
    .sort()
    .map(async file => ({
      file,
      doc: (await import(pathToFileURL(path.join(DIR, file)).href)).docs,
    })),
);

/** @param {any} doc */
function load(doc) {
  const parsed = parseDoc(doc, 'fixture');
  // A reference doc must also load as a topic, not only parse.
  if (doc.type === 'generic') expect(problemsInTopic(parsed)).toEqual([]);
  return parsed;
}

describe('typed example docs', () => {
  it.each(jsdocDocs.map(({file, doc}) => [file, doc]))(
    'loads the JSDoc example %s',
    (_, doc) => {
      expect(() => load(doc)).not.toThrow();
    },
  );

  it.each(
    Object.entries(satisfiesDocs).filter(([name]) => name !== 'missingUsage'),
  )('loads the satisfies example %s', (_, doc) => {
    expect(() => load(doc)).not.toThrow();
  });

  it('covers every doc kind in both styles', () => {
    const kindsOf = (/** @type {any[]} */ docs) =>
      new Set(docs.map(doc => doc.type).filter(Boolean));
    const jsdoc = kindsOf(jsdocDocs.map(({doc}) => doc));
    const typed = kindsOf(Object.values(satisfiesDocs));
    for (const kind of KINDS) {
      expect(jsdoc, `no JSDoc example for ${kind}`).toContain(kind);
      if (kind !== 'namespace') {
        expect(typed, `no satisfies example for ${kind}`).toContain(kind);
      }
    }
  });
});
