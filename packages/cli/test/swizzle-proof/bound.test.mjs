// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file bound.test.mjs
 * @input Real swizzle copies of a few targets, and changes to a component, a
 *   shared helper, a layer helper, the theme tokens and a Lab component
 * @output Proves the Node legs' affected bound (proof.mjs affectedBound)
 *   holds every target the slices prove (exactAffected), so the split never
 *   costs a slice below its work; and logs how long the split's bound takes
 * @position Node test of proof.mjs's bound, beside the swizzle-proof slices
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {boundWithin} from '../../../../scripts/vitest-shard-sequencer.mjs';
import {
  affectedBound,
  createProject,
  eject,
  exactAffected,
  listTargets,
} from './proof.mjs';

/**
 * Targets of every kind of folder: a component folder (Core), a flat
 * package (Charts, Rich Text), a shared folder (Lab's Chart), a folder of
 * modules (Layer), and a leaf (Lab's DialogHeroHeader).
 */
const KEYS = [
  'core__Button',
  'core__Badge',
  'core__Dialog',
  'core__Layer',
  'charts__ChartAxis',
  'lab__ChartArea',
  'lab__DialogHeroHeader',
  'richtext__RichTextEditorAutoLinkPlugin',
  'vega__VegaChart',
];

const CHANGES = [
  ['a component', ['packages/core/src/Button/Button.tsx']],
  ['a press helper', ['packages/core/src/utils/pressClaim.ts']],
  ['a layer helper', ['packages/core/src/Layer/inputHold.ts']],
  ['the theme tokens', ['packages/core/src/theme/tokens.stylex.ts']],
  [
    'a Lab component',
    ['packages/lab/src/DialogHeroHeader/DialogHeroHeader.tsx'],
  ],
];

describe('the Node legs’ affected bound', () => {
  /** @type {Array<{name: string, pkg: string, key: string}>} */
  let targets = [];
  /** @type {Map<string, any>} */
  const ejected = new Map();
  /** One set of caches for every change, as the same copies are read each time. */
  const caches = {};
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-bound-'));

  beforeAll(async () => {
    createProject(project);
    targets = (await listTargets(project)).filter(t => KEYS.includes(t.key));
    await eject(targets, project, ejected, () => {});
  }, 300_000);

  afterAll(() => {
    fs.rmSync(project, {recursive: true, force: true});
  });

  it('copies every chosen target', () => {
    expect(targets.map(t => t.key).sort()).toEqual([...KEYS].sort());
    expect(ejected.size).toBe(KEYS.length);
  });

  it.each(CHANGES)(
    'holds every target the slices prove for a change to %s',
    (_change, relevant) => {
      const exact = exactAffected(targets, ejected, relevant, caches).map(
        t => t.key,
      );
      const bound = affectedBound(targets, relevant);
      expect(exact.filter(key => !bound.has(key))).toEqual([]);
    },
  );

  it('is not every target: a component change reaches some, and a Lab leaf almost none', () => {
    expect(
      exactAffected(targets, ejected, CHANGES[0][1], caches).length,
    ).toBeGreaterThan(0);
    expect(affectedBound(targets, CHANGES[4][1]).size).toBeLessThan(3);
  });

  it('counts each slice’s affected targets in a worker, within its budget or not at all', async () => {
    const started = Date.now();
    const held = await boundWithin(CHANGES[0][1], 8);
    const elapsed = Date.now() - started;
    // The machine's own time, for the record of what the split spends.
    console.log(
      `SWIZZLE_BOUND ${JSON.stringify({ms: elapsed, held, cpus: os.availableParallelism()})}`,
    );
    if (held !== null) {
      expect(held).toHaveLength(8);
      expect(held.every(n => Number.isInteger(n) && n >= 0)).toBe(true);
    }
  }, 60_000);
});
