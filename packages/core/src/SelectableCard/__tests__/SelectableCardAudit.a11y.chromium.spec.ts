// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit SelectableCard

/**
 * @file SelectableCardAudit.a11y.chromium.spec.ts
 * @input Exact-head SelectableCard stories: rest, selection, keyboard focus
 *   and toggles, hover, every color variant selected, a nested button, the
 *   disabled cards, a narrow width and forced colors, in light and dark and
 *   both directions
 * @output Screenshots and fail-closed sensor receipts for the SelectableCard
 *   whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for
 *   a SelectableCard audit pull request
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
import {resetAuditEvidence} from '@astryxdesign/a11y-spec/evidence';

const EVIDENCE = path.resolve('test-results/selectable-card-audit-evidence');
const MULTI_STORY = 'core-selectablecard--multi-select';
const VARIANTS_STORY = 'core-selectablecard--color-variants';
const NESTED_STORY = 'core-selectablecard--with-nested-button';
const DISABLED_STORY = 'core-selectablecard--disabled';

type Mode = 'light' | 'dark';
/** `none` renders base tokens only; `neutral` is the Storybook default. */
type Theme = 'none' | 'neutral';
type Direction = 'ltr' | 'rtl';
type Viewport = {width: number; height: number};
type Check = (condition: boolean, message: string) => void;
type FrameSink = (state: string, observed: unknown) => Promise<void>;

type AuditCase = {
  key: string;
  group: string;
  story: string;
  mode: Mode;
  theme: Theme;
  direction: Direction;
  viewport: Viewport;
  motion?: 'reduce' | 'no-preference';
  forcedColors?: boolean;
  run: (page: Page, check: Check, frame: FrameSink) => Promise<void>;
};

const DESKTOP = {width: 900, height: 700};
const NARROW = {width: 320, height: 700};

test.describe.configure({retries: 0});

let OUTPUT = EVIDENCE;
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;
let holdsMotion = true;

/** The part of Storybook's preview this spec reads: the story render's phase. */
interface StorybookPreviewWindow extends Window {
  __STORYBOOK_PREVIEW__?: {currentRender?: {phase?: string}};
}

async function settle(page: Page) {
  if (holdsMotion) {
    await holdMotionStill(page);
  }
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function pageSensors(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      '#storybook-root .astryx-selectable-card',
    );
    return {
      mode:
        document.documentElement.getAttribute('data-theme') ??
        document.documentElement.style.getPropertyValue('color-scheme'),
      direction: root == null ? null : getComputedStyle(root).direction,
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      fonts: document.fonts.status,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      storybookError: document.body.classList.contains('sb-show-errordisplay'),
    };
  });
}

/**
 * Text inside a disabled card is the text of an inactive control, which
 * WCAG 1.4.3 exempts from the contrast minimum. Only that pair is excepted;
 * every other rule and every other node still fails the receipt.
 */
async function isInsideDisabledCard(page: Page, selector: string) {
  return page.evaluate(
    target =>
      document
        .querySelector(target)
        ?.closest('.astryx-selectable-card')
        ?.querySelector(':scope > input[aria-disabled="true"]') != null,
    selector,
  );
}

async function checkAxe(page: Page, check: Check) {
  const results = await new AxeBuilder({page})
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations: string[] = [];
  const excepted: string[] = [];
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      const target = node.target.join(' ');
      const line = `${violation.id} ${target}: ${node.failureSummary}`;
      if (
        violation.id === 'color-contrast' &&
        (await isInsideDisabledCard(page, target))
      ) {
        excepted.push(line);
      } else {
        violations.push(line);
      }
    }
  }
  check(violations.length === 0, `axe: ${violations.join(' | ')}`);
  check(results.passes.length > 0, 'axe checked nothing');
  return {violations, excepted, passes: results.passes.length};
}

/** Every card's semantics, paint and geometry, and its overlay layer. */
async function readCards(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const cards = [
      ...document.querySelectorAll<HTMLElement>(
        '#storybook-root .astryx-selectable-card',
      ),
    ].map(card => {
      const style = getComputedStyle(card);
      const overlay = getComputedStyle(card, '::after');
      const input = card.querySelector<HTMLInputElement>(
        ':scope > input[type="checkbox"], :scope > input[type="radio"]',
      );
      return {
        label: input?.getAttribute('aria-label') ?? null,
        inputType: input?.type ?? null,
        checked: input?.checked ?? null,
        inputDisabled: input?.getAttribute('aria-disabled') ?? null,
        inputFocused: input != null && document.activeElement === input,
        focusInside:
          document.activeElement != null &&
          card.contains(document.activeElement),
        role: card.getAttribute('role'),
        tabIndex: card.getAttribute('tabindex'),
        dataSelected: card.getAttribute('data-selected'),
        dataVariant: card.getAttribute('data-variant'),
        dataDisabled: card.hasAttribute('data-disabled'),
        opacity: style.opacity,
        shadow: style.boxShadow,
        borderColor: style.borderTopColor,
        borderWidth: parseFloat(style.borderTopWidth),
        borderStyle: style.borderTopStyle,
        background: style.backgroundColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
        outlineColor: style.outlineColor,
        cursor: style.cursor,
        overlay: overlay.backgroundColor,
        box: box(card),
      };
    });
    return {
      cards,
      scroll: {
        width: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      },
    };
  });
}

type Cards = Awaited<ReturnType<typeof readCards>>;
type Card = Cards['cards'][number];

function card(state: Cards, label: string) {
  return state.cards.find(item => item.label === label);
}

function alphaOf(color: string) {
  const match = /rgba?\(([^)]+)\)/.exec(color);
  if (match == null) {
    return color === 'transparent' ? 0 : 1;
  }
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length > 3 ? Number(parts[3]) : 1;
}

/** The selection ring: an inset 2 px shadow in the card's computed shadow. */
function ringColor(item: Card) {
  const match = /(rgba?\([^)]*\))\s+0px\s+0px\s+0px\s+2px\s+inset/.exec(
    item.shadow,
  );
  return match?.[1] ?? null;
}

function luminance(color: string) {
  const match = /rgba?\(([^)]+)\)/.exec(color);
  if (match == null) {
    return null;
  }
  const [r, g, b] = match[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(Number)
    .map(value => {
      const channel = value / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la == null || lb == null) {
    return null;
  }
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function semantics(check: Check, state: Cards) {
  check(state.cards.length > 0, 'no selectable card on the page');
  for (const item of state.cards) {
    check(
      item.inputType === 'checkbox' && (item.label ?? '').length > 0,
      `${item.label}: input ${item.inputType}`,
    );
    check(
      item.role == null && item.tabIndex == null,
      `${item.label}: root role ${item.role} tabindex ${item.tabIndex}`,
    );
    check(
      item.dataSelected === String(item.checked),
      `${item.label}: data-selected ${item.dataSelected} checked ${item.checked}`,
    );
    check(
      (ringColor(item) != null) === (item.checked === true),
      `${item.label}: ring ${ringColor(item)} checked ${item.checked}`,
    );
  }
}

const cases: AuditCase[] = [];

for (const mode of ['light', 'dark'] as const) {
  for (const direction of ['ltr', 'rtl'] as const) {
    cases.push({
      key: `multi-select__${mode}__${direction}`,
      group: 'keyboard',
      story: MULTI_STORY,
      mode,
      theme: 'neutral',
      direction,
      viewport: DESKTOP,
      run: async (page, check, frame) => {
        const rest = await readCards(page);
        semantics(check, rest);
        const react = card(rest, 'React');
        const vue = card(rest, 'Vue');
        check(
          react?.checked === true && vue?.checked === false,
          'React is not the selected card',
        );
        check(
          react != null && vue != null && react.borderColor !== vue.borderColor,
          `selected border ${react?.borderColor} unselected ${vue?.borderColor}`,
        );
        check(vue?.cursor === 'pointer', `enabled card cursor ${vue?.cursor}`);
        const restAxe = await checkAxe(page, check);
        await frame('rest', {rest, axe: restAxe});

        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await settle(page);
        const focused = await readCards(page);
        const ringed = focused.cards.find(item => item.inputFocused);
        check(ringed?.label === 'Vue', `second Tab focused ${ringed?.label}`);
        check(
          ringed != null &&
            ringed.outlineStyle !== 'none' &&
            ringed.outlineWidth >= 2,
          `card focus ring ${ringed?.outlineStyle} ${ringed?.outlineWidth}`,
        );
        const focusAxe = await checkAxe(page, check);
        await frame('keyboard-focus', {ringed, axe: focusAxe});

        await page.keyboard.press('Space');
        await settle(page);
        const spaced = await readCards(page);
        check(card(spaced, 'Vue')?.checked === true, 'Space did not select');
        semantics(check, spaced);
        await frame('space-selected', {spaced});

        await page.keyboard.press('Enter');
        await settle(page);
        const entered = await readCards(page);
        check(
          card(entered, 'Vue')?.checked === false,
          'Enter did not deselect',
        );
        check(
          card(entered, 'React')?.checked === true,
          'Enter changed another card',
        );
      },
    });
  }

  cases.push({
    key: `multi-select__${mode}__ltr__pointer`,
    group: 'pointer',
    story: MULTI_STORY,
    mode,
    theme: 'neutral',
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readCards(page);
      const surface = page.locator('#storybook-root .astryx-selectable-card', {
        hasText: 'Angular',
      });
      await surface.hover();
      await settle(page);
      const hovered = await readCards(page);
      const over = card(hovered, 'Angular');
      check(
        over != null && alphaOf(over.overlay) > 0 && alphaOf(over.overlay) < 1,
        `hover overlay is not a translucent tint: ${over?.overlay}`,
      );
      check(over?.checked === false, 'hover selected the card');
      await frame('hover-unselected', {over});

      await page
        .locator('#storybook-root .astryx-selectable-card', {hasText: 'React'})
        .hover();
      await settle(page);
      const selectedHover = await readCards(page);
      check(
        ringColor(card(selectedHover, 'React') as Card) ===
          ringColor(card(rest, 'React') as Card),
        'the selection ring changed under hover',
      );
      await frame('hover-selected', {react: card(selectedHover, 'React')});

      await surface.click();
      await settle(page);
      const clicked = await readCards(page);
      check(
        card(clicked, 'Angular')?.checked === true,
        'a surface click did not select',
      );
      semantics(check, clicked);
      await frame('clicked', {clicked});
    },
  });

  cases.push({
    key: `color-variants__${mode}__ltr`,
    group: 'variants',
    story: VARIANTS_STORY,
    mode,
    theme: 'neutral',
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readCards(page);
      semantics(check, rest);
      await frame('rest', {rest});
      for (const item of rest.cards) {
        if (item.checked === false && item.label != null) {
          await page
            .getByRole('checkbox', {name: item.label, exact: true})
            .click({force: true});
        }
      }
      await settle(page);
      const all = await readCards(page);
      semantics(check, all);
      check(
        all.cards.length === 12 && all.cards.every(item => item.checked),
        `selected ${all.cards.filter(item => item.checked).length} of ${all.cards.length}`,
      );
      const rings = all.cards.map(item => {
        const ring = ringColor(item);
        return {
          variant: item.dataVariant,
          ring,
          background: item.background,
          ratio:
            ring == null || alphaOf(item.background) < 1
              ? null
              : contrast(ring, item.background),
        };
      });
      const accent = rings.find(item => item.variant === 'default');
      check(
        accent?.ratio != null && accent.ratio >= 3,
        `default ring contrast ${accent?.ratio?.toFixed(2)}`,
      );
      const axe = await checkAxe(page, check);
      await frame('all-selected', {rings, axe});
    },
  });

  cases.push({
    key: `disabled__${mode}__ltr`,
    group: 'disabled',
    story: DISABLED_STORY,
    mode,
    theme: 'neutral',
    direction: 'ltr',
    viewport: DESKTOP,
    run: async (page, check, frame) => {
      const rest = await readCards(page);
      semantics(check, rest);
      const enabled = card(rest, 'Enabled');
      const disabled = rest.cards.filter(item => item.label !== 'Enabled');
      check(disabled.length === 2, `${disabled.length} disabled cards`);
      for (const item of disabled) {
        check(
          item.inputDisabled === 'true' && item.opacity === '0.5',
          `${item.label}: aria-disabled ${item.inputDisabled} opacity ${item.opacity}`,
        );
        check(
          item.cursor === 'default',
          `${item.label}: cursor ${item.cursor}`,
        );
        check(
          item.dataDisabled,
          `${item.label}: no data-disabled on the target`,
        );
      }
      check(
        enabled?.dataDisabled === false && enabled.opacity === '1',
        `enabled card: data-disabled ${enabled?.dataDisabled} opacity ${enabled?.opacity}`,
      );
      const axe = await checkAxe(page, check);
      await frame('rest', {rest, axe});

      const target = page.locator('#storybook-root .astryx-selectable-card', {
        hasText: 'Unselected & Disabled',
      });
      await target.hover();
      await settle(page);
      const hovered = card(await readCards(page), 'Disabled unselected');
      check(
        hovered != null && alphaOf(hovered.overlay) === 0,
        `disabled card painted on hover: ${hovered?.overlay}`,
      );
      await target.click();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await settle(page);
      const tabbed = await readCards(page);
      const focused = tabbed.cards.find(item => item.inputFocused);
      check(
        focused?.label === 'Disabled unselected',
        `third Tab focused ${focused?.label}: a disabled card left the tab order`,
      );
      await page.keyboard.press('Space');
      await page.keyboard.press('Enter');
      await settle(page);
      const after = await readCards(page);
      check(
        card(after, 'Disabled unselected')?.checked === false &&
          card(after, 'Disabled')?.checked === true,
        'a click, Space or Enter changed a disabled card',
      );
      await frame('keyboard-focus', {hovered, focused, after});
    },
  });
}

cases.push({
  key: 'with-nested-button__light__ltr',
  group: 'nested button',
  story: NESTED_STORY,
  mode: 'light',
  theme: 'neutral',
  direction: 'ltr',
  viewport: DESKTOP,
  run: async (page, check, frame) => {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await settle(page);
    const state = await readCards(page);
    const [item] = state.cards;
    const button = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      const style = active == null ? null : getComputedStyle(active);
      return {
        name: active?.textContent?.trim() ?? null,
        tag: active?.tagName ?? null,
        outlineStyle: style?.outlineStyle ?? null,
        outlineWidth: style == null ? 0 : parseFloat(style.outlineWidth),
      };
    });
    check(
      button.tag === 'BUTTON' && button.name === 'Details',
      `second Tab focused ${button.tag} ${button.name}`,
    );
    check(
      button.outlineStyle !== 'none' && button.outlineWidth >= 1,
      `nested button ring ${button.outlineStyle} ${button.outlineWidth}`,
    );
    check(
      item != null && item.outlineStyle === 'none',
      `the card also rings while its button has focus: ${item?.outlineStyle}`,
    );
    const axe = await checkAxe(page, check);
    await frame('nested-focus', {item, button, axe});

    await page.getByRole('button', {name: 'Details'}).click();
    await settle(page);
    const clicked = await readCards(page);
    check(
      clicked.cards[0]?.checked === false,
      'a click on the nested button toggled the card',
    );
  },
});

for (const direction of ['ltr', 'rtl'] as const) {
  cases.push({
    key: `color-variants__light__${direction}__narrow`,
    group: 'narrow',
    story: VARIANTS_STORY,
    mode: 'light',
    theme: 'neutral',
    direction,
    viewport: NARROW,
    run: async (page, check, frame) => {
      const state = await readCards(page);
      semantics(check, state);
      check(
        state.scroll.width <= state.scroll.client,
        `sideways page scroll ${JSON.stringify(state.scroll)}`,
      );
      for (const item of state.cards) {
        check(
          item.box.width >= 24 && item.box.height >= 24,
          `${item.label}: target ${item.box.width}x${item.box.height}`,
        );
      }
      const axe = await checkAxe(page, check);
      await frame('rest', {state, axe});
    },
  });
}

cases.push({
  key: 'multi-select__light__ltr__forced-colors',
  group: 'forced colors',
  story: MULTI_STORY,
  mode: 'light',
  theme: 'neutral',
  direction: 'ltr',
  viewport: DESKTOP,
  forcedColors: true,
  run: async (page, check, frame) => {
    const state = await readCards(page);
    const react = card(state, 'React');
    const vue = card(state, 'Vue');
    const paint = (item: Card | undefined) =>
      item == null
        ? null
        : [
            item.shadow,
            item.borderColor,
            item.borderWidth,
            item.outlineStyle,
            item.outlineWidth,
            item.outlineColor,
            item.background,
          ].join(' | ');
    check(
      react?.checked === true && vue?.checked === false,
      'React is not the selected card',
    );
    // Recorded, not asserted: an open finding. Forced colors remove the
    // inset ring and repaint the border, so selection may not show.
    await frame('rest', {
      selected: paint(react),
      unselected: paint(vue),
      selectionVisible: paint(react) !== paint(vue),
      state,
    });
  },
});

test.beforeAll(async () => {
  OUTPUT = resetAuditEvidence(EVIDENCE, test.info());
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
  holdsMotion = (item.motion ?? 'reduce') === 'reduce';
  await page.emulateMedia({
    colorScheme: item.mode,
    reducedMotion: item.motion ?? 'reduce',
    forcedColors: item.forcedColors ? 'active' : 'none',
  });
  const pageErrors: string[] = [];
  const onError = (error: Error) => pageErrors.push(String(error));
  page.on('pageerror', onError);
  const url = `${server.origin}/iframe.html?id=${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
  const failures: string[] = [];
  const check: Check = (condition, message) => {
    if (!condition) {
      failures.push(message);
    }
  };
  let sensors: Awaited<ReturnType<typeof pageSensors>> | null = null;
  const frames: {
    state: string;
    observed: unknown;
    file: string;
    sha256: string;
  }[] = [];
  const frame: FrameSink = async (state, observed) => {
    // An open popover layer renders outside the story root, so the frame
    // covers it too.
    const clip = await page.evaluate(() => {
      const boxes = [
        document.querySelector('#storybook-root'),
        ...document.querySelectorAll('[popover]:popover-open'),
      ]
        .filter(element => element != null)
        .map(element => element.getBoundingClientRect());
      const left = Math.max(0, Math.min(...boxes.map(box => box.left)));
      const top = Math.max(0, Math.min(...boxes.map(box => box.top)));
      const right = Math.max(...boxes.map(box => box.right));
      const bottom = Math.max(...boxes.map(box => box.bottom));
      return {x: left, y: top, width: right - left, height: bottom - top};
    });
    const screenshot = await page.screenshot({clip, animations: 'disabled'});
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
    await page.goto(url, {waitUntil: 'load'});
    await page
      .locator('#storybook-root .astryx-selectable-card')
      .first()
      .waitFor();
    // Play functions toggle, focus and scroll the viewports; read them only
    // after Storybook finishes the render, play included.
    await page.waitForFunction(
      () =>
        (window as StorybookPreviewWindow).__STORYBOOK_PREVIEW__?.currentRender
          ?.phase === 'finished',
    );
    await settle(page);
    sensors = await pageSensors(page);
    check(!sensors.storybookError, 'storybook error display');
    check(sensors.mode === item.mode, `mode ${sensors.mode}`);
    check(
      sensors.direction === item.direction,
      `direction ${sensors.direction}`,
    );
    check(sensors.dpr === 2, `dpr ${sensors.dpr}`);
    check(sensors.fonts === 'loaded', `fonts ${sensors.fonts}`);
    check(
      sensors.reducedMotion === ((item.motion ?? 'reduce') === 'reduce'),
      `reduced motion ${sensors.reducedMotion}`,
    );
    check(
      sensors.forcedColors === (item.forcedColors ?? false),
      `forced colors ${sensors.forcedColors}`,
    );
    await item.run(page, check, frame);
  } catch (error) {
    check(false, `run threw: ${String(error)}`);
  }
  page.off('pageerror', onError);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  const receipt = {
    component: 'SelectableCard',
    build: storybookSha,
    checkout: checkoutSha,
    story: item.story,
    mode: item.mode,
    theme: item.theme,
    direction: item.direction,
    viewport: item.viewport,
    reducedMotion: item.motion ?? 'reduce',
    forcedColors: item.forcedColors ?? false,
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
