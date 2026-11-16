// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit NavIcon

/**
 * @file NavIconAudit.a11y.chromium.spec.ts
 * @input Exact-head NavIcon, TopNav, and SideNav stories across themes, modes, direction, and widths
 * @output Screenshots and fail-closed sensor receipts for the NavIcon whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a NavIcon audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('nav-icon-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  theme: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  /** How many NavIcons the story renders. */
  count: number;
};

const DESKTOP = {width: 1180, height: 800};
const NARROW = {width: 320, height: 640};

const NAV_ICON = '#storybook-root .astryx-nav-icon';
/** WCAG 2.2 SC 1.4.11 non-text contrast. */
const MIN_ICON_CONTRAST = 3;
/** Rounding slack for sub-pixel layout, in CSS px. */
const EPSILON = 0.6;

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

/**
 * Every rendered NavIcon: markup, semantics, box, the tokens it should paint
 * with (resolved by a probe element in the same cascade), its icon box, and
 * the icon's contrast against the container. Colors are normalized through a
 * canvas so any CSS color syntax reads as sRGB.
 */
async function navIcons(page: Page) {
  return page.evaluate(sel => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    const rgba = (value: string) => {
      if (ctx == null) {
        return [0, 0, 0, 0];
      }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#010203';
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, Math.round((a / 255) * 100) / 100];
    };
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map(c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const round = (n: number) => Math.round(n * 10) / 10;
    return Array.from(document.querySelectorAll(sel)).map(el => {
      const root = el as HTMLElement;
      const style = getComputedStyle(root);
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--color-accent)';
      probe.style.color = 'var(--color-on-accent)';
      probe.style.width = 'var(--size-element-md)';
      probe.style.position = 'absolute';
      root.parentElement?.appendChild(probe);
      const probeStyle = getComputedStyle(probe);
      const tokens = {
        accent: rgba(probeStyle.backgroundColor),
        onAccent: rgba(probeStyle.color),
        sizeMd: parseFloat(probeStyle.width),
      };
      probe.remove();
      const rect = root.getBoundingClientRect();
      const icon = root.querySelector('svg');
      const iconRect = icon?.getBoundingClientRect() ?? null;
      const background = rgba(style.backgroundColor);
      const foreground =
        icon != null ? rgba(getComputedStyle(icon).color) : null;
      let contrast = null;
      if (foreground != null) {
        const fg = background.map(
          (c, i) => foreground[i] * foreground[3] + c * (1 - foreground[3]),
        );
        const [hi, lo] = [luminance(fg), luminance(background)].sort(
          (a, b) => b - a,
        );
        contrast = Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      }
      const classes = Array.from(root.classList).filter(c =>
        c.startsWith('astryx-'),
      );
      return {
        tag: root.tagName,
        targets: classes,
        role: root.getAttribute('role'),
        tabIndex: root.tabIndex,
        hasTabIndexAttr: root.hasAttribute('tabindex'),
        ariaLabel: root.getAttribute('aria-label'),
        box: {
          width: round(rect.width),
          height: round(rect.height),
          left: round(rect.left),
          right: round(rect.right),
        },
        borderRadius: style.borderRadius,
        background,
        color: rgba(style.color),
        tokens,
        iconBox:
          iconRect == null
            ? null
            : {
                width: round(iconRect.width),
                height: round(iconRect.height),
                dx: round(
                  iconRect.left +
                    iconRect.width / 2 -
                    (rect.left + rect.width / 2),
                ),
                dy: round(
                  iconRect.top +
                    iconRect.height / 2 -
                    (rect.top + rect.height / 2),
                ),
                inside:
                  iconRect.left >= rect.left - 0.5 &&
                  iconRect.right <= rect.right + 0.5 &&
                  iconRect.top >= rect.top - 0.5 &&
                  iconRect.bottom <= rect.bottom + 0.5,
              },
        iconHidden: icon?.getAttribute('aria-hidden') ?? null,
        contrast,
      };
    });
  }, NAV_ICON);
}

/** Chromium's accessibility-tree view of each NavIcon container. */
async function axContainers(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const {result} = (await cdp.send('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll(${JSON.stringify(NAV_ICON)}))`,
    })) as {result: {objectId?: string}};
    if (result.objectId == null) {
      return [];
    }
    const {result: props} = (await cdp.send('Runtime.getProperties', {
      objectId: result.objectId,
      ownProperties: true,
    })) as {result: {name: string; value?: {objectId?: string}}[]};
    const out: {role: string | null; name: string; ignored: boolean}[] = [];
    for (const prop of props) {
      if (!/^\d+$/.test(prop.name) || prop.value?.objectId == null) {
        continue;
      }
      const {nodes} = (await cdp.send('Accessibility.getPartialAXTree', {
        objectId: prop.value.objectId,
        fetchRelatives: false,
      })) as {
        nodes: {
          ignored?: boolean;
          role?: {value?: string};
          name?: {value?: string};
        }[];
      };
      const node = nodes[0];
      out.push({
        role: node?.role?.value ?? null,
        name: node?.name?.value ?? '',
        ignored: node?.ignored ?? false,
      });
    }
    return out;
  } finally {
    await cdp.detach();
  }
}

/** Axe over the story root, WCAG 2.2 A and AA rules. */
async function axeRoot(page: Page) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.flatMap(violation =>
    violation.nodes.map(node => `${violation.id}: ${node.target.join(' ')}`),
  );
}

/**
 * Walks Tab from the top of the page until focus returns to the first stop or
 * leaves the page, and records whether each stop sits inside a NavIcon.
 */
async function tabStops(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  const list: {label: string; inNavIcon: boolean}[] = [];
  let first: string | null = null;
  for (let i = 0; i < MAX_TAB_STOPS; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(sel => {
      const el = document.activeElement;
      if (el == null || el === document.body) {
        return null;
      }
      const key = `${el.tagName}#${Array.from(el.parentElement?.children ?? []).indexOf(el)}:${el.textContent?.trim().slice(0, 40) ?? ''}:${Math.round(el.getBoundingClientRect().left)},${Math.round(el.getBoundingClientRect().top)}`;
      return {key, inNavIcon: el.closest(sel) != null};
    }, NAV_ICON);
    if (stop == null) {
      return {list, wrapped: true};
    }
    if (stop.key === first) {
      return {list, wrapped: true};
    }
    first ??= stop.key;
    list.push({label: stop.key, inNavIcon: stop.inNavIcon});
  }
  return {list, wrapped: false};
}

type NavIconRead = Awaited<ReturnType<typeof navIcons>>[number];

/** Same sRGB channels within 1, and the same alpha within 0.01. */
const same = (a: number[], b: number[]) =>
  a.length === 4 &&
  b.length === 4 &&
  a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= 1) &&
  Math.abs(a[3] - b[3]) <= 0.01;

/** Tab presses before the walk gives up on wrapping. */
const MAX_TAB_STOPS = 40;

/** Checks one container's markup, box, paint, and semantics. */
function checkNavIcon(check: Check, icon: NavIconRead, label: string) {
  check(icon.tag === 'SPAN', `${label} is a ${icon.tag}`);
  check(
    icon.targets.length === 1 && icon.targets[0] === 'astryx-nav-icon',
    `${label} targets ${icon.targets.join(' ')}`,
  );
  check(icon.role == null, `${label} has role ${icon.role}`);
  check(
    !icon.hasTabIndexAttr && icon.tabIndex === -1,
    `${label} tabindex ${icon.tabIndex}`,
  );
  check(icon.ariaLabel == null, `${label} has aria-label ${icon.ariaLabel}`);
  check(
    Math.abs(icon.box.width - icon.tokens.sizeMd) <= EPSILON &&
      Math.abs(icon.box.height - icon.tokens.sizeMd) <= EPSILON,
    `${label} box ${icon.box.width}x${icon.box.height}, size token ${icon.tokens.sizeMd}`,
  );
  check(
    icon.tokens.accent[3] === 1 &&
      icon.tokens.onAccent[3] === 1 &&
      icon.tokens.sizeMd > 0,
    `${label} tokens did not resolve: ${JSON.stringify(icon.tokens)}`,
  );
  check(icon.borderRadius === '50%', `${label} radius ${icon.borderRadius}`);
  check(
    same(icon.background, icon.tokens.accent),
    `${label} background ${icon.background.join(',')} is not the accent ${icon.tokens.accent.join(',')}`,
  );
  check(
    same(icon.color, icon.tokens.onAccent),
    `${label} color ${icon.color.join(',')} is not on-accent ${icon.tokens.onAccent.join(',')}`,
  );
  check(icon.iconBox != null, `${label} has no icon`);
  if (icon.iconBox != null) {
    check(icon.iconBox.inside, `${label} icon overflows the container`);
    check(
      Math.abs(icon.iconBox.dx) <= EPSILON &&
        Math.abs(icon.iconBox.dy) <= EPSILON,
      `${label} icon off center by ${icon.iconBox.dx}, ${icon.iconBox.dy}`,
    );
  }
  check(
    icon.contrast != null && icon.contrast >= MIN_ICON_CONTRAST,
    `${label} icon contrast ${icon.contrast}`,
  );
}

const cases: AuditCase[] = [];

for (const theme of ['neutral', 'matcha'] as const) {
  for (const mode of ['light', 'dark'] as const) {
    for (const direction of ['ltr', 'rtl'] as const) {
      if (theme !== 'neutral' && direction === 'rtl') {
        continue;
      }
      cases.push({
        key: `gallery-${theme}-${mode}-${direction}`,
        group: 'standalone',
        story: 'core-navicon--gallery',
        theme,
        mode,
        direction,
        viewport: DESKTOP,
        count: 5,
      });
    }
  }
}

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `topnav-logo-${mode}-${direction}`,
      group: 'composed',
      story: 'core-topnav--with-logo',
      theme: 'neutral',
      mode,
      direction,
      viewport: DESKTOP,
      count: 1,
    });
    cases.push({
      key: `sidenav-heading-${mode}-${direction}`,
      group: 'composed',
      story: 'core-sidenav--default',
      theme: 'neutral',
      mode,
      direction,
      viewport: DESKTOP,
      count: 1,
    });
  }
}

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `topnav-logo-narrow-light-${direction}`,
    group: 'narrow',
    story: 'core-topnav--with-logo',
    theme: 'neutral',
    mode: 'light',
    direction,
    viewport: NARROW,
    count: 1,
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

async function runCase(page: Page, item: AuditCase) {
  await page.setViewportSize(item.viewport);
  await page.emulateMedia({colorScheme: item.mode, reducedMotion: 'reduce'});
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
  await page.goto(url, {waitUntil: 'load'});
  await page.locator(NAV_ICON).first().waitFor();
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
  check(sensors.theme === item.theme, `theme ${sensors.theme}`);
  check(sensors.direction === item.direction, `direction ${sensors.direction}`);
  check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
  check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
  const frames: {
    state: string;
    observed: unknown;
    file: string;
    sha256: string;
  }[] = [];
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
  try {
    const list = await navIcons(page);
    check(
      list.length === item.count,
      `${list.length} NavIcons, expected ${item.count}`,
    );
    list.forEach((icon, index) =>
      checkNavIcon(check, icon, `NavIcon ${index}`),
    );
    const ax = await axContainers(page);
    check(ax.length === list.length, `${ax.length} accessibility reads`);
    ax.forEach((node, index) =>
      check(
        (node.ignored || node.role === 'generic' || node.role === 'none') &&
          node.name === '',
        `NavIcon ${index} in the accessibility tree: ${JSON.stringify(node)}`,
      ),
    );
    const axe = await axeRoot(page);
    check(axe.length === 0, `axe: ${axe.join(' | ')}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    );
    if (item.group === 'narrow') {
      check(overflow <= 0, `page scrolls sideways by ${overflow}px`);
    }
    await frame('rest', {list, ax, axe, overflow});
    await page.keyboard.press('Tab');
    await settle(page);
    const focusInside = await page.evaluate(
      sel =>
        Array.from(document.querySelectorAll(sel)).some(el =>
          el.matches(':focus, :focus-within'),
        ),
      NAV_ICON,
    );
    check(!focusInside, 'Tab focused a NavIcon or its content');
    await frame('after-tab', {focusInside});
    const stops = await tabStops(page);
    check(
      stops.list.every(stop => !stop.inNavIcon),
      `a Tab stop is in a NavIcon: ${JSON.stringify(stops.list)}`,
    );
    check(stops.wrapped, `Tab did not wrap within ${MAX_TAB_STOPS} presses`);
    if (item.group !== 'standalone') {
      check(stops.list.length > 0, 'the story has no Tab stop to walk');
    }
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'NavIcon',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    theme: item.theme,
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
