// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file MarkdownTable.a11y.chromium.spec.ts
 * @input Uses the four narrow-width Markdown table stories and a built Storybook
 * @output Real-Chromium geometry and focus evidence for Markdown table columns
 * @position Layout and focus proof for `component:Markdown`'s table clause. A
 *   DOM emulator resolves no layout: it cannot say whether a column floor
 *   survived cell padding, whether a header wrapped or was cut, whether a token
 *   stayed on one line, or which element actually scrolls. Every expectation
 *   here is measured from a shipping engine.
 *
 * Build the Storybook first:
 *
 *   pnpm storybook:build
 *   pnpm exec playwright test MarkdownTable.a11y.chromium.spec.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('test-results/markdown-table-narrow');

/** Reading widths: two phone-sized columns, a side panel, a roomy document. */
const WIDTHS = [320, 390, 528, 1024] as const;

const SHORT_COLUMNS_STORY = 'core-markdown--table-narrow-short-columns';
const PROSE_COLUMNS_STORY = 'core-markdown--table-narrow-prose-columns';
const EDGE_SHAPES_STORY = 'core-markdown--table-narrow-edge-shapes';
const WIDE_CONTENT_STORY = 'core-markdown--table-narrow-wide-content';
const CHAT_STORY = 'core-markdown--table-in-chat-message';

/**
 * The realistic documents: an API reference, a release dashboard, and a plan
 * comparison matrix. The fixtures above pin geometry; these are what people
 * actually paste into a narrow reading column.
 */
const API_STORY = 'core-markdown--table-realistic-api-reference';
const RELEASE_STORY = 'core-markdown--table-realistic-release-status';
const COMPARISON_STORY = 'core-markdown--table-realistic-comparison';

const REALISTIC_STORIES = [API_STORY, RELEASE_STORY, COMPARISON_STORY];

const ALL_STORIES = [
  SHORT_COLUMNS_STORY,
  PROSE_COLUMNS_STORY,
  EDGE_SHAPES_STORY,
  WIDE_CONTENT_STORY,
  CHAT_STORY,
  ...REALISTIC_STORIES,
];

/**
 * A token this long with no break opportunity in it — an identifier, a status
 * code, a snake_case value — must render on one line. Tokens carrying their own
 * break opportunities (`-`, `/`, `.` in a URL) may legitimately wrap there, and
 * are not what the fixed defect was about: the regression broke words at
 * arbitrary characters.
 */
const LONG_TOKEN_CHARS = 10;
const UNBREAKABLE_TOKEN = /^[A-Za-z0-9_]+$/;

interface HeaderMetrics {
  text: string;
  clientWidth: number;
  scrollWidth: number;
  contentWidth: number;
  lines: number;
  textOverflow: string;
  whiteSpace: string;
}

/** One Markdown table block, with the Table it owns. */
interface TableMetrics {
  index: number;
  scrollerExists: boolean;
  scrollWidth: number;
  clientWidth: number;
  overflowX: string;
  role: string | null;
  label: string | null;
  tabIndex: string | null;
  blockScrollWidth: number;
  blockClientWidth: number;
  blockOverflowX: string;
  blockRole: string | null;
  blockTabIndex: string | null;
  groupsInBlock: number;
  headers: HeaderMetrics[];
  bodyCellLines: number[];
  brokenTokens: string[];
  chPx: number;
}

interface StoryMetrics {
  tables: TableMetrics[];
  groupsInStory: number;
}

let storybook: StaticServer;
const evidence: Record<string, unknown>[] = [];

test.beforeAll(async () => {
  fs.rmSync(OUTPUT, {recursive: true, force: true});
  fs.mkdirSync(OUTPUT, {recursive: true});
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify({version: 2, measurements: evidence}, null, 2)}\n`,
  );
  await storybook?.close();
});

async function openStory(
  page: Page,
  storyId: string,
  width: number,
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story&args=width:${width}`,
    {waitUntil: 'load'},
  );
  await page
    .locator('#storybook-root table')
    .first()
    .waitFor({state: 'visible'});
  // One frame, so layout for the story's width is settled before measuring.
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
  );
}

/** Measure every Markdown table block in the story, in document order. */
async function measure(
  page: Page,
  longTokenChars: number,
): Promise<StoryMetrics> {
  return page.evaluate(
    ({minToken, tokenPattern}: {minToken: number; tokenPattern: string}) => {
      const unbreakable = new RegExp(tokenPattern);
      const root = document.querySelector('#storybook-root') as HTMLElement;

      const lineCount = (element: Element): number => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const tops = new Set<number>();
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width > 0 || rect.height > 0) {
            tops.add(Math.round(rect.top));
          }
        }
        return Math.max(tops.size, 1);
      };

      const tables = Array.from(
        root.querySelectorAll('.astryx-markdown-table'),
      ).map((blockNode, index) => {
        const block = blockNode as HTMLElement;
        const scroller = block.querySelector('.astryx-table-scroll-wrapper');

        const headers = Array.from(block.querySelectorAll('th')).map(th => {
          const styles = getComputedStyle(th);
          return {
            text: (th.textContent ?? '').trim(),
            clientWidth: th.clientWidth,
            scrollWidth: th.scrollWidth,
            contentWidth:
              th.getBoundingClientRect().width -
              parseFloat(styles.paddingLeft) -
              parseFloat(styles.paddingRight),
            lines: lineCount(th),
            textOverflow: styles.textOverflow,
            whiteSpace: styles.whiteSpace,
          };
        });

        const bodyCellLines = Array.from(block.querySelectorAll('tbody td'))
          .filter(cell => (cell.textContent ?? '').trim().length > 0)
          .map(cell => lineCount(cell));

        // A long token that renders across more than one line box was broken
        // mid-word. Walk the real text nodes rather than trusting the markup.
        const brokenTokens: string[] = [];
        const body = block.querySelector('tbody');
        if (body != null) {
          const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
          for (
            let node = walker.nextNode();
            node != null;
            node = walker.nextNode()
          ) {
            const value = node.nodeValue ?? '';
            const pattern = /\S+/g;
            let match = pattern.exec(value);
            while (match != null) {
              if (match[0].length >= minToken && unbreakable.test(match[0])) {
                const range = document.createRange();
                range.setStart(node, match.index);
                range.setEnd(node, match.index + match[0].length);
                const tops = new Set<number>();
                for (const rect of Array.from(range.getClientRects())) {
                  if (rect.width > 0) {
                    tops.add(Math.round(rect.top));
                  }
                }
                if (tops.size > 1) {
                  brokenTokens.push(match[0]);
                }
              }
              match = pattern.exec(value);
            }
          }
        }

        // One `ch` in a header cell, measured rather than assumed.
        let chPx = 0;
        const firstHeader = block.querySelector('th');
        if (firstHeader != null) {
          const probe = document.createElement('span');
          probe.style.cssText =
            'position:absolute;visibility:hidden;font:inherit';
          probe.textContent = '0';
          firstHeader.appendChild(probe);
          chPx = probe.getBoundingClientRect().width;
          probe.remove();
        }

        return {
          index,
          scrollerExists: scroller != null,
          scrollWidth: scroller?.scrollWidth ?? 0,
          clientWidth: scroller?.clientWidth ?? 0,
          overflowX:
            scroller == null ? '' : getComputedStyle(scroller).overflowX,
          role: scroller?.getAttribute('role') ?? null,
          label: scroller?.getAttribute('aria-label') ?? null,
          tabIndex: scroller?.getAttribute('tabindex') ?? null,
          blockScrollWidth: block.scrollWidth,
          blockClientWidth: block.clientWidth,
          blockOverflowX: getComputedStyle(block).overflowX,
          blockRole: block.getAttribute('role'),
          blockTabIndex: block.getAttribute('tabindex'),
          groupsInBlock: block.querySelectorAll('[role="group"]').length,
          headers,
          bodyCellLines,
          brokenTokens,
          chPx,
        };
      });

      return {
        tables,
        groupsInStory: root.querySelectorAll('[role="group"]').length,
      };
    },
    {minToken: longTokenChars, tokenPattern: UNBREAKABLE_TOKEN.source},
  );
}

/**
 * Every table in every story, at every reading width: the invariants that must
 * hold for all of them, whatever the table's shape.
 */
test('Markdown table columns keep their content floor and headers stay readable', async ({
  page,
}) => {
  test.setTimeout(5 * 60 * 1000);
  const failures: string[] = [];

  for (const storyId of ALL_STORIES) {
    for (const width of WIDTHS) {
      await openStory(page, storyId, width);
      const story = await measure(page, LONG_TOKEN_CHARS);
      evidence.push({storyId, width, ...story});
      // Evidence for review: what the reading column actually looks like.
      await page
        .locator('#storybook-root .astryx-markdown')
        .screenshot({path: path.join(OUTPUT, `${storyId}-${width}.png`)});

      const where = `${storyId} @${width}`;
      if (story.tables.length === 0) {
        failures.push(`${where}: no Markdown table block rendered`);
        continue;
      }
      // One scroll region per table, and no others loose in the story.
      if (story.groupsInStory !== story.tables.length) {
        failures.push(
          `${where}: ${story.groupsInStory} role="group" elements for ${story.tables.length} tables`,
        );
      }

      for (const table of story.tables) {
        const at = `${where} table ${table.index}`;
        if (!table.scrollerExists) {
          failures.push(`${at}: no Table scroll region rendered`);
          continue;
        }
        if (table.groupsInBlock !== 1) {
          failures.push(
            `${at}: ${table.groupsInBlock} role="group" elements, expected 1`,
          );
        }
        if (table.label !== 'Table') {
          failures.push(`${at}: scroll region name is ${String(table.label)}`);
        }
        if (table.blockRole != null || table.blockTabIndex != null) {
          failures.push(`${at}: Markdown's block still claims role/tabindex`);
        }
        // Markdown's own block never scrolls; Table's region is the scroller.
        if (table.blockScrollWidth > table.blockClientWidth + 1) {
          failures.push(
            `${at}: Markdown's block overflows (${table.blockScrollWidth} > ${table.blockClientWidth})`,
          );
        }
        if (table.blockOverflowX !== 'visible') {
          failures.push(
            `${at}: Markdown's block has overflow-x: ${table.blockOverflowX}`,
          );
        }

        // Headers wrap; none is cut off or ellipsized.
        for (const header of table.headers) {
          if (header.textOverflow === 'ellipsis') {
            failures.push(
              `${at}: header "${header.text}" keeps text-overflow: ellipsis`,
            );
          }
          if (header.whiteSpace === 'nowrap') {
            failures.push(
              `${at}: header "${header.text}" keeps white-space: nowrap`,
            );
          }
          if (header.scrollWidth > header.clientWidth + 1) {
            failures.push(
              `${at}: header "${header.text}" overflows its cell (${header.scrollWidth} > ${header.clientWidth})`,
            );
          }
        }

        // Long identifiers, codes, and snake_case values keep their tokens
        // whole — including the pathological one, far past the floor cap.
        if (table.brokenTokens.length > 0) {
          failures.push(
            `${at}: tokens broken mid-word — ${table.brokenTokens.join(', ')}`,
          );
        }
      }
    }
  }

  expect(failures).toEqual([]);
});

test('six short columns fit a narrow reading column instead of scrolling', async ({
  page,
}) => {
  for (const width of [390, 528, 1024]) {
    await openStory(page, SHORT_COLUMNS_STORY, width);
    const story = await measure(page, LONG_TOKEN_CHARS);
    evidence.push({storyId: SHORT_COLUMNS_STORY, width, fits: true, ...story});
    const table = story.tables[0];
    expect(
      table.scrollWidth,
      `six short columns should fit at ${width}px`,
    ).toBeLessThanOrEqual(table.clientWidth + 1);
  }
});

test('prose columns wrap to a few readable lines, not one word per line', async ({
  page,
}) => {
  // Six prose columns carry no long tokens, so min-content alone is just the
  // longest word and every cell would wrap once per word. The readable floor
  // is what keeps them legible; measure lines per cell rather than CSS.
  await openStory(page, PROSE_COLUMNS_STORY, 390);
  const story = await measure(page, LONG_TOKEN_CHARS);
  evidence.push({
    storyId: PROSE_COLUMNS_STORY,
    width: 390,
    prose: true,
    ...story,
  });
  const table = story.tables[0];

  // Every cell's longest word count is at least 8, so one-word-per-line would
  // mean 8+ lines. The floor holds each cell to a handful.
  const worst = Math.max(...table.bodyCellLines);
  expect(worst, 'prose cells should wrap to a few lines').toBeLessThanOrEqual(
    6,
  );
  // The floor is real: each column keeps well more than the 4ch minimum.
  for (const header of table.headers) {
    expect(header.contentWidth).toBeGreaterThanOrEqual(4 * table.chPx - 1);
  }
});

test('an edge-shape table keeps one scroll owner per table and one whole token', async ({
  page,
}) => {
  // Five tables in one reading column: a header with no body rows, empty
  // cells, a 180-character token, a link beside inline code, and a
  // minimum-floor column next to a capped one.
  await openStory(page, EDGE_SHAPES_STORY, 390);
  const story = await measure(page, LONG_TOKEN_CHARS);
  evidence.push({
    storyId: EDGE_SHAPES_STORY,
    width: 390,
    edges: true,
    ...story,
  });

  expect(story.tables).toHaveLength(5);
  // Five tables, five scroll regions — no table borrows another's, and none
  // of them is a bare block claiming a role.
  expect(story.groupsInStory).toBe(5);
  for (const table of story.tables) {
    expect(table.groupsInBlock).toBe(1);
    expect(table.blockRole).toBeNull();
    expect(table.blockTabIndex).toBeNull();
  }

  // The header-only table still renders its header row and floors its columns.
  const headerOnly = story.tables[0];
  expect(headerOnly.headers.map(header => header.text)).toEqual([
    'Status',
    'Owner',
  ]);
  expect(headerOnly.bodyCellLines).toEqual([]);

  // The pathological token is 180 characters — far past the 24ch floor cap —
  // so the column grows to its min-content rather than breaking the token.
  // Had the cap clamped it, ~24ch would have fit the reading column and the
  // table would not scroll at all; instead it scrolls several screens wide.
  // (Measured against the container, not against `ch`: the body font is
  // proportional, so 180 characters is not 180 `ch`.)
  const pathological = story.tables[2];
  expect(pathological.brokenTokens).toEqual([]);
  expect(pathological.scrollWidth).toBeGreaterThan(
    pathological.clientWidth * 3,
  );
  expect(pathological.blockScrollWidth).toBeLessThanOrEqual(
    pathological.blockClientWidth + 1,
  );
  expect(pathological.tabIndex).toBe('0');

  // A cell mixing a link with inline code renders both, and the link text is
  // not shredded.
  const linkAndCode = story.tables[3];
  expect(linkAndCode.brokenTokens).toEqual([]);
  expect(
    await page.locator('#storybook-root tbody a').first().isVisible(),
  ).toBe(true);
  expect(
    await page.locator('#storybook-root tbody code').first().isVisible(),
  ).toBe(true);
});

test('a wide table scrolls only in the Table scroll region, and by keyboard', async ({
  page,
}) => {
  await openStory(page, WIDE_CONTENT_STORY, 390);
  const story = await measure(page, LONG_TOKEN_CHARS);
  evidence.push({
    storyId: WIDE_CONTENT_STORY,
    width: 390,
    keyboard: true,
    ...story,
  });
  const table = story.tables[0];

  // The wide table really does overflow, and the overflow is Table's alone.
  expect(story.groupsInStory).toBe(1);
  expect(table.blockRole).toBeNull();
  expect(table.blockTabIndex).toBeNull();
  expect(table.scrollWidth).toBeGreaterThan(table.clientWidth);
  expect(table.overflowX).toBe('auto');
  expect(table.blockScrollWidth).toBeLessThanOrEqual(
    table.blockClientWidth + 1,
  );
  // Focusable only because it scrolls.
  expect(table.tabIndex).toBe('0');

  const scroller = page.locator('.astryx-table-scroll-wrapper');
  await scroller.evaluate(element => {
    (element as HTMLElement).focus({preventScroll: true});
  });
  expect(
    await page.evaluate(() =>
      document.activeElement?.classList.contains('astryx-table-scroll-wrapper'),
    ),
  ).toBe(true);

  const before = await scroller.evaluate(element => element.scrollLeft);
  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.waitForFunction(
    previous =>
      (document.querySelector('.astryx-table-scroll-wrapper') as HTMLElement)
        .scrollLeft > previous,
    before,
  );
  const after = await scroller.evaluate(element => element.scrollLeft);
  expect(after).toBeGreaterThan(before);
});

/**
 * The realistic documents at the two phone-sized reading widths: the states
 * the fix exists for, asserted on the things a reader would notice.
 */
test('realistic tables stay readable at 320 and 390', async ({page}) => {
  test.setTimeout(3 * 60 * 1000);
  const failures: string[] = [];

  for (const storyId of REALISTIC_STORIES) {
    for (const width of [320, 390]) {
      await openStory(page, storyId, width);
      const story = await measure(page, LONG_TOKEN_CHARS);
      evidence.push({storyId, width, realistic: true, ...story});
      const table = story.tables[0];
      const at = `${storyId} @${width}`;

      // Exactly one scroll viewport owns overflow and focus.
      if (story.groupsInStory !== 1) {
        failures.push(
          `${at}: ${story.groupsInStory} scroll regions, expected 1`,
        );
      }
      if (table.label !== 'Table' || table.blockRole != null) {
        failures.push(`${at}: the Table viewport is not the sole named region`);
      }
      // Focusable exactly when it scrolls, never otherwise.
      const scrolls = table.scrollWidth > table.clientWidth + 1;
      if (scrolls !== (table.tabIndex === '0')) {
        failures.push(
          `${at}: scrolls=${scrolls} but tabindex=${String(table.tabIndex)}`,
        );
      }

      // Headers read: none truncated, none overflowing its cell.
      for (const header of table.headers) {
        if (
          header.textOverflow === 'ellipsis' ||
          header.whiteSpace === 'nowrap' ||
          header.scrollWidth > header.clientWidth + 1
        ) {
          failures.push(`${at}: header "${header.text}" is not fully readable`);
        }
      }

      // Identifiers, versions, and status codes stay whole.
      if (table.brokenTokens.length > 0) {
        failures.push(
          `${at}: broken mid-word — ${table.brokenTokens.join(', ')}`,
        );
      }
    }
  }

  expect(failures).toEqual([]);
});

test('an API reference keeps its routes whole and its method column readable', async ({
  page,
}) => {
  // The shape that motivated the fix: a two-character method column beside
  // routes far longer than any floor. Under the old fixed buckets the method
  // column was padded to 60px while `/v2/projects/{projectId}/documents` was
  // shredded; now the route column carries the width and the table scrolls.
  await openStory(page, API_STORY, 390);
  const story = await measure(page, LONG_TOKEN_CHARS);
  evidence.push({storyId: API_STORY, width: 390, routes: true, ...story});
  const table = story.tables[0];

  const routeLines = await page.evaluate(() => {
    const cells = Array.from(
      document.querySelectorAll('#storybook-root tbody tr'),
    ).map(row => row.children[1] as HTMLElement);
    return cells.map(cell => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const tops = new Set<number>();
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0) {
          tops.add(Math.round(rect.top));
        }
      }
      return {text: (cell.textContent ?? '').trim(), lines: tops.size};
    });
  });
  // Each route renders on a single line — not split across two.
  for (const route of routeLines) {
    expect(route.lines, `route ${route.text} should stay on one line`).toBe(1);
  }

  // The method column still reads: `DELETE` is not clipped to `DELE…`.
  const method = table.headers[0];
  expect(method.text).toBe('Method');
  expect(method.scrollWidth).toBeLessThanOrEqual(method.clientWidth + 1);
  // And the table takes the width it needs through its own scroll region.
  expect(table.scrollWidth).toBeGreaterThan(table.clientWidth);
  expect(table.tabIndex).toBe('0');
  expect(table.blockScrollWidth).toBeLessThanOrEqual(
    table.blockClientWidth + 1,
  );
});

test('a comparison matrix keeps long headers readable over short cells', async ({
  page,
}) => {
  // Headers longer than everything beneath them: the case where truncation
  // used to make a column unreadable (`Availabl…`). The header drives the
  // column's floor, so it reads in full rather than being cut; whether it
  // then fits on one line is layout's business, and the wide-content story
  // covers the case where a label is long enough to wrap.
  await openStory(page, COMPARISON_STORY, 390);
  const story = await measure(page, LONG_TOKEN_CHARS);
  evidence.push({
    storyId: COMPARISON_STORY,
    width: 390,
    longHeaders: true,
    ...story,
  });
  const table = story.tables[0];

  const freePlan = table.headers.find(header =>
    header.text.startsWith('Available on'),
  );
  expect(freePlan, 'the long header should be present').toBeDefined();
  // Reads in full: nothing clipped, nothing ellipsized, no nowrap clamp.
  expect(freePlan?.textOverflow).not.toBe('ellipsis');
  expect(freePlan?.whiteSpace).not.toBe('nowrap');
  expect(freePlan?.scrollWidth).toBeLessThanOrEqual(
    (freePlan?.clientWidth ?? 0) + 1,
  );
  // The header carries the column past its short cells: the label's own
  // floor is 20ch (the one-line cap), far more than `No` would ask for.
  expect(freePlan?.contentWidth).toBeGreaterThanOrEqual(20 * table.chPx - 1);
  // Every other header is readable too, including the shortest column.
  for (const header of table.headers) {
    expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth + 1);
    expect(header.contentWidth).toBeGreaterThanOrEqual(4 * table.chPx - 1);
  }
});

test('a chat message carries a realistic table with one scroll owner', async ({
  page,
}) => {
  for (const width of [320, 390]) {
    await openStory(page, CHAT_STORY, width);
    const story = await measure(page, LONG_TOKEN_CHARS);
    evidence.push({storyId: CHAT_STORY, width, chat: true, ...story});
    const table = story.tables[0];

    // The bubble adds no scroller of its own, and no second focus stop.
    expect(story.groupsInStory).toBe(1);
    expect(table.label).toBe('Table');
    expect(table.blockRole).toBeNull();
    expect(table.blockScrollWidth).toBeLessThanOrEqual(
      table.blockClientWidth + 1,
    );
    // Version strings survive the narrowest bubble.
    expect(table.brokenTokens).toEqual([]);
    const bubbleOverflows = await page.evaluate(() => {
      const bubble = document.querySelector('.astryx-chat-message-bubble');
      return bubble == null
        ? null
        : bubble.scrollWidth > bubble.clientWidth + 1;
    });
    expect(bubbleOverflows).toBe(false);
  }
});

test('a column floor survives the cell padding it sits behind', async ({
  page,
}) => {
  // The floor is a `ch` count on the cell's text box. Border-box padding used
  // to eat it: a 4ch floor delivered about 1.5 characters of text, and the old
  // fixed buckets capped a column at 120px however long its content was.
  // Measure the content box against the floor the renderer asked for.
  await openStory(page, WIDE_CONTENT_STORY, 390);
  const wideStory = await measure(page, LONG_TOKEN_CHARS);
  evidence.push({
    storyId: WIDE_CONTENT_STORY,
    width: 390,
    paddingCorrect: true,
    ...wideStory,
  });
  const wide = wideStory.tables[0];
  const identifier = wide.headers.find(header => header.text === 'Identifier');
  const longLabel = wide.headers.find(header =>
    header.text.startsWith('Accessibility status'),
  );
  // `REFERENCE1` is ten characters and cannot break: the column carries it.
  expect(identifier?.contentWidth).toBeGreaterThanOrEqual(10 * wide.chPx - 1);
  // A 42-character label floors the column at 21ch (its body floor) and wraps.
  expect(longLabel?.contentWidth).toBeGreaterThanOrEqual(20 * wide.chPx - 1);
  expect(longLabel?.lines).toBeGreaterThan(1);

  await openStory(page, SHORT_COLUMNS_STORY, 390);
  const shortStory = await measure(page, LONG_TOKEN_CHARS);
  evidence.push({
    storyId: SHORT_COLUMNS_STORY,
    width: 390,
    paddingCorrect: true,
    ...shortStory,
  });
  for (const header of shortStory.tables[0].headers) {
    expect(
      header.contentWidth,
      `header "${header.text}" should keep at least 4ch of text box`,
    ).toBeGreaterThanOrEqual(4 * shortStory.tables[0].chPx - 1);
  }
});
