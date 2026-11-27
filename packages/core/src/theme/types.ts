// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Astryx Type Definitions
 *
 * Shared types used across Astryx components.
 */

// =============================================================================
// Typography config types
// =============================================================================

/**
 * Named font weight — maps to var(--font-weight-*) at the token layer.
 * Raw CSS values (e.g. '800') are accepted as an escape hatch.
 */
export type FontWeight =
  'normal' | 'medium' | 'semibold' | 'bold' | (string & {});

/**
 * A typography role declaration (body, heading, or code).
 *
 * Fonts must be loaded by the consumer (e.g. via a <link> tag in <head>
 * or an @import in CSS). Astryx does not handle font loading — it only
 * sets the font-family token so the font is used once available.
 *
 * @example
 * ```
 * body: {
 *   family: 'Geist',
 *   fallbacks: '"Geist Fallback", -apple-system, sans-serif',
 *   weight: 'normal',
 * }
 * ```
 */
export interface TypographyRole {
  /** Primary font name — must be loaded by the consumer (e.g. Google Fonts link tag) */
  family?: string;
  /** CSS fallback font stack (appended after family in the computed --font-* token) */
  fallbacks?: string;
  /** Default font weight for this role */
  weight?: FontWeight;
  /** Per-level weight overrides (heading only: keys are heading levels 1–6) */
  weights?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, FontWeight>>;
}

/**
 * Unified typography configuration.
 *
 * - `scale` controls the geometric type scale (base size + ratio)
 * - `body`, `heading`, `code` declare fonts, fallbacks, weights per role
 * - a heading with no `family` takes the body's whole font list; with its
 *   own `family`, only its own `fallbacks`; `fallbacks` with no `family`
 *   build nothing
 *
 * Font loading is the consumer's responsibility. Add a <link> or @import
 * for your fonts before rendering the theme.
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
export interface TypographyConfig {
  /** Type scale: generates text size tokens from base + ratio */
  scale?: {base: number; ratio: number};
  /** Body text font configuration */
  body?: TypographyRole;
  /**
   * Heading font configuration. With no `family`, the heading takes the
   * body's whole font list; with its own `family`, only its own
   * `fallbacks`.
   */
  heading?: TypographyRole;
  /** Code/monospace font configuration */
  code?: TypographyRole;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StyleXStyles = any;

/**
 * Theme mode. `system` takes the page's light or dark scheme: the reader's
 * preference, unless the page or its host sets the root's scheme.
 */
export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * Heading element tags (h1–h6). Distinct from the Heading component's numeric
 * `HeadingLevel` (1–6) — this is the HTML tag form used by prose theming.
 */
export type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/**
 * Built-in semantic text types for Text.
 */
export type BuiltinTextType =
  | 'body'
  | 'large'
  | 'label'
  | 'supporting'
  | 'code'
  | 'display-1'
  | 'display-2'
  | 'display-3'
  | 'inherit';

/**
 * Semantic text types for Text.
 *
 * Themes can define custom text types via component overrides in defineTheme.
 * Custom types render with `body` baseline styles and receive their visual
 * treatment from theme CSS (`.astryx-text.<custom-type> { ... }`).
 *
 * To add type-safe custom types, use module augmentation:
 * ```ts
 * declare module '@astryxdesign/core/theme' {
 *   interface CustomTextTypes {
 *     hero: true;
 *     caption: true;
 *   }
 * }
 * ```
 *
 * `astryx theme build` generates these augmentations automatically when it
 * detects new `type:*` values in a theme's component overrides.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CustomTextTypes {}

export type TextType = BuiltinTextType | (keyof CustomTextTypes & string);

/**
 * Text size scale for Text size prop override
 * Maps to --text-* tokens
 */
export type TextSize =
  | '4xs'
  | '3xs'
  | '2xs'
  | 'xsm'
  | 'sm'
  | 'base'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl';

/**
 * Font weight variants for Text/Heading
 */
import type {TextColorMap} from '../Text';

export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold';

/**
 * Built-in text color variants for Text/Heading. The concrete keys that ship
 * with the design system, independent of theme augmentation — used where a
 * value must be one of the real StyleX color styles (see `resolveStyleColor`).
 */
export type BuiltinTextColor =
  'primary' | 'secondary' | 'disabled' | 'placeholder' | 'accent' | 'inherit';

/**
 * Text color variants for Text/Heading. Extensible via module augmentation of
 * `TextColorMap`.
 */
export type TextColor = keyof TextColorMap;

/**
 * Display mode for Text/Heading
 */
export type TextDisplay = 'inline' | 'block';

/**
 * Word break behavior for truncated text
 */
export type WordBreak = 'break-word' | 'break-all';

/**
 * Text wrap behavior
 */
export type TextWrap = 'wrap' | 'nowrap' | 'balance' | 'pretty';

/**
 * Text alignment (justification). Uses logical properties (start/end)
 * for i18n/RTL compatibility.
 */
export type TextJustify = 'start' | 'center' | 'end';

/**
 * Allowed CSS properties for Text/Heading xstyle prop.
 * Constrained to layout-only properties to prevent typography escapes.
 */
export type TextXStyleAllowed = {
  // Index signature required for StyleXStyles compatibility
  [key: string]: unknown;

  // Margins
  margin?: unknown;
  marginTop?: unknown;
  marginBottom?: unknown;
  marginStart?: unknown;
  marginEnd?: unknown;
  marginBlock?: unknown;
  marginBlockStart?: unknown;
  marginBlockEnd?: unknown;
  marginInline?: unknown;
  marginInlineStart?: unknown;
  marginInlineEnd?: unknown;

  // Width constraints
  width?: unknown;
  minWidth?: unknown;
  maxWidth?: unknown;

  // Flex child properties
  alignSelf?: unknown;
  flexBasis?: unknown;
  flexGrow?: unknown;
  flexShrink?: unknown;

  // Text layout (non-typography)
  textAlign?: unknown;
  textAlignLast?: unknown;
  verticalAlign?: unknown;
};

/**
 * Prose element types for typography CSS
 */
export type ProseElement =
  | 'p'
  | 'ul'
  | 'ol'
  | 'li'
  | 'liLast'
  | 'blockquote'
  | 'code'
  | 'pre'
  | 'preCode'
  | 'hr'
  | 'strong'
  | 'em'
  | 'a'
  | 'aHover'
  | 'firstChild'
  | 'lastChild';
