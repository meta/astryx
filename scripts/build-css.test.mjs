// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build-css.test.mjs
 * Integration test for build-css.mjs
 *
 * Validates that astryx.css contains expected @media wrappers and
 * prefers-reduced-motion rules, and that the touch press's release ships as a
 * real fade: the press strength is a registered `<number>` the fading arm
 * animates on the machine's own clock (utils/interactionOverlay.stylex.ts).
 */

import {describe, it, expect, beforeAll} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureCoreBuilt} from '../packages/cli/clients/cli/commands/ensure-core-built.mjs';

/**
 * The release clocks, read off their one source: `pressConsts` in
 * utils/interactionOverlay.stylex.ts (`releaseMs`, a cell's deselect, and
 * `controlReleaseMs`, a control's), which both the stylesheet (at build
 * time) and the controller's profile table (at run time) take them from. The
 * module itself cannot be imported here, since a StyleX source file only
 * runs compiled.
 */
/**
 * The Reduce Motion fade's duration, off its one source:
 * `reducedMotionFadeConsts.duration` in motion/reducedMotion.stylex.ts.
 */
async function readReducedMotionFadeMs() {
  const source = await fs.readFile(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../packages/core/src/motion/reducedMotion.stylex.ts',
    ),
    'utf8',
  );
  const block = source.slice(source.indexOf('reducedMotionFadeConsts'));
  const match = block.match(/duration:\s*'(\d+)ms'/);
  if (match == null) {
    throw new Error('reducedMotionFadeConsts.duration not found');
  }
  return Number(match[1]);
}

async function readReleaseClocks() {
  const source = await fs.readFile(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../packages/core/src/utils/interactionOverlay.stylex.ts',
    ),
    'utf8',
  );
  const controlSource = await fs.readFile(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../packages/core/src/utils/controlPressLayer.stylex.ts',
    ),
    'utf8',
  );
  const cell = source.match(/\breleaseMs:\s*(\d+)/);
  const control = controlSource.match(/\bcontrolReleaseMs:\s*(\d+)/);
  if (cell == null || control == null) {
    throw new Error(
      'pressConsts.releaseMs / controlPressConsts.controlReleaseMs not found',
    );
  }
  return {cell: Number(cell[1]), control: Number(control[1])};
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CORE_DIST = path.resolve(ROOT, 'packages/core/dist');

/**
 * Extract all @media blocks from a CSS string.
 */
function extractMediaRules(css) {
  const rules = [];
  let i = 0;
  while (i < css.length) {
    const idx = css.indexOf('@media', i);
    if (idx === -1) break;

    const braceStart = css.indexOf('{', idx);
    if (braceStart === -1) break;

    let depth = 1;
    let j = braceStart + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }

    rules.push(css.slice(idx, j).trim());
    i = j;
  }
  return rules;
}

/** Remove one functional pseudo-class, including nested parentheses. */
function removeFunctionalPseudo(selector, name) {
  let result = selector;
  const needle = `:${name}(`;
  for (;;) {
    const start = result.indexOf(needle);
    if (start === -1) return result;
    let depth = 1;
    let end = start + needle.length;
    while (end < result.length && depth > 0) {
      if (result[end] === '(') depth++;
      else if (result[end] === ')') depth--;
      end++;
    }
    result = result.slice(0, start) + result.slice(end);
  }
}

/** Specificity tuple for the generated selectors used by the state guard. */
function specificity(selector) {
  const withoutWhere = removeFunctionalPseudo(selector, 'where');
  const ids = (withoutWhere.match(/#/g) ?? []).length;
  const classes = (withoutWhere.match(/\.[a-zA-Z0-9_-]+/g) ?? []).length;
  const attributes = (withoutWhere.match(/\[[^\]]+\]/g) ?? []).length;
  const pseudos = (
    withoutWhere.match(/:(?!:|not\(|is\(|has\()[a-zA-Z-]+/g) ?? []
  ).length;
  return [ids, classes + attributes + pseudos, 0];
}

function stateRule(css, {property, token, state, media}) {
  const lines = css.split('\n');
  return lines.find(line => {
    const inHoverMedia = line.includes('@media (hover: hover)');
    return (
      inHoverMedia === media &&
      line.includes(`:${state}:where(`) &&
      !line.includes('::') &&
      line.includes(`${property}:`) &&
      line.includes(`var(--color-overlay-${token})`)
    );
  });
}

function selectorFromRule(rule) {
  const declaration = rule.lastIndexOf('{');
  const mediaBody = rule.indexOf('{');
  return rule
    .slice(rule.includes('@media') ? mediaBody + 1 : 0, declaration)
    .trim();
}

describe('build-css astryx.css', () => {
  let astryxCss;

  beforeAll(async () => {
    // Core — including its `build:css` step that emits astryx.css — is built
    // ONCE by the node project's globalSetup (vitest.global-setup.node.mjs →
    // ensureCoreBuilt). This call is an idempotent, race-safe no-op that just
    // guarantees dist is present. Do NOT run a full `pnpm build` here: it
    // launched a whole-monorepo build (all cores, ~2min) concurrently with the
    // rest of the suite, starving other tests into nondeterministic timeouts.
    ensureCoreBuilt();
    astryxCss = await fs.readFile(path.join(CORE_DIST, 'astryx.css'), 'utf8');
  }, 180_000);

  it('contains @media rules', () => {
    const mediaRules = extractMediaRules(astryxCss);
    expect(mediaRules.length).toBeGreaterThan(0);
    console.log(`astryx.css has ${mediaRules.length} @media rules`);
  });

  it('contains prefers-reduced-motion rules', () => {
    const mediaRules = extractMediaRules(astryxCss);
    const motionRules = mediaRules.filter(r =>
      r.includes('prefers-reduced-motion'),
    );
    expect(motionRules.length).toBeGreaterThan(0);
    console.log(
      `astryx.css has ${motionRules.length} prefers-reduced-motion rules`,
    );
  });

  it.each(['background-color', 'background-image'])(
    'emits %s pressed after hover at equal specificity',
    property => {
      const hover = stateRule(astryxCss, {
        property,
        token: 'hover',
        state: 'hover',
        media: true,
      });
      const pressed = stateRule(astryxCss, {
        property,
        token: 'pressed',
        state: 'active',
        media: true,
      });

      expect(hover).toBeDefined();
      expect(pressed).toBeDefined();
      expect(specificity(selectorFromRule(pressed))).toEqual(
        specificity(selectorFromRule(hover)),
      );
      expect(astryxCss.indexOf(pressed)).toBeGreaterThan(
        astryxCss.indexOf(hover),
      );
    },
  );

  it.each(['background-color', 'background-image'])(
    'keeps the bare %s pressed rule for touch input',
    property => {
      expect(
        stateRule(astryxCss, {
          property,
          token: 'pressed',
          state: 'active',
          media: false,
        }),
      ).toBeDefined();
    },
  );

  it('no transition-duration:0s rules appear outside @media blocks', () => {
    const zeroTransitionRegex =
      /\.[a-z][a-z0-9_-]+[^{}]*\{[^}]*transition-duration:\s*0s[^}]*\}/g;
    const matches = [...astryxCss.matchAll(zeroTransitionRegex)];

    for (const match of matches) {
      const position = match.index;
      const before = astryxCss.slice(0, position);
      const mediaStarts = [...before.matchAll(/@media[^{]*\{/g)];
      const isWrapped = mediaStarts.some(m => {
        const mediaStart = m.index;
        const afterMedia = astryxCss.slice(mediaStart);
        let depth = 0;
        for (let i = 0; i < afterMedia.length; i++) {
          if (afterMedia[i] === '{') depth++;
          else if (afterMedia[i] === '}') {
            depth--;
            if (depth === 0) {
              return mediaStart + i > position;
            }
          }
        }
        return false;
      });

      expect(isWrapped).toBe(true);
    }

    if (matches.length > 0) {
      console.log(
        `Verified ${matches.length} transition-duration:0s rules are all inside @media blocks`,
      );
    }
  });

  it('does not produce per-component CSS files', async () => {
    // Verify the cleanup — no common.css or per-component styles.css
    await expect(
      fs.access(path.join(CORE_DIST, 'common.css')).then(
        () => true,
        () => false,
      ),
    ).resolves.toBe(false);
  });

  describe('the touch press release (utils/interactionOverlay.stylex.ts)', () => {
    /** `.2s`, `200ms`, `0.2s` → 200. */
    const toMs = value => {
      // Capped under reduced motion: `min(<clock>, 200ms)`.
      const capped = /^min\((.+),\s*([\d.]+m?s)\)$/.exec(value.trim());
      if (capped != null) {
        return Math.min(toMs(capped[1]), toMs(capped[2]));
      }
      // The release plays a theme motion role: `var(--motion-…, 200ms)`.
      const role = value.trim().match(/^var\(\s*--[\w-]+\s*,\s*(.+)\)$/);
      const match = (role == null ? value : role[1])
        .trim()
        .match(/^([\d.]+)(ms|s)$/);
      return match == null
        ? Number.NaN
        : Number(match[1]) * (match[2] === 's' ? 1000 : 1);
    };
    const lines = () => astryxCss.split('\n');

    it('registers the press strength as an interpolable number, once', () => {
      // The pressed overlay is a gradient layer, and gradients do not
      // interpolate; the registered number the layer reads does. This is the
      // declaration that makes the release a fade rather than a step.
      const registrations =
        astryxCss.match(/@property --astryx-press-alpha \{[^}]*\}/g) ?? [];
      expect(registrations).toHaveLength(1);
      expect(registrations[0]).toContain('syntax: "<number>"');
      expect(registrations[0]).toContain('initial-value: 0');
      expect(astryxCss).toMatch(/:root[^{]*\{--astryx-press-alpha:0;?\}/);
    });

    it("animates the strength 1 → 0 on the fading arm, on the machine's own clock", async () => {
      const keyframes = astryxCss.match(
        /@keyframes ([\w-]+)\{from\{--astryx-press-alpha:1;?\}to\{--astryx-press-alpha:0;?\}\}/,
      );
      expect(keyframes).not.toBeNull();
      // The overlay's arms on the element itself; the compositor press
      // layers' `::before` and `::after` arms have their own block below.
      const fading = lines().filter(
        line =>
          line.includes('[data-astryx-press="fading"]') &&
          !line.includes('::before') &&
          !line.includes('::after') &&
          // Reduced motion's own clock is checked in its block below.
          !line.includes('prefers-reduced-motion'),
      );
      expect(
        fading.some(line => line.includes(`animation-name:${keyframes[1]}`)),
      ).toBe(true);
      const durationsOf = rules =>
        rules
          .map(line => line.match(/animation-duration:\s*([^;}]+)/))
          .filter(Boolean)
          .map(match => toMs(match[1]));
      const coarse = line => line.trim().startsWith('@media (pointer: coarse)');
      // Under a coarse primary pointer, one clock per profile, the ones the
      // controller removes the attribute on: a control's by default, a
      // cell's where the marker says `cell`.
      const clocks = await readReleaseClocks();
      // A mouse or Space press the controller paints on a touch-first device
      // keeps the deselect clock (`[data-astryx-press-input]`).
      const input = line => line.includes('[data-astryx-press-input]');
      expect(
        [
          ...durationsOf(fading.filter(line => coarse(line) && !input(line))),
        ].sort((a, b) => a - b),
      ).toEqual([clocks.cell, clocks.control].sort((a, b) => a - b));
      expect(
        durationsOf(fading.filter(line => coarse(line) && input(line))),
      ).toEqual([clocks.cell]);
      // With any other pointer, the one clock it always had: the deselect's
      // (the desktop rule, `spec:AST-017` FR59/DEC-25).
      expect(durationsOf(fading.filter(line => !coarse(line)))).toEqual([
        clocks.cell,
      ]);
      const cellArm = fading.filter(line =>
        line.includes('[data-astryx-pressable="cell"]'),
      );
      expect(
        cellArm
          .map(line => line.match(/animation-duration:\s*([^;}]+)/))
          .filter(Boolean)
          .map(match => toMs(match[1])),
      ).toEqual([clocks.cell]);
      // Under Reduce Motion the fading arm follows design:reduced-motion
      // instead (DR2's fade, utils/pressPaintReducedMotion.test.ts), in its
      // own media blocks: every such clock is the policy's fade.
      const reduced = lines().filter(
        line =>
          line.includes('[data-astryx-press="fading"]') &&
          !line.includes('::before') &&
          !line.includes('::after') &&
          line.includes('prefers-reduced-motion'),
      );
      expect([...new Set(durationsOf(reduced))]).toEqual([
        await readReducedMotionFadeMs(),
      ]);
      // The onset is instant: nothing animates on the on arm.
      const on = lines().filter(line =>
        line.includes('[data-astryx-press="on"]'),
      );
      expect(on.length).toBeGreaterThan(0);
      expect(on.some(line => line.includes('animation'))).toBe(false);
    });

    it('declares the press paint once, as the pressed token at the strength, and paints every touch arm through it', () => {
      // The one source: `--_press-paint`, the pressed token mixed at the
      // press's strength, declared by the shared overlay styles on the element
      // the controller writes to. StyleX deduplicates the identical
      // declaration across the variants, so the shipped sheet carries it once.
      // (The compositor press layer's rows turn this paint off with
      // `--_press-paint: transparent`; that declaration is its own, below.)
      const declarations = lines().filter(
        line =>
          /\{--_press-paint:/.test(line) &&
          !/\{--_press-paint:transparent/.test(line),
      );
      expect(declarations).toHaveLength(1);
      expect(declarations[0]).toContain('var(--color-overlay-pressed)');
      expect(declarations[0]).toContain('var(--astryx-press-alpha)');
      expect(declarations[0]).not.toContain('--color-overlay-hover');
      // No second copy of the formula anywhere in the sheet.
      const formulas = astryxCss.match(
        /color-mix\(in srgb,\s*var\(--color-overlay-pressed\)\s*calc\(/g,
      );
      expect(formulas).toHaveLength(1);
      // Every overlay variant, the cards' `--_press-overlay`, and the
      // ancestor-scoped paints (switch, tab) read it back: eight lines today,
      // fewer than the arms because StyleX deduplicates identical rules. The
      // checkbox and radio overlays paint on their own layer instead (below).
      // A regex that stopped matching would fall well below this floor.
      const paints = lines().filter(
        line =>
          /\[data-astryx-press="(?:on|fading)"\]/.test(line) &&
          line.includes('var(--_press-paint'),
      );
      expect(paints.length).toBeGreaterThanOrEqual(7);
      // Not the hover strength: under a finger there is no hover to land on,
      // and a paint that stepped there would still have to step off.
      const arms = lines().filter(line =>
        /\[data-astryx-press="(?:on|fading)"\]/.test(line),
      );
      expect(arms.some(line => line.includes('--color-overlay-hover'))).toBe(
        false,
      );
    });

    it('paints the checkbox and radio press on their own layer and releases it by opacity', () => {
      // The element that owns a press (a CheckboxInput's control, a
      // CheckboxList or RadioList row) declares the press's image and release
      // on itself, inside its own press arms, for every pointer
      // (indicatorPressOwnerStyles; `spec:AST-094` FR11's fine-pointer
      // profile, FR43); the layer over a checkbox box or a radio circle (its
      // wrapper's `::after`) reads them, so it answers its nearest owner
      // only. The release runs on a control's clock (250 ms) for a standalone
      // checkbox and a cell's (200 ms) in a row, and the layer reads no
      // strength.
      const behindPointer = line => /@media[^{]*pointer:/.test(line);
      const own = arm =>
        lines().filter(
          line =>
            !behindPointer(line) &&
            line.includes(`:is([data-astryx-press="${arm}"])`),
        );
      const setsImage = arm =>
        own(arm).some(line =>
          line.includes(
            '{--_indicator-press-image:linear-gradient(var(--color-overlay-pressed)',
          ),
        );
      expect(setsImage('on')).toBe(true);
      expect(setsImage('fading')).toBe(true);
      expect(
        own('fading').some(line =>
          /\{--_indicator-press-release:(?!none)[\w-]+\}/.test(line),
        ),
      ).toBe(true);
      const layer = lines().filter(
        line => !behindPointer(line) && line.includes('::after{'),
      );
      expect(
        layer.some(line =>
          line.includes(
            '::after{background-image:var(--_indicator-press-image,none)}',
          ),
        ),
      ).toBe(true);
      expect(
        layer.some(line =>
          line.includes(
            '::after{animation-name:var(--_indicator-press-release,none)}',
          ),
        ),
      ).toBe(true);
      // One press model for every pointer: no part of a selection mark's
      // press sits behind a pointer query.
      expect(
        lines().filter(
          line =>
            behindPointer(line) &&
            /--_indicator-press-(image|release)/.test(line),
        ),
      ).toEqual([]);
      const durations = lines().flatMap(line => {
        if (/^\s*@/.test(line)) {
          return [];
        }
        const match = line.match(
          /::after\{animation-duration:([\d.]+)(ms|s)\}/,
        );
        return match == null
          ? []
          : [Number(match[1]) * (match[2] === 's' ? 1000 : 1)];
      });
      expect(durations).toEqual(expect.arrayContaining([200, 250]));
      expect(
        lines().some(
          line =>
            line.includes('--_indicator-press-image:') &&
            line.includes('var(--_press-paint'),
        ),
      ).toBe(false);
    });
  });
  describe('the press releases under reduced motion (design:reduced-motion)', () => {
    const toMs = value => {
      const match = value.trim().match(/^([\d.]+)(ms|s)$/);
      return match == null
        ? Number.NaN
        : Number(match[1]) * (match[2] === 's' ? 1000 : 1);
    };
    const durationMs = value => toMs(value);
    const durationOf = line =>
      line.match(/animation-duration:\s*([^;}]+)/)?.[1] ?? null;
    /** A control's release clock: UIButton's, 250 ms (`button.highlight`). */
    const isControlClock = line => {
      const duration = durationOf(line);
      return duration != null && toMs(duration) === 250;
    };
    const kindOf = line =>
      line.includes('::before')
        ? '::before'
        : line.includes('::after')
          ? '::after'
          : 'host';
    const COARSE =
      '@media (prefers-reduced-motion: reduce) and (pointer: coarse)';
    const OTHER =
      '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))';
    const fadingLines = () =>
      astryxCss
        .split('\n')
        .filter(line => line.includes('[data-astryx-press="fading"]'));
    /** How much StyleX padded a rule's specificity (its selector only). */
    const weight = line => {
      const selector = line
        .trim()
        .replace(/^@media[^{]*\{/, '')
        .split('{')[0];
      const first = selector.match(/^\.[\w-]+/)?.[0] ?? '';
      const repeats = first ? selector.split(first).length - 1 : 0;
      return (selector.match(/:not\(#\\#\)/g) ?? []).length + repeats;
    };

    it('cross-fades every control release in 200 ms or less where the primary pointer is coarse (DR2)', () => {
      const long = fadingLines().filter(line => {
        const duration = durationOf(line);
        return (
          duration != null &&
          !line.includes('prefers-reduced-motion') &&
          durationMs(duration) > 200
        );
      });
      expect(new Set(long.map(kindOf))).toEqual(
        new Set(['host', '::before', '::after']),
      );
      for (const kind of ['host', '::before', '::after']) {
        const reduced = fadingLines().filter(
          line =>
            line.includes(COARSE) &&
            kindOf(line) === kind &&
            /animation-duration:/.test(line),
        );
        expect(reduced.length, kind).toBeGreaterThan(0);
        for (const line of reduced) {
          expect(durationMs(durationOf(line)), line).toBeLessThanOrEqual(200);
        }
      }
    });

    it('releases every control at once with any other pointer: no animation, the rest state on the fading arm (DR3)', () => {
      const other = fadingLines().filter(line => line.includes(OTHER));
      // The host's release, which runs with any pointer, stops...
      const stops = other.filter(
        line => kindOf(line) === 'host' && /animation-name:none/.test(line),
      );
      expect(stops.length).toBeGreaterThan(0);
      // ...and outranks the release it replaces.
      const releases = fadingLines().filter(
        line =>
          !line.includes('prefers-reduced-motion') &&
          kindOf(line) === 'host' &&
          /animation-name:(?!none)/.test(line),
      );
      for (const release of releases) {
        expect(Math.max(...stops.map(weight)), release).toBeGreaterThanOrEqual(
          weight(release),
        );
      }
      expect(
        other.some(
          line =>
            kindOf(line) === 'host' && /--astryx-press-alpha:0/.test(line),
        ),
      ).toBe(true);
      // A control's layer release (a button's `::before`, a card's
      // `::after`, on UIButton's clock) runs only under a coarse primary
      // pointer, so it never runs with any other.
      const layerReleases = fadingLines().filter(
        line =>
          kindOf(line) !== 'host' &&
          !line.includes('prefers-reduced-motion') &&
          isControlClock(line),
      );
      expect(layerReleases.length).toBeGreaterThan(0);
      for (const line of layerReleases) {
        expect(line.trim(), line).toMatch(/^@media \(pointer: coarse\)\{/);
      }
    });

    it('adds nothing for any other pointer than a coarse primary one (the desktop rule)', async () => {
      // `spec:AST-017` FR59/DEC-25: touch work leaves a fine pointer's behavior as
      // it is. UIButton's release clock and curve, and the button's
      // `isolation`, apply only behind the coarse gate.
      const source = await fs.readFile(
        path.join(ROOT, 'packages/core/src/utils/controlPressLayer.stylex.ts'),
        'utf8',
      );
      const ms = Number(source.match(/controlReleaseMs:\s*(\d+)/)[1]);
      const points = source
        .match(/controlReleaseEase:\s*'([^']+)'/)[1]
        .match(/-?\d*\.?\d+/g)
        .map(point => String(Number(point)).replace(/^0\./, '.'));
      const curve = `animation-timing-function:cubic-bezier(${points.join(',')})`;
      const isClock = line =>
        isControlClock(line) && durationMs(durationOf(line)) === ms;
      const gated = line => /^@media \(pointer: coarse\)\{/.test(line.trim());
      const lines = astryxCss
        .split('\n')
        .filter(line => !line.includes('prefers-reduced-motion'));
      // The curve as written in the stylesheet, minified or not.
      const hasCurve = line =>
        line
          .replace(/\s+/g, '')
          .replace(/([(,])0\./g, '$1.')
          .includes(curve);
      // A selection mark's press layer (a CheckboxInput box's `::after`) is
      // the mark's only press for every pointer (`spec:AST-094` FR11's
      // fine-pointer profile, FR43), so its release on the control clock runs
      // ungated. The rule holds for the Button's host layer, which releases
      // a fine pointer's press through the host strength.
      const indicatorClasses = new Set(
        (
          await fs.readFile(
            path.join(CORE_DIST, 'CheckboxInput/CheckboxInput.js'),
            'utf8',
          )
        ).match(/\bx[a-z0-9]+\b/g) ?? [],
      );
      const isIndicatorLayer = line =>
        line.includes('::after') &&
        indicatorClasses.has(line.trim().match(/^\.([\w-]+)/)?.[1] ?? '');
      const control = lines.filter(
        line => (isClock(line) || hasCurve(line)) && !isIndicatorLayer(line),
      );
      expect(control.some(isClock)).toBe(true);
      expect(control.some(hasCurve)).toBe(true);
      expect(control.filter(line => !gated(line))).toEqual([]);
      expect(
        lines.some(line => gated(line) && /\{isolation:isolate\}/.test(line)),
      ).toBe(true);
    });
  });

  describe('the compositor press layer (rowPressLayer.ts `cell`)', () => {
    /** The cell clock and curve, read off their one stylesheet source. */
    async function readLayerConsts() {
      const source = await fs.readFile(
        path.join(ROOT, 'packages/core/src/utils/rowPressLayer.stylex.ts'),
        'utf8',
      );
      const ms = source.match(/cellReleaseMs:\s*(\d+)/);
      const ease = source.match(/cellReleaseEase:\s*'([^']+)'/);
      if (ms == null || ease == null) {
        throw new Error('cellPressConsts not found in rowPressLayer.stylex.ts');
      }
      return {
        ms: Number(ms[1]),
        points: ease[1].match(/-?\d*\.?\d+/g).map(Number),
      };
    }
    const toMs = value => {
      // Capped under reduced motion: `min(<clock>, 200ms)`.
      const capped = /^min\((.+),\s*([\d.]+m?s)\)$/.exec(value.trim());
      if (capped != null) {
        return Math.min(toMs(capped[1]), toMs(capped[2]));
      }
      // The release plays a theme motion role: `var(--motion-…, 200ms)`.
      const role = value.trim().match(/^var\(\s*--[\w-]+\s*,\s*(.+)\)$/);
      const match = (role == null ? value : role[1])
        .trim()
        .match(/^([\d.]+)(ms|s)$/);
      return match == null
        ? Number.NaN
        : Number(match[1]) * (match[2] === 's' ? 1000 : 1);
    };
    const layerLines = arm =>
      astryxCss
        .split('\n')
        .filter(line => line.includes(arm) && line.includes('::before'));

    it('releases with an opacity keyframe animation on the cell clock and curve', async () => {
      // Opacity, the property engines run on the compositor: the release
      // keeps fading while script runs.
      const keyframes = astryxCss.match(
        /@keyframes ([\w-]+)\{from\{opacity:1;?\}to\{opacity:0;?\}\}/,
      );
      expect(keyframes).not.toBeNull();
      const fading = layerLines('[data-astryx-press="fading"]');
      expect(
        fading.some(line => line.includes(`animation-name:${keyframes[1]}`)),
      ).toBe(true);
      const {ms, points} = await readLayerConsts();
      const durations = fading
        .map(line => line.match(/animation-duration:\s*([^;}]+)/))
        .filter(Boolean)
        .map(match => toMs(match[1]));
      // The control layer (Button) releases on its own clock beside it.
      expect(durations).toContain(ms);
      const curves = fading
        .map(line => line.match(/animation-timing-function:\s*([^;}]+)/))
        .filter(Boolean)
        .map(match => match[1].match(/-?\d*\.?\d+/g).map(Number));
      expect(curves).toContainEqual(points);
    });

    it('lets the motion animator promote the layer it animates', () => {
      expect(astryxCss).toMatch(
        /::before\{[^}]*will-change:var\(--astryx-motion-will-change-before,\s*auto\)/,
      );
    });

    it('shows the layer at once on the on arm, and rests it at 0 on the fading arm under its release', () => {
      const on = layerLines('[data-astryx-press="on"]');
      expect(on.some(line => /\{opacity:1;?\}/.test(line))).toBe(true);
      expect(on.some(line => line.includes('animation'))).toBe(false);
      // Nothing of the layer at rest (a row's own `::before` is untouched):
      // its opacity is only ever a press arm's.
      const fading = layerLines('[data-astryx-press="fading"]');
      expect(fading.some(line => /\{opacity:0;?\}/.test(line))).toBe(true);
    });

    /** The control clock and curve, read off the same stylesheet source. */
    async function readControlConsts() {
      const source = await fs.readFile(
        path.join(ROOT, 'packages/core/src/utils/controlPressLayer.stylex.ts'),
        'utf8',
      );
      const ms = source.match(/controlReleaseMs:\s*(\d+)/);
      const ease = source.match(/controlReleaseEase:\s*'([^']+)'/);
      if (ms == null || ease == null) {
        throw new Error(
          'control release not found in controlPressLayer.stylex.ts',
        );
      }
      return {
        ms: Number(ms[1]),
        points: ease[1].match(/-?\d*\.?\d+/g).map(Number),
      };
    }

    it.each(['::before', '::after'])(
      'releases a control (%s) with an opacity keyframe animation on the control clock and curve',
      async pseudo => {
        const keyframes = astryxCss.match(
          /@keyframes ([\w-]+)\{from\{opacity:1;?\}to\{opacity:0;?\}\}/,
        );
        expect(keyframes).not.toBeNull();
        const {ms, points} = await readControlConsts();
        const fading = astryxCss
          .split('\n')
          .filter(
            line =>
              line.includes('[data-astryx-press="fading"]') &&
              line.includes(pseudo),
          );
        expect(
          fading.some(line => line.includes(`animation-name:${keyframes[1]}`)),
        ).toBe(true);
        const durations = fading
          .map(line => line.match(/animation-duration:\s*([^;}]+)/))
          .filter(Boolean)
          .map(match => toMs(match[1]));
        expect(durations).toContain(ms);
        const curves = fading
          .map(line => line.match(/animation-timing-function:\s*([^;}]+)/))
          .filter(Boolean)
          .map(match => match[1].match(/-?\d*\.?\d+/g).map(Number));
        expect(curves).toContainEqual(points);
      },
    );
  });

  describe("the list rows' touch arms (List, TreeList)", () => {
    /**
     * A rule the build puts inside the touch gate (TOUCH_QUERY,
     * utils/touchPresentation.ts): a coarse primary pointer, iOS and Android
     * alike, never a mouse. No engine condition: one touch model.
     */
    const TOUCH_GATED = /^@media \(pointer: coarse\)\{(?!@supports)/;
    const rules = () => astryxCss.split('\n').map(line => line.trim());
    /** Rules that hide a divider or reach the press layer over one. */
    const dividerArms = state =>
      rules().filter(
        rule =>
          rule.includes(`[data-astryx-press="${state}"]`) &&
          (rule.includes('{border-bottom-color:transparent}') ||
            rule.includes('::before{bottom:')),
      );

    it('hides the dividers beside a pressed row, and reaches its layer over them, only under a finger', () => {
      const arms = dividerArms('on');
      // Its own divider, the one above, the layer's reach, the last row's.
      expect(arms.length).toBeGreaterThanOrEqual(4);
      for (const rule of arms) {
        expect(rule).toMatch(TOUCH_GATED);
      }
    });

    it('keeps them hidden around a row held through a navigation push the same way', () => {
      const arms = dividerArms('held');
      expect(arms.length).toBeGreaterThanOrEqual(4);
      for (const rule of arms) {
        expect(rule).toMatch(TOUCH_GATED);
      }
    });
  });

  describe('Layout header/footer padding collapse (Layout/layoutEdges.stylex.ts)', () => {
    it('ships no :has() on the layout followed by a descendant * for the header or footer', () => {
      // `.anchor:has(…) *` makes engines restyle everything inside the layout
      // on any change in it; the collapse uses sibling markers instead.
      const costly = astryxCss
        .split('\n')
        .filter(
          line =>
            /astryx-layout-(header|footer)/.test(line) && /:has\(/.test(line),
        );
      expect(costly).toEqual([]);
    });
  });
});
