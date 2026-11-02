// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeMotion.ts
 * @input A theme's motion configuration: the knobs (`tempo`, `character`),
 *   the existing `MotionScaleConfig`, or both
 * @output The resolved knobs, the motion tokens they generate, and
 *   `resolveThemeMotion`, the internal resolver the animator and server code
 *   read (`spec:AST-108` FR1, FR2, FR5, FR6)
 * @position Theme utility; consumed by resolveThemeValues.ts. Pure: no DOM,
 *   no import-time work, safe on the server.
 *
 * `tempo` scales every motion duration token, clamped to 0.75–1.5.
 * `character` picks the entrance and move curves. Every theme follows each
 * person's Reduce Motion setting (`reducedMotion` resolves to `'system'`).
 * No spring reads the knobs yet. With the defaults (tempo 1, `'standard'`, `'system'`) every token is
 * today's.
 *
 * A `MotionScaleConfig` keeps generating its duration tokens, and its fields
 * win over `tempo` (FR5); explicit `tokens` win over both in
 * resolveThemeValues.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/theme/themeMotion.test.ts
 * - /packages/core/src/theme/resolveThemeValues.ts
 * - /packages/core/src/theme/defineTheme.ts (the `motion` field's docs)
 */

import {expandMotionScale, type MotionScaleConfig} from './expandMotionScale';
import {
  resolveKnobs,
  type MotionCharacter,
  type ResolvedMotionKnobs,
  type ThemeMotionKnobs,
} from './motionKnobs';
import {durationDefaults, easeDefaults} from './tokens.stylex';
import {resolveTokenReferences} from './tokenReferences';

export {
  TEMPO_RANGE,
  type MotionCharacter,
  type ResolvedMotionKnobs,
  type ThemeMotionKnobs,
  type ThemeReducedMotion,
} from './motionKnobs';

/**
 * A theme's `motion`: the knobs, the existing `MotionScaleConfig`, or both.
 * A `MotionScaleConfig`'s fields win over `tempo` for the durations they set.
 */
export type ThemeMotionConfig =
  ThemeMotionKnobs | (MotionScaleConfig & ThemeMotionKnobs);

/**
 * The entrance and move curve at each character. `'standard'` is the theme's
 * `--ease-standard`, so a theme that overrides that easing keeps its entrances
 * on it.
 */
export const CHARACTER_EASE = {
  crisp: 'cubic-bezier(0, 0, 0.2, 1)',
  standard: null,
  expressive: 'cubic-bezier(0.3, 1.2, 0.5, 1)',
} as const satisfies Record<MotionCharacter, string | null>;

/** The knobs of `config`, defaults filled in, `tempo` clamped. */
export function resolveMotionKnobs(
  config: ThemeMotionConfig | undefined,
): ResolvedMotionKnobs {
  return resolveKnobs(config);
}

function isScaleConfig(
  config: ThemeMotionConfig,
): config is MotionScaleConfig & ThemeMotionKnobs {
  return 'fast' in config && 'medium' in config && 'ratio' in config;
}

/** A duration token's value in ms (`'175ms'` → 175). */
function msOf(value: string): number {
  return Number.parseFloat(value);
}

/**
 * The private custom property a theme with a `tempo` writes beside its
 * duration tokens: the press release fade (`utils/interactionOverlay.stylex.ts`)
 * multiplies its clock by it.
 */
export const MOTION_TEMPO_PROPERTY = '--_astryx-motion-tempo';

/** The duration tokens at `tempo`: today's values times it, to the ms. */
export function durationTokensAt(tempo: number): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [name, value] of Object.entries(durationDefaults)) {
    tokens[name] = `${Math.round(msOf(value) * tempo)}ms`;
  }
  return tokens;
}

/**
 * The private custom property holding a duration token's value before
 * `tempo` scaled it (`--duration-slow` → `--_astryx-pre-tempo-duration-slow`).
 * Busy loops (Spinner, Skeleton) read it, falling back to the token, so their
 * timing follows a duration scale or an explicit token but never `tempo`
 * (FR4). Private, like every property the knobs add beside the core tokens
 * (`architecture:theme-tokens` INV1).
 */
export function preTempoName(token: string): string {
  return token.replace(/^--duration-/, '--_astryx-pre-tempo-duration-');
}

/**
 * The motion tokens `config` generates (FR2, FR5): `--duration-*` times
 * `tempo`, with a `MotionScaleConfig`'s own durations winning, and the
 * job-named `--ease-entrance` and `--ease-move` at the theme's character.
 * A knob the config leaves out writes nothing, so a theme extending another
 * keeps the base's value for it; a knob it sets is written even at its
 * default, so a child can set a base's tempo back to 1.
 */
export function expandThemeMotion(
  config: ThemeMotionConfig,
): Record<string, string> {
  const knobs = resolveMotionKnobs(config);
  const tokens: Record<string, string> = {};
  if (knobs.tempoIsSet) {
    Object.assign(tokens, durationTokensAt(knobs.tempo));
    for (const [name, value] of Object.entries(durationDefaults)) {
      tokens[preTempoName(name)] = value;
    }
    // The press release fade, a fixed clock in the stylesheet, scales by the
    // tempo itself (FR4; `component:Button` FR15), read where it plays.
    tokens[MOTION_TEMPO_PROPERTY] = String(knobs.tempo);
  }
  if (isScaleConfig(config)) {
    const scale = expandMotionScale(config);
    Object.assign(tokens, scale);
    if (knobs.tempoIsSet) {
      for (const [name, value] of Object.entries(scale)) {
        if (name.startsWith('--duration-')) {
          tokens[preTempoName(name)] = value;
        }
      }
    }
  }
  const scaleEasing =
    isScaleConfig(config) && config.easing != null ? config.easing : null;
  const ease =
    CHARACTER_EASE[knobs.character] ??
    (config.character != null
      ? (scaleEasing ?? easeDefaults['--ease-standard'])
      : scaleEasing);
  if (ease != null) {
    tokens['--ease-entrance'] = ease;
    tokens['--ease-move'] = ease;
  }
  return tokens;
}

/** What `resolveThemeMotion` returns for a theme. */
export interface ThemeMotion {
  /** The knobs, defaults filled in. */
  readonly knobs: ResolvedMotionKnobs;
  /** Every `--duration-*` token's value. */
  readonly durations: Readonly<Record<string, string>>;
  /** `--ease-standard`, `--ease-entrance` and `--ease-move`. */
  readonly easings: Readonly<Record<string, string>>;
}

/**
 * A theme's motion values, for the animator and for server code (FR6): the
 * knobs, and the duration and easing tokens they resolve to with the theme's
 * explicit tokens applied. A token written as a reference (`var(--name)`)
 * resolves through the theme's tokens, as `resolveThemeTokens` resolves it
 * (`architecture:theme-tokens` INV6). Pure: it reads only `theme`.
 */
export function resolveThemeMotion(theme: {
  readonly motion?: ThemeMotionConfig;
  readonly __axes?: {readonly motion?: ThemeMotionConfig};
  readonly tokens?: Readonly<Record<string, unknown>>;
  readonly localTokens?: Readonly<Record<string, unknown>>;
}): ThemeMotion {
  // A defined theme's motion is its axes': its own merged with its base's.
  const config = theme.__axes?.motion ?? theme.motion;
  const knobs = resolveMotionKnobs(config);
  const generated = config ? expandThemeMotion(config) : {};
  // The graph the references resolve through: the defaults, the knobs'
  // tokens, then the theme's own (a light/dark pair is not a motion value, so
  // only plain strings take part).
  const graph: Record<string, string> = {
    ...durationDefaults,
    ...easeDefaults,
    ...generated,
  };
  for (const tokens of [theme.localTokens, theme.tokens]) {
    for (const [name, value] of Object.entries(tokens ?? {})) {
      if (typeof value === 'string') {
        graph[name] = value;
      }
    }
  }
  const explicit = (name: string): boolean =>
    typeof theme.tokens?.[name] === 'string' || name in generated;
  const resolved = resolveTokenReferences(graph);
  const durations: Record<string, string> = {};
  for (const name of Object.keys(durationDefaults)) {
    durations[name] = resolved[name];
  }
  const standard = resolved['--ease-standard'];
  return {
    knobs,
    durations,
    easings: {
      '--ease-standard': standard,
      '--ease-entrance': explicit('--ease-entrance')
        ? resolved['--ease-entrance']
        : standard,
      '--ease-move': explicit('--ease-move')
        ? resolved['--ease-move']
        : standard,
    },
  };
}
