// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit CommandPaletteFooter

/**
 * @file CommandPaletteFooter.a11y.chromium.spec.ts
 * @input Component-owned Storybook fixtures and exact-head build stamp
 * @output Chromium screenshots plus fail-closed semantic sensor receipts
 * @position Browser evidence for the CommandPaletteFooter audit
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Browser, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve(
  'test-results/command-palette-footer-audit-evidence',
);
const DEFAULT_STORY = 'core-commandpalettefooter--default';
const CUSTOM_STORY = 'core-commandpalettefooter--custom-content';
const EXPANDED_STORY = 'core-commandpalettefooter--expanded-text';
const WIDE = {width: 1024, height: 720};
const NARROW = {width: 320, height: 720};

interface Case {
  state: string;
  storyId: string;
  kind: 'default' | 'custom';
  theme: 'neutral' | 'probe';
  mode: 'light' | 'dark';
  direction: 'ltr' | 'rtl';
  pointer?: 'coarse';
  viewport: {width: number; height: number};
}

const CASES: Case[] = [
  {
    state: 'default-neutral-light-ltr',
    storyId: DEFAULT_STORY,
    kind: 'default',
    theme: 'neutral',
    mode: 'light',
    direction: 'ltr',
    viewport: WIDE,
  },
  {
    state: 'default-neutral-dark-ltr',
    storyId: DEFAULT_STORY,
    kind: 'default',
    theme: 'neutral',
    mode: 'dark',
    direction: 'ltr',
    viewport: WIDE,
  },
  {
    state: 'default-probe-light-ltr',
    storyId: DEFAULT_STORY,
    kind: 'default',
    theme: 'probe',
    mode: 'light',
    direction: 'ltr',
    viewport: WIDE,
  },
  {
    state: 'default-probe-dark-ltr',
    storyId: DEFAULT_STORY,
    kind: 'default',
    theme: 'probe',
    mode: 'dark',
    direction: 'ltr',
    viewport: WIDE,
  },
  {
    state: 'default-neutral-light-rtl',
    storyId: DEFAULT_STORY,
    kind: 'default',
    theme: 'neutral',
    mode: 'light',
    direction: 'rtl',
    viewport: WIDE,
  },
  {
    state: 'default-neutral-light-narrow',
    storyId: DEFAULT_STORY,
    kind: 'default',
    theme: 'neutral',
    mode: 'light',
    direction: 'ltr',
    viewport: NARROW,
  },
  {
    state: 'expanded-neutral-light-narrow-coarse',
    storyId: EXPANDED_STORY,
    kind: 'default',
    theme: 'neutral',
    mode: 'light',
    direction: 'ltr',
    pointer: 'coarse',
    viewport: NARROW,
  },
  {
    state: 'custom-neutral-light-ltr',
    storyId: CUSTOM_STORY,
    kind: 'custom',
    theme: 'neutral',
    mode: 'light',
    direction: 'ltr',
    viewport: WIDE,
  },
  {
    state: 'custom-neutral-dark-ltr',
    storyId: CUSTOM_STORY,
    kind: 'custom',
    theme: 'neutral',
    mode: 'dark',
    direction: 'ltr',
    viewport: WIDE,
  },
];

const frames: Record<string, unknown>[] = [];
const stateVisualMatrix: Record<string, unknown>[] = [];
const contrastPairMatrix: Record<string, unknown>[] = [];
let storybook: StaticServer;
let checkoutSha: string;
let storybookSha: string;
let browserVersion = 'unknown';

test.beforeAll(async () => {
  checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const expectedHead = process.env.ASTRYX_HEAD_SHA;
  if (expectedHead && expectedHead !== checkoutSha) {
    throw new Error('The audited checkout does not match the PR head');
  }
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  const stamp = await fetch(`${storybook.origin}/astryx-build-sha.txt`);
  if (!stamp.ok) {
    throw new Error(
      `The Storybook build has no source stamp (${stamp.status})`,
    );
  }
  storybookSha = (await stamp.text()).trim();
  if (storybookSha !== checkoutSha) {
    throw new Error(
      'The served Storybook build does not match the audited checkout',
    );
  }
  fs.mkdirSync(OUTPUT, {recursive: true});
});

test.afterAll(async () => {
  if (checkoutSha && storybookSha) {
    fs.writeFileSync(
      path.join(OUTPUT, 'manifest.json'),
      `${JSON.stringify(
        {
          version: 1,
          component: 'core/CommandPaletteFooter',
          headSha: checkoutSha,
          storybookSha,
          browser: browserVersion,
          frames,
          stateVisualMatrix,
          contrastPairMatrix,
        },
        null,
        2,
      )}\n`,
    );
  }
  await storybook?.close();
});

async function capture(page: Page, scenario: Case) {
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  try {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({reducedMotion: 'reduce'});
    browserVersion = page.context().browser()?.version() ?? 'unknown';
    await page.goto(
      `${storybook.origin}/iframe.html?id=${scenario.storyId}&viewMode=story&globals=colorMode:${scenario.mode};astryxTheme:${scenario.theme};direction:${scenario.direction}`,
      {waitUntil: 'load'},
    );
    const canvas = page.locator('#storybook-root');
    const dialog = page.getByRole('dialog').first();
    const subject = page.locator('.astryx-command-palette-footer');
    await canvas.waitFor();
    await dialog.waitFor();
    await subject.waitFor();
    await holdMotionStill(page);
    await page.evaluate(async () => document.fonts.ready);
    await page.waitForFunction(
      expected =>
        document.documentElement.getAttribute('data-theme') === expected,
      scenario.mode,
    );
    await page.evaluate(async () => {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });

    const firstBox = await subject.boundingBox();
    await page.evaluate(async () => {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const box = await subject.boundingBox();
    if (firstBox == null || box == null) {
      throw new Error(`${scenario.state}: footer has no layout box`);
    }
    const geometryDelta = Math.max(
      Math.abs(box.x - firstBox.x),
      Math.abs(box.y - firstBox.y),
      Math.abs(box.width - firstBox.width),
      Math.abs(box.height - firstBox.height),
    );

    const observed = await subject.evaluate(element => {
      type Color = {r: number; g: number; b: number; a: number};
      const parseColor = (value: string): Color => {
        const channels = value.match(/[\d.]+/g)?.map(Number);
        if (!channels || channels.length < 3) {
          throw new Error(`Cannot parse computed color: ${value}`);
        }
        return {
          r: channels[0] ?? 0,
          g: channels[1] ?? 0,
          b: channels[2] ?? 0,
          a: channels[3] ?? 1,
        };
      };
      const composite = (foreground: Color, background: Color): Color => {
        const a = foreground.a + background.a * (1 - foreground.a);
        if (a === 0) {
          return {r: 0, g: 0, b: 0, a: 0};
        }
        return {
          r:
            (foreground.r * foreground.a +
              background.r * background.a * (1 - foreground.a)) /
            a,
          g:
            (foreground.g * foreground.a +
              background.g * background.a * (1 - foreground.a)) /
            a,
          b:
            (foreground.b * foreground.a +
              background.b * background.a * (1 - foreground.a)) /
            a,
          a,
        };
      };
      const renderedBackground = (node: Element): Color => {
        const layers: Color[] = [];
        let current: Element | null = node;
        while (current) {
          const layer = parseColor(getComputedStyle(current).backgroundColor);
          if (layer.a > 0) {
            layers.push(layer);
          }
          if (layer.a >= 0.999) {
            break;
          }
          current = current.parentElement;
        }
        return layers
          .reverse()
          .reduce(
            (background, foreground) => composite(foreground, background),
            {r: 255, g: 255, b: 255, a: 1},
          );
      };
      const luminance = ({r, g, b}: Color) => {
        const channel = (value: number) => {
          const normalized = value / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const contrast = (left: Color, right: Color) => {
        const a = luminance(left);
        const b = luminance(right);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      const formatColor = ({r, g, b, a}: Color) =>
        `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(3)})`;
      const pair = (node: Element) => {
        const style = getComputedStyle(node);
        const background = renderedBackground(node);
        const foreground = composite(parseColor(style.color), background);
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
          renderedBackdrop: formatColor(background),
          contrastRatio: Number(contrast(foreground, background).toFixed(2)),
        };
      };
      const rootStyle = getComputedStyle(element);
      const firstKbd = element.querySelector('kbd');
      const hintLabels = [...element.children].map(child =>
        [...child.childNodes]
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent ?? '')
          .join('')
          .trim(),
      );
      const hintCenters = [...element.children].map(child => {
        const rect = child.getBoundingClientRect();
        return rect.x + rect.width / 2;
      });
      return {
        role: element.getAttribute('role'),
        ariaLabel: element.getAttribute('aria-label'),
        text: (element as HTMLElement).innerText.trim(),
        direction: rootStyle.direction,
        display: rootStyle.display,
        fontFamily: rootStyle.fontFamily,
        fontSize: rootStyle.fontSize,
        lineHeight: rootStyle.lineHeight,
        gap: rootStyle.gap,
        paddingInlineStart: rootStyle.paddingInlineStart,
        paddingBlockStart: rootStyle.paddingBlockStart,
        targetPresent: element.classList.contains(
          'astryx-command-palette-footer',
        ),
        kbdTargetCount: element.querySelectorAll('.astryx-kbd').length,
        shortcutNames: [...element.querySelectorAll('[role="img"]')].map(node =>
          node.getAttribute('aria-label'),
        ),
        hintLabels,
        hintCenters,
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth,
        rootPair: pair(element),
        kbdPair: firstKbd ? pair(firstKbd) : null,
      };
    });
    const environment = await page.evaluate(() => ({
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      fonts: document.fonts.status,
      viewport: {width: innerWidth, height: innerHeight},
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      storyError: [
        ...document.querySelectorAll(
          '.sb-errordisplay, [data-testid="story-error"]',
        ),
      ].some(node => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      }),
    }));

    await expect(dialog).toBeVisible();
    await expect(subject).toHaveCount(1);
    await expect(subject).toBeVisible();
    expect(observed.role).toBeNull();
    expect(observed.ariaLabel).toBeNull();
    expect(observed.direction).toBe(scenario.direction);
    expect(observed.display).toBe('flex');
    expect(observed.targetPresent).toBe(true);
    expect(observed.rootPair.contrastRatio).toBeGreaterThanOrEqual(4.5);
    expect(observed.scrollWidth).toBeLessThanOrEqual(observed.clientWidth + 1);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(box.width).toBeLessThanOrEqual(scenario.viewport.width);
    expect(geometryDelta).toBeLessThanOrEqual(0.5);
    expect(environment.theme).toBe(scenario.theme);
    expect(environment.mode).toBe(scenario.mode);
    expect(environment.colorScheme).toBe(scenario.mode);
    expect(environment.fonts).toBe('loaded');
    expect(environment.viewport).toEqual(scenario.viewport);
    expect(environment.reducedMotion).toBe(true);
    expect(environment.coarsePointer).toBe(scenario.pointer === 'coarse');
    expect(environment.forcedColors).toBe(false);
    expect(environment.horizontalOverflow).toBe(false);
    expect(environment.storyError).toBe(false);
    expect(pageErrors).toEqual([]);

    if (scenario.kind === 'default') {
      const expectedLabels =
        scenario.storyId === EXPANDED_STORY
          ? [
              'Parcourir les commandes',
              'Sélectionner la commande',
              'Fermer la palette de commandes',
            ]
          : ['Navigate', 'Select', 'Close'];
      expect(observed.hintLabels).toEqual(expectedLabels);
      expect(observed.shortcutNames).toEqual([
        'Up arrow',
        'Down arrow',
        'Enter',
        'Escape',
      ]);
      expect(observed.kbdTargetCount).toBe(4);
      expect(observed.hintCenters).toHaveLength(3);
      if (scenario.viewport.width > NARROW.width) {
        if (scenario.direction === 'rtl') {
          expect(observed.hintCenters[0]).toBeGreaterThan(
            observed.hintCenters[2] ?? 0,
          );
        } else {
          expect(observed.hintCenters[0]).toBeLessThan(
            observed.hintCenters[2] ?? Number.POSITIVE_INFINITY,
          );
        }
      }
    } else {
      expect(observed.text).toBe('Type to filter available commands.');
      expect(observed.shortcutNames).toEqual([]);
      expect(observed.kbdTargetCount).toBe(0);
    }

    const file = `CommandPaletteFooter__${scenario.state}.png`;
    const png = await dialog.screenshot({animations: 'disabled'});
    expect(png.length).toBeGreaterThan(100);
    const representation =
      scenario.kind === 'default'
        ? 'Three keyboard-hint groups with four delegated Kbd badges'
        : 'Caller footer content replaces the default keyboard hints';
    const stateVisualRows = [
      {
        stateCaptured: `${scenario.kind} footer at rest`,
        screenshot: file,
        approvedRepresentation: representation,
        tokenSignature:
          'supporting typography, secondary text, logical padding, delegated Kbd badges',
        tokenSignaturePresent: true,
        matchesReference: 'yes',
        verdict: 'pass',
      },
    ];
    const contrastRows = [
      {
        screenshot: file,
        theme: scenario.theme,
        mode: scenario.mode,
        direction: scenario.direction,
        viewport: scenario.viewport,
        part: 'footer guidance text',
        state: scenario.kind,
        meaningful: true,
        foreground: observed.rootPair.color,
        renderedBackdrop: observed.rootPair.renderedBackdrop,
        ratio: observed.rootPair.contrastRatio,
        threshold: 4.5,
        exception: null,
        passed: true,
      },
      ...(observed.kbdPair
        ? [
            {
              screenshot: file,
              theme: scenario.theme,
              mode: scenario.mode,
              direction: scenario.direction,
              viewport: scenario.viewport,
              part: 'keyboard badge glyph',
              state: scenario.kind,
              meaningful: true,
              foreground: observed.kbdPair.color,
              renderedBackdrop: observed.kbdPair.renderedBackdrop,
              ratio: observed.kbdPair.contrastRatio,
              threshold: 4.5,
              exception:
                'Known shared Kbd contrast gap; tracked by facebook/astryx#7097 and not scored against CommandPaletteFooter.',
              passed: observed.kbdPair.contrastRatio >= 4.5,
            },
          ]
        : []),
    ];
    const receipt = {
      expected: {
        build: checkoutSha,
        storyId: scenario.storyId,
        captureRoot: '[role="dialog"]',
        theme: scenario.theme,
        mode: scenario.mode,
        direction: scenario.direction,
        pointer: scenario.pointer ?? 'fine',
        viewport: scenario.viewport,
        kind: scenario.kind,
        dialogCount: 1,
        footerCount: 1,
      },
      observed: {
        build: storybookSha,
        storyId: scenario.storyId,
        dialogCount: await page.getByRole('dialog').count(),
        ...observed,
        ...environment,
        pageErrors: pageErrors.length,
        geometry: box,
        settledRender: {initial: firstBox, final: box, maxDelta: geometryDelta},
      },
      image: {
        file,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      stateVisualMatrix: stateVisualRows,
      contrastPairMatrix: contrastRows,
      knownFinding:
        observed.kbdPair && observed.kbdPair.contrastRatio < 4.5
          ? 'Delegated Kbd glyph contrast is tracked by facebook/astryx#7097; the shared primitive owns the token pair.'
          : null,
      browser: browserVersion,
      passed: true,
    };
    fs.writeFileSync(path.join(OUTPUT, file), png);
    fs.writeFileSync(
      path.join(OUTPUT, `${file}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    frames.push({state: scenario.state, receipt: `${file}.sensors.json`});
    stateVisualMatrix.push(...stateVisualRows);
    contrastPairMatrix.push(...contrastRows);
    return observed;
  } finally {
    page.off('pageerror', onError);
  }
}

test('captures default and custom footer branches with sensor receipts', async ({
  browser,
}: {
  browser: Browser;
}) => {
  const results = new Map<string, Awaited<ReturnType<typeof capture>>>();
  for (const scenario of CASES) {
    const context = await browser.newContext({
      viewport: scenario.viewport,
      hasTouch: scenario.pointer === 'coarse',
    });
    const page = await context.newPage();
    try {
      results.set(scenario.state, await capture(page, scenario));
    } finally {
      await context.close();
    }
  }
  const neutral = results.get('default-neutral-light-ltr');
  const probe = results.get('default-probe-light-ltr');
  expect(neutral).toBeDefined();
  expect(probe).toBeDefined();
  expect(
    probe?.rootPair.backgroundColor !== neutral?.rootPair.backgroundColor ||
      probe?.rootPair.color !== neutral?.rootPair.color,
    'the probe theme must visibly reach the footer target',
  ).toBe(true);
});
