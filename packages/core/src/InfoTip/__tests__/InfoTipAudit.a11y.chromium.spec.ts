// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit InfoTip

/**
 * @file InfoTipAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/InfoTip stories across sizes, states, themes, and modes
 * @output Screenshots and fail-closed sensor receipts for the InfoTip whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for an InfoTip audit pull request
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

const OUTPUT = path.resolve('info-tip-audit-evidence');
const VIEWPORT = {width: 480, height: 320};
// The info icon's size per `size` at the neutral theme (component:InfoTip
// Public concepts).
const ICON_PX: Record<string, number> = {xsm: 12, sm: 16, md: 20, lg: 24};
// WCAG 2.5.8 minimum target, and the spacing-exception circle diameter.
const MIN_TARGET = 24;

type Mode = 'light' | 'dark';
type Theme = 'neutral' | 'butter';
type Story = 'default' | 'next-to-a-label' | 'sizes';
type Interaction =
  'none' | 'hover' | 'focus' | 'click-pin' | 'key-pin' | 'escape';

type AuditCase = {
  key: string;
  story: Story;
  mode: Mode;
  theme: Theme;
  interaction: Interaction;
};

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
  failures: string[];
};

// What each story renders.
const STORY: Record<Story, {label: string; content: string; sizes: string[]}> =
  {
    default: {
      label: 'More information',
      content: 'Editors can change this field; viewers cannot.',
      sizes: ['sm'],
    },
    'next-to-a-label': {
      label: 'About this metric',
      content: '30-day rolling average, recomputed nightly.',
      sizes: ['sm'],
    },
    sizes: {
      label: 'More information',
      content: '',
      sizes: ['xsm', 'sm', 'md', 'lg'],
    },
  };

const cases: AuditCase[] = [];
function add(
  story: Story,
  options: {theme?: Theme; interaction?: Interaction; modes?: Mode[]} = {},
) {
  const theme = options.theme ?? 'neutral';
  const interaction = options.interaction ?? 'none';
  for (const mode of options.modes ?? ['light', 'dark']) {
    const parts: string[] = [story, theme];
    if (interaction !== 'none') {
      parts.push(interaction);
    }
    cases.push({
      key: `${parts.join('-')}-${mode}`,
      story,
      mode,
      theme,
      interaction,
    });
  }
}

add('default');
add('default', {theme: 'butter'});
add('sizes');
add('sizes', {theme: 'butter', modes: ['light']});
add('default', {interaction: 'hover'});
add('next-to-a-label', {interaction: 'focus'});
add('default', {interaction: 'click-pin'});
add('default', {theme: 'butter', interaction: 'click-pin', modes: ['light']});
add('next-to-a-label', {interaction: 'key-pin', modes: ['light']});
add('next-to-a-label', {interaction: 'escape', modes: ['light']});

test.describe.configure({retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=core-infotip--${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme}`;
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
    function box(element: Element) {
      const rect = element.getBoundingClientRect();
      return {
        left: round(rect.left),
        top: round(rect.top),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    // Resolves any CSS color to sRGB channels and alpha through a canvas.
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    function rgba(color: string) {
      if (context == null) {
        return null;
      }
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = '#000';
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return {r, g, b, a: a / 255};
    }
    function luminance(c: {r: number; g: number; b: number}) {
      const channel = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return (
        0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
      );
    }
    // The first painted background behind an element, else the canvas white.
    function backdrop(element: Element) {
      let node: Element | null = element;
      while (node) {
        const color = rgba(getComputedStyle(node).backgroundColor);
        if (color && color.a > 0.99) {
          return {
            color,
            source:
              node.tagName.toLowerCase() +
              (node.id ? `#${node.id}` : '') +
              (node.className && typeof node.className === 'string'
                ? `.${node.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`
                : ''),
          };
        }
        node = node.parentElement;
      }
      return {color: {r: 255, g: 255, b: 255, a: 1}, source: 'canvas'};
    }
    function contrast(foreground: string, element: Element) {
      const fg = rgba(foreground);
      const bg = backdrop(element);
      if (fg == null) {
        return null;
      }
      // Composite an alpha foreground over the backdrop first.
      const mixed = {
        r: fg.r * fg.a + bg.color.r * (1 - fg.a),
        g: fg.g * fg.a + bg.color.g * (1 - fg.a),
        b: fg.b * fg.a + bg.color.b * (1 - fg.a),
      };
      const l1 = luminance(mixed);
      const l2 = luminance(bg.color);
      return {
        foreground: fg,
        backdrop: bg.color,
        backdropSource: bg.source,
        ratio:
          Math.round(
            ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100,
          ) / 100,
      };
    }
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'),
    );
    const tooltip = Array.from(
      document.querySelectorAll<HTMLElement>('[role="tooltip"]'),
    ).find(element => element.checkVisibility());
    return {
      theme: document
        .querySelector('[data-astryx-theme]')
        ?.getAttribute('data-astryx-theme'),
      mode: document.documentElement.getAttribute('data-theme'),
      viewport: {width: innerWidth, height: innerHeight},
      dpr: devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      finePointer: matchMedia('(pointer: fine)').matches,
      canHover: matchMedia('(hover: hover)').matches,
      fonts: document.fonts.status,
      storybookError:
        document.querySelector('.sb-show-errordisplay') != null ||
        document.body.classList.contains('sb-show-errordisplay'),
      buttons: buttons.map(button => {
        const style = getComputedStyle(button);
        const icon = button.querySelector('.astryx-icon');
        const iconStyle = icon ? getComputedStyle(icon) : null;
        const describedBy = button.getAttribute('aria-describedby') ?? '';
        const description = describedBy
          .split(/\s+/)
          .filter(Boolean)
          .map(id => document.getElementById(id)?.textContent?.trim() ?? '')
          .join(' ');
        const after = getComputedStyle(button, '::after');
        return {
          tagName: button.tagName,
          type: button.getAttribute('type'),
          ariaLabel: button.getAttribute('aria-label'),
          ariaExpanded: button.getAttribute('aria-expanded'),
          ariaControls: button.getAttribute('aria-controls'),
          describedBy,
          description,
          tabIndex: button.tabIndex,
          focused: document.activeElement === button,
          focusVisible: button.matches(':focus-visible'),
          hovered: button.matches(':hover'),
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineColor: style.outlineColor,
          outlineContrast: contrast(style.outlineColor, button),
          borderRadius: style.borderTopLeftRadius,
          padding: `${style.paddingBlockStart} ${style.paddingInlineEnd} ${style.paddingBlockEnd} ${style.paddingInlineStart}`,
          backgroundColor: style.backgroundColor,
          cursor: style.cursor,
          // The touch hit area is the button's `::after`. Where it has no
          // content it draws no box, so there is no hit area to grow.
          hitAreaInsets:
            after.content === 'none' || after.content === 'normal'
              ? null
              : [after.top, after.right, after.bottom, after.left],
          box: box(button),
          icon: icon
            ? {
                dataSize: icon.getAttribute('data-size'),
                ariaHidden: icon.getAttribute('aria-hidden'),
                color: iconStyle?.color ?? null,
                contrast: iconStyle ? contrast(iconStyle.color, button) : null,
                box: box(icon),
              }
            : null,
        };
      }),
      tooltip: tooltip
        ? {
            id: tooltip.id,
            text: (tooltip.textContent ?? '').trim(),
            box: box(tooltip),
          }
        : null,
    };
  });
}

type Observation = Awaited<ReturnType<typeof observe>>;
type ObservedButton = Observation['buttons'][number];

/**
 * WCAG 2.5.8 spacing exception: an undersized target passes when a 24 px
 * circle on its center clears every other target and every other undersized
 * target's circle.
 */
function spacingClears(target: ObservedButton, others: ObservedButton[]) {
  const radius = MIN_TARGET / 2;
  const cx = target.box.left + target.box.width / 2;
  const cy = target.box.top + target.box.height / 2;
  return others.every(other => {
    const nearestX = Math.max(
      other.box.left,
      Math.min(cx, other.box.left + other.box.width),
    );
    const nearestY = Math.max(
      other.box.top,
      Math.min(cy, other.box.top + other.box.height),
    );
    if (Math.hypot(cx - nearestX, cy - nearestY) < radius) {
      return false;
    }
    const otherUndersized =
      other.box.width < MIN_TARGET || other.box.height < MIN_TARGET;
    if (!otherUndersized) {
      return true;
    }
    const ox = other.box.left + other.box.width / 2;
    const oy = other.box.top + other.box.height / 2;
    return Math.hypot(cx - ox, cy - oy) >= MIN_TARGET;
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
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    const target = page
      .locator('#storybook-root button[aria-expanded]')
      .first();
    await target.waitFor();
    await settle(page);
    const rest = await observe(page);
    const tooltip = page.locator('[role="tooltip"]').first();

    if (item.interaction === 'hover') {
      await target.hover();
      await tooltip.waitFor({state: 'visible'});
    }
    if (item.interaction === 'click-pin') {
      await target.click();
      await tooltip.waitFor({state: 'visible'});
    }
    if (
      item.interaction === 'focus' ||
      item.interaction === 'key-pin' ||
      item.interaction === 'escape'
    ) {
      await page.keyboard.press('Tab');
      await tooltip.waitFor({state: 'visible'});
    }
    if (item.interaction === 'key-pin' || item.interaction === 'escape') {
      await page.keyboard.press('Enter');
      await expect(target).toHaveAttribute('aria-expanded', 'true');
    }
    if (item.interaction === 'escape') {
      await page.keyboard.press('Escape');
      await tooltip.waitFor({state: 'hidden'});
    }
    await settle(page);

    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.buttons.map(button => button.box)) ===
      JSON.stringify(observed.buttons.map(button => button.box));

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };
    const near = (actual: number, expected: number, tolerance = 0.6) =>
      Math.abs(actual - expected) <= tolerance;
    const spec = STORY[item.story];

    check(storybookSha === checkoutSha, 'storybook build mismatch');
    check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
    check(!observed.storybookError, 'storybook error display');
    check(observed.theme === item.theme, `theme ${observed.theme}`);
    check(observed.mode === item.mode, `mode ${observed.mode}`);
    check(
      observed.viewport.width === VIEWPORT.width &&
        observed.viewport.height === VIEWPORT.height,
      'viewport mismatch',
    );
    check(observed.dpr === 2, `dpr ${observed.dpr}`);
    check(observed.reducedMotion, 'reduced motion not applied');
    check(observed.finePointer, 'primary pointer is not fine');
    check(observed.canHover, 'primary pointer cannot hover');
    check(observed.fonts === 'loaded', `fonts ${observed.fonts}`);
    check(geometryStable, 'geometry changed between samples');
    check(
      observed.buttons.length === spec.sizes.length,
      `${observed.buttons.length} info buttons, expected ${spec.sizes.length}`,
    );

    observed.buttons.forEach((button, index) => {
      const size = spec.sizes[index];
      const where = `button ${index} (${size})`;
      check(button.tagName === 'BUTTON', `${where} renders ${button.tagName}`);
      check(button.type === 'button', `${where} type ${button.type}`);
      check(button.tabIndex === 0, `${where} tabIndex ${button.tabIndex}`);
      check(
        button.ariaLabel === spec.label,
        `${where} aria-label ${button.ariaLabel}`,
      );
      check(button.describedBy !== '', `${where} has no aria-describedby`);
      check(
        button.hitAreaInsets == null ||
          button.hitAreaInsets.every(
            inset => Math.abs(parseFloat(inset)) === 0,
          ),
        `${where} grows under a fine pointer: ${button.hitAreaInsets?.join(' ')}`,
      );
      const icon = button.icon;
      if (icon == null) {
        check(false, `${where} has no icon`);
        return;
      }
      check(icon.dataSize === size, `${where} icon size ${icon.dataSize}`);
      check(icon.ariaHidden === 'true', `${where} icon is not decorative`);
      check(
        near(
          icon.box.left + icon.box.width / 2,
          button.box.left + button.box.width / 2,
        ) &&
          near(
            icon.box.top + icon.box.height / 2,
            button.box.top + button.box.height / 2,
          ),
        `${where} icon is not centered`,
      );
      check(
        near(button.box.width, button.box.height),
        `${where} not round: ${button.box.width}x${button.box.height}`,
      );
      if (item.theme === 'neutral') {
        const expected = ICON_PX[size];
        check(
          near(icon.box.width, expected) && near(icon.box.height, expected),
          `${where} icon ${icon.box.width}x${icon.box.height}, expected ${expected}`,
        );
      }
      // A target under 24 px passes only through the spacing exception.
      if (button.box.width < MIN_TARGET || button.box.height < MIN_TARGET) {
        check(
          spacingClears(
            button,
            observed.buttons.filter(other => other !== button),
          ),
          `${where} is under 24 px and a neighbouring target is too close`,
        );
      }
    });

    const button = observed.buttons[0];
    const restButton = rest.buttons[0];
    if (button != null && restButton != null) {
      check(
        restButton.ariaExpanded === 'false',
        `rest aria-expanded ${restButton.ariaExpanded}`,
      );
      check(rest.tooltip == null, 'help shows at rest');
      check(
        restButton.ariaControls == null,
        `rest aria-controls ${restButton.ariaControls}`,
      );
      const helpShown =
        item.interaction === 'hover' ||
        item.interaction === 'focus' ||
        item.interaction === 'click-pin' ||
        item.interaction === 'key-pin';
      const pinned =
        item.interaction === 'click-pin' || item.interaction === 'key-pin';
      if (helpShown) {
        check(observed.tooltip != null, 'help is not shown');
        check(
          observed.tooltip?.text === spec.content,
          `help text ${observed.tooltip?.text}`,
        );
        check(
          button.description === spec.content,
          `description ${button.description}`,
        );
        check(
          button.ariaControls != null &&
            button.ariaControls === button.describedBy,
          `aria-controls ${button.ariaControls} vs ${button.describedBy}`,
        );
      } else {
        check(observed.tooltip == null, 'help is shown');
        check(
          button.ariaControls == null,
          `aria-controls ${button.ariaControls} while the help is hidden`,
        );
      }
      check(
        button.ariaExpanded === (pinned ? 'true' : 'false'),
        `aria-expanded ${button.ariaExpanded}`,
      );
      if (item.interaction === 'hover') {
        check(button.hovered, 'not hovered');
        check(
          button.icon?.color !== restButton.icon?.color,
          `hover does not change the icon color: ${button.icon?.color}`,
        );
      }
      if (
        item.interaction === 'focus' ||
        item.interaction === 'key-pin' ||
        item.interaction === 'escape'
      ) {
        check(button.focused && button.focusVisible, 'not keyboard focused');
        check(
          button.outlineStyle !== 'none' && button.outlineWidth !== '0px',
          `no focus outline: ${button.outlineStyle} ${button.outlineWidth}`,
        );
      }
    }

    const png = await page.screenshot({animations: 'disabled'});
    check(png.length > 1000, 'screenshot is empty');
    const image = `${item.key}.png`;
    const receipt = {
      schemaVersion: 1,
      expected: {
        build: checkoutSha,
        storyId: `core-infotip--${item.story}`,
        mode: item.mode,
        theme: item.theme,
        viewport: VIEWPORT,
        interaction: item.interaction,
        ...spec,
        anatomy:
          'one native type="button" per InfoTip, in the tab order, named by aria-label, described by its help, holding the decorative registry info icon centered in a round box; no growth under a fine pointer',
        target:
          'a box under 24 by 24 CSS px passes only when a 24 px circle on its center clears every other InfoTip target in the story, the only targets the stories render (WCAG 2.5.8 spacing exception); icon 12, 16, 20, 24 px per size at the neutral theme',
        state:
          'rest: aria-expanded false, no aria-controls, no help; hover and focus: help shows with the content text, describes the button, aria-controls names it, aria-expanded stays false, hover changes the icon color; click or Enter: the same with aria-expanded true; Escape after a pin: help hidden, aria-expanded false, focus kept with an outline; icon and outline contrast recorded, not asserted',
      },
      observed: {
        build: storybookSha,
        rest,
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
        component: 'core/InfoTip',
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
