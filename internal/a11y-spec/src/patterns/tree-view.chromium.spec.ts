// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/tree-view|internal/a11y-spec/src/harness|packages/core/src/TreeList/|packages/core/src/hooks/useTreeFocus|apps/storybook/stories/TreeListTreeViewA11y)

/**
 * @file tree-view.chromium.spec.ts
 * @input TREE_VIEW_PATTERN and its fixtures in real Chromium (the fixture script implements the APG keyboard model)
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
import {TREE_VIEW_PATTERN} from './tree-view';
import {
  TREE_VIEW_MUTATIONS,
  CONFORMING_FIXTURES,
  RELATION_SELECTORS,
  SUBJECT_SELECTOR,
  fixture,
  type TreeViewFixture,
} from './tree-view.fixtures';

function fixturePage(html: string): string {
  // The fixture carries its own before/after controls.
  return `<!doctype html><html lang="en"><body>${html}</body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: TreeViewFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  const run = await checkAccessibilitySpec({
    spec: TREE_VIEW_PATTERN,
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

test.describe('tree-view contract — conforming fixtures', () => {
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

test.describe('tree-view contract — deliberately violating fixtures', () => {
  for (const expectation of TREE_VIEW_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of TREE_VIEW_MUTATIONS[expectation.id] ?? []) {
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
