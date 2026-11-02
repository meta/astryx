// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit CommandPalette

/**
 * @file CommandPalette.a11y.chromium.spec.ts
 * @input Uses the component-owned Storybook fixture and exact-head build stamp
 * @output Chromium screenshots and fail-closed semantic sensor receipts
 * @position Browser evidence for the CommandPalette audit
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

const OUTPUT = path.resolve('test-results/command-palette-audit-evidence');
const STORY_ID = 'core-commandpalette--audit-matrix';
const WIDE = {width: 1024, height: 900};
const NARROW = {width: 320, height: 900};

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
          component: 'core/CommandPalette',
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
  const onPageError = (error: Error) =>
    errors.push(`pageerror: ${String(error)}`);
  const onConsole = (message: {type(): string; text(): string}) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`);
    }
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  try {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({reducedMotion: 'reduce'});
    browserVersion = page.context().browser()?.version() ?? 'unknown';
    await page.goto(
      `${storybook.origin}/iframe.html?id=${STORY_ID}&viewMode=story&globals=colorMode:${scenario.mode};astryxTheme:neutral;direction:${scenario.direction}`,
    );

    const canvas = page.locator('#storybook-root');
    const subject = canvas.locator('[data-command-palette-audit-matrix]');
    await subject.waitFor();
    await expect(subject.locator('[role="region"]')).toHaveCount(3);
    await expect(
      subject
        .getByRole('region', {name: 'Pending command palette'})
        .locator('.astryx-spinner[role="status"]'),
    ).toHaveCount(1);
    await page.waitForTimeout(200);
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
    await subject.scrollIntoViewIfNeeded();
    await page.evaluate(async () => {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });

    const initialBox = await subject.boundingBox();
    if (initialBox == null) {
      throw new Error(`${scenario.state}: the audit matrix has no layout box`);
    }
    await page.evaluate(async () => {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const settledBox = await subject.boundingBox();
    if (settledBox == null) {
      throw new Error(
        `${scenario.state}: the audit matrix lost its layout box before capture`,
      );
    }
    const geometryDelta = Math.max(
      Math.abs(settledBox.x - initialBox.x),
      Math.abs(settledBox.y - initialBox.y),
      Math.abs(settledBox.width - initialBox.width),
      Math.abs(settledBox.height - initialBox.height),
    );

    const observed = await subject.evaluate((node, expectedDirection) => {
      type Color = {r: number; g: number; b: number; a: number};
      const elements = <T extends Element>(selector: string) => [
        ...node.querySelectorAll<T>(selector),
      ];
      const geometry = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        };
      };
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
      const measure = (
        element: Element,
        part: string,
        type: 'text' | 'non-text',
        colorValue?: string,
        styleOverride?: CSSStyleDeclaration,
      ) => {
        const style = styleOverride ?? getComputedStyle(element);
        const background = renderedBackground(element);
        const foreground = parseColor(colorValue ?? style.color);
        const renderedForeground = composite(foreground, background);
        const ratio = contrast(renderedForeground, background);
        const fontSize = Number.parseFloat(style.fontSize);
        const fontWeight =
          style.fontWeight === 'bold'
            ? 700
            : Number.parseFloat(style.fontWeight) || 400;
        const threshold =
          type === 'non-text' ||
          fontSize >= 24 ||
          (fontSize >= 18.66 && fontWeight >= 700)
            ? 3
            : 4.5;
        return {
          part,
          type,
          state: 'rest',
          meaningful: true,
          foreground: colorValue ?? style.color,
          renderedForeground: formatColor(renderedForeground),
          renderedBackdrop: formatColor(background),
          fontSize,
          fontWeight,
          ratio: Number(ratio.toFixed(2)),
          threshold,
          exception: null,
          passed: ratio + 1e-6 >= threshold,
        };
      };

      const regions = elements<HTMLElement>('[role="region"]');
      const inputs = elements<HTMLInputElement>('[role="combobox"]');
      const lists = elements<HTMLElement>('[role="listbox"]');
      const options = elements<HTMLElement>('[role="option"]');
      const groups = elements<HTMLElement>('[role="group"]');
      const empties = elements<HTMLElement>('.astryx-command-palette-empty');
      const footers = elements<HTMLElement>('.astryx-command-palette-footer');
      const icons = elements<HTMLElement>(
        '.astryx-command-palette-input .astryx-icon',
      );
      const spinners = elements<HTMLElement>(
        '.astryx-command-palette-input .astryx-spinner',
      );
      const spinnerArcs = elements<SVGCircleElement>(
        '.astryx-command-palette-input .astryx-spinner circle:last-of-type',
      );
      const shortcuts = elements<HTMLElement>(
        '.astryx-command-palette-footer .astryx-kbd',
      );
      const headings = elements<HTMLElement>('h2');
      const groupHeadings = elements<HTMLElement>(
        '.astryx-command-palette-group-heading',
      );
      const targetSelectors = [
        '.astryx-command-palette-input',
        '.astryx-command-palette-list',
        '.astryx-command-palette-item',
        '.astryx-command-palette-group',
        '.astryx-command-palette-group-heading',
        '.astryx-command-palette-empty',
        '.astryx-command-palette-footer',
      ];
      const targets = targetSelectors.flatMap(selector => elements(selector));
      const footerText = footers.flatMap(footer => [
        ...footer.querySelectorAll<HTMLElement>(':scope > span'),
      ]);

      const contrastPairs = [
        ...headings
          .filter(isVisible)
          .map((element, index) =>
            measure(element, `section-heading-${index + 1}`, 'text'),
          ),
        ...groupHeadings
          .filter(isVisible)
          .map((element, index) =>
            measure(element, `group-heading-${index + 1}`, 'text'),
          ),
        ...inputs.filter(isVisible).map((element, index) => {
          const placeholder = getComputedStyle(element, '::placeholder');
          return measure(
            element,
            `input-placeholder-${index + 1}`,
            'text',
            placeholder.color,
            placeholder,
          );
        }),
        ...options
          .filter(isVisible)
          .map((element, index) =>
            measure(element, `option-${index + 1}`, 'text'),
          ),
        ...empties
          .filter(isVisible)
          .map((element, index) =>
            measure(element, `empty-${index + 1}`, 'text'),
          ),
        ...footerText
          .filter(isVisible)
          .map((element, index) =>
            measure(element, `footer-hint-${index + 1}`, 'text'),
          ),
        ...shortcuts.flatMap((shortcut, shortcutIndex) =>
          [...shortcut.querySelectorAll<HTMLElement>('kbd')]
            .filter(isVisible)
            .map((element, keyIndex) =>
              measure(
                element,
                `shortcut-${shortcutIndex + 1}-key-${keyIndex + 1}`,
                'text',
              ),
            ),
        ),
        ...icons
          .filter(isVisible)
          .map((element, index) =>
            measure(element, `search-icon-${index + 1}`, 'non-text'),
          ),
        ...spinnerArcs
          .filter(isVisible)
          .map((element, index) =>
            measure(
              element,
              `loading-spinner-${index + 1}`,
              'non-text',
              getComputedStyle(element).stroke,
            ),
          ),
      ];

      return {
        declaredDirection: expectedDirection,
        computedDirections: regions.map(
          region => getComputedStyle(region).direction,
        ),
        text: (node as HTMLElement).innerText,
        counts: {
          regions: regions.length,
          inputs: inputs.length,
          lists: lists.length,
          options: options.length,
          groups: groups.length,
          groupHeadings: groupHeadings.length,
          empties: empties.length,
          footers: footers.length,
          icons: icons.length,
          spinners: spinners.length,
          shortcuts: shortcuts.length,
          targets: targets.length,
        },
        inputLinks: inputs.map(input => ({
          name: input.getAttribute('aria-label'),
          controls: input.getAttribute('aria-controls'),
          controlsExistingList:
            input.getAttribute('aria-controls') != null &&
            lists.some(list => list.id === input.getAttribute('aria-controls')),
          expanded: input.getAttribute('aria-expanded'),
        })),
        selectedValues: options
          .filter(option => option.getAttribute('aria-selected') === 'true')
          .map(option => option.getAttribute('data-value')),
        regions: regions.map(region => ({
          name: region.getAttribute('aria-label'),
          geometry: geometry(region),
        })),
        targetGeometry: targets.map(geometry),
        noHorizontalOverflow:
          document.documentElement.scrollWidth <= window.innerWidth + 1 &&
          targets.every(element => {
            const rect = element.getBoundingClientRect();
            return rect.left >= -1 && rect.right <= window.innerWidth + 1;
          }),
        contrastPairs,
      };
    }, scenario.direction);

    expect(observed.computedDirections).toEqual([
      scenario.direction,
      scenario.direction,
      scenario.direction,
    ]);
    expect(observed.counts).toEqual({
      regions: 3,
      inputs: 3,
      lists: 1,
      options: 4,
      groups: 2,
      groupHeadings: 2,
      empties: 2,
      footers: 3,
      icons: 3,
      spinners: 1,
      shortcuts: 12,
      targets: 19,
    });
    expect(observed.inputLinks).toEqual([
      expect.objectContaining({
        name: 'Search commands',
        controlsExistingList: true,
        expanded: 'true',
      }),
      expect.objectContaining({
        name: 'Search commands',
        controls: null,
        controlsExistingList: false,
        expanded: 'false',
      }),
      expect.objectContaining({
        name: 'Search commands',
        controls: null,
        controlsExistingList: false,
        expanded: 'false',
      }),
    ]);
    expect(observed.selectedValues).toEqual(['settings']);
    expect(observed.text).toContain('Grouped results');
    expect(observed.text).toContain('Empty bootstrap');
    expect(observed.text).toContain('Pending bootstrap');
    expect(observed.text).toContain('Type to search');
    expect(observed.text).toContain('Create a command');
    expect(observed.text).toContain('Navigate');
    expect(observed.text).toContain('Select');
    expect(observed.text).toContain('Close');
    expect(observed.noHorizontalOverflow).toBe(true);
    expect(geometryDelta).toBeLessThanOrEqual(0.5);
    expect(observed.contrastPairs.length).toBeGreaterThanOrEqual(30);
    expect(observed.contrastPairs.every(pair => pair.passed)).toBe(true);
    expect(errors).toEqual([]);

    const file = `CommandPalette__${scenario.state}.png`;
    const png = await subject.screenshot({animations: 'disabled'});
    const stateRows = [
      {
        scenario: scenario.state,
        state: 'grouped-results-selected',
        visible: true,
        optionCount: 4,
        groupCount: 2,
        selectedValue: 'settings',
      },
      {
        scenario: scenario.state,
        state: 'empty-bootstrap',
        visible: true,
        emptyCount: 1,
        listboxPresent: false,
        comboboxExpanded: false,
      },
      {
        scenario: scenario.state,
        state: 'pending-bootstrap',
        visible: true,
        spinnerCount: 1,
        emptyStateRemainsMounted: true,
        listboxPresent: false,
        comboboxExpanded: false,
      },
    ];
    const contrastRows = observed.contrastPairs.map(pair => ({
      scenario: scenario.state,
      ...pair,
    }));
    const receipt = {
      state: scenario.state,
      mode: scenario.mode,
      direction: scenario.direction,
      viewport: scenario.viewport,
      headSha: checkoutSha,
      storybookSha,
      image: file,
      imageSha256: createHash('sha256').update(png).digest('hex'),
      imageSize: {
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
      },
      geometryDelta,
      observed,
      stateVisualMatrix: stateRows,
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
      mode: scenario.mode,
      direction: scenario.direction,
      viewport: scenario.viewport,
      passed: true,
      image: receipt.image,
    });
    stateVisualMatrix.push(...stateRows);
    contrastPairMatrix.push(...contrastRows);
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
  }
}

for (const scenario of CASES) {
  test(`captures ${scenario.state}`, async ({page}) => {
    await capture(page, scenario);
  });
}
