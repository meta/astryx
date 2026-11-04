// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/ToggleButton ^internal/a11y-spec/src/patterns/toggle-button

/**
 * @file toggle-button.chromium.spec.ts
 * @input Uses Playwright, the toggle-button contract, independent fixtures, and Chromium harness
 * @output Real-browser positive and deliberate-negative proof for every expectation
 * @position Contract self-test, independent of Astryx component implementation.
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {describeExpectation, requiredLayers} from '../contract';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {
  CHROMIUM_OBSERVES,
  createChromiumHarness,
  holdMotionStill,
} from '../harness/chromium';
import {TOGGLE_BUTTON_PATTERN} from './toggle-button';
import {
  CONFORMING_FIXTURES,
  SUBJECT_SELECTOR,
  TOGGLE_BUTTON_MUTATIONS,
  fixture,
  type ToggleButtonFixture,
} from './toggle-button.fixtures';

function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body>${html}<button type="button" id="after">After toggle</button></body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: ToggleButtonFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: TOGGLE_BUTTON_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only,
    mount: async () => {
      await page.setContent(fixturePage(target.html));
      await holdMotionStill(page);
      return createChromiumHarness({
        page,
        cdp,
        subject: page.locator(SUBJECT_SELECTOR),
      });
    },
  });
  return run.results;
}

test.describe('toggle-button contract — conforming fixtures', () => {
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

test.describe('toggle-button contract — deliberately violating fixtures', () => {
  for (const expectation of TOGGLE_BUTTON_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of TOGGLE_BUTTON_MUTATIONS[expectation.id] ?? []) {
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
