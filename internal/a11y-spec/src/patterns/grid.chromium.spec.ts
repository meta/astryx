// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/grid|internal/a11y-spec/src/harness|packages/core/src/Calendar/|packages/core/src/hooks/useGridFocus|apps/storybook/stories/CalendarGridA11y)

/**
 * @file grid.chromium.spec.ts
 * @input GRID_PATTERN and its fixtures in real Chromium (the fixture script implements the data-grid keyboard model)
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
import {GRID_PATTERN} from './grid';
import {
  GRID_MUTATIONS,
  CONFORMING_FIXTURES,
  RELATION_SELECTORS,
  SUBJECT_SELECTOR,
  fixture,
  type GridFixture,
} from './grid.fixtures';

function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body>${html}</body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: GridFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: GRID_PATTERN,
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
          Object.entries(RELATION_SELECTORS).map(([name, selector]) => [
            name,
            page.locator(selector),
          ]),
        ),
      });
    },
  });
  return run.results;
}

test.describe('grid contract — conforming fixtures', () => {
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

test.describe('grid contract — deliberately violating fixtures', () => {
  for (const expectation of GRID_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of GRID_MUTATIONS[expectation.id] ?? []) {
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
