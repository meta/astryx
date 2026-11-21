// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SideNavLabelWrap.a11y.chromium.spec.ts
 * @input The built "Nested Long Labels" SideNav story in real Chromium, in
 *   every bundled theme, left to right and right to left, at the default
 *   text size and at 200%
 * @output Evidence that an expanded rail shows every row's full label,
 *   wrapping it instead of cutting it, and that a row's end content sits
 *   beside the label's first line while the label's longest word and the
 *   end content fit on one line, and otherwise on its own line at the row's
 *   end
 * @position Browser proof of AST-020 FR1 (WCAG 1.4.4) for SideNavItem labels.
 *   Known gap: at 200% text in matcha and y2k, the depth-3 indent leaves a
 *   content box narrower than the end content alone, so it cannot sit
 *   inside the row; the next change caps the indent.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

test.afterAll(async () => {
  await storybook?.close();
});

const STORY = 'core-sidenav--nested-long-labels';
const THEMES = [
  'neutral',
  'stone',
  'butter',
  'chocolate',
  'gothic',
  'matcha',
  'y2k',
];

async function open(
  page: Page,
  {
    theme,
    direction,
    textPx,
  }: {theme: string; direction: string; textPx: number},
): Promise<void> {
  await page.setViewportSize({width: 1280, height: 800});
  const session = await page.context().newCDPSession(page);
  await session.send('Page.setFontSizes', {
    fontSizes: {standard: textPx, fixed: Math.round((textPx * 13) / 16)},
  });
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=direction:${direction};astryxTheme:${theme}`,
  );
  const nav = page.getByRole('navigation').first();
  await expect(nav.getByText(/Regional database/)).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
}

/**
 * For each row with end content: whether the label shows in full, whether
 * the end content sits on the label's first line, whether the label's
 * longest word and the end content fit on one line, and whether the end
 * content sits at the row's inline end.
 */
async function measure(page: Page) {
  return page
    .getByRole('navigation')
    .first()
    .evaluate(nav =>
      [...nav.querySelectorAll<HTMLElement>('.astryx-side-nav-item')]
        .filter(row => row.querySelector('.astryx-badge') != null)
        .map(row => {
          const badge = row.querySelector<HTMLElement>('.astryx-badge')!;
          const endBox = badge.parentElement!.getBoundingClientRect();
          const area = badge.parentElement!.parentElement!;
          const label = area.firstElementChild as HTMLElement;
          const style = getComputedStyle(label);
          const lineHeight = parseFloat(style.lineHeight);
          const labelBox = label.getBoundingClientRect();
          const probe = document.createElement('span');
          probe.style.font = style.font;
          probe.style.whiteSpace = 'nowrap';
          probe.style.position = 'absolute';
          document.body.append(probe);
          const longestWord = Math.max(
            ...(label.textContent ?? '').split(/\s+/).map(word => {
              probe.textContent = word;
              return probe.getBoundingClientRect().width;
            }),
          );
          probe.remove();
          const areaBox = area.getBoundingClientRect();
          const gap = parseFloat(getComputedStyle(area).columnGap) || 0;
          const isRtl = getComputedStyle(row).direction === 'rtl';
          return {
            text: (label.textContent ?? '').slice(0, 24),
            isEndWiderThanBox: endBox.width > areaBox.width + 0.5,
            isLabelWhole:
              label.scrollWidth <= label.clientWidth + 1 &&
              labelBox.left >= areaBox.left - 0.5 &&
              labelBox.right <= areaBox.right + 0.5,
            isOnFirstLine: endBox.top < labelBox.top + lineHeight - 1,
            fits: longestWord + gap + endBox.width <= areaBox.width + 0.5,
            isAtEnd: isRtl
              ? Math.abs(endBox.left - areaBox.left) <= 1
              : Math.abs(endBox.right - areaBox.right) <= 1,
          };
        }),
    );
}

for (const textPx of [16, 32]) {
  for (const direction of ['ltr', 'rtl']) {
    for (const theme of THEMES) {
      test(`${theme}, ${direction}, ${textPx === 16 ? 'default' : '200%'} text: every label shows in full and end content moves below only when it cannot fit`, async ({
        page,
      }) => {
        await open(page, {theme, direction, textPx});
        const rows = await measure(page);
        expect(rows.length).toBeGreaterThan(0);
        const isIndentGap = textPx === 32 && ['matcha', 'y2k'].includes(theme);
        for (const row of rows) {
          expect(row.isLabelWhole, row.text).toBe(true);
          expect(row.isOnFirstLine, row.text).toBe(row.fits);
          // The known gap is the only place the end content outgrows the box.
          const isGapRow = isIndentGap && row.text.startsWith('Regional');
          expect(row.isEndWiderThanBox, row.text).toBe(isGapRow);
          if (!isGapRow) {
            expect(row.isAtEnd, row.text).toBe(true);
          }
        }
        if (textPx === 32) {
          // At 200% the depth-3 row cannot fit both on one line.
          const deep = rows.find(row => row.text.startsWith('Regional'));
          expect(deep?.isOnFirstLine).toBe(false);
        }
      });
    }
  }
}
