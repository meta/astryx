// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit IconButton

/**
 * @file IconButtonAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/IconButton stories across sizes, variants, states, themes, and modes
 * @output Screenshots and fail-closed sensor receipts for the IconButton whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for an IconButton audit pull request
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

const OUTPUT = path.resolve('icon-button-audit-evidence');
const VIEWPORT = {width: 480, height: 320};

type Mode = 'light' | 'dark';
type Theme = 'neutral' | 'butter';
type Story =
  | 'default'
  | 'ghost'
  | 'primary'
  | 'destructive'
  | 'small'
  | 'large'
  | 'with-tooltip'
  | 'loading'
  | 'disabled'
  | 'emoji-icon';

type AuditCase = {
  key: string;
  story: Story;
  mode: Mode;
  theme: Theme;
  // Reach the button by keyboard, or hover or press it, before the capture.
  interaction: 'none' | 'focus' | 'hover' | 'press';
  // Story args set through the Storybook channel before the capture.
  args?: Record<string, unknown>;
  // Adds a key suffix that names a case's story args.
  suffix?: string;
};

type AuditReceipt = {
  passed: boolean;
  expected: Record<string, unknown>;
  failures: string[];
};

// What each story renders, as its args set it.
const STORY: Record<
  Story,
  {label: string; variant: string; size: string; state?: string}
> = {
  default: {label: 'Settings', variant: 'secondary', size: 'md'},
  ghost: {label: 'Settings', variant: 'ghost', size: 'md'},
  primary: {label: 'Add item', variant: 'primary', size: 'md'},
  destructive: {label: 'Delete', variant: 'destructive', size: 'md'},
  small: {label: 'Close', variant: 'ghost', size: 'sm'},
  large: {label: 'Edit', variant: 'secondary', size: 'lg'},
  'with-tooltip': {
    label: 'Notifications',
    variant: 'ghost',
    size: 'md',
    state: 'tooltip',
  },
  loading: {label: 'Saving', variant: 'primary', size: 'md', state: 'loading'},
  disabled: {
    label: 'Edit',
    variant: 'secondary',
    size: 'md',
    state: 'disabled',
  },
  'emoji-icon': {label: 'React with rocket', variant: 'ghost', size: 'sm'},
};

const cases: AuditCase[] = [];
function add(
  story: Story,
  options: {
    theme?: Theme;
    interaction?: AuditCase['interaction'];
    modes?: Mode[];
    args?: Record<string, unknown>;
    suffix?: string;
  } = {},
) {
  const theme = options.theme ?? 'neutral';
  const interaction = options.interaction ?? 'none';
  for (const mode of options.modes ?? ['light', 'dark']) {
    const parts = [story, options.suffix, theme];
    if (interaction !== 'none') {
      parts.push(interaction);
    }
    cases.push({
      key: `${parts.filter(Boolean).join('-')}-${mode}`,
      story,
      mode,
      theme,
      interaction,
      args: options.args,
      suffix: options.suffix,
    });
  }
}

add('small');
add('default');
add('large');
add('small', {theme: 'butter'});
add('default', {theme: 'butter'});
add('large', {theme: 'butter'});
add('ghost');
add('primary');
add('destructive');
add('default', {interaction: 'focus'});
add('destructive', {interaction: 'focus', modes: ['light']});
add('with-tooltip', {interaction: 'focus'});
add('default', {interaction: 'hover', modes: ['light']});
add('primary', {interaction: 'press', modes: ['light']});
add('default', {suffix: 'elevated', args: {elevation: 'med'}});
add('loading');
add('disabled');
add('emoji-icon', {modes: ['light']});

test.describe.configure({retries: 0});
let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=core-iconbutton--${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme}`;
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
    function box(element: Element | Range) {
      const rect = element.getBoundingClientRect();
      return {
        left: round(rect.left),
        top: round(rect.top),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    const root = document.querySelector('#storybook-root') ?? document.body;
    const button = root.querySelector('.astryx-button');
    const style = button ? getComputedStyle(button) : null;
    // An SVG icon, or else the text of a text icon such as an emoji.
    let glyph: ReturnType<typeof box> | null = null;
    const svg = button?.querySelector('svg');
    if (svg) {
      glyph = box(svg);
    } else if (button) {
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !(node.textContent ?? '').trim()) {
        node = walker.nextNode();
      }
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        glyph = box(range);
      }
    }
    const describedBy = button?.getAttribute('aria-describedby') ?? '';
    const description = describedBy
      .split(/\s+/)
      .filter(Boolean)
      .map(id => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ');
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
      fonts: document.fonts.status,
      storybookError:
        document.querySelector('.sb-show-errordisplay') != null ||
        document.body.classList.contains('sb-show-errordisplay'),
      buttonCount: root.querySelectorAll('.astryx-button').length,
      button: button
        ? {
            tagName: button.tagName,
            ariaLabel: button.getAttribute('aria-label'),
            textContent: button.textContent ?? '',
            dataVariant: button.getAttribute('data-variant'),
            dataSize: button.getAttribute('data-size'),
            disabled: (button as HTMLButtonElement).disabled,
            ariaDisabled: button.getAttribute('aria-disabled'),
            ariaBusy: button.getAttribute('aria-busy'),
            focused: document.activeElement === button,
            hovered: button.matches(':hover'),
            pressed:
              button.matches(':active') ||
              button.getAttribute('data-astryx-press') === 'on',
            dataElevation: button.getAttribute('data-elevation'),
            boxShadow: style?.boxShadow,
            transform: style?.transform,
            backgroundColor: style?.backgroundColor,
            backgroundImage: style?.backgroundImage,
            focusVisible: button.matches(':focus-visible'),
            outlineStyle: style?.outlineStyle,
            outlineWidth: style?.outlineWidth,
            paddingInline: `${style?.paddingInlineStart} ${style?.paddingInlineEnd}`,
            paddingBlock: `${style?.paddingBlockStart} ${style?.paddingBlockEnd}`,
            box: box(button),
          }
        : null,
      glyph,
      description,
      tooltip: tooltip ? (tooltip.textContent ?? '').trim() : null,
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
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      colorScheme: item.mode,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(storyUrl(item), {waitUntil: 'load'});
    await page.locator('#storybook-root .astryx-button').first().waitFor();
    await settle(page);
    if (item.args) {
      await page.evaluate(async args => {
        const channel = (
          window as unknown as {
            __STORYBOOK_ADDONS_CHANNEL__: {
              emit: (event: string, payload: unknown) => void;
              once: (event: string, listener: () => void) => void;
            };
          }
        ).__STORYBOOK_ADDONS_CHANNEL__;
        const storyId = new URLSearchParams(location.search).get('id');
        await new Promise<void>(resolve => {
          channel.once('storyRendered', () => resolve());
          channel.emit('updateStoryArgs', {storyId, updatedArgs: args});
        });
      }, item.args);
      await settle(page);
    }
    const target = page.locator('#storybook-root .astryx-button').first();
    if (item.interaction === 'hover') {
      await target.hover();
      await settle(page);
    }
    if (item.interaction === 'press') {
      await target.hover();
      await page.mouse.down();
      await settle(page);
    }
    if (item.interaction === 'focus') {
      await page.keyboard.press('Tab');
      if (item.story === 'with-tooltip') {
        await page
          .locator('[role="tooltip"]')
          .first()
          .waitFor({state: 'visible'});
      }
      await settle(page);
    }
    const first = await observe(page);
    await page.waitForTimeout(100);
    await settle(page);
    const observed = await observe(page);
    const geometryStable =
      JSON.stringify(first.button?.box) ===
      JSON.stringify(observed.button?.box);

    const failures: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) {
        failures.push(message);
      }
    };
    const near = (actual: number, expected: number, tolerance = 1) =>
      Math.abs(actual - expected) <= tolerance;
    const spec = STORY[item.story];
    // Text glyph boxes follow font metrics, so they get a wider tolerance.
    const centerTolerance = item.story === 'emoji-icon' ? 2 : 1;

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
    check(observed.fonts === 'loaded', `fonts ${observed.fonts}`);
    check(geometryStable, 'geometry changed between samples');
    check(observed.buttonCount === 1, `${observed.buttonCount} buttons`);

    const button = observed.button;
    if (button == null) {
      check(false, 'no button');
    } else {
      check(button.tagName === 'BUTTON', `renders ${button.tagName}`);
      check(button.ariaLabel === spec.label, `aria-label ${button.ariaLabel}`);
      check(
        !button.textContent.includes(spec.label),
        'label text is rendered visibly',
      );
      check(
        button.dataVariant === spec.variant,
        `variant ${button.dataVariant}`,
      );
      check(button.dataSize === spec.size, `size ${button.dataSize}`);
      check(
        near(button.box.width, button.box.height),
        `not square: ${button.box.width}x${button.box.height}`,
      );
      check(
        button.box.width >= 24 && button.box.height >= 24,
        `target under 24px: ${button.box.width}x${button.box.height}`,
      );
      if (item.theme === 'neutral' && spec.size === 'sm') {
        check(
          button.box.width >= 28 && button.box.height >= 28,
          `sm target under 28px: ${button.box.width}x${button.box.height}`,
        );
      }
      // A theme may pad the button target; the box must stay square with the
      // icon centered, which the checks around this one prove in every theme.
      if (item.theme === 'neutral') {
        check(
          button.paddingInline === '0px 0px' &&
            button.paddingBlock === '0px 0px',
          `padding ${button.paddingInline} / ${button.paddingBlock}`,
        );
      }
      if (spec.state !== 'loading' && observed.glyph) {
        const glyph = observed.glyph;
        check(
          near(
            glyph.left + glyph.width / 2,
            button.box.left + button.box.width / 2,
            centerTolerance,
          ) &&
            near(
              glyph.top + glyph.height / 2,
              button.box.top + button.box.height / 2,
              centerTolerance,
            ),
          'icon is not centered',
        );
      } else if (spec.state !== 'loading') {
        check(false, 'no icon');
      }
      // An Astryx-sized SVG icon follows the button size: sm in sm and md
      // buttons, md in lg buttons (16px and 20px at the neutral theme).
      if (
        item.theme === 'neutral' &&
        item.story !== 'emoji-icon' &&
        spec.state !== 'loading' &&
        observed.glyph
      ) {
        const expected = spec.size === 'lg' ? 20 : 16;
        check(
          near(observed.glyph.width, expected) &&
            near(observed.glyph.height, expected),
          `icon ${observed.glyph.width}x${observed.glyph.height}, expected ${expected}`,
        );
      }
      if (spec.state === 'loading') {
        check(button.ariaBusy === 'true', `aria-busy ${button.ariaBusy}`);
        check(button.ariaDisabled === 'true', 'loading is not aria-disabled');
        check(!button.disabled, 'loading uses native disabled');
      }
      if (spec.state === 'disabled') {
        check(
          button.disabled || button.ariaDisabled === 'true',
          'disabled button is still available',
        );
      }
      if (item.interaction === 'hover') {
        check(button.hovered, 'not hovered');
      }
      if (item.interaction === 'press') {
        check(button.pressed, 'not pressed');
      }
      if (item.args?.elevation) {
        check(
          button.dataElevation === item.args.elevation,
          `elevation ${button.dataElevation}`,
        );
        check(
          button.boxShadow != null && button.boxShadow !== 'none',
          `no shadow: ${button.boxShadow}`,
        );
      }
      if (item.interaction === 'focus') {
        check(button.focused && button.focusVisible, 'not keyboard focused');
        check(
          button.outlineStyle !== 'none' && button.outlineWidth !== '0px',
          `no focus outline: ${button.outlineStyle} ${button.outlineWidth}`,
        );
      }
      if (spec.state === 'tooltip') {
        check(
          observed.description === 'View notifications',
          `description ${observed.description}`,
        );
        check(
          observed.tooltip === 'View notifications',
          `visible tooltip ${observed.tooltip}`,
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
        storyId: `core-iconbutton--${item.story}`,
        mode: item.mode,
        theme: item.theme,
        viewport: VIEWPORT,
        interaction: item.interaction,
        args: item.args ?? null,
        ...spec,
        anatomy:
          'one native button named by aria-label with no visible label text, carrying the button target with data-variant and data-size, square with a centered icon and, at the neutral theme, zero padding',
        target:
          'at least 24 by 24 CSS px; at least 28 by 28 for sm at the neutral theme',
        state:
          'loading: aria-busy and aria-disabled, not native disabled; disabled: unavailable (native disabled or aria-disabled); focus: keyboard focus-visible with an outline; hover and press: the button matches the state (the press transform is recorded, not asserted); elevation: data-elevation and a shadow; tooltip: described by and showing the tooltip text',
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
        component: 'core/IconButton',
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
