// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build names the start template's slots and the slot each block it
 * suggests goes in, from the templates' own `slots` and `fits`.
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it, vi} from 'vitest';
import {build} from './build.mjs';
import {slotTakes} from '../../authoring/doctypes/template/slot-kinds.mjs';
import {discoverTemplates} from '../template/template.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

vi.setConfig({testTimeout: 30000});

/** Made-up requests, never real ones: each starts from a template with slots. */
const REQUESTS = [
  'analytics dashboard with KPI tiles and a revenue chart',
  'a filter bar above the orders table',
  'settings page with notification switches',
  'chat page with a message composer',
];

describe('build places blocks in the start template', () => {
  it.each(REQUESTS)('%s: the start carries its declared slots', async request => {
    const r = await build(request, {cwd: REPO});
    if (r.type !== 'build.kit') throw new Error(r.type);
    const {start} = r.data;
    expect(start).not.toBeNull();
    const declared = (await discoverTemplates(REPO)).find(
      t => t.type === 'page' && t.dirName === start?.name,
    )?.slots;
    expect(declared?.length).toBeGreaterThan(0);
    expect(start?.slots).toEqual(declared);
  });

  it.each(REQUESTS)(
    '%s: each block names a slot of the start that its fits allow, or none',
    async request => {
      const r = await build(request, {cwd: REPO});
      if (r.type !== 'build.kit') throw new Error(r.type);
      const slots = r.data.start?.slots ?? [];
      for (const block of /** @type {any[]} */ (r.data.blocks)) {
        expect(Array.isArray(block.fits), block.name).toBe(true);
        if (block.slot == null) {
          // No slot: nothing in the start takes any of its kinds.
          expect(
            slots.some(slot =>
              block.fits.some((/** @type {string} */ kind) => slotTakes(slot.kind, kind)),
            ),
            block.name,
          ).toBe(false);
          continue;
        }
        const slot = slots.find(s => s.name === block.slot);
        expect(slot, `${block.name} -> ${block.slot}`).toBeDefined();
        expect(
          block.fits.some((/** @type {string} */ kind) => slotTakes(slot?.kind ?? '', kind)),
          `${block.name} fits ${block.fits} but goes in ${slot?.kind}`,
        ).toBe(true);
      }
    },
  );

  it('keeps which blocks it lists and their order: placement only adds fields', async () => {
    const r = await build('analytics dashboard with KPI tiles', {cwd: REPO});
    if (r.type !== 'build.kit') throw new Error(r.type);
    for (const block of /** @type {any[]} */ (r.data.blocks)) {
      const {fits, slot, ...entry} = block;
      expect(Object.keys(entry)).toEqual(
        expect.arrayContaining(['domain', 'name', 'package', 'score', 'reason']),
      );
      expect(fits).toBeDefined();
      expect(slot === undefined || typeof slot === 'string').toBe(true);
    }
  });
});
