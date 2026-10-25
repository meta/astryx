// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Theme CSS generation utilities
 *
 * Shared logic for generating CSS rules from a resolved theme definition,
 * including one component-leaf lowering path for root, adaptation, and
 * media-surface values plus condition-correct Heading weight precedence guards.
 * Built adaptation metadata resolves against the same root component defaults
 * as defineTheme, so scale-only rules do not reset authored component styles.
 * Used by both the runtime path (Theme injects <style>) and the build
 * path (`astryx theme build` pre-compiles to CSS files).
 *
 * Every consumer-supplied declaration is checked by declarationBoundary.ts
 * before it is emitted, so a value can never end its declaration or rule
 * early. A refused declaration is dropped and reported in the supplied
 * warnings array (build receipts), or through `console.warn` (runtime).
 *
 * Extracted from defineTheme.ts to reduce cyclomatic complexity and provide
 * a clear single-responsibility module for CSS generation.
 *
 * @input DefinedTheme (resolved theme object from defineTheme), optional warnings array
 * @output CSS rule strings, split by layer (component vs prose), and warning text
 *   for each dropped declaration
 * @position packages/core/src/theme/generateThemeRules.ts
 */

import type {ComponentStyleMap, DefinedTheme} from './defineTheme';
import {
  normalizeThemeAdaptations,
  resolveThemeAdaptationRules,
} from './themeAdaptations';
import {parseStyleKey} from '../utils/parseStyleKey';
import {getDerivedVars} from './derivedVarRegistry';
import {cssVar, classPrefix, dataAttrNamespace} from '../naming';
import {
  checkDeclarationName,
  checkDeclarationValue,
} from './declarationBoundary';

/**
 * Theme @scope selectors.
 *
 * Theme CSS is @scope'd to the theme-name data attribute that Theme writes
 * (`data-astryx-theme`).
 *
 * @example themeScopeStart('mytheme')
 *   -> '[data-astryx-theme="mytheme"]'
 */
function themeScopeStart(name: string): string {
  return `[data-${dataAttrNamespace}-theme="${name}"]`;
}

/** Scope limit matching the theme attribute (nested-theme boundary). */
const THEME_SCOPE_TO = `[data-${dataAttrNamespace}-theme]`;

/** Media-surface selector, e.g. for [data-astryx-media="dark"]. */
function mediaSelector(surface: string): string {
  return `[data-${dataAttrNamespace}-media="${surface}"]`;
}

/** Component base-class selector, e.g. '.astryx-button'. */
function componentClassSelector(component: string, suffix: string): string {
  return `.${classPrefix}-${component}${suffix}`;
}

type MediaSurface = 'dark' | 'light';

/** Scope a component selector to an inverted media surface when requested. */
function componentSelector(
  component: string,
  suffix: string,
  surface?: MediaSurface,
): string {
  const selector = componentClassSelector(component, suffix);
  return surface ? `:is(${mediaSelector(surface)}) :is(${selector})` : selector;
}

/**
 * Guard appended to a themed `:hover` rule so it cannot match a disabled
 * element.
 *
 * A theme authoring `':hover': {backgroundColor: …}` is describing the
 * enabled control; `:hover` on its own would paint that background on a
 * disabled one too, because browsers suppress a disabled control's events,
 * not its hover styling. `:where()` contributes no specificity, so a themed
 * hover rule still weighs exactly what it weighed before.
 *
 * Mirrors the `@astryx/no-hover-on-disabled` lint rule, which enforces the
 * same guard on the components' own StyleX styles.
 */
const HOVER_DISABLED_GUARD = ':where(:not(:disabled,[aria-disabled="true"]))';

/**
 * Append a pseudo-class to every selector in a comma-separated selector list.
 *
 * Selector helpers may emit comma-separated lists. CSS does not distribute a
 * trailing pseudo over selector lists, so `${list}:hover` would only target the
 * final selector. Rewrite each item so the pseudo applies to all of them.
 *
 * A `:hover` pseudo also picks up the disabled guard. A pseudo-ELEMENT has to
 * end the selector, so the guard is spliced in before it.
 */
function appendPseudoToSelectorList(selector: string, pseudo: string): string {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
    } else if (char === ',' && depth === 0) {
      parts.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(selector.slice(start).trim());

  const guarded = guardHoverPseudo(pseudo);

  return parts.map(part => `${part}${guarded}`).join(', ');
}

/** Insert the disabled guard into a `:hover` pseudo, keeping any pseudo-element last. */
function guardHoverPseudo(pseudo: string): string {
  if (!/^:hover(?![-\w])/.test(pseudo) || pseudo.includes('[aria-disabled')) {
    return pseudo;
  }
  const pseudoElement = pseudo.indexOf('::');
  return pseudoElement === -1
    ? pseudo + HOVER_DISABLED_GUARD
    : pseudo.slice(0, pseudoElement) +
        HOVER_DISABLED_GUARD +
        pseudo.slice(pseudoElement);
}

// =============================================================================
// Types
// =============================================================================

/**
 * Structured output from generateThemeRulesSplit.
 * Separates prose element defaults from component/token overrides
 * so callers can place them in different CSS layers.
 */
export interface ThemeRulesSplit {
  /** Token overrides + component .astryx-* overrides + prop-level color rules */
  component: string[];
  /** Prose element defaults (h1-h6, p, small, code, hr) — belongs in reset layer */
  prose: string[];
}

/**
 * Output from generateThemeCSS — two CSS blocks for different layers.
 */
export interface ThemeCSSOutput {
  /**
   * Prose element defaults (p, h1-h6, small, code, hr) scoped to the theme.
   * Should be injected into @layer reset — lowest priority, any class wins.
   * Empty string if no prose rules.
   */
  prose: string;
  /**
   * Token overrides + component target/data-attribute overrides scoped to the theme.
   * Should be injected into @layer astryx-theme — above StyleX layers so
   * theme component overrides take effect. Empty string if no rules.
   */
  component: string;
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Convert camelCase CSS property to kebab-case */
function toKebabCase(str: string): string {
  return str.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
}

/** Padding properties that trigger container token mapping */
const PADDING_PROPS = new Set([
  'padding',
  'paddingBlock',
  'paddingInline',
  'paddingBlockStart',
  'paddingBlockEnd',
  'paddingInlineStart',
  'paddingInlineEnd',
]);

/**
 * Physical block-axis longhands, and the logical longhand each one *is* in
 * every horizontal writing mode. Normalizing them costs no direction
 * assumption, which is why they can join the container expansion.
 *
 * `paddingLeft`/`paddingRight` are deliberately absent. They are
 * direction-relative — left is inline-start in LTR and inline-end in RTL — and
 * the expansion's tokens are consumed by logical properties, so mapping them
 * would put the padding on the opposite edge in RTL. They keep their physical
 * meaning and land on the element as `padding-left`/`padding-right`; the cost
 * is that a component's internals cannot see them.
 */
const PHYSICAL_BLOCK_PADDING_PROPS: Record<string, string> = {
  paddingTop: 'paddingBlockStart',
  paddingBottom: 'paddingBlockEnd',
};

/**
 * Every padding spelling the container expansion consumes. Kept separate from
 * PADDING_PROPS, which also routes longhands to `vars`-style derived entries —
 * those carry one value for the whole box, so a single physical edge must not
 * reach them.
 */
const CONTAINER_PADDING_PROPS = new Set([
  ...PADDING_PROPS,
  ...Object.keys(PHYSICAL_BLOCK_PADDING_PROPS),
]);

interface ParsedPadding {
  blockStart?: string;
  blockEnd?: string;
  inline?: string;
  inlineStart?: string;
  inlineEnd?: string;
}

/**
 * Parse CSS padding shorthand/longhand into block/inline values.
 * Supports 1-3 value shorthands, logical properties, and the physical block
 * longhands normalized by PHYSICAL_BLOCK_PADDING_PROPS.
 */
function parsePadding(props: [string, string][]): ParsedPadding {
  const result: ParsedPadding = {};

  for (const [rawProp, value] of props) {
    const prop = PHYSICAL_BLOCK_PADDING_PROPS[rawProp] ?? rawProp;
    switch (prop) {
      case 'padding': {
        const parts = value.trim().split(/\s+/);
        if (parts.length === 1) {
          result.blockStart = parts[0];
          result.blockEnd = parts[0];
          result.inline = parts[0];
        } else if (parts.length === 2) {
          result.blockStart = parts[0];
          result.blockEnd = parts[0];
          result.inline = parts[1];
        } else if (parts.length >= 3) {
          result.blockStart = parts[0];
          result.inline = parts[1];
          result.blockEnd = parts[2];
        }
        break;
      }
      case 'paddingBlock': {
        const parts = value.trim().split(/\s+/);
        result.blockStart = parts[0];
        result.blockEnd = parts[1] ?? parts[0];
        break;
      }
      case 'paddingInline': {
        const parts = value.trim().split(/\s+/);
        if (parts.length === 1) {
          result.inline = parts[0];
        } else {
          result.inlineStart = parts[0];
          result.inlineEnd = parts[1];
        }
        break;
      }
      case 'paddingBlockStart':
        result.blockStart = value;
        break;
      case 'paddingBlockEnd':
        result.blockEnd = value;
        break;
      case 'paddingInlineStart':
        result.inlineStart = value;
        break;
      case 'paddingInlineEnd':
        result.inlineEnd = value;
        break;
    }
  }

  return result;
}

/**
 * Expand parsed padding into component-scoped public tokens.
 *
 * Emits the rebranded --astryx-<component>-padding tokens (shorthand +
 * directional overrides), e.g.:
 *   --astryx-card-padding: 20px
 *   --astryx-card-padding-inline: 20px
 *   --astryx-card-padding-block-start: 20px
 *   --astryx-card-padding-block-end: 20px
 *
 * The component reads these with an inverted fallback chain
 * (var(--astryx-*, default)). The container.stylex.ts default styles read
 * these via var() fallbacks,
 * so the theme CSS sets the value and the component picks it up through
 * CSS custom property cascade — no layer competition with StyleX output.
 */
function expandContainerPadding(
  component: string,
  parsed: ParsedPadding,
  resetInheritedSpecificity = false,
): [string, string][] {
  const prefix = cssVar(`${component}-padding`);
  const tokens: [string, string][] = [];

  // Resolve effective inline values (inlineStart/End override inline)
  const effectiveInlineStart = parsed.inlineStart ?? parsed.inline;
  const effectiveInlineEnd = parsed.inlineEnd ?? parsed.inline;
  const inlineSymmetric =
    effectiveInlineStart != null &&
    effectiveInlineEnd != null &&
    effectiveInlineStart === effectiveInlineEnd;

  // If all sides are the same, emit the shorthand token only
  const allSame =
    inlineSymmetric &&
    parsed.blockStart != null &&
    parsed.blockEnd != null &&
    effectiveInlineStart === parsed.blockStart &&
    parsed.blockStart === parsed.blockEnd;

  if (allSame) {
    tokens.push([prefix, effectiveInlineStart ?? '']);
  } else {
    // Directional tokens
    if (parsed.inlineStart != null || parsed.inlineEnd != null) {
      // Asymmetric inline — emit start and end separately
      if (effectiveInlineStart != null) {
        tokens.push([`${prefix}-inline-start`, effectiveInlineStart]);
      }
      if (effectiveInlineEnd != null) {
        tokens.push([`${prefix}-inline-end`, effectiveInlineEnd]);
      }
    } else if (parsed.inline != null) {
      tokens.push([`${prefix}-inline`, parsed.inline]);
    }
    if (parsed.blockStart != null) {
      tokens.push([`${prefix}-block-start`, parsed.blockStart]);
    }
    if (parsed.blockEnd != null) {
      tokens.push([`${prefix}-block-end`, parsed.blockEnd]);
    }
  }

  if (resetInheritedSpecificity) {
    const emitted = new Set(tokens.map(([name]) => name));
    const moreSpecific = emitted.has(prefix)
      ? [
          `${prefix}-inline`,
          `${prefix}-inline-start`,
          `${prefix}-inline-end`,
          `${prefix}-block-start`,
          `${prefix}-block-end`,
        ]
      : emitted.has(`${prefix}-inline`)
        ? [`${prefix}-inline-start`, `${prefix}-inline-end`]
        : [];
    for (const name of moreSpecific) {
      if (!emitted.has(name)) {
        // `initial` makes a custom property guaranteed-invalid so var() follows
        // its fallback, clearing a more-specific declaration from a root rule.
        tokens.push([name, 'initial']);
      }
    }
  }

  return tokens;
}

// =============================================================================
// Declaration assembly: a declaration always stays one declaration
// =============================================================================

type DiagnosticSink = (message: string) => void;

const warnToConsole: DiagnosticSink = message => {
  console.warn(`[astryx theme] ${message}`);
};

/** Build receipts collect warning text; runtime callers warn by default. */
function diagnosticSink(warnings: string[] | undefined): DiagnosticSink {
  return warnings ? message => warnings.push(message) : warnToConsole;
}

/** Shorten an authored value for a one-line message. */
function previewValue(value: string): string {
  const oneLine = JSON.stringify(value);
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}..."` : oneLine;
}

function reportDrop(
  sink: DiagnosticSink,
  property: string,
  value: string,
  location: string,
  reason: string,
): void {
  sink(
    `dropped "${property}" in ${location}: ${reason} (value: ${previewValue(value)})`,
  );
}

/**
 * True when `name: value;` stays exactly one declaration; otherwise reports
 * the drop and returns false. Both checks follow CSS syntax, so valid CSS a
 * browser keeps inside one declaration (a `data:` URI, `Gill\ Sans`, a closed
 * comment, a vendor-prefixed property) is never refused; see
 * declarationBoundary.ts for the rules.
 */
function acceptDeclaration(
  property: string,
  value: string,
  location: string,
  sink: DiagnosticSink,
): boolean {
  const reason = checkDeclarationName(property) ?? checkDeclarationValue(value);
  if (reason === null) {
    return true;
  }
  reportDrop(sink, property, value, location, reason);
  return false;
}

/**
 * Assemble `prop: value;` lines, dropping (and reporting) any entry whose
 * property or value could not stay a single declaration. Theme definitions
 * are code, but apps do assemble them from stored input (brand colors,
 * white-labeling), so the generated stylesheet must never extend beyond the
 * declarations it means to emit.
 */
function joinDeclarations(
  entries: [string, string][],
  location: string,
  sink: DiagnosticSink,
  mapProp: (prop: string) => string = p => p,
): string {
  const lines: string[] = [];
  for (const [rawProp, rawValue] of entries) {
    // Legacy unenrolled tokens retain non-string values. Scan the same text
    // interpolation has always emitted, without changing the normalized theme.
    const value = `${rawValue}`;
    const prop = mapProp(rawProp);
    if (acceptDeclaration(prop, value, location, sink)) {
      lines.push(`    ${prop}: ${value};`);
    }
  }
  return lines.join('\n');
}

/** The `:scope` token block for portable and theme-local token values. */
function tokenBlock(
  source: ThemeRuleSource,
  location: string,
  sink: DiagnosticSink,
): string | null {
  const declarations = [
    joinDeclarations(Object.entries(source.tokens), `${location}tokens`, sink),
    joinDeclarations(
      Object.entries(source.localTokens ?? {}),
      `${location}localTokens`,
      sink,
    ),
  ]
    .filter(block => block.length > 0)
    .join('\n');
  const hasEntries =
    Object.keys(source.tokens).length > 0 ||
    Object.keys(source.localTokens ?? {}).length > 0;
  return hasEntries ? `  :scope {\n${declarations}\n  }` : null;
}

/** `components.button["variant:secondary"]`-style location for a rule. */
function componentLocation(
  prefix: string,
  component: string,
  key: string,
): string {
  return `${prefix}components.${component}[${JSON.stringify(key)}]`;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate the intermediary CSS rules for a theme.
 *
 * Returns an array of CSS rule strings — the shared format used by both
 * the runtime path (useInsertionEffect) and the build path (astryx theme build).
 */
/**
 * The parts of a theme that turn into CSS rules.
 *
 * Narrower than `DefinedTheme` on purpose: an adaptation rule is not a whole
 * theme, and it calls this with only the values that rule writes. Typing the
 * parameter as `DefinedTheme` would let a future field be read here and silently
 * lost for every conditional rule, with no type error to catch it.
 */
export interface ThemeRuleSource {
  /** Resolved portable token values. */
  tokens: Record<string, string>;
  /** Resolved theme-local token values. */
  localTokens?: Record<string, string>;
  /** Resolved component style overrides. */
  components?: ComponentStyleMap;
}

export function generateThemeRules(
  theme: ThemeRuleSource,
  warnings?: string[],
): string[] {
  const parts: string[] = [];
  const sink = diagnosticSink(warnings);

  // Bare prose rules reference semantic variables instead of baking the root
  // value. That lets adaptation token writes take effect through CSS alone
  // without duplicating prose selectors inside every media query.
  const val = (key: string): string => `var(${key})`;

  // 1. Token block — CSS custom properties on :scope
  const tokenRules = tokenBlock(theme, '', sink);
  if (tokenRules !== null) {
    parts.push(tokenRules);
  }

  // 1b. Base font — apply the theme's declared body font to the scope root.
  // Components styled with `font-family: inherit` (SideNav items, Buttons)
  // otherwise resolve against the browser default serif, since nothing else
  // sets a page font. `font-family` inherits, so one rule on :scope covers
  // the tree. Only emitted when the theme declares a body font, so a bare
  // theme still contributes no scope rules of its own.
  if (theme.tokens['--font-family-body']) {
    parts.push(`  :scope {\n    font-family: var(--font-family-body);\n  }`);
  }

  // 2. Component overrides: stable .astryx-* target classes combined with
  // reflected data-* selectors for visual props and runtime states.
  if (theme.components) {
    generateComponentRules(theme.components, parts, {sink});
  }

  // 3. Prose HTML element rules (h1-h6, p, small, code, hr)
  generateProseRules(val, parts);

  // 4. Prop-level color overrides (for text/heading/link specificity)
  generateColorOverrides(theme.components || {}, parts);

  // 5. Text `size`-prop font-size overrides (so an explicit size beats a
  //    themed type's font-size across the astryx-base → astryx-theme layers)
  generateSizeOverrides(theme.components || {}, parts);

  // 6. Heading `weight`-prop overrides. These are emitted after authored type
  //    rules in the same layer so an explicit prop remains an override even
  //    when a custom visual type declares its own default weight.
  generateHeadingWeightOverrides(theme.components || {}, parts);

  // (on-media rules are generated separately — see generateOnMediaCSS)

  return parts;
}

/** Named Heading/Text weight props and their theme-owned token values. */
const HEADING_WEIGHT_TOKEN_MAP: Record<string, string> = {
  normal: 'var(--font-weight-normal)',
  medium: 'var(--font-weight-medium)',
  semibold: 'var(--font-weight-semibold)',
  bold: 'var(--font-weight-bold)',
};

interface HeadingWeightOverrideOptions {
  /** Scope selectors to one on-media surface. */
  surface?: MediaSurface;
  /** Effective root components used as the surface fallback. */
  inheritedComponents?: Record<string, unknown>;
  /** Emit all standard choices even when this component map has no Heading. */
  forceAll?: boolean;
  /** Emit only choices whose rule explicitly writes fontWeight. */
  authoredOnly?: boolean;
}

/**
 * Re-emit Heading's explicit weight choices in the theme layer.
 *
 * Component and type overrides live above the StyleX base layer, so the
 * component's ordinary weight class cannot win there by itself. Emitting the
 * reflected weight classes after authored component rules makes the public
 * `weight` prop a dependable override of a type or level default.
 */
function generateHeadingWeightOverrides(
  components: Record<string, unknown>,
  parts: string[],
  {
    surface,
    inheritedComponents,
    forceAll = false,
    authoredOnly = false,
  }: HeadingWeightOverrideOptions = {},
): void {
  const headingRules = components.heading;
  const headingRuleMap =
    headingRules &&
    typeof headingRules === 'object' &&
    !Array.isArray(headingRules)
      ? (headingRules as Record<string, unknown>)
      : undefined;
  if (!headingRuleMap && !forceAll) {
    return;
  }
  const inheritedHeadingRules = inheritedComponents?.heading;
  const inheritedHeadingRuleMap =
    inheritedHeadingRules && typeof inheritedHeadingRules === 'object'
      ? (inheritedHeadingRules as Record<string, unknown>)
      : undefined;

  for (const [weightName, weightValue] of Object.entries(
    HEADING_WEIGHT_TOKEN_MAP,
  )) {
    const styleKey = `weight:${weightName}`;
    const authoredWeight = headingRuleMap
      ? getAuthoredHeadingWeight(headingRuleMap, styleKey)
      : undefined;
    if (authoredOnly && authoredWeight === undefined) {
      continue;
    }
    const inheritedWeight = inheritedHeadingRuleMap
      ? getAuthoredHeadingWeight(inheritedHeadingRuleMap, styleKey)
      : undefined;
    const effectiveWeight = authoredWeight ?? inheritedWeight ?? weightValue;
    const suffix = parseStyleKey(styleKey);
    const selector = componentSelector('heading', suffix, surface);
    parts.push(`  ${selector} { font-weight: ${effectiveWeight}; }`);
  }
}

/**
 * The `fontWeight` a heading rule authors for `styleKey`, or undefined when
 * it has none. A value that cannot stay one declaration is treated as not
 * authored, so the override falls back to the inherited or token weight
 * instead of interpolating it; the drop itself is reported where that same
 * rule's declarations are emitted, so it is not reported twice here.
 */
function getAuthoredHeadingWeight(
  headingRuleMap: Record<string, unknown>,
  styleKey: string,
): string | undefined {
  const rule = headingRuleMap[styleKey];
  if (rule == null || typeof rule !== 'object' || Array.isArray(rule)) {
    return undefined;
  }
  const fontWeight = (rule as Record<string, unknown>).fontWeight;
  return typeof fontWeight === 'string' &&
    checkDeclarationValue(fontWeight) === null
    ? fontWeight
    : undefined;
}

/** Options shared by root, adaptation, and media-surface component lowering. */
interface ComponentRuleOptions {
  resetInheritedPaddingSpecificity?: boolean;
  surface?: MediaSurface;
  /** Receives dropped declarations; defaults to `console.warn`. */
  sink?: DiagnosticSink;
  /** Location prefix for diagnostics, e.g. `onDark.` or `adaptations[0].`. */
  location?: string;
}

/**
 * Generate component override rules using stable `.astryx-*` target classes
 * and reflected `data-*` selectors for prop/state keys. Handles derived var
 * expansion and container padding mapping for every theme layer.
 */
function generateComponentRules(
  components: Record<
    string,
    Record<string, Record<string, string | Record<string, string>>>
  >,
  parts: string[],
  {
    resetInheritedPaddingSpecificity = false,
    surface,
    sink = warnToConsole,
    location: locationPrefix = '',
  }: ComponentRuleOptions = {},
): void {
  for (const [component, rules] of Object.entries(components)) {
    for (const [key, styles] of Object.entries(rules)) {
      const entries = Object.entries(styles);
      if (entries.length === 0) {
        continue;
      }

      const suffix = parseStyleKey(key);
      const baseSelector = componentSelector(component, suffix, surface);
      const location = componentLocation(locationPrefix, component, key);

      // Separate regular properties from pseudo-class overrides
      const props: [string, string][] = [];
      const pseudos: [string, Record<string, string>][] = [];

      for (const [prop, value] of entries) {
        if (prop.startsWith(':') && typeof value === 'object') {
          pseudos.push([prop, value]);
        } else if (
          acceptDeclaration(
            toKebabCase(prop),
            `${value as string}`,
            location,
            sink,
          )
        ) {
          props.push([prop, value as string]);
        }
      }

      // Derived var expansion: for each CSS property, check if the
      // component has derived var entries and emit additional declarations.
      // Entries are processed in order (priority).
      // - `vars`: emit internal CSS custom property declarations
      // - `expand: 'container'`: expand padding to container layout tokens
      // - `replaces: true`: emit only the var, dropping the source property
      let finalProps = props;
      const derivedProps: [string, string][] = [];
      let containerExpanded = false;
      const replacedProps = new Set<string>();

      for (const [prop, value] of props) {
        const derived = getDerivedVars(component, prop);
        // Padding longhands (paddingBlock, paddingInline, etc.) also
        // match the 'padding' derived entry for container expansion.
        const paddingDerived =
          PADDING_PROPS.has(prop) && prop !== 'padding'
            ? getDerivedVars(component, 'padding')
            : [];
        for (const entry of [...derived, ...paddingDerived]) {
          if (entry.expand === 'container' && PADDING_PROPS.has(prop)) {
            containerExpanded = true;
          }
          if (entry.replaces) {
            replacedProps.add(prop);
          }
          if (entry.vars) {
            for (const varName of entry.vars) {
              derivedProps.push([varName, value]);
            }
          }
        }
        // A physical block longhand reaches the container expansion only. It
        // names one edge, so it must not feed a `vars` entry above, which
        // carries the padding for the whole box.
        if (
          prop in PHYSICAL_BLOCK_PADDING_PROPS &&
          getDerivedVars(component, 'padding').some(
            e => e.expand === 'container',
          )
        ) {
          containerExpanded = true;
        }
      }

      // Container padding expansion: replace padding props with
      // component-scoped container tokens for layout integration.
      if (containerExpanded) {
        const paddingProps = props.filter(([p]) =>
          CONTAINER_PADDING_PROPS.has(p),
        );
        const nonPaddingProps = props.filter(
          ([p]) => !CONTAINER_PADDING_PROPS.has(p),
        );
        const parsed = parsePadding(paddingProps);
        const containerTokens = expandContainerPadding(
          component,
          parsed,
          resetInheritedPaddingSpecificity,
        );
        finalProps = [...nonPaddingProps, ...containerTokens];
      }

      // Drop properties whose derived entry set `replaces` — their value is
      // carried by the emitted var and must not land on the class element.
      if (replacedProps.size > 0) {
        finalProps = finalProps.filter(([p]) => !replacedProps.has(p));
      }

      if (derivedProps.length > 0) {
        finalProps = [...finalProps, ...derivedProps];
      }

      // Emit base rule
      if (finalProps.length > 0) {
        const declarations = joinDeclarations(
          finalProps,
          location,
          sink,
          toKebabCase,
        );
        parts.push(`  ${baseSelector} {\n${declarations}\n  }`);
      }

      // Emit pseudo-class rules
      for (const [pseudo, pseudoStyles] of pseudos) {
        const pseudoEntries = Object.entries(pseudoStyles);
        if (pseudoEntries.length > 0) {
          const declarations = joinDeclarations(
            pseudoEntries,
            `${location}[${JSON.stringify(pseudo)}]`,
            sink,
            toKebabCase,
          );
          parts.push(
            `  ${appendPseudoToSelectorList(baseSelector, pseudo)} {\n${declarations}\n  }`,
          );
        }
      }
    }
  }
}

/**
 * Generate prose HTML element default rules (h1-h6, p, small, code, hr).
 * Wrapped in :where() for zero specificity — these are defaults that
 * any class-based style (StyleX, .astryx-* overrides) should beat.
 * The caller places these in the reset layer (not astryx-theme) so they
 * sit below all component styles in the cascade.
 */
function generateProseRules(
  val: (key: string) => string,
  parts: string[],
): void {
  parts.push(`  :where(h1, h2, h3, h4, h5, h6) {
    font-family: var(--font-family-heading);
    color: var(--color-text-primary);
  }`);

  for (let level = 1; level <= 6; level++) {
    parts.push(`  :where(h${level}) {
    font-size: ${val(`--text-heading-${level}-size`)};
    font-weight: ${val(`--text-heading-${level}-weight`)};
    line-height: ${val(`--text-heading-${level}-leading`)};
  }`);
  }

  parts.push(`  :where(p) {
    font-family: var(--font-family-body);
    font-size: ${val('--text-body-size')};
    font-weight: ${val('--text-body-weight')};
    line-height: ${val('--text-body-leading')};
    color: var(--color-text-primary);
  }`);

  parts.push(`  :where(small) {
    font-size: ${val('--text-supporting-size')};
    font-weight: ${val('--text-supporting-weight')};
    line-height: ${val('--text-supporting-leading')};
    color: var(--color-text-secondary);
  }`);

  parts.push(`  :where(code, pre) {
    font-family: var(--font-family-code);
    font-size: ${val('--text-code-size')};
    line-height: ${val('--text-code-leading')};
  }`);

  parts.push(`  :where(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
  }`);
}

/**
 * Generate prop-level color override rules for text/heading/link components.
 * These ensure color prop classes override theme token changes.
 */
function generateColorOverrides(
  components: Record<string, unknown>,
  parts: string[],
  surface?: MediaSurface,
): void {
  const TEXT_COLOR_MAP: Record<string, string> = {
    primary: 'var(--color-text-primary)',
    secondary: 'var(--color-text-secondary)',
    disabled: 'var(--color-text-disabled)',
    placeholder: 'var(--color-text-secondary)',
    accent: 'var(--color-text-accent)',
  };

  const touchesText = 'text' in components;
  const touchesHeading = 'heading' in components;
  const touchesLink = 'link' in components;

  if (touchesText || touchesHeading || touchesLink) {
    for (const [colorName, colorValue] of Object.entries(TEXT_COLOR_MAP)) {
      if (touchesText) {
        parts.push(
          `  ${componentSelector('text', parseStyleKey(`color:${colorName}`), surface)} { color: ${colorValue}; }`,
        );
      }
      if (touchesHeading) {
        parts.push(
          `  ${componentSelector('heading', parseStyleKey(`color:${colorName}`), surface)} { color: ${colorValue}; }`,
        );
      }
      if (touchesLink) {
        parts.push(
          `  ${componentSelector('link', parseStyleKey(`color:${colorName}`), surface)} { color: ${colorValue}; }`,
        );
      }
    }
  }
}

/**
 * Map a Text `size` prop value to its raw font-size token.
 * Mirrors `sizeStyles` in `Text/text.stylex.ts` (note `xsm` → `--font-size-xs`).
 * <!-- SYNC: packages/core/src/Text/text.stylex.ts (sizeStyles) -->
 */
const TEXT_SIZE_TOKEN_MAP: Record<string, string> = {
  '4xs': 'var(--font-size-4xs)',
  '3xs': 'var(--font-size-3xs)',
  '2xs': 'var(--font-size-2xs)',
  xsm: 'var(--font-size-xs)',
  sm: 'var(--font-size-sm)',
  base: 'var(--font-size-base)',
  lg: 'var(--font-size-lg)',
  xl: 'var(--font-size-xl)',
  '2xl': 'var(--font-size-2xl)',
  '3xl': 'var(--font-size-3xl)',
  '4xl': 'var(--font-size-4xl)',
};

/**
 * Generate `size`-prop font-size overrides for the Text component.
 *
 * The `size` prop is documented as a font-size override that wins over the
 * size implied by `type`. Its StyleX class lives in `@layer astryx-base`, but a
 * theme's per-type font-size rule (`.astryx-text.<type>`) lives in the higher
 * `@layer astryx-theme`, so the layer cascade let the theme silently shadow
 * `size` for any `type` the theme styled. Re-emitting the size classes here —
 * same layer as the type rules, same `.astryx-text.<x>` specificity, later in
 * source — restores `size` as a real override.
 *
 * Only `font-size` is overridden; line-height and other type properties are
 * intentionally preserved, matching the prop's documented contract.
 *
 * Gated on the theme touching `text` (which includes the auto-generated
 * type-scale rules) — with no theme type rule to beat, the base-layer StyleX
 * class already wins and no override is needed.
 */
function generateSizeOverrides(
  components: Record<string, unknown>,
  parts: string[],
  surface?: MediaSurface,
): void {
  if (!('text' in components)) {
    return;
  }
  for (const [sizeName, sizeValue] of Object.entries(TEXT_SIZE_TOKEN_MAP)) {
    const suffix = parseStyleKey(`size:${sizeName}`);
    parts.push(
      `  ${componentSelector('text', suffix, surface)} { font-size: ${sizeValue}; }`,
    );
  }
}

/**
 * Generate theme rules split into component and prose groups.
 *
 * Prose element rules (h1-h6, p, small, code, hr) style bare HTML elements
 * as themed defaults — conceptually the same tier as the CSS reset. They
 * belong in the reset layer so any class-based style wins.
 *
 * Component rules (tokens, stable .astryx-* targets plus data-* selectors) are
 * that need to beat StyleX — they stay in astryx-theme (above StyleX layers).
 */
export function generateThemeRulesSplit(
  theme: DefinedTheme,
  warnings?: string[],
): ThemeRulesSplit {
  const allRules = generateThemeRules(theme, warnings);

  const prose: string[] = [];
  const component: string[] = [];

  for (const rule of allRules) {
    if (rule.trimStart().startsWith(':where(')) {
      prose.push(rule);
    } else {
      component.push(rule);
    }
  }

  return {component, prose};
}

/**
 * Generate CSS for on-media token and component overrides.
 *
 * Emitted in an unbounded @scope (no `to` limit) so the rules can reach
 * [data-astryx-media] elements. Parent theme component overrides flow through
 * to media contexts — only tokens change. Themes can further customize
 * via onDark.components / onLight.components.
 */
export function generateOnMediaCSS(
  theme: DefinedTheme,
  warnings?: string[],
): string {
  const parts: string[] = [];
  const scopeSelector = themeScopeStart(theme.name);
  const sink = diagnosticSink(warnings);

  for (const surface of ['dark', 'light'] as const) {
    const onMedia = surface === 'dark' ? theme.__onDark : theme.__onLight;
    if (!onMedia) {
      continue;
    }
    const location = surface === 'dark' ? 'onDark.' : 'onLight.';

    // Token overrides
    const tokenEntries = Object.entries(onMedia.tokens);
    if (tokenEntries.length > 0) {
      const declarations = joinDeclarations(
        tokenEntries,
        `${location}tokens`,
        sink,
      );
      parts.push(`  ${mediaSelector(surface)} {\n${declarations}\n  }`);
    }

    // Component overrides use the same lowering as root and adaptations so a
    // surface writes the same derived leaf and can win by source order.
    if (onMedia.components) {
      generateComponentRules(onMedia.components, parts, {
        resetInheritedPaddingSpecificity: true,
        surface,
        sink,
        location,
      });
      generateColorOverrides(onMedia.components, parts, surface);
      generateSizeOverrides(onMedia.components, parts, surface);

      // Apply the effective explicit Heading weight after media-specific type
      // rules. A surface-authored target wins, followed by the inherited main
      // target and then the built-in token fallback.
      generateHeadingWeightOverrides(onMedia.components, parts, {
        surface,
        inheritedComponents: theme.components,
      });
    }
  }

  if (parts.length === 0) {
    return '';
  }

  const inner = parts.join('\n\n');
  return `@scope (${scopeSelector}) to (${THEME_SCOPE_TO}) {\n${inner}\n}`;
}

/** Generate only the declarations one adaptation rule writes. */
function generateAdaptationRuleRules(
  rule: ThemeRuleSource,
  location: string,
  sink: DiagnosticSink,
): string[] {
  const parts: string[] = [];
  const tokens = tokenBlock(rule, location, sink);
  if (tokens !== null) {
    parts.push(tokens);
  }

  if (rule.components) {
    generateComponentRules(rule.components, parts, {
      resetInheritedPaddingSpecificity: true,
      sink,
      location,
    });
    generateColorOverrides(rule.components, parts);
    generateSizeOverrides(rule.components, parts);
  }
  return parts;
}

function hasHeadingComponentRules(
  components: Record<string, unknown> | undefined,
): boolean {
  const headingRules = components?.heading;
  return (
    headingRules !== null &&
    typeof headingRules === 'object' &&
    !Array.isArray(headingRules)
  );
}

function generateAdaptationMediaBlock(
  query: string,
  parts: string[],
  scopeSelector: string,
): string {
  return `@media ${query} {\n  @scope (${scopeSelector}) to (${THEME_SCOPE_TO}) {\n${parts
    .map(indentRule)
    .join('\n\n')}\n  }\n}`;
}

/**
 * Generate CSS for a theme's ordered adaptation rules.
 *
 * Each authored rule stays a separate media block in declaration order. Blocks
 * are never merged, reordered, or value-diffed: a later rule that deliberately
 * writes a root value must remain present so it can override an earlier matching
 * rule. Bare prose follows semantic variables, so token writes need no duplicate
 * prose selectors here.
 */
export function generateAdaptationCSS(
  theme: DefinedTheme,
  warnings?: string[],
): ThemeCSSOutput {
  const sink = diagnosticSink(warnings);
  // Built themes can reach this compiler without passing through defineTheme.
  // Validate retained metadata even when it has no rules (and therefore emits
  // no CSS): width points remain observable through AppShell and inheritance.
  const normalizedAdaptations =
    theme.__adaptations === undefined
      ? undefined
      : normalizeThemeAdaptations(theme.name, theme.__adaptations, undefined);
  const rules =
    theme.__adaptationRules ??
    (normalizedAdaptations
      ? resolveThemeAdaptationRules(
          theme.name,
          normalizedAdaptations,
          theme.__axes ?? {},
          theme.tokens,
          theme.localTokens,
          theme.components,
        )
      : undefined);
  if (!rules || rules.length === 0) {
    return {prose: '', component: ''};
  }

  const scopeSelector = themeScopeStart(theme.name);
  const blocks: string[] = [];
  const adaptsHeading = rules.some(rule =>
    hasHeadingComponentRules(rule.components),
  );

  // Emit ordinary rule writes first, without inherited Heading weight
  // fallbacks. Carrying an earlier weight into a later block makes that value
  // active whenever the later condition matches, even if the earlier condition
  // does not. Pairwise merging cannot repair that: multiple mutually exclusive
  // earlier rules can each overlap one broad later rule.
  for (const [index, rule] of rules.entries()) {
    const parts = generateAdaptationRuleRules(
      rule,
      `adaptations[${index}].`,
      sink,
    );
    if (parts.length === 0) {
      continue;
    }
    blocks.push(generateAdaptationMediaBlock(rule.query, parts, scopeSelector));
  }

  if (adaptsHeading) {
    // Put one unconditional effective-root guard after every ordinary
    // adaptation block. It restores the public weight prop above every
    // conditional type/level default without attributing any prior rule's
    // value to a condition that did not author it.
    const rootWeightParts: string[] = [];
    generateHeadingWeightOverrides(theme.components ?? {}, rootWeightParts, {
      forceAll: true,
    });
    blocks.push(
      `@scope (${scopeSelector}) to (${THEME_SCOPE_TO}) {\n${rootWeightParts.join(
        '\n\n',
      )}\n}`,
    );

    // Reapply only explicitly authored conditional weight writes, preserving
    // authored rule order so co-matching writes retain last-write-wins.
    for (const rule of rules) {
      const authoredWeightParts: string[] = [];
      generateHeadingWeightOverrides(
        rule.components ?? {},
        authoredWeightParts,
        {authoredOnly: true},
      );
      if (authoredWeightParts.length > 0) {
        blocks.push(
          generateAdaptationMediaBlock(
            rule.query,
            authoredWeightParts,
            scopeSelector,
          ),
        );
      }
    }
  }

  return {prose: '', component: blocks.join('\n\n')};
}

/** Indent the rule start without rewriting newlines inside authored values. */
function indentRule(rule: string): string {
  return `  ${rule}`;
}

/**
 * Generate layered CSS for a theme — runtime path.
 *
 * Returns two CSS blocks for injection into different layers:
 * - `prose`: @scope'd element defaults → inject into @layer reset
 * - `component`: @scope'd token + .astryx-* overrides → inject into @layer astryx-theme
 *
 * This separation ensures prose defaults (what bare HTML looks like in a theme)
 * sit at reset-layer priority where any class-based style wins, while component
 * overrides sit above StyleX so themes can restyle components intentionally.
 *
 * Data-token defaults are owned by the public StyleX `dataVars` group. This
 * generator emits only a theme's explicitly authored token overrides.
 */
export function generateThemeCSS(
  theme: DefinedTheme,
  warnings?: string[],
): ThemeCSSOutput {
  const {component, prose} = generateThemeRulesSplit(theme, warnings);
  const scopeSelector = themeScopeStart(theme.name);
  const scopeTo = THEME_SCOPE_TO;

  let proseCss = '';
  if (prose.length > 0) {
    const proseInner = prose.join('\n\n');
    proseCss = `@scope (${scopeSelector}) to (${scopeTo}) {\n${proseInner}\n}`;
  }

  // Component rules: bounded scope (stops at nested themes) +
  // on-media rules in unbounded scope (can reach [data-astryx-media] elements)
  let componentCss = '';
  if (component.length > 0) {
    const componentInner = component.join('\n\n');
    componentCss = `@scope (${scopeSelector}) to (${scopeTo}) {\n${componentInner}\n}`;
  }

  // Adaptations follow the root theme in authored order. Media-surface rules
  // follow adaptations so onDark/onLight keep their specified precedence.
  const adaptationCss = generateAdaptationCSS(theme, warnings);
  if (adaptationCss.component) {
    componentCss = componentCss
      ? `${componentCss}\n\n${adaptationCss.component}`
      : adaptationCss.component;
  }

  const onMediaCss = generateOnMediaCSS(theme, warnings);
  if (onMediaCss) {
    componentCss = componentCss
      ? `${componentCss}\n\n${onMediaCss}`
      : onMediaCss;
  }

  return {prose: proseCss, component: componentCss};
}
