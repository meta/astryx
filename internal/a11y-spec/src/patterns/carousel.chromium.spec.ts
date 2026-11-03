// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/carousel|packages/core/src/Carousel/|apps/storybook/stories/CarouselA11y)

/**
 * @file carousel.chromium.spec.ts
 * @input Uses @playwright/test, the Carousel contract, fixtures, and Chromium harness
 * @output Real-browser positive and mutation proof for every Carousel expectation
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
import {CAROUSEL_PATTERN} from './carousel';
import {
  CAROUSEL_MUTATIONS,
  CAROUSEL_SUBJECT_SELECTOR,
  CONFORMING_CAROUSEL_FIXTURES,
  carouselFixture,
  expectedCarouselMutationFailure,
  type CarouselFixture,
} from './carousel.fixtures';

function relatedFor(page: Page, target: CarouselFixture) {
  return Object.fromEntries(
    target.facts.slideRelations.map(name => [
      name,
      page.locator(`[data-a11y-related="${name}"]`),
    ]),
  );
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: CarouselFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: CAROUSEL_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only,
    mount: async () => {
      await page.setContent(
        `<!doctype html><html lang="en"><body>${target.html}</body></html>`,
      );
      await holdMotionStill(page);
      return createChromiumHarness({
        page,
        subject: page.locator(CAROUSEL_SUBJECT_SELECTOR),
        cdp,
        related: relatedFor(page, target),
      });
    },
  });
  return run.results;
}

test.describe('Carousel contract — conforming fixtures', () => {
  for (const id of CONFORMING_CAROUSEL_FIXTURES) {
    test(`${id}: every applicable expectation passes`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      const observed = await results(page, cdp, carouselFixture(id));
      expect(
        observed.filter(
          result =>
            result.status !== 'pass' && result.status !== 'not-applicable',
        ),
      ).toEqual([]);
    });
  }
});

test('every expectation passes against at least one conforming fixture', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const withoutPass: string[] = [];
  for (const expectation of CAROUSEL_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    let passed = false;
    for (const id of CONFORMING_CAROUSEL_FIXTURES) {
      const [result] = await results(page, cdp, carouselFixture(id), [
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

test.describe('Carousel contract — deliberately violating fixtures', () => {
  for (const [expectationId, fixtures] of Object.entries(CAROUSEL_MUTATIONS)) {
    const expectation = CAROUSEL_PATTERN.expectations.find(
      candidate => candidate.id === expectationId,
    );
    for (const fixtureId of fixtures) {
      test(`${expectationId} rejects ${fixtureId}`, async ({page}) => {
        const cdp = await page.context().newCDPSession(page);
        const [result] = await results(page, cdp, carouselFixture(fixtureId), [
          expectationId,
        ]);
        expect(result?.status).toBe('fail');
        expect(result?.detail).toBe(
          expectedCarouselMutationFailure(expectationId, fixtureId),
        );
        if (expectation != null) {
          expect(result?.description).toBe(describeExpectation(expectation));
        }
      });
    }
  }
});
