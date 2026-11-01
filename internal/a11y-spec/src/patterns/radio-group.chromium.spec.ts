// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file radio-group.chromium.spec.ts
 * @input Uses @playwright/test, the radio-group contract and fixtures, and the Chromium harness
 * @output Real-browser positive and mutation proof for every radio-group expectation
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
import {RADIO_GROUP_PATTERN} from './radio-group';
import {
  CONFORMING_RADIO_GROUP_FIXTURES,
  expectedRadioGroupMutationFailure,
  radioGroupFixture,
  RADIO_GROUP_MUTATIONS,
  RADIO_GROUP_SUBJECT_SELECTOR,
  type RadioGroupFixture,
} from './radio-group.fixtures';

function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body><button type="button">Before</button>${html}<button type="button">After fixture</button></body></html>`;
}

function relatedFor(page: Page, target: RadioGroupFixture) {
  return Object.fromEntries(
    target.facts.optionRelations.map(name => [
      name,
      page.locator(`[data-a11y-related="${name}"]`),
    ]),
  );
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: RadioGroupFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: RADIO_GROUP_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only,
    mount: async () => {
      await page.setContent(fixturePage(target.html));
      await holdMotionStill(page);
      return createChromiumHarness({
        page,
        subject: page.locator(RADIO_GROUP_SUBJECT_SELECTOR),
        cdp,
        visibleLabel: target.facts.visibleLabel ? undefined : null,
        related: relatedFor(page, target),
      });
    },
  });
  return run.results;
}

function resultFor(
  observed: readonly ExpectationResult[],
  id: string,
): ExpectationResult {
  const found = observed.find(result => result.expectation === id);
  if (found == null) {
    throw new Error(`no result for ${id}`);
  }
  return found;
}

test.describe('radio-group contract — conforming fixtures', () => {
  for (const id of CONFORMING_RADIO_GROUP_FIXTURES) {
    test(`${id}: every applicable expectation passes`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      const observed = await results(page, cdp, radioGroupFixture(id));
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

test('every expectation passes against at least one conforming fixture', async ({
  page,
}) => {
  test.setTimeout(2 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const withoutPass: string[] = [];
  for (const expectation of RADIO_GROUP_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    let passed = false;
    for (const id of CONFORMING_RADIO_GROUP_FIXTURES) {
      const [result] = await results(page, cdp, radioGroupFixture(id), [
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

test.describe('radio-group contract — deliberately violating fixtures', () => {
  for (const [expectationId, fixtures] of Object.entries(
    RADIO_GROUP_MUTATIONS,
  )) {
    const expectation = RADIO_GROUP_PATTERN.expectations.find(
      candidate => candidate.id === expectationId,
    );

    for (const fixtureId of fixtures) {
      test(`${expectationId} rejects ${fixtureId}`, async ({page}) => {
        const target = radioGroupFixture(fixtureId);
        const cdp = await page.context().newCDPSession(page);
        const result = resultFor(
          await results(page, cdp, target, [expectationId]),
          expectationId,
        );
        expect(result.status).toBe('fail');
        expect(result.detail).toBe(
          expectedRadioGroupMutationFailure(expectationId, target.id),
        );
        if (expectation != null) {
          expect(result.description).toBe(describeExpectation(expectation));
        }
      });
    }
  }
});
