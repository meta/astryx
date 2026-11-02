// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/combobox|apps/storybook/stories/ComboboxA11y)

/** Chromium accessibility-tree and relationship proof for Selector's Combobox binding. */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  unmatchedKnownFailures,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {createChromiumHarness} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {COMBOBOX_PATTERN} from '@astryxdesign/a11y-spec';
import {
  SELECTOR_COMBOBOX_SCENARIOS,
  type SelectorComboboxScenario,
} from './Combobox.a11y.states';
import {SELECTOR_COMBOBOX_KNOWN_FAILURES} from './Combobox.a11y.known-failures';

let storybook: StaticServer;
const observedResults: BindingResult[] = [];

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
  expect(
    unmatchedKnownFailures(SELECTOR_COMBOBOX_KNOWN_FAILURES, observedResults),
  ).toEqual([]);
});

async function awaitScenario(
  page: Page,
  scenario: SelectorComboboxScenario,
): Promise<void> {
  if (!scenario.open) {
    return;
  }
  await expect(page.getByRole('listbox')).toBeVisible();
  if (scenario.highlightFirst) {
    await expect(
      page.getByRole('combobox', {name: scenario.facts.name}),
    ).toHaveAttribute('aria-activedescendant', /.+/);
  }
}

for (const scenario of SELECTOR_COMBOBOX_SCENARIOS) {
  test(`Selector Combobox contract — ${scenario.id}`, async ({page}) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${scenario.storyId}&viewMode=story`,
      {waitUntil: 'load'},
    );
    await awaitScenario(page, scenario);

    // A modal sheet makes the trigger inert, so find it among hidden nodes too.
    const subject = page.getByRole('combobox', {
      name: scenario.facts.name,
      includeHidden: true,
    });
    if (
      scenario.binding === 'Selector.trigger' &&
      scenario.facts.popupVisible
    ) {
      // AR1: the trigger names the popup kind its presentation renders.
      await expect(subject).toHaveAttribute(
        'aria-haspopup',
        scenario.facts.popupRole,
      );
    }
    const related: Record<string, Locator> = {};
    if (scenario.facts.popupVisible) {
      related.popup =
        scenario.facts.popupRole === 'dialog'
          ? page.getByRole('dialog', {name: 'Fruit'})
          : page.getByRole('listbox');
    }
    if (scenario.facts.activeDescendant) {
      related['active-descendant'] = page.getByRole('option', {name: 'Apple'});
    }
    const cdp = await page.context().newCDPSession(page);
    const run = await checkAccessibilitySpec({
      spec: COMBOBOX_PATTERN,
      binding: scenario.binding,
      state: scenario.id,
      facts: scenario.facts,
      knownFailures: SELECTOR_COMBOBOX_KNOWN_FAILURES,
      mount: async () => createChromiumHarness({page, cdp, subject, related}),
    });
    observedResults.push(run);

    expect(formatFailures(blockingResults([run]))).toBe('');
    expect(
      run.results
        .filter(result => result.status === 'unrun')
        .map(result => `${result.expectation}: ${result.detail ?? ''}`),
    ).toEqual([]);
  });
}
