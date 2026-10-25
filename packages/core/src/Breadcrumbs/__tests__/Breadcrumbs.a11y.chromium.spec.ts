// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/** Real-browser and accessibility-tree binding evidence for Breadcrumbs. */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  BREADCRUMB_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  neverExercised,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {
  createChromiumHarness,
  holdMotionStill,
} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {
  BREADCRUMB_A11Y_STATES,
  type BreadcrumbA11yRow,
} from './Breadcrumbs.a11y.states';

const SUBJECT_SELECTOR = '[data-a11y-breadcrumb]';
const SEPARATOR_SELECTOR = 'li > span:first-child';
let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => storybook?.close());

function storyUrl(id: string): string {
  return `${storybook.origin}/iframe.html?id=${id}&viewMode=story`;
}

async function relatedFor(
  page: Page,
  state: BreadcrumbA11yRow,
): Promise<Record<string, Locator>> {
  const subject = page.locator(SUBJECT_SELECTOR);
  const list = subject.locator('ol');
  const related: Record<string, Locator> = {list};
  const current = list.locator('[aria-current="page"]');
  if ((await current.count()) > 0) {
    related.current = current;
  }
  const separators = list.locator(SEPARATOR_SELECTOR);
  for (let index = 0; index < state.facts.separatorCount; index += 1) {
    related[`separator-${index}`] = separators.nth(index);
  }
  return related;
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: BreadcrumbA11yRow,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: BREADCRUMB_PATTERN,
    binding: 'Breadcrumbs',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
      await holdMotionStill(page);
      const subject = page.locator(SUBJECT_SELECTOR);
      await subject.waitFor({state: 'attached'});
      if (state.facts.currentPage) {
        await subject.locator('[aria-current="page"]').waitFor({
          state: 'attached',
        });
      }
      return createChromiumHarness({
        page,
        cdp,
        subject,
        related: await relatedFor(page, state),
      });
    },
  });
}

test('every Breadcrumb expectation is exercised by at least one state', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of BREADCRUMB_A11Y_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
});

for (const state of BREADCRUMB_A11Y_STATES) {
  test(`Breadcrumbs [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(BREADCRUMB_PATTERN, [result]);
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
