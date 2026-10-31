// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scenes.perf.spec.ts
 * @input The built Sandbox's perf scenes page (apps/sandbox/out, served here
 *   by the accessibility harness's static server), PERF_SAMPLES (default 5),
 *   PERF_RESULTS_DIR (default test-results/perf)
 * @output One JSON file per scene: every sample and the per-metric median
 * @position The perf scenes' measurement driver. Run locally with
 *   `pnpm build && pnpm -F @astryxdesign/sandbox build` then
 *   `pnpm exec playwright test --config playwright.perf.config.ts`.
 *
 * Each sample loads the scene in a fresh browser context, so no sample
 * inherits another's heap, caches or listeners, and inside that context plays
 * one unmeasured cycle before the measured one (measure.ts): the numbers are a
 * warm mount and what one more cycle leaves behind.
 *
 * SYNC: Scenes come from apps/sandbox/src/app/(raw)/pages/perf-scenes/sceneIds.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {
  serveStatic,
  type StaticServer,
} from '../../../internal/a11y-spec/src/storybook';
import {
  frames,
  waitForRest,
} from '../../../internal/interaction-harness/src/index';
import {
  PERF_SCENES,
  type PerfSceneId,
} from '../src/app/(raw)/pages/perf-scenes/sceneIds';
import {EVENT_TIMING_LOG, measureScene, type SceneSample} from './measure';

const SAMPLES = positiveInteger('PERF_SAMPLES', 5);
const RESULTS_DIR = path.resolve(
  process.env.PERF_RESULTS_DIR ?? 'test-results/perf',
);
const OVERLAY_CYCLES = 50;
const SANDBOX_DIR = 'apps/sandbox/out';

let server: StaticServer | undefined;
test.beforeAll(async () => {
  server = await serveStatic(SANDBOX_DIR, {
    sentinel: 'pages/perf-scenes/index.html',
    missing: root =>
      `No built Sandbox with the perf scenes at ${root}. Run \`pnpm build && pnpm -F @astryxdesign/sandbox build\` first.`,
  });
});
test.afterAll(async () => {
  await server?.close();
});

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

/** Plays one open/close of an overlay with real input. */
async function openAndClose(
  page: Page,
  trigger: string,
  shown: ReturnType<Page['locator']>,
): Promise<void> {
  await page.getByRole('button', {name: trigger, exact: true}).click();
  await shown.waitFor({state: 'visible'});
  await page.keyboard.press('Escape');
  await shown.waitFor({state: 'hidden'});
}

/** Each scene's interaction, played with real input after it mounted. */
const INTERACTIONS: Readonly<
  Record<PerfSceneId, (page: Page) => Promise<void>>
> = {
  // Narrow and widen the panel: every truncated row measures again.
  'comments-panel': async page => {
    const resize = page.getByRole('button', {
      name: 'Resize panel',
      exact: true,
    });
    await resize.click();
    await frames(page, 2);
    await resize.click();
    await frames(page, 2);
  },
  // Sort by name, then filter by typing two characters.
  table: async page => {
    await page.getByRole('button', {name: /^Name/}).first().click();
    await frames(page, 2);
    await page
      .getByRole('textbox', {name: 'Filter by name', exact: true})
      .pressSequentially('an', {delay: 50});
    await frames(page, 2);
  },
  // Expand all 50 folders at once and let the layout glide come to rest.
  'tree-list': async page => {
    await page.getByRole('button', {name: 'Expand all', exact: true}).click();
    await waitForRest(page.getByRole('tree'));
  },
  // Append a section to the long document.
  markdown: async page => {
    await page
      .getByRole('button', {name: 'Append section', exact: true})
      .click();
    await frames(page, 2);
  },
  // Open and close each overlay, OVERLAY_CYCLES times.
  'overlay-churn': async page => {
    const popover = page.getByText('Popover content');
    const menu = page.getByRole('menuitem', {name: 'Rename', exact: true});
    const dialog = page.getByRole('dialog', {name: 'Perf dialog', exact: true});
    for (let cycle = 0; cycle < OVERLAY_CYCLES; cycle++) {
      await openAndClose(page, 'Open popover', popover);
      await openAndClose(page, 'Open menu', menu);
      await openAndClose(page, 'Open dialog', dialog);
    }
  },
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

for (const scene of PERF_SCENES) {
  test(scene, async ({browser}, testInfo) => {
    const samples: SceneSample[] = [];
    for (let run = 0; run < SAMPLES; run++) {
      const context = await browser.newContext({
        baseURL: server?.origin,
        viewport: {width: 1280, height: 800},
      });
      try {
        const page = await context.newPage();
        await page.addInitScript(EVENT_TIMING_LOG);
        await page.goto(`/pages/perf-scenes/?scene=${scene}`);
        await page
          .locator('html[data-perf-page="interactive"]')
          .waitFor({state: 'attached'});
        await page.evaluate(() => document.fonts.ready);
        samples.push(await measureScene(page, INTERACTIONS[scene]));
      } finally {
        await context.close();
      }
    }

    const metrics = Object.keys(samples[0]) as (keyof SceneSample)[];
    const result = {
      scene,
      samples,
      median: Object.fromEntries(
        metrics.map(metric => [
          metric,
          median(samples.map(sample => sample[metric])),
        ]),
      ),
    };
    fs.mkdirSync(RESULTS_DIR, {recursive: true});
    const file = path.join(RESULTS_DIR, `${scene}.json`);
    fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
    await testInfo.attach(`${scene}.json`, {path: file});
    expect(samples).toHaveLength(SAMPLES);
  });
}
