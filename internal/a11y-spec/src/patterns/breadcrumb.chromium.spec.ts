// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/** Real-browser positive and mutation proof for the Breadcrumb contract. */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {describeExpectation, requiredLayers} from '../contract';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {
  CHROMIUM_OBSERVES,
  createChromiumHarness,
  holdMotionStill,
} from '../harness/chromium';
import {BREADCRUMB_PATTERN} from './breadcrumb';
import {
  BREADCRUMB_CURRENT_SELECTOR,
  BREADCRUMB_LIST_SELECTOR,
  BREADCRUMB_MUTATIONS,
  BREADCRUMB_SEPARATOR_SELECTOR,
  BREADCRUMB_SUBJECT_SELECTOR,
  CONFORMING_BREADCRUMB_FIXTURES,
  breadcrumbFixture,
  type BreadcrumbFixture,
} from './breadcrumb.fixtures';

function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body>${html}</body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: BreadcrumbFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: BREADCRUMB_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only,
    mount: async () => {
      await page.setContent(fixturePage(target.html));
      await holdMotionStill(page);
      const related: Record<string, Locator> = {
        list: page.locator(BREADCRUMB_LIST_SELECTOR),
      };
      const current = page.locator(BREADCRUMB_CURRENT_SELECTOR);
      if ((await current.count()) > 0) {
        related.current = current;
      }
      const separators = page.locator(BREADCRUMB_SEPARATOR_SELECTOR);
      for (let index = 0; index < target.facts.separatorCount; index += 1) {
        related[`separator-${index}`] = separators.nth(index);
      }
      return createChromiumHarness({
        page,
        cdp,
        subject: page.locator(BREADCRUMB_SUBJECT_SELECTOR),
        related,
      });
    },
  });
  return run.results;
}

test.describe('Breadcrumb contract — conforming fixtures', () => {
  for (const id of CONFORMING_BREADCRUMB_FIXTURES) {
    test(`${id}: every applicable expectation passes`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      const observed = await results(page, cdp, breadcrumbFixture(id));
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

test.describe('Breadcrumb contract — deliberately violating fixtures', () => {
  for (const expectation of BREADCRUMB_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of BREADCRUMB_MUTATIONS[expectation.id] ?? []) {
      test(`${describeExpectation(expectation)} — fails against ${fixtureId}`, async ({
        page,
      }) => {
        const cdp = await page.context().newCDPSession(page);
        const [result] = await results(
          page,
          cdp,
          breadcrumbFixture(fixtureId),
          [expectation.id],
        );
        expect(result?.status, result?.detail ?? 'no result').toBe('fail');
        expect(result?.detail ?? '').not.toBe('');
      });
    }
  }
});
