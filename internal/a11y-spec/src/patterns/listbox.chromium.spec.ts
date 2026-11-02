// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file listbox.chromium.spec.ts
 * @input Uses Playwright, the listbox contract, and real semantic HTML fixtures
 * @output Browser-backed positive and deliberately violating identity proof
 * @position Contract fixtures; no component or assistive-technology claim.
 */

import {expect, test} from '@playwright/test';
import {checkAccessibilitySpec} from '../check';
import {createChromiumHarness} from '../harness/chromium';
import {LISTBOX_PATTERN, type ListboxStateFacts} from './listbox';

const cases: ReadonlyArray<{
  id: string;
  part: ListboxStateFacts['part'];
  html: string;
  failure: string | null;
}> = [
  {
    id: 'named-listbox',
    part: 'listbox',
    html: '<div data-subject role="listbox" aria-label="Fruit"><div role="option" aria-selected="false">Apple</div></div>',
    failure: null,
  },
  {
    id: 'group-role',
    part: 'group',
    html: '<div role="listbox" aria-label="Fruit"><div data-subject role="group"><div role="option" aria-selected="false">Orange</div></div></div>',
    failure: null,
  },
  {
    id: 'named-option',
    part: 'option',
    html: '<div role="listbox" aria-label="Fruit"><div data-subject role="option" aria-selected="false">Apple</div></div>',
    failure: null,
  },
  {
    id: 'wrong-listbox-role',
    part: 'listbox',
    html: '<div data-subject role="button" aria-label="Fruit">Apple</div>',
    failure: 'the browser exposes button instead of listbox',
  },
  {
    id: 'unnamed-listbox',
    part: 'listbox',
    html: '<div data-subject role="listbox"><div role="option" aria-selected="false">Apple</div></div>',
    failure: 'the browser exposes the listbox without an accessible name',
  },
  {
    id: 'unnamed-option',
    part: 'option',
    html: '<div role="listbox" aria-label="Fruit"><div data-subject role="option" aria-selected="false"></div></div>',
    failure: 'the browser exposes the option without an accessible name',
  },
  {
    id: 'hidden-listbox',
    part: 'listbox',
    html: '<div data-subject role="listbox" aria-label="Fruit" aria-hidden="true"><div role="option" aria-selected="false">Apple</div></div>',
    failure: 'the browser exposes no role instead of listbox',
  },
];

for (const fixture of cases) {
  test(`listbox.exposure.identity — ${fixture.id}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await checkAccessibilitySpec({
      spec: LISTBOX_PATTERN,
      binding: 'fixture',
      state: fixture.id,
      facts: {part: fixture.part, multiple: false},
      only: ['listbox.exposure.identity'],
      mount: async () => {
        await page.setContent(fixture.html);
        return createChromiumHarness({
          page,
          cdp,
          subject: page.locator('[data-subject]'),
        });
      },
    });
    expect(result.results[0]?.status).toBe(
      fixture.failure === null ? 'pass' : 'fail',
    );
    if (fixture.failure !== null) {
      expect(result.results[0]?.detail).toBe(fixture.failure);
    }
  });
}
