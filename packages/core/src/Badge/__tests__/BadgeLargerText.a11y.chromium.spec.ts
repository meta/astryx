// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BadgeLargerText.a11y.chromium.spec.ts
 * @input The `Core/Badge` Larger Text story in a built Storybook, in Chromium
 *   at an iPhone's page size (402 x 714), under the neutral theme and under
 *   Butter (whose badges set their own height).
 * @output Real-layout proof that a badge with a label is never shorter than one
 *   line of it, and that nothing else about its size changes: at the default
 *   size its geometry is exactly what it is without that minimum (the theme's
 *   height, Butter's own 30px included); when its text grows (here by raising
 *   the supporting text size on a wrapper) the pill grows with the label,
 *   contains it and shows all
 *   of it, with no width floor; a color-only badge keeps its size at every
 *   text size; and where there is too little room (a crowded row, a cell
 *   narrower than one line) the badge shrinks and stays inside
 *   (component:Badge FR3).
 * @position Run with `pnpm test:a11y-contract`. Line boxes and box sizes need
 *   a real layout engine; jsdom has neither.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

// A phone's page size (an iPhone 17 Pro's): at a desktop width every row fits
// on one line and a squeezed, truncated label would go unseen.
test.use({viewport: {width: 402, height: 714}});

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

interface BadgeBox {
  label: string;
  /** The label is cut with an ellipsis: wider than the room it has. */
  truncated: boolean;
  width: number;
  height: number;
  lineHeight: number;
  labelTop: number;
  labelBottom: number;
  top: number;
  bottom: number;
}

async function badgesIn(page: Page, size: string): Promise<BadgeBox[]> {
  return page.getByTestId(`badge-row-${size}`).evaluate(row =>
    [...row.querySelectorAll<HTMLElement>('.astryx-badge')].map(badge => {
      const box = badge.getBoundingClientRect();
      const label = badge.lastElementChild as HTMLElement;
      const labelBox = label.getBoundingClientRect();
      return {
        label: label.textContent ?? '',
        truncated: label.scrollWidth > label.clientWidth,
        width: box.width,
        height: box.height,
        lineHeight: Number.parseFloat(getComputedStyle(badge).lineHeight),
        labelTop: labelBox.top,
        labelBottom: labelBox.bottom,
        top: box.top,
        bottom: box.bottom,
      };
    }),
  );
}

/**
 * Each badge's size in the row, with and without the minimum this change adds:
 * the "without" pass sets `min-height` back to what it was before (`auto`) on
 * the element itself.
 */
async function withAndWithoutMinimums(page: Page, size: string) {
  return page.getByTestId(`badge-row-${size}`).evaluate(row =>
    [...row.querySelectorAll<HTMLElement>('.astryx-badge')].map(badge => {
      const measure = () => {
        const box = badge.getBoundingClientRect();
        return {width: box.width, height: box.height};
      };
      const withMinimums = measure();
      badge.style.minHeight = 'auto';
      const without = measure();
      badge.style.removeProperty('min-height');
      return {label: badge.textContent ?? '', withMinimums, without};
    }),
  );
}

/**
 * Each badge's natural width in the row: its content's width plus its own
 * inline padding, measured with no minimum or maximum width and sized to its
 * content (`max-content`). A badge with room is exactly this wide, so a width
 * floor (or a stretch) shows up as a difference.
 */
async function naturalWidths(page: Page, size: string): Promise<number[]> {
  return page.getByTestId(`badge-row-${size}`).evaluate(row =>
    [...row.querySelectorAll<HTMLElement>('.astryx-badge')].map(badge => {
      const {style} = badge;
      style.setProperty('width', 'max-content');
      style.setProperty('min-width', '0px');
      style.setProperty('max-width', 'none');
      const width = badge.getBoundingClientRect().width;
      style.removeProperty('width');
      style.removeProperty('min-width');
      style.removeProperty('max-width');
      return width;
    }),
  );
}

/** The neutral theme's badge height: its `--spacing-5`. */
async function spacing5(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.height = 'var(--spacing-5)';
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  });
}

const THEMES = [
  {name: 'neutral', badgeHeight: spacing5},
  // Butter's own badge height (themes/butter/src/butterTheme.ts,
  // `components.badge.base.height`).
  {name: 'butter', badgeHeight: async () => 30},
];

for (const {name, badgeHeight} of THEMES) {
  test.describe(`a badge and its text, ${name} theme`, () => {
    test.beforeEach(async ({page}) => {
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-badge--larger-text&viewMode=story&globals=astryxTheme:${name}`,
      );
      await expect(page.getByTestId('badge-row-default')).toBeVisible();
    });

    test('keeps its exact geometry and the theme height at the default text size', async ({
      page,
    }) => {
      const height = await badgeHeight(page);
      const natural = await naturalWidths(page, 'default');
      for (const [index, badge] of (
        await withAndWithoutMinimums(page, 'default')
      ).entries()) {
        // The new minimum does not bind at the default size …
        expect(badge.withMinimums.width, badge.label).toBeCloseTo(
          badge.without.width,
          2,
        );
        expect(badge.withMinimums.height, badge.label).toBeCloseTo(
          badge.without.height,
          2,
        );
        // … so the badge is as tall as its theme says, and as wide as its
        // content and padding: a color-only badge is its padding alone
        // (component:Badge FR1).
        expect(badge.withMinimums.height, badge.label).toBeCloseTo(height, 1);
        expect(badge.withMinimums.width, badge.label).toBeCloseTo(
          natural[index],
          1,
        );
      }
      for (const badge of await badgesIn(page, 'default')) {
        expect(badge.truncated, badge.label).toBe(false);
      }
    });

    test('stays inside a cell narrower than one line of its text', async ({
      page,
    }) => {
      const boxes = await page.getByTestId('narrow-cell').evaluateAll(cells =>
        cells.map(cell => {
          const badge = cell.querySelector('.astryx-badge');
          const own = cell.getBoundingClientRect();
          const box = badge?.getBoundingClientRect();
          return {
            label: cell.textContent ?? '',
            cell: [own.left, own.right],
            badge: box == null ? null : [box.left, box.right],
          };
        }),
      );
      expect(boxes).toHaveLength(1);
      for (const {label, cell, badge} of boxes) {
        expect(badge, label).not.toBeNull();
        if (badge != null) {
          expect(badge[0], label).toBeGreaterThanOrEqual(cell[0] - 0.5);
          expect(badge[1], label).toBeLessThanOrEqual(cell[1] + 0.5);
        }
      }
    });

    test('stays inside a crowded row at 2.5rem text', async ({page}) => {
      // A title that cannot shrink leaves the count less room than one line of
      // its text is tall: the badge keeps its own width there, where a
      // one-line minimum width would push it out of the row.
      const box = await page.getByTestId('badge-row-crowded').evaluate(row => {
        const badge = row.querySelector('.astryx-badge');
        const own = row.getBoundingClientRect();
        const rect = badge?.getBoundingClientRect();
        return {
          row: [own.left, own.right],
          badge: rect == null ? null : [rect.left, rect.right],
        };
      });
      expect(box.badge).not.toBeNull();
      if (box.badge != null) {
        expect(box.badge[1]).toBeLessThanOrEqual(box.row[1] + 0.5);
      }
    });

    for (const size of ['1.25rem', '2.5rem']) {
      test(`grows with its label at ${size} text, shows all of it, and has no width floor`, async ({
        page,
      }) => {
        const height = await badgeHeight(page);
        const badges = await badgesIn(page, size);
        const natural = await naturalWidths(page, size);
        expect(natural).toHaveLength(badges.length);
        for (const [index, badge] of badges.entries()) {
          if (badge.label === '') {
            // A color-only badge has no text to hold: it keeps its theme
            // height and its padding-only width (component:Badge FR1).
            expect(badge.height).toBeCloseTo(height, 1);
            expect(badge.width).toBeCloseTo(natural[index], 1);
            continue;
          }
          // At least one line of its own text tall …
          expect(badge.height, badge.label).toBeGreaterThanOrEqual(
            badge.lineHeight - 0.5,
          );
          // … so the label stays inside the pill …
          expect(badge.labelTop, badge.label).toBeGreaterThanOrEqual(
            badge.top - 0.5,
          );
          expect(badge.labelBottom, badge.label).toBeLessThanOrEqual(
            badge.bottom + 0.5,
          );
          // … whole rather than cut to an ellipsis, in rows that wrap as a
          // layout must at these sizes …
          expect(badge.truncated, badge.label).toBe(false);
          // … and with no width floor: as wide as its own content and padding,
          // a one-character count included.
          expect(badge.width, badge.label).toBeCloseTo(natural[index], 1);
        }
      });
    }
  });
}
