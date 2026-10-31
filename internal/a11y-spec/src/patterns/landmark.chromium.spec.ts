// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/landmark|packages/core/src/Layout/|apps/storybook/stories/LayoutLandmarkA11y)

/** Real-browser positive and mutation proof for the Landmark contract. */

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
import {LANDMARK_PATTERN} from './landmark';
import {
  CONFORMING_LANDMARK_FIXTURES,
  LANDMARK_CONTENT_SELECTOR,
  LANDMARK_MUTATIONS,
  LANDMARK_PEER_SELECTOR,
  LANDMARK_SUBJECT_SELECTOR,
  landmarkFixture,
  type LandmarkFixture,
} from './landmark.fixtures';

function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body>${html}</body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: LandmarkFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: LANDMARK_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only,
    mount: async () => {
      await page.setContent(fixturePage(target.html));
      await holdMotionStill(page);
      const related: Record<string, Locator> = {
        content: page.locator(LANDMARK_CONTENT_SELECTOR),
      };
      const peers = page.locator(LANDMARK_PEER_SELECTOR);
      for (let index = 0; index < target.facts.sameRolePeers; index += 1) {
        related[`peer-${index}`] = peers.nth(index);
      }
      return createChromiumHarness({
        page,
        cdp,
        subject: page.locator(LANDMARK_SUBJECT_SELECTOR),
        related,
      });
    },
  });
  return run.results;
}

test.describe('Landmark contract — conforming fixtures', () => {
  for (const id of CONFORMING_LANDMARK_FIXTURES) {
    test(`${id}: every applicable expectation passes`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      const observed = await results(page, cdp, landmarkFixture(id));
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

test.describe('Landmark contract — deliberately violating fixtures', () => {
  for (const expectation of LANDMARK_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of LANDMARK_MUTATIONS[expectation.id] ?? []) {
      test(`${describeExpectation(expectation)} — fails against ${fixtureId}`, async ({
        page,
      }) => {
        const cdp = await page.context().newCDPSession(page);
        const [result] = await results(page, cdp, landmarkFixture(fixtureId), [
          expectation.id,
        ]);
        expect(result?.status, result?.detail ?? 'no result').toBe('fail');
        expect(result?.detail ?? '').not.toBe('');
      });
    }
  }
});
