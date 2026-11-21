// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file filledStatePaint.ts
 * @input A theme's portable and local token maps, its generated status roles,
 *   and its `button` rules
 * @output The hover and pressed paint of each filled Button variant, per mode,
 *   as private `--_button-<variant>-<state>` values. A state keeps the shared
 *   overlay where it reads. Else it takes a readable tint.
 * @position Theme generation step beside statusRoleDerivation, called by
 *   generateThemeRules; Core's own values are precomputed in
 *   filledStatePaint.stylex.ts
 */

import {resolveModes} from './statusRoleDerivation';
import {
  composite,
  contrastRatio,
  parseConcreteColor,
  relativeLuminance,
  toHex,
} from './statusColor';
import type {RGBA} from '../utils/color';

type Mode = 'light' | 'dark';

/** The filled variants: the fill and the label Core paints for each. */
export const FILLED_VARIANTS = {
  primary: {fill: '--color-accent', label: '--color-on-accent'},
  secondary: {fill: '--color-neutral', label: '--color-text-primary'},
  destructive: {fill: '--color-error', label: '--color-on-error'},
} as const;

export type FilledVariant = keyof typeof FILLED_VARIANTS;

export function filledStatePaintVar(
  variant: FilledVariant,
  state: 'hover' | 'pressed',
): string {
  return `--_button-${variant}-${state}`;
}

/** Text on a fill needs 4.5:1 (WCAG 2.2 AA). */
const TEXT_RATIO = 4.5;
/**
 * The smallest change a person sees: the red, green and blue of the fill move
 * by more than this in total. A press moves the fill at least twice as far.
 */
export const VISIBLE_STEP = 24;
const STEPS = {hover: VISIBLE_STEP + 2, pressed: 2 * VISIBLE_STEP + 2};
const MAX_ALPHA = 0.5;

/** How far a colour moves, red, green and blue together, 0 to 765. */
export function colorStep(a: RGBA, b: RGBA): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

const BLACK: RGBA = {r: 0, g: 0, b: 0, a: 1};
const WHITE: RGBA = {r: 255, g: 255, b: 255, a: 1};

/**
 * The paint for one fill and label: the overlay colour and how much of it, or
 * null when no tint both shows and keeps the label readable.
 */
export function statePaintFor(
  fill: RGBA,
  label: RGBA,
  state: 'hover' | 'pressed',
): RGBA | null {
  return paintsAlong(fill, label)[state];
}

/**
 * The smallest tint toward a target that shows and keeps the label readable.
 * It is measured over the fill and over a theme's own hover fill, since a
 * mouse press is also a hover. The change is measured from the fill at rest.
 */
function tintToward(
  target: RGBA,
  unders: RGBA[],
  fill: RGBA,
  label: RGBA,
  floor: number,
  state: 'hover' | 'pressed',
): RGBA | null {
  for (let alpha = 0.02; alpha <= MAX_ALPHA + 1e-9; alpha += 0.01) {
    const paint = {...target, a: Math.round(alpha * 100) / 100};
    const overs = unders.map(under => composite(paint, under));
    if (overs.some(over => colorStep(over, fill) <= STEPS[state])) {
      continue;
    }
    if (overs.some(over => contrastRatio(label, over) + 1e-9 < floor)) {
      return null;
    }
    return paint;
  }
  return null;
}

/**
 * Hover and press go the same way where they can: away from the label when
 * both show that way, else toward it. A state neither way serves takes a
 * strong tint away from the label, which keeps it readable.
 */
function paintsAlong(
  fill: RGBA,
  label: RGBA,
  hoverFill: RGBA = fill,
): Record<'hover' | 'pressed', RGBA | null> {
  const rest = contrastRatio(label, fill);
  // A fill whose label already reads under 4.5:1 must not get worse.
  const floor = Math.min(TEXT_RATIO, rest);
  const away =
    relativeLuminance(label) > relativeLuminance(fill) ? BLACK : WHITE;
  const toward = {...label, a: 1};
  const ways = [away, toward].map(target => ({
    hover: tintToward(target, [hoverFill], fill, label, floor, 'hover'),
    pressed: tintToward(
      target,
      hoverFill === fill ? [fill] : [fill, hoverFill],
      fill,
      label,
      floor,
      'pressed',
    ),
  }));
  const both = ways.find(w => w.hover !== null && w.pressed !== null);
  if (both) {
    return both;
  }
  // Where no tint both shows and keeps the floor, readability wins: the tint
  // away from the label only raises its contrast.
  return {
    hover: ways[0].hover ?? ways[1].hover ?? {...away, a: MAX_ALPHA / 2},
    pressed: ways[0].pressed ?? ways[1].pressed ?? {...away, a: MAX_ALPHA},
  };
}

/**
 * Whether the shared overlay keeps the label at its floor, per state. It is
 * measured over the fill and over a theme's own hover fill, since a mouse
 * press is also a hover.
 */
function sharedOverlayReads(
  resolved: Record<string, string>,
  fill: RGBA,
  label: RGBA,
  hoverFill: RGBA,
): Record<'hover' | 'pressed', boolean> {
  const floor = Math.min(TEXT_RATIO, contrastRatio(label, fill));
  const hover = parseConcreteColor(resolved['--color-overlay-hover']);
  const pressed = parseConcreteColor(resolved['--color-overlay-pressed']);
  const readsOver = (paint: RGBA | null, unders: RGBA[]) =>
    paint === null ||
    unders.every(
      under => contrastRatio(label, composite(paint, under)) + 1e-9 >= floor,
    );
  return {
    hover: readsOver(hover, [hoverFill]),
    pressed: readsOver(pressed, [fill, hoverFill]),
  };
}

function opaque(color: RGBA | null, under: RGBA | null): RGBA | null {
  if (color === null) {
    return null;
  }
  if (color.a >= 1) {
    return color;
  }
  return under === null ? null : composite(color, under);
}

/** Where a theme's own button rule paints a variant's fill or label. */
const RULE_FILL = (variant: string) => `--_button-${variant}-rule-fill`;
const RULE_LABEL = (variant: string) => `--_button-${variant}-rule-label`;
const RULE_HOVER_FILL = (variant: string) =>
  `--_button-${variant}-rule-hover-fill`;

/** Each filled variant's paints in one mode, from the resolved tokens. */
function paintsFor(
  resolved: Record<string, string>,
): Partial<Record<string, RGBA | null>> {
  const page = opaque(
    parseConcreteColor(resolved['--color-background-body']),
    WHITE,
  );
  const out: Partial<Record<string, RGBA | null>> = {};
  for (const [variant, {fill, label}] of Object.entries(FILLED_VARIANTS)) {
    const f = opaque(
      parseConcreteColor(resolved[RULE_FILL(variant)] ?? resolved[fill]),
      page,
    );
    const l = opaque(
      parseConcreteColor(resolved[RULE_LABEL(variant)] ?? resolved[label]),
      f,
    );
    const states = ['hover', 'pressed'] as const;
    if (f === null || l === null) {
      // A colour that cannot be measured keeps the shared overlay.
      for (const state of states) {
        out[filledStatePaintVar(variant as FilledVariant, state)] = null;
      }
      continue;
    }
    const hover = parseConcreteColor(resolved[RULE_HOVER_FILL(variant)]);
    const hoverFill = hover ? composite(hover, f) : f;
    const reads = sharedOverlayReads(resolved, f, l, hoverFill);
    const paints =
      reads.hover && reads.pressed ? null : paintsAlong(f, l, hoverFill);
    for (const state of states) {
      out[filledStatePaintVar(variant as FilledVariant, state)] = reads[state]
        ? null
        : (paints?.[state] ?? null);
    }
  }
  return out;
}

/** A theme's `button` rules, keyed `base` and `variant:<name>`. */
export type ButtonRules = Record<string, Record<string, unknown> | undefined>;

function ruleTokens(rules: ButtonRules | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const variant of Object.keys(FILLED_VARIANTS)) {
    const rule = {...rules?.base, ...rules?.[`variant:${variant}`]};
    const fill = rule.backgroundColor;
    const label = rule.color;
    if (typeof fill === 'string') {
      out[RULE_FILL(variant)] = fill === 'transparent' ? '#00000000' : fill;
    }
    if (typeof label === 'string') {
      out[RULE_LABEL(variant)] = label;
    }
    const hover = (rule[':hover'] as Record<string, unknown> | undefined)
      ?.backgroundColor;
    if (typeof hover === 'string') {
      out[RULE_HOVER_FILL(variant)] = hover;
    }
  }
  return out;
}

/** The tokens a filled variant's paint reads. */
const MEASURED = new Set([
  '--color-background-body',
  '--color-overlay-hover',
  '--color-overlay-pressed',
  '--color-on-dark',
  '--color-on-light',
  ...Object.values(FILLED_VARIANTS).flatMap(({fill, label}) => [fill, label]),
]);

/** Whether a token map writes a colour a filled variant's paint reads. */
export function readsFilledStatePaint(
  tokens: Record<string, unknown>,
): boolean {
  return Object.keys(tokens).some(token => MEASURED.has(token));
}

/**
 * The filled variants' paints for a theme that sets a colour they read, as
 * `[variable, light-dark(...)]` entries, measured on the fill and label the
 * theme's own button rule paints where it sets one. A theme that sets none
 * keeps Core's.
 */
export function deriveFilledStatePaints(
  tokens: Record<string, string>,
  localTokens: Record<string, string> = {},
  buttonRules?: ButtonRules,
): [string, string][] {
  const own = ruleTokens(buttonRules);
  if (!readsFilledStatePaint(tokens) && !Object.keys(own).length) {
    return [];
  }
  return entriesFrom(resolveModes({...localTokens, ...tokens, ...own}));
}

/** Core's own paints, with no theme: what filledStatePaint.stylex.ts holds. */
export function coreFilledStatePaints(): [string, string][] {
  return entriesFrom(resolveModes({}));
}

/**
 * The variables as `light-dark()` values. A state that keeps the shared
 * overlay in a mode holds that mode's overlay value, so the Button that sets
 * its overlay to the variable paints what the page paints.
 */
function entriesFrom(
  resolved: Record<Mode, Record<string, string>>,
): [string, string][] {
  const order = ['light', 'dark'] as Mode[];
  const modes = order.map(mode => paintsFor(resolved[mode]));
  const names = Object.keys(FILLED_VARIANTS).flatMap(variant =>
    (['hover', 'pressed'] as const).map(state =>
      filledStatePaintVar(variant as FilledVariant, state),
    ),
  );
  return names.flatMap(name => {
    const state = name.endsWith('-pressed') ? 'pressed' : 'hover';
    const [light, dark] = modes.map((m, i) => {
      const paint = m[name];
      if (paint) {
        return toHex(paint);
      }
      const shared = parseConcreteColor(
        resolved[order[i]][`--color-overlay-${state}`],
      );
      return shared ? toHex(shared) : `var(--color-overlay-${state})`;
    });
    return [[name, `light-dark(${light}, ${dark})`] as [string, string]];
  });
}
