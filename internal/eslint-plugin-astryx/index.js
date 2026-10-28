// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ESLint plugin for Astryx design system
 * @description Enforces usage of design tokens and Astryx conventions
 *
 * Rules:
 * - no-hardcoded-styles: Enforces usage of design tokens instead of hardcoded values in StyleX
 * - boolean-prop-naming: Enforces is/has prefix on boolean props in *Props interfaces
 * - docblock-example-format: Enforces @example blocks use ``` fenced code on a separate line
 * - no-raw-paragraph: Disallows components from rendering a <p> by default (render <div> so any content composes)
 * - no-style-only-wrapper: Disallows div/span wrappers that only style a single Astryx component (use xstyle)
 * - no-nullish-jsx-guard: Flags `!= null` JSX render guards for rendered values (use isRenderable so false/''/true slots don't leak an empty element)
 * - no-raw-intl-locale: Forbids raw Intl formatting/comparison outside the approved i18n infrastructure boundary, navigator.language(s) as a locale source, and date-helper calls without provider locale
 * - no-unguarded-ime-keydown: Flags an onKeyDown on an editable surface that branches on command keys without an IME composition guard (isImeKeyEvent/isComposing)
 * - no-physical-properties: Flags physical left/right CSS properties and unsafe logical-centering transform pairs
 * - prefer-center-inline: Nudges correct hand-rolled fixed centering toward rtlStyles.centerInline()
 * - no-classname-clobber: Flags two className sources on one JSX element — a literal className/style beside {...stylex.props()}, or two spreads that each carry a className (the later one silently wins)
 * - no-hover-on-disabled: Flags a :hover condition that can still match a disabled element (browsers suppress a disabled control's events, not its hover styling)
 * - require-table-section: Requires TableRow/tr to sit inside TableHeader/TableBody/TableFooter (a row directly inside a table emits <table><tr>, which browsers repair on parse and React does not)
 * - disabled-cursor: Flags a cursor that promises an interaction without giving way to not-allowed on a disabled element
 * - no-unstable-merged-refs: Flags render-time mergeRefs callbacks and unstable callback inputs to useMergedRefs
 * - no-light-dark-outside-theme: Flags CSS light-dark() in component source (a light/dark decision belongs to the theme layer, where a token pair reaches both schemes in every theme)
 * - no-core-internal-import: Keeps Core's internal subpaths (@astryxdesign/core/internal/*) inside Core and Lab
 * - no-raw-color: Flags a raw colour value (hex, rgb(), hsl(), oklch(), …) anywhere in component source, including inside light-dark()/color-mix(), behind a const, in a template literal, or as a var() fallback — the shapes no-hardcoded-styles cannot see
 *
 * Philosophy: Strict for agents (CI), lenient for humans (local dev)
 * - "strict" config: All rules as errors - use in CI/agent environments
 * - "recommended" config: All rules as warnings - use for human development
 */

import booleanPropNamingRule from './boolean-prop-naming.js';
import presentationalComponentRule from './presentational-component.js';
import docblockExampleFormatRule from './docblock-example-format.js';
import noStylexNullOverrideRule from './no-stylex-null-override.js';
import noStyleOnlyWrapperRule from './no-style-only-wrapper.js';
import noWrapperTransformRule from './no-wrapper-transform.js';
import noReactIntrospectionRule from './no-react-introspection.js';
import noClassnameClobberRule from './no-classname-clobber.js';
import noHardcodedAnchorRule from './no-hardcoded-anchor.js';
import noRawParagraphRule from './no-raw-paragraph.js';
import noNullishJsxGuardRule from './no-nullish-jsx-guard.js';
import noRawIntlLocaleRule from './no-raw-intl-locale.js';
import noUnguardedImeKeydownRule from './no-unguarded-ime-keydown.js';
import noBorderShorthandRule from './no-border-shorthand.js';
import noPhysicalPropertiesRule from './no-physical-properties.js';
import preferCenterInlineRule from './prefer-center-inline.js';
import focusOutlineKeyboardOnlyRule from './focus-outline-keyboard-only.js';
import focusOutlineSharedRule from './focus-outline-shared.js';
import noHoverOnDisabledRule from './no-hover-on-disabled.js';
import disabledCursorRule from './disabled-cursor.js';
import noReactNamespaceHooksRule from './no-react-namespace-hooks.js';
import noUnstableMergedRefsRule from './no-unstable-merged-refs.js';
import copyrightHeaderRule from './copyright-header.js';
import noRawConsoleCliRule from './no-raw-console-cli.js';
import noCoreInternalImportRule from './no-core-internal-import.js';
import requireBasePropsRule from './require-base-props.js';
import requireRefPropRule from './require-ref-prop.js';
import requireBasePropsPassthroughRule from './require-baseprops-passthrough.js';
import noHardcodedI18nStringRule from './no-hardcoded-i18n-string.js';
import i18nKeyFormatRule from './i18n-key-format.js';
import requireTableSectionRule from './require-table-section.js';
import noLightDarkOutsideThemeRule from './no-light-dark-outside-theme.js';
import noRawColorRule from './no-raw-color.js';

// =============================================================================
// Rule: no-hardcoded-styles
// Detects hardcoded CSS values that should use Astryx tokens
// =============================================================================

const STYLE_PROPERTIES = {
  // Font properties that should use tokens
  fontSize: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem|em)['"]?$/,
    tokenVar: 'textSizeVars',
    message: 'Use textSizeVars token instead of hardcoded fontSize',
    examples: [
      "textSizeVars['--font-size-xs']",
      "textSizeVars['--font-size-base']",
    ],
  },
  fontWeight: {
    pattern: /^\d{3}$/,
    tokenVar: 'fontWeightVars',
    message: 'Use fontWeightVars token instead of hardcoded fontWeight',
    examples: ["fontWeightVars['--font-weight-medium']"],
  },
  lineHeight: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem|em)?['"]?$/,
    tokenVar: 'typeScaleVars',
    message: 'Consider using a typeScaleVars leading token for consistency',
    examples: ["typeScaleVars['--text-body-leading']"],
  },
  // Spacing properties
  padding: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token instead of hardcoded padding',
    examples: ["spacingVars['--spacing-2']"],
  },
  paddingTop: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  paddingRight: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  paddingBottom: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  paddingLeft: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  paddingBlock: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  paddingInline: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  margin: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  marginTop: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  marginRight: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  marginBottom: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  marginLeft: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  marginBlock: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  marginInline: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  gap: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'spacingVars',
    message: 'Use spacingVars token',
  },
  // Border radius
  borderRadius: {
    pattern: /^['"]?\d+(\.\d+)?(px|rem)['"]?$/,
    tokenVar: 'radiusVars',
    message: 'Use radiusVars token instead of hardcoded borderRadius',
    examples: ["radiusVars['--radius-element']"],
  },
  // Colors - detect hex codes and rgb values
  color: {
    pattern: /^['"]?(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))['"]?$/,
    tokenVar: 'colorVars',
    message: 'Use colorVars token instead of hardcoded color',
    examples: ["colorVars['--color-text-primary']"],
  },
  backgroundColor: {
    pattern: /^['"]?(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))['"]?$/,
    tokenVar: 'colorVars',
    message: 'Use colorVars token instead of hardcoded backgroundColor',
    examples: ["colorVars['--color-background-surface']"],
  },
  borderColor: {
    pattern: /^['"]?(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))['"]?$/,
    tokenVar: 'colorVars',
    message: 'Use colorVars token instead of hardcoded borderColor',
  },
};

// Properties to skip (these are typically fine as hardcoded values)
const SKIP_VALUES = [
  '0',
  '0px',
  'inherit',
  'initial',
  'unset',
  'auto',
  'none',
  '100%',
  '50%',
  '0%',
  'transparent',
  'currentColor',
];

/**
 * Check if we're inside a stylex.create() call
 */
function isInsideStylexCreate(node) {
  let current = node;
  while (current) {
    if (
      current.type === 'CallExpression' &&
      current.callee?.type === 'MemberExpression' &&
      current.callee.object?.name === 'stylex' &&
      current.callee.property?.name === 'create'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Get the string value from a node
 */
function getValueFromNode(node) {
  if (node.type === 'Literal') {
    return String(node.value);
  }
  if (node.type === 'TemplateLiteral' && node.quasis.length === 1) {
    return node.quasis[0].value.raw;
  }
  return null;
}

const noHardcodedStylesRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce usage of Astryx design tokens instead of hardcoded values in StyleX',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      useToken: '{{message}}. Example: {{examples}}',
      useTokenSimple: '{{message}}',
    },
    schema: [
      {
        type: 'object',
        properties: {
          // Allow specific properties to be ignored
          ignore: {
            type: 'array',
            items: {type: 'string'},
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = context.options[0] || {};
    const ignoredProperties = new Set(options.ignore || []);

    return {
      Property(node) {
        // Only check inside stylex.create()
        if (!isInsideStylexCreate(node)) {
          return;
        }

        // Get property name
        const propName = node.key?.name || node.key?.value;
        if (!propName || ignoredProperties.has(propName)) {
          return;
        }

        // Check if this property has a rule
        const rule = STYLE_PROPERTIES[propName];
        if (!rule) {
          return;
        }

        // Get the value
        const value = getValueFromNode(node.value);
        if (value === null) {
          // Value is a variable/expression - that's fine
          return;
        }

        // Skip allowed values
        if (SKIP_VALUES.includes(value)) {
          return;
        }

        // Check if value matches the hardcoded pattern
        if (rule.pattern.test(value)) {
          context.report({
            node: node.value,
            messageId: rule.examples ? 'useToken' : 'useTokenSimple',
            data: {
              message: rule.message,
              examples: rule.examples ? rule.examples.join(' or ') : '',
            },
          });
        }
      },
    };
  },
};

// =============================================================================
// Plugin Export
// =============================================================================

const plugin = {
  meta: {
    name: '@astryx/eslint-plugin',
    version: '0.0.1',
  },
  rules: {
    'no-hardcoded-styles': noHardcodedStylesRule,
    'boolean-prop-naming': booleanPropNamingRule,
    'presentational-component': presentationalComponentRule,
    'docblock-example-format': docblockExampleFormatRule,
    'no-stylex-null-override': noStylexNullOverrideRule,
    'no-style-only-wrapper': noStyleOnlyWrapperRule,
    'no-wrapper-transform': noWrapperTransformRule,
    'no-react-introspection': noReactIntrospectionRule,
    'no-classname-clobber': noClassnameClobberRule,
    'no-hardcoded-anchor': noHardcodedAnchorRule,
    'no-raw-paragraph': noRawParagraphRule,
    'no-nullish-jsx-guard': noNullishJsxGuardRule,
    'no-raw-intl-locale': noRawIntlLocaleRule,
    'no-unguarded-ime-keydown': noUnguardedImeKeydownRule,
    'no-border-shorthand': noBorderShorthandRule,
    'no-physical-properties': noPhysicalPropertiesRule,
    'prefer-center-inline': preferCenterInlineRule,
    'focus-outline-keyboard-only': focusOutlineKeyboardOnlyRule,
    'focus-outline-shared': focusOutlineSharedRule,
    'no-hover-on-disabled': noHoverOnDisabledRule,
    'disabled-cursor': disabledCursorRule,
    'no-react-namespace-hooks': noReactNamespaceHooksRule,
    'no-unstable-merged-refs': noUnstableMergedRefsRule,
    'require-base-props': requireBasePropsRule,
    'require-ref-prop': requireRefPropRule,
    'require-baseprops-passthrough': requireBasePropsPassthroughRule,
    'copyright-header': copyrightHeaderRule,
    'no-raw-console-cli': noRawConsoleCliRule,
    'no-core-internal-import': noCoreInternalImportRule,
    'no-hardcoded-i18n-string': noHardcodedI18nStringRule,
    'i18n-key-format': i18nKeyFormatRule,
    'require-table-section': requireTableSectionRule,
    'no-light-dark-outside-theme': noLightDarkOutsideThemeRule,
    'no-raw-color': noRawColorRule,
  },
  configs: {},
};

// Strict config - for agents/CI (all errors)
plugin.configs.strict = {
  plugins: {
    '@astryx': plugin,
  },
  rules: {
    '@astryx/no-hardcoded-styles': 'error',
    '@astryx/boolean-prop-naming': 'error',
    '@astryx/presentational-component': 'error',
    '@astryx/docblock-example-format': 'error',
    '@astryx/no-stylex-null-override': 'error',
    // Migration in progress: ~25 wrappers in packages/core predate this rule
    // (Carousel, Lightbox, MobileNav, Pagination, PowerSearch, Switch, TopNav,
    // Table/rowExpansion). Warn in both tiers until they move to xstyle, then
    // flip to 'error' here to prevent regressions — the same path
    // no-physical-properties took.
    '@astryx/no-style-only-wrapper': 'warn',
    '@astryx/no-wrapper-transform': 'error',
    '@astryx/no-react-introspection': 'error',
    // Widened to catch two spreads that each carry a className, which is how
    // astryx-breadcrumb-item-menu-trigger came to render on no element at
    // all. That one violation is the only one in the repo and its fix is
    // open in PR #5332 — warn until that lands, then flip both tiers back
    // to 'error'.
    '@astryx/no-classname-clobber': 'warn',
    '@astryx/no-hardcoded-anchor': 'error',
    '@astryx/no-raw-paragraph': 'error',
    // Rolled out as a warning even in strict mode: core still has ~36 existing
    // `slot != null && <El>{slot}</El>` guards to migrate to isRenderable().
    // Kept as 'warn' so it surfaces everywhere (including CI) without failing
    // the build; promote to 'error' once core is migrated (see issue #2538).
    '@astryx/no-nullish-jsx-guard': 'warn',
    '@astryx/no-raw-intl-locale': 'error',
    // All editable command-key handlers in core now guard IME composition
    // (Selector, MultiSelector, DateInput, DateTimeInput, TimeInput, and
    // Typeahead's edit-mode Escape were fixed alongside this rule); error to
    // prevent regressions (see issue #4892).
    '@astryx/no-unguarded-ime-keydown': 'error',
    '@astryx/no-border-shorthand': 'error',
    // RTL physical→logical migration complete; errors to prevent regressions.
    '@astryx/no-physical-properties': 'error',
    // Correct hand-rolled fixed centering still duplicates shared geometry.
    '@astryx/prefer-center-inline': 'warn',
    // A focus outline drawn for pointer users is an accessibility defect, and
    // core is clean — error in both tiers so it stays that way.
    '@astryx/focus-outline-keyboard-only': 'error',
    // Core and lab draw every ring from the shared utility; error so the one
    // themeable definition stays the only one.
    '@astryx/focus-outline-shared': 'error',
    // A disabled control that lights up under the pointer promises a click it
    // will not honour, and `:hover` matches a disabled element in every
    // engine. Error in both tiers: core and lab are clean, and the fix is
    // autofixable.
    '@astryx/no-hover-on-disabled': 'error',
    // The cursor is the affordance a pointer user reads before they click; a
    // disabled control answering with `pointer` promises a click it will not
    // honour. Error in both tiers, and autofixable.
    '@astryx/disabled-cursor': 'error',
    '@astryx/no-react-namespace-hooks': 'error',
    '@astryx/no-unstable-merged-refs': 'error',
    '@astryx/require-base-props': 'error',
    '@astryx/require-ref-prop': 'error',
    // Warn, not error, in strict too: known violations remain on main, so
    // erroring here would land main red. Promote deliberately once the
    // repository is clean.
    '@astryx/require-baseprops-passthrough': 'warn',
    '@astryx/copyright-header': 'error',
    '@astryx/no-hardcoded-i18n-string': 'error',
    '@astryx/i18n-key-format': 'error',
    // A row directly inside a table is invalid DOM and hydration-unsafe, and
    // the repo is clean — error in both tiers so it stays that way (#5277).
    '@astryx/require-table-section': 'error',
    // A component-level light-dark() is a light/dark decision no theme can
    // override; the pair belongs in the theme layer. Core is clean after the
    // sticky-column fix in this commit, so it errors in both tiers. (Lab
    // warns — see the lab block in eslint.config.js.)
    '@astryx/no-light-dark-outside-theme': 'error',
    // A colour a theme cannot reach is the colour every theme gets. This is
    // the whole of T1 where `no-hardcoded-styles` only reaches literals sitting
    // directly on `color`/`backgroundColor`/`borderColor` inside
    // `stylex.create()`. Warn in both tiers while the 23 existing violations
    // are cleaned up (2 in core, 1 in charts, 20 in lab — see the plugin
    // README); promote to 'error' per package as each one reaches zero, the
    // same path no-physical-properties took.
    '@astryx/no-raw-color': 'warn',
  },
};

// Recommended config - for humans (all warnings)
plugin.configs.recommended = {
  plugins: {
    '@astryx': plugin,
  },
  rules: {
    '@astryx/no-hardcoded-styles': 'warn',
    '@astryx/boolean-prop-naming': 'warn',
    '@astryx/presentational-component': 'error',
    '@astryx/docblock-example-format': 'warn',
    '@astryx/no-stylex-null-override': 'warn',
    '@astryx/no-style-only-wrapper': 'warn',
    '@astryx/no-wrapper-transform': 'error',
    '@astryx/no-react-introspection': 'error',
    // Widened to catch two spreads that each carry a className, which is how
    // astryx-breadcrumb-item-menu-trigger came to render on no element at
    // all. That one violation is the only one in the repo and its fix is
    // open in PR #5332 — warn until that lands, then flip both tiers back
    // to 'error'.
    '@astryx/no-classname-clobber': 'warn',
    '@astryx/no-hardcoded-anchor': 'warn',
    '@astryx/no-raw-paragraph': 'warn',
    '@astryx/no-nullish-jsx-guard': 'warn',
    '@astryx/no-raw-intl-locale': 'error',
    // IME composition migration complete; error to prevent regressions
    // (see strict config above and issue #4892).
    '@astryx/no-unguarded-ime-keydown': 'error',
    '@astryx/no-border-shorthand': 'warn',
    // RTL physical→logical migration complete; errors to prevent regressions.
    '@astryx/no-physical-properties': 'error',
    // Correct hand-rolled fixed centering still duplicates shared geometry.
    '@astryx/prefer-center-inline': 'warn',
    // A focus outline drawn for pointer users is an accessibility defect, and
    // core is clean — error in both tiers so it stays that way.
    '@astryx/focus-outline-keyboard-only': 'error',
    // Core and lab draw every ring from the shared utility; error so the one
    // themeable definition stays the only one.
    '@astryx/focus-outline-shared': 'error',
    // A disabled control that lights up under the pointer promises a click it
    // will not honour, and `:hover` matches a disabled element in every
    // engine. Error in both tiers: core and lab are clean, and the fix is
    // autofixable.
    '@astryx/no-hover-on-disabled': 'error',
    // The cursor is the affordance a pointer user reads before they click; a
    // disabled control answering with `pointer` promises a click it will not
    // honour. Error in both tiers, and autofixable.
    '@astryx/disabled-cursor': 'error',
    '@astryx/no-react-namespace-hooks': 'error',
    '@astryx/no-unstable-merged-refs': 'error',
    '@astryx/require-base-props': 'warn',
    '@astryx/require-ref-prop': 'warn',
    '@astryx/require-baseprops-passthrough': 'warn',
    '@astryx/copyright-header': 'error',
    '@astryx/no-hardcoded-i18n-string': 'warn',
    '@astryx/i18n-key-format': 'warn',
    // A row directly inside a table is invalid DOM and hydration-unsafe, and
    // the repo is clean — error in both tiers so it stays that way (#5277).
    '@astryx/require-table-section': 'error',
    // A component-level light-dark() is a light/dark decision no theme can
    // override; the pair belongs in the theme layer. Core is clean after the
    // sticky-column fix in this commit, so it errors in both tiers. (Lab
    // warns — see the lab block in eslint.config.js.)
    '@astryx/no-light-dark-outside-theme': 'error',
    // A colour a theme cannot reach is the colour every theme gets. This is
    // the whole of T1 where `no-hardcoded-styles` only reaches literals sitting
    // directly on `color`/`backgroundColor`/`borderColor` inside
    // `stylex.create()`. Warn in both tiers while the 23 existing violations
    // are cleaned up (2 in core, 1 in charts, 20 in lab — see the plugin
    // README); promote to 'error' per package as each one reaches zero, the
    // same path no-physical-properties took.
    '@astryx/no-raw-color': 'warn',
  },
};

export default plugin;
