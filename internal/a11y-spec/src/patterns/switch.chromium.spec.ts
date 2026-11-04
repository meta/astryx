// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file switch.chromium.spec.ts
 * @input Uses @playwright/test, ./switch (the contract), ./switch.fixtures,
 *   ../harness/chromium, ../check
 * @output The contract's own proof in a real engine: every expectation passes
 *   against a conforming fixture and fails against each fixture that removes
 *   its outcome.
 * @position Self-test, the Chromium half of ./switch.jsdom.test.ts. Both halves
 *   read the same fixtures, so the same positive and negative proof runs at
 *   every layer that can see it.
 *
 * The fixtures are hand-written HTML with no Astryx in them, because what is
 * under test here is the CONTRACT — whether an expectation can actually fail.
 * A component binding proves the different claim that the component delivers
 * the outcome.
 *
 * SYNC: Fixtures and mutations live in ./switch.fixtures.ts, shared with the
 *   jsdom half.
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {describeExpectation, requiredLayers} from '../contract';
import {
  CHROMIUM_OBSERVES,
  createChromiumHarness,
  holdMotionStill,
} from '../harness/chromium';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {SWITCH_PATTERN} from './switch';
import {
  CONFORMING_FIXTURES,
  SUBJECT_SELECTOR,
  SWITCH_MUTATIONS,
  fixture,
  type SwitchFixture,
} from './switch.fixtures';

/**
 * A tab stop after the switch, so "focus can leave it" has somewhere to go.
 * Without it the browser moves focus to its own chrome and the fixture could
 * not tell an escape from a trap.
 */
function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body>${html}<button type="button" id="after">after</button></body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: SwitchFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: SWITCH_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only,
    mount: async () => {
      await page.setContent(fixturePage(target.html));
      await holdMotionStill(page);
      return createChromiumHarness({
        page,
        subject: page.locator(SUBJECT_SELECTOR),
        cdp,
      });
    },
  });
  return run.results;
}

test.describe('switch contract — conforming fixtures', () => {
  for (const id of CONFORMING_FIXTURES) {
    test(`${id}: every applicable expectation passes`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      const observed = await results(page, cdp, fixture(id));
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

test.describe('switch contract — deliberately violating fixtures', () => {
  for (const expectation of SWITCH_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of SWITCH_MUTATIONS[expectation.id] ?? []) {
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
