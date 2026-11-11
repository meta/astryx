// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Kbd

/**
 * @file KbdAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/Kbd stories across themes, modes, text sizes, direction, and width
 * @output Screenshots and fail-closed sensor receipts for the Kbd whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a Kbd audit pull request
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

const OUTPUT = path.resolve('kbd-audit-evidence');
const WIDE = {width: 640, height: 400};
const TALL = {width: 640, height: 640};
const NARROW = {width: 320, height: 400};

type Mode = 'light' | 'dark';
type Theme = 'neutral' | 'butter';
type Direction = 'ltr' | 'rtl';
type Story =
  | 'modifier-combinations'
  | 'special-keys'
  | 'larger-text'
  | 'inline-with-text'
  | 'menu-shortcuts';

type AuditCase = {
  key: string;
  story: Story;
  mode: Mode;
  theme: Theme;
  direction: Direction;
  viewport: {width: number; height: number};
};

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
  failures: string[];
};

// What each story shows, in document order: the visible text of every
// badge, then the spoken name of every shortcut. The CI browser is not an
// Apple platform, so `mod` and `ctrl` show "Ctrl", `alt` and `shift` show
// "Alt" and "Shift", and `mod` is spoken "Control".
const GLYPHS: Record<Story, string[]> = {
  'modifier-combinations': ['Ctrl', 'K', 'Shift', '↵', 'Ctrl', 'C', 'Alt', '⇥'],
  'special-keys': [
    'Esc',
    'Esc',
    '↵',
    '↵',
    '⌫',
    '⇥',
    'SPACE',
    '↑',
    '↓',
    '←',
    '→',
  ],
  'larger-text': [0, 1, 2].flatMap(() => [
    'Ctrl',
    'K',
    'Shift',
    '↵',
    'Esc',
    '↑',
  ]),
  'inline-with-text': ['Ctrl', 'K', 'Ctrl', 'Shift', 'P', 'Esc', '↑', '↓', '↵'],
  'menu-shortcuts': [
    'Ctrl',
    'X',
    'Ctrl',
    'C',
    'Ctrl',
    'V',
    'Ctrl',
    'Z',
    'Ctrl',
    'Shift',
    'Z',
  ],
};
const NAMES: Record<Story, string[]> = {
  'modifier-combinations': [
    'Control + K',
    'Shift + Enter',
    'Control + C',
    'Alt + Tab',
  ],
  'special-keys': [
    'Escape',
    'Escape',
    'Enter',
    'Enter',
    'Backspace',
    'Tab',
    'SPACE',
    'Up arrow',
    'Down arrow',
    'Left arrow',
    'Right arrow',
  ],
  'larger-text': [0, 1, 2].flatMap(() => [
    'Control + K',
    'Shift + Enter',
    'Escape',
    'Up arrow',
  ]),
  'inline-with-text': [
    'Control + K',
    'Control + Shift + P',
    'Escape',
    'Up arrow',
    'Down arrow',
    'Enter',
  ],
  'menu-shortcuts': [
    'Control + X',
    'Control + C',
    'Control + V',
    'Control + Z',
    'Control + Shift + Z',
  ],
};

const cases: AuditCase[] = [];
function add(
  story: Story,
  options: {
    theme?: Theme;
    direction?: Direction;
    modes?: Mode[];
    viewport?: {width: number; height: number};
    suffix?: string;
  } = {},
) {
  const theme = options.theme ?? 'neutral';
  const direction = options.direction ?? 'ltr';
  for (const mode of options.modes ?? ['light', 'dark']) {
    const parts: string[] = [story, options.suffix ?? '', theme];
    if (direction === 'rtl') {
      parts.push('rtl');
    }
    cases.push({
      key: `${parts.filter(Boolean).join('-')}-${mode}`,
      story,
      mode,
      theme,
      direction,
      viewport: options.viewport ?? WIDE,
    });
  }
}

add('modifier-combinations');
add('modifier-combinations', {theme: 'butter', modes: ['light']});
add('modifier-combinations', {direction: 'rtl', modes: ['light']});
add('special-keys', {viewport: TALL});
add('larger-text', {viewport: TALL});
add('larger-text', {theme: 'butter', modes: ['light'], viewport: TALL});
add('larger-text', {direction: 'rtl', modes: ['light'], viewport: TALL});
add('inline-with-text', {modes: ['light']});
add('inline-with-text', {suffix: 'narrow', viewport: NARROW, modes: ['light']});
add('menu-shortcuts', {modes: ['light']});

test.describe.configure({retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=core-kbd--${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
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
    // Resolve the badge tokens in the shortcut's own scope, so a row that
    // raises the text size resolves its own size.
    function resolveTokens(host: Element) {
      const probe = document.createElement('div');
      probe.style.cssText = [
        'position:absolute',
        'visibility:hidden',
        'background-color:var(--color-neutral)',
        'color:var(--color-text-primary)',
        'border-bottom-style:solid',
        'border-bottom-color:var(--color-border-emphasized)',
        'border-radius:var(--radius-inner)',
        'height:var(--spacing-5)',
        'font-size:var(--text-supporting-size)',
        'line-height:var(--text-supporting-leading)',
      ].join(';');
      host.appendChild(probe);
      const style = getComputedStyle(probe);
      const tokens = {
        background: style.backgroundColor,
        text: style.color,
        border: style.borderBottomColor,
        radius: px(style.borderTopLeftRadius),
        spacing5: px(style.height),
        fontSize: px(style.fontSize),
        lineHeight: px(style.lineHeight),
      };
      probe.remove();
      return tokens;
    }
    function channels(color: string) {
      const [r, g, b, a = 1] = (color.match(/[\d.]+/g) ?? []).map(Number);
      return {r, g, b, a: color.startsWith('rgba') ? a : 1};
    }
    // The badge fill is a translucent tint, so composite every background
    // from the element up to the first opaque one.
    function compositeBackground(element: Element) {
      const layers: ReturnType<typeof channels>[] = [];
      let node: Element | null = element;
      while (node) {
        const layer = channels(getComputedStyle(node).backgroundColor);
        if (layer.a > 0) {
          layers.push(layer);
        }
        if (layer.a >= 1) {
          break;
        }
        node = node.parentElement;
      }
      let result = {r: 255, g: 255, b: 255};
      for (const layer of layers.reverse()) {
        result = {
          r: layer.r * layer.a + result.r * (1 - layer.a),
          g: layer.g * layer.a + result.g * (1 - layer.a),
          b: layer.b * layer.a + result.b * (1 - layer.a),
        };
      }
      return `rgb(${result.r}, ${result.g}, ${result.b})`;
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
    const shortcuts = Array.from(
      document.querySelectorAll<HTMLElement>('#storybook-root .astryx-kbd'),
    );
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
      shortcuts: shortcuts.map(shortcut => {
        const tokens = resolveTokens(shortcut.parentElement as HTMLElement);
        const badges = Array.from(shortcut.querySelectorAll('kbd'));
        return {
          role: shortcut.getAttribute('role'),
          name: shortcut.getAttribute('aria-label'),
          hidden: shortcut.getAttribute('aria-hidden'),
          tabIndex: shortcut.tabIndex,
          className: shortcut.className
            .split(/\s+/)
            .filter(name => name.startsWith('astryx-'))
            .join(' '),
          direction: getComputedStyle(shortcut).direction,
          box: box(shortcut.getBoundingClientRect()),
          tokens,
          badges: badges.map(badge => {
            const style = getComputedStyle(badge);
            const range = document.createRange();
            range.selectNodeContents(badge);
            return {
              text: badge.textContent ?? '',
              hidden: badge.getAttribute('aria-hidden'),
              targets: Array.from(badge.classList).filter(name =>
                name.startsWith('astryx-'),
              ),
              box: box(badge.getBoundingClientRect()),
              glyphBox: box(range.getBoundingClientRect()),
              paint: {
                background: style.backgroundColor,
                text: style.color,
                border: style.borderBottomColor,
                borderWidth: px(style.borderBottomWidth),
                borderStyle: style.borderBottomStyle,
                otherBorders: [
                  px(style.borderTopWidth),
                  px(style.borderLeftWidth),
                  px(style.borderRightWidth),
                ],
                radius: px(style.borderTopLeftRadius),
                fontSize: px(style.fontSize),
                lineHeight: px(style.lineHeight),
                transform: style.transform,
              },
              surface: compositeBackground(badge),
              contrast: contrast(style.color, compositeBackground(badge)),
            };
          }),
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
    await page.locator('#storybook-root .astryx-kbd').first().waitFor();
    await settle(page);

    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.shortcuts.map(shortcut => shortcut.box)) ===
      JSON.stringify(observed.shortcuts.map(shortcut => shortcut.box));

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
      observed.documentOverflow <= 0,
      `document scrolls sideways by ${observed.documentOverflow}px`,
    );
    const glyphs = observed.shortcuts.flatMap(shortcut =>
      shortcut.badges.map(badge => badge.text),
    );
    check(
      JSON.stringify(glyphs) === JSON.stringify(GLYPHS[item.story]),
      `badges ${JSON.stringify(glyphs)}, expected ${JSON.stringify(GLYPHS[item.story])}`,
    );
    const names = observed.shortcuts.map(shortcut => shortcut.name);
    check(
      JSON.stringify(names) === JSON.stringify(NAMES[item.story]),
      `names ${JSON.stringify(names)}, expected ${JSON.stringify(NAMES[item.story])}`,
    );

    observed.shortcuts.forEach((shortcut, index) => {
      const where = `shortcut ${index} (${shortcut.name})`;
      const {tokens} = shortcut;
      // One named image, out of the tab order, with hidden badges.
      check(shortcut.role === 'img', `${where} role ${shortcut.role}`);
      check(shortcut.hidden == null, `${where} aria-hidden ${shortcut.hidden}`);
      check(shortcut.tabIndex === -1, `${where} tabIndex ${shortcut.tabIndex}`);
      check(
        shortcut.className === 'astryx-kbd',
        `${where} classes ${shortcut.className}`,
      );
      check(
        shortcut.direction === item.direction,
        `${where} direction ${shortcut.direction}`,
      );
      // The badges run from inline start to inline end.
      const boxes = shortcut.badges.map(badge => badge.box);
      for (let next = 1; next < boxes.length; next += 1) {
        const ordered =
          item.direction === 'rtl'
            ? boxes[next].right <= boxes[next - 1].left + 0.5
            : boxes[next].left >= boxes[next - 1].right - 0.5;
        check(ordered, `${where} badge ${next} is out of inline order`);
      }
      shortcut.badges.forEach((badge, badgeIndex) => {
        const at = `${where} badge ${badgeIndex} (${badge.text})`;
        const {paint} = badge;
        check(badge.hidden === 'true', `${at} aria-hidden ${badge.hidden}`);
        check(
          badge.targets.length === 0,
          `${at} carries ${badge.targets.join(' ')}`,
        );
        check(
          paint.background === tokens.background,
          `${at} background ${paint.background}, expected ${tokens.background}`,
        );
        check(
          paint.text === tokens.text,
          `${at} text ${paint.text}, expected ${tokens.text}`,
        );
        check(
          paint.border === tokens.border &&
            paint.borderStyle === 'solid' &&
            near(paint.borderWidth, 2, 0.01) &&
            paint.otherBorders.every(width => width === 0),
          `${at} border ${paint.borderStyle} ${paint.borderWidth} ${paint.border}, expected a 2px solid bottom border in ${tokens.border}`,
        );
        check(
          near(paint.radius, tokens.radius),
          `${at} radius ${paint.radius}, expected ${tokens.radius}`,
        );
        check(
          near(paint.fontSize, tokens.fontSize, 0.01),
          `${at} font size ${paint.fontSize}, expected ${tokens.fontSize}`,
        );
        check(paint.transform === 'none', `${at} transform ${paint.transform}`);
        // WCAG 1.4.3: the glyph is normal-size text on the badge surface.
        check(
          badge.contrast >= 4.5,
          `${at} text contrast ${badge.contrast} on ${badge.surface}`,
        );
        // A badge is never shorter than the theme's badge size or one line
        // of its glyph. At the default text size it keeps the theme's size.
        const expectedHeight = Math.max(tokens.spacing5, paint.lineHeight);
        check(
          near(badge.box.height, expectedHeight),
          `${at} height ${badge.box.height}, expected ${expectedHeight} (spacing-5 ${tokens.spacing5}, line ${paint.lineHeight})`,
        );
        check(
          badge.box.width >= tokens.spacing5 - 0.5,
          `${at} width ${badge.box.width} under ${tokens.spacing5}`,
        );
        // The glyph stays inside its painted badge.
        check(
          badge.glyphBox.top >= badge.box.top - 0.5 &&
            badge.glyphBox.bottom <= badge.box.bottom + 0.5 &&
            badge.glyphBox.left >= badge.box.left - 0.5 &&
            badge.glyphBox.right <= badge.box.right + 0.5,
          `${at} glyph ${JSON.stringify(badge.glyphBox)} leaves badge ${JSON.stringify(badge.box)}`,
        );
      });
    });

    const png = await page.screenshot({animations: 'disabled'});
    check(png.length > 1000, 'screenshot is empty');
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: `core-kbd--${item.story}`,
        mode: item.mode,
        theme: item.theme,
        direction: item.direction,
        viewport: item.viewport,
        glyphs: GLYPHS[item.story],
        names: NAMES[item.story],
        anatomy:
          'one astryx-kbd group per shortcut with role img, the spoken name, and no tab stop; one aria-hidden kbd badge per key with no theme target',
        paint:
          'neutral background, primary text at the supporting text size, a 2px solid bottom border in the emphasized border color, the inner radius, all resolved from the theme tokens in the shortcut scope',
        layout:
          'each badge is at least spacing-5 wide and exactly max(spacing-5, one line of its glyph) tall; the glyph stays inside the badge; badges run from inline start to inline end; no sideways document scroll',
        contrast:
          'badge text reaches 4.5:1 against the composited badge surface (WCAG 1.4.3)',
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
        component: 'core/Kbd',
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
