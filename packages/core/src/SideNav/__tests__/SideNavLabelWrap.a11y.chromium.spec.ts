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
 *   end; and that the nesting indent is one --spacing-6 step per level
 *   where the row fits, capped so the row's content box keeps 4em, and
 *   never smaller at a deeper level
 * @position Browser proof of AST-020 FR1 (WCAG 1.4.4) for SideNavItem labels
 *   and of component:SideNav FR3's indent cap
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

/**
 * One row per depth, in order: where its content starts (the end of its
 * inline-start padding, from the row's inline start), its content box's
 * width, and 4em and --spacing-6 in its own font.
 */
async function measureIndents(page: Page) {
  return page
    .getByRole('navigation')
    .first()
    .evaluate(nav => {
      const byDepth: {
        start: number;
        contentWidth: number;
        fourEm: number;
        spacing6: number;
      }[] = [];
      for (const row of nav.querySelectorAll<HTMLElement>(
        'a.astryx-side-nav-item, button.astryx-side-nav-item',
      )) {
        let depth = 0;
        for (
          let element = row.parentElement;
          element != null && element !== nav;
          element = element.parentElement
        ) {
          if (element.id.endsWith('-children')) {
            depth++;
          }
        }
        if (byDepth[depth] != null) {
          continue;
        }
        const style = getComputedStyle(row);
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;inline-size:var(--spacing-6)';
        row.append(probe);
        const spacing6 = probe.getBoundingClientRect().width;
        probe.remove();
        const start = parseFloat(style.paddingInlineStart);
        byDepth[depth] = {
          start,
          contentWidth:
            row.clientWidth - start - parseFloat(style.paddingInlineEnd),
          fourEm: 4 * parseFloat(style.fontSize),
          spacing6,
        };
      }
      return byDepth;
    });
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
        for (const row of rows) {
          expect(row.isLabelWhole, row.text).toBe(true);
          expect(row.isOnFirstLine, row.text).toBe(row.fits);
          expect(row.isEndWiderThanBox, row.text).toBe(false);
          expect(row.isAtEnd, row.text).toBe(true);
        }
        const indents = await measureIndents(page);
        for (let depth = 1; depth < indents.length; depth++) {
          const step = indents[depth].start - indents[depth - 1].start;
          // Deeper never indents less.
          expect(step).toBeGreaterThanOrEqual(-0.5);
          if (textPx === 16) {
            // At the default size every row fits, so each level adds one step.
            expect(
              Math.abs(step - indents[depth].spacing6),
            ).toBeLessThanOrEqual(0.5);
          }
          // The content box keeps at least 4em.
          expect(indents[depth].contentWidth).toBeGreaterThanOrEqual(
            indents[depth].fourEm - 0.5,
          );
        }
        if (textPx === 32) {
          // At 200% the deepest row cannot fit both on one line.
          const deep = rows.find(row => row.text.startsWith('Regional'));
          expect(deep?.isOnFirstLine).toBe(false);
        }
      });
    }
  }
}
