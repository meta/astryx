// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/menu-button|packages/core/src/DropdownMenu/|packages/core/src/MoreMenu/|apps/storybook/stories/MenuButtonA11y)

/**
 * @file MenuButton.a11y.chromium.spec.ts
 * @input Built menu-button stories and MENU_BUTTON_PATTERN in real Chromium
 * @output Browser evidence for every menu-button expectation across the DropdownMenu and MoreMenu trigger states
 * @position Chromium lane of the menu-button binding (component:DropdownMenu AR4, component:MoreMenu AR1)
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  MENU_BUTTON_PATTERN,
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
import {MENU_BUTTON_KNOWN_FAILURES} from './MenuButton.a11y.known-failures';
import {
  MENU_BUTTON_BINDING_STATES,
  type MenuButtonBindingState,
} from './MenuButton.a11y.states';

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

function trigger(page: Page, label: string): Locator {
  return page
    .locator('#storybook-root')
    .getByRole('button', {name: label, includeHidden: true});
}

async function mountState(
  page: Page,
  state: MenuButtonBindingState,
): Promise<{subject: Locator; related: Record<string, Locator>}> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const subject = trigger(page, state.label);
  await subject.waitFor({state: 'attached'});
  const id = await subject.getAttribute('aria-controls');
  if (id == null) {
    throw new Error(`menu-button state "${state.id}" has no aria-controls`);
  }
  const menu = page.locator(`[id="${id}"]`);
  const related: Record<string, Locator> = {
    menu,
    'first-item': page.getByRole('menuitem', {
      name: state.firstItem,
      includeHidden: true,
    }),
    'last-item': page.getByRole('menuitem', {
      name: state.lastItem,
      includeHidden: true,
    }),
  };
  return {subject, related};
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: MenuButtonBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: MENU_BUTTON_PATTERN,
    binding: 'DropdownMenu.trigger',
    state: state.id,
    facts: state.facts,
    knownFailures: MENU_BUTTON_KNOWN_FAILURES,
    mount: async () => {
      const {subject, related} = await mountState(page, state);
      return createChromiumHarness({page, cdp, subject, related});
    },
  });
}

test('every menu-button expectation is exercised by a DropdownMenu or MoreMenu state', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of MENU_BUTTON_BINDING_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(MENU_BUTTON_KNOWN_FAILURES, results)).toEqual(
    [],
  );
});

for (const state of MENU_BUTTON_BINDING_STATES) {
  test(`DropdownMenu.trigger [${state.id}] — ${state.summary}`, async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(MENU_BUTTON_PATTERN, [result]);
    // Required rows block (AST-020 FR9); advisory rows and exact known
    // failures report.
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
