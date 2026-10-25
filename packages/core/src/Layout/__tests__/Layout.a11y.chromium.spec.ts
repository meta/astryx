// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/landmark|packages/core/src/Layout/|apps/storybook/stories/LayoutLandmarkA11y)

/** Real-browser and accessibility-tree binding evidence for Layout regions. */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  LANDMARK_PATTERN,
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
  LAYOUT_LANDMARK_A11Y_STATES,
  type LayoutLandmarkA11yRow,
} from './Layout.a11y.states';

const SUBJECT_SELECTOR = '[data-a11y-landmark]';
const CONTENT_SELECTOR = '[data-a11y-landmark-content]';
const PEER_SELECTOR = '[data-a11y-landmark-peer]';
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

function relatedFor(
  page: Page,
  state: LayoutLandmarkA11yRow,
): Record<string, Locator> {
  const related: Record<string, Locator> = {
    content: page.locator(CONTENT_SELECTOR),
  };
  const peers = page.locator(PEER_SELECTOR);
  for (let index = 0; index < state.facts.sameRolePeers; index += 1) {
    related[`peer-${index}`] = peers.nth(index);
  }
  return related;
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: LayoutLandmarkA11yRow,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: LANDMARK_PATTERN,
    binding: 'Layout regions',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
      await holdMotionStill(page);
      const subject = page.locator(SUBJECT_SELECTOR);
      await subject.waitFor({state: 'attached'});
      await expect(subject).toHaveCount(1);
      await expect(page.locator(PEER_SELECTOR)).toHaveCount(
        state.facts.sameRolePeers,
      );
      return createChromiumHarness({
        page,
        cdp,
        subject,
        related: relatedFor(page, state),
      });
    },
  });
}

test('every Landmark expectation is exercised by at least one Layout state', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of LAYOUT_LANDMARK_A11Y_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
});

for (const state of LAYOUT_LANDMARK_A11Y_STATES) {
  test(`Layout regions [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(LANDMARK_PATTERN, [result]);
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(
      result.results
        .filter(row => row.status === 'fail')
        .map(row => `${row.expectation}: ${row.detail ?? ''}`),
      'advisory failures are reported, and this binding expects none',
    ).toEqual([]);
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
