// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-raw-color.js
 * @description Disallow raw colour values — hex, `rgb()`, `hsl()` and the
 * other CSS colour notations — anywhere in component source.
 *
 * A theme can retint every token a component reads. It cannot reach inside a
 * literal. So a colour written into a component is the one colour every theme
 * gets, and the only way to change it is to edit the component — which a
 * consumer cannot do. That is the whole reason the token layer exists.
 *
 * Bad — this grey is the same grey in all seven themes and in a custom one:
 *   const TINT = '#6b7280';
 *   boxShadow: `0 1px 2px rgba(0, 0, 0, 0.12)`
 *
 * Good — the theme decides:
 *   colorVars['--color-text-secondary']
 *   shadowVars['--shadow-sm']
 *
 * WHY A SEPARATE RULE FROM `no-hardcoded-styles`. That rule is keyed on the
 * property name and only reads values directly inside `stylex.create()`, with
 * an anchored pattern. It covers `color`/`backgroundColor`/`borderColor` and
 * nothing else, which leaves out every shape a colour actually hides in: an
 * argument to `light-dark()` or `color-mix()`, a `const` one hop above the
 * style object, a `boxShadow` template string, a `var()` fallback, a JSX
 * attribute, `fill`/`stroke`/`outlineColor`/`caretColor`. This rule walks the
 * literal text instead of the property, so the hiding place stops mattering.
 *
 * SCOPE — what this rule can and cannot see. Like its `no-light-dark-outside-theme`
 * sibling it reads string and template literals, so a comment is invisible to
 * it (which is what keeps the ~90 `#1234` issue references in this repo's
 * comments out of the results), as is a `.css` file, which ESLint never parses.
 * Path exemptions live here rather than only in `eslint.config.js` so they are
 * testable, and so a config edit cannot quietly turn the theme layer into a
 * violation.
 *
 * A functional notation is only a colour when it is a complete call carrying a
 * literal number of its own. `rgba(${r}, ${g}, ${b}, ${a})` builds a colour
 * from values it was handed and holds none — that is a colour utility, not a
 * styling decision, and `utils/color.ts` and `getChartColors` are both written
 * that way. One literal channel is enough to count, so
 * `hsl(var(--h), 80%, 50%)` is still a colour this file chose. A bare `'rgb('`
 * with no closing parenthesis is a parser's prefix for the same reason.
 *
 * A mask is the one place a colour is not paint: `mask-image` resolves a
 * gradient through its ALPHA channel, so `rgba(0, 0, 0, 0.3)` there is a 30%
 * opacity stop and the black is discarded. No theme author expects to retint
 * it, so mask properties are exempt — `backgroundImage`, which paints the same
 * gradient, is not.
 *
 * KNOWN LIMITATIONS, both deliberate:
 *   - Named CSS colours (`red`, `rebeccapurple`) are not flagged. A bare word
 *     is indistinguishable from any other string, and the false-positive cost
 *     is far higher than the ~zero rate at which they appear here.
 *   - A colour assembled at runtime from parts (`'#' + hex`) is not flagged.
 *     Nothing in this repo does it, and catching it means evaluating
 *     expressions rather than reading literals.
 */

import path from 'node:path';

/**
 * The theme layer, matched by POSITION rather than by directory name. A
 * `theme/` anywhere would exempt any file a component happened to put in one,
 * in a rule whose whole claim is that a colour cannot hide — so this anchors to
 * the two places the layer actually is: a package's own `src/theme/**`
 * (`tokens.stylex.ts`, `defineTheme`, the expanders) and the shipped theme
 * packages under `packages/themes/**`. A `themes/` directory inside a CLI
 * template is a third, and is matched for the same reason: its job is to
 * demonstrate theme values.
 */
const THEME_LAYER = [
  /(^|\/)packages\/themes\//,
  /(^|\/)src\/theme\//,
  /(^|\/)templates\/[^/]*\/?themes?\//,
];

/**
 * File kinds that demonstrate or assert on colour rather than shipping it. A
 * theming story MUST use literals — a theme author writes literals, and that is
 * precisely what the story is showing.
 */
const NON_SHIPPING_FILE = /\.(test|spec|stories|doc|sandbox)\./;

const TEST_DIRECTORIES = new Set(['__tests__', '__mocks__']);

function isExemptFile(filename) {
  if (!filename || filename === '<input>' || filename === '<text>') {
    return false;
  }
  const normalized = filename.split(path.sep).join('/');
  const segments = normalized.split('/');
  const basename = segments.pop() ?? '';
  if (NON_SHIPPING_FILE.test(basename)) {
    return true;
  }
  if (segments.some(segment => TEST_DIRECTORIES.has(segment))) {
    return true;
  }
  return THEME_LAYER.some(pattern => pattern.test(normalized));
}

/**
 * `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` — bounded on both sides so `#ff` and
 * `#1234567` are not colours, and neither is the tail of a longer word.
 */
const HEX = /(?<![\w#])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w#])/;

/**
 * Every CSS colour notation that takes arguments. `color()` and the lab/lch
 * family are here for the same reason as `rgb()`: they are a raw colour with a
 * different spelling, and leaving them out makes the rule a lint against one
 * syntax rather than against the defect.
 */
const COLOR_FUNCTION = /(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;

/**
 * The index just past the parenthesis opened at `from - 1`, or -1 if it never
 * closes. Nesting counts, so `rgb(calc(1 + 2), 0, 0)` closes on its own.
 */
function endOfCall(text, from) {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '(') {
      depth++;
    } else if (text[i] === ')' && --depth === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Does `text` hold a raw colour?
 *
 * A colour function counts only when its arguments carry a literal digit. An
 * argument list made of interpolations or `var()` reads is a colour being
 * assembled from values chosen elsewhere — `rgba(${r}, ${g}, ${b}, ${a})` in a
 * colour utility, `rgb(var(--r) var(--g) var(--b))` from tokens. One literal
 * channel is a channel this file chose, and that is enough.
 */
function hasRawColor(text) {
  if (HEX.test(text)) {
    return true;
  }
  COLOR_FUNCTION.lastIndex = 0;
  let match;
  while ((match = COLOR_FUNCTION.exec(text)) !== null) {
    const argsStart = match.index + match[0].length;
    const argsEnd = endOfCall(text, argsStart);
    if (argsEnd !== -1 && /\d/.test(text.slice(argsStart, argsEnd))) {
      return true;
    }
  }
  return false;
}

/**
 * Style properties whose colour channel is discarded. `mask-image` resolves a
 * gradient through alpha, so the RGB in one of its stops never paints.
 */
const ALPHA_ONLY_PROPERTIES = new Set([
  'mask',
  'maskImage',
  'maskBorderSource',
  'WebkitMask',
  'WebkitMaskImage',
  'WebkitMaskBoxImage',
]);

/**
 * Is the object holding this property the argument to `stylex.create()`?
 *
 * Its keys are style-RULE names — `nav`, `fadeStart` — not CSS properties, so a
 * rule someone names `mask` must not exempt the declarations inside it.
 */
function isStyleRuleName(property) {
  const object = property.parent;
  const call = object?.parent;
  return (
    object?.type === 'ObjectExpression' &&
    call?.type === 'CallExpression' &&
    call.arguments.includes(object) &&
    call.callee?.type === 'MemberExpression' &&
    call.callee.object?.name === 'stylex' &&
    call.callee.property?.name === 'create'
  );
}

/**
 * Is this literal a value of a property whose colour channel is discarded?
 *
 * The walk climbs to the nearest CSS property rather than the nearest property,
 * because a value can sit several nodes below the one that names it: a ternary
 * picking one of two gradients, a `??` default, and — the shape this repo
 * writes — StyleX's conditional object, where the gradient is the value of
 * `default` inside the value of `maskImage` (`TabList.tsx:261`,
 * `Carousel.tsx:187`). Everything under a `maskImage` key is a mask value, so
 * finding that key anywhere up the chain is the answer.
 *
 * Two things a match must not be: a style-RULE named `mask`, whose contents are
 * ordinary declarations, and a computed key, whose identifier is a variable
 * name rather than the property it resolves to. Only the node types a value can
 * nest inside are traversed, so the walk stops at the first thing that is not
 * one and can never leave the style object.
 */
function isAlphaOnlyValue(node) {
  let current = node;
  for (let parent = current.parent; parent; parent = current.parent) {
    if (parent.type === 'Property' && parent.value === current) {
      const key = parent.computed ? undefined : parent.key?.name ?? parent.key?.value;
      if (ALPHA_ONLY_PROPERTIES.has(key) && !isStyleRuleName(parent)) {
        return true;
      }
      current = parent;
      continue;
    }
    const nests =
      parent.type === 'ObjectExpression' ||
      (parent.type === 'ArrayExpression' && parent.elements.includes(current)) ||
      (parent.type === 'ConditionalExpression' &&
        (parent.consequent === current || parent.alternate === current)) ||
      (parent.type === 'LogicalExpression' && parent.right === current);
    if (!nests) {
      return false;
    }
    current = parent;
  }
  return false;
}

const PLACEHOLDER = '\u0000';

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw colour values (hex, rgb(), hsl() and the other CSS ' +
        'colour notations) in component source — a colour a theme cannot ' +
        'reach is the same colour in every theme',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      rawColor:
        'Raw colour in component source. A theme can retint any token this ' +
        'component reads, but it cannot reach inside a literal — so this is ' +
        'the colour every theme gets, including a consumer\'s own. Read a ' +
        "token instead (`colorVars['--color-…']`, `shadowVars['--shadow-…']`), " +
        'or derive one with `color-mix()` on token vars. If no token fits, the ' +
        'value belongs in the theme layer, not here.',
    },
    schema: [],
  },
  create(context) {
    if (isExemptFile(context.filename)) {
      return {};
    }

    return {
      Literal(node) {
        if (
          typeof node.value === 'string' &&
          hasRawColor(node.value) &&
          !isAlphaOnlyValue(node)
        ) {
          context.report({node, messageId: 'rawColor'});
        }
      },
      TemplateLiteral(node) {
        const text = node.quasis.map(quasi => quasi.value.raw).join(PLACEHOLDER);
        if (hasRawColor(text) && !isAlphaOnlyValue(node)) {
          context.report({node, messageId: 'rawColor'});
        }
      },
    };
  },
};

export default rule;
