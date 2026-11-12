// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit List

/**
 * @file ListAudit.a11y.chromium.spec.ts
 * @input Exact-head List and ContainerCorners stories, across modes and direction
 * @output Screenshots and fail-closed sensor receipts for the List whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a List audit pull request
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

const OUTPUT = path.resolve('list-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};

type Check = (condition: boolean, message: string) => void;

type Frame = {state: string; observed: unknown};

type AuditCase = {
  key: string;
  story: string;
  ready: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

type FrameSink = (state: string, observed: unknown) => Promise<void>;

const SMALL = {width: 640, height: 420};
const WIDE = {width: 1180, height: 760};

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

/** The list's semantics: role, name source, and its rows. */
async function listSemantics(page: Page, listSelector: string) {
  return page.evaluate(sel => {
    const list = document.querySelector(sel) as HTMLElement;
    const labelledBy = list.getAttribute('aria-labelledby');
    const label = labelledBy ? document.getElementById(labelledBy) : null;
    const rows = Array.from(list.children).filter(
      child => child.tagName === 'LI',
    );
    return {
      tag: list.tagName.toLowerCase(),
      role: list.getAttribute('role'),
      start: list.getAttribute('start'),
      classes: Array.from(list.classList).filter(name =>
        name.startsWith('astryx-'),
      ),
      labelText: label?.textContent ?? null,
      labelIsHeaderOfList:
        label != null && label.parentElement === list.parentElement,
      gap: getComputedStyle(list).rowGap,
      rows: rows.map(row => {
        const style = getComputedStyle(row);
        return {
          text: row.textContent,
          dividerBelow: style.borderBlockEndWidth,
          current:
            row.hasAttribute('aria-current') ||
            row.querySelector('[aria-current]') != null,
        };
      }),
    };
  }, listSelector);
}

/** Row corner radii in logical order: start-start, start-end, end-start, end-end. */
async function rowRadii(page: Page, rowSelector: string) {
  return page.evaluate(sel => {
    return Array.from(document.querySelectorAll(sel)).map(row => {
      const style = getComputedStyle(row);
      return [
        style.borderStartStartRadius,
        style.borderStartEndRadius,
        style.borderEndStartRadius,
        style.borderEndEndRadius,
      ];
    });
  }, rowSelector);
}

/** The radius of the nearest clipping, rounded ancestor of the first row. */
async function hostRadius(page: Page, rowSelector: string) {
  return page.evaluate(sel => {
    let node = document.querySelector(sel)?.parentElement ?? null;
    while (node != null) {
      const style = getComputedStyle(node);
      const radius = parseFloat(style.borderTopLeftRadius);
      if (radius > 0 && style.overflow !== 'visible') {
        return radius;
      }
      node = node.parentElement;
    }
    return 0;
  }, rowSelector);
}

/**
 * Inline geometry of each edge treatment inside its Card: the heading's start,
 * the first static row's label start, and that row's paint edge, measured
 * from the card's inline-start side so right-to-left reads the same way.
 */
async function edgeGeometry(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('#storybook-root [dir]') as Element;
    const rtl = getComputedStyle(root).direction === 'rtl';
    const textStart = (el: Element, text: string) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node != null && node.textContent !== text) {
        node = walker.nextNode();
      }
      if (node == null) {
        return null;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect();
    };
    return Array.from(document.querySelectorAll('[data-edge]')).map(card => {
      const cardRect = card.getBoundingClientRect();
      const cardStyle = getComputedStyle(card);
      const border = parseFloat(
        rtl ? cardStyle.borderRightWidth : cardStyle.borderLeftWidth,
      );
      const padding = parseFloat(
        rtl ? cardStyle.paddingRight : cardStyle.paddingLeft,
      );
      const fromStart = (rect: DOMRect | null, side: 'start' | 'end') => {
        if (rect == null) {
          return null;
        }
        const edge = rtl
          ? side === 'start'
            ? rect.right
            : rect.left
          : side === 'start'
            ? rect.left
            : rect.right;
        const origin = rtl ? cardRect.right : cardRect.left;
        return Math.round(Math.abs(edge - origin) * 10) / 10;
      };
      const heading = card.querySelector('h3');
      const row = Array.from(card.querySelectorAll('li')).find(li =>
        li.textContent?.startsWith('Ada Lovelace'),
      ) as HTMLElement;
      return {
        edge: card.getAttribute('data-edge'),
        border,
        paddingEdge: border,
        contentLine: border + padding,
        headingText: fromStart(
          heading ? textStart(heading, heading.textContent ?? '') : null,
          'start',
        ),
        labelText: fromStart(textStart(row, 'Ada Lovelace'), 'start'),
        rowPaintStart: fromStart(row.getBoundingClientRect(), 'start'),
      };
    });
  });
}

function near(a: number | null, b: number | null, tolerance = 1) {
  return a != null && b != null && Math.abs(a - b) <= tolerance;
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `header-dividers-${mode}`,
    story: 'core-list--with-dividers',
    ready: '#storybook-root ul',
    mode,
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const semantics = await listSemantics(page, '#storybook-root ul');
      const named = await page
        .getByRole('list', {name: 'Settings', exact: true})
        .count();
      check(semantics.role === 'list', `role ${semantics.role}`);
      check(semantics.labelText === 'Settings', `label ${semantics.labelText}`);
      check(semantics.labelIsHeaderOfList, 'header is not beside the list');
      check(named === 1, `${named} lists named Settings`);
      check(semantics.rows.length === 3, `${semantics.rows.length} rows`);
      check(semantics.gap === '0px', `divided list gap ${semantics.gap}`);
      check(
        JSON.stringify(semantics.classes) === '["astryx-list"]',
        `targets ${semantics.classes.join(' ')}`,
      );
      await frame('rest', {semantics, named});
    },
  });

  cases.push({
    key: `interactive-states-${mode}`,
    story: 'core-list--interactive',
    ready: '#storybook-root ul',
    mode,
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const semantics = await listSemantics(page, '#storybook-root ul');
      check(semantics.rows.length === 3, `${semantics.rows.length} rows`);
      check(
        semantics.rows.filter(row => row.current).length === 1,
        'one row carries aria-current',
      );
      const rowPaint = async (label: string) =>
        page.evaluate(text => {
          const row = Array.from(
            document.querySelectorAll('#storybook-root li'),
          ).find(li => li.textContent === text) as HTMLElement;
          const style = getComputedStyle(row);
          const before = getComputedStyle(row, '::before');
          return {
            background: style.backgroundColor,
            beforeBackground: before.backgroundColor,
            cursor: getComputedStyle(row.querySelector('button') ?? row).cursor,
          };
        }, label);
      await frame('rest', {semantics, sent: await rowPaint('Sent')});

      await page.getByRole('button', {name: 'Sent'}).hover();
      await settle(page);
      const hovered = await rowPaint('Sent');
      const alpha = Number(
        /rgba\([^)]*,\s*([\d.]+)\)/.exec(hovered.background)?.[1] ?? 1,
      );
      check(
        alpha > 0 && alpha < 1,
        `hover paints ${hovered.background}, not a translucent overlay`,
      );
      await frame('hover', {sent: hovered});

      await page.mouse.move(2, 2);
      await page.keyboard.press('Tab');
      await settle(page);
      const focus = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        const row = active?.closest('li');
        const ring = row ? getComputedStyle(row) : null;
        return {
          name: active?.textContent ?? active?.getAttribute('aria-label'),
          inList: row != null,
          rowOutline: ring
            ? `${ring.outlineStyle} ${ring.outlineWidth} ${ring.outlineColor}`
            : null,
          focusVisible: active?.matches(':focus-visible') ?? false,
        };
      });
      check(focus.inList, 'Tab did not reach a row');
      check(focus.focusVisible, 'the focused row is not :focus-visible');
      check(
        /^solid ([2-9]|\d{2,})(\.\d+)?px /.test(focus.rowOutline ?? ''),
        `focused row ring ${focus.rowOutline}`,
      );
      await frame('focus-visible', {focus});
    },
  });

  cases.push({
    key: `edge-in-card-${mode}`,
    story: 'core-list--edge-in-card',
    ready: '#storybook-root [data-edge="bleed"] li',
    mode,
    direction: 'ltr',
    viewport: WIDE,
    run: async (page, check, frame) => {
      const geometry = await edgeGeometry(page);
      checkEdgeGeometry(geometry, check);
      await frame('rest', {geometry});
    },
  });
}

cases.push({
  key: 'edge-in-card-rtl-light',
  story: 'core-list--edge-in-card',
  ready: '#storybook-root [data-edge="bleed"] li',
  mode: 'light',
  direction: 'rtl',
  viewport: WIDE,
  run: async (page, check, frame) => {
    const geometry = await edgeGeometry(page);
    checkEdgeGeometry(geometry, check);
    await frame('rest', {geometry});
  },
});

cases.push({
  key: 'ordered-light',
  story: 'core-list--long-number-markers',
  ready: '#storybook-root ol',
  mode: 'light',
  direction: 'ltr',
  viewport: SMALL,
  run: async (page, check, frame) => {
    const semantics = await listSemantics(page, '#storybook-root ol');
    check(semantics.tag === 'ol', `element ${semantics.tag}`);
    check(semantics.start === '98', `start ${semantics.start}`);
    check(semantics.role === 'list', `role ${semantics.role}`);
    await frame('rest', {semantics});
  },
});

for (const density of ['compact', 'spacious'] as const) {
  cases.push({
    key: `density-${density}-light`,
    story: `core-list--${density}`,
    ready: '#storybook-root ul',
    mode: 'light',
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const list = await page.evaluate(() => {
        const ul = document.querySelector('#storybook-root ul') as HTMLElement;
        return {
          density: ul.getAttribute('data-density'),
          rows: Array.from(ul.children).map(li => {
            const box = li.getBoundingClientRect();
            return Math.round(box.height * 10) / 10;
          }),
        };
      });
      check(list.density === density, `data-density ${list.density}`);
      await frame('rest', {list});
    },
  });
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `reorder-mode-${direction === 'rtl' ? 'rtl-' : ''}light`,
    story: 'core-list--reorderable',
    ready: '#storybook-root ul li',
    mode: 'light',
    direction,
    viewport: SMALL,
    run: async (page, check, frame) => {
      const order = async () =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll('#storybook-root ul > li')).map(
            li => li.textContent?.trim() ?? '',
          ),
        );
      const before = await order();
      await frame('rest', {order: before});
      const handle = page
        .locator('#storybook-root ul > li', {hasText: before[0]})
        .getByRole('button');
      await handle.focus();
      await page.keyboard.press('Space');
      await settle(page);
      const mode = await handle.evaluate(el => ({
        pressed: el.getAttribute('aria-pressed'),
        name: el.getAttribute('aria-label') ?? el.textContent,
        focused: document.activeElement === el,
        hintOpen: document.querySelector(':popover-open') != null,
      }));
      // The handle sits at its row's inline end. The hint opens below the
      // handle, overlaps it across the row, and stays inside the viewport.
      const placement = await handle.evaluate(el => {
        const row = el.closest('li') as HTMLElement;
        const hint = document.querySelector(':popover-open');
        const box = (node: Element) => {
          const r = node.getBoundingClientRect();
          return {left: r.left, right: r.right, top: r.top, bottom: r.bottom};
        };
        return {
          row: box(row),
          handle: box(el),
          hint: hint ? box(hint) : null,
          viewport: innerWidth,
        };
      });
      const handleCenter = (placement.handle.left + placement.handle.right) / 2;
      const rowCenter = (placement.row.left + placement.row.right) / 2;
      check(
        direction === 'rtl'
          ? handleCenter < rowCenter
          : handleCenter > rowCenter,
        `handle at ${handleCenter} is not at the row's inline end (row center ${rowCenter})`,
      );
      const hint = placement.hint;
      check(
        hint != null &&
          hint.top >= placement.handle.bottom - 1 &&
          hint.left < placement.handle.right &&
          hint.right > placement.handle.left &&
          hint.left >= 0 &&
          hint.right <= placement.viewport,
        `hint ${JSON.stringify(hint)} is not below the handle and inside the viewport`,
      );
      check(mode.pressed === 'true', `handle aria-pressed ${mode.pressed}`);
      check(mode.focused, 'focus left the handle when reorder mode started');
      check(mode.hintOpen, 'no reorder hint is open');
      await frame('reorder-mode', {mode, placement});
      await page.keyboard.press('ArrowDown');
      await settle(page);
      const after = await order();
      check(
        after[1] === before[0] && after[0] === before[1],
        `ArrowDown order ${after.join(',')}`,
      );
      await page.keyboard.press('Escape');
      await settle(page);
      const ended = await handle.evaluate(el =>
        el.getAttribute('aria-pressed'),
      );
      check(ended === 'false', `after Escape aria-pressed ${ended}`);
      await frame('moved', {order: after, ended});
    },
  });
}

const DIALOG_ROWS = '#storybook-root [role="list"] > li';

cases.push({
  key: 'bleed-corners-header-light',
  story: 'core-containercorners--bleed-list-with-header-in-dialog',
  ready: DIALOG_ROWS,
  mode: 'light',
  direction: 'ltr',
  viewport: SMALL,
  run: async (page, check, frame) => {
    const corner = await hostRadius(page, DIALOG_ROWS);
    const radii = await rowRadii(page, DIALOG_ROWS);
    const zero = ['0px', '0px', '0px', '0px'];
    const last = ['0px', '0px', `${corner}px`, `${corner}px`];
    check(corner > 0, `dialog corner ${corner}`);
    check(
      JSON.stringify(radii[0]) === JSON.stringify(zero),
      `first row under the header ${radii[0]?.join(' ')}`,
    );
    check(
      JSON.stringify(radii.at(-1)) === JSON.stringify(last),
      `last row ${radii.at(-1)?.join(' ')}, expected ${last.join(' ')}`,
    );
    await frame('rest', {corner, radii});
  },
});

function checkEdgeGeometry(
  geometry: Awaited<ReturnType<typeof edgeGeometry>>,
  check: Check,
) {
  check(geometry.length === 4, `${geometry.length} cards`);
  for (const card of geometry) {
    const label = `${card.edge}:`;
    check(card.headingText != null, `${label} no heading`);
    check(card.labelText != null, `${label} no row label`);
    if (card.edge === 'padded') {
      check(
        (card.labelText ?? 0) > (card.headingText ?? 0) + 1,
        `${label} text ${card.labelText} not inside the row inset from the heading ${card.headingText}`,
      );
      check(
        near(card.rowPaintStart, card.headingText),
        `${label} row paint ${card.rowPaintStart} off the heading line ${card.headingText}`,
      );
    } else {
      check(
        near(card.labelText, card.headingText),
        `${label} text ${card.labelText} off the heading line ${card.headingText}`,
      );
    }
    if (card.edge === 'flush') {
      check(
        near(card.rowPaintStart, card.headingText),
        `${label} row paint ${card.rowPaintStart} not at the heading line ${card.headingText}`,
      );
    }
    if (card.edge === 'outset') {
      check(
        (card.rowPaintStart ?? 0) < (card.headingText ?? 0) - 1 &&
          (card.rowPaintStart ?? 0) >= card.paddingEdge - 0.5,
        `${label} row paint ${card.rowPaintStart} not between the padding edge ${card.paddingEdge} and the heading line ${card.headingText}`,
      );
    }
    if (card.edge === 'bleed') {
      // A Card's full-bleed child reaches under its border.
      check(
        near(card.rowPaintStart, 0, 0.5),
        `${label} row paint ${card.rowPaintStart} not at the card's outer edge`,
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

/**
 * The test that runs a case. Cases that share a test share one browser
 * context, so a run needs one browser context per group.
 */
function groupOf(key: string): string {
  const prefixes = [
    'header-dividers',
    'interactive-states',
    'edge-in-card',
    'reorder-mode',
    'bleed-corners',
  ];
  return (
    prefixes.find(prefix => key.startsWith(prefix)) ?? 'markers-and-density'
  );
}

async function runCase(page: Page, item: AuditCase) {
  await page.setViewportSize(item.viewport);
  await page.emulateMedia({colorScheme: item.mode, reducedMotion: 'reduce'});
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:neutral;direction:${item.direction}`;
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
    const screenshot = await page.screenshot({animations: 'disabled'});
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
    component: 'List',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
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

for (const group of [...new Set(cases.map(item => groupOf(item.key)))]) {
  test(group, async ({browser}) => {
    const context = await browser.newContext({deviceScaleFactor: 2});
    try {
      const page = await context.newPage();
      const failures: string[] = [];
      for (const item of cases.filter(c => groupOf(c.key) === group)) {
        failures.push(...(await runCase(page, item)));
      }
      expect(failures).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
