// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/accordion|packages/core/src/Collapsible/|apps/storybook/stories/CollapsibleGroupA11y)

/**
 * @file accordion.chromium.spec.ts
 * @input ACCORDION_PATTERN and its fixtures in real Chromium
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
import {ACCORDION_PATTERN} from './accordion';
import {
  ACCORDION_MUTATIONS,
  CONFORMING_FIXTURES,
  NEXT_HEADER_SELECTOR,
  OPEN_SIBLING_SELECTOR,
  PANEL_SELECTOR,
  SUBJECT_SELECTOR,
  fixture,
  type AccordionFixture,
} from './accordion.fixtures';

function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body>${html}<button type="button" id="after">After accordion</button></body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: AccordionFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: ACCORDION_PATTERN,
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
        related: {
          panel: page.locator(PANEL_SELECTOR),
          'next-header': page.locator(NEXT_HEADER_SELECTOR),
          'open-sibling': page.locator(OPEN_SIBLING_SELECTOR),
        },
      });
    },
  });
  return run.results;
}

test.describe('accordion contract — conforming fixtures', () => {
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

test.describe('accordion contract — deliberately violating fixtures', () => {
  for (const expectation of ACCORDION_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of ACCORDION_MUTATIONS[expectation.id] ?? []) {
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
