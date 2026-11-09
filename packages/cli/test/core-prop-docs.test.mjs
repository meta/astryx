// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core's own component docs against Core's TypeScript props, with the
 * same comparison `astryx doctor integration components` runs for an
 * integration. Drift that Core already had when the check arrived is listed
 * in `core-prop-docs.known-drift.json`; the list only shrinks. A new
 * difference fails here, and so does a listed one that is gone, so fixing a
 * doc means deleting its line.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {comparePropDocs} from '../foundation/discovery/prop-drift.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = path.resolve(CLI, '..', 'core');
const KNOWN = path.join(CLI, 'test', 'core-prop-docs.known-drift.json');

/**
 * Every `<Name>.doc.mjs` under Core's src, as the command reads a package's
 * docs: with its same-stem `<Name>.tsx`, or with none.
 */
function corePairs() {
  /** @type {Array<{name: string, docPath: string, sourcePath: string | null}>} */
  const pairs = [];
  /** @param {string} dir */
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.doc.mjs')) {
        const name = entry.name.slice(0, -'.doc.mjs'.length);
        const sourcePath = path.join(dir, `${name}.tsx`);
        pairs.push({
          name,
          docPath: full,
          sourcePath: fs.existsSync(sourcePath) ? sourcePath : null,
        });
      }
    }
  };
  walk(path.join(CORE, 'src'));
  return pairs.sort((a, b) => a.docPath.localeCompare(b.docPath));
}

describe("Core's component docs match Core's props", () => {
  it('has no prop drift beyond the known list, and the list holds nothing fixed', async () => {
    const report = await comparePropDocs(corePairs(), {
      packageDir: CORE,
      resolveFrom: [CORE],
    });
    expect(report.status).toBe('checked');
    // A doc whose own export has no same-stem source, which discovery flags
    // in an integration: listed, never compared as a guess.
    expect(report.unchecked.map(u => `${u.doc} ${u.component}`)).toEqual([
      'src/Chat/ChatComposerTokenElement.doc.mjs ChatComposerTokenElement',
      'src/ContextMenu/ContextMenuItem.doc.mjs ContextMenuItem',
      'src/Text/Heading.doc.mjs Heading',
      'src/theme/SyntaxTheme.doc.mjs SyntaxTheme',
    ]);

    /** @type {string[]} */
    const known = JSON.parse(fs.readFileSync(KNOWN, 'utf8'));
    const found = new Map(
      report.findings.map(f => [
        `${f.doc} ${f.component}.${f.prop} ${f.kind}`,
        f.message,
      ]),
    );
    const added = [...found].filter(([key]) => !known.includes(key));
    const fixed = known.filter(key => !found.has(key));

    expect(
      added.map(([key, message]) => `${key}: ${message}`),
      'Fix these docs (or the props) so they agree; do not add them to core-prop-docs.known-drift.json.',
    ).toEqual([]);
    expect(
      fixed,
      'These no longer differ: delete them from core-prop-docs.known-drift.json.',
    ).toEqual([]);
  }, 120_000);
});
