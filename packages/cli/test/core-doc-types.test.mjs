// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core's own docs against the published authoring types.
 *
 * The same check `astryx doctor integration validate` runs over an
 * integration's docs, here over Core's: its component and hook docs with their
 * translations, the bundled templates and themes, and the docs topics with
 * their overlays. A doc's root is decided as the readers decide it: a Core
 * `use*` doc is a hook doc unless its own annotation says ComponentDoc.
 *
 * Every finding must be listed in core-doc-types.known-drift.json, and every
 * entry there must still be found, so the list only shrinks: a new mismatch
 * fails until the doc (or the type) is fixed, and a fixed one fails until its
 * entry is removed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {checkDocTypes} from '../foundation/discovery/doc-types.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(CLI, '..', '..');
const KNOWN = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'core-doc-types.known-drift.json',
);
const SKIP = new Set(['node_modules', '__tests__', '__fixtures__']);

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** @returns {import('../foundation/discovery/doc-types.mjs').DocFile[]} */
function coreDocFiles() {
  /** @type {import('../foundation/discovery/doc-types.mjs').DocFile[]} */
  const files = [];
  for (const file of walk(path.join(REPO, 'packages', 'core', 'src'))) {
    if (!/\.doc\.mjs$/.test(file)) continue;
    const annotated = /authoring'\)\.(\w+)/.exec(
      fs.readFileSync(file, 'utf8'),
    )?.[1];
    const hook =
      annotated != null
        ? annotated === 'HookDoc'
        : /^use[A-Z]/.test(path.basename(file));
    files.push({path: file, root: hook ? 'hooks' : 'components'});
  }
  for (const file of walk(path.join(CLI, 'assets', 'templates'))) {
    if (!/\.(?:doc|template)\.(?:mjs|ts)$/.test(file)) continue;
    const theme = /type:\s*'theme'/.test(fs.readFileSync(file, 'utf8'));
    files.push({path: file, root: theme ? 'themes' : 'templates'});
  }
  for (const file of walk(path.join(CLI, 'assets', 'docs'))) {
    if (/\.doc\.(?:zh|dense)\.mjs$/.test(file)) {
      files.push({path: file, root: 'docs-overlay'});
    } else if (/\.doc\.mjs$/.test(file)) {
      files.push({path: file, root: 'docs'});
    }
  }
  return files;
}

describe("Core's docs against the authoring types", () => {
  it('match, apart from the known drift, which only shrinks', async () => {
    const report = await checkDocTypes(coreDocFiles(), {
      packageDir: REPO,
      resolveFrom: [REPO],
      core: true,
    });
    expect(report.status).toBe('checked');
    expect(report.unchecked).toEqual([]);

    const found = report.findings.map(
      f => `${f.doc} ${f.export} ${f.field} ${f.problem}`,
    );
    /** @type {string[]} */
    const known = JSON.parse(fs.readFileSync(KNOWN, 'utf8'));
    const knownSet = new Set(known);
    const foundSet = new Set(found);

    const added = report.findings
      .filter(
        f => !knownSet.has(`${f.doc} ${f.export} ${f.field} ${f.problem}`),
      )
      .map(
        f => `${f.doc}:${f.line} ${f.export} ${f.field}: ${f.message} ${f.fix}`,
      );
    expect(
      added,
      'These doc fields do not match the authoring types. Fix the doc, or the type if the doc is right.',
    ).toEqual([]);

    const fixed = known.filter(entry => !foundSet.has(entry));
    expect(
      fixed,
      'These no longer mismatch. Remove them from core-doc-types.known-drift.json.',
    ).toEqual([]);
  }, 60_000);
});
