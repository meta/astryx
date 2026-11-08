// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tooling-surface-contract.test.mjs
 * @description Pins the Node-only contract between the admitted score-ledger
 *   tooling surface and the Sandbox projection that consumes its exports.
 * @input The score-ledger module and the generator's named import list.
 * @output Fails when an admitted tooling change breaks the operational consumer
 *   that the tooling-only lane intentionally validates without a Sandbox build.
 * @position Safety contract for the first positive CI tooling surface.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import * as scoreLedger from '../../scripts/score-ledger.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const generatorPath = path.join(
  root,
  'apps/sandbox/scripts/generate-score-ledger.mjs',
);

function consumedScoreLedgerExports() {
  const source = fs.readFileSync(generatorPath, 'utf8');
  const match = source.match(
    /import\s*{([^}]*)}\s*from\s*['"]\.\.\/\.\.\/\.\.\/scripts\/score-ledger\.mjs['"]/,
  );
  if (!match) throw new Error('Sandbox score-ledger import was not found');
  return match[1]
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
}

const EXPECTED_CONSUMED_EXPORTS = [
  'AUDIT_PROMPT',
  'DEFAULT_LEDGER_URL',
  'DEFAULT_REPO',
  'LEDGER_FETCH_TIMEOUT_MS',
  'SECTION_TITLES',
  'SECTION_WEIGHTS',
  'isBlocksShape',
  'isEvidenceItem',
  'listComponents',
];

function expectRecord(value, predicate) {
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  expect(typeof value).toBe('object');
  for (const [key, entry] of Object.entries(value)) {
    expect(key.length).toBeGreaterThan(0);
    expect(predicate(entry), `${key} has an invalid projected value`).toBe(
      true,
    );
  }
}

describe('score-ledger tooling surface', () => {
  it('keeps the Sandbox projection import list explicit and available', () => {
    const consumed = consumedScoreLedgerExports().sort();
    expect(consumed).toEqual([...EXPECTED_CONSUMED_EXPORTS].sort());
    for (const name of consumed) {
      expect(scoreLedger, `missing Sandbox export ${name}`).toHaveProperty(
        name,
      );
    }
  });

  it('keeps every serialized value in the exact generated-module shape', () => {
    expect(typeof scoreLedger.AUDIT_PROMPT).toBe('string');
    expect(scoreLedger.AUDIT_PROMPT.length).toBeGreaterThan(0);
    const ledgerUrl = new URL(scoreLedger.DEFAULT_LEDGER_URL);
    expect(ledgerUrl.protocol).toBe('https:');
    expect(scoreLedger.DEFAULT_REPO).toMatch(/^[^/]+\/[^/]+$/);
    expect(Number.isInteger(scoreLedger.LEDGER_FETCH_TIMEOUT_MS)).toBe(true);
    expect(scoreLedger.LEDGER_FETCH_TIMEOUT_MS).toBeGreaterThan(0);

    expectRecord(
      scoreLedger.SECTION_TITLES,
      value => typeof value === 'string',
    );
    expectRecord(
      scoreLedger.SECTION_WEIGHTS,
      value => typeof value === 'number' && Number.isFinite(value),
    );
    expect(Object.keys(scoreLedger.SECTION_TITLES).sort()).toEqual(
      Object.keys(scoreLedger.SECTION_WEIGHTS).sort(),
    );

    const components = scoreLedger.listComponents();
    expect(Array.isArray(components)).toBe(true);
    expect(components.length).toBeGreaterThan(0);
    for (const component of components) {
      expect(component).toEqual({
        component: expect.any(String),
        package: expect.any(String),
      });
      expect(component.component.length).toBeGreaterThan(0);
      expect(component.package.length).toBeGreaterThan(0);
    }
  });

  it('keeps generator-only validators callable', () => {
    expect(scoreLedger.isBlocksShape).toEqual(expect.any(Function));
    expect(scoreLedger.isEvidenceItem).toEqual(expect.any(Function));
  });
});
