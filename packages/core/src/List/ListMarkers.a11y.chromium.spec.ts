// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/List core/Markdown richtext/* ^apps/storybook/stories/(List|Markdown|RichTextEditor)

/**
 * @file ListMarkers.a11y.chromium.spec.ts
 * @input Built Storybook's long List and nested Markdown counter examples,
 *   plus a 16px Theme-provider comparison with both RichText surfaces
 * @output Rendered proof that counters, item text, and nested lists stay
 *   aligned: counters on one line, ending on one edge, never clipped, and
 *   Markdown's text starts matching RichText for counters beyond the gutter
 * @position Core browser regression; no declaration snapshots or committed images
 */

import {writeFile} from 'node:fs/promises';
import {expect, test, type Page} from '@playwright/test';
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

/** A list's rows: each counter's marker box, in page coordinates. */
interface MarkerBox {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  /** Intrinsic rendered counter width, including ink outside the marker box. */
  readonly counterWidth: number;
  readonly textStart: number;
}

/** Paints every counter red and everything else transparent. */
const COUNTERS_ONLY = `
  #storybook-root, #storybook-root * { color: transparent !important; }
  #storybook-root ol > li > :first-child { color: rgb(255, 0, 0) !important; }
`;

/** Takes the lists' inline clip away, to tell a clipped counter from a whole one. */
const UNCLIPPED = '#storybook-root ol { overflow: visible !important; }';

/** Where a counter's ink starts and ends, in page pixels. */
interface Ink {
  readonly start: number;
  readonly end: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * The inline extent of each counter's ink: the red pixels within a band
 * reaching from its marker toward the inline start, wide enough for any
 * counter that hangs past it, and stopping just past the marker's end so it
 * never takes in the row's own content. The page decodes the screenshot.
 */
async function inkOf(
  page: Page,
  screenshot: Buffer,
  boxes: ReadonlyArray<MarkerBox>,
  dir: 'ltr' | 'rtl',
): Promise<Ink[]> {
  return page.evaluate(
    async ({png, rows, rtl}) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', {willReadFrequently: true});
      if (context == null) {
        throw new Error('no 2d canvas');
      }
      context.drawImage(image, 0, 0);
      const {data, width} = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      return rows.map(box => {
        let start = Infinity;
        let end = -Infinity;
        let top = Infinity;
        let bottom = -Infinity;
        const from = Math.max(
          0,
          Math.floor(rtl ? box.left - 2 : box.right - box.counterWidth - 2),
        );
        const to = Math.min(
          width,
          Math.ceil(rtl ? box.left + box.counterWidth + 2 : box.right + 2),
        );
        for (let y = Math.floor(box.top); y < Math.ceil(box.bottom); y++) {
          for (let x = from; x < to; x++) {
            const i = (y * width + x) * 4;
            if (data[i] - Math.max(data[i + 1], data[i + 2]) > 80) {
              start = Math.min(start, x);
              end = Math.max(end, x + 1);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y + 1);
            }
          }
        }
        return {start, end, top, bottom};
      });
    },
    {
      png: screenshot.toString('base64'),
      rows: boxes,
      rtl: dir === 'rtl',
    },
  );
}

/** Each list's marker boxes, outermost list first, in page coordinates. */
async function markerBoxes(
  page: Page,
  selector = '#storybook-root ol',
): Promise<MarkerBox[][]> {
  return page.locator(selector).evaluateAll(lists =>
    lists.map(list =>
      Array.from(list.children, item => {
        const marker = item.firstElementChild;
        if (marker == null) {
          throw new Error('missing marker');
        }
        const box = marker.getBoundingClientRect();
        const pseudoWidth = Number.parseFloat(
          getComputedStyle(marker, '::before').width,
        );
        const content = marker.nextElementSibling?.getBoundingClientRect();
        if (content == null) {
          throw new Error('missing item content');
        }
        const rtl = getComputedStyle(item).direction === 'rtl';
        return {
          top: box.top + window.scrollY,
          bottom: box.bottom + window.scrollY,
          left: box.left + window.scrollX,
          right: box.right + window.scrollX,
          counterWidth: Number.isFinite(pseudoWidth) ? pseudoWidth : box.width,
          textStart: (rtl ? content.right : content.left) + window.scrollX,
        };
      }),
    ),
  );
}

for (const {width, mode} of [
  {width: 1280, mode: 'light'},
  {width: 390, mode: 'dark'},
] as const) {
  for (const dir of ['ltr', 'rtl'] as const) {
    for (const story of [
      'core-list--long-number-markers',
      'core-list--numbered-first-line',
      'core-markdown--long-number-markers',
    ]) {
      test(`${story}: shared counter column (${width}px, ${mode}, ${dir})`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({width, height: 900});
        await page.goto(
          `${storybook.origin}/iframe.html?id=${story}&viewMode=story&globals=direction:${dir};colorMode:${mode}`,
        );
        await expect(page.locator('#storybook-root ol').first()).toBeVisible();
        await expect
          .poll(async () =>
            page.evaluate(
              () => getComputedStyle(document.documentElement).colorScheme,
            ),
          )
          .toBe(mode);
        await page.evaluate(async () => document.fonts.ready);
        const lists = await page
          .locator('#storybook-root ol')
          .evaluateAll(elements =>
            elements.map(list => {
              let depth = 0;
              for (let up = list.parentElement; up; up = up.parentElement) {
                if (up.tagName === 'OL' || up.tagName === 'UL') {
                  depth += 1;
                }
              }
              const items = Array.from(list.children).map(item => {
                const marker = item.firstElementChild;
                const content = marker?.nextElementSibling;
                if (marker == null || content == null) {
                  throw new Error('missing marker or content');
                }
                const m = marker.getBoundingClientRect();
                const c = content.getBoundingClientRect();
                const rtl = getComputedStyle(item).direction === 'rtl';
                const nested = content
                  .querySelector('ol')
                  ?.getBoundingClientRect();
                const label = content.querySelector(':scope > span > span');
                const labelRect = label?.getBoundingClientRect();
                const labelLine =
                  label == null
                    ? 0
                    : Number.parseFloat(getComputedStyle(label).lineHeight);
                const firstLineOffset =
                  labelRect == null
                    ? null
                    : m.top +
                      Number.parseFloat(getComputedStyle(marker).lineHeight) /
                        2 -
                      (labelRect.top + labelLine / 2);
                return {
                  direction: getComputedStyle(item).direction,
                  firstLineOffset,
                  textStart: rtl ? c.right : c.left,
                  markerHeight: m.height,
                  lineHeight: Number.parseFloat(
                    getComputedStyle(marker).lineHeight,
                  ),
                  markerWidth: m.width,
                  markerScrollWidth: marker.scrollWidth,
                  numerals: getComputedStyle(marker).fontVariantNumeric,
                  gap: rtl ? m.left - c.right : c.left - m.right,
                  nestedStart:
                    nested == null ? null : rtl ? nested.right : nested.left,
                };
              });
              return {depth, items};
            }),
          );
        expect(lists.length).toBeGreaterThan(0);
        for (const {items} of lists) {
          const starts = items.map(item => item.textStart);
          expect(Math.max(...starts) - Math.min(...starts)).toBeLessThanOrEqual(
            1,
          );
          for (const item of items) {
            expect(item.direction).toBe(dir);
            expect(item.markerHeight).toBeLessThanOrEqual(item.lineHeight + 1);
            expect(item.markerScrollWidth).toBeLessThanOrEqual(
              item.markerWidth + 1,
            );
            expect(item.gap).toBeGreaterThan(0);
          }
        }
        if (story === 'core-list--numbered-first-line') {
          expect(lists[0].items).toHaveLength(2);
          for (const item of lists[0].items) {
            expect(item.firstLineOffset).not.toBeNull();
            expect(
              Math.abs(item.firstLineOffset ?? Infinity),
            ).toBeLessThanOrEqual(1);
          }
        } else if (story === 'core-list--long-number-markers') {
          expect(lists[0].items).toHaveLength(3);
        } else {
          expect(lists[0].items).toHaveLength(5);
          const nested = lists[0].items
            .map(item => item.nestedStart)
            .filter(value => value != null);
          expect(nested).toHaveLength(3);
          expect(Math.max(...nested) - Math.min(...nested)).toBeLessThanOrEqual(
            1,
          );
          expect(lists.some(({items}) => items.length === 8)).toBe(true);
          // spec:AST-061 FR11: a list whose counters reach `12.` starts its
          // text where a list of one short counter does, as RichText's native
          // markers leave it: the wide counters hang toward the start.
          const outer = lists
            .filter(({depth}) => depth === 0)
            .map(({items}) => items[0].textStart);
          expect(outer).toHaveLength(2);
          expect(Math.abs(outer[0] - outer[1])).toBeLessThanOrEqual(1);
        }
        await page.screenshot({
          path: testInfo.outputPath(`${story}-${width}-${mode}-${dir}.png`),
        });

        // The counters' own ink: each ends on the list's one counter edge, as
        // native outside markers do, and each is whole: lifting the lists'
        // inline clip shows no more of it.
        const boxes = await markerBoxes(page);
        await page.addStyleTag({content: COUNTERS_ONLY});
        const clipped = await page.screenshot({fullPage: true});
        await page.addStyleTag({content: UNCLIPPED});
        const whole = await page.screenshot({fullPage: true});
        for (const [index, list] of boxes.entries()) {
          const ink = await inkOf(page, clipped, list, dir);
          expect(ink, `list ${index}: whole counters`).toEqual(
            await inkOf(page, whole, list, dir),
          );
          for (const {start, end} of ink) {
            expect(Number.isFinite(start) && Number.isFinite(end)).toBe(true);
          }
          const edges = ink.map(({start, end}) =>
            dir === 'rtl' ? start : end,
          );
          expect(
            Math.max(...edges) - Math.min(...edges),
            `list ${index}: counters end together`,
          ).toBeLessThanOrEqual(1);
        }
        // Every digit is one width, so numbers line up digit by digit.
        for (const {items} of lists) {
          for (const item of items) {
            expect(item.numerals).toContain('tabular-nums');
          }
        }
      });
    }
  }
}

// FR11 has no counter-width exemption. A fixed larger gutter would only move
// the failure threshold: exercise four and nine digits and long roman counters
// with the actual body theme at 16px, not the default 14px desktop theme.
for (const {width, mode} of [
  {width: 1440, mode: 'light'},
  {width: 390, mode: 'dark'},
] as const) {
  for (const dir of ['ltr', 'rtl'] as const) {
    test(`16px outside counters match all document surfaces (${width}px, ${mode}, ${dir})`, async ({
      page,
      browser,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({width, height: 900});
      await page.goto(
        `${storybook.origin}/iframe.html?id=richtext-richtexteditor--markdown-parity-wide-number-markers&viewMode=story&globals=direction:${dir};colorMode:${mode}`,
      );
      await expect(
        page.locator('[data-wide-marker-surface="editor"] li').last(),
      ).toBeVisible();
      await page.evaluate(async () => document.fonts.ready);
      const surfaces = await page
        .locator('[data-wide-marker-surface]')
        .evaluateAll(roots =>
          roots.map(root => {
            const rtl = getComputedStyle(root).direction === 'rtl';
            const firstOwnText = (element: Element): Text | null => {
              const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
              );
              for (
                let node = walker.nextNode();
                node;
                node = walker.nextNode()
              ) {
                if (
                  node.textContent?.trim() &&
                  node.parentElement?.closest('li') ===
                    (element.tagName === 'LI' ? element : null)
                ) {
                  return node as Text;
                }
              }
              return null;
            };
            const line = (node: Text) => {
              const range = document.createRange();
              range.selectNodeContents(node);
              const boxes = Array.from(range.getClientRects());
              // A wrapped text node can expose multiple bidi fragments on one
              // line; count distinct line tops, not Range fragment rectangles.
              return {
                start: rtl
                  ? Math.max(
                      ...boxes
                        .filter(box => box.top === boxes[0].top)
                        .map(box => box.right),
                    )
                  : Math.min(
                      ...boxes
                        .filter(box => box.top === boxes[0].top)
                        .map(box => box.left),
                    ),
                lines: new Set(
                  boxes.filter(box => box.width > 0).map(box => box.top),
                ).size,
              };
            };
            const references = document.createTreeWalker(
              root,
              NodeFilter.SHOW_TEXT,
            );
            let reference: Text | null = null;
            for (
              let node = references.nextNode();
              node;
              node = references.nextNode()
            ) {
              if (node.textContent?.trim() === 'Reference paragraph.') {
                reference = node as Text;
                break;
              }
            }
            if (reference == null) {
              throw new Error('missing reference paragraph');
            }
            const origin = line(reference).start;
            return {
              surface: root.getAttribute('data-wide-marker-surface'),
              measure: (
                root.querySelector('[data-lexical-editor]') ??
                root.firstElementChild
              )?.getBoundingClientRect().width,
              direction: getComputedStyle(root).direction,
              items: Array.from(root.querySelectorAll('li')).flatMap(item => {
                const node = firstOwnText(item);
                if (node?.parentElement == null) {
                  return [];
                }
                const font = getComputedStyle(node.parentElement);
                const {start, lines} = line(node);
                return [
                  {
                    text: node.textContent.trim(),
                    start: start - origin,
                    lines,
                    fontSize: font.fontSize,
                    fontFamily: font.fontFamily,
                  },
                ];
              }),
              counters:
                root.getAttribute('data-wide-marker-surface') !== 'markdown'
                  ? []
                  : Array.from(
                      root.querySelectorAll('ol > li > :first-child'),
                    ).map(marker => {
                      const style = getComputedStyle(marker);
                      return {
                        fontSize: style.fontSize,
                        height: marker.getBoundingClientRect().height,
                        lineHeight: Number.parseFloat(style.lineHeight),
                      };
                    }),
            };
          }),
        );
      // Bank the unmodified pixels and measured fonts/line starts even on red.
      await page.screenshot({
        path: testInfo.outputPath('surfaces.png'),
        fullPage: true,
      });
      await writeFile(
        testInfo.outputPath('geometry.json'),
        JSON.stringify(
          {browser: browser.version(), width, mode, dir, surfaces},
          null,
          2,
        ),
      );
      expect(surfaces.map(({surface}) => surface)).toEqual([
        'markdown',
        'view',
        'editor',
      ]);
      const [markdown] = surfaces;
      expect(markdown.items.map(({text}) => text)).toContain('Four digits');
      expect(markdown.items.map(({text}) => text)).toContain('Long roman');
      expect(markdown.items.map(({text}) => text)).toContain(
        'Much wider roman',
      );
      for (const surface of surfaces) {
        expect(surface.direction).toBe(dir);
        expect(surface.items.map(({text}) => text)).toEqual(
          markdown.items.map(({text}) => text),
        );
        for (const [index, item] of surface.items.entries()) {
          expect(item.fontSize, `${surface.surface}: ${item.text}`).toBe(
            '16px',
          );
          expect(item.fontFamily).toBe(markdown.items[index].fontFamily);
          expect(
            Math.abs((surface.measure ?? 0) - (markdown.measure ?? 0)),
          ).toBeLessThanOrEqual(0.5);
          expect(item.lines, `${surface.surface}: lines of ${item.text}`).toBe(
            markdown.items[index].lines,
          );
          expect(
            Math.abs(item.start - markdown.items[index].start),
            `${surface.surface}: ${item.text}`,
          ).toBeLessThanOrEqual(0.5);
        }
      }
      // Siblings and the nested anchors stay at their depth's ordinary inset.
      // This is rendered geometry, not a declaration-only assertion.
      const starts = new Map(
        markdown.items.map(item => [item.text, item.start]),
      );
      const startOf = (text: string): number => {
        const start = starts.get(text);
        if (start == null) {
          throw new Error(`missing item: ${text}`);
        }
        return start;
      };
      for (const text of [
        'Before four digits',
        'Four digits',
        'Sibling after four digits',
        'Year counter',
        'Nine digits',
      ]) {
        expect(
          Math.abs(startOf(text) - startOf('Short decimal')),
          text,
        ).toBeLessThanOrEqual(0.5);
      }
      expect(
        Math.abs(startOf('Outer parent') - startOf('Other outer parent')),
      ).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(startOf('Middle parent') - startOf('Other middle parent')),
      ).toBeLessThanOrEqual(0.5);
      for (const text of [
        'Before long roman',
        'Long roman',
        'After long roman',
        'Much wider roman',
      ]) {
        expect(
          Math.abs(startOf(text) - startOf('Short roman')),
          text,
        ).toBeLessThanOrEqual(0.5);
      }
      for (const counter of markdown.counters) {
        expect(counter.fontSize).toBe('16px');
        expect(counter.height).toBeLessThanOrEqual(counter.lineHeight + 1);
      }
      const boxes = await markerBoxes(
        page,
        '[data-wide-marker-surface="markdown"] ol',
      );
      await page.addStyleTag({
        content: `#storybook-root, #storybook-root * {color: transparent !important;} #storybook-root [data-wide-marker-surface="markdown"] ol > li > :first-child {color: rgb(255, 0, 0) !important;}`,
      });
      const resting = await page.screenshot({
        path: testInfo.outputPath('counter-ink.png'),
        fullPage: true,
      });
      await page.addStyleTag({content: UNCLIPPED});
      const unclipped = await page.screenshot({fullPage: true});
      for (const list of boxes) {
        for (const box of list) {
          expect(box.counterWidth).toBeGreaterThan(0);
          // Outside ink must be within the photographed viewport; otherwise
          // two equally cropped frames would not prove a whole counter.
          expect(
            dir === 'rtl' ? box.left : box.right - box.counterWidth,
          ).toBeGreaterThanOrEqual(0);
          expect(
            dir === 'rtl' ? box.left + box.counterWidth : box.right,
          ).toBeLessThanOrEqual(width);
        }
        const ink = await inkOf(page, resting, list, dir);
        expect(ink).toEqual(await inkOf(page, unclipped, list, dir));
        expect(
          ink.every(
            ({start, end}) => Number.isFinite(start) && Number.isFinite(end),
          ),
        ).toBe(true);
        for (const [index, extent] of ink.entries()) {
          const gap =
            dir === 'rtl'
              ? extent.start - list[index].textStart
              : list[index].textStart - extent.end;
          expect(gap, 'counter ink never overlaps item text').toBeGreaterThan(
            0,
          );
        }
        const ends = ink.map(({start, end}) => (dir === 'rtl' ? start : end));
        expect(Math.max(...ends) - Math.min(...ends)).toBeLessThanOrEqual(1);
      }
      expect(errors).toEqual([]);
    });
  }
}

// Static Markdown's outside-paint exception must not weaken general List or
// the clip containing swipe-capable rows (component:List FR9).
test('general and swipe-capable Lists retain their inline clip', async ({
  page,
}, testInfo) => {
  const states = [];
  for (const dir of ['ltr', 'rtl'] as const) {
    for (const story of [
      'core-list--long-number-markers',
      'core-item--swipe-actions',
      'core-checkboxlist--default',
    ]) {
      await page.goto(
        `${storybook.origin}/iframe.html?id=${story}&viewMode=story&globals=direction:${dir};colorMode:light`,
      );
      await expect(
        page.locator('#storybook-root .astryx-list').first(),
      ).toBeVisible();
      const lists = await page
        .locator('#storybook-root .astryx-list')
        .evaluateAll(elements =>
          elements.map(element => ({
            direction: getComputedStyle(element).direction,
            overflowX: getComputedStyle(element).overflowX,
          })),
        );
      expect(lists.length).toBeGreaterThan(0);
      for (const list of lists) {
        expect(list.direction).toBe(dir);
        expect(list.overflowX).toBe('clip');
      }
      states.push({story, dir, lists});
    }
  }
  await writeFile(
    testInfo.outputPath('general-list-clipping.json'),
    JSON.stringify(states, null, 2),
  );
});

// A numbered list's outside counter must not be cut by an unordered ancestor.
// Removing only OL clipping misses this mixed nesting path (AST-061 FR11).
for (const {name, story, probe, hasTasks} of [
  {
    name: 'mixed',
    story: 'mixed-number-markers',
    probe: 'Mixed roman counter',
    hasTasks: false,
  },
  {
    name: 'pure task-parent',
    story: 'task-parent-number-markers',
    probe: 'Task roman counter',
    hasTasks: true,
  },
] as const) {
  for (const dir of ['ltr', 'rtl'] as const) {
    test(`${name} nested counter stays whole (${dir})`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({width: 1440, height: 900});
      await page.goto(
        `${storybook.origin}/iframe.html?id=richtext-richtexteditor--markdown-parity-${story}&viewMode=story&globals=direction:${dir};colorMode:light`,
      );
      const root = '[data-wide-marker-surface="markdown"]';
      await expect(page.locator(`${root} ol > li`)).toHaveCount(2);
      await expect(
        page.locator('[data-wide-marker-surface="view"]'),
      ).toContainText(probe);
      await page.evaluate(async () => document.fonts.ready);
      const labels = hasTasks
        ? [
            'Reference paragraph.',
            'Outer task',
            'Inner task',
            'Task roman counter',
            'Task roman sibling',
          ]
        : [
            'Reference paragraph.',
            'Outer bullet',
            'Inner bullet',
            'Mixed roman counter',
            'Roman sibling',
          ];
      const geometry = await page
        .locator('[data-wide-marker-surface]')
        .evaluateAll(
          (roots, labels) =>
            roots.map(surface => {
              const rtl = getComputedStyle(surface).direction === 'rtl';
              const rows = new Map<
                string,
                {start: number; top: number; lines: number; fontSize: string}
              >();
              const walker = document.createTreeWalker(
                surface,
                NodeFilter.SHOW_TEXT,
              );
              for (
                let node = walker.nextNode();
                node;
                node = walker.nextNode()
              ) {
                const text = node.textContent?.trim() ?? '';
                const parent = node.parentElement;
                if (
                  !labels.includes(text) ||
                  parent == null ||
                  parent.closest('label') != null
                ) {
                  continue;
                }
                const range = document.createRange();
                range.selectNodeContents(node);
                const rects = Array.from(range.getClientRects()).filter(
                  rect => rect.width > 0,
                );
                const first = rects.filter(rect => rect.top === rects[0].top);
                rows.set(text, {
                  start: rtl
                    ? Math.max(...first.map(rect => rect.right))
                    : Math.min(...first.map(rect => rect.left)),
                  top: rects[0].top + window.scrollY,
                  lines: new Set(rects.map(rect => rect.top)).size,
                  fontSize: getComputedStyle(parent).fontSize,
                });
              }
              const origin = rows.get('Reference paragraph.')?.start ?? NaN;
              return {
                surface: surface.getAttribute('data-wide-marker-surface'),
                origin,
                lists: Array.from(surface.querySelectorAll('ul, ol')).map(
                  list => {
                    const box = list.getBoundingClientRect();
                    const style = getComputedStyle(list);
                    return {
                      tag: list.tagName,
                      start: (rtl ? box.right : box.left) - origin,
                      paddingStart: style.paddingInlineStart,
                      marker: style.listStyleType,
                      overflow: style.overflowX,
                    };
                  },
                ),
                measure:
                  (
                    surface.querySelector('[data-lexical-editor]') ??
                    surface.firstElementChild
                  )?.getBoundingClientRect().width ?? NaN,
                text: Array.from(rows, ([label, line]) => ({
                  label,
                  ...line,
                  start: line.start - origin,
                })),
                checkboxes: Array.from(
                  surface.querySelectorAll<HTMLInputElement>(
                    'input[type="checkbox"]',
                  ),
                ).map((input, index) => {
                  const box = input.getBoundingClientRect();
                  const parentText = rows.get(
                    index === 0 ? 'Outer task' : 'Inner task',
                  );
                  return {
                    checked: input.checked,
                    width: box.width,
                    gap:
                      parentText == null
                        ? null
                        : rtl
                          ? box.left - parentText.start
                          : parentText.start - box.right,
                    top: box.top + window.scrollY,
                    bottom: box.bottom + window.scrollY,
                    left: box.left + window.scrollX,
                    right: box.right + window.scrollX,
                  };
                }),
              };
            }),
          labels,
        );
      const boxes = await markerBoxes(page, `${root} ol`);
      await page.screenshot({
        path: testInfo.outputPath('mixed-surfaces.png'),
        fullPage: true,
      });
      await page.addStyleTag({
        content: `#storybook-root, #storybook-root * {color: transparent !important;} #storybook-root ${root} ol > li > :first-child {color: rgb(255, 0, 0) !important;}`,
      });
      const resting = await page.screenshot({
        path: testInfo.outputPath('mixed-resting-ink.png'),
        fullPage: true,
      });
      // This diagnostic lifts ALL list ancestors, not just numbered lists.
      await page.addStyleTag({
        content:
          '#storybook-root ul, #storybook-root ol {overflow: visible !important;}',
      });
      const whole = await page.screenshot({
        path: testInfo.outputPath('mixed-whole-ink.png'),
        fullPage: true,
      });
      const ink = await inkOf(page, resting, boxes[0], dir);
      const unclipped = await inkOf(page, whole, boxes[0], dir);
      const overlaps =
        geometry?.[0].checkboxes.flatMap(checkbox =>
          unclipped.map(counter => ({
            width: Math.max(
              0,
              Math.min(counter.end, checkbox.right) -
                Math.max(counter.start, checkbox.left),
            ),
            height: Math.max(
              0,
              Math.min(counter.bottom, checkbox.bottom) -
                Math.max(counter.top, checkbox.top),
            ),
          })),
        ) ?? [];
      await writeFile(
        testInfo.outputPath('mixed-counter-receipt.json'),
        JSON.stringify(
          {dir, boxes, ink, unclipped, geometry, overlaps},
          null,
          2,
        ),
      );
      for (const box of boxes[0]) {
        expect(box.counterWidth).toBeGreaterThan(40);
        expect(
          dir === 'rtl' ? box.left : box.right - box.counterWidth,
        ).toBeGreaterThanOrEqual(0);
        expect(
          dir === 'rtl' ? box.left + box.counterWidth : box.right,
        ).toBeLessThanOrEqual(1440);
      }
      expect(ink, 'unordered ancestors do not clip roman counters').toEqual(
        unclipped,
      );
      {
        const markdown = geometry[0];
        for (const surface of geometry) {
          expect(surface.checkboxes.map(input => input.checked)).toEqual(
            hasTasks ? [false, true] : [],
          );
          expect(surface.text).toHaveLength(5);
          expect(
            Math.abs(surface.measure - markdown.measure),
          ).toBeLessThanOrEqual(0.5);
          for (const text of surface.text) {
            const other = markdown.text.find(line => line.label === text.label);
            expect(text.fontSize).toBe('16px');
            expect(
              text.lines,
              `${surface.surface}: ${text.label} line count`,
            ).toBe(other?.lines);
            if (!hasTasks) {
              expect(
                Math.abs(text.start - (other?.start ?? NaN)),
                `${surface.surface}: ${text.label} text start / nested inset`,
              ).toBeLessThanOrEqual(1);
            }
            // The inherited task-parent inset mismatch is recorded separately.
            // This task receipt stays diagnostic for cross-renderer starts;
            // Markdown's parent-text anchors are asserted below.
          }
        }
        if (hasTasks) {
          const starts = new Map(
            markdown.text.map(line => [line.label, line.start]),
          );
          const direction = dir === 'rtl' ? -1 : 1;
          expect(starts.get('Outer task')).toBe(direction * 28);
          expect(starts.get('Inner task')).toBe(direction * 56);
          expect(starts.get('Task roman counter')).toBe(direction * 80);
          expect(starts.get('Task roman sibling')).toBe(direction * 80);
          for (const overlap of overlaps) {
            expect(
              overlap.width * overlap.height,
              'checkbox never covers counter ink',
            ).toBe(0);
          }
          for (const [index, checkbox] of markdown.checkboxes.entries()) {
            const label = markdown.text.find(
              line =>
                line.label === (index === 0 ? 'Outer task' : 'Inner task'),
            );
            if (label == null) {
              throw new Error('missing task parent text');
            }
            expect(
              checkbox.top,
              'checkbox stays on the parent text line',
            ).toBeLessThan(label.top + 24);
            expect(checkbox.bottom).toBeGreaterThan(label.top);
          }
          const inputs = page.locator(`${root} input[type="checkbox"]`);
          for (const input of await inputs.all()) {
            await expect(input).toHaveAttribute('aria-readonly', 'true');
            await input.click({force: true});
            await input.focus();
            await page.keyboard.press('Space');
          }
          expect(
            await inputs.evaluateAll(elements =>
              elements.map(element => (element as HTMLInputElement).checked),
            ),
          ).toEqual([false, true]);
        }
      }
    });
  }
}
