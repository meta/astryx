// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^apps/storybook/stories/DiffViewer\.stories\.tsx$

/**
 * @file DiffViewerForcedColors.a11y.chromium.spec.ts
 * @input The built Lab/DiffViewer display-options story in real Chromium,
 *   with forced colors on and off
 * @output Evidence that every changed line keeps a visible change marker when
 *   forced colors drop the bars' fill and the row tint: a solid border for an
 *   added line and a dashed one for a removed line, and that nothing changes
 *   without forced colors
 * @position Browser binding for the change markers under forced colors. jsdom
 *   resolves no media queries, so it cannot see the forced-colors styles.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'lab-diffviewer--display-options';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

interface MarkerReading {
  readonly kind: string;
  /** The marker's painted box, 0 when nothing paints. */
  readonly width: number;
  readonly borderStyle: string;
  readonly borderWidth: number;
  readonly fill: string;
}

/**
 * Reads the marker cell of every changed line: the cell that names the change
 * for assistive technology. A cell with no painted marker reads width 0.
 */
async function readMarkers(
  page: Page,
  changeIndicator: 'bars' | 'none',
  hasChangeBackground: boolean,
): Promise<MarkerReading[]> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&args=changeIndicator:${changeIndicator};hasChangeBackground:!${hasChangeBackground}`,
  );
  await page
    .locator('#storybook-root table, #storybook-root [role="table"]')
    .first()
    .waitFor();
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#storybook-root *'))
      .filter(
        element =>
          element.children.length === 0 &&
          (element.textContent === 'Added' ||
            element.textContent === 'Removed'),
      )
      .map(name => {
        const cell = name.parentElement as HTMLElement;
        const marker = Array.from(
          cell.querySelectorAll('span[aria-hidden="true"]'),
        ).find(span => span.textContent === '') as HTMLElement | undefined;
        const style = marker == null ? null : getComputedStyle(marker);
        return {
          kind: name.textContent ?? '',
          width: marker?.getBoundingClientRect().width ?? 0,
          borderStyle: style?.borderInlineStartStyle ?? 'none',
          borderWidth: Number.parseFloat(style?.borderInlineStartWidth ?? '0'),
          fill: style?.backgroundColor ?? '',
        };
      }),
  );
}

for (const [changeIndicator, hasChangeBackground] of [
  ['bars', true],
  ['bars', false],
  ['none', true],
] as const) {
  test(`with forced colors, every changed line keeps its marker as a border (${changeIndicator}, tint ${hasChangeBackground})`, async ({
    page,
  }) => {
    await page.emulateMedia({forcedColors: 'active'});
    const markers = await readMarkers(
      page,
      changeIndicator,
      hasChangeBackground,
    );
    const detail = JSON.stringify(markers);
    expect(
      markers.some(marker => marker.kind === 'Added'),
      detail,
    ).toBe(true);
    expect(
      markers.some(marker => marker.kind === 'Removed'),
      detail,
    ).toBe(true);
    for (const marker of markers) {
      expect(marker.width, detail).toBeGreaterThan(0);
      expect(marker.borderWidth, detail).toBeGreaterThan(0);
      expect(marker.borderStyle, detail).toBe(
        marker.kind === 'Added' ? 'solid' : 'dashed',
      );
    }
  });
}

test('with forced colors, a change neither marked nor tinted stays unmarked', async ({
  page,
}) => {
  await page.emulateMedia({forcedColors: 'active'});
  const markers = await readMarkers(page, 'none', false);
  expect(markers.length).toBeGreaterThan(0);
  for (const marker of markers) {
    expect(marker.width, JSON.stringify(marker)).toBe(0);
  }
});

test('without forced colors, bars keep their fill and no border, and a tint-only change shows no bar', async ({
  page,
}) => {
  await page.emulateMedia({forcedColors: 'none'});
  for (const marker of await readMarkers(page, 'bars', true)) {
    expect(marker.width, JSON.stringify(marker)).toBeGreaterThan(0);
    expect(marker.borderWidth, JSON.stringify(marker)).toBe(0);
  }
  for (const marker of await readMarkers(page, 'none', true)) {
    expect(marker.width, JSON.stringify(marker)).toBe(0);
  }
});
