// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/progressbar\.|packages/core/src/ProgressBar/|packages/lab/src/CircularProgress/|apps/storybook/stories/ProgressbarA11y)

/**
 * @file progressbar.chromium.spec.ts
 * @input PROGRESSBAR_PATTERN and its fixtures in real Chromium
 * @output Proof that every expectation passes conforming fixtures and fails its mutation at the layers only a browser observes
 * @position Contract self-test, Chromium lane
 */

import {expect, test, type CDPSession, type Page} from '../playwright';
import {describeExpectation, requiredLayers} from '../contract';
import {
  checkAccessibilitySpec,
  engineMatches,
  unmatchedKnownFailures,
  type BindingResult,
  type ExpectationResult,
} from '../check';
import {
  CHROMIUM_OBSERVES,
  createChromiumHarness,
  holdMotionStill,
} from '../harness/chromium';
import {PROGRESSBAR_PATTERN} from './progressbar';
import {
  PROGRESSBAR_MUTATIONS,
  CONFORMING_FIXTURES,
  SUBJECT_SELECTOR,
  fixture,
  type ProgressbarFixture,
} from './progressbar.fixtures';
import {
  PROGRESSBAR_FIXTURE_KNOWN_FAILURES,
  VALUE_TEXT_UNEXPOSED_ENGINE,
} from './progressbar.known-failures';

function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body>${html}</body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: ProgressbarFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  return (await bindingResult(page, cdp, target, only)).results;
}

async function bindingResult(
  page: Page,
  cdp: CDPSession,
  target: ProgressbarFixture,
  only?: readonly string[],
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: PROGRESSBAR_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only,
    knownFailures: PROGRESSBAR_FIXTURE_KNOWN_FAILURES,
    mount: async () => {
      await page.setContent(fixturePage(target.html));
      await holdMotionStill(page);
      return createChromiumHarness({
        page,
        cdp,
        subject: page.locator(SUBJECT_SELECTOR),
        related: {},
      });
    },
  });
}

test.describe('progressbar contract — conforming fixtures', () => {
  for (const id of CONFORMING_FIXTURES) {
    test(`${id}: every applicable expectation passes`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      const observed = await results(page, cdp, fixture(id));
      expect(
        observed
          .filter(
            result =>
              result.status !== 'pass' &&
              result.status !== 'not-applicable' &&
              result.status !== 'known-failure',
          )
          .map(result => `${result.expectation}: ${result.detail ?? ''}`),
      ).toEqual([]);
    });
  }
});

test.describe('progressbar contract — deliberately violating fixtures', () => {
  for (const expectation of PROGRESSBAR_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of PROGRESSBAR_MUTATIONS[expectation.id] ?? []) {
      test(`${describeExpectation(expectation)} — fails against ${fixtureId}`, async ({
        page,
      }) => {
        // From VALUE_TEXT_UNEXPOSED_ENGINE on, the accessibility tree shows no
        // value text, so a claimed text cannot be seen there and the case
        // passes. It fails this assertion once the engine is fixed.
        const unseen =
          fixtureId === 'violating-indeterminate-claims-text' &&
          engineMatches(
            VALUE_TEXT_UNEXPOSED_ENGINE,
            'chromium',
            page.context().browser()?.version(),
          );
        const cdp = await page.context().newCDPSession(page);
        const [result] = await results(page, cdp, fixture(fixtureId), [
          expectation.id,
        ]);
        expect(result?.status, result?.detail ?? 'no result').toBe(
          unseen ? 'pass' : 'fail',
        );
        if (!unseen) {
          expect(result?.detail ?? '').not.toBe('');
        }
      });
    }
  }
});

test('every fixture known failure matches exactly one result', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const observed: BindingResult[] = [];
  for (const failure of PROGRESSBAR_FIXTURE_KNOWN_FAILURES) {
    observed.push(
      await bindingResult(page, cdp, fixture(failure.state), [
        failure.expectation,
      ]),
    );
  }
  expect(
    unmatchedKnownFailures(PROGRESSBAR_FIXTURE_KNOWN_FAILURES, observed),
  ).toEqual([]);
});
