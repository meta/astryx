// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Field/inputStyles\.stylex\.ts|packages/core/src/Field/__tests__/FieldStatusFocusRing|apps/storybook/stories/(TextInput|TextArea|NumberInput|Selector|MultiSelector|DateInput|DateRangeInput|TimeInput|Typeahead|Tokenizer|PowerSearch)\.stories)

/**
 * @file FieldStatusFocusRing.a11y.chromium.spec.ts
 * @input Checked-in status comparison stories of every field that shows a
 *   status on the shared input wrapper
 * @output Real-browser evidence that a field with an error, warning or
 *   success status still shows keyboard focus
 * @position Browser lane for WCAG 2.4.7 on the shared input wrapper styles: a
 *   status keeps its border color on focus, so the focus ring must stay
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => storybook?.close());

const STORIES = [
  'core-textinput--status-variant-comparison',
  'core-textarea--status-variant-comparison',
  'core-numberinput--status-variant-comparison',
  'core-selector--status-variant-comparison',
  'core-multiselector--status-variant-comparison',
  'core-dateinput--status-variant-comparison',
  'core-daterangeinput--status-variant-comparison',
  'core-timeinput--status-variant-comparison',
  'core-typeahead--status-variant-comparison',
  'core-tokenizer--status-variant-comparison',
  'core-powersearch--status-variant-comparison',
] as const;

for (const story of STORIES) {
  test(`${story}: every field with a status shows keyboard focus`, async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    );
    await page
      .locator(
        '#storybook-root :is(input, textarea, [role="combobox"], button)',
      )
      .first()
      .waitFor();

    // Record each bordered field wrapper's edge at rest, keyed by a marker.
    const statusFields = await page.evaluate(() => {
      const wrappers = new Set<HTMLElement>();
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>(
          '#storybook-root input, #storybook-root textarea, #storybook-root [role="combobox"], #storybook-root button',
        ),
      )) {
        let node: HTMLElement | null = el;
        while (node != null && node.id !== 'storybook-root') {
          const style = getComputedStyle(node);
          if (
            style.borderTopStyle === 'solid' &&
            parseFloat(style.borderTopWidth) > 0 &&
            node.contains(el)
          ) {
            wrappers.add(node);
            break;
          }
          node = node.parentElement;
        }
      }
      let n = 0;
      const out: {key: string; border: string; shadow: string}[] = [];
      for (const wrapper of wrappers) {
        const style = getComputedStyle(wrapper);
        const key = String(n++);
        wrapper.setAttribute('data-ring-probe', key);
        out.push({key, border: style.borderTopColor, shadow: style.boxShadow});
      }
      return out;
    });
    const atRest = new Map(statusFields.map(f => [f.key, f]));

    const checked = new Set<string>();
    const missing: string[] = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const wrapper = el?.closest<HTMLElement>('[data-ring-probe]');
        if (el == null || wrapper == null) {
          return null;
        }
        const style = getComputedStyle(wrapper);
        return {
          key: wrapper.getAttribute('data-ring-probe') ?? '',
          border: style.borderTopColor,
          shadow: style.boxShadow,
          name:
            el.getAttribute('aria-label') ??
            (el as HTMLInputElement).placeholder ??
            el.textContent ??
            '',
        };
      });
      if (focused == null || checked.has(focused.key)) {
        continue;
      }
      checked.add(focused.key);
      const rest = atRest.get(focused.key);
      if (rest == null) {
        continue;
      }
      if (focused.border === rest.border && focused.shadow === rest.shadow) {
        missing.push(focused.name.trim().slice(0, 40) || focused.key);
      }
    }

    expect(checked.size, 'Tab reaches the fields').toBeGreaterThan(0);
    expect(missing, 'fields whose edge does not change on focus').toEqual([]);
  });
}
