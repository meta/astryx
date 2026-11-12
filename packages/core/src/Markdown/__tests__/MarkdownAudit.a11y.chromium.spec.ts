// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Markdown

/**
 * @file MarkdownAudit.a11y.chromium.spec.ts
 * @input Exact-head Markdown stories, across modes, direction, and widths
 * @output Screenshots and fail-closed sensor receipts for the Markdown whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a Markdown audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('markdown-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};

type Check = (condition: boolean, message: string) => void;

type Frame = {state: string; observed: unknown};

type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  args?: string;
  ready: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const WIDE = {width: 1180, height: 900};
const MEDIUM = {width: 900, height: 760};
const NARROW = {width: 320, height: 720};

const BLOCK_TARGETS = [
  'astryx-markdown-heading',
  'astryx-markdown-paragraph',
  'astryx-markdown-list',
  'astryx-markdown-codeblock',
  'astryx-markdown-blockquote',
  'astryx-markdown-table',
  'astryx-markdown-hr',
  'astryx-markdown-image',
];

test.describe.configure({retries: 0});

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForTimeout(40);
}

async function pageSensors(page: Page) {
  return page.evaluate(() => ({
    mode: document.documentElement.getAttribute('data-theme'),
    theme:
      document
        .querySelector('#storybook-root [data-astryx-theme]')
        ?.getAttribute('data-astryx-theme') ?? null,
    direction: getComputedStyle(
      document.querySelector('#storybook-root [dir]') as Element,
    ).direction,
    viewport: {width: innerWidth, height: innerHeight},
    dpr: devicePixelRatio,
    fonts: document.fonts.status,
    storybookError:
      document.querySelector('.sb-show-errordisplay') != null ||
      document.body.classList.contains('sb-show-errordisplay'),
  }));
}

/** The document root, its blocks' targets and reflected density, and its headings. */
async function documentShape(page: Page) {
  return page.evaluate(blockTargets => {
    const root = document.querySelector(
      '#storybook-root .astryx-markdown',
    ) as HTMLElement;
    const blocks = Array.from(root.children) as HTMLElement[];
    const present = blockTargets.filter(
      name => root.querySelector(`.${name}`) != null,
    );
    return {
      tag: root.tagName.toLowerCase(),
      role: root.getAttribute('role'),
      density: root.getAttribute('data-density'),
      blockDensities: [
        ...new Set(
          blockTargets.flatMap(name =>
            Array.from(root.querySelectorAll(`.${name}`)).map(el =>
              el.getAttribute('data-density'),
            ),
          ),
        ),
      ],
      present,
      headings: Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(
        h => `${h.tagName.toLowerCase()}:${h.textContent}`,
      ),
      paragraphMargin: (() => {
        const paragraph = root.querySelector(
          '.astryx-markdown-paragraph:not(:first-child)',
        );
        return paragraph == null
          ? null
          : parseFloat(getComputedStyle(paragraph).marginBlockStart);
      })(),
      blockCount: blocks.length,
    };
  }, BLOCK_TARGETS);
}

/** Every element in the page that scrolls sideways, and whether the page does. */
async function horizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    page: document.documentElement.scrollWidth - innerWidth,
    scrollers: Array.from(
      document.querySelectorAll('#storybook-root .astryx-markdown *'),
    )
      .filter(el => {
        const style = getComputedStyle(el);
        return (
          el.scrollWidth > el.clientWidth + 1 &&
          (style.overflowX === 'auto' || style.overflowX === 'scroll')
        );
      })
      .map(el => ({
        role: el.getAttribute('role'),
        name: el.getAttribute('aria-label'),
        tabIndex: el.getAttribute('tabindex'),
        insideTable: el.closest('.astryx-markdown-table') != null,
      })),
  }));
}

/** The table block's own semantics, and the named regions inside it. */
async function tableBlock(page: Page) {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll('#storybook-root .astryx-markdown-table'),
    ).map(block => ({
      blockRole: block.getAttribute('role'),
      blockName: block.getAttribute('aria-label'),
      blockTabIndex: block.getAttribute('tabindex'),
      blockOverflowX: getComputedStyle(block).overflowX,
      regions: Array.from(
        block.querySelectorAll('.astryx-table-scroll-wrapper'),
      ).map(r => ({
        role: r.getAttribute('role'),
        name:
          r.getAttribute('aria-label') ??
          document.getElementById(r.getAttribute('aria-labelledby') ?? '')
            ?.textContent ??
          null,
        tabIndex: r.getAttribute('tabindex'),
        scrolls: r.scrollWidth > r.clientWidth + 1,
      })),
      headers: Array.from(block.querySelectorAll('th')).map(th => {
        const style = getComputedStyle(th);
        return {
          text: th.textContent,
          ellipsis:
            style.textOverflow === 'ellipsis' &&
            th.scrollWidth > th.clientWidth,
        };
      }),
    })),
  );
}

/** Direction of each prose block, and where its text starts inside the document. */
async function blockDirections(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      '#storybook-root .astryx-markdown',
    ) as HTMLElement;
    const rootRect = root.getBoundingClientRect();
    const textEdge = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = Array.from(range.getClientRects());
      if (rects.length === 0) {
        return null;
      }
      return {
        fromLeft: Math.round(rects[0].left - rootRect.left),
        fromRight: Math.round(rootRect.right - rects[0].right),
      };
    };
    return Array.from(
      root.querySelectorAll(
        'h1, h2, h3, [role="paragraph"], li, blockquote, td, th',
      ),
    ).map(el => ({
      tag:
        el.getAttribute('role') === 'paragraph'
          ? 'p'
          : el.tagName.toLowerCase(),
      text: (el.textContent ?? '').trim().slice(0, 24),
      dir: el.closest('[dir]')?.getAttribute('dir') ?? null,
      direction: getComputedStyle(el).direction,
      edge: textEdge(el),
    }));
  });
}

/**
 * Contrast of each meaningful text part against the backdrop it paints on.
 * Each foreground is composited over the first opaque ancestor background.
 */
async function contrastPairs(page: Page) {
  return page.evaluate(() => {
    const parse = (value: string) => {
      const m = /rgba?\(([^)]+)\)/.exec(value);
      if (m == null) {
        return null;
      }
      const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean);
      return [Number(r), Number(g), Number(b), Number(a)];
    };
    let unreadable: string[] = [];
    const backdrop = (el: Element) => {
      const layers: number[][] = [];
      let node: Element | null = el;
      while (node != null) {
        const value = getComputedStyle(node).backgroundColor;
        const color = parse(value);
        if (color == null) {
          unreadable.push(value);
        } else if (color[3] > 0) {
          layers.push(color);
          if (color[3] >= 1) {
            break;
          }
        }
        node = node.parentElement;
      }
      let base = [255, 255, 255];
      for (const layer of layers.reverse()) {
        base = base.map((c, i) => layer[i] * layer[3] + c * (1 - layer[3]));
      }
      return base;
    };
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map(c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const root = document.querySelector('#storybook-root .astryx-markdown');
    const parts: [string, string][] = [
      ['paragraph', '.astryx-markdown-paragraph'],
      ['heading', '.astryx-markdown-heading'],
      ['link', 'a'],
      ['strikethrough', 'del, s'],
      ['inline code', 'li code'],
      ['blockquote text', '.astryx-markdown-blockquote [role="paragraph"]'],
      ['table header', 'th'],
      ['table cell', 'td'],
      ['list item', '.astryx-markdown-list li'],
    ];
    return parts.flatMap(([name, selector]) => {
      const el = root?.querySelector(selector);
      if (el == null) {
        return [];
      }
      const style = getComputedStyle(el);
      unreadable = [];
      const parsed = parse(style.color);
      if (parsed == null) {
        unreadable.push(style.color);
      }
      const fg = parsed ?? [0, 0, 0, 1];
      const bg = backdrop(el);
      const composite = bg.map((c, i) => fg[i] * fg[3] + c * (1 - fg[3]));
      const [hi, lo] = [luminance(composite), luminance(bg)].sort(
        (a, b) => b - a,
      );
      const size = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      return [
        {
          part: name,
          foreground: style.color,
          backdrop: `rgb(${bg.map(Math.round).join(', ')})`,
          ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
          threshold: large ? 3 : 4.5,
          unreadable,
        },
      ];
    });
  });
}

const CONTRAST_PART_COUNT = 9;

const HEBREW = /[\u0590-\u05FF]/;

const cases: AuditCase[] = [];
const defaultGaps: Partial<Record<Mode, number | null>> = {};

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `document-${mode}`,
    group: 'document-and-density',
    story: 'core-markdown--default',
    ready: '#storybook-root .astryx-markdown-table',
    mode,
    direction: 'ltr',
    viewport: WIDE,
    run: async (page, check, frame) => {
      const shape = await documentShape(page);
      check(shape.tag === 'div', `root ${shape.tag}`);
      check(shape.role === 'document', `root role ${shape.role}`);
      check(shape.density === 'default', `root density ${shape.density}`);
      check(
        JSON.stringify(shape.blockDensities) === '["default"]',
        `block densities ${shape.blockDensities.join(',')}`,
      );
      const expected = BLOCK_TARGETS.filter(
        name => name !== 'astryx-markdown-image',
      );
      check(
        expected.every(name => shape.present.includes(name)),
        `targets ${shape.present.join(' ')}`,
      );
      check(
        shape.headings[0] === 'h1:Markdown Demo',
        `h1 ${shape.headings[0]}`,
      );
      defaultGaps[mode] = shape.paragraphMargin;
      const contrast = await contrastPairs(page);
      check(
        contrast.length === CONTRAST_PART_COUNT,
        `measured ${contrast.map(pair => pair.part).join(', ')}`,
      );
      for (const pair of contrast) {
        check(
          pair.unreadable.length === 0,
          `${pair.part} colors not read: ${pair.unreadable.join(', ')}`,
        );
        check(
          pair.ratio >= pair.threshold,
          `${pair.part} contrast ${pair.ratio} below ${pair.threshold}`,
        );
      }
      await frame('rest', {shape, contrast});

      const link = page.getByRole('link', {name: 'Links', exact: true});
      await link.hover();
      await settle(page);
      const hovered = await link.evaluate(el => {
        const style = getComputedStyle(el);
        return {
          href: el.getAttribute('href'),
          color: style.color,
          decoration: style.textDecorationLine,
          cursor: style.cursor,
        };
      });
      check(hovered.href === 'https://example.com', `href ${hovered.href}`);
      check(hovered.cursor === 'pointer', `link cursor ${hovered.cursor}`);
      await frame('link-hover', {hovered});

      await page.mouse.move(2, 2);
      await link.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await settle(page);
      const focus = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement;
        const style = getComputedStyle(active);
        return {
          name: active.textContent,
          focusVisible: active.matches(':focus-visible'),
          outline: `${style.outlineStyle} ${style.outlineWidth}`,
          boxShadow: style.boxShadow,
        };
      });
      check(focus.name === 'Links', `focused ${focus.name}`);
      check(focus.focusVisible, 'the link is not :focus-visible');
      // The check accepts the browser's default focus outline.
      check(
        !focus.outline.startsWith('none') || focus.boxShadow !== 'none',
        `no focus indicator: ${focus.outline} / ${focus.boxShadow}`,
      );
      await frame('link-focus-visible', {focus});
    },
  });

  cases.push({
    key: `compact-${mode}`,
    group: 'document-and-density',
    story: 'core-markdown--compact',
    ready: '#storybook-root .astryx-markdown-table',
    mode,
    direction: 'ltr',
    viewport: WIDE,
    run: async (page, check, frame) => {
      const shape = await documentShape(page);
      check(shape.density === 'compact', `root density ${shape.density}`);
      check(
        JSON.stringify(shape.blockDensities) === '["compact"]',
        `block densities ${shape.blockDensities.join(',')}`,
      );
      const defaultGap = defaultGaps[mode];
      check(
        shape.paragraphMargin != null &&
          defaultGap != null &&
          shape.paragraphMargin < defaultGap,
        `compact paragraph margin ${shape.paragraphMargin} not below default ${defaultGap}`,
      );
      await frame('rest', {shape, defaultGap});
    },
  });

  cases.push({
    key: `table-${mode}`,
    group: 'table',
    story: 'core-markdown--table-focused',
    ready: '#storybook-root .astryx-markdown-table table',
    mode,
    direction: 'ltr',
    viewport: WIDE,
    run: async (page, check, frame) => {
      const tables = await tableBlock(page);
      check(tables.length > 0, 'no table block');
      for (const [i, table] of tables.entries()) {
        check(
          table.blockRole == null,
          `table ${i} block role ${table.blockRole}`,
        );
        check(
          table.blockName == null,
          `table ${i} block name ${table.blockName}`,
        );
        check(
          table.blockTabIndex == null,
          `table ${i} block tabindex ${table.blockTabIndex}`,
        );
        check(
          table.regions.length === 1,
          `table ${i} has ${table.regions.length} regions`,
        );
        check(
          table.regions[0]?.role === 'group' && Boolean(table.regions[0]?.name),
          `table ${i} scroll region ${JSON.stringify(table.regions[0])}`,
        );
        check(
          table.headers.every(header => !header.ellipsis),
          `table ${i} truncates a header`,
        );
      }
      await frame('rest', {tables});
    },
  });

  cases.push({
    key: `inline-${mode}`,
    group: 'inline',
    story: 'core-markdown--inline-display',
    ready: '#storybook-root span.astryx-markdown code',
    mode,
    direction: 'ltr',
    viewport: MEDIUM,
    run: async (page, check, frame) => {
      const inline = await page.evaluate(blockTargets => {
        const roots = Array.from(
          document.querySelectorAll('#storybook-root .astryx-markdown'),
        );
        return roots.map(root => ({
          tag: root.tagName.toLowerCase(),
          role: root.getAttribute('role'),
          blockTargets: blockTargets.filter(
            name => root.querySelector(`.${name}`) != null,
          ),
          blockElements: root.querySelectorAll('p, div, ul, ol, pre, table')
            .length,
          link: root.querySelector('a')?.getAttribute('href') ?? null,
        }));
      }, BLOCK_TARGETS);
      check(inline.length === 2, `${inline.length} inline roots`);
      for (const [i, root] of inline.entries()) {
        check(root.tag === 'span', `inline ${i} root ${root.tag}`);
        check(root.role == null, `inline ${i} role ${root.role}`);
        check(
          root.blockTargets.length === 0,
          `inline ${i} block targets ${root.blockTargets.join(' ')}`,
        );
        check(
          root.blockElements === 0,
          `inline ${i} has ${root.blockElements} block elements`,
        );
      }
      check(
        inline[0]?.link === 'https://example.com',
        `inline link ${inline[0]?.link}`,
      );
      await frame('rest', {inline});
    },
  });

  cases.push({
    key: `mixed-direction-ltr-${mode}`,
    group: 'direction',
    story: 'core-markdown--mixed-direction',
    ready: '#storybook-root .astryx-markdown-table td',
    mode,
    direction: 'ltr',
    viewport: MEDIUM,
    run: async (page, check, frame) => {
      const blocks = await blockDirections(page);
      checkMixedDirection(blocks, 'ltr', check);
      await frame('rest', {blocks});
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `mixed-direction-rtl-${mode}`,
    group: 'direction',
    story: 'core-markdown--mixed-direction',
    ready: '#storybook-root .astryx-markdown-table td',
    mode,
    direction: 'rtl',
    viewport: MEDIUM,
    run: async (page, check, frame) => {
      const blocks = await blockDirections(page);
      checkMixedDirection(blocks, 'rtl', check);
      await frame('rest', {blocks});
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `document-rtl-${mode}`,
    group: 'direction',
    story: 'core-markdown--default',
    ready: '#storybook-root .astryx-markdown-table',
    mode,
    direction: 'rtl',
    viewport: WIDE,
    run: async (page, check, frame) => {
      const blocks = await blockDirections(page);
      const heading = blocks.find(block => block.text === 'Markdown Demo');
      // English text keeps its own direction inside a right-to-left document.
      check(
        heading?.direction === 'ltr',
        `heading direction ${heading?.direction}`,
      );
      check(
        heading?.edge != null && heading.edge.fromLeft < heading.edge.fromRight,
        `heading text edge ${JSON.stringify(heading?.edge)}`,
      );
      await frame('rest', {heading});
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `content-align-center-${mode}`,
    group: 'width',
    story: 'core-markdown--content-align-center',
    ready: '#storybook-root .astryx-markdown-table',
    mode,
    direction: 'ltr',
    viewport: WIDE,
    run: async (page, check, frame) => {
      const layout = await page.evaluate(() => {
        const root = document.querySelector(
          '#storybook-root .astryx-markdown',
        ) as HTMLElement;
        const rootRect = root.getBoundingClientRect();
        const measure = (selector: string) => {
          const rect = (
            root.querySelector(selector) as HTMLElement
          ).getBoundingClientRect();
          return {
            width: Math.round(rect.width),
            start: Math.round(rect.left - rootRect.left),
            end: Math.round(rootRect.right - rect.right),
          };
        };
        return {
          root: Math.round(rootRect.width),
          paragraph: measure('.astryx-markdown-paragraph'),
          list: measure('.astryx-markdown-list'),
          code: measure('.astryx-markdown-codeblock'),
          table: measure('.astryx-markdown-table'),
        };
      });
      check(
        layout.paragraph.width <= 580,
        `prose width ${layout.paragraph.width}`,
      );
      check(
        Math.abs(layout.paragraph.start - layout.paragraph.end) <= 1,
        `prose not centered ${JSON.stringify(layout.paragraph)}`,
      );
      check(
        Math.abs(layout.list.start - layout.list.end) <= 1,
        `list not centered ${JSON.stringify(layout.list)}`,
      );
      check(
        layout.code.width > layout.paragraph.width,
        `code block ${layout.code.width} not wider than prose`,
      );
      await frame('rest', {layout});
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `images-${mode}`,
    group: 'width',
    story: 'core-markdown--with-images',
    ready: '#storybook-root .astryx-markdown-image img',
    mode,
    direction: 'ltr',
    viewport: MEDIUM,
    run: async (page, check, frame) => {
      const loaded = await page.evaluate(async () => {
        const imgs = Array.from(
          document.querySelectorAll<HTMLImageElement>(
            '#storybook-root .astryx-markdown-image img',
          ),
        );
        const results = await Promise.all(
          imgs.map(async img =>
            img.decode().then(
              () => img.naturalWidth > 0,
              () => false,
            ),
          ),
        );
        return results.every(Boolean);
      });
      check(loaded, 'an image did not load');
      await settle(page);
      const images = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll('#storybook-root .astryx-markdown-image'),
        ).map(block => {
          const img = block.querySelector('img');
          return {
            alt: img?.getAttribute('alt') ?? null,
            overflows: img != null && img.clientWidth > block.clientWidth + 1,
          };
        }),
      );
      check(images.length === 3, `${images.length} image blocks`);
      check(
        images.every(image => image.alt != null && image.alt !== ''),
        'an image has no alternative text',
      );
      check(
        images.every(image => !image.overflows),
        'an image overflows its block',
      );
      await frame('rest', {images});
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `narrow-document-${mode}`,
    group: 'narrow',
    story: 'core-markdown--default',
    ready: '#storybook-root .astryx-markdown-table',
    mode,
    direction: 'ltr',
    viewport: NARROW,
    run: async (page, check, frame) => {
      const overflow = await horizontalOverflow(page);
      check(overflow.page <= 0, `page scrolls sideways by ${overflow.page}px`);
      check(
        overflow.scrollers.every(s => s.insideTable && s.role === 'group'),
        `unexpected sideways scroller ${JSON.stringify(overflow.scrollers)}`,
      );
      await frame('rest', {overflow});
    },
  });
}

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `narrow-wide-table-${mode}`,
    group: 'narrow',
    story: 'core-markdown--table-narrow-wide-content',
    args: 'width:320',
    ready: '#storybook-root .astryx-markdown-table table',
    mode,
    direction: 'ltr',
    viewport: NARROW,
    run: async (page, check, frame) => {
      const tables = await tableBlock(page);
      const region = tables[0]?.regions[0];
      check(tables.length === 1, `${tables.length} table blocks`);
      check(tables[0]?.blockTabIndex == null, 'the table block is a tab stop');
      check(region?.scrolls === true, 'the wide table does not scroll');
      check(
        region?.tabIndex === '0',
        `scroll region tabindex ${region?.tabIndex}`,
      );
      check(Boolean(region?.name), 'the scroll region has no name');
      const overflow = await horizontalOverflow(page);
      check(overflow.page <= 0, `page scrolls sideways by ${overflow.page}px`);
      await frame('rest', {tables, overflow});
    },
  });
}

function checkMixedDirection(
  blocks: Awaited<ReturnType<typeof blockDirections>>,
  provider: Direction,
  check: Check,
) {
  const prose = blocks.filter(block =>
    ['h2', 'p', 'blockquote', 'li', 'td', 'th'].includes(block.tag),
  );
  const paragraphs = prose.filter(block => block.tag === 'p').length;
  check(paragraphs >= 3, `${paragraphs} paragraphs`);
  check(
    prose.some(block => block.tag === 'blockquote'),
    'no blockquote measured',
  );
  check(prose.length >= 9, `${prose.length} prose blocks`);
  for (const block of prose) {
    const ownDirection = HEBREW.test(block.text) ? 'rtl' : 'ltr';
    check(
      block.direction === ownDirection,
      `${block.tag} "${block.text}" lays out ${block.direction}, its text reads ${ownDirection}`,
    );
    if (block.tag === 'p' && block.edge != null) {
      const startsAtStart =
        ownDirection === 'rtl'
          ? block.edge.fromRight < block.edge.fromLeft
          : block.edge.fromLeft < block.edge.fromRight;
      check(
        startsAtStart,
        `${block.tag} "${block.text}" text edge ${JSON.stringify(block.edge)} in a ${provider} document`,
      );
    }
  }
}

test.beforeAll(async () => {
  fs.mkdirSync(OUTPUT, {recursive: true});
  checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const expected = process.env.ASTRYX_HEAD_SHA;
  if (expected && expected !== checkoutSha) {
    throw new Error(
      `checkout ${checkoutSha} does not match expected head ${expected}`,
    );
  }
  server = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  const response = await fetch(`${server.origin}/astryx-build-sha.txt`);
  if (!response.ok) {
    throw new Error(`Storybook build has no SHA stamp (${response.status})`);
  }
  storybookSha = (await response.text()).trim();
  if (storybookSha !== checkoutSha) {
    throw new Error(
      `Storybook ${storybookSha} does not match checkout ${checkoutSha}`,
    );
  }
});

test.afterAll(async () => {
  await server?.close();
});

async function runCase(page: Page, item: AuditCase) {
  await page.setViewportSize(item.viewport);
  await page.emulateMedia({colorScheme: item.mode, reducedMotion: 'reduce'});
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const args = item.args ? `&args=${item.args}` : '';
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story${args}&globals=colorMode:${item.mode};astryxTheme:neutral;direction:${item.direction}`;
  await page.goto(url, {waitUntil: 'load'});
  await page.locator(item.ready).first().waitFor();
  await settle(page);

  const failures: string[] = [];
  const check: Check = (condition, message) => {
    if (!condition) {
      failures.push(message);
    }
  };
  const sensors = await pageSensors(page);
  check(!sensors.storybookError, 'storybook error display');
  check(sensors.mode === item.mode, `mode ${sensors.mode}`);
  check(sensors.theme === 'neutral', `theme ${sensors.theme}`);
  check(sensors.direction === item.direction, `direction ${sensors.direction}`);
  check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
  check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);

  const frames: (Frame & {file: string; sha256: string})[] = [];
  const frame: FrameSink = async (state, observed) => {
    const screenshot = await page.screenshot({
      animations: 'disabled',
      fullPage: true,
    });
    const file = `${item.key}__${state}.png`;
    fs.writeFileSync(path.join(OUTPUT, file), screenshot);
    frames.push({
      state,
      observed,
      file,
      sha256: createHash('sha256').update(screenshot).digest('hex'),
    });
  };
  await item.run(page, check, frame);
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);

  const receipt = {
    component: 'Markdown',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    args: item.args ?? null,
    mode: item.mode,
    direction: item.direction,
    viewport: item.viewport,
    sensors,
    pageErrors,
    frames,
    passed: failures.length === 0,
    failures,
  };
  fs.writeFileSync(
    path.join(OUTPUT, `${item.key}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return failures.map(failure => `${item.key}: ${failure}`);
}

for (const group of [...new Set(cases.map(item => item.group))]) {
  test(group, async ({browser}) => {
    const context = await browser.newContext({deviceScaleFactor: 2});
    try {
      const page = await context.newPage();
      const failures: string[] = [];
      for (const item of cases.filter(c => c.group === group)) {
        failures.push(...(await runCase(page, item)));
      }
      expect(failures).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
