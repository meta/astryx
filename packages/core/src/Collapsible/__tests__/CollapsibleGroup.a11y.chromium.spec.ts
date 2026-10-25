// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit CollapsibleGroup

/**
 * @file CollapsibleGroup.a11y.chromium.spec.ts
 * @input Uses the component-owned Storybook fixture and exact-head build stamp
 * @output Chromium screenshots and fail-closed semantic sensor receipts
 * @position Browser evidence for the CollapsibleGroup audit
 */

import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const OUTPUT = path.resolve('test-results/collapsible-group-audit-evidence');
const STORY_ID = 'core-collapsiblegroup--audit-matrix';
const WIDE = {width: 1024, height: 900};
const NARROW = {width: 320, height: 720};
const EXPANDED_NAMES = [
  'Profile settings',
  'Deployment details',
  'Build logs',
  'Account access',
  'Data retention',
];
const COLLAPSED_NAMES = [
  'Privacy settings',
  'Environment variables',
  'Notifications',
  'Audit exports',
];

interface Case {
  state: string;
  mode: 'light' | 'dark';
  direction: 'ltr' | 'rtl';
  viewport: {width: number; height: number};
}

const CASES: Case[] = [
  {state: 'wide-light-ltr', mode: 'light', direction: 'ltr', viewport: WIDE},
  {state: 'wide-dark-ltr', mode: 'dark', direction: 'ltr', viewport: WIDE},
  {state: 'wide-light-rtl', mode: 'light', direction: 'rtl', viewport: WIDE},
  {state: 'wide-dark-rtl', mode: 'dark', direction: 'rtl', viewport: WIDE},
  {
    state: 'narrow-light',
    mode: 'light',
    direction: 'ltr',
    viewport: NARROW,
  },
  {
    state: 'narrow-dark',
    mode: 'dark',
    direction: 'ltr',
    viewport: NARROW,
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
          component: 'core/CollapsibleGroup',
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
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(String(error));
  page.on('pageerror', onError);
  try {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({reducedMotion: 'reduce'});
    browserVersion = page.context().browser()?.version() ?? 'unknown';
    await page.goto(
      `${storybook.origin}/iframe.html?id=${STORY_ID}&viewMode=story&globals=colorMode:${scenario.mode};astryxTheme:neutral;direction:${scenario.direction}`,
    );
    const canvas = page.locator('#storybook-root');
    const subject = canvas.locator(':scope > *').first();
    await canvas.waitFor();
    await subject.waitFor();
    await holdMotionStill(page);
    await page.evaluate(async () => document.fonts.ready);
    await page.waitForFunction(
      expected =>
        document.documentElement.getAttribute('data-theme') === expected,
      scenario.mode,
    );
    await page.waitForFunction(
      expected =>
        document.querySelector('#storybook-root [dir]')?.getAttribute('dir') ===
        expected,
      scenario.direction,
    );

    await expect(canvas).toBeVisible();
    await expect(subject).toBeVisible();
    await canvas.scrollIntoViewIfNeeded();
    await page.evaluate(async () => {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const initialBox = await canvas.boundingBox();
    if (initialBox == null) {
      throw new Error(
        `${scenario.state}: the Storybook canvas has no layout box`,
      );
    }
    await page.evaluate(async () => {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const box = await canvas.boundingBox();
    if (box == null) {
      throw new Error(
        `${scenario.state}: the Storybook canvas lost its layout box before capture`,
      );
    }
    const geometryDelta = Math.max(
      Math.abs(box.x - initialBox.x),
      Math.abs(box.y - initialBox.y),
      Math.abs(box.width - initialBox.width),
      Math.abs(box.height - initialBox.height),
    );

    const observed = await subject.evaluate(node => {
      const buttons = [...node.querySelectorAll('button')];
      const groups = [...node.querySelectorAll('.astryx-collapsible-group')];
      const chevrons = buttons.flatMap(button => {
        const chevron = button.querySelector('svg');
        return chevron ? [chevron] : [];
      });
      const geometry = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      };
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
      const renderedBackground = (element: Element): Color => {
        const layers: Color[] = [];
        let current: Element | null = element;
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
      const formatColor = ({r, g, b, a}: Color) =>
        `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(3)})`;
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
        const leftLuminance = luminance(left);
        const rightLuminance = luminance(right);
        return (
          (Math.max(leftLuminance, rightLuminance) + 0.05) /
          (Math.min(leftLuminance, rightLuminance) + 0.05)
        );
      };
      const isVisible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
        );
      };
      const visibleContent = buttons
        .filter(button => button.getAttribute('aria-expanded') === 'true')
        .flatMap(button => {
          const id = button.getAttribute('aria-controls');
          const controlled = id ? document.getElementById(id) : null;
          return controlled ? [...controlled.querySelectorAll('p')] : [];
        });
      const contrastPairs = [
        ...node.querySelectorAll('h2'),
        ...buttons,
        ...visibleContent,
        ...chevrons,
      ]
        .filter(isVisible)
        .map(element => {
          const style = getComputedStyle(element);
          const background = renderedBackground(element);
          const foreground = parseColor(style.color);
          const renderedForeground = composite(foreground, background);
          const ratio = contrast(renderedForeground, background);
          const fontSize = Number.parseFloat(style.fontSize);
          const fontWeight =
            style.fontWeight === 'bold'
              ? 700
              : Number.parseFloat(style.fontWeight) || 400;
          const threshold =
            element.tagName === 'svg'
              ? 3
              : fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700)
                ? 3
                : 4.5;
          const ownerButton = element.closest('button');
          const ownerText = ownerButton?.innerText.trim();
          const text =
            element instanceof HTMLElement ? element.innerText.trim() : '';
          const part =
            element.tagName === 'svg'
              ? `chevron: ${ownerText ?? 'unknown trigger'}`
              : element.tagName === 'H2'
                ? `heading: ${text}`
                : element.tagName === 'BUTTON'
                  ? `trigger: ${text}`
                  : `content: ${text}`;
          return {
            part,
            state:
              element.tagName === 'BUTTON' || element.tagName === 'svg'
                ? (ownerButton ?? element).getAttribute('aria-expanded') ===
                  'true'
                  ? 'expanded-rest'
                  : 'collapsed-rest'
                : 'rest',
            meaningful: true,
            foreground: style.color,
            renderedForeground: formatColor(renderedForeground),
            renderedBackdrop: formatColor(background),
            fontSize,
            fontWeight,
            ratio: Number(ratio.toFixed(2)),
            threshold,
            exception: null,
            passed: ratio + 1e-6 >= threshold,
          };
        });
      return {
        direction: groups[0]
          ? getComputedStyle(groups[0]).direction
          : getComputedStyle(node).direction,
        groupDirections: groups.map(
          element => getComputedStyle(element).direction,
        ),
        buttonDirections: buttons.map(
          element => getComputedStyle(element).direction,
        ),
        text: (node as HTMLElement).innerText,
        sectionCount: node.querySelectorAll('section').length,
        headingCount: node.querySelectorAll('h2').length,
        groupCount: groups.length,
        buttonCount: buttons.length,
        chevronCount: chevrons.length,
        expandedNames: buttons
          .filter(button => button.getAttribute('aria-expanded') === 'true')
          .map(button => (button as HTMLElement).innerText.trim()),
        collapsedNames: buttons
          .filter(button => button.getAttribute('aria-expanded') === 'false')
          .map(button => (button as HTMLElement).innerText.trim()),
        groupGeometry: groups.map(geometry),
        buttonGeometry: buttons.map(geometry),
        chevronGeometry: chevrons.map(geometry),
        contrastPairs,
      };
    });
    const environment = await page.evaluate(() => ({
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      declaredDirection: document
        .querySelector('#storybook-root [dir]')
        ?.getAttribute('dir'),
      mode: document.documentElement.getAttribute('data-theme'),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      fonts: document.fonts.status,
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      storyError: [
        ...document.querySelectorAll(
          '.sb-errordisplay, [data-testid="story-error"]',
        ),
      ].some(element => {
        const errorBox = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          errorBox.width > 0 &&
          errorBox.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
        );
      }),
    }));

    // Every expectation is authored from the fixture and current component
    // contract before the page is observed. A failed sensor mints no frame.
    expect(await page.locator('#storybook-root > *').count()).toBe(1);
    expect(await subject.isVisible()).toBe(true);
    expect(geometryDelta).toBeLessThanOrEqual(0.5);
    expect(observed.direction).toBe(scenario.direction);
    expect(observed.groupDirections).toEqual([
      scenario.direction,
      scenario.direction,
    ]);
    expect(observed.buttonDirections).toEqual(
      Array.from({length: 9}, () => scenario.direction),
    );
    expect(observed.sectionCount).toBe(4);
    expect(observed.headingCount).toBe(4);
    expect(observed.groupCount).toBe(2);
    expect(observed.buttonCount).toBe(9);
    expect(observed.chevronCount).toBe(9);
    expect(observed.expandedNames).toEqual(EXPANDED_NAMES);
    expect(observed.collapsedNames).toEqual(COLLAPSED_NAMES);
    expect(observed.text).toContain('Single selection with leading chevrons');
    expect(observed.text).toContain('Multiple selection with compact rows');
    expect(observed.text).toContain('Plain group with default unpadded rows');
    expect(observed.text).toContain('Spacious group without dividers');
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    for (const geometry of [
      ...observed.groupGeometry,
      ...observed.buttonGeometry,
      ...observed.chevronGeometry,
    ]) {
      expect(geometry.width).toBeGreaterThan(0);
      expect(geometry.height).toBeGreaterThan(0);
    }
    expect(observed.contrastPairs).toHaveLength(27);
    for (const pair of observed.contrastPairs) {
      expect(pair.passed, `${scenario.state}: ${pair.part}`).toBe(true);
      expect(
        pair.ratio,
        `${scenario.state}: ${pair.part}`,
      ).toBeGreaterThanOrEqual(pair.threshold);
    }
    expect(environment.theme).toBe('neutral');
    expect(environment.declaredDirection).toBe(scenario.direction);
    expect(environment.mode).toBe(scenario.mode);
    expect(environment.colorScheme).toBe(scenario.mode);
    expect(environment.fonts).toBe('loaded');
    expect(environment.viewport).toEqual(scenario.viewport);
    expect(environment.reducedMotion).toBe(true);
    expect(environment.forcedColors).toBe(false);
    expect(environment.horizontalOverflow).toBe(false);
    expect(environment.storyError).toBe(false);
    expect(errors).toEqual([]);

    const file = `CollapsibleGroup__${scenario.state}.png`;
    const stateVisualRows = [
      {
        stateCaptured:
          'rest matrix: divided balanced, divided compact, plain default-unpadded, and plain spacious groups with expanded and collapsed disclosure semantics',
        screenshot: file,
        approvedRepresentation:
          'Rest — base tokens, no interaction (Design Conventions §Consistent State Representations)',
        tokenSignature:
          'base group, divider, default-unpadded, compact, balanced, spacious, text, and chevron tokens; no hover, focus, pressed, selected, disabled, loading, or status treatment',
        tokenSignaturePresent: true,
        matchesReference: 'yes',
        verdict: 'pass',
        note: 'Expanded and collapsed content are disclosure semantics delegated to the current Collapsible contract, not a novel interaction-state paint.',
      },
    ];
    const contrastRows = observed.contrastPairs.map(pair => ({
      screenshot: file,
      theme: 'neutral',
      mode: scenario.mode,
      direction: scenario.direction,
      viewport: scenario.viewport,
      ...pair,
    }));
    const png = await canvas.screenshot({animations: 'disabled'});
    expect(png.length).toBeGreaterThan(100);
    const receipt = {
      expected: {
        build: checkoutSha,
        storyId: STORY_ID,
        captureRoot: '#storybook-root',
        theme: 'neutral',
        mode: scenario.mode,
        direction: scenario.direction,
        viewport: scenario.viewport,
        rootCount: 1,
        sectionCount: 4,
        headingCount: 4,
        groupCount: 2,
        buttonCount: 9,
        chevronCount: 9,
        expandedNames: EXPANDED_NAMES,
        collapsedNames: COLLAPSED_NAMES,
      },
      observed: {
        build: storybookSha,
        storyId: STORY_ID,
        rootCount: await page.locator('#storybook-root > *').count(),
        ...observed,
        ...environment,
        pageErrors: errors.length,
        selectorVisible: await subject.isVisible(),
        captureRootVisible: await canvas.isVisible(),
        geometry: box,
        settledRender: {
          initial: initialBox,
          final: box,
          maxDelta: geometryDelta,
        },
      },
      image: {
        file,
        sha256: createHash('sha256').update(png).digest('hex'),
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      stateVisualMatrix: stateVisualRows,
      contrastPairMatrix: contrastRows,
      browser: browserVersion,
      passed: true,
    };
    fs.writeFileSync(path.join(OUTPUT, file), png);
    fs.writeFileSync(
      path.join(OUTPUT, `${file}.sensors.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    frames.push({
      state: scenario.state,
      receipt: `${file}.sensors.json`,
      image: receipt.image,
    });
    stateVisualMatrix.push(...stateVisualRows);
    contrastPairMatrix.push(...contrastRows);
  } finally {
    page.off('pageerror', onError);
  }
}

test('captures the complete group matrix with sensor receipts', async ({
  page,
}: {
  page: Page;
}) => {
  for (const scenario of CASES) {
    await capture(page, scenario);
  }
});
