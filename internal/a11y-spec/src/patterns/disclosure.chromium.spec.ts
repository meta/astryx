// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file disclosure.chromium.spec.ts
 * @input Uses Playwright, the disclosure contract, shared fixtures, and Chromium harness
 * @output Real-browser positive and deliberate-negative proof for every observable expectation
 * @position Contract self-tests, independent of any component implementation.
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {describeExpectation, requiredLayers} from '../contract';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {
  CHROMIUM_OBSERVES,
  createChromiumHarness,
  holdMotionStill,
} from '../harness/chromium';
import {DISCLOSURE_PATTERN} from './disclosure';
import {
  CONFORMING_FIXTURES,
  CONTENT_SELECTOR,
  DISCLOSURE_MUTATIONS,
  SUBJECT_SELECTOR,
  fixture,
  type DisclosureFixture,
} from './disclosure.fixtures';

function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body>${html}<button type="button" id="after">After disclosure</button></body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: DisclosureFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: DISCLOSURE_PATTERN,
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
        related: {content: page.locator(CONTENT_SELECTOR)},
      });
    },
  });
  return run.results;
}

test.describe('disclosure contract — conforming fixtures', () => {
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

test.describe('disclosure contract — deliberately violating fixtures', () => {
  for (const expectation of DISCLOSURE_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of DISCLOSURE_MUTATIONS[expectation.id] ?? []) {
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
