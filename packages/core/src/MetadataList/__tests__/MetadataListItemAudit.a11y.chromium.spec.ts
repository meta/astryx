// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit MetadataListItem

/**
 * @file MetadataListItemAudit.a11y.chromium.spec.ts
 * @input Exact-head MetadataList stories, side by side and stacked, across modes, direction, and widths
 * @output Screenshots and fail-closed sensor receipts for the MetadataListItem whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a MetadataListItem audit pull request
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

const OUTPUT = path.resolve('metadata-list-item-audit-evidence');

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

/** Token values at the default 16px root, authored from the record and tokens. */
const STACKED_GAP_PX = 2;
const ICON_GAP_PX = 8;
const MIN_CELL_PX = 24;

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
 * Each entry's markup, type, and boxes. Boxes are relative to the list root;
 * the label text box is measured from its text node, apart from the icon.
 */
async function entries(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      '#storybook-root .astryx-metadata-list',
    ) as HTMLElement;
    const dl = root.querySelector('dl') as HTMLElement;
    const rootRect = root.getBoundingClientRect();
    const box = (rect: DOMRect) => ({
      left: Math.round((rect.left - rootRect.left) * 10) / 10,
      right: Math.round((rect.right - rootRect.left) * 10) / 10,
      top: Math.round((rect.top - rootRect.top) * 10) / 10,
      bottom: Math.round((rect.bottom - rootRect.top) * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    });
    return Array.from(dl.querySelectorAll('dt')).map(dt => {
      const dd = dt.nextElementSibling as HTMLElement | null;
      const wrapper = dt.parentElement === dl ? null : dt.parentElement;
      const icon = dt.querySelector(':scope > span');
      const textNode = Array.from(dt.childNodes).find(
        node => node.nodeType === Node.TEXT_NODE,
      );
      let text = null;
      if (textNode != null) {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        text = box(range.getBoundingClientRect());
      }
      const dtStyle = getComputedStyle(dt);
      const ddStyle = dd ? getComputedStyle(dd) : null;
      return {
        label: textNode?.textContent ?? null,
        valueTag: dd?.tagName ?? null,
        dtParent: wrapper == null ? 'dl' : wrapper.tagName,
        wrapperParent: wrapper?.parentElement === dl ? 'dl' : null,
        wrapperGap: wrapper ? getComputedStyle(wrapper).rowGap : null,
        target: (wrapper ?? dt).classList.contains('astryx-metadata-list-item'),
        ddTarget: dd?.classList.contains('astryx-metadata-list-item') ?? false,
        iconFirst: icon != null && dt.firstChild === icon,
        hasIcon: icon != null,
        term: box(dt.getBoundingClientRect()),
        definition: dd ? box(dd.getBoundingClientRect()) : null,
        icon: icon ? box(icon.getBoundingClientRect()) : null,
        text,
        type: {
          labelWeight: dtStyle.fontWeight,
          valueWeight: ddStyle?.fontWeight ?? null,
          labelSize: dtStyle.fontSize,
          valueSize: ddStyle?.fontSize ?? null,
          labelColor: dtStyle.color,
          valueColor: ddStyle?.color ?? null,
          iconColor: icon ? getComputedStyle(icon).color : null,
        },
      };
    });
  });
}

/** Contrast of the first label and value against the backdrop they paint on. */
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
    const dl = document.querySelector(
      '#storybook-root .astryx-metadata-list dl',
    );
    return [
      ['label', 'dt'],
      ['value', 'dd'],
    ].flatMap(([name, selector]) => {
      const el = dl?.querySelector(selector);
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

/** The term and definition roles Chromium exposes, in tree order. */
async function axPairs(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const {nodes} = (await cdp.send('Accessibility.getFullAXTree')) as {
      nodes: {ignored?: boolean; role?: {value?: string}}[];
    };
    return nodes
      .filter(node => !node.ignored)
      .map(node => node.role?.value ?? '')
      .filter(role => role === 'term' || role === 'definition');
  } finally {
    await cdp.detach();
  }
}

function checkContrast(
  check: Check,
  contrast: Awaited<ReturnType<typeof contrastPairs>>,
) {
  check(contrast.length === 2, `${contrast.length} contrast pairs measured`);
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
}

type Entry = Awaited<ReturnType<typeof entries>>[number];

function checkType(check: Check, entry: Entry) {
  check(
    entry.type.labelWeight === '500',
    `${entry.label} label weight ${entry.type.labelWeight}`,
  );
  check(
    entry.type.valueWeight === '400',
    `${entry.label} value weight ${entry.type.valueWeight}`,
  );
  check(
    entry.type.labelSize === entry.type.valueSize,
    `${entry.label} label ${entry.type.labelSize} and value ${entry.type.valueSize} differ in size`,
  );
  check(
    entry.type.labelColor !== entry.type.valueColor,
    `${entry.label} label and value share one color`,
  );
}

function checkIcon(check: Check, entry: Entry, direction: Direction) {
  check(entry.hasIcon, `${entry.label} has no icon`);
  check(
    entry.iconFirst,
    `${entry.label} icon is not the first child of its dt`,
  );
  if (entry.icon == null || entry.text == null) {
    check(false, `${entry.label} icon or label text not measured`);
    return;
  }
  const gap =
    direction === 'ltr'
      ? entry.text.left - entry.icon.right
      : entry.icon.left - entry.text.right;
  check(
    Math.abs(gap - ICON_GAP_PX) <= 0.5,
    `${entry.label} icon gap ${gap}px, not ${ICON_GAP_PX}px at the inline start`,
  );
  check(
    entry.type.iconColor === entry.type.labelColor,
    `${entry.label} icon color ${entry.type.iconColor} differs from label ${entry.type.labelColor}`,
  );
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  cases.push({
    key: `side-${mode}`,
    group: 'side-by-side',
    story: 'core-metadatalist--basic',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const list = await entries(page);
      check(list.length === 3, `${list.length} entries`);
      for (const entry of list) {
        check(entry.dtParent === 'dl', `${entry.label} dt is not a dl child`);
        check(entry.valueTag === 'DD', `${entry.label} has no dd after its dt`);
        check(
          entry.target,
          `${entry.label} dt has no metadata-list-item target`,
        );
        check(!entry.ddTarget, `${entry.label} dd carries the item target`);
        check(
          entry.term.height >= MIN_CELL_PX &&
            (entry.definition?.height ?? 0) >= MIN_CELL_PX,
          `${entry.label} cells ${entry.term.height} / ${entry.definition?.height}px tall`,
        );
        check(
          entry.definition != null &&
            entry.term.right <= entry.definition.left &&
            Math.abs(entry.term.top - entry.definition.top) <= 4,
          `${entry.label} label is not at the inline start of its value`,
        );
        checkType(check, entry);
      }
      const roles = await axPairs(page);
      check(
        roles.join(',') === 'term,definition,term,definition,term,definition',
        `accessibility tree roles: ${roles.join(',')}`,
      );
      const contrast = await contrastPairs(page);
      checkContrast(check, contrast);
      await frame('rest', {list, roles, contrast});
    },
  });

  cases.push({
    key: `side-rtl-${mode}`,
    group: 'side-by-side',
    story: 'core-metadatalist--basic',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'rtl',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const list = await entries(page);
      check(list.length === 3, `${list.length} entries`);
      for (const entry of list) {
        check(
          entry.definition != null &&
            entry.term.left >= entry.definition.right &&
            Math.abs(entry.term.top - entry.definition.top) <= 4,
          `${entry.label} label is not at the inline start (right) of its value on the same row`,
        );
      }
      await frame('rest', {list});
    },
  });

  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `icons-${direction}-${mode}`,
      group: 'icons',
      story: 'core-metadatalist--with-icons',
      ready: '#storybook-root dl dt svg',
      mode,
      direction,
      viewport: WIDE,
      run: async (page, check, frame) => {
        const list = await entries(page);
        check(list.length === 3, `${list.length} entries`);
        for (const entry of list) {
          check(entry.dtParent === 'DIV', `${entry.label} is not stacked`);
          checkIcon(check, entry, direction);
        }
        await frame('rest', {list});
      },
    });
  }

  cases.push({
    key: `stacked-${mode}`,
    group: 'stacked',
    story: 'core-metadatalist--stacked-labels-single-column',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const list = await entries(page);
      check(list.length === 4, `${list.length} entries`);
      for (const entry of list) {
        check(entry.dtParent === 'DIV', `${entry.label} has no wrapper`);
        check(
          entry.wrapperParent === 'dl',
          `${entry.label} wrapper is not a dl child`,
        );
        check(entry.target, `${entry.label} wrapper has no item target`);
        check(entry.valueTag === 'DD', `${entry.label} has no dd after its dt`);
        check(
          entry.wrapperGap === `${STACKED_GAP_PX}px`,
          `${entry.label} wrapper gap ${entry.wrapperGap}`,
        );
        check(
          entry.definition != null &&
            Math.abs(
              entry.definition.top - entry.term.bottom - STACKED_GAP_PX,
            ) <= 0.5,
          `${entry.label} value is not ${STACKED_GAP_PX}px below its label`,
        );
        checkType(check, entry);
      }
      const roles = await axPairs(page);
      check(
        roles.length === list.length * 2 &&
          roles.every((role, i) => role === (i % 2 ? 'definition' : 'term')),
        `accessibility tree roles: ${roles.join(',')}`,
      );
      const contrast = await contrastPairs(page);
      checkContrast(check, contrast);
      await frame('rest', {list, roles, contrast});
    },
  });

  cases.push({
    key: `horizontal-${mode}`,
    group: 'stacked',
    story: 'core-metadatalist--horizontal',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: SMALL,
    run: async (page, check, frame) => {
      const list = await entries(page);
      check(list.length === 4, `${list.length} entries`);
      for (const entry of list) {
        check(entry.dtParent === 'DIV', `${entry.label} is not stacked`);
        check(
          entry.wrapperParent === 'dl',
          `${entry.label} wrapper is not a dl child`,
        );
        check(entry.target, `${entry.label} wrapper has no item target`);
        check(
          entry.wrapperGap === `${STACKED_GAP_PX}px`,
          `${entry.label} wrapper gap ${entry.wrapperGap}`,
        );
        check(
          entry.definition != null &&
            Math.abs(
              entry.definition.top - entry.term.bottom - STACKED_GAP_PX,
            ) <= 0.5,
          `${entry.label} value is not ${STACKED_GAP_PX}px below its label`,
        );
      }
      const roles = await axPairs(page);
      check(
        roles.length === list.length * 2 &&
          roles.every((role, i) => role === (i % 2 ? 'definition' : 'term')),
        `accessibility tree roles: ${roles.join(',')}`,
      );
      await frame('rest', {list, roles});
    },
  });

  cases.push({
    key: `narrow-side-${mode}`,
    group: 'narrow',
    story: 'core-metadatalist--basic',
    ready: '#storybook-root dl dd',
    mode,
    direction: 'ltr',
    viewport: NARROW,
    run: async (page, check, frame) => {
      const list = await entries(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      check(overflow <= 0, `page scrolls sideways by ${overflow}px`);
      check(list.length === 3, `${list.length} entries`);
      for (const entry of list) {
        check(
          entry.definition != null &&
            Math.abs(entry.term.top - entry.definition.top) <= 4,
          `${entry.label} label and value leave one row at 320px`,
        );
      }
      await frame('rest', {list, overflow});
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
    component: 'MetadataListItem',
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
