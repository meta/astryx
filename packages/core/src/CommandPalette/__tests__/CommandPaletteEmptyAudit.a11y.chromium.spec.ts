// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit CommandPaletteEmpty

/**
 * @file CommandPaletteEmptyAudit.a11y.chromium.spec.ts
 * @input Exact-head CommandPalette and CommandPaletteEmpty stories: the inline
 *   audit matrix, the modal built-in strings palette, and the empty content
 *   matrix, across states, themes, direction, pointers, and viewport sizes
 * @output Screenshots and fail-closed sensor receipts for the CommandPaletteEmpty whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a CommandPaletteEmpty audit pull request
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {inflateSync} from 'node:zlib';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('command-palette-empty-audit-evidence');
const WIDE = {width: 1024, height: 768};
const NARROW = {width: 320, height: 720};
const QUERY = 'zzz';

type Mode = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';
type Theme = 'neutral' | 'butter' | 'probe';
type Pointer = 'fine' | 'coarse';
type Story = 'matrix' | 'builtin' | 'content';
type State = 'rest' | 'search' | 'link-focus';

type AuditCase = {
  key: string;
  story: Story;
  mode: Mode;
  direction: Direction;
  theme: Theme;
  state: State;
  pointer: Pointer;
  forcedColors: boolean;
  viewport: {width: number; height: number};
};

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
};

const cases: AuditCase[] = [];
function addPair(
  key: string,
  options: Partial<Omit<AuditCase, 'key' | 'mode'>> = {},
) {
  for (const mode of ['light', 'dark'] as const) {
    cases.push({
      key: `${key}-${mode}`,
      story: options.story ?? 'matrix',
      mode,
      direction: options.direction ?? 'ltr',
      theme: options.theme ?? 'neutral',
      state: options.state ?? 'rest',
      pointer: options.pointer ?? 'fine',
      forcedColors: options.forcedColors ?? false,
      viewport: options.viewport ?? WIDE,
    });
  }
}

addPair('matrix-bootstrap');
addPair('matrix-bootstrap-butter', {theme: 'butter'});
addPair('matrix-bootstrap-probe', {theme: 'probe'});
addPair('matrix-bootstrap-rtl', {direction: 'rtl'});
addPair('matrix-bootstrap-narrow', {viewport: NARROW});
addPair('matrix-bootstrap-coarse', {viewport: NARROW, pointer: 'coarse'});
addPair('matrix-bootstrap-forced-colors', {forcedColors: true});
addPair('matrix-search', {state: 'search'});
addPair('matrix-search-butter', {state: 'search', theme: 'butter'});
addPair('matrix-search-probe', {state: 'search', theme: 'probe'});
addPair('matrix-search-rtl', {state: 'search', direction: 'rtl'});
addPair('matrix-search-narrow', {state: 'search', viewport: NARROW});
addPair('matrix-link-focus', {state: 'link-focus'});
addPair('matrix-link-focus-butter', {state: 'link-focus', theme: 'butter'});
addPair('builtin-bootstrap', {story: 'builtin'});
addPair('builtin-search', {story: 'builtin', state: 'search'});
addPair('builtin-search-narrow', {
  story: 'builtin',
  state: 'search',
  viewport: NARROW,
});
addPair('content-rest', {story: 'content'});
addPair('content-rest-butter', {story: 'content', theme: 'butter'});
addPair('content-rest-rtl', {story: 'content', direction: 'rtl'});
addPair('content-rest-narrow', {story: 'content', viewport: NARROW});
addPair('content-search', {story: 'content', state: 'search'});
addPair('content-search-narrow', {
  story: 'content',
  state: 'search',
  viewport: NARROW,
});

const LONG_PATH =
  '/workspace/design-system/packages/core/src/CommandPalette/__fixtures__/empty-results/';
const STANDALONE = 'No saved searches yet. Create a saved search';

/** Rendered empty messages each story and state must show, in DOM order. */
function expectedTexts(item: AuditCase): string[] {
  const isSearch = item.state === 'search';
  if (item.story === 'builtin') {
    return [isSearch ? 'No results' : 'Type to search'];
  }
  if (item.story === 'content') {
    return isSearch
      ? [
          'Aucune commande ne correspond à votre recherche',
          `No files match ${LONG_PATH}`,
          STANDALONE,
        ]
      : [
          'Commencez à saisir pour rechercher parmi les commandes disponibles',
          `No files in ${LONG_PATH}`,
          STANDALONE,
        ];
  }
  return [
    isSearch
      ? 'No matching commands. Create a command'
      : 'No commands yet. Create a command',
  ];
}

/**
 * The search message the live region must carry; null where not asserted.
 * Only the modal palette settles: the audit matrix keeps a never-settling
 * pending palette beside the empty one, and React entangles their transitions,
 * so its search stays pending and is announced only once it settles. The
 * content matrix types into two palettes, so the region holds whichever
 * message was announced last.
 */
function expectedAnnouncement(item: AuditCase): string | null {
  if (item.state !== 'search' || item.story !== 'builtin') {
    return null;
  }
  return expectedTexts(item)[0];
}

/**
 * The root color scheme: `html[data-theme]` maps the mode to `color-scheme`,
 * and forced colors mode forces `color-scheme: light dark` (CSS Color
 * Adjustment Module Level 1).
 */
function expectedColorScheme(item: AuditCase) {
  return item.forcedColors ? 'light dark' : item.mode;
}

test.describe.configure({mode: 'serial', retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyId(item: AuditCase) {
  if (item.story === 'builtin') {
    return 'core-commandpalette--built-in-strings';
  }
  if (item.story === 'content') {
    return 'core-commandpaletteempty--content-matrix';
  }
  return 'core-commandpalette--audit-matrix';
}

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=${storyId(item)}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
}

async function settle(page: Page) {
  await holdMotionStill(page);
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForTimeout(40);
}

async function politeText(page: Page) {
  return page.evaluate(
    () =>
      document
        .querySelector('[data-astryx-live-region="polite"]')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? '',
  );
}

async function emptyTexts(subject: Locator) {
  return subject
    .locator('.astryx-command-palette-empty')
    .evaluateAll(nodes =>
      nodes.map(node => node.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
    );
}

/** Waits up to `timeout` for `read` to return `want`; returns the last value. */
async function waitFor<T>(
  read: () => Promise<T>,
  want: (value: T) => boolean,
  timeout = 4000,
): Promise<T> {
  const start = Date.now();
  let value = await read();
  while (!want(value) && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, 50));
    value = await read();
  }
  return value;
}

/**
 * Whether a PNG paints more than one color, read from its decoded pixels so a
 * blank or single-color frame cannot pass as evidence.
 */
function isNonBlank(png: Buffer): boolean {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const chunks: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
    } else if (type === 'IDAT') {
      chunks.push(data);
    }
    offset += 12 + length;
  }
  if (channels === 0 || width === 0 || height === 0) {
    return false;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  let previous = Buffer.alloc(stride);
  let first: string | null = null;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(
      raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)),
    );
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) {
        predictor = left;
      } else if (filter === 2) {
        predictor = up;
      } else if (filter === 3) {
        predictor = Math.floor((left + up) / 2);
      } else if (filter === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        predictor =
          toLeft <= toUp && toLeft <= toUpLeft
            ? left
            : toUp <= toUpLeft
              ? up
              : upLeft;
      }
      line[x] = (line[x] + predictor) & 255;
    }
    for (let x = 0; x < stride; x += channels) {
      const pixel = line.subarray(x, x + channels).toString('hex');
      if (first == null) {
        first = pixel;
      } else if (pixel !== first) {
        return true;
      }
    }
    previous = line;
  }
  return false;
}

/**
 * Settled-render readback taken just before capture: running animations under
 * the subject, and the subject plus every empty root measured twice, two
 * animation frames and 100 ms apart.
 */
async function readSettledRender(page: Page, subject: Locator) {
  const sample = async () =>
    subject.evaluate(root =>
      [root, ...root.querySelectorAll('.astryx-command-palette-empty')].map(
        node => {
          const box = node.getBoundingClientRect();
          return [box.x, box.y, box.width, box.height].map(
            value => Math.round(value * 100) / 100,
          );
        },
      ),
    );
  const first = await sample();
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await page.waitForTimeout(100);
  const second = await sample();
  const animations = await subject.evaluate(root => {
    const running = document
      .getAnimations()
      .filter(animation => animation.playState === 'running');
    return {
      document: running.length,
      subject: running.filter(animation => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return target != null && root.contains(target);
      }).length,
    };
  });
  return {
    runningAnimations: animations,
    geometry: {first, second},
    geometryStable: JSON.stringify(first) === JSON.stringify(second),
  };
}

test.beforeAll(async () => {
  fs.rmSync(OUTPUT, {recursive: true, force: true});
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
      deviceScaleFactor: 1,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
      hasTouch: item.pointer === 'coarse',
      forcedColors: item.forcedColors ? 'active' : 'none',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.locator('#storybook-root').waitFor();

    let subject: Locator;
    if (item.story === 'builtin') {
      await page.getByRole('button', {name: 'Open'}).click();
      subject = page.getByRole('dialog');
      await subject.waitFor();
    } else if (item.story === 'content') {
      subject = page.locator('#storybook-root');
    } else {
      subject = page.getByRole('region', {name: 'Empty command palette'});
    }
    await subject.locator('.astryx-command-palette-empty').first().waitFor();
    await settle(page);

    const wantTexts = expectedTexts(item);
    const wantAnnouncement = expectedAnnouncement(item);
    let announcement: string | null = null;
    if (item.state === 'search') {
      const comboboxes = subject.getByRole('combobox');
      const count = await comboboxes.count();
      for (let index = 0; index < count; index++) {
        await comboboxes.nth(index).focus();
        await comboboxes.nth(index).pressSequentially(QUERY);
      }
      announcement = await waitFor(
        async () => politeText(page),
        value =>
          wantAnnouncement == null ? value !== '' : value === wantAnnouncement,
      );
      await waitFor(
        async () => emptyTexts(subject),
        value => JSON.stringify(value) === JSON.stringify(wantTexts),
      );
    } else if (item.state === 'link-focus') {
      await subject.getByRole('combobox').focus();
      await page.keyboard.press('Tab');
    }
    await page.evaluate(async () => document.fonts.ready);
    await page.waitForTimeout(40);

    const observed = await page.evaluate(() => ({
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      hover: matchMedia('(hover: hover)').matches,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      fonts: document.fonts.status,
      storybookError: document.body.classList.contains('sb-show-errordisplay'),
    }));

    const empties = await subject
      .locator('.astryx-command-palette-empty')
      .evaluateAll(nodes => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', {willReadFrequently: true});
        /** Any computed CSS color as sRGB 0–255 plus alpha 0–1. */
        function rgba(color: string): [number, number, number, number] {
          if (ctx == null) {
            return [0, 0, 0, 0];
          }
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = '#000';
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
          return [r, g, b, a / 255];
        }
        function backdropOf(start: Element): string {
          let node: Element | null = start;
          while (node) {
            const color = getComputedStyle(node).backgroundColor;
            if (rgba(color)[3] > 0) {
              return color;
            }
            node = node.parentElement;
          }
          return getComputedStyle(document.body).backgroundColor;
        }
        function luminance([r, g, b]: number[]) {
          const [lr, lg, lb] = [r, g, b].map(channel => {
            const c = channel / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
        }
        function ratio(foreground: string, backdrop: string) {
          const bg = rgba(backdrop);
          const fg = rgba(foreground);
          const mixed = [0, 1, 2].map(
            index => fg[index] * fg[3] + bg[index] * (1 - fg[3]),
          );
          const [high, low] = [luminance(mixed), luminance(bg)].sort(
            (a, b) => b - a,
          );
          return Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100;
        }
        return nodes.map(node => {
          const element = node as HTMLElement;
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          const list = element.closest('.astryx-command-palette-list');
          const host = element.closest('[role="dialog"], section, dialog');
          const hostBox = host?.getBoundingClientRect() ?? null;
          const backdrop = backdropOf(element);
          const link = element.querySelector('a');
          const linkStyle = link == null ? null : getComputedStyle(link);
          return {
            text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            role: element.getAttribute('role'),
            inPalette: list != null,
            listRole: list?.getAttribute('role') ?? null,
            listOverflow:
              list == null
                ? false
                : list.scrollWidth > (list as HTMLElement).clientWidth + 1,
            selfOverflow: element.scrollWidth > element.clientWidth + 1,
            outsideHost:
              hostBox == null
                ? false
                : box.left < hostBox.left - 1 || box.right > hostBox.right + 1,
            direction: style.direction,
            textAlign: style.textAlign,
            color: style.color,
            backdrop,
            textContrast: ratio(style.color, backdrop),
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            fontFamily: style.fontFamily,
            padding: {
              blockStart: style.paddingBlockStart,
              blockEnd: style.paddingBlockEnd,
              inlineStart: style.paddingInlineStart,
              inlineEnd: style.paddingInlineEnd,
            },
            link:
              link == null || linkStyle == null
                ? null
                : {
                    text: link.textContent?.trim() ?? '',
                    color: linkStyle.color,
                    contrast: ratio(linkStyle.color, backdrop),
                    focused: link === document.activeElement,
                    focusVisible: link.matches(':focus-visible'),
                    outlineStyle: linkStyle.outlineStyle,
                    outlineWidth: linkStyle.outlineWidth,
                    outlineColor: linkStyle.outlineColor,
                    outlineContrast:
                      linkStyle.outlineStyle === 'none'
                        ? null
                        : ratio(linkStyle.outlineColor, backdrop),
                  },
            geometry: {
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
            },
          };
        });
      });
    const listboxesInSubject = await subject.getByRole('listbox').count();
    const pendingIndicators = await subject.locator('.astryx-spinner').count();
    const comboboxStates = await subject
      .getByRole('combobox')
      .evaluateAll(nodes =>
        nodes.map(node => ({
          value: (node as HTMLInputElement).value,
          expanded: node.getAttribute('aria-expanded'),
          controls: node.getAttribute('aria-controls'),
          activeDescendant: node.getAttribute('aria-activedescendant'),
        })),
      );

    const paletteEmpties = empties.filter(empty => empty.inPalette);
    const semanticsPass =
      JSON.stringify(empties.map(empty => empty.text)) ===
        JSON.stringify(wantTexts) &&
      empties.every(empty => empty.role === null) &&
      paletteEmpties.every(empty => empty.listRole === null) &&
      listboxesInSubject === 0 &&
      empties.every(
        empty => empty.geometry.width > 0 && empty.geometry.height > 0,
      );
    const reflowPass = empties.every(
      empty => !empty.listOverflow && !empty.selfOverflow && !empty.outsideHost,
    );
    let statePass: boolean;
    if (item.state === 'search') {
      statePass =
        comboboxStates.length > 0 &&
        comboboxStates.every(
          combobox =>
            combobox.value === QUERY && combobox.activeDescendant === null,
        ) &&
        (wantAnnouncement == null || announcement === wantAnnouncement);
    } else if (item.state === 'link-focus') {
      const link = empties[0]?.link;
      statePass = link?.focused === true && link.focusVisible === true;
    } else {
      statePass = comboboxStates.every(
        combobox => combobox.value === '' && combobox.activeDescendant === null,
      );
    }

    const settled = await readSettledRender(page, subject);
    const png =
      item.story === 'content'
        ? await page.screenshot({animations: 'disabled', fullPage: true})
        : await subject.screenshot({animations: 'disabled'});

    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 3,
      expected: {
        build: checkoutSha,
        storyId: storyId(item),
        mode: item.mode,
        direction: item.direction,
        theme: item.theme,
        state: item.state,
        pointer: item.pointer,
        forcedColors: item.forcedColors,
        viewport: item.viewport,
        dpr: 1,
        colorScheme: expectedColorScheme(item),
        runningAnimationsInSubject: 0,
        geometryStable: true,
        texts: wantTexts,
        announcement: wantAnnouncement,
        listboxes: 0,
        textContrastThreshold: 4.5,
      },
      observed: {
        build: storybookSha,
        ...observed,
        empties,
        listboxesInSubject,
        pendingIndicators,
        comboboxStates,
        announcement,
        settled,
        pageErrors,
      },
      image: {
        file: image,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
        nonBlank: isNonBlank(png),
      },
      checks: {
        semanticsPass,
        reflowPass,
        statePass,
        // Recorded, not gating: a token-layer pair is reported against the
        // token layer rather than this component.
        textContrastPass: item.forcedColors
          ? null
          : empties.every(empty => empty.textContrast >= 4.5),
      },
      passed:
        storybookSha === checkoutSha &&
        pageErrors.length === 0 &&
        !observed.storybookError &&
        observed.theme === item.theme &&
        observed.mode === item.mode &&
        observed.colorScheme === expectedColorScheme(item) &&
        observed.dpr === 1 &&
        settled.runningAnimations.subject === 0 &&
        settled.geometryStable &&
        isNonBlank(png) &&
        empties.every(empty => empty.direction === item.direction) &&
        observed.viewport.width === item.viewport.width &&
        observed.viewport.height === item.viewport.height &&
        observed.reducedMotion &&
        observed.coarsePointer === (item.pointer === 'coarse') &&
        observed.forcedColors === item.forcedColors &&
        !observed.horizontalOverflow &&
        observed.fonts === 'loaded' &&
        semanticsPass &&
        reflowPass &&
        statePass,
    };
    fs.writeFileSync(path.join(OUTPUT, image), png);
    fs.writeFileSync(
      path.join(OUTPUT, `${item.key}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );

    await context.close();
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
  const manifest = {
    schemaVersion: 3,
    component: 'core/CommandPaletteEmpty',
    build: checkoutSha,
    frames: cases.map(item => ({
      key: item.key,
      image: `${item.key}.png`,
      receipt: `${item.key}.sensors.json`,
    })),
  };
  fs.writeFileSync(
    path.join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  expect(receiptFiles).toHaveLength(cases.length);
  expect(
    receipts
      .filter(receipt => !receipt.passed)
      .map(receipt => receipt.expected),
  ).toEqual([]);
});
