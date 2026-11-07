// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file MarkdownBlockDirection.a11y.chromium.spec.ts
 * @input Uses the Core/Markdown Default story, given mixed-direction input
 *   through its `children` arg, in a left-to-right and a right-to-left page
 * @output Real-Chromium evidence that each prose block lays out in its own
 *   text's direction, that a block with no strongly directional character
 *   keeps its parent's, that lists, code and tables keep their parent's, and
 *   that an item or cell reading against its list or table keeps the list's
 *   counter column and the table's column lines and alignment
 * @position Browser evidence that Markdown blocks follow their own text's
 *   direction
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORYBOOK_DIR = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;
const STORY = 'core-markdown--default';

const MIXED = [
  '# English heading',
  '',
  'An English paragraph that runs long enough to wrap onto a second line at a phone width.',
  '',
  'פסקה בעברית שמתחילה מימין ונמשכת מספיק כדי לעבור לשורה שנייה ברוחב של טלפון.',
  '',
  'Short English line.',
  '',
  'שורה קצרה.',
  '',
  '12345 — 67%',
  '',
  '- First item',
  '- פריט שני',
  '  - nested English item',
  '',
  '> ציטוט בעברית',
  '',
  '```',
  'const a = 1;',
  '```',
  '',
  '| Name | שם |',
  '| - | - |',
  '| Alice | אליס |',
  '',
  '1. Step one',
  '2. שלב שני',
  '3. Step three',
  '',
  '| Item | Count |',
  '| :--- | ---: |',
  '| Apples | 12 |',
  '| תפוחים | מאה |',
  '',
  '98. Step ninety-eight',
  '99. Step ninety-nine',
  '100. Step one hundred',
  '101. Step one hundred one',
  '',
  '- [ ] English task',
  '- [x] משימה בעברית',
].join('\n');

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

async function renderMixed(page: Page, direction: 'ltr' | 'rtl') {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:${direction}`,
    {waitUntil: 'load'},
  );
  await expect(page.locator('#storybook-root')).not.toBeEmpty();
  await page.evaluate(
    ({storyId, children}) => {
      const channel = (
        window as Window & {
          __STORYBOOK_ADDONS_CHANNEL__?: {
            emit(event: string, payload: unknown): void;
          };
        }
      ).__STORYBOOK_ADDONS_CHANNEL__;
      channel?.emit('updateStoryArgs', {storyId, updatedArgs: {children}});
    },
    {storyId: STORY, children: MIXED},
  );
  // The Default story's own sample also has a blockquote, so wait for the
  // mixed document's last block, which only the mixed document has.
  await expect(
    page.locator('#storybook-root').getByText('משימה בעברית').first(),
  ).toBeVisible();
}

/**
 * For the block holding `text`: its computed direction, and on which edge its
 * first line starts.
 */
async function measure(page: Page, selector: string, text: string) {
  return page.evaluate(
    ({selector, text}) => {
      const block = Array.from(
        document.querySelectorAll<HTMLElement>(`#storybook-root ${selector}`),
      ).find(element => element.textContent?.includes(text));
      if (block == null) {
        throw new Error(`No ${selector} holds ${text}`);
      }
      const range = document.createRange();
      range.selectNodeContents(block);
      const firstLine = range.getClientRects()[0];
      const box = block.getBoundingClientRect();
      const fromLeft = firstLine.left - box.left;
      const fromRight = box.right - firstLine.right;
      return {
        direction: getComputedStyle(block).direction,
        startsAt: fromLeft <= fromRight ? 'left' : 'right',
      };
    },
    {selector, text},
  );
}

for (const pageDirection of ['ltr', 'rtl'] as const) {
  test.describe(`in a ${pageDirection} page`, () => {
    test('a prose block lays out in its own text direction', async ({page}) => {
      await renderMixed(page, pageDirection);
      const direction = async (selector: string, text: string) =>
        (await measure(page, selector, text)).direction;
      expect(
        await direction('[role="paragraph"]', 'An English paragraph'),
      ).toBe('ltr');
      expect(await direction('[role="paragraph"]', 'פסקה בעברית')).toBe('rtl');
      expect(await direction('h1', 'English heading')).toBe('ltr');
      expect(await direction('blockquote', 'ציטוט')).toBe('rtl');
      expect(await direction('li', 'פריט שני')).toBe('rtl');
      expect(await direction('li', 'First item')).toBe('ltr');
      expect(await direction('td', 'אליס')).toBe('rtl');
      expect(await direction('td', 'Alice')).toBe('ltr');
    });

    test('a short line starts on its own text edge', async ({page}) => {
      await renderMixed(page, pageDirection);
      expect(
        (await measure(page, '[role="paragraph"]', 'Short English line'))
          .startsAt,
      ).toBe('left');
      expect(
        (await measure(page, '[role="paragraph"]', 'שורה קצרה')).startsAt,
      ).toBe('right');
    });

    test('a block with no strongly directional character keeps the page direction', async ({
      page,
    }) => {
      await renderMixed(page, pageDirection);
      expect(
        (await measure(page, '[role="paragraph"]', '12345')).direction,
      ).toBe(pageDirection);
    });

    test('a list, a code block and a table keep the page direction', async ({
      page,
    }) => {
      await renderMixed(page, pageDirection);
      expect((await measure(page, 'ul', 'First item')).direction).toBe(
        pageDirection,
      );
      expect((await measure(page, 'pre', 'const a')).direction).toBe(
        pageDirection,
      );
      expect((await measure(page, 'table', 'Alice')).direction).toBe(
        pageDirection,
      );
    });

    test('a numbered item that reads against its list leaves the counter column alone', async ({
      page,
    }) => {
      await renderMixed(page, pageDirection);
      // How far each item's text starts from the edge its own text starts
      // at. The shared counter column is about 32 px wide at this size.
      const textInset = async (text: string) =>
        page.evaluate(
          ({text}) => {
            const item = Array.from(
              document.querySelectorAll<HTMLElement>('#storybook-root ol li'),
            ).find(element => element.textContent?.includes(text));
            if (item == null) {
              throw new Error(`No numbered item holds ${text}`);
            }
            const walker = document.createTreeWalker(
              item,
              NodeFilter.SHOW_TEXT,
            );
            let node = walker.nextNode();
            while (node != null && !(node.textContent ?? '').includes(text)) {
              node = walker.nextNode();
            }
            if (node == null) {
              throw new Error(`No text node holds ${text}`);
            }
            const range = document.createRange();
            range.selectNodeContents(node);
            const line = range.getClientRects()[0];
            const box = item.getBoundingClientRect();
            return getComputedStyle(item).direction === 'rtl'
              ? box.right - line.right
              : line.left - box.left;
          },
          {text},
        );
      const withList =
        pageDirection === 'ltr' ? ['Step one', 'Step three'] : ['שלב שני'];
      const insets = await Promise.all(withList.map(textInset));
      for (const inset of insets) {
        expect(inset).toBeLessThanOrEqual(40);
      }
      expect(Math.max(...insets) - Math.min(...insets)).toBeLessThanOrEqual(1);
      const against = pageDirection === 'ltr' ? 'שלב שני' : 'Step one';
      expect(await textInset(against)).toBeLessThanOrEqual(40);
    });

    test('a cell that reads against its table keeps the table column line and alignment', async ({
      page,
    }) => {
      await renderMixed(page, pageDirection);
      const cell = async (text: string) =>
        page.evaluate(
          ({text, tableDirection}) => {
            const element = Array.from(
              document.querySelectorAll<HTMLElement>('#storybook-root td'),
            ).find(candidate => candidate.textContent?.trim() === text);
            if (element == null) {
              throw new Error(`No cell holds ${text}`);
            }
            const style = getComputedStyle(element);
            const range = document.createRange();
            range.selectNodeContents(element);
            const line = range.getClientRects()[0];
            const box = element.getBoundingClientRect();
            const toEnd =
              tableDirection === 'ltr'
                ? box.right - parseFloat(style.paddingRight) - line.right
                : line.left - box.left - parseFloat(style.paddingLeft);
            return {
              direction: style.direction,
              ruleOnTableEnd: parseFloat(
                tableDirection === 'ltr'
                  ? style.borderRightWidth
                  : style.borderLeftWidth,
              ),
              toEnd,
            };
          },
          {text, tableDirection: pageDirection},
        );
      const againstFirst = pageDirection === 'ltr' ? 'תפוחים' : 'Apples';
      const againstAligned = pageDirection === 'ltr' ? 'מאה' : '12';
      const first = await cell(againstFirst);
      expect(first.direction).not.toBe(pageDirection);
      expect(first.ruleOnTableEnd).toBeGreaterThan(0);
      // The Count column is end-aligned: its text touches the table's end.
      const aligned = await cell(againstAligned);
      expect(Math.abs(aligned.toEnd)).toBeLessThanOrEqual(1);
    });

    test('a wide counter does not move its item text', async ({page}) => {
      await renderMixed(page, pageDirection);
      const starts = await page.evaluate(() =>
        ['ninety-eight', 'ninety-nine', 'one hundred', 'one hundred one'].map(
          text => {
            const item = Array.from(
              document.querySelectorAll<HTMLElement>('#storybook-root ol li'),
            ).find(element => element.textContent?.trim().endsWith(text));
            if (item == null) {
              throw new Error(`No numbered item ends with ${text}`);
            }
            const walker = document.createTreeWalker(
              item,
              NodeFilter.SHOW_TEXT,
            );
            let node = walker.nextNode();
            while (node != null && !(node.textContent ?? '').includes(text)) {
              node = walker.nextNode();
            }
            const range = document.createRange();
            range.selectNodeContents(node ?? item);
            return range.getClientRects()[0].left;
          },
        ),
      );
      expect(Math.max(...starts) - Math.min(...starts)).toBeLessThanOrEqual(
        0.5,
      );
    });

    test('a task item that reads against the page stays in the prose column', async ({
      page,
    }) => {
      await renderMixed(page, pageDirection);
      const fit = await page.evaluate(() => {
        const prose = Array.from(
          document.querySelectorAll<HTMLElement>(
            '#storybook-root [role="paragraph"]',
          ),
        )
          .find(element => element.textContent?.includes('Short English line'))
          ?.getBoundingClientRect();
        if (prose == null) {
          throw new Error('No prose paragraph');
        }
        return ['English task', 'משימה בעברית'].map(text => {
          const label = Array.from(
            document.querySelectorAll<HTMLElement>('#storybook-root li'),
          ).find(element => element.textContent?.includes(text));
          if (label == null) {
            throw new Error(`No task holds ${text}`);
          }
          const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
          let node = walker.nextNode();
          while (node != null && !(node.textContent ?? '').includes(text)) {
            node = walker.nextNode();
          }
          const range = document.createRange();
          range.selectNodeContents(node ?? label);
          const box = range.getBoundingClientRect();
          return box.left >= prose.left - 1 && box.right <= prose.right + 1;
        });
      });
      expect(fit).toEqual([true, true]);
    });
  });
}
