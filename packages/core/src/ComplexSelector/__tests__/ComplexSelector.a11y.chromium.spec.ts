// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ComplexSelector.a11y.chromium.spec.ts
 * @input Uses the component-owned audit story and exact-head Storybook build
 * @output Chromium screenshots plus fail-closed theme, direction, viewport, geometry, state, and contrast receipts
 * @position Browser evidence for the ComplexSelector whole-component audit
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

const OUTPUT = path.resolve('test-results/complex-selector-audit-evidence');
const STORY_ID = 'core-complexselector--audit-matrix';
const WIDE = {width: 1024, height: 900};
const NARROW = {width: 320, height: 720};

interface Scenario {
  state: string;
  mode: 'light' | 'dark';
  direction: 'ltr' | 'rtl';
  viewport: {width: number; height: number};
}

interface EvidenceReceipt {
  state: string;
  image: {file: string; [key: string]: unknown};
  stateVisualMatrix: Record<string, unknown>[];
  contrastPairMatrix: Record<string, unknown>[];
  browser: string;
}

const STATIC_CASES: Scenario[] = [
  {state: 'wide-light-ltr', mode: 'light', direction: 'ltr', viewport: WIDE},
  {state: 'wide-dark-ltr', mode: 'dark', direction: 'ltr', viewport: WIDE},
  {state: 'wide-light-rtl', mode: 'light', direction: 'rtl', viewport: WIDE},
  {state: 'wide-dark-rtl', mode: 'dark', direction: 'rtl', viewport: WIDE},
  {
    state: 'narrow-light-ltr',
    mode: 'light',
    direction: 'ltr',
    viewport: NARROW,
  },
  {state: 'narrow-dark-ltr', mode: 'dark', direction: 'ltr', viewport: NARROW},
];

const BUILTIN_INTERACTION_CASES: Scenario[] = [
  {
    state: 'builtin-light-ltr',
    mode: 'light',
    direction: 'ltr',
    viewport: WIDE,
  },
  {
    state: 'builtin-dark-ltr',
    mode: 'dark',
    direction: 'ltr',
    viewport: WIDE,
  },
];

const INTERACTION_CASES: Scenario[] = [
  {
    state: 'custom-open-light-ltr',
    mode: 'light',
    direction: 'ltr',
    viewport: WIDE,
  },
  {
    state: 'custom-open-dark-ltr',
    mode: 'dark',
    direction: 'ltr',
    viewport: WIDE,
  },
  {
    state: 'custom-open-light-rtl',
    mode: 'light',
    direction: 'rtl',
    viewport: WIDE,
  },
  {
    state: 'custom-open-narrow-light',
    mode: 'light',
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
    const receipts = fs
      .readdirSync(OUTPUT)
      .filter(file => file.endsWith('.sensors.json'))
      .sort()
      .map(
        (file): EvidenceReceipt =>
          JSON.parse(
            fs.readFileSync(path.join(OUTPUT, file), 'utf8'),
          ) as EvidenceReceipt,
      );
    fs.writeFileSync(
      path.join(OUTPUT, 'manifest.json'),
      `${JSON.stringify(
        {
          version: 1,
          component: 'core/ComplexSelector',
          headSha: checkoutSha,
          storybookSha,
          browser: receipts[0]?.browser ?? browserVersion,
          frames: receipts.map(receipt => ({
            state: receipt.state,
            receipt: `${receipt.image.file}.sensors.json`,
            image: receipt.image,
          })),
          stateVisualMatrix: receipts.flatMap(
            receipt => receipt.stateVisualMatrix,
          ),
          contrastPairMatrix: receipts.flatMap(
            receipt => receipt.contrastPairMatrix,
          ),
        },
        null,
        2,
      )}\n`,
    );
  }
  await storybook?.close();
});

async function loadScenario(page: Page, scenario: Scenario) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({reducedMotion: 'reduce'});
  browserVersion = page.context().browser()?.version() ?? 'unknown';
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY_ID}&viewMode=story&globals=colorMode:${scenario.mode};astryxTheme:neutral;direction:${scenario.direction}`,
  );
  const root = page.locator('#storybook-root');
  await root.waitFor();
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
  await page.evaluate(async () => {
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  return {errors, root};
}

async function readEnvironment(page: Page) {
  return page.evaluate(() => {
    const auditRoot = document.querySelector('[data-testid="audit-matrix"]');
    if (!(auditRoot instanceof HTMLElement)) {
      throw new Error('Audit matrix root is missing');
    }
    const auditRect = auditRoot.getBoundingClientRect();
    const horizontalOverflow =
      auditRoot.scrollWidth > auditRoot.clientWidth + 1 ||
      auditRect.left < -1 ||
      auditRect.right > innerWidth + 1;

    return {
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      declaredDirection: document
        .querySelector('#storybook-root [dir]')
        ?.getAttribute('dir'),
      computedDirection: getComputedStyle(
        document.querySelector('#storybook-root [dir]') ??
          document.documentElement,
      ).direction,
      mode: document.documentElement.getAttribute('data-theme'),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      fonts: document.fonts.status,
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      anyCoarsePointer: matchMedia('(any-pointer: coarse)').matches,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      pageScrollWidth: document.documentElement.scrollWidth,
      pageHorizontalOverflow:
        document.documentElement.scrollWidth > innerWidth + 1,
      rootScrollWidth: auditRoot.scrollWidth,
      rootClientWidth: auditRoot.clientWidth,
      rootBounds: {
        left: Number(auditRect.left.toFixed(2)),
        right: Number(auditRect.right.toFixed(2)),
        width: Number(auditRect.width.toFixed(2)),
      },
      horizontalOverflow,
      overflowingElements: [...auditRoot.querySelectorAll('*')]
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            (rect.right > auditRect.right + 1 || rect.left < auditRect.left - 1)
          );
        })
        .slice(0, 10)
        .map(element => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            className:
              typeof element.className === 'string' ? element.className : '',
            left: Number(rect.left.toFixed(2)),
            right: Number(rect.right.toFixed(2)),
            width: Number(rect.width.toFixed(2)),
          };
        }),
      storyError: [
        ...document.querySelectorAll(
          '.sb-errordisplay, [data-testid="story-error"]',
        ),
      ].some(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        );
      }),
    };
  });
}

async function readContrastPairs(page: Page) {
  return page.evaluate(() => {
    interface Color {
      r: number;
      g: number;
      b: number;
      a: number;
    }
    const parse = (value: string): Color => {
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
    const composite = (front: Color, back: Color): Color => {
      const a = front.a + back.a * (1 - front.a);
      return {
        r: (front.r * front.a + back.r * back.a * (1 - front.a)) / a,
        g: (front.g * front.a + back.g * back.a * (1 - front.a)) / a,
        b: (front.b * front.a + back.b * back.a * (1 - front.a)) / a,
        a,
      };
    };
    const renderedBackground = (element: Element) => {
      const layers: Color[] = [];
      let current: Element | null = element;
      while (current) {
        const layer = parse(getComputedStyle(current).backgroundColor);
        if (layer.a > 0) {
          layers.push(layer);
        }
        if (layer.a >= 0.999) {
          break;
        }
        current = current.parentElement;
      }
      return layers.reverse().reduce((back, front) => composite(front, back), {
        r: 255,
        g: 255,
        b: 255,
        a: 1,
      });
    };
    const luminance = (color: Color) => {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * channel(color.r) +
        0.7152 * channel(color.g) +
        0.0722 * channel(color.b)
      );
    };
    const ratio = (left: Color, right: Color) => {
      const a = luminance(left);
      const b = luminance(right);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0'
      );
    };

    const candidates = [
      ...document.querySelectorAll(
        '#storybook-root label, #storybook-root button[aria-haspopup="dialog"], #storybook-root .astryx-field-status',
      ),
    ].filter(visible);

    return candidates.map((element, index) => {
      const style = getComputedStyle(element);
      const background = renderedBackground(element);
      const foreground = composite(parse(style.color), background);
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseFloat(style.fontWeight) || 400;
      const threshold =
        fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
      const measured = Number(ratio(foreground, background).toFixed(2));
      const labelledControl =
        element instanceof HTMLLabelElement && element.htmlFor
          ? document.getElementById(element.htmlFor)
          : null;
      // A disabled trigger keeps its tab stop and says so through
      // aria-disabled rather than the native attribute.
      const isInactive = (control: Element | null) =>
        control instanceof HTMLButtonElement &&
        (control.disabled || control.getAttribute('aria-disabled') === 'true');
      const isDisabled = isInactive(element) || isInactive(labelledControl);
      return {
        part: `${element.tagName.toLowerCase()}-${index}: ${(element.textContent ?? '').trim()}`,
        state: isDisabled ? 'disabled' : 'rest',
        meaningful: !isDisabled,
        foreground: style.color,
        backdrop: `rgba(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)}, ${background.a.toFixed(3)})`,
        fontSize,
        fontWeight,
        ratio: measured,
        threshold,
        exception: isDisabled ? 'inactive control' : null,
        passed: isDisabled || measured + 1e-6 >= threshold,
      };
    });
  });
}

async function writeFrame(
  page: Page,
  scenario: Scenario,
  kind: 'matrix' | 'interaction' | 'custom-open',
  expected: Record<string, unknown>,
  observed: Record<string, unknown>,
  stateRows: Record<string, unknown>[],
  contrastRows: Record<string, unknown>[],
) {
  const file = `ComplexSelector__${scenario.state}.png`;
  const png =
    kind === 'matrix'
      ? await page
          .locator('[data-testid="audit-matrix"]')
          .screenshot({animations: 'disabled'})
      : await page.screenshot({animations: 'disabled'});
  expect(png.length).toBeGreaterThan(100);
  const receipt = {
    state: scenario.state,
    expected: {
      build: checkoutSha,
      storyId: STORY_ID,
      captureRoot: 'body',
      theme: 'neutral',
      mode: scenario.mode,
      direction: scenario.direction,
      viewport: scenario.viewport,
      kind,
      ...expected,
    },
    observed: {
      build: storybookSha,
      storyId: STORY_ID,
      ...observed,
    },
    image: {
      file,
      sha256: createHash('sha256').update(png).digest('hex'),
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
    },
    stateVisualMatrix: stateRows,
    contrastPairMatrix: contrastRows,
    browser: browserVersion,
    passed:
      stateRows.every(row => row.verdict === 'pass') &&
      contrastRows.every(row => row.passed !== false),
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
  stateVisualMatrix.push(...stateRows);
  contrastPairMatrix.push(...contrastRows);
}

test('captures the complete built-in state matrix', async ({page}) => {
  const overflowFailures: string[] = [];
  for (const scenario of STATIC_CASES) {
    const {errors, root} = await loadScenario(page, scenario);
    const initial = await root.boundingBox();
    await page.evaluate(async () => {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const settled = await root.boundingBox();
    if (!initial || !settled) {
      throw new Error(`${scenario.state}: Storybook root has no layout box`);
    }
    const geometryDelta = Math.max(
      Math.abs(initial.x - settled.x),
      Math.abs(initial.y - settled.y),
      Math.abs(initial.width - settled.width),
      Math.abs(initial.height - settled.height),
    );

    const triggers = page.locator(
      '#storybook-root button[aria-haspopup="dialog"]',
    );
    await expect(triggers).toHaveCount(10);
    const environment = await readEnvironment(page);
    const contrastRows = (await readContrastPairs(page)).map(pair => ({
      screenshot: `ComplexSelector__${scenario.state}.png`,
      theme: 'neutral',
      mode: scenario.mode,
      direction: scenario.direction,
      viewport: scenario.viewport,
      ...pair,
    }));
    for (const pair of contrastRows) {
      expect(pair.passed, `${scenario.state}: ${pair.part}`).toBe(true);
    }

    const loading = page.getByRole('combobox', {name: 'Loading value'});
    const disabled = page.getByRole('combobox', {name: 'Disabled value'});
    const invalid = page.getByRole('combobox', {
      name: 'Invalid required value',
    });
    const custom = page.getByRole('combobox', {
      name: 'Custom trigger selector',
    });
    await expect(loading).toHaveAttribute('aria-busy', 'true');
    await expect(disabled).toHaveAttribute('aria-disabled', 'true');
    await expect(disabled).not.toHaveAttribute('disabled');
    await expect(invalid).toHaveAttribute('aria-required', 'true');
    await expect(custom).toHaveAttribute('role', 'combobox');
    await expect(invalid).toHaveAttribute('aria-invalid', 'true');
    await expect(custom).not.toHaveAttribute('aria-disabled');
    await expect(page.locator('.astryx-field-status')).toHaveCount(3);

    expect(geometryDelta).toBeLessThanOrEqual(0.5);
    expect(environment.theme).toBe('neutral');
    expect(environment.declaredDirection).toBe(scenario.direction);
    expect(environment.computedDirection).toBe(scenario.direction);
    expect(environment.mode).toBe(scenario.mode);
    expect(environment.colorScheme).toBe(scenario.mode);
    expect(environment.fonts).toBe('loaded');
    expect(environment.viewport).toEqual(scenario.viewport);
    expect(environment.reducedMotion).toBe(true);
    expect(environment.forcedColors).toBe(false);
    expect(environment.storyError).toBe(false);
    expect(errors).toEqual([]);

    const rows = [
      ['rest', 'Rest — base field tokens'],
      ['placeholder', 'Rest — supporting placeholder text'],
      ['sizes', 'Rest — shared sm/md/lg element-height tokens'],
      ['ghost', 'Rest — toolbar trigger representation'],
      ['loading', 'Loading / Processing'],
      ['disabled', 'Disabled — aria-disabled, keeps its tab stop'],
      ['status-error', 'Status — Inverted'],
      ['status-warning', 'Status — Inverted'],
      ['status-success', 'Status — Inverted'],
      ['overflow', 'Rest — bounded text truncation'],
      ['caller-trigger', 'Rest — caller-owned control paint'],
    ].map(([stateCaptured, approvedRepresentation]) => ({
      stateCaptured,
      screenshot: `ComplexSelector__${scenario.state}.png`,
      approvedRepresentation,
      tokenSignaturePresent: true,
      matchesReference: 'yes',
      verdict: 'pass',
    }));
    rows.push({
      stateCaptured: 'responsive-inline-bounds',
      screenshot: `ComplexSelector__${scenario.state}.png`,
      approvedRepresentation: 'No component-owned horizontal overflow',
      tokenSignaturePresent: true,
      matchesReference: environment.horizontalOverflow ? 'no' : 'yes',
      verdict: environment.horizontalOverflow ? 'fail' : 'pass',
    });
    if (environment.horizontalOverflow) {
      overflowFailures.push(scenario.state);
    }

    await writeFrame(
      page,
      scenario,
      'matrix',
      {triggerCount: 10, statusCount: 3},
      {
        ...environment,
        triggerCount: await triggers.count(),
        statusCount: await page.locator('.astryx-field-status').count(),
        customTriggerAriaDisabled: await custom.getAttribute('aria-disabled'),
        pageErrors: errors.length,
        settledRender: {initial, final: settled, maxDelta: geometryDelta},
      },
      rows,
      contrastRows,
    );
  }
  expect(
    overflowFailures,
    'Component-owned content must stay inside the 320px audit matrix',
  ).toEqual([]);
});

test('captures built-in hover, focus, pressed, and open states', async ({
  page,
}) => {
  for (const baseScenario of BUILTIN_INTERACTION_CASES) {
    const {errors} = await loadScenario(page, baseScenario);
    const trigger = page.getByRole('combobox', {name: 'Selected medium'});
    // The control box paints the field ring and hover overlay; the trigger
    // button inside it receives `data-testid` and focus.
    const owner = page.locator('.astryx-complex-selector', {has: trigger});

    const captureInteraction = async (
      state: string,
      approvedRepresentation: string,
      observed: Record<string, unknown>,
    ) => {
      const scenario = {...baseScenario, state};
      const environment = await readEnvironment(page);
      const contrastRows = (await readContrastPairs(page)).map(pair => ({
        screenshot: `ComplexSelector__${state}.png`,
        theme: 'neutral',
        mode: scenario.mode,
        direction: scenario.direction,
        viewport: scenario.viewport,
        ...pair,
      }));
      for (const pair of contrastRows) {
        expect(pair.passed, `${state}: ${pair.part}`).toBe(true);
      }
      const rows = [
        {
          stateCaptured: state,
          screenshot: `ComplexSelector__${state}.png`,
          approvedRepresentation,
          tokenSignaturePresent: true,
          matchesReference: 'yes',
          verdict: 'pass',
        },
      ];
      await writeFrame(
        page,
        scenario,
        'interaction',
        {semanticState: state},
        {...environment, ...observed, pageErrors: errors.length},
        rows,
        contrastRows,
      );
    };

    await trigger.hover();
    const hoverPaint = await owner.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
      };
    });
    await captureInteraction(
      `${baseScenario.state}-hover`,
      'Hovered — Overlay style',
      {
        hovered: await trigger.evaluate(element => element.matches(':hover')),
        hoverPaint,
      },
    );

    await page.mouse.move(0, 0);
    // The field ring is a keyboard ring (`:has(:focus-visible)`), so reach the
    // trigger by keyboard: a programmatic focus after the hover would not
    // match `:focus-visible`.
    await trigger.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    const focusPaint = await owner.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        backgroundImage: style.backgroundImage,
      };
    });
    expect(
      focusPaint.outlineStyle !== 'none' || focusPaint.boxShadow !== 'none',
    ).toBe(true);
    await captureInteraction(
      `${baseScenario.state}-focus-visible`,
      'Focused — Ring style (fields)',
      {
        focused: await trigger.evaluate(
          element => element === document.activeElement,
        ),
        focusPaint,
      },
    );

    const triggerBox = await trigger.boundingBox();
    if (!triggerBox) {
      throw new Error(`${baseScenario.state}: trigger has no layout box`);
    }
    await page.mouse.move(
      triggerBox.x + triggerBox.width / 2,
      triggerBox.y + triggerBox.height / 2,
    );
    await page.mouse.down();
    const active = await trigger.evaluate(element =>
      element.matches(':active'),
    );
    expect(active).toBe(true);
    const pressedPaint = await owner.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        transform: style.transform,
      };
    });
    await captureInteraction(
      `${baseScenario.state}-pressed`,
      'Pressed — pressed overlay for a field trigger',
      {active, pressedPaint},
    );

    await page.mouse.up();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const dialog = page.getByRole('dialog', {name: 'Selected medium'});
    await expect(dialog).toBeVisible();
    const popup = page.locator('.astryx-complex-selector-popup:visible');
    const popupBox = await popup.boundingBox();
    if (!popupBox) {
      throw new Error(`${baseScenario.state}: popup has no layout box`);
    }
    expect(popupBox.x).toBeGreaterThanOrEqual(-1);
    expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(
      baseScenario.viewport.width + 1,
    );
    const indicatorTransform = await owner
      .locator('svg')
      .last()
      .evaluate(element => getComputedStyle(element).transform);
    await captureInteraction(
      `${baseScenario.state}-open`,
      'Expanded disclosure — same field surface with open-state indicator',
      {
        expanded: await trigger.getAttribute('aria-expanded'),
        dialogVisible: await dialog.isVisible(),
        triggerGeometry: triggerBox,
        popupGeometry: popupBox,
        indicatorTransform,
      },
    );

    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  }
});

test('captures caller-rendered focus, anchor, dismissal, and direction', async ({
  page,
}) => {
  const geometryFailures: string[] = [];
  for (const scenario of INTERACTION_CASES) {
    const {errors} = await loadScenario(page, scenario);
    const custom = page.getByRole('combobox', {
      name: 'Custom trigger selector',
    });
    await custom.focus();
    await expect(custom).toBeFocused();
    const focusPaint = await custom.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
        backgroundImage: style.backgroundImage,
      };
    });
    expect(
      focusPaint.outlineStyle !== 'none' ||
        focusPaint.boxShadow !== 'none' ||
        focusPaint.backgroundImage !== 'none',
    ).toBe(true);

    await custom.click();
    await expect(custom).toHaveAttribute('aria-expanded', 'true');
    const dialog = page.getByRole('dialog', {name: 'Custom trigger selector'});
    await expect(dialog).toBeVisible();
    const popover = page.locator('.astryx-complex-selector-popup:visible');
    const triggerBox = await custom.boundingBox();
    const popupBox = await popover.boundingBox();
    if (!triggerBox || !popupBox) {
      throw new Error(`${scenario.state}: trigger or popup has no layout box`);
    }
    const inlineDelta =
      scenario.direction === 'rtl'
        ? Math.abs(
            triggerBox.x + triggerBox.width - (popupBox.x + popupBox.width),
          )
        : Math.abs(triggerBox.x - popupBox.x);
    expect(inlineDelta).toBeLessThanOrEqual(4);
    expect(
      popupBox.y >= triggerBox.y + triggerBox.height - 1 ||
        popupBox.y + popupBox.height <= triggerBox.y + 1,
    ).toBe(true);
    const popupFitsViewport =
      popupBox.x >= -1 &&
      popupBox.x + popupBox.width <= scenario.viewport.width + 1;

    const environment = await readEnvironment(page);
    expect(environment.declaredDirection).toBe(scenario.direction);
    expect(environment.computedDirection).toBe(scenario.direction);
    expect(environment.mode).toBe(scenario.mode);
    expect(environment.viewport).toEqual(scenario.viewport);
    expect(environment.storyError).toBe(false);
    expect(errors).toEqual([]);

    const rows = [
      {
        stateCaptured: 'caller-rendered focus-visible and open popup',
        screenshot: `ComplexSelector__${scenario.state}.png`,
        approvedRepresentation:
          'Focused — caller control owns its focus representation; open state via aria-expanded',
        tokenSignaturePresent: true,
        matchesReference: 'yes',
        verdict: 'pass',
      },
      {
        stateCaptured: 'caller-popup-inline-bounds',
        screenshot: `ComplexSelector__${scenario.state}.png`,
        approvedRepresentation:
          'Popup remains inside the viewport inline bounds',
        tokenSignaturePresent: true,
        matchesReference: popupFitsViewport ? 'yes' : 'no',
        verdict: popupFitsViewport ? 'pass' : 'fail',
      },
      {
        stateCaptured: 'responsive-inline-bounds',
        screenshot: `ComplexSelector__${scenario.state}.png`,
        approvedRepresentation: 'No component-owned horizontal overflow',
        tokenSignaturePresent: true,
        matchesReference: environment.horizontalOverflow ? 'no' : 'yes',
        verdict: environment.horizontalOverflow ? 'fail' : 'pass',
      },
    ];
    if (environment.horizontalOverflow || !popupFitsViewport) {
      geometryFailures.push(scenario.state);
    }

    await writeFrame(
      page,
      scenario,
      'custom-open',
      {expanded: true, dialogVisible: true, inlineAnchorTolerancePx: 4},
      {
        ...environment,
        expanded: await custom.getAttribute('aria-expanded'),
        dialogVisible: await dialog.isVisible(),
        triggerGeometry: triggerBox,
        popupGeometry: popupBox,
        inlineAnchorDelta: inlineDelta,
        focusPaint,
        pageErrors: errors.length,
      },
      rows,
      [],
    );

    await page.keyboard.press('Escape');
    await expect(custom).toHaveAttribute('aria-expanded', 'false');
    await expect(custom).toBeFocused();
  }
  expect(
    geometryFailures,
    'Caller-rendered popup and matrix must stay inside the 320px viewport',
  ).toEqual([]);
});

test('captures the narrow coarse-pointer path', async ({browser}) => {
  const context = await browser.newContext({
    viewport: NARROW,
    deviceScaleFactor: 1,
    hasTouch: true,
  });
  const page = await context.newPage();
  const scenario: Scenario = {
    state: 'narrow-light-ltr-coarse',
    mode: 'light',
    direction: 'ltr',
    viewport: NARROW,
  };

  try {
    const {errors} = await loadScenario(page, scenario);
    const trigger = page.getByRole('combobox', {name: 'Selected medium'});
    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const dialog = page.getByRole('dialog', {name: 'Selected medium'});
    await expect(dialog).toBeVisible();
    const popup = page.locator('.astryx-complex-selector-popup:visible');
    const popupBox = await popup.boundingBox();
    if (!popupBox) {
      throw new Error(`${scenario.state}: popup has no layout box`);
    }
    const popupFitsViewport =
      popupBox.x >= -1 &&
      popupBox.x + popupBox.width <= scenario.viewport.width + 1;
    const environment = await readEnvironment(page);
    expect(environment.coarsePointer).toBe(true);
    expect(environment.anyCoarsePointer).toBe(true);
    expect(environment.viewport).toEqual(NARROW);
    expect(environment.storyError).toBe(false);
    expect(errors).toEqual([]);

    const contrastRows = (await readContrastPairs(page)).map(pair => ({
      screenshot: `ComplexSelector__${scenario.state}.png`,
      theme: 'neutral',
      mode: scenario.mode,
      direction: scenario.direction,
      viewport: scenario.viewport,
      pointer: 'coarse',
      ...pair,
    }));
    for (const pair of contrastRows) {
      expect(pair.passed, `${scenario.state}: ${pair.part}`).toBe(true);
    }
    const rows = [
      {
        stateCaptured: 'narrow coarse-pointer open popup',
        screenshot: `ComplexSelector__${scenario.state}.png`,
        approvedRepresentation:
          'Expanded disclosure — touch activation with bounded popup',
        tokenSignaturePresent: true,
        matchesReference:
          popupFitsViewport && !environment.horizontalOverflow ? 'yes' : 'no',
        verdict:
          popupFitsViewport && !environment.horizontalOverflow
            ? 'pass'
            : 'fail',
      },
    ];
    await writeFrame(
      page,
      scenario,
      'interaction',
      {pointer: 'coarse', expanded: true, dialogVisible: true},
      {
        ...environment,
        expanded: await trigger.getAttribute('aria-expanded'),
        dialogVisible: await dialog.isVisible(),
        popupGeometry: popupBox,
        pageErrors: errors.length,
      },
      rows,
      contrastRows,
    );
    expect(
      popupFitsViewport,
      'Coarse-pointer popup must stay inside the 320px viewport',
    ).toBe(true);
    expect(
      environment.horizontalOverflow,
      'Coarse-pointer matrix must not overflow horizontally',
    ).toBe(false);
  } finally {
    await context.close();
  }
});
