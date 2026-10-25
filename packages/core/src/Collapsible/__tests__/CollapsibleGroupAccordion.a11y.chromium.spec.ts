// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/accordion|packages/core/src/Collapsible/|apps/storybook/stories/CollapsibleGroupA11y)

/**
 * @file CollapsibleGroupAccordion.a11y.chromium.spec.ts
 * @input Built CollapsibleGroup accordion stories and ACCORDION_PATTERN in real Chromium
 * @output Browser evidence for every accordion expectation across the binding's states
 * @position Chromium lane of the CollapsibleGroup accordion binding (component:CollapsibleGroup AR4)
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  ACCORDION_PATTERN,
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
  COLLAPSIBLE_GROUP_ACCORDION_STATES,
  type CollapsibleGroupAccordionState,
} from './CollapsibleGroup.a11y.states';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

function storyUrl(storyId: string): string {
  return `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`;
}

function header(page: Page, label: string): Locator {
  return page
    .locator('#storybook-root')
    .getByRole('button', {name: label, includeHidden: true});
}

async function mountState(
  page: Page,
  state: CollapsibleGroupAccordionState,
): Promise<{subject: Locator; related: Record<string, Locator>}> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const subject = header(page, state.label);
  await subject.waitFor({state: 'attached'});
  const id = await subject.getAttribute('aria-controls');
  if (id == null) {
    throw new Error(
      `CollapsibleGroup state "${state.id}" has no aria-controls`,
    );
  }
  const related: Record<string, Locator> = {
    panel: page.locator(`#storybook-root [id="${id}"]`),
  };
  if (state.nextLabel != null) {
    related['next-header'] = header(page, state.nextLabel);
  }
  if (state.openSiblingLabel != null) {
    related['open-sibling'] = header(page, state.openSiblingLabel);
  }
  return {subject, related};
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: CollapsibleGroupAccordionState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: ACCORDION_PATTERN,
    binding: 'CollapsibleGroup.header',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      const {subject, related} = await mountState(page, state);
      return createChromiumHarness({page, cdp, subject, related});
    },
  });
}

test('every accordion expectation is exercised by a CollapsibleGroup state', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of COLLAPSIBLE_GROUP_ACCORDION_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
});

for (const state of COLLAPSIBLE_GROUP_ACCORDION_STATES) {
  test(`CollapsibleGroup.header [${state.id}] — ${state.summary}`, async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(ACCORDION_PATTERN, [result]);
    // Only required rows block (AST-020 FR9); advisory rows report.
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
