// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file tabs.chromium.spec.ts
 * @input Uses @playwright/test, the Tabs contract and fixtures, and the Chromium harness
 * @output Real-browser positive and mutation proof for every Tabs expectation
 * @position Contract self-test; proves the reusable contract, not Astryx components.
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {describeExpectation, requiredLayers} from '../contract';
import {
  CHROMIUM_OBSERVES,
  createChromiumHarness,
  holdMotionStill,
} from '../harness/chromium';
import {TABS_PATTERN} from './tabs';
import {
  CONFORMING_TABS_FIXTURES,
  TABS_MUTATIONS,
  TABS_SUBJECT_SELECTOR,
  expectedTabsMutationFailure,
  tabsFixture,
  type TabsFixture,
} from './tabs.fixtures';

function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body>${html}</body></html>`;
}

function relatedFor(page: Page, target: TabsFixture) {
  const names = [
    ...target.facts.tabRelations,
    ...target.facts.panelRelations,
    target.facts.controlledPanel,
    target.facts.labellingTab,
  ].filter((name): name is string => name != null);
  return Object.fromEntries(
    names.map(name => [name, page.locator(`[data-a11y-related="${name}"]`)]),
  );
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: TabsFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: TABS_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only,
    mount: async () => {
      await page.setContent(fixturePage(target.html));
      await holdMotionStill(page);
      return createChromiumHarness({
        page,
        subject: page.locator(TABS_SUBJECT_SELECTOR),
        cdp,
        visibleLabel: target.facts.visibleLabel ? undefined : null,
        related: relatedFor(page, target),
      });
    },
  });
  return run.results;
}

function resultFor(
  observed: readonly ExpectationResult[],
  id: string,
): ExpectationResult {
  const found = observed.find(result => result.expectation === id);
  if (found == null) {
    throw new Error(`no result for ${id}`);
  }
  return found;
}

test.describe('Tabs contract — conforming fixtures', () => {
  for (const id of CONFORMING_TABS_FIXTURES) {
    test(`${id}: every applicable expectation passes`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      const observed = await results(page, cdp, tabsFixture(id));
      const notPassing = observed.filter(
        result =>
          result.status !== 'pass' && result.status !== 'not-applicable',
      );
      expect(
        notPassing.map(
          result => `${result.expectation}: ${result.detail ?? ''}`,
        ),
      ).toEqual([]);
    });
  }
});

test('all-unavailable alternatives are not activation or skip candidates', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const observed = await results(
    page,
    cdp,
    tabsFixture('conforming-tablist-no-available-alternate'),
  );
  for (const id of [
    'tabs.focus.skips-unavailable',
    'tabs.selection.manual-arrows-preserve-state',
    'tabs.selection.enter-round-trip',
    'tabs.selection.space-round-trip',
    'tabs.selection.pointer-round-trip',
  ]) {
    expect(resultFor(observed, id).status, id).toBe('not-applicable');
  }
});

test('every expectation passes against at least one conforming fixture', async ({
  page,
}) => {
  test.setTimeout(3 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const withoutPass: string[] = [];
  for (const expectation of TABS_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    let passed = false;
    for (const id of CONFORMING_TABS_FIXTURES) {
      const [result] = await results(page, cdp, tabsFixture(id), [
        expectation.id,
      ]);
      if (result?.status === 'pass') {
        passed = true;
        break;
      }
    }
    if (!passed) {
      withoutPass.push(expectation.id);
    }
  }
  expect(withoutPass).toEqual([]);
});

test.describe('Tabs contract — deliberately violating fixtures', () => {
  for (const [expectationId, fixtures] of Object.entries(TABS_MUTATIONS)) {
    const expectation = TABS_PATTERN.expectations.find(
      candidate => candidate.id === expectationId,
    );

    for (const fixtureId of fixtures) {
      test(`${expectationId} rejects ${fixtureId}`, async ({page}) => {
        const target = tabsFixture(fixtureId);
        const cdp = await page.context().newCDPSession(page);
        const result = resultFor(
          await results(page, cdp, target, [expectationId]),
          expectationId,
        );
        expect(result.status).toBe('fail');
        expect(result.detail).toBe(
          expectedTabsMutationFailure(expectationId, fixtureId),
        );
        if (expectation != null) {
          expect(result.description).toBe(describeExpectation(expectation));
        }
      });
    }
  }
});
