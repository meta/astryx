// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/menu\.|packages/core/src/DropdownMenu/|apps/storybook/stories/MenuA11y)

/**
 * @file menu.chromium.spec.ts
 * @input MENU_PATTERN and its fixtures in real Chromium
 * @output Proof that every expectation passes conforming fixtures and fails its mutation at the layers only a browser observes
 * @position Contract self-test, Chromium lane
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {describeExpectation, requiredLayers} from '../contract';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {
  CHROMIUM_OBSERVES,
  createChromiumHarness,
  holdMotionStill,
} from '../harness/chromium';
import {MENU_PATTERN} from './menu';
import {
  MENU_MUTATIONS,
  CONFORMING_FIXTURES,
  SUBJECT_SELECTOR,
  fixture,
  type MenuFixture,
} from './menu.fixtures';

interface ActivationWindow extends Window {
  __menuActivations?: number;
}

function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body>${html}<button type="button" id="after">After menu</button></body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: MenuFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: MENU_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only,
    mount: async () => {
      await page.setContent(fixturePage(target.html));
      await holdMotionStill(page);
      await page.evaluate(() => {
        (window as ActivationWindow).__menuActivations = 0;
      });
      return createChromiumHarness({
        page,
        cdp,
        subject: page.locator(SUBJECT_SELECTOR),
        related: Object.fromEntries(
          Object.entries(target.relations).map(([name, selector]) => [
            name,
            page.locator(selector),
          ]),
        ),
      });
    },
    // An item's action leaves no trace on the menu, so the fixture script
    // counts Enter activations on the window and the contract asks for them.
    activations: () =>
      page.evaluate(() => (window as ActivationWindow).__menuActivations ?? 0),
  });
  return run.results;
}

test.describe('menu contract — conforming fixtures', () => {
  for (const id of CONFORMING_FIXTURES) {
    test(`${id}: every applicable expectation passes`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      const observed = await results(page, cdp, fixture(id));
      expect(
        observed
          .filter(
            result =>
              result.status !== 'pass' && result.status !== 'not-applicable',
          )
          .map(result => `${result.expectation}: ${result.detail ?? ''}`),
      ).toEqual([]);
    });
  }
});

test.describe('menu contract — deliberately violating fixtures', () => {
  for (const expectation of MENU_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of MENU_MUTATIONS[expectation.id] ?? []) {
      test(`${describeExpectation(expectation)} — fails against ${fixtureId}`, async ({
        page,
      }) => {
        const cdp = await page.context().newCDPSession(page);
        const [result] = await results(page, cdp, fixture(fixtureId), [
          expectation.id,
        ]);
        expect(result?.status, result?.detail ?? 'no result').toBe('fail');
        expect(result?.detail ?? '').not.toBe('');
      });
    }
  }
});
