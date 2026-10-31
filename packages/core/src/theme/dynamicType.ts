// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file dynamicType.ts
 * @input The UIKit point sizes per text style (uikitTypography.ts), the raw
 *   font-size tokens (tokens.stylex.ts)
 * @output The reader's text size categories, the category a measured Body
 *   size names, each raw font-size step's UIKit curve and scale, the rule that
 *   gives a category its scales, the scaled raw font-size declarations every
 *   theme emits and the semantic sizes it fixes, and the root Theme's text
 *   size sync
 * @position Theme utility; read by generateThemeRules.ts (every theme's font
 *   sizes, as it writes them) and Theme.tsx (the root provider keeps the
 *   scales current)
 *
 * On iOS the reader picks a text size in Settings (Display & Text Size, then
 * Larger Text), and every UIKit text style follows it on its own curve. Mobile
 * Safari reveals the choice only through the `font: -apple-system-*` keywords:
 * the root font size stays 16px, and Astryx never changes it
 * (design:mobile-typography DR4).
 *
 * So the root Theme measures `font: -apple-system-body` in a hidden, empty
 * probe, names the category from Body's size (each category has its own), and
 * gives the page that category's scales in a stylesheet the document adopts;
 * it rereads when the probe resizes, so a change made while the page is open
 * applies at once, as Safari restyles its own keywords. Every theme, branded
 * included, writes each raw font-size step as its own value times the scale
 * of the UIKit text style that step plays (UIKit's own rule for custom fonts,
 * `UIFontMetrics`), and a semantic size it fixes at a length times the scale
 * of the step it reads by default (spec:AST-102 FR3); the root stylesheet
 * does the same for the core defaults, below every theme. A scale nobody
 * wrote is 1, as is every scale at Large, the default category, so a reader
 * who has not set a size, and every other browser, sees exactly the theme's
 * sizes; only sizes move: the family, spacing, radius and the root stay where
 * the theme put them. No theme option, prop or document attribute carries any
 * of it (DEC-3).
 *
 * The gate is the capability alone: the engine provides
 * `font: -apple-system-body`, as every browser on iPhone and iPad does. There
 * is no platform, touch-callout or pointer check, since touch behavior is one
 * on every touch device and this is a style the engine itself provides.
 * macOS Safari knows the keyword too, but its Body is a fixed 13px that names
 * no category, so nothing scales there; other engines do not know it.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/theme/dynamicType.test.ts
 * - /packages/core/src/theme/generateThemeRules.ts (generateDynamicTypeCSS)
 */

import {typography} from './uikitTypography';
import {dataAttr} from '../naming';
import {textSizeDefaults, typeScaleDefaults} from './tokens.stylex';

// =============================================================================
// Categories
// =============================================================================

/**
 * The reader's text size categories, smallest to largest, in the order of the
 * UIKit typography table: the seven standard sizes, then the five
 * accessibility sizes Larger Accessibility Sizes unlocks. `l` (Large) is the
 * default.
 */
export const TEXT_SIZE_CATEGORIES = [
  'xs',
  's',
  'm',
  'l',
  'xl',
  'xxl',
  'xxxl',
  'ax1',
  'ax2',
  'ax3',
  'ax4',
  'ax5',
] as const;

/** One of the reader's text size categories. */
export type TextSizeCategory = (typeof TEXT_SIZE_CATEGORIES)[number];

/** Index of Large, the default category, in every table row. */
const LARGE = 3;

/**
 * The category whose Body size this is, or null when no category has it (a
 * size Safari does not produce, so nothing can be inferred from it). Body has
 * a distinct size in every category, so it names the category alone.
 */
export function textSizeCategoryForBodySize(
  px: number,
): TextSizeCategory | null {
  return TEXT_SIZE_CATEGORIES[columnForBodySize(px)] ?? null;
}

/** The table column whose Body size this is, or -1. */
function columnForBodySize(px: number): number {
  return typography.body.findIndex(size => Math.abs(size - px) < 0.5);
}

// =============================================================================
// Curves
// =============================================================================

/** A UIKit text style the theme's sizes can scale on. */
export type DynamicTypeStyle = keyof typeof typography;

/** A raw font-size token. */
export type FontSizeToken = keyof typeof textSizeDefaults;

/**
 * The UIKit text style each raw font-size step scales like. A step follows
 * the style of the roles built on it: the base step carries body, label, code
 * and heading 4 (Body); one step up, heading 3 and large text (Title 3); then
 * heading 2 (Title 2), heading 1 and display 3 (Title 1), display 2 and 1
 * (Large Title); one step down, supporting text and heading 5 (Footnote,
 * supporting text being the common one); heading 6 (Caption 1); the sub-scale
 * steps (Caption 2).
 */
export const FONT_SIZE_STEP_STYLES = {
  '--font-size-4xs': 'caption2',
  '--font-size-3xs': 'caption2',
  '--font-size-2xs': 'caption2',
  '--font-size-xs': 'caption1',
  '--font-size-sm': 'footnote',
  '--font-size-base': 'body',
  '--font-size-lg': 'title3',
  '--font-size-xl': 'title2',
  '--font-size-2xl': 'title1',
  '--font-size-3xl': 'title1',
  '--font-size-4xl': 'largeTitle',
  '--font-size-5xl': 'largeTitle',
} as const satisfies Record<FontSizeToken, DynamicTypeStyle>;

/** How much `style` grows (or shrinks) at `category`, relative to Large. */
export function dynamicTypeScale(
  style: DynamicTypeStyle,
  category: TextSizeCategory,
): number {
  const row = typography[style];
  return row[TEXT_SIZE_CATEGORIES.indexOf(category)] / row[LARGE];
}

/** The custom property carrying `style`'s scale, set per category on `<html>`. */
export function dynamicTypeScaleProperty(style: DynamicTypeStyle): string {
  return `--_dynamic-type-${style.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`;
}

/** The styles some step scales on, in table order. */
const SCALED_STYLES = (Object.keys(typography) as DynamicTypeStyle[]).filter(
  style => Object.values(FONT_SIZE_STEP_STYLES).includes(style as never),
);

// =============================================================================
// CSS
// =============================================================================

/** A scale written to four decimals, without trailing zeros. */
function formatScale(scale: number): string {
  return String(Number(scale.toFixed(4)));
}

/**
 * The rule that gives the page a category's scales, for the root Theme's
 * stylesheet: one custom property per scaled style on `:root`. Large, and a
 * size that names no category, need none: every scaled declaration falls back
 * to 1.
 */
export function dynamicTypeScaleRule(
  category: TextSizeCategory | null,
): string {
  return scaleRuleForColumn(
    category === null ? -1 : TEXT_SIZE_CATEGORIES.indexOf(category),
  );
}

/**
 * The rule for one table column; none at Large or for -1. Besides the scales,
 * it gives the core default steps their scaled form in the base layer, below
 * every theme, so a page or a theme that sets no type scale follows too.
 */
function scaleRuleForColumn(column: number): string {
  if (column < 0 || column === LARGE) {
    return '';
  }
  const declarations = (entries: [string, string][]) =>
    entries.map(([name, value]) => `  ${name}: ${value};`).join('\n');
  return `@layer astryx-base {\n:root {\n${declarations(scaledFontSizeEntries(textSizeDefaults))}\n}\n}\n:root {\n${declarations(
    SCALED_STYLES.map(style => [
      dynamicTypeScaleProperty(style),
      formatScale(typography[style][column] / typography[style][LARGE]),
    ]),
  )}\n}`;
}

/**
 * The private custom property holding a step's scaled size
 * (`--_scaled-font-size-base`). Only this module writes it, and only from a
 * fixed length, so the cap that reads the next step's can never read back a
 * variable a theme wrote: a theme that sets `--font-size-lg` to
 * `var(--font-size-base)`, at its root or in any adaptation rule, closes no
 * reference cycle.
 */
export function scaledStepProperty(step: FontSizeToken): string {
  return `--_scaled-${step.slice(2)}`;
}

/**
 * The raw font-size writes a theme scales: for each step among `tokens` set
 * to a fixed length (`isFixedSize`), its private scaled size (the value times
 * its curve's scale, 1 when no category is set) and the step itself reading
 * it, as `[token, value]` pairs. A step written as a variable or relative to
 * its parent is left as written: it follows what it reads, so it never scales
 * twice. The caller emits them through its declaration checks.
 *
 * A step never outgrows the step above it. UIKit's curves differ: above
 * Large its smaller styles grow faster than its larger ones (a theme whose
 * ramp is tighter than UIKit's would see heading 2 pass heading 1 at the
 * largest accessibility sizes), and below Large Body shrinks faster than
 * Footnote (supporting text could pass body text). So each step is capped at
 * the next step's scaled size. When the theme's own step is no larger than
 * its next one, as in every ramp `typography.scale` generates, that cap is
 * the theme's own size at Large and binds at every other category; for a
 * ramp that is out of order, or a next step this block does not set (it
 * keeps the scaled size it inherits), the cap never goes below the step's own
 * size, so the theme's sizes at Large stay exactly its own. A next step the
 * block writes as a variable caps nothing: the theme tied it to what it reads.
 */
export function scaledFontSizeEntries(
  tokens: Record<string, string>,
): [string, string][] {
  const steps = Object.keys(FONT_SIZE_STEP_STYLES) as FontSizeToken[];
  const fixedValue = (name: FontSizeToken | undefined) => {
    const [value, important] = splitImportant((name && tokens[name]) || '');
    return isFixedSize(value) ? {value, important} : null;
  };
  return steps.flatMap((name, index): [string, string][] => {
    const own = fixedValue(name);
    if (own === null) {
      return [];
    }
    const {value, important} = own;
    const scaled = `calc(${value} * var(${dynamicTypeScaleProperty(FONT_SIZE_STEP_STYLES[name])}, 1))`;
    const next = steps[index + 1];
    const nextOwn = fixedValue(next);
    let expression = scaled;
    if (next !== undefined && (tokens[next] === undefined || nextOwn)) {
      const ownPx = lengthInPx(value);
      const nextPx = nextOwn && lengthInPx(nextOwn.value);
      expression =
        ownPx !== null && nextPx != null && ownPx <= nextPx
          ? `min(${scaled}, var(${scaledStepProperty(next)}))`
          : `min(${scaled}, max(var(${scaledStepProperty(next)}, ${value}), ${value}))`;
    }
    return [
      [scaledStepProperty(name), expression],
      [name, `var(${scaledStepProperty(name)})${important}`],
    ];
  });
}

/**
 * The raw step each semantic font size reads in the core defaults
 * (`--text-supporting-size` reads `--font-size-sm`), in their order.
 */
const TEXT_SIZE_STEPS = Object.entries(typeScaleDefaults).flatMap(
  ([name, value]): [string, FontSizeToken][] => {
    const step = /^var\((--font-size-[a-z0-9]+)\)$/.exec(value)?.[1];
    return name.endsWith('-size') &&
      step !== undefined &&
      step in FONT_SIZE_STEP_STYLES
      ? [[name, step as FontSizeToken]]
      : [];
  },
);

/**
 * Whether a size stays where the theme put it: a length (`12px`, `0.75rem`, a
 * `clamp()` of them) that reads no variable and no parent size (`em`, `%` and
 * the like already follow it).
 */
function isFixedSize(value: string): boolean {
  return (
    /\d[a-z]/i.test(value) && !/var\(|%|\d(?:em|ex|ch|ic|cap|lh)\b/i.test(value)
  );
}

/**
 * A block's token declarations, in order, with its font sizes following the
 * reader's text size: each raw font-size step it writes at a fixed length
 * becomes its private scaled size and the step reading it
 * (`scaledFontSizeEntries`), and each semantic size (`--text-*-size`) it
 * fixes at a length becomes that length times the scale of the step that
 * size reads by default, so supporting text fixed at `12px` scales like
 * Footnote. A size that reads a variable follows what it reads, and one
 * relative to its parent (`em`, `%`) follows the parent, so neither scales
 * twice; a fixed size is not capped, since the theme that fixes it also fixes
 * its place in the hierarchy. A step the block does not write keeps the value
 * it inherits, already scaled. A value written `!important` stays important.
 * Every other declaration keeps its value and its place.
 */
export function readerTextSizeEntries(
  entries: ReadonlyArray<readonly [string, string]>,
): [string, string][] {
  const scaled = new Map(scaledFontSizeEntries(Object.fromEntries(entries)));
  const fixedSteps = new Map(TEXT_SIZE_STEPS);
  return entries.flatMap(([name, raw]): [string, string][] => {
    const step = scaled.get(name);
    if (step !== undefined) {
      const property = scaledStepProperty(name as FontSizeToken);
      return [
        [property, scaled.get(property) ?? ''],
        [name, step],
      ];
    }
    const [value, important] = splitImportant(raw);
    const reads = fixedSteps.get(name);
    return [
      [
        name,
        reads !== undefined && isFixedSize(value)
          ? `calc(${value} * var(${dynamicTypeScaleProperty(FONT_SIZE_STEP_STYLES[reads])}, 1))${important}`
          : raw,
      ],
    ];
  });
}

/**
 * A value and its trailing `!important`, apart: the scale wraps only the
 * value, since `!important` inside `calc()` makes it invalid where it is used,
 * and the importance goes back after the whole expression.
 */
function splitImportant(value: string): [string, string] {
  const match = /\s*!\s*important\s*$/i.exec(value);
  return match ? [value.slice(0, match.index), ' !important'] : [value, ''];
}

/** A `px` or `rem` length in px (16px to the rem); null for anything else. */
function lengthInPx(value: string | undefined): number | null {
  const match = /^(-?\d*\.?\d+)(px|rem)$/.exec(value?.trim() ?? '');
  if (match == null) {
    return null;
  }
  return Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
}

// =============================================================================
// Root sync
// =============================================================================

/**
 * Measure the reader's text size and give the page its scales; returns the
 * cleanup. Does nothing where the engine has no `font: -apple-system-body` or
 * cannot construct a stylesheet (every supported browser that has the keyword
 * can); where its Body size names no category (macOS Safari's fixed 13px),
 * every scale stays 1.
 *
 * The probe is a hidden, empty `font: -apple-system-body` box, 1em square,
 * appended to `<body>` outside every app subtree: it renders no text, and it
 * resizes when the reader's text size changes, which is when the size is read
 * again. The scales go to a stylesheet the document adopts, so nothing is
 * added to the DOM or written on `<html>`.
 */
export function syncReaderTextSize(doc: Document): (() => void) | undefined {
  const view = doc.defaultView;
  if (
    !view?.CSS?.supports?.('font', '-apple-system-body') ||
    typeof view.CSSStyleSheet !== 'function' ||
    !Array.isArray(doc.adoptedStyleSheets)
  ) {
    return undefined;
  }

  const probe = doc.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.setAttribute(dataAttr('text-size-probe'), '');
  probe.style.cssText =
    'position:fixed;inset:0 auto auto 0;inline-size:1em;block-size:1em;visibility:hidden;pointer-events:none;font:-apple-system-body';
  (doc.body ?? doc.documentElement).append(probe);

  const sheet = new view.CSSStyleSheet();
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  const read = () =>
    sheet.replaceSync(
      scaleRuleForColumn(
        columnForBodySize(
          Number.parseFloat(view.getComputedStyle(probe).fontSize),
        ),
      ),
    );
  read();

  const observer =
    typeof view.ResizeObserver === 'function'
      ? new view.ResizeObserver(read)
      : null;
  observer?.observe(probe);

  return () => {
    observer?.disconnect();
    probe.remove();
    doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(
      adopted => adopted !== sheet,
    );
  };
}
