// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Shared test-only fixture lifecycle; canonical compiler, static server and browser. */
import path from 'node:path';
import {build} from 'vite';
import {expect, type Page} from '@astryxdesign/a11y-spec/playwright';
import {frames} from '@astryxdesign/interaction-harness';
import {serveStatic} from '@astryxdesign/a11y-spec/storybook';
import type {Combination, Density} from './TableVirtualization.release.fixture';
/** Builds into a folder of the worker's own, so parallel workers never share one. */
export async function startRowFixture(workerIndex: number) {
  const outDir = `test-results/table-row-fixture-${workerIndex}`;
  await build({
    configFile: path.resolve(
      'packages/core/src/Table/__tests__/TableVirtualization.release.vite.mjs',
    ),
    build: {outDir: path.resolve(outDir), emptyOutDir: true},
  });
  return serveStatic(outDir, {
    sentinel: 'TableVirtualization.release.html',
    missing: root => `Missing row fixture at ${root}`,
  });
}
export async function mountRows(
  page: Page,
  origin: string,
  count: number,
  combination: Combination,
  density?: Density,
) {
  await page.goto(`${origin}/TableVirtualization.release.html`);
  await page.waitForFunction(() => !!window.__rowRelease);
  await page.evaluate(count => window.__rowRelease.prepare(count), count);
  const cold = await page.evaluate(
    ([combination, density]) => window.__rowRelease.mount(combination, density),
    [combination, density] as const,
  );
  await page.evaluate(async () => document.fonts.ready);
  await frames(page, 3);
  await expect(page.getByRole('table', {name: 'Release rows'})).toHaveCount(1);
  if (count > 0) {
    await expect(page.locator('tbody > tr[aria-rowindex]')).not.toHaveCount(0);
  }
  return cold;
}
export async function scrollRows(page: Page, top: number) {
  await page
    .getByRole('group', {name: 'Release rows'})
    .evaluate((node, top) => {
      node.scrollTop = top;
    }, top);
  await frames(page, 3);
}
