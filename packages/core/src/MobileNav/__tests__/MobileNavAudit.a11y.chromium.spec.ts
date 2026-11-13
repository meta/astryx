// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit MobileNav

/**
 * @file MobileNavAudit.a11y.chromium.spec.ts
 * @input Exact-head MobileNav stories, opened and closed, across modes, direction, and phone widths
 * @output Screenshots and fail-closed sensor receipts for the MobileNav whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a MobileNav audit pull request
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

const OUTPUT = path.resolve('mobile-nav-audit-evidence');

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
  opener: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const PHONE = {width: 390, height: 844};
const NARROW = {width: 320, height: 700};

/** The close lands within the slide-out and no later than 250 ms (FR5). */
const CLOSE_WAIT_MS = 600;
const MIN_TARGET_PX = 24;

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

/** The dialog, its drawer box, its backdrop paint, and where focus is. */
async function drawerState(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('dialog.astryx-mobile-nav');
    if (dialog == null) {
      return null;
    }
    const drawer = dialog.querySelector(':scope div[tabindex="-1"]');
    const rect = drawer?.getBoundingClientRect();
    const backdrop = getComputedStyle(dialog, '::backdrop');
    const active = document.activeElement as HTMLElement | null;
    return {
      open: dialog.open,
      modal: dialog.matches(':modal'),
      side: dialog.getAttribute('data-side'),
      backdropColor: backdrop.backgroundColor,
      backdropOpacity: backdrop.opacity,
      backdropFilter: backdrop.backdropFilter,
      drawer:
        rect == null
          ? null
          : {
              left: Math.round(rect.left * 10) / 10,
              right: Math.round((innerWidth - rect.right) * 10) / 10,
              width: Math.round(rect.width * 10) / 10,
              height: Math.round(rect.height),
              background: getComputedStyle(drawer as HTMLElement)
                .backgroundColor,
            },
      viewportWidth: innerWidth,
      focusInside: active != null && dialog.contains(active),
      focusLabel:
        active?.getAttribute('aria-label') ?? active?.textContent ?? null,
    };
  });
}

/** Chromium's dialog and navigation nodes, with names and modal state. */
async function axTree(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: {
        ignored?: boolean;
        role?: {value?: string};
        name?: {value?: string};
        properties?: {name: string; value: {value?: unknown}}[];
      }[];
    };
    return nodes
      .filter(node => !node.ignored)
      .filter(node =>
        ['dialog', 'navigation', 'heading'].includes(node.role?.value ?? ''),
      )
      .map(node => ({
        role: node.role?.value ?? '',
        name: node.name?.value ?? '',
        modal:
          node.properties?.find(p => p.name === 'modal')?.value.value ?? null,
      }));
  } finally {
    await cdp.detach();
  }
}

/** Contrast of the header heading and the first nav item against the drawer. */
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
    const dialog = document.querySelector('dialog.astryx-mobile-nav');
    const parts: [string, Element | null | undefined][] = [
      ['heading', dialog?.querySelector('h2')],
      ['item', dialog?.querySelector('nav a')],
    ];
    return parts.flatMap(([name, el]) => {
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

type Drawer = NonNullable<Awaited<ReturnType<typeof drawerState>>>;

async function open(page: Page, opener: string) {
  await page.getByRole('button', {name: opener, exact: true}).click();
  await page.locator('dialog.astryx-mobile-nav[open]').waitFor();
  await settle(page);
  await page.waitForTimeout(400);
  await settle(page);
}

/** The drawer sits flush to the inline edge its side names. */
function checkEdge(check: Check, state: Drawer, direction: Direction) {
  const atLeft =
    (state.side === 'start') === (direction === 'ltr') ? 'left' : 'right';
  const edge = state.drawer?.[atLeft];
  check(
    edge != null && Math.abs(edge) <= 0.5,
    `side ${state.side} in ${direction}: drawer ${atLeft} gap ${edge}`,
  );
}

function checkOpen(check: Check, state: Drawer | null, name: string) {
  check(state != null, 'no MobileNav dialog');
  if (state == null) {
    return;
  }
  check(
    state.open && state.modal,
    `dialog open ${state.open} modal ${state.modal}`,
  );
  check(state.focusInside, 'focus is not inside the open drawer');
  check(
    state.backdropFilter === 'none',
    `backdrop filter ${state.backdropFilter}`,
  );
  const alpha = /rgba?\([^)]*?[,/ ]\s*([\d.]+)\)$/.exec(state.backdropColor);
  check(
    state.backdropColor !== 'rgba(0, 0, 0, 0)' &&
      (alpha == null || Number(alpha[1]) > 0) &&
      Number(state.backdropOpacity) === 1,
    `backdrop ${state.backdropColor} at opacity ${state.backdropOpacity} is not a dim`,
  );
  check(state.drawer != null, 'no drawer panel');
  check(name.length > 0, 'no dialog name');
}

function checkAx(
  check: Check,
  nodes: Awaited<ReturnType<typeof axTree>>,
  name: string,
) {
  const dialogs = nodes.filter(node => node.role === 'dialog');
  const navs = nodes.filter(node => node.role === 'navigation');
  check(
    dialogs.length === 1 && dialogs[0].name === name,
    `dialog nodes ${JSON.stringify(dialogs)}`,
  );
  check(dialogs[0]?.modal === true, 'dialog is not modal in the tree');
  check(
    navs.length === 1 && navs[0].name === name,
    `navigation nodes ${JSON.stringify(navs)}`,
  );
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `default-${mode}`,
    group: 'default',
    story: 'core-mobilenav--default',
    opener: 'Open Navigation',
    mode,
    direction: 'ltr',
    viewport: PHONE,
    run: async (page, check, frame) => {
      await open(page, 'Open Navigation');
      const state = await drawerState(page);
      checkOpen(check, state, 'Navigation');
      if (state != null) {
        checkEdge(check, state, 'ltr');
        check(
          state.drawer?.width === 320,
          `drawer width ${state.drawer?.width}, not 320`,
        );
      }
      const nodes = await axTree(page);
      checkAx(check, nodes, 'Navigation');
      check(
        nodes.some(
          node => node.role === 'heading' && node.name === 'Navigation',
        ),
        'no Navigation heading',
      );
      const contrast = await contrastPairs(page);
      check(contrast.length === 2, `${contrast.length} contrast pairs`);
      for (const pair of contrast) {
        check(
          pair.unreadable.length === 0 && pair.ratio >= pair.threshold,
          `${pair.part} contrast ${pair.ratio} below ${pair.threshold}`,
        );
      }
      await frame('open', {state, nodes, contrast});

      await page.keyboard.press('Tab');
      await settle(page);
      const focus = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement;
        const style = getComputedStyle(active);
        const rect = active.getBoundingClientRect();
        return {
          label: active.getAttribute('aria-label') ?? active.textContent,
          focusVisible: active.matches(':focus-visible'),
          outline: `${style.outlineStyle} ${style.outlineWidth}`,
          boxShadow: style.boxShadow,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
      check(
        focus.label === 'Close navigation',
        `Tab from the drawer reached ${focus.label}`,
      );
      check(focus.focusVisible, 'Close is not :focus-visible');
      check(
        !focus.outline.startsWith('none') || focus.boxShadow !== 'none',
        `no focus indicator: ${focus.outline} / ${focus.boxShadow}`,
      );
      check(
        focus.width >= MIN_TARGET_PX && focus.height >= MIN_TARGET_PX,
        `Close target ${focus.width}x${focus.height}`,
      );
      await frame('close-focus-visible', {focus});

      await page.keyboard.press('Escape');
      await page.waitForTimeout(CLOSE_WAIT_MS);
      await settle(page);
      const closed = await drawerState(page);
      const returned = await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? null,
      );
      check(closed?.open === false, 'Escape did not close the dialog');
      check(
        returned === 'Open Navigation',
        `focus returned to ${returned}, not the opener`,
      );
      await frame('closed', {closed, returned});
    },
  });

  cases.push({
    key: `backdrop-${mode}`,
    group: 'default',
    story: 'core-mobilenav--default',
    opener: 'Open Navigation',
    mode,
    direction: 'ltr',
    viewport: PHONE,
    run: async (page, check, frame) => {
      await open(page, 'Open Navigation');
      const state = await drawerState(page);
      checkOpen(check, state, 'Navigation');
      const drawer = state?.drawer;
      if (state == null || drawer == null) {
        return;
      }
      const stripX = drawer.left <= 0.5 ? state.viewportWidth - 10 : 10;
      const insideX = drawer.left <= 0.5 ? 10 : state.viewportWidth - 10;
      await page.mouse.click(insideX, PHONE.height - 20);
      await page.waitForTimeout(CLOSE_WAIT_MS);
      const afterInside = await drawerState(page);
      check(afterInside?.open === true, 'a click inside the drawer closed it');
      await page.mouse.click(stripX, PHONE.height / 2);
      await page.waitForTimeout(CLOSE_WAIT_MS);
      await settle(page);
      const afterStrip = await drawerState(page);
      check(
        afterStrip?.open === false,
        'a click on the backdrop strip did not close it',
      );
      await frame('after-backdrop-click', {state, afterInside, afterStrip});
    },
  });

  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `end-side-${direction}-${mode}`,
      group: 'end-side',
      story: 'core-mobilenav--end-side',
      opener: 'Open from Right',
      mode,
      direction,
      viewport: PHONE,
      run: async (page, check, frame) => {
        await open(page, 'Open from Right');
        const state = await drawerState(page);
        checkOpen(check, state, 'Settings');
        if (state != null) {
          check(state.side === 'end', `side ${state.side}`);
          checkEdge(check, state, direction);
        }
        checkAx(check, await axTree(page), 'Settings');
        await frame('open', {state});
      },
    });
  }

  cases.push({
    key: `without-title-${mode}`,
    group: 'end-side',
    story: 'core-mobilenav--without-title',
    opener: 'Open Navigation',
    mode,
    direction: 'ltr',
    viewport: PHONE,
    run: async (page, check, frame) => {
      await open(page, 'Open Navigation');
      const state = await drawerState(page);
      checkOpen(check, state, 'Navigation');
      const nodes = await axTree(page);
      checkAx(check, nodes, 'Navigation');
      check(
        !nodes.some(node => node.role === 'heading'),
        'a heading renders without a header',
      );
      await frame('open', {state, nodes});
    },
  });

  for (const viewport of [PHONE, NARROW]) {
    cases.push({
      key: `custom-width-${viewport.width}-${mode}`,
      group: 'width',
      story: 'core-mobilenav--custom-width',
      opener: 'Open Wide Drawer',
      mode,
      direction: 'ltr',
      viewport,
      run: async (page, check, frame) => {
        await open(page, 'Open Wide Drawer');
        const state = await drawerState(page);
        checkOpen(check, state, 'Wide Navigation');
        const expected = Math.min(360, viewport.width * 0.85);
        check(
          state?.drawer != null &&
            Math.abs(state.drawer.width - expected) <= 0.5,
          `drawer width ${state?.drawer?.width}, not ${expected}`,
        );
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        );
        check(overflow <= 0, `page scrolls sideways by ${overflow}px`);
        await frame('open', {state, expected, overflow});
      },
    });
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
  await page.emulateMedia({colorScheme: item.mode});
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:neutral;direction:${item.direction}`;
  await page.goto(url, {waitUntil: 'load'});
  await page
    .getByRole('button', {name: item.opener, exact: true})
    .first()
    .waitFor();
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
    component: 'MobileNav',
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
