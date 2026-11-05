// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit InputGroupText

/**
 * @file InputGroupTextAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/InputGroup stories that hold InputGroupText cells, across themes, modes, sizes, direction, and width
 * @output Screenshots and fail-closed sensor receipts for the InputGroupText whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for an InputGroupText audit pull request
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

const OUTPUT = path.resolve('input-group-text-audit-evidence');
const WIDE = {width: 640, height: 400};
const TALL = {width: 640, height: 960};
const NARROW = {width: 320, height: 400};

type Mode = 'light' | 'dark';
type Theme = 'neutral' | 'butter';
type Direction = 'ltr' | 'rtl';
type Story =
  | 'with-prefix'
  | 'with-suffix'
  | 'with-prefix-and-suffix'
  | 'with-icon-prefix'
  | 'all-variations';
type Interaction = 'none' | 'tab';

type AuditCase = {
  key: string;
  story: Story;
  mode: Mode;
  theme: Theme;
  direction: Direction;
  interaction: Interaction;
  viewport: {width: number; height: number};
  args?: Record<string, unknown>;
  // The text cells each story renders, in document order.
  cells: string[];
};

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
  failures: string[];
};

const CELLS: Record<Story, string[]> = {
  'with-prefix': ['$'],
  'with-suffix': ['kg'],
  'with-prefix-and-suffix': ['https://', '.com'],
  'with-icon-prefix': [''],
  'all-variations': ['$', 'https://', '.com', 'Fruit', 'kg', '$', 'Team'],
};

const cases: AuditCase[] = [];
function add(
  story: Story,
  options: {
    theme?: Theme;
    direction?: Direction;
    interaction?: Interaction;
    modes?: Mode[];
    viewport?: {width: number; height: number};
    args?: Record<string, unknown>;
    suffix?: string;
  } = {},
) {
  const theme = options.theme ?? 'neutral';
  const direction = options.direction ?? 'ltr';
  const interaction = options.interaction ?? 'none';
  for (const mode of options.modes ?? ['light', 'dark']) {
    const parts: string[] = [story, options.suffix ?? '', theme];
    if (direction === 'rtl') {
      parts.push('rtl');
    }
    if (interaction !== 'none') {
      parts.push(interaction);
    }
    cases.push({
      key: `${parts.filter(Boolean).join('-')}-${mode}`,
      story,
      mode,
      theme,
      direction,
      interaction,
      viewport: options.viewport ?? WIDE,
      args: options.args,
      cells: CELLS[story],
    });
  }
}

add('with-prefix');
add('with-suffix');
add('with-prefix-and-suffix');
add('with-prefix-and-suffix', {theme: 'butter', modes: ['light']});
add('with-prefix-and-suffix', {direction: 'rtl', modes: ['light']});
add('with-prefix-and-suffix', {
  suffix: 'sm',
  args: {size: 'sm'},
  modes: ['light'],
});
add('with-prefix-and-suffix', {
  suffix: 'lg',
  args: {size: 'lg'},
  modes: ['light'],
});
add('with-prefix-and-suffix', {
  suffix: 'narrow',
  viewport: NARROW,
  modes: ['light'],
});
add('with-icon-prefix');
add('with-prefix', {interaction: 'tab', modes: ['light']});
add('all-variations', {viewport: TALL});

test.describe.configure({retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=core-inputgroup--${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

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

async function observe(page: Page) {
  return page.evaluate(() => {
    const round = (value: number) => Math.round(value * 10) / 10;
    const px = (value: string) => parseFloat(value) || 0;
    function box(rect: DOMRect) {
      return {
        left: round(rect.left),
        top: round(rect.top),
        right: round(rect.right),
        bottom: round(rect.bottom),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    // Resolve a token in the cell's own theme scope, through a probe that
    // takes its paint from the same custom properties.
    function resolveTokens(host: Element) {
      const probe = document.createElement('div');
      probe.style.cssText = [
        'position:absolute',
        'visibility:hidden',
        'background-color:var(--color-background-muted)',
        'color:var(--color-text-secondary)',
        'border-style:solid',
        'border-color:var(--color-border-emphasized)',
        'border-width:var(--border-width)',
        'border-radius:var(--radius-element)',
        'padding-inline:var(--spacing-2)',
        'font-size:var(--text-body-size)',
        'line-height:var(--text-body-leading)',
      ].join(';');
      host.appendChild(probe);
      const style = getComputedStyle(probe);
      const tokens = {
        background: style.backgroundColor,
        text: style.color,
        border: style.borderTopColor,
        borderWidth: px(style.borderTopWidth),
        radius: px(style.borderTopLeftRadius),
        paddingInline: px(style.paddingInlineStart),
        fontSize: px(style.fontSize),
        lineHeight: px(style.lineHeight),
      };
      probe.remove();
      return tokens;
    }
    function luminance(color: string) {
      const [r, g, b] = (color.match(/[\d.]+/g) ?? []).map(Number);
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    }
    function contrast(a: string, b: string) {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return round((high + 0.05) / (low + 0.05));
    }
    const cells = Array.from(
      document.querySelectorAll<HTMLElement>(
        '#storybook-root .astryx-input-group-text',
      ),
    );
    const active = document.activeElement;
    return {
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      fonts: document.fonts.status,
      storybookError:
        document.querySelector('.sb-show-errordisplay') != null ||
        document.body.classList.contains('sb-show-errordisplay'),
      documentOverflow: round(
        document.documentElement.scrollWidth - innerWidth,
      ),
      active: {
        tag: active?.tagName ?? null,
        inGroup: active?.closest('.astryx-input-group') != null,
        isCell: active?.closest('.astryx-input-group-text') != null,
      },
      cells: cells.map(cell => {
        const style = getComputedStyle(cell);
        const row = cell.parentElement as HTMLElement;
        const tokens = resolveTokens(row);
        // The cell rounds its corners by its place among the row's children.
        const siblings = Array.from(row.children);
        const index = siblings.indexOf(cell);
        const previous = cell.previousElementSibling;
        const next = cell.nextElementSibling;
        const range = document.createRange();
        range.selectNodeContents(cell);
        const contentRect = range.getBoundingClientRect();
        const lineTops = new Set(
          Array.from(range.getClientRects()).map(rect => Math.round(rect.top)),
        );
        const cellRect = cell.getBoundingClientRect();
        return {
          text: cell.textContent?.trim() ?? '',
          hasIcon: cell.querySelector('svg') != null,
          role: cell.getAttribute('role'),
          tabindex: cell.getAttribute('tabindex'),
          tabIndex: cell.tabIndex,
          marked: cell.hasAttribute('data-astryx-input-group-item'),
          className: cell.className
            .split(/\s+/)
            .filter(name => name.startsWith('astryx-'))
            .join(' '),
          direction: style.direction,
          box: box(cellRect),
          rowBox: box(row.getBoundingClientRect()),
          rowSize: row.getAttribute('data-size'),
          index,
          memberCount: siblings.length,
          previousBox: previous ? box(previous.getBoundingClientRect()) : null,
          nextBox: next ? box(next.getBoundingClientRect()) : null,
          contentBox: box(contentRect),
          lines: lineTops.size,
          clipped: cell.scrollWidth > cell.clientWidth,
          paint: {
            background: style.backgroundColor,
            text: style.color,
            border: [
              style.borderTopColor,
              style.borderRightColor,
              style.borderBottomColor,
              style.borderLeftColor,
            ],
            borderWidth: [
              px(style.borderTopWidth),
              px(style.borderRightWidth),
              px(style.borderBottomWidth),
              px(style.borderLeftWidth),
            ],
            borderStyle: style.borderTopStyle,
            paddingInline: [
              px(style.paddingInlineStart),
              px(style.paddingInlineEnd),
            ],
            fontSize: px(style.fontSize),
            whiteSpace: style.whiteSpace,
            flexShrink: style.flexShrink,
            radius: {
              topLeft: px(style.borderTopLeftRadius),
              topRight: px(style.borderTopRightRadius),
              bottomRight: px(style.borderBottomRightRadius),
              bottomLeft: px(style.borderBottomLeftRadius),
            },
          },
          tokens,
          contrast: contrast(style.color, style.backgroundColor),
        };
      }),
    };
  });
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

for (const item of cases) {
  test(item.key, async ({browser}) => {
    const context = await browser.newContext({
      viewport: item.viewport,
      deviceScaleFactor: 2,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page
      .locator('#storybook-root .astryx-input-group-text')
      .first()
      .waitFor();
    await settle(page);
    if (item.args) {
      await page.evaluate(async args => {
        const channel = (
          window as unknown as {
            __STORYBOOK_ADDONS_CHANNEL__: {
              emit: (event: string, payload: unknown) => void;
              once: (event: string, listener: () => void) => void;
            };
          }
        ).__STORYBOOK_ADDONS_CHANNEL__;
        const storyId = new URLSearchParams(location.search).get('id');
        await new Promise<void>(resolve => {
          channel.once('storyRendered', () => resolve());
          channel.emit('updateStoryArgs', {storyId, updatedArgs: args});
        });
      }, item.args);
      await settle(page);
    }
    if (item.interaction === 'tab') {
      await page.keyboard.press('Tab');
      await settle(page);
    }

    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.cells.map(cell => cell.box)) ===
      JSON.stringify(observed.cells.map(cell => cell.box));

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };
    const near = (actual: number, expected: number, tolerance = 0.6) =>
      Math.abs(actual - expected) <= tolerance;

    check(storybookSha === checkoutSha, 'storybook build mismatch');
    check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
    check(!observed.storybookError, 'storybook error display');
    check(observed.theme === item.theme, `theme ${observed.theme}`);
    check(observed.mode === item.mode, `mode ${observed.mode}`);
    check(
      observed.viewport.width === item.viewport.width &&
        observed.viewport.height === item.viewport.height,
      'viewport mismatch',
    );
    check(observed.dpr === 2, `dpr ${observed.dpr}`);
    check(observed.reducedMotion, 'reduced motion not applied');
    check(observed.fonts === 'loaded', `fonts ${observed.fonts}`);
    check(geometryStable, 'geometry changed between samples');
    check(
      JSON.stringify(observed.cells.map(cell => cell.text)) ===
        JSON.stringify(item.cells),
      `cells ${JSON.stringify(observed.cells.map(cell => cell.text))}, expected ${JSON.stringify(item.cells)}`,
    );
    check(
      observed.documentOverflow <= 0,
      `document scrolls sideways by ${observed.documentOverflow}px`,
    );
    if (item.interaction === 'tab') {
      check(
        observed.active.tag === 'INPUT' &&
          observed.active.inGroup &&
          !observed.active.isCell,
        `first Tab stop is ${JSON.stringify(observed.active)}, expected the grouped input`,
      );
    }

    observed.cells.forEach((cell, index) => {
      const where = `cell ${index} (${cell.text || 'icon'})`;
      const {paint, tokens} = cell;
      const rtl = item.direction === 'rtl';
      // Plain text: no role and no tab stop.
      check(cell.role == null, `${where} role ${cell.role}`);
      check(
        cell.tabindex == null && cell.tabIndex === -1,
        `${where} tabindex ${cell.tabindex}`,
      );
      // The theme target and the group member marker.
      check(
        cell.className === 'astryx-input-group-text',
        `${where} classes ${cell.className}`,
      );
      check(cell.marked, `${where} is not a marked group member`);
      check(
        cell.rowSize === ((item.args?.size as string | undefined) ?? 'md'),
        `${where} row data-size ${cell.rowSize}`,
      );
      check(
        cell.hasIcon === (item.story === 'with-icon-prefix'),
        `${where} icon ${cell.hasIcon}`,
      );
      check(cell.direction === item.direction, `${where} ${cell.direction}`);
      // Paint and one-line layout.
      check(
        paint.background === tokens.background,
        `${where} background ${paint.background}, expected ${tokens.background}`,
      );
      check(
        paint.text === tokens.text,
        `${where} text ${paint.text}, expected ${tokens.text}`,
      );
      check(
        near(paint.fontSize, tokens.fontSize, 0.01),
        `${where} font size ${paint.fontSize}, expected ${tokens.fontSize}`,
      );
      check(
        paint.paddingInline.every(value => near(value, tokens.paddingInline)),
        `${where} inline padding ${paint.paddingInline.join('/')}, expected ${tokens.paddingInline}`,
      );
      check(
        paint.whiteSpace === 'nowrap',
        `${where} wraps (${paint.whiteSpace})`,
      );
      check(
        paint.flexShrink === '0',
        `${where} flex-shrink ${paint.flexShrink}`,
      );
      check(cell.lines <= 1, `${where} spans ${cell.lines} lines`);
      check(!cell.clipped, `${where} content is clipped`);
      check(
        near(cell.box.height, cell.rowBox.height),
        `${where} height ${cell.box.height}, row ${cell.rowBox.height}`,
      );
      const cellMiddle = (cell.box.top + cell.box.bottom) / 2;
      const contentMiddle = (cell.contentBox.top + cell.contentBox.bottom) / 2;
      check(
        near(contentMiddle, cellMiddle, 1),
        `${where} content middle ${contentMiddle}, cell middle ${cellMiddle}`,
      );
      // An emphasized border of one border width.
      check(
        paint.borderStyle === 'solid',
        `${where} border ${paint.borderStyle}`,
      );
      check(
        paint.border.every(color => color === tokens.border),
        `${where} border colors ${paint.border.join(' / ')}, expected ${tokens.border}`,
      );
      check(
        paint.borderWidth.every(width => near(width, tokens.borderWidth, 0.01)),
        `${where} border widths ${paint.borderWidth.join('/')}, expected ${tokens.borderWidth}`,
      );
      // A cell after the first overlaps its leading neighbour by one
      // border width.
      if (cell.previousBox != null) {
        const overlap = rtl
          ? cell.box.right - cell.previousBox.left
          : cell.previousBox.right - cell.box.left;
        check(
          near(overlap, tokens.borderWidth),
          `${where} overlaps its leading neighbour by ${overlap}, expected ${tokens.borderWidth}`,
        );
      }
      // Only the outer corners of the group round.
      const isFirst = cell.index === 0;
      const isLast = cell.index === cell.memberCount - 1;
      const start = isFirst ? tokens.radius : 0;
      const end = isLast ? tokens.radius : 0;
      const expected = rtl
        ? {topLeft: end, bottomLeft: end, topRight: start, bottomRight: start}
        : {topLeft: start, bottomLeft: start, topRight: end, bottomRight: end};
      for (const corner of Object.keys(expected) as (keyof typeof expected)[]) {
        check(
          near(paint.radius[corner], expected[corner]),
          `${where} ${corner} radius ${paint.radius[corner]}, expected ${expected[corner]}`,
        );
      }
    });

    const png = await page.screenshot({animations: 'disabled'});
    check(png.length > 1000, 'screenshot is empty');
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: `core-inputgroup--${item.story}`,
        mode: item.mode,
        theme: item.theme,
        direction: item.direction,
        viewport: item.viewport,
        interaction: item.interaction,
        args: item.args ?? null,
        cells: item.cells,
        anatomy:
          'one non-interactive astryx-input-group-text cell per addon, with no role and no tab stop, marked as a group member',
        paint:
          'muted background, secondary text at the body text size, an emphasized solid border of one border width, inline padding of spacing-2, all resolved from the theme tokens in the cell scope',
        layout:
          'content on one line, not clipped, not shrunk, centered on the cross axis; the cell fills the row height; a cell after the first overlaps its leading neighbour by one border width; only the outer start corners of the first member and the outer end corners of the last member round, mirrored in RTL; no sideways document scroll',
        focus:
          'tab: the first Tab stop is the grouped input, never a text cell',
        contrast:
          'text-on-background contrast is recorded for information; the token pair is owned by the token layer',
      },
      observed: {
        build: storybookSha,
        ...observed,
        geometryStable,
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      failures,
      passed: failures.length === 0,
    };
    fs.writeFileSync(path.join(OUTPUT, image), png);
    fs.writeFileSync(
      path.join(OUTPUT, `${item.key}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    await context.close();
    expect(failures).toEqual([]);
  });
}

test('manifest is complete', async () => {
  const receiptFiles = fs
    .readdirSync(OUTPUT)
    .filter(file => file.endsWith('.sensors.json'));
  const receipts = receiptFiles.map(
    (file): AuditReceipt =>
      JSON.parse(
        fs.readFileSync(path.join(OUTPUT, file), 'utf8'),
      ) as AuditReceipt,
  );
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        component: 'core/InputGroupText',
        build: checkoutSha,
        frames: cases.map(item => ({
          key: item.key,
          image: `${item.key}.png`,
          receipt: `${item.key}.sensors.json`,
        })),
      },
      null,
      2,
    )}\n`,
  );
  expect(receiptFiles).toHaveLength(cases.length);
  // A receipt left by an earlier build does not count.
  expect(
    receipts
      .filter(receipt => receipt.expected.build !== checkoutSha)
      .map(receipt => receipt.expected),
  ).toEqual([]);
  expect(
    receipts
      .filter(receipt => !receipt.passed)
      .map(receipt => ({frame: receipt.expected, failures: receipt.failures})),
  ).toEqual([]);
});
