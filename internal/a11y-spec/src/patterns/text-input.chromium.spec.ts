// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file text-input.chromium.spec.ts
 * @input Uses native text-input fixtures, the shared contract, and Chromium harness
 * @output Accessibility-tree positive and mutation proof for the text-input contract
 * @position Contract self-test; component bindings use checked-in Storybook stories.
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {describeExpectation, requiredLayers} from '../contract';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {
  CHROMIUM_OBSERVES,
  createChromiumHarness,
  holdMotionStill,
} from '../harness/chromium';
import {TEXT_INPUT_PATTERN} from './text-input';
import {
  CONFORMING_FIXTURES,
  SUBJECT_SELECTOR,
  TEXT_INPUT_MUTATIONS,
  fixture,
  type TextInputFixture,
} from './text-input.fixtures';

async function resultsFor(
  page: Page,
  cdp: CDPSession,
  target: TextInputFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  return (
    await checkAccessibilitySpec({
      spec: TEXT_INPUT_PATTERN,
      binding: 'fixture',
      state: target.id,
      facts: target.facts,
      mount: async () => {
        await page.setContent(
          `<button type="button">Before</button>${target.html}<button type="button">After</button>`,
        );
        await holdMotionStill(page);
        return createChromiumHarness({
          page,
          subject: page.locator(SUBJECT_SELECTOR),
          cdp,
        });
      },
      only,
    })
  ).results;
}

test.describe('text-input contract — conforming native fixtures', () => {
  for (const fixtureId of CONFORMING_FIXTURES) {
    test(`${fixtureId} passes every applicable Chromium expectation`, async ({
      page,
    }) => {
      const cdp = await page.context().newCDPSession(page);
      const results = await resultsFor(page, cdp, fixture(fixtureId));
      expect(results.filter(result => result.status === 'fail')).toEqual([]);
      expect(results.filter(result => result.status === 'unrun')).toEqual([]);
    });
  }
});

test.describe('text-input contract — deliberately violating fixtures', () => {
  for (const expectation of TEXT_INPUT_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of TEXT_INPUT_MUTATIONS[expectation.id] ?? []) {
      test(`${describeExpectation(expectation)} — fails against ${fixtureId}`, async ({
        page,
      }) => {
        const cdp = await page.context().newCDPSession(page);
        const [result] = await resultsFor(page, cdp, fixture(fixtureId), [
          expectation.id,
        ]);
        expect(result?.status).toBe('fail');
        expect(result?.detail).not.toBe('');
      });
    }
  }
});
