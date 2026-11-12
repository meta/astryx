// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit Link

/**
 * @file LinkAudit.a11y.chromium.spec.ts
 * @input Exact-head Core/Link stories across states, themes, modes, direction, and width
 * @output Screenshots and fail-closed sensor receipts for the Link whole-component audit
 * @position Component-owned Night Watch browser evidence; CI runs it only for a Link audit pull request
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

const OUTPUT = path.resolve('link-audit-evidence');
const WIDE = {width: 900, height: 700};
const NARROW = {width: 320, height: 700};

type Mode = 'light' | 'dark';
type Theme = 'neutral' | 'butter';
type Direction = 'ltr' | 'rtl';
type State = 'rest' | 'hover' | 'focus' | 'pressed';
type Story =
  | 'default'
  | 'all-variants'
  | 'disabled'
  | 'external-link'
  | 'with-underline'
  | 'standalone'
  | 'inline-with-text'
  | 'button-fallback-variants'
  | 'button-fallback-disabled'
  | 'truncated-in-constrained-line'
  | 'clamped-by-ancestor-text';

type AuditCase = {
  key: string;
  story: Story;
  state: State;
  mode: Mode;
  theme: Theme;
  direction: Direction;
  viewport: {width: number; height: number};
};

// The number of Link roots each story renders, so a story that stops
// rendering one fails instead of passing with nothing to check.
const LINKS: Record<Story, number> = {
  default: 1,
  'all-variants': 9,
  disabled: 1,
  'external-link': 1,
  'with-underline': 1,
  standalone: 1,
  'inline-with-text': 1,
  'button-fallback-variants': 7,
  'button-fallback-disabled': 1,
  'truncated-in-constrained-line': 2,
  'clamped-by-ancestor-text': 3,
};

const cases: AuditCase[] = [];
function add(
  story: Story,
  options: {
    state?: State;
    theme?: Theme;
    direction?: Direction;
    modes?: Mode[];
    viewport?: {width: number; height: number};
    suffix?: string;
  } = {},
) {
  const state = options.state ?? 'rest';
  const theme = options.theme ?? 'neutral';
  const direction = options.direction ?? 'ltr';
  for (const mode of options.modes ?? ['light', 'dark']) {
    const parts: string[] = [story, state, options.suffix ?? '', theme];
    if (direction === 'rtl') {
      parts.push('rtl');
    }
    cases.push({
      key: `${parts.filter(Boolean).join('-')}-${mode}`,
      story,
      state,
      mode,
      theme,
      direction,
      viewport: options.viewport ?? WIDE,
    });
  }
}
add('default');
add('default', {state: 'hover', modes: ['light']});
add('default', {state: 'focus'});
add('default', {state: 'pressed', modes: ['light']});
add('all-variants');
add('all-variants', {theme: 'butter', modes: ['light']});
add('all-variants', {direction: 'rtl', modes: ['light']});
add('disabled');
add('disabled', {state: 'focus', modes: ['light']});
add('disabled', {state: 'hover', modes: ['light']});
add('external-link');
add('external-link', {direction: 'rtl', modes: ['light']});
add('with-underline', {modes: ['light']});
add('standalone', {modes: ['light']});
add('inline-with-text');
add('inline-with-text', {theme: 'butter', modes: ['light']});
add('button-fallback-variants', {modes: ['light']});
add('button-fallback-disabled', {state: 'focus', modes: ['light']});
add('truncated-in-constrained-line', {modes: ['light']});
add('truncated-in-constrained-line', {
  suffix: 'narrow',
  modes: ['light'],
  viewport: NARROW,
});
add('clamped-by-ancestor-text', {modes: ['light']});

// WCAG relative-luminance contrast between two computed colors.
function contrast(a: string, b: string): number | null {
  function channels(value: string): number[] | null {
    const rgb = value.match(/^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)/);
    if (rgb) {
      return rgb.slice(1, 4).map(part => Number(part) / 255);
    }
    const srgb = value.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
    return srgb ? srgb.slice(1, 4).map(Number) : null;
  }
  function luminance(value: string): number | null {
    const parts = channels(value);
    if (parts == null) {
      return null;
    }
    const [r, g, b] = parts.map(part =>
      part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const first = luminance(a);
  const second = luminance(b);
  if (first == null || second == null) {
    return null;
  }
  const ratio =
    (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  return Math.round(ratio * 100) / 100;
}

test.describe.configure({retries: 0});

let server: StaticServer;
let checkoutSha: string;
let storybookSha: string;

function storyUrl(item: AuditCase) {
  return `${server.origin}/iframe.html?id=core-link--${item.story}&viewMode=story&globals=colorMode:${item.mode};astryxTheme:${item.theme};direction:${item.direction}`;
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
        right: round(rect.right),
        bottom: round(rect.bottom),
        width: round(rect.width),
        height: round(rect.height),
      };
    }
    // Resolve a color expression to its computed rgb() in the element's scope.
    function color(element: Element, expression: string) {
      const probe = document.createElement('span');
      probe.style.cssText = `position:absolute;visibility:hidden;color:${expression}`;
      element.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    }
    const tokens: Record<string, string> = {
      accent: 'var(--color-text-accent)',
      primary: 'var(--color-text-primary)',
      secondary: 'var(--color-text-secondary)',
      disabled: 'var(--color-text-disabled)',
      placeholder: 'var(--color-text-secondary)',
    };
    const links = Array.from(
      document.querySelectorAll('#storybook-root .astryx-link'),
    ).map(link => {
      const style = getComputedStyle(link);
      const label = link.firstElementChild as HTMLElement | null;
      const icon = link.querySelector(':scope > svg');
      const hidden = Array.from(link.children).find(
        child =>
          child !== label &&
          child.tagName !== 'svg' &&
          getComputedStyle(child).position === 'absolute',
      );
      const dataColor = link.getAttribute('data-color') ?? '';
      const parent = link.parentElement as Element;
      return {
        tag: link.tagName.toLowerCase(),
        href: link.getAttribute('href'),
        role: link.getAttribute('role'),
        type: link.getAttribute('type'),
        ariaDisabled: link.getAttribute('aria-disabled'),
        tabIndex: (link as HTMLElement).tabIndex,
        targets: Array.from(link.classList).filter(name =>
          name.startsWith('astryx-'),
        ),
        dataColor,
        color: style.color,
        expectedColor:
          dataColor in tokens
            ? color(parent, tokens[dataColor])
            : getComputedStyle(parent).color,
        labelColor: label == null ? null : getComputedStyle(label).color,
        surroundingColor: getComputedStyle(parent).color,
        iconColor: icon == null ? null : getComputedStyle(icon).color,
        iconBox: icon == null ? null : box(icon),
        labelBox: label == null ? null : box(label),
        hiddenText: hidden?.textContent ?? null,
        hiddenBox: hidden == null ? null : box(hidden),
        decoration: style.textDecorationLine,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        cursor: style.cursor,
        background: style.backgroundColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth) || 0,
        direction: style.direction,
        focused: document.activeElement === link,
        labelOverflows:
          label == null ? false : label.scrollWidth > label.clientWidth + 1,
        labelEllipsis:
          label == null ? null : getComputedStyle(label).textOverflow,
        box: box(link),
        lineBox: box(parent),
      };
    });
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
      links,
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
    try {
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', error => pageErrors.push(String(error)));
      await page.goto(storyUrl(item), {waitUntil: 'load'});
      const first = page.locator('#storybook-root .astryx-link').first();
      await first.waitFor();
      await page.mouse.move(0, 0);
      await settle(page);

      // Drive the real state: a pointer hover, a keyboard Tab, or a held press.
      if (item.state === 'hover') {
        // A disabled Link takes no pointer events, so the pointer over its box
        // hovers the line under it.
        const box = await first.boundingBox();
        if (box == null) {
          throw new Error('no Link box to hover');
        }
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      } else if (item.state === 'focus') {
        await page.keyboard.press('Tab');
      } else if (item.state === 'pressed') {
        const box = await first.boundingBox();
        if (box == null) {
          throw new Error('no Link box to press');
        }
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
      }
      await settle(page);
      const before = await observe(page);
      await page.waitForTimeout(100);
      await settle(page);
      const observed = await observe(page);
      const geometryStable =
        JSON.stringify(before.links.map(link => link.box)) ===
        JSON.stringify(observed.links.map(link => link.box));

      const failures: string[] = [];
      const check = (condition: boolean, message: string) => {
        if (!condition) {
          failures.push(message);
        }
      };
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
        observed.links.length === LINKS[item.story],
        `${observed.links.length} links, expected ${LINKS[item.story]}`,
      );
      check(
        observed.documentOverflow <= 0,
        `document scrolls sideways by ${observed.documentOverflow}px`,
      );

      observed.links.forEach((link, index) => {
        const where = `link ${index} (${link.tag} ${link.dataColor})`;
        const disabled = link.ariaDisabled === 'true';
        check(
          JSON.stringify(link.targets) === '["astryx-link"]',
          `${where} targets ${link.targets.join(' ')}`,
        );
        check(link.dataColor !== '', `${where} has no data-color`);
        check(
          link.direction === item.direction,
          `${where} direction ${link.direction}`,
        );
        // The element form and its role.
        if (link.tag === 'a') {
          if (disabled) {
            check(link.href == null, `${where} disabled anchor has an href`);
            check(link.role === 'link', `${where} role ${link.role}`);
            check(link.tabIndex === 0, `${where} tabIndex ${link.tabIndex}`);
          } else {
            check(link.href != null, `${where} has no href`);
          }
        } else {
          check(link.tag === 'button', `${where} element ${link.tag}`);
          check(link.type === 'button', `${where} type ${link.type}`);
          check(link.tabIndex === 0, `${where} tabIndex ${link.tabIndex}`);
        }
        // A disabled Link is half opacity and takes no pointer events.
        if (disabled) {
          check(link.opacity === '0.5', `${where} opacity ${link.opacity}`);
          check(
            link.pointerEvents === 'none',
            `${where} pointer-events ${link.pointerEvents}`,
          );
        } else {
          check(link.opacity === '1', `${where} opacity ${link.opacity}`);
        }
        // At rest the root paints its color token and the label inherits it.
        // A hovered or pressed Link is under the pointer, so it takes the hover tint.
        const hovered =
          (item.state === 'hover' || item.state === 'pressed') &&
          index === 0 &&
          !disabled;
        if (!hovered) {
          check(
            link.color === link.expectedColor,
            `${where} color ${link.color}, expected ${link.expectedColor}`,
          );
        }
        if (link.dataColor !== 'inherit' && link.labelColor != null) {
          check(
            link.labelColor === link.color,
            `${where} label ${link.labelColor} differs from root ${link.color}`,
          );
        }
        // The external icon takes the root color; the new-tab text is hidden.
        if (link.iconColor != null) {
          check(
            link.iconColor === link.color,
            `${where} icon ${link.iconColor} differs from root ${link.color}`,
          );
          check(
            link.hiddenText === '(opens in new tab)',
            `${where} new-tab text ${link.hiddenText}`,
          );
          check(
            link.hiddenBox != null &&
              link.hiddenBox.width <= 1 &&
              link.hiddenBox.height <= 1,
            `${where} new-tab text is visible ${JSON.stringify(link.hiddenBox)}`,
          );
          if (link.labelBox != null && link.iconBox != null) {
            const trailing =
              item.direction === 'rtl'
                ? link.iconBox.right <= link.labelBox.left + 0.5
                : link.iconBox.left >= link.labelBox.right - 0.5;
            check(trailing, `${where} external icon is not trailing`);
          }
        }
        // Keyboard focus paints the focus outline on the Link itself.
        if (link.focused && item.state === 'focus') {
          check(
            link.outlineStyle !== 'none' && link.outlineWidth >= 1,
            `${where} focus outline ${link.outlineStyle} ${link.outlineWidth}`,
          );
        }
      });

      const firstLink = observed.links[0];
      const restUnderline = item.story === 'with-underline';
      if (item.state === 'rest' && firstLink != null) {
        check(
          firstLink.decoration === (restUnderline ? 'underline' : 'none'),
          `rest decoration ${firstLink.decoration}`,
        );
      }
      if (item.state === 'hover' && firstLink != null) {
        if (firstLink.ariaDisabled === 'true') {
          // No hover paint on a disabled Link.
          check(
            firstLink.decoration === 'none',
            `disabled hover decoration ${firstLink.decoration}`,
          );
          check(
            firstLink.color === firstLink.expectedColor,
            `disabled hover color ${firstLink.color}`,
          );
        } else {
          // Hover underlines and mixes in the hover tint.
          check(
            firstLink.decoration === 'underline',
            `hover decoration ${firstLink.decoration}`,
          );
          check(
            firstLink.color !== firstLink.expectedColor,
            `hover color did not change from ${firstLink.color}`,
          );
        }
      }
      if (item.state === 'focus') {
        check(
          firstLink != null && firstLink.focused,
          'the first Tab stop is not the Link',
        );
      }
      if (item.state === 'pressed' && firstLink != null) {
        // An enabled link paints the pressed overlay.
        check(
          firstLink.background !== 'rgba(0, 0, 0, 0)',
          `pressed background ${firstLink.background}`,
        );
      }
      if (item.story === 'truncated-in-constrained-line') {
        // The `maxLines` prop stops the Link at its line and draws an ellipsis.
        observed.links.forEach((link, index) => {
          check(
            link.box.right <= link.lineBox.right + 0.5 &&
              link.box.left >= link.lineBox.left - 0.5,
            `truncating link ${index} leaves its line`,
          );
          check(link.labelOverflows, `truncating link ${index} does not clip`);
          check(
            link.labelEllipsis === 'ellipsis',
            `truncating link ${index} text-overflow ${link.labelEllipsis}`,
          );
        });
      }

      const subject = page.locator('#storybook-root');
      const screenshot = await subject.screenshot({animations: 'disabled'});
      if (item.state === 'pressed') {
        await page.mouse.up();
      }
      const screenshotPath = path.join(OUTPUT, `${item.key}.png`);
      fs.writeFileSync(screenshotPath, screenshot);
      const receipt = {
        component: 'Link',
        build: storybookSha,
        checkout: checkoutSha,
        story: `core-link--${item.story}`,
        state: item.state,
        theme: item.theme,
        mode: item.mode,
        direction: item.direction,
        viewport: item.viewport,
        dpr: observed.dpr,
        reducedMotion: observed.reducedMotion,
        fonts: observed.fonts,
        pageErrors,
        geometryStable,
        screenshot: {
          file: path.basename(screenshotPath),
          sha256: createHash('sha256').update(screenshot).digest('hex'),
        },
        observed,
        // Recorded, not asserted: the contrast between each Link's color and
        // the text color around it (WCAG 1.4.1 asks for 3:1 when color alone
        // marks a link in running text).
        contrastWithSurrounding: observed.links.map(link =>
          contrast(link.color, link.surroundingColor),
        ),
        passed: failures.length === 0,
        failures,
      };
      fs.writeFileSync(
        path.join(OUTPUT, `${item.key}.json`),
        `${JSON.stringify(receipt, null, 2)}\n`,
      );
      expect(failures).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
