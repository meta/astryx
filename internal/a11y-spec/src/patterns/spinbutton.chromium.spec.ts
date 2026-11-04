// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/** Chromium positive, exact-debt, and mutation proof for the shared Spinbutton contract. */

import {expect, test, type Page} from '@playwright/test';
import {
  checkAccessibilitySpec,
  requiredLayers,
  unmatchedKnownFailures,
  type BindingResult,
} from '../index';
import {CHROMIUM_OBSERVES, createChromiumHarness} from '../harness/chromium';
import {SPINBUTTON_PATTERN} from './spinbutton';
import {
  CONFORMING_SPINBUTTON_FIXTURES,
  SPINBUTTON_MUTATIONS,
  SPINBUTTON_SUBJECT_SELECTOR,
  spinbuttonFixture,
} from './spinbutton.fixtures';
import {SPINBUTTON_FIXTURE_KNOWN_FAILURES} from './spinbutton.known-failures';

async function run(page: Page, id: string, only?: readonly string[]) {
  const fixture = spinbuttonFixture(id);
  const cdp = await page.context().newCDPSession(page);
  return checkAccessibilitySpec({
    spec: SPINBUTTON_PATTERN,
    binding: 'fixture',
    state: id,
    facts: fixture.facts,
    only,
    knownFailures: SPINBUTTON_FIXTURE_KNOWN_FAILURES,
    mount: async () => {
      await page.setContent(fixture.html);
      return createChromiumHarness({
        page,
        cdp,
        subject: page.locator(SPINBUTTON_SUBJECT_SELECTOR),
      });
    },
  });
}

for (const expectation of SPINBUTTON_PATTERN.expectations) {
  test(`${expectation.id} has Chromium evidence`, async ({page}) => {
    expect(
      requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      ),
    ).toBe(true);
    const conforming = CONFORMING_SPINBUTTON_FIXTURES.find(id => {
      const fixture = spinbuttonFixture(id);
      return expectation.appliesWhen.test(fixture.facts);
    });
    if (conforming == null) {
      throw new Error(`no conforming fixture exercises ${expectation.id}`);
    }
    const result = await run(page, conforming, [expectation.id]);
    const recorded = SPINBUTTON_FIXTURE_KNOWN_FAILURES.some(
      failure =>
        failure.expectation === expectation.id &&
        failure.binding === 'fixture' &&
        failure.state === conforming,
    );
    expect(result.results[0]?.status).toBe(recorded ? 'known-failure' : 'pass');
  });

  for (const mutation of SPINBUTTON_MUTATIONS[expectation.id] ?? []) {
    test(`${expectation.id} rejects ${mutation}`, async ({page}) => {
      const result = await run(page, mutation, [expectation.id]);
      expect(result.results[0]?.status).toBe('fail');
      expect(result.results[0]?.description).toContain(expectation.id);
    });
  }
}

test('every fixture known failure matches exactly one result', async ({
  page,
}) => {
  const results: BindingResult[] = [];
  for (const failure of SPINBUTTON_FIXTURE_KNOWN_FAILURES) {
    results.push(await run(page, failure.state, [failure.expectation]));
  }
  expect(
    unmatchedKnownFailures(SPINBUTTON_FIXTURE_KNOWN_FAILURES, results),
  ).toEqual([]);
});
