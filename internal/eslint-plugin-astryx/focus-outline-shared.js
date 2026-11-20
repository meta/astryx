// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focus-outline-shared.js
 * @description A keyboard focus ring must come from the shared utility, not be
 * written out again in a component.
 *
 * There is exactly one focus ring in the system, and it is themeable through
 * the `--focus-outline-*` tokens. A component that writes its own
 * `2px solid accent` gets the tokens' values by accident at best, and drifts
 * the moment either side changes — which is what happened: offsets wandered
 * between 1px, 2px and 3px, and one ring was a border-width thick.
 *
 * BAD
 *   outline: {default: 'none', ':focus-visible': `2px solid ${accent}`}
 *   outlineWidth: {default: '0', ':has(:focus-visible)': '2px'}
 *
 * GOOD
 *   stylex.props(focusOutlineStyles.focusVisible, styles.base)
 *   focusOutlineProps.focusWithin(styles.base)
 *
 * SCOPE: only the parts that say what the ring LOOKS like — the `outline`
 * shorthand, `outlineWidth`, `outlineStyle` — and only under a literal
 * `:focus-visible` condition.
 *
 * Deliberately NOT flagged:
 * - `outlineOffset`. Where the ring sits is a local constraint (a ring inset
 *   into a tight grid, or held clear of a field border), and a component that
 *   overrides only the offset still follows the theme's width, style and color.
 * - `outlineColor`. Re-coloring the ring per variant is the documented override
 *   — destructive buttons ring in error red.
 * - A computed condition key, e.g.
 *   `stylex.when.ancestor(':has(:focus-visible)', scope)`. A scope marker
 *   cannot be shared between components without leaking focus state, so Switch
 *   composes the tokens itself; the exception is recorded there.
 */

const RING_APPEARANCE = new Set(['outline', 'outlineWidth', 'outlineStyle']);

/**
 * The files that own a ring are the only places allowed to write it: the
 * shared utility, and the focus-owner attribute's owner module, which holds
 * the wrapper ring keyed to that private attribute
 * (`architecture:public-component-api` INV23).
 */
const RING_OWNER_FILES = [
  'focusOutline.stylex',
  'privateAttributes/focusOwner.stylex',
];

function isFocusVisibleKey(key) {
  return typeof key === 'string' && key.includes(':focus-visible');
}

function keyOf(property) {
  if (!property || property.type !== 'Property') return null;
  if (property.key?.type === 'Literal') return String(property.key.value);
  if (property.key?.type === 'Identifier' && !property.computed) {
    return property.key.name;
  }
  return null;
}

/** Does this value paint a ring, or take one away? */
function drawsARing(valueNode) {
  if (!valueNode) return false;
  if (valueNode.type === 'Literal') {
    const value = valueNode.value;
    if (value == null) return false;
    const text = String(value).trim();
    return text !== '' && text !== 'none' && text !== '0' && text !== '0px';
  }
  return true;
}

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

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Focus rings must be drawn from the shared focusOutline utility',
      category: 'Consistency',
      recommended: true,
    },
    messages: {
      handRolledRing:
        "'{{property}}' paints a focus ring under '{{key}}'. Use the shared " +
        'focusOutlineStyles / focusOutlineProps from utils/focusOutline.stylex ' +
        'so one theme override reaches every ring — a local outlineOffset is ' +
        'still fine when the ring has to sit somewhere else.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename?.replaceAll('\\', '/') ?? '';
    if (RING_OWNER_FILES.some(owner => filename.includes(owner))) return {};

    return {
      Property(node) {
        if (!isInsideStylexCreate(node)) return;

        const property = keyOf(node);
        if (!RING_APPEARANCE.has(property)) return;
        if (node.value?.type !== 'ObjectExpression') return;

        for (const condition of node.value.properties) {
          const key = keyOf(condition);
          if (isFocusVisibleKey(key) && drawsARing(condition.value)) {
            context.report({
              node: condition,
              messageId: 'handRolledRing',
              data: {property, key},
            });
          }
        }
      },
    };
  },
};

export default rule;
