// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Outline

/**
 * @file OutlineAudit.a11y.chromium.spec.ts
 * @input Exact-head Outline stories across themes, modes, direction, widths, motion, and states
 * @output Screenshots and fail-closed sensor receipts for the Outline whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for an Outline audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type Browser,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('outline-audit-evidence');

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Motion = 'still' | 'reduce' | 'no-preference';
type Pointer = 'fine' | 'coarse';
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
  /** `still` holds every transition at 0s for stable frames. */
  motion: Motion;
  pointer: Pointer;
  /** How many heading links the story renders. */
  count: number;
  /** The label of the link that must be current at rest, if any. */
  current?: string;
  run?: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 1180, height: 800};
const NARROW = {width: 320, height: 640};

const NAV = '#storybook-root nav.astryx-outline';
/** WCAG 2.2 SC 1.4.3 text contrast. */
const MIN_TEXT_CONTRAST = 4.5;

test.describe.configure({retries: 0});

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

async function nextFrames(page: Page) {
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function settle(page: Page, motion: Motion) {
  if (motion === 'still') {
    await holdMotionStill(page);
  }
  await page.evaluate(async () => document.fonts.ready);
  await nextFrames(page);
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
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    fonts: document.fonts.status,
    storybookError:
      document.querySelector('.sb-show-errordisplay') != null ||
      document.body.classList.contains('sb-show-errordisplay'),
  }));
}

/**
 * The Outline's landmark, links, track, and indicator: semantics, geometry,
 * and the contrast of each link's text against its composited backdrop.
 * Colors are normalized through a canvas so any CSS color syntax reads as
 * sRGB.
 */
async function outline(page: Page) {
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
      // A color the canvas cannot parse leaves the sentinel: no measurement.
      if (ctx.fillStyle === '#010203' && value !== 'rgb(1, 2, 3)') {
        return [NaN, NaN, NaN, NaN];
      }
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, Math.round((a / 255) * 100) / 100];
    };
    const backdrop = (el: Element) => {
      const layers: number[][] = [];
      let node: Element | null = el;
      while (node != null) {
        const color = rgba(getComputedStyle(node).backgroundColor);
        if (color[3] > 0) {
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
    const ratioOf = (fg: number[], bg: number[]) => {
      const composite = bg.map((c, i) => fg[i] * fg[3] + c * (1 - fg[3]));
      const [hi, lo] = [luminance(composite), luminance(bg)].sort(
        (a, b) => b - a,
      );
      return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    };
    const box = (el: Element | null) => {
      if (el == null) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left * 10) / 10,
        y: Math.round(r.top * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
      };
    };
    const nav = document.querySelector(sel);
    if (nav == null) {
      return null;
    }
    const list = nav.querySelector(':scope > ul');
    const indicator = nav.querySelector('.astryx-outline-indicator');
    const track = nav.querySelector(':scope > div[aria-hidden="true"]');
    const trackLine = track?.querySelector('span') ?? null;
    const links = Array.from(nav.querySelectorAll('a.astryx-outline-item'));
    const indicatorStyle = indicator ? getComputedStyle(indicator) : null;
    const lineStyle = trackLine ? getComputedStyle(trackLine) : null;
    return {
      tag: nav.tagName,
      name: nav.getAttribute('aria-label'),
      listRole: list?.getAttribute('role') ?? null,
      itemRoles: Array.from(list?.children ?? []).map(li =>
        li.getAttribute('role'),
      ),
      density: nav.getAttribute('data-density'),
      links: links.map(link => {
        const el = link as HTMLAnchorElement;
        const style = getComputedStyle(el);
        const label = el.querySelector('span');
        const labelStyle = label ? getComputedStyle(label) : null;
        return {
          text: el.textContent?.trim() ?? '',
          href: el.getAttribute('href'),
          tabIndex: el.tabIndex,
          tabindexAttr: el.getAttribute('tabindex'),
          current: el.getAttribute('aria-current'),
          level: el.getAttribute('data-level'),
          active: el.getAttribute('data-active'),
          paddingInlineStart: style.paddingInlineStart,
          fontWeight: style.fontWeight,
          transition: `${style.transitionProperty} ${style.transitionDuration}`,
          transitionDuration: style.transitionDuration,
          truncates:
            labelStyle != null &&
            labelStyle.textOverflow === 'ellipsis' &&
            labelStyle.whiteSpace === 'nowrap' &&
            labelStyle.overflow === 'hidden',
          contrast: ratioOf(rgba(style.color), backdrop(el)),
          box: box(el),
        };
      }),
      track: box(trackLine),
      trackHidden: track?.getAttribute('aria-hidden') ?? null,
      indicator: box(indicator),
      indicatorHidden: indicator?.getAttribute('aria-hidden') ?? null,
      indicatorTransition: indicatorStyle
        ? {
            property: indicatorStyle.transitionProperty,
            duration: indicatorStyle.transitionDuration,
          }
        : null,
      indicatorColor: indicatorStyle?.backgroundColor ?? null,
      trackColor: lineStyle?.backgroundColor ?? null,
    };
  }, NAV);
}

type OutlineRead = NonNullable<Awaited<ReturnType<typeof outline>>>;

async function axeRoot(page: Page) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return results.violations.flatMap(violation =>
    violation.nodes.map(node => `${violation.id}: ${node.target.join(' ')}`),
  );
}

/** Checks the landmark, list, links, track, and indicator at rest. */
function checkOutline(
  check: Check,
  read: OutlineRead,
  count: number,
  current: string | undefined,
) {
  check(read.tag === 'NAV', `root is a ${read.tag}`);
  check((read.name ?? '').trim() !== '', 'the nav has no name');
  check(read.listRole === 'list', `list role ${read.listRole}`);
  check(
    read.itemRoles.every(role => role === 'listitem'),
    `item roles ${JSON.stringify(read.itemRoles)}`,
  );
  check(
    read.links.length === count,
    `${read.links.length} links, expected ${count}`,
  );
  for (const link of read.links) {
    check(
      link.tabIndex === 0 && link.tabindexAttr == null,
      `${link.text} tabindex ${link.tabindexAttr}`,
    );
    check(
      link.href?.startsWith('#') === true,
      `${link.text} href ${link.href}`,
    );
    check(link.truncates, `${link.text} label does not truncate`);
    check(
      link.contrast >= MIN_TEXT_CONTRAST,
      `${link.text} text contrast ${link.contrast}`,
    );
  }
  check(read.trackHidden === 'true', 'the track is not aria-hidden');
  check(read.indicatorHidden === 'true', 'the indicator is not aria-hidden');
  check(
    read.track != null && read.track.width >= 2 && read.track.height > 0,
    `the track paints no line: ${JSON.stringify(read.track)}`,
  );
  const currents = read.links.filter(link => link.current != null);
  if (current == null) {
    check(currents.length <= 1, `${currents.length} current links`);
  } else {
    check(
      currents.length === 1 && currents[0].text === current,
      `current ${JSON.stringify(currents.map(link => link.text))}, expected ${current}`,
    );
  }
  for (const link of currents) {
    check(link.current === 'location', `aria-current ${link.current}`);
    check(link.active === 'active', `${link.text} data-active ${link.active}`);
    check(
      Number(link.fontWeight) > 500,
      `${link.text} weight ${link.fontWeight}`,
    );
    checkIndicatorOn(check, read, link.text);
  }
}

/** The indicator sits on the track, aligned to the named link. */
function checkIndicatorOn(check: Check, read: OutlineRead, label: string) {
  const link = read.links.find(item => item.text === label);
  const bar = read.indicator;
  if (link?.box == null || bar == null || read.track == null) {
    check(false, `no geometry for ${label}`);
    return;
  }
  check(
    Math.abs(bar.y - link.box.y) <= 1 &&
      Math.abs(bar.height - link.box.height) <= 1,
    `indicator ${JSON.stringify(bar)} is not on ${label} ${JSON.stringify(link.box)}`,
  );
  check(
    Math.abs(bar.x - read.track.x) <= 0.5,
    `indicator x ${bar.x} is off the track x ${read.track.x}`,
  );
}

const cases: AuditCase[] = [];

const restStories: {story: string; count: number; current?: string}[] = [
  {story: 'core-outline--basic', count: 6},
  {story: 'core-outline--controlled', count: 6, current: 'Tokens'},
  {story: 'core-outline--compact', count: 6, current: 'Installation'},
  {story: 'core-outline--deep-nesting', count: 7, current: 'Subsection 1.1.1'},
];

for (const {story, count, current} of restStories) {
  const name = story.replace('core-outline--', '');
  for (const mode of ['light', 'dark'] as const) {
    for (const direction of ['ltr', 'rtl'] as const) {
      cases.push({
        key: `${name}-neutral-${mode}-${direction}`,
        group: 'rest',
        story,
        theme: 'neutral',
        mode,
        direction,
        viewport: DESKTOP,
        motion: 'still',
        pointer: 'fine',
        count,
        current,
      });
    }
  }
  for (const mode of ['light', 'dark'] as const) {
    cases.push({
      key: `${name}-matcha-${mode}-ltr`,
      group: 'themed',
      story,
      theme: 'matcha',
      mode,
      direction: 'ltr',
      viewport: DESKTOP,
      motion: 'still',
      pointer: 'fine',
      count,
      current,
    });
  }
}

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `levels-${mode}-${direction}`,
      group: 'levels',
      story: 'core-outline--deep-nesting',
      theme: 'neutral',
      mode,
      direction,
      viewport: DESKTOP,
      motion: 'still',
      pointer: 'fine',
      count: 7,
      current: 'Subsection 1.1.1',
      run: async (page, check, frame) => {
        const read = await outline(page);
        const pad = (label: string) =>
          Number.parseFloat(
            read?.links.find(link => link.text === label)?.paddingInlineStart ??
              'NaN',
          );
        const levels = {
          h1: pad('Chapter 1'),
          h2: pad('Section 1.1'),
          h3: pad('Subsection 1.1.1'),
        };
        check(levels.h1 === levels.h2, `h1 ${levels.h1} and h2 ${levels.h2}`);
        check(levels.h3 > levels.h2, `h3 ${levels.h3} is not past h2`);
        await frame('levels', levels);
      },
    });
    cases.push({
      key: `navigate-${mode}-${direction}`,
      group: 'navigate',
      story: 'core-outline--navigate-callbacks',
      theme: 'neutral',
      mode,
      direction,
      viewport: DESKTOP,
      motion: 'still',
      pointer: 'fine',
      count: 6,
      current: 'Overview',
      run: async (page, check, frame) => {
        const target = page.locator(`${NAV} a`, {hasText: 'Theming'});
        const rest = await target.evaluate(el => getComputedStyle(el).color);
        await target.hover();
        await settle(page, 'still');
        const hover = await target.evaluate(el => getComputedStyle(el).color);
        check(hover !== rest, `hover keeps the rest color ${rest}`);
        await frame('hover', {rest, hover});
        await page.locator(`${NAV} a`, {hasText: 'Accessibility'}).click();
        await page
          .getByText('arrived at accessibility')
          .waitFor({timeout: 5000})
          .catch(() => undefined);
        await settle(page, 'still');
        const after = await page.evaluate(() => ({
          hash: location.hash,
          focused: document.activeElement?.id ?? null,
          headingTop: Math.round(
            document.getElementById('accessibility')?.getBoundingClientRect()
              .top ?? -1,
          ),
          status:
            document.querySelector('#storybook-root .astryx-badge')
              ?.textContent ?? null,
        }));
        check(after.hash === '#accessibility', `hash ${after.hash}`);
        check(
          after.focused === 'accessibility',
          `focus is on ${after.focused}, not the chosen heading`,
        );
        check(
          after.status === 'arrived at accessibility',
          `status ${after.status}`,
        );
        const read = await outline(page);
        if (read != null) {
          const currents = read.links.filter(link => link.current != null);
          check(
            currents.length === 1 && currents[0].text === 'Accessibility',
            `current after navigating ${JSON.stringify(currents.map(l => l.text))}`,
          );
          checkIndicatorOn(check, read, 'Accessibility');
        }
        const axe = await axeRoot(page);
        check(axe.length === 0, `axe: ${axe.join(' | ')}`);
        await frame('navigated', {after, axe});
      },
    });
  }
}

/**
 * Under reduced motion nothing travels: on any pointer the indicator and the
 * navigation scroll land at once, and link colors change at once. With no
 * preference, the scroll and the indicator still move.
 */
for (const pointer of ['fine', 'coarse'] as const) {
  cases.push({
    key: `reduced-motion-${pointer}`,
    group: `reduced-motion-${pointer}`,
    story: 'core-outline--navigate-callbacks',
    theme: 'neutral',
    mode: 'light',
    direction: 'ltr',
    viewport: DESKTOP,
    motion: 'reduce',
    pointer,
    count: 6,
    current: 'Overview',
    run: async (page, check, frame) => {
      const before = await outline(page);
      const transition = before?.indicatorTransition ?? null;
      const travels =
        transition != null &&
        /\b(top|height|inset|all)\b/.test(transition.property) &&
        transition.duration
          .split(',')
          .some(value => Number.parseFloat(value) > 0);
      check(
        !travels,
        `the indicator slides under reduced motion: ${JSON.stringify(transition)}`,
      );
      const colorTransitions = (before?.links ?? []).filter(link =>
        link.transitionDuration
          .split(',')
          .some(value => Number.parseFloat(value) > 0),
      );
      check(
        colorTransitions.length === 0,
        `link colors animate under reduced motion: ${JSON.stringify(colorTransitions.map(link => link.transition))}`,
      );
      await page.locator(`${NAV} a`, {hasText: 'Accessibility'}).click();
      await nextFrames(page);
      const early = await page.evaluate(() => Math.round(scrollY));
      await page.waitForTimeout(1500);
      const settled = await page.evaluate(() => Math.round(scrollY));
      const landing = {early, settled};
      check(
        settled > 0 && early === settled,
        `two frames after the click the page is at ${early}, and it settles at ${settled}: the scroll travelled`,
      );
      await frame('landed', {transition, landing});
    },
  });
}

cases.push({
  key: 'motion-default-fine',
  group: 'motion-default',
  story: 'core-outline--navigate-callbacks',
  theme: 'neutral',
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  motion: 'no-preference',
  pointer: 'fine',
  count: 6,
  current: 'Overview',
  run: async (page, check, frame) => {
    const before = await outline(page);
    const transition = before?.indicatorTransition ?? null;
    check(
      transition != null &&
        transition.duration
          .split(',')
          .some(value => Number.parseFloat(value) > 0),
      `the indicator does not move with no preference: ${JSON.stringify(transition)}`,
    );
    await page.locator(`${NAV} a`, {hasText: 'Accessibility'}).click();
    await nextFrames(page);
    const early = await page.evaluate(() => Math.round(scrollY));
    await page.waitForTimeout(1500);
    const settled = await page.evaluate(() => Math.round(scrollY));
    const landing = {early, settled};
    check(
      settled > 0 && early < settled,
      `with no preference the scroll did not travel: ${JSON.stringify(landing)}`,
    );
    await frame('scrolled', {transition, landing});
  },
});

cases.push({
  key: 'long-labels-light-ltr',
  group: 'long-labels',
  story: 'core-outline--long-labels',
  theme: 'neutral',
  mode: 'light',
  direction: 'ltr',
  viewport: DESKTOP,
  motion: 'still',
  pointer: 'fine',
  count: 3,
  current: 'Installing the package in a monorepo with several build targets',
  run: async (page, check, frame) => {
    // A label longer than the column is cut with an ellipsis and stays on one
    // line, and the column does not grow.
    const labels = await page.evaluate(nav => {
      const root = document.querySelector(nav);
      return [...(root?.querySelectorAll('a') ?? [])].map(link => {
        const label = link.querySelector('span') ?? link;
        return {
          text: link.textContent ?? '',
          clipped: label.scrollWidth > label.clientWidth,
          oneLine:
            label.getBoundingClientRect().height <=
            parseFloat(getComputedStyle(label).lineHeight) * 1.5,
          fits:
            link.getBoundingClientRect().right <=
            (root?.getBoundingClientRect().right ?? 0) + 0.5,
        };
      });
    }, NAV);
    for (const label of labels) {
      check(label.oneLine, `${label.text} wraps`);
      check(label.fits, `${label.text} overflows the column`);
    }
    check(
      labels.filter(label => label.clipped).length === 2,
      `clipped labels ${JSON.stringify(labels.map(label => label.clipped))}`,
    );
    await frame('long-labels', {labels});
  },
});

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `keyboard-narrow-light-${direction}`,
    group: 'narrow',
    story: 'core-outline--keyboard-navigation',
    theme: 'neutral',
    mode: 'light',
    direction,
    viewport: NARROW,
    motion: 'still',
    pointer: 'fine',
    count: 6,
    run: async (page, check, frame) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      check(overflow <= 0, `page scrolls sideways by ${overflow}px`);
      await frame('narrow', {overflow});
    },
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
  await page.emulateMedia({
    colorScheme: item.mode,
    reducedMotion: item.motion === 'no-preference' ? 'no-preference' : 'reduce',
  });
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
  await page.mouse.move(0, 0);
  await page.goto(url, {waitUntil: 'load'});
  await page.locator(NAV).first().waitFor();
  await settle(page, item.motion);
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
  check(
    sensors.reducedMotion === (item.motion !== 'no-preference'),
    `reduced motion ${sensors.reducedMotion}`,
  );
  check(
    sensors.coarsePointer === (item.pointer === 'coarse'),
    `coarse pointer ${sensors.coarsePointer}`,
  );
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
    const read = await outline(page);
    check(read != null, 'no Outline nav');
    if (read != null) {
      checkOutline(check, read, item.count, item.current);
    }
    const axe = await axeRoot(page);
    check(axe.length === 0, `axe: ${axe.join(' | ')}`);
    await frame('rest', {read, axe});
    if (item.run != null) {
      await item.run(page, check, frame);
    }
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'Outline',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    theme: item.theme,
    mode: item.mode,
    direction: item.direction,
    viewport: item.viewport,
    motion: item.motion,
    pointer: item.pointer,
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

async function contextFor(browser: Browser, pointer: Pointer) {
  return browser.newContext({
    deviceScaleFactor: 2,
    ...(pointer === 'coarse' ? {hasTouch: true, isMobile: true} : {}),
  });
}

for (const group of [...new Set(cases.map(item => item.group))]) {
  test(group, async ({browser}) => {
    const failures: string[] = [];
    for (const pointer of ['fine', 'coarse'] as const) {
      const items = cases.filter(
        c => c.group === group && c.pointer === pointer,
      );
      if (items.length === 0) {
        continue;
      }
      const context = await contextFor(browser, pointer);
      try {
        const page = await context.newPage();
        for (const item of items) {
          failures.push(...(await runCase(page, item)));
        }
      } finally {
        await context.close();
      }
    }
    expect(failures).toEqual([]);
  });
}
