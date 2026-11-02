// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/link\.|packages/core/src/Link/|apps/storybook/stories/LinkA11y)

/**
 * @file link.chromium.spec.ts
 * @input Uses @playwright/test, ./link (the contract), ./link.fixtures,
 *   ../harness/chromium, ../check
 * @output Real-browser positive and mutation proof for the Link contract.
 * @position Self-test, the Chromium half of ./link.jsdom.test.ts. Both halves
 *   read the same fixtures.
 *
 * A link's activation leaves no trace on the link, so the page counts every
 * navigation it requests through the Navigation API and cancels it. The count
 * is what the contract reads through the `activations()` seam, and the page
 * stays mounted for the next observation.
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {describeExpectation, requiredLayers} from '../contract';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {
  CHROMIUM_OBSERVES,
  createChromiumHarness,
  holdMotionStill,
} from '../harness/chromium';
import {LINK_PATTERN} from './link';
import {
  CONFORMING_LINK_FIXTURES,
  LINK_MUTATIONS,
  LINK_SUBJECT_SELECTOR,
  linkFixture,
  type LinkFixture,
} from './link.fixtures';

interface NavigationWindow extends Window {
  __a11yLinkNavigations?: number;
}

/** A tab stop after the link, so "focus can leave it" has somewhere to go. */
function fixturePage(html: string): string {
  return `<!doctype html><html lang="en"><body><p>${html}</p><button type="button">after</button></body></html>`;
}

/**
 * Fixtures are served from an HTTP origin rather than `setContent`'s
 * `about:blank`, where fragment links do not navigate the way they do on a
 * real page.
 */
const FIXTURE_URL = 'http://a11y-spec.test/link';

async function mountFixture(page: Page, html: string): Promise<void> {
  await page.route(FIXTURE_URL, route =>
    route.fulfill({contentType: 'text/html', body: fixturePage(html)}),
  );
  await page.goto(FIXTURE_URL);
  await page.unroute(FIXTURE_URL);
}

async function countNavigations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as NavigationWindow & {
      navigation: EventTarget;
    };
    target.__a11yLinkNavigations = 0;
    target.navigation.addEventListener('navigate', event => {
      target.__a11yLinkNavigations = (target.__a11yLinkNavigations ?? 0) + 1;
      if ((event as Event).cancelable) {
        event.preventDefault();
      }
    });
  });
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: LinkFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: LINK_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only,
    mount: async () => {
      await mountFixture(page, target.html);
      await holdMotionStill(page);
      await countNavigations(page);
      return createChromiumHarness({
        page,
        cdp,
        subject: page.locator(LINK_SUBJECT_SELECTOR),
      });
    },
    activations: () =>
      page.evaluate(
        () => (window as NavigationWindow).__a11yLinkNavigations ?? 0,
      ),
  });
  return run.results;
}

test.describe('Link contract — conforming fixtures', () => {
  for (const id of CONFORMING_LINK_FIXTURES) {
    test(`${id}: every applicable expectation passes`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      const observed = await results(page, cdp, linkFixture(id));
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

test.describe('Link contract — deliberately violating fixtures', () => {
  for (const expectation of LINK_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of LINK_MUTATIONS[expectation.id] ?? []) {
      test(`${describeExpectation(expectation)} — fails against ${fixtureId}`, async ({
        page,
      }) => {
        const cdp = await page.context().newCDPSession(page);
        const [result] = await results(page, cdp, linkFixture(fixtureId), [
          expectation.id,
        ]);
        expect(result?.status, result?.detail ?? 'no result').toBe('fail');
        expect(result?.detail ?? '').not.toBe('');
      });
    }
  }
});
