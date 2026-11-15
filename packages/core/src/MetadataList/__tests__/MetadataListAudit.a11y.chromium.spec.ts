// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit MetadataList

/**
 * @file MetadataListAudit.a11y.chromium.spec.ts
 * @input Exact-head MetadataList stories, across modes, direction, and widths
 * @output Screenshots and fail-closed sensor receipts for the MetadataList whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a MetadataList audit pull request
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

const OUTPUT = path.resolve('metadata-list-audit-evidence');

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
  ready: string;
  mode: Mode;
  direction: Direction;
  viewport: Viewport;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const SMALL = {width: 640, height: 480};
const WIDE = {width: 1180, height: 600};
const NARROW = {width: 320, height: 720};

const TEXT_PARTS: [string, string][] = [
  ['label', 'dt'],
  ['value', 'dd'],
  ['toggle', 'button'],
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

/**
 * Contrast of each meaningful text part against the backdrop it paints on.
 * Each foreground is composited over the first opaque ancestor background.
 */
async function contrastPairs(page: Page, parts: [string, string][]) {
  return page.evaluate(parts => {
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
    const root = document.querySelector(
      '#storybook-root .astryx-metadata-list',
    );
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
  }, parts);
}

/** The list's semantics, layout, and each entry's label and value boxes. */
async function listShape(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      '#storybook-root .astryx-metadata-list',
    ) as HTMLElement;
    const dl = root.querySelector('dl') as HTMLElement;
    const style = getComputedStyle(dl);
    const rootRect = root.getBoundingClientRect();
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left - rootRect.left),
        right: Math.round(rootRect.right - r.right),
        top: Math.round(r.top - rootRect.top),
        width: Math.round(r.width),
      };
    };
    const terms = Array.from(dl.querySelectorAll('dt'));
    const button = root.querySelector('button');
    return {
      columns: root.getAttribute('data-columns'),
      orientation: root.getAttribute('data-orientation'),
      dlId: dl.id,
      dlLabelledBy: dl.getAttribute('aria-labelledby'),
      display: style.display,
      template: style.gridTemplateColumns,
      flexWrap: style.flexWrap,
      headingInside:
        root.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]') != null,
      dlLabel: dl.getAttribute('aria-label'),
      titleAboveList:
        dl.previousElementSibling != null &&
        dl.previousElementSibling.getBoundingClientRect().bottom <=
          dl.getBoundingClientRect().top + 0.5,
      entries: terms.map(dt => {
        const dd = dt.nextElementSibling as HTMLElement;
        const wrapper = dt.parentElement === dl ? null : dt.parentElement;
        return {
          label: dt.textContent,
          value: dd?.tagName === 'DD' ? dd.textContent : null,
          stacked: wrapper != null,
          itemTarget: (wrapper ?? dt).classList.contains(
            'astryx-metadata-list-item',
          ),
          term: box(dt),
          definition: dd ? box(dd) : null,
          item: box(wrapper ?? dt),
        };
      }),
      button:
        button == null
          ? null
          : {
              text: button.textContent,
              expanded: button.getAttribute('aria-expanded'),
              controls: button.getAttribute('aria-controls'),
              height: Math.round(button.getBoundingClientRect().height),
              width: Math.round(button.getBoundingClientRect().width),
            },
    };
  });
}

function distinct(values: number[]) {
  return [...new Set(values)].length;
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `basic-${mode}`,
    group: 'single-column',
    story: 'core-metadatalist--basic',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const shape = await listShape(page);
      check(shape.columns === 'single', `columns ${shape.columns}`);
      check(
        shape.orientation === 'vertical',
        `orientation ${shape.orientation}`,
      );
      check(shape.display === 'grid', `dl display ${shape.display}`);
      check(shape.entries.length === 3, `${shape.entries.length} entries`);
      for (const entry of shape.entries) {
        check(entry.value != null, `${entry.label} has no dd after its dt`);
        check(!entry.stacked, `${entry.label} is stacked`);
        check(entry.itemTarget, `${entry.label} has no item target`);
        check(
          entry.definition != null &&
            entry.term.left < entry.definition.left &&
            Math.abs(entry.term.top - entry.definition.top) <= 4,
          `${entry.label} label is not at the inline start of its value`,
        );
      }
      const contrast = await contrastPairs(page, TEXT_PARTS);
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
    },
  });

  cases.push({
    key: `basic-rtl-${mode}`,
    group: 'single-column',
    story: 'core-metadatalist--basic',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'rtl',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const shape = await listShape(page);
      for (const entry of shape.entries) {
        check(
          entry.definition != null && entry.term.right < entry.definition.right,
          `${entry.label} label is not at the inline start (right) of its value`,
        );
      }
      await frame('rest', {shape});
    },
  });

  cases.push({
    key: `custom-label-width-${mode}`,
    group: 'single-column',
    story: 'core-metadatalist--custom-label-width',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const shape = await listShape(page);
      check(
        shape.template.startsWith('200px '),
        `label track ${shape.template}`,
      );
      for (const entry of shape.entries) {
        check(
          entry.definition != null && entry.definition.left >= 200,
          `${entry.label} value starts inside the 200px label track`,
        );
      }
      await frame('rest', {shape});
    },
  });

  cases.push({
    key: `stacked-single-${mode}`,
    group: 'single-column',
    story: 'core-metadatalist--stacked-labels-single-column',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const shape = await listShape(page);
      for (const entry of shape.entries) {
        check(entry.stacked, `${entry.label} is not stacked`);
        check(
          entry.definition != null && entry.definition.top > entry.term.top,
          `${entry.label} value is not below its label`,
        );
      }
      await frame('rest', {shape});
    },
  });

  cases.push({
    key: `show-more-${mode}`,
    group: 'show-more',
    story: 'core-metadatalist--show-more',
    ready: '#storybook-root button',
    mode,
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const collapsed = await listShape(page);
      check(
        collapsed.entries.length === 3,
        `${collapsed.entries.length} entries`,
      );
      check(
        collapsed.button?.text === 'Show more',
        `button ${collapsed.button?.text}`,
      );
      check(
        collapsed.button?.expanded === 'false',
        'collapsed toggle not aria-expanded=false',
      );
      check(
        collapsed.button?.controls === collapsed.dlId,
        `toggle controls ${collapsed.button?.controls}, list is ${collapsed.dlId}`,
      );
      check(
        (collapsed.button?.height ?? 0) >= 24 &&
          (collapsed.button?.width ?? 0) >= 24,
        `toggle target ${collapsed.button?.width}x${collapsed.button?.height}`,
      );
      const contrast = await contrastPairs(page, TEXT_PARTS);
      check(
        contrast.some(pair => pair.part === 'toggle'),
        'the toggle was not measured',
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
      await frame('collapsed', {collapsed, contrast});

      const toggle = page.getByRole('button', {name: 'Show more', exact: true});
      await toggle.hover();
      await settle(page);
      const hovered = await toggle.evaluate(el => ({
        cursor: getComputedStyle(el).cursor,
        color: getComputedStyle(el).color,
      }));
      check(hovered.cursor === 'pointer', `toggle cursor ${hovered.cursor}`);
      await frame('hover', {hovered});

      await page.mouse.move(2, 2);
      await page.keyboard.press('Tab');
      await settle(page);
      const focus = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement;
        const style = getComputedStyle(active);
        return {
          tag: active.tagName.toLowerCase(),
          text: active.textContent,
          focusVisible: active.matches(':focus-visible'),
          outline: `${style.outlineStyle} ${style.outlineWidth}`,
          boxShadow: style.boxShadow,
        };
      });
      check(
        focus.tag === 'button' && focus.text === 'Show more',
        `focused ${focus.tag} ${focus.text}`,
      );
      check(focus.focusVisible, 'the toggle is not :focus-visible');
      // The check accepts the browser's default focus outline.
      check(
        !focus.outline.startsWith('none') || focus.boxShadow !== 'none',
        `no focus indicator: ${focus.outline} / ${focus.boxShadow}`,
      );
      await frame('focus-visible', {focus});

      await page.keyboard.press('Enter');
      await settle(page);
      const expanded = await listShape(page);
      const stillFocused = await page.evaluate(
        () => document.activeElement?.textContent ?? null,
      );
      check(
        expanded.entries.length === 6,
        `${expanded.entries.length} entries after Enter`,
      );
      check(
        expanded.button?.text === 'Show less',
        `button ${expanded.button?.text}`,
      );
      check(
        expanded.button?.expanded === 'true',
        'expanded toggle not aria-expanded=true',
      );
      check(stillFocused === 'Show less', `focus moved to ${stillFocused}`);
      await frame('expanded', {expanded, stillFocused});

      await page.keyboard.press('Space');
      await settle(page);
      const again = await listShape(page);
      check(
        again.entries.length === 3,
        `${again.entries.length} entries after Space`,
      );
      check(again.button?.expanded === 'false', 'toggle did not collapse');
      const focusAfterCollapse = await page.evaluate(
        () => document.activeElement?.textContent ?? null,
      );
      check(
        focusAfterCollapse === 'Show more',
        `focus moved to ${focusAfterCollapse}`,
      );
      await frame('collapsed-again', {again, focusAfterCollapse});
    },
  });

  cases.push({
    key: `multi-column-${mode}`,
    group: 'columns',
    story: 'core-metadatalist--multi-column',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: WIDE,
    run: async (page, check, frame) => {
      const shape = await listShape(page);
      check(shape.columns === 'multi', `columns ${shape.columns}`);
      check(shape.entries.length === 6, `${shape.entries.length} entries`);
      check(
        shape.entries.every(e => e.stacked),
        'multi entries are not stacked',
      );
      check(
        distinct(shape.entries.map(e => e.item.left)) >= 3,
        `${distinct(shape.entries.map(e => e.item.left))} columns at 1180px`,
      );
      await frame('rest', {shape});
    },
  });

  cases.push({
    key: `two-columns-${mode}`,
    group: 'columns',
    story: 'core-metadatalist--two-columns',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: WIDE,
    run: async (page, check, frame) => {
      const shape = await listShape(page);
      check(shape.columns === '2', `columns ${shape.columns}`);
      check(
        shape.entries.every(e => e.stacked),
        'two-column entries are not stacked',
      );
      check(
        distinct(shape.entries.map(e => e.item.left)) === 2,
        `${distinct(shape.entries.map(e => e.item.left))} columns`,
      );
      await frame('rest', {shape});
    },
  });

  cases.push({
    key: `multi-side-labels-${mode}`,
    group: 'columns',
    story: 'core-metadatalist--multi-column-side-labels',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: WIDE,
    run: async (page, check, frame) => {
      const shape = await listShape(page);
      check(
        shape.entries.every(e => !e.stacked),
        'side-label entries are stacked',
      );
      await frame('rest', {shape});
    },
  });

  cases.push({
    key: `with-title-${mode}`,
    group: 'columns',
    story: 'core-metadatalist--with-title',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: WIDE,
    run: async (page, check, frame) => {
      const shape = await listShape(page);
      check(shape.titleAboveList, 'title is not above the list');
      check(!shape.headingInside, 'the component made the title a heading');
      check(
        shape.dlLabelledBy == null && shape.dlLabel == null,
        'the title names the list',
      );
      await frame('rest', {shape});
    },
  });

  cases.push({
    key: `with-icons-${mode}`,
    group: 'columns',
    story: 'core-metadatalist--with-icons',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: WIDE,
    run: async (page, check, frame) => {
      const shape = await listShape(page);
      check(shape.entries.length === 3, `${shape.entries.length} entries`);
      await frame('rest', {shape});
    },
  });

  cases.push({
    key: `horizontal-${mode}`,
    group: 'horizontal',
    story: 'core-metadatalist--horizontal',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const shape = await listShape(page);
      check(
        shape.orientation === 'horizontal',
        `orientation ${shape.orientation}`,
      );
      check(
        shape.display === 'flex' && shape.flexWrap === 'wrap',
        `dl ${shape.display} ${shape.flexWrap}`,
      );
      check(
        shape.entries.every(e => e.stacked),
        'horizontal entries are not stacked',
      );
      check(
        distinct(shape.entries.map(e => e.item.top)) === 1,
        'horizontal entries do not share one row at 640px',
      );
      check(shape.button == null, 'horizontal list shows a toggle');
      await frame('rest', {shape});
    },
  });

  cases.push({
    key: `narrow-multi-${mode}`,
    group: 'narrow',
    story: 'core-metadatalist--multi-column',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: NARROW,
    run: async (page, check, frame) => {
      const shape = await listShape(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      check(overflow <= 0, `page scrolls sideways by ${overflow}px`);
      check(
        distinct(shape.entries.map(e => e.item.left)) === 1,
        'multi columns do not fall to one column at 320px',
      );
      await frame('rest', {shape, overflow});
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
    component: 'MetadataList',
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
