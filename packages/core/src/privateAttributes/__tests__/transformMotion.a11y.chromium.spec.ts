// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/privateAttributes/transformMotion ^packages/core/src/theme/Theme

/**
 * @file transformMotion.a11y.chromium.spec.ts
 * @input Stories whose parts transition a transform (chevrons, a resize
 *   handle, a toast, row expansion), in a built Storybook, in Chromium
 * @output Real-engine proof of each element's computed transition durations:
 *   with motion not reduced a transform takes time; under the person's Reduce
 *   Motion setting, and under a theme that reduces motion for everyone (a
 *   nested system theme inside it, and a layer portaled outside the story
 *   under the root theme), every transform lands within 0.01s, and each
 *   other property keeps the duration the setting gives it
 * @position Run with `pnpm test:a11y-contract`. Computed durations that read
 *   a custom property need a real engine.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORIES = [
  'core-collapsible--single-mode',
  'core-resizable--horizontal-split',
  'core-toast--shown-on-mount',
  'core-selector--default',
  'core-switch--default',
  'core-tablerowexpansion--detail-panel',
  'core-treelist--basic',
  'core-progressbar--default',
];

/** What Theme writes where a theme reduces motion for everyone. */
const MARK_ATTRIBUTE = 'data-astryx-reduced-motion';
const MARK_PROPERTY = '--_astryx-reduced-motion';

type Mode = 'none' | 'setting' | 'nested-mark' | 'root-mark';
type Row = {key: string; properties: string[]; seconds: number[]};

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

/** Every element whose computed transition includes a transform. */
async function sweep(page: Page, story: string, mode: Mode): Promise<Row[]> {
  await page.emulateMedia({
    reducedMotion: mode === 'setting' ? 'reduce' : 'no-preference',
  });
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await page.locator('#storybook-root > *').first().waitFor();
  await page.evaluate(
    ({mode, attribute, property}) => {
      // The nested case marks the story's root, outside the decorator's
      // system Theme; the root case marks <html>, as the root theme does.
      const target =
        mode === 'nested-mark'
          ? document.getElementById('storybook-root')
          : mode === 'root-mark'
            ? document.documentElement
            : null;
      target?.setAttribute(attribute, '');
      target?.style.setProperty(property, '1');
    },
    {mode, attribute: MARK_ATTRIBUTE, property: MARK_PROPERTY},
  );
  return page.evaluate(() => {
    const toSeconds = (value: string) =>
      value.endsWith('ms') ? parseFloat(value) / 1000 : parseFloat(value);
    const rows: {key: string; properties: string[]; seconds: number[]}[] = [];
    document.querySelectorAll('*').forEach((element, index) => {
      const style = getComputedStyle(element);
      const properties = style.transitionProperty.split(/,\s*/);
      // A press surface's scale is gated on the press, not on a duration,
      // and follows in its own change.
      if (
        !properties.includes('transform') ||
        style.transitionProperty ===
          'background-image, background-color, color, opacity, transform'
      ) {
        return;
      }
      const durations = style.transitionDuration.split(/,\s*/).map(toSeconds);
      rows.push({
        key: `${index}:${element.tagName.toLowerCase()}`,
        properties,
        // A list shorter than the properties repeats, as CSS does.
        seconds: properties.map((_, i) => durations[i % durations.length]),
      });
    });
    return rows;
  });
}

const transformSeconds = (row: Row) =>
  row.seconds[row.properties.indexOf('transform')];

for (const story of STORIES) {
  test(`${story}: a transform lands at once under reduced motion, from the setting or a theme`, async ({
    page,
  }) => {
    const none = await sweep(page, story, 'none');
    expect(none.length, 'elements that transition a transform').toBeGreaterThan(
      0,
    );
    expect(
      none.some(row => transformSeconds(row) > 0.05),
      'a transform takes time when motion is not reduced',
    ).toBe(true);

    const setting = await sweep(page, story, 'setting');
    for (const mode of ['nested-mark', 'root-mark'] as const) {
      const marked = await sweep(page, story, mode);
      for (const [label, rows] of [
        ['setting', setting],
        [mode, marked],
      ] as const) {
        for (const row of rows) {
          expect
            .soft(transformSeconds(row), `${label} ${row.key} transform`)
            .toBeLessThanOrEqual(0.01);
        }
      }
      // Every other property keeps the duration the setting gives it.
      const bySetting = new Map(setting.map(row => [row.key, row]));
      for (const row of marked) {
        const reference = bySetting.get(row.key);
        if (reference == null) {
          continue;
        }
        row.properties.forEach((name, i) => {
          if (name !== 'transform') {
            expect
              .soft(
                Math.abs(row.seconds[i] - reference.seconds[i]),
                `${mode} ${row.key} ${name}`,
              )
              .toBeLessThanOrEqual(0.01);
          }
        });
      }
    }
  });
}
