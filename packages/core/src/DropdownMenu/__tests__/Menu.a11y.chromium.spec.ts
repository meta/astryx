// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/menu\.|packages/core/src/DropdownMenu/|apps/storybook/stories/MenuA11y)

/**
 * @file Menu.a11y.chromium.spec.ts
 * @input Built menu stories and MENU_PATTERN in real Chromium
 * @output Browser evidence for every menu expectation across the DropdownMenu pointer-menu states
 * @position Chromium lane of the DropdownMenu menu-surface binding
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  MENU_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  neverExercised,
  summarize,
  unmatchedKnownFailures,
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
import {MENU_KNOWN_FAILURES} from './Menu.a11y.known-failures';
import {MENU_BINDING_STATES, type MenuBindingState} from './Menu.a11y.states';

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

/**
 * Opens the menu the way a keyboard user does — Enter on the focused trigger —
 * and waits until focus is on the first item, so every expectation starts from
 * a displayed menu with focus inside it.
 */
async function mountState(
  page: Page,
  state: MenuBindingState,
): Promise<{subject: Locator; related: Record<string, Locator>}> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const opener = page
    .locator('#storybook-root')
    .getByRole('button', {name: state.label});
  await opener.focus();
  await page.keyboard.press('Enter');
  const id = await opener.getAttribute('aria-controls');
  if (id == null) {
    throw new Error(`menu state "${state.id}" has no aria-controls`);
  }
  const related: Record<string, Locator> = {opener};
  for (const [relation, [role, name]] of Object.entries(state.items)) {
    related[relation] = page.getByRole(
      role as Parameters<Page['getByRole']>[0],
      {
        name,
        exact: true,
        includeHidden: true,
      },
    );
  }
  await expect(related['first-item']).toBeFocused();
  return {subject: page.locator(`[id="${id}"]`), related};
}

/**
 * How many item actions the story's handlers have run. The story renders the
 * count as an attribute, so this reads a fact the page shows rather than
 * instrumenting it from the test.
 */
async function activationsOn(page: Page): Promise<number> {
  const raw = await page
    .locator('[data-a11y-activations]')
    .first()
    .getAttribute('data-a11y-activations');
  return Number(raw ?? '0');
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: MenuBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: MENU_PATTERN,
    binding: 'DropdownMenu.menu',
    state: state.id,
    facts: state.facts,
    knownFailures: MENU_KNOWN_FAILURES,
    mount: async () => {
      const {subject, related} = await mountState(page, state);
      return createChromiumHarness({page, cdp, subject, related});
    },
    activations: async () => activationsOn(page),
  });
}

test('every menu expectation is exercised by a DropdownMenu state', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of MENU_BINDING_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(MENU_KNOWN_FAILURES, results)).toEqual([]);
});

for (const state of MENU_BINDING_STATES) {
  test(`DropdownMenu.menu [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(MENU_PATTERN, [result]);
    // Required rows block (AST-020 FR9); advisory rows and exact known
    // failures report.
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
