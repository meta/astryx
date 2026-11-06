// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file MarkdownBlockDirection.a11y.chromium.spec.ts
 * @input Uses the Core/Markdown Default story, given mixed-direction input
 *   through its `children` arg, in a left-to-right and a right-to-left page
 * @output Real-Chromium evidence that each prose block lays out in its own
 *   text's direction, that a block with no strongly directional character
 *   keeps its parent's, and that lists, code and tables keep their parent's
 * @position Browser evidence for spec:AST-061 FR6 on Markdown
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
  await expect(page.locator('#storybook-root blockquote')).toBeVisible();
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
  });
}
