// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * defineTheme — Create an Astryx theme from a flat token map.
 *
 * Adaptations resolve against the effective root axes and components, retaining
 * authored component pins without repeating root typography defaults.
 *
 * Two distribution modes:
 * - Unbuilt: Theme generates CSS and injects a <style> tag at runtime
 * - Built: `astryx theme build` pre-compiles to a CSS file; Theme just
 *   sets the data-astryx-theme attribute
 *
 * Token values can be:
 * - A string: used as-is for both light and dark modes
 * - A [light, dark] tuple: converted to light-dark(light, dark)
 *
 * @example
 * ```
 * const oceanTheme = defineTheme({
 *   name: 'ocean',
 *   tokens: {
 *     '--color-accent': ['#0077B6', '#48CAE4'],    // [light, dark]
 *     '--color-background-surface': ['#F0F8FF', '#0A1628'],
 *     '--radius-container': '16px',                     // same in both modes
 *   },
 *   icons: oceanIcons,
 * });
 *
 * <Theme theme={oceanTheme}>
 *   <App />
 * </Theme>
 * ```
 *
 * SYNC: `DefineThemeInput` is the theme surface. Adding, removing, or renaming
 * a field means updating:
 * - /packages/cli/assets/theme.template.ts (documents every field; the
 *   drift guard is scripts/check-theme-template.test.mjs)
 * - /packages/cli/assets/docs/theme.doc.mjs (`astryx docs theme`)
 */

import type {ReactNode} from 'react';
import type {IconName, NamespacedIconName} from '../Icon/globalIconRegistry';

/**
 * Icon overrides a theme may declare: any built-in semantic name, plus the
 * namespaced keys components and libraries own (`'richtext:bold'`).
 */
type ThemeIconOverrides = Partial<
  Record<IconName | NamespacedIconName, ReactNode>
>;
import type {IndicatorRegistry} from '../Indicator/types';
import type {TypographyConfig} from './types';
import {
  resolveOnMedia,
  type OnMediaOverrides,
  type ResolvedOnMedia,
} from './onMediaTokens';
import {
  colorDefaults,
  spacingDefaults,
  sizeDefaults,
  borderDefaults,
  focusDefaults,
  radiusDefaults,
  shadowDefaults,
  durationDefaults,
  easeDefaults,
  typographyDefaults,
  textSizeDefaults,
  fontWeightDefaults,
  typeScaleDefaults,
} from './tokens.stylex';
import type {MotionScaleConfig} from './expandMotionScale';
import type {RadiusScaleConfig} from './expandRadiusScale';
import type {ColorScaleConfig} from './expandColorScale';
import {resolveThemeValues, type ThemeValuesInput} from './resolveThemeValues';
import {
  normalizeThemeAdaptations,
  resolveThemeAdaptationRules,
  resolveThemeGenerativeAxes,
  type NormalizedThemeAdaptations,
  type ResolvedThemeAdaptationRule,
  type ThemeAdaptations,
  type ThemeGenerativeAxes,
} from './themeAdaptations';

import type {DomainTokenName} from './domainTokens';
import {domainTokenDefaults} from './domainTokens';
import type {SyntaxThemeDefinition} from './syntax';
import {registerTheme} from './themeRegistry';
import {resolveLocalTokenContract} from './localTokens';

// =============================================================================
// Types
// =============================================================================

/** All valid Astryx core token names */
export type CoreTokenName =
  | keyof typeof colorDefaults
  | keyof typeof spacingDefaults
  | keyof typeof sizeDefaults
  | keyof typeof borderDefaults
  | keyof typeof focusDefaults
  | keyof typeof radiusDefaults
  | keyof typeof shadowDefaults
  | keyof typeof durationDefaults
  | keyof typeof easeDefaults
  | keyof typeof typographyDefaults
  | keyof typeof textSizeDefaults
  | keyof typeof fontWeightDefaults
  | keyof typeof typeScaleDefaults;

/** All valid Astryx token names — core + domain tokens */
export type TokenName = CoreTokenName | DomainTokenName;

/**
 * Token value — either a single string or a [light, dark] tuple.
 * Tuples are converted to CSS light-dark() at theme creation time.
 */
export type TokenValue = string | [light: string, dark: string];

/**
 * CSS property values for a style rule.
 *
 * Keys are camelCase CSS properties with string values, OR pseudo-class
 * selectors (starting with `:`) mapping to nested property objects.
 *
 * Pseudo-class keys generate separate CSS rules with the pseudo appended
 * to the component selector. Supported pseudo-classes include `:hover`,
 * `:focus-visible`, `:active`, `:checked`, `:disabled`, etc.
 *
 * A `:hover` override describes the ENABLED control: it is emitted with a
 * guard that keeps it off disabled and `aria-disabled` elements, which
 * `:hover` would otherwise still match. Style the disabled state through
 * `:disabled` instead.
 *
 * @example
 * ```ts
 * {
 *   borderColor: '#8F9296',
 *   ':hover': { borderColor: 'color-mix(in srgb, #8F9296, black 20%)' },
 *   ':focus-visible': { outline: '2px solid var(--color-accent)' },
 * }
 * ```
 */
export type StyleOverrides = Record<string, string | Record<string, string>>;

/**
 * Component style overrides.
 *
 * Each top-level key is a component name (lowercase). Values are objects
 * mapping style keys to CSS property overrides:
 * - `base` — styles applied to all instances of the component
 * - `prop:value` — styles when a visual prop matches (e.g. `variant:secondary`)
 * - `prop:value+prop:value` — intersection of multiple props
 *
 * The `base` key is optional — omit it to only override specific variants.
 *
 * Style values can include pseudo-class keys (`:hover`, `:focus-visible`, etc.)
 * to override interaction states without CSS custom property escape hatches.
 *
 * @example
 * ```
 * components: {
 *   button: {
 *     base: { fontWeight: '600' },
 *     'variant:secondary': { backgroundColor: 'rgba(0,0,0,0.06)' },
 *     'variant:destructive+size:sm': { padding: '2px 6px' },
 *   },
 *   badge: {
 *     'variant:ghost': { border: '1px solid var(--color-border)' },
 *   },
 *   'radio-indicator': {
 *     base: {
 *       borderColor: '#8F9296',
 *       ':hover': { borderColor: 'color-mix(in srgb, #8F9296, black 20%)' },
 *     },
 *   },
 * }
 * ```
 */
export type ComponentStyleMap = Record<string, Record<string, StyleOverrides>>;

/** Input to defineTheme */
export interface DefineThemeInput {
  /** Theme name — used for data-astryx-theme attribute and identification */
  name: string;

  /**
   * Base theme to extend. When provided, the new theme starts with everything
   * the base resolved to — tokens, component overrides, icons, indicators, and
   * its `onDark`/`onLight` surfaces — then applies this input on top. The base
   * theme's values have lowest precedence.
   *
   * The result is flat: an extended theme carries its inheritance in its own
   * resolved output, so `astryx theme build` emits one self-contained
   * stylesheet and the base's CSS does not need to be loaded alongside it.
   *
   * Use this to create variant themes that customize only a few aspects
   * (e.g. icons, accent color) without re-specifying the full theme.
   *
   * @example
   * ```
   * import {neutralTheme} from '@astryxdesign/theme-neutral';
   *
   * const myTheme = defineTheme({
   *   name: 'my-brand',
   *   extends: neutralTheme,
   *   icons: myIcons,
   *   tokens: { '--color-accent': '#FF0000' },
   * });
   * ```
   */
  extends?: DefinedTheme;
  /**
   * Unified typography configuration — fonts, scale, and weights.
   *
   * Scale controls sizing; roles (body, heading, code) declare
   * fonts, fallbacks, and weights. Heading inherits from body if omitted.
   *
   * Font loading is the consumer's responsibility — add a <link> or
   * @import for your fonts before rendering the theme.
   *
   * @example
   * ```
   * typography: {
   *   scale: { base: 14, ratio: 1.2 },
   *   body: { family: 'Geist', fallbacks: '-apple-system, sans-serif' },
   *   heading: { weight: 'semibold', weights: { 3: 'bold', 4: 'bold' } },
   *   code: { family: 'Geist Mono', fallbacks: '"SF Mono", monospace' },
   * }
   * ```
   */
  typography?: TypographyConfig;
  /**
   * Motion configuration. Computes duration min/max variants from
   * base values and a scaling ratio: min = base × ratio, max = base / ratio.
   *
   * Explicit `tokens` overrides take precedence over motion-generated values.
   *
   * @example
   * ```
   * motion: { fast: 175, medium: 410, slow: 975, ratio: 0.75 }
   *
   * // Suggested starting points:
   * //   Snappy:    { fast: 100, medium: 250, ratio: 0.75 }
   * //   Default:   { fast: 175, medium: 410, slow: 975, ratio: 0.75 }
   * //   Cinematic: { fast: 200, medium: 500, slow: 1200, ratio: 0.7 }
   * ```
   */
  motion?: MotionScaleConfig;
  /**
   * Radius configuration. Generates radius token overrides
   * from a base unit and multiplier.
   *
   * --radius-none and --radius-full are always fixed (never affected by multiplier).
   * --radius-inner through --radius-page = base * step * multiplier.
   *
   * When omitted, themes use the hardcoded defaults (base=4, multiplier=1).
   * Explicit `tokens` overrides take precedence over radius-generated values.
   *
   * @example
   * ```
   * radius: { base: 4, multiplier: 1 }
   *
   * // Sharp/brutalist — all radii become 0
   * radius: { base: 4, multiplier: 0 }
   * ```
   */
  radius?: RadiusScaleConfig;
  /**
   * Color scale configuration. Generates color token overrides from an
   * accent seed using the HCT perceptual color model.
   *
   * Only generates tokens derivable from the accent — status colors,
   * categorical hues, and fixed tokens (on-dark/on-light) use defaults.
   *
   * `accent` accepts a single hex (same seed for both color schemes) or a
   * `[light, dark]` tuple, matching `TokenValue`. With a tuple, the light
   * scheme's full palette derives from the light seed and the dark
   * scheme's from the dark seed.
   *
   * `accent` is optional — omit it for a neutral-only theme, which keeps
   * the default accent tokens and only themes the neutrals.
   *
   * Precedence vs `tokens`: explicit `tokens` entries win over generated
   * values, token by token. Because `--color-accent-muted`,
   * `--color-text-accent` and `--color-icon-accent` are generated as
   * `var(--color-accent)` references, a `tokens['--color-accent']`
   * override re-points them at runtime. `--color-on-accent` does NOT
   * follow: it is baked from the `color.accent` seed (a contrast
   * computation CSS cannot express), so overriding the accent through
   * `tokens` without also overriding `--color-on-accent` leaves the two
   * out of sync. To re-seat the whole palette per scheme, prefer a tuple
   * `color.accent` over the `tokens['--color-accent']` workaround.
   *
   * @example
   * ```
   * color: { accent: '#0064E0', neutralStyle: 'cool', contrast: 'standard' }
   *
   * // Per-scheme accents — light palette from the first seed, dark from the second
   * color: { accent: ['#0064E0', '#48CAE4'] }
   *
   * // Neutral-only — accent tokens stay at their defaults
   * color: { neutralStyle: 'warm' }
   * ```
   */
  color?: ColorScaleConfig;
  /** Token overrides — flat map of CSS custom property names to values.
   *  Values can be a string or [light, dark] tuple.
   *  Only include tokens you want to override; defaults fill the rest. */
  tokens?: Partial<Record<TokenName, TokenValue>>;
  /** Theme-family-local values keyed by any valid CSS custom-property name;
   *  prefixes do not establish ownership. */
  localTokens?: Record<string, TokenValue>;
  /**
   * Component style overrides — keyed by component name (lowercase).
   * Each entry maps style keys to CSS property overrides, scoped under
   * the theme's data-astryx-theme attribute via @scope.
   *
   * Use `prop:value` keys to target specific visual props. New values
   * not in the base type are automatically detected by `astryx theme build`
   * and generate TypeScript module augmentations for type-safe extensibility.
   *
   * @example
   * ```
   * components: {
   *   button: {
   *     base: { fontWeight: '600' },
   *     'variant:secondary': { backgroundColor: '...' },
   *     'variant:primary-muted': { backgroundColor: '#ECF5FF' }, // new — generates augmentation
   *   },
   *   banner: {
   *     'status:neutral': { backgroundColor: 'var(--color-background-muted)' }, // new status
   *   },
   * }
   * ```
   */
  components?: ComponentStyleMap;
  /** Icon registry — maps semantic icon names to React nodes */
  icons?: ThemeIconOverrides;
  /**
   * Indicator overrides — replaces the components that draw stateful control
   * visuals with the theme's own, by name.
   *
   * Replacement is by indicator name, not per call site, so a single entry
   * reaches every component that draws that indicator: mapping `check` to
   * `RadioIndicator` gives radio visuals to every single-selection mark in the
   * app.
   *
   * Each entry is checked against its indicator's family, so a replacement
   * must accept the states that family passes.
   */
  indicators?: IndicatorRegistry;
  /**
   * Default syntax highlighting theme for code components.
   * Sets --color-syntax-* tokens at the theme root. Can be overridden
   * per-region (or per-instance) by wrapping in SyntaxTheme.
   *
   * @example
   * ```
   * import {dracula} from '@astryxdesign/core/theme/syntax';
   * defineTheme({ name: 'my-theme', syntax: dracula, ... })
   * ```
   */
  syntax?: SyntaxThemeDefinition;
  /**
   * Overrides for content on a dark surface (e.g. inverted toast,
   * dark tooltip). Accepts token and component overrides — same shape
   * as the main theme. Token defaults are generated if omitted.
   *
   * Used by `<MediaTheme surface="dark">` to set semantic tokens
   * and component styles so children render correctly against a dark
   * background.
   *
   * @example
   * ```
   * onDark: {
   *   tokens: { '--color-accent': '#90CAF9' },
   *   components: {
   *     button: { 'variant:ghost': { borderWidth: '1px' } },
   *   },
   * }
   * ```
   */
  onDark?: OnMediaOverrides;
  /**
   * Overrides for content on a light surface. Same shape as `onDark`
   * but for the inverse case (e.g. dark-mode page with a light popover).
   */
  onLight?: OnMediaOverrides;
  /**
   * Ordered environment-conditioned token and component adaptations.
   *
   * Width points use the fixed names `sm`, `md`, `lg`, `xl`, and `2xl` and
   * default to 640, 768, 1024, 1280, and 1536 CSS pixels. Breakpoint
   * configuration alone emits no CSS. Rules are emitted in declaration order;
   * fields inside `when` are ANDed and later matching writes win.
   *
   * @example
   * ```
   * adaptations: {
   *   widthBreakpoints: {lg: 1024, xl: 1280},
   *   rules: [
   *     {
   *       when: {
   *         width: {from: 'lg', below: 'xl'},
   *         pointer: 'coarse',
   *       },
   *       value: {
   *         tokens: {'--size-element-md': '44px'},
   *       },
   *     },
   *   ],
   * }
   * ```
   */
  adaptations?: ThemeAdaptations;
}

/** A defined theme — ready to pass to <Theme> */
export interface DefinedTheme {
  /** Theme name */
  name: string;
  /** Token overrides — only the tokens the consumer specified */
  tokens: Record<string, string>;
  /** Resolved theme-family-local token declarations. */
  localTokens?: Record<string, string>;
  /** Component style overrides */
  components?: ComponentStyleMap;
  /** Icon registry */
  icons?: ThemeIconOverrides;
  /** Indicator overrides for stateful control visuals, keyed by name */
  indicators?: IndicatorRegistry;
  /** Whether this theme has been pre-compiled by theme build CLI */
  __built?: true;
  /**
   * Raw input tokens preserved from defineTheme() input.
   * Keeps [light, dark] tuples intact for programmatic access
   * (e.g. data viz, canvas rendering) without parsing light-dark() strings.
   * @internal
   */
  __inputTokens?: Partial<Record<string, TokenValue>>;
  /** Exact owner theme for every inherited local-token declaration. @internal */
  __localTokenOwners?: Record<string, string>;
  /** Exact enrolled theme lineage; presence marks this theme as enrolled. @internal */
  __localTokenLineage?: string[];
  /**
   * Resolved on-media token overrides for dark surfaces.
   * Generated by defineTheme from defaults + user onDark overrides.
   * Used by MediaTheme and generateThemeRules.
   * @internal
   */
  __onDark?: ResolvedOnMedia;
  /**
   * Resolved on-media overrides for light surfaces.
   * @internal
   */
  __onLight?: ResolvedOnMedia;
  /**
   * Effective breakpoint map and ordered normalized rule inputs retained for
   * source-equivalent extension, including from a built theme.
   * @internal
   */
  __adaptations?: NormalizedThemeAdaptations;
  /** Concrete ordered rule writes used by the runtime CSS compiler. @internal */
  __adaptationRules?: ResolvedThemeAdaptationRule[];
  /** Effective root generative-axis metadata used to resolve child rules. @internal */
  __axes?: ThemeGenerativeAxes;
}

/** A theme produced by the current defineTheme implementation. */
export type ResolvedDefinedTheme = DefinedTheme & {
  __adaptations: NormalizedThemeAdaptations;
  __axes: ThemeGenerativeAxes;
};

// =============================================================================
// All defaults merged into a single flat map
// =============================================================================

/** All Astryx token defaults as a flat map. Useful for resolving full token sets. */
export const tokenDefaults: Record<string, string> = {
  ...colorDefaults,
  ...spacingDefaults,
  ...sizeDefaults,
  ...borderDefaults,
  ...focusDefaults,
  ...radiusDefaults,
  ...shadowDefaults,
  ...durationDefaults,
  ...easeDefaults,
  ...typographyDefaults,
  ...textSizeDefaults,
  ...fontWeightDefaults,
  ...typeScaleDefaults,
  ...domainTokenDefaults,
};

// =============================================================================
// defineTheme
// =============================================================================

/**
 * Describe a rejected `extends` value for the error message — enough to tell a
 * missed import (`undefined`) from a module namespace or a plain object.
 */
function describeBadBase(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return typeof value;
  }
  const keys = Object.keys(value);
  return `an object with keys [${keys.slice(0, 4).join(', ')}${keys.length > 4 ? ', …' : ''}]`;
}

/**
 * Create an Astryx theme.
 *
 * Pass only the tokens you want to override — everything else
 * inherits from the Astryx defaults.
 *
 * When `typography.scale` is provided, it generates typography token overrides
 * that are merged into the token map. Explicit `tokens` entries take
 * precedence over generated values.
 */
export function defineTheme(input: DefineThemeInput): ResolvedDefinedTheme {
  // Pre-seed from the base theme when `extends` is provided (lowest precedence).
  // A base that is not a theme is refused rather than ignored: `extends` used
  // to inherit nothing when its value was undefined, which is what a named
  // import silently resolving to the wrong module hands over, and the theme
  // then built into a plausible-looking stylesheet missing everything it was
  // supposed to inherit.
  if ('extends' in input && !isDefinedTheme(input.extends)) {
    throw new Error(
      `defineTheme("${input.name}"): \`extends\` must be a theme from defineTheme(), got ${describeBadBase(input.extends)}. ` +
        `Check that the import naming your base theme resolves to its source and exports that name — ` +
        `a generated \`<theme>.js\` artifact sitting next to the source exports \`<name>Theme\`, not the source's own export.`,
    );
  }
  const base = input.extends;

  // The theme's own value axes and the resolved base an `extends` supplies.
  // The same axis metadata is retained so adaptation rules can complete partial
  // configs without approximating values from unrelated built-in defaults.
  const ownValues: ThemeValuesInput = {
    typography: input.typography,
    color: input.color,
    radius: input.radius,
    motion: input.motion,
    syntax: input.syntax,
    tokens: input.tokens,
    components: input.components,
  };
  const ownAxes: ThemeGenerativeAxes = {
    typography: input.typography,
    color: input.color,
    radius: input.radius,
    motion: input.motion,
  };
  const seed = base
    ? {tokens: base.tokens, components: base.components}
    : undefined;

  const {tokens, components} = resolveThemeValues(ownValues, seed);

  // On-media token overrides (base's resolved surface, then defaults, then
  // this theme's own overrides). They compile after adaptations so the
  // media-surface value stays more specific in the authored cascade.
  const __onDark = resolveOnMedia('dark', input.onDark, base?.__onDark);
  const __onLight = resolveOnMedia('light', input.onLight, base?.__onLight);

  const localTokenContract = resolveLocalTokenContract(
    input,
    base,
    tokens,
    tokenDefaults,
  );

  // Adaptations inherit their breakpoint map and ordered rules. Every rule is
  // re-resolved against this theme's effective root axes, so a child can change
  // the root scale while preserving the base rule's authored intent.
  const __axes = resolveThemeGenerativeAxes(base?.__axes, ownAxes);
  const __adaptations = normalizeThemeAdaptations(
    input.name,
    base?.__adaptations,
    input.adaptations,
  );
  const __adaptationRules = resolveThemeAdaptationRules(
    input.name,
    __adaptations,
    __axes,
    tokens,
    localTokenContract?.localTokens,
    components,
  );

  // Icons — input icons override base icons
  const icons =
    input.icons && base?.icons
      ? {...base.icons, ...input.icons}
      : (input.icons ?? base?.icons);

  // Indicator overrides merge by name, like icons: a child theme replacing one
  // indicator keeps the ones its base replaced.
  const indicators =
    input.indicators && base?.indicators
      ? {...base.indicators, ...input.indicators}
      : (input.indicators ?? base?.indicators);

  const theme: ResolvedDefinedTheme = {
    name: input.name,
    tokens,
    ...(localTokenContract
      ? {
          localTokens: localTokenContract.localTokens,
          __localTokenOwners: localTokenContract.owners,
          __localTokenLineage: localTokenContract.lineage,
        }
      : {}),
    components,
    icons,
    indicators,
    __inputTokens:
      base?.__inputTokens || input.tokens
        ? {...base?.__inputTokens, ...input.tokens}
        : undefined,
    __onDark,
    __onLight,
    __adaptations,
    __adaptationRules,
    __axes,
  };

  registerTheme(theme);
  return theme;
}

// =============================================================================
// CSS generation — re-exported from ./generateThemeRules.ts
// =============================================================================

export {
  generateThemeRules,
  generateThemeRulesSplit,
  generateOnMediaCSS,
  generateAdaptationCSS,
  generateThemeCSS,
  type ThemeRulesSplit,
  type ThemeCSSOutput,
} from './generateThemeRules';

// =============================================================================
// Type guard
// =============================================================================

/** Check if a theme object was created with defineTheme */
export function isDefinedTheme(theme: unknown): theme is DefinedTheme {
  return (
    typeof theme === 'object' &&
    theme !== null &&
    'name' in theme &&
    'tokens' in theme &&
    !('styles' in theme)
  );
}
