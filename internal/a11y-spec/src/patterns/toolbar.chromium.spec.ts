// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/toolbar\.|packages/core/src/Toolbar/|apps/storybook/stories/ToolbarA11y)

/**
 * @file toolbar.chromium.spec.ts
 * @input TOOLBAR_PATTERN and its fixtures in real Chromium
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
import {TOOLBAR_PATTERN} from './toolbar';
import {
  TOOLBAR_MUTATIONS,
  CONFORMING_FIXTURES,
  SUBJECT_SELECTOR,
  fixture,
  type ToolbarFixture,
} from './toolbar.fixtures';

function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body>${html}</body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: ToolbarFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: TOOLBAR_PATTERN,
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
        related: Object.fromEntries(
          Object.entries(target.relations).map(([name, selector]) => [
            name,
            page.locator(selector),
          ]),
        ),
      });
    },
  });
  return run.results;
}

test.describe('toolbar contract — conforming fixtures', () => {
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

test.describe('toolbar contract — deliberately violating fixtures', () => {
  for (const expectation of TOOLBAR_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of TOOLBAR_MUTATIONS[expectation.id] ?? []) {
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
