// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-hover-on-disabled.js
 * @description A `:hover` condition must be written so it cannot match a
 * disabled element.
 *
 * `:hover` keeps matching a disabled control. Browsers suppress its EVENTS,
 * not its styling, so a hover treatment declared on the enabled element is
 * still painted under the pointer — the control says "press me" while
 * refusing to be pressed.
 *
 * Nothing in StyleX takes it away for you. A `disabled` style that sets
 * `backgroundImage: 'none'` overrides the DEFAULT condition only: the
 * variant's `:hover` class survives the merge and wins the moment the pointer
 * arrives. Button shipped that bug in every variant, and it survived because
 * both halves read as correct in review.
 *
 * So the guard goes on the selector, where it cannot be missed:
 *
 *   BAD   backgroundColor: {default: 'transparent', ':hover': OVERLAY}
 *   GOOD  backgroundColor: {
 *           default: 'transparent',
 *           ':hover:where(:not(:disabled,[aria-disabled="true"]))': OVERLAY,
 *         }
 *
 * `:where()` contributes no specificity, so the guarded selector weighs
 * exactly what `:hover` weighed and every existing override still wins the
 * way it used to.
 *
 * The rule is unconditional — it does not try to guess which components have
 * a disabled state. On an element that can never be disabled the guard is a
 * no-op, and asking the question per component is what leaves the gaps. It is
 * autofixable: `eslint --fix` rewrites the key.
 *
 * SCOPE: `:hover` on the styled element ITSELF. A key that hovers something
 * else — `:is(th:hover *)`, `stylex.when.ancestor(':hover')` — styles a
 * descendant when an ANCESTOR is hovered, which is a different question (a
 * row may legitimately highlight around a disabled control) and is left
 * alone.
 *
 * PSEUDO-ELEMENTS: `:hover::after` and `:hover::before` are reported but never
 * autofixed. StyleX 0.19.0 ranks a key by the pseudo-classes it understands,
 * and a `:not()` guard in the same key as a pseudo-element drops the
 * pseudo-element's weight from the ranking (priority 8330 becomes 3240). The
 * guarded rule then loses to a plain `::after` rule at 8000, so the hover
 * treatment silently never paints (#5442 broke SelectableCard, Thumbnail and
 * ClickableCard's overlay this way). No spelling of the guard inside such a key
 * escapes it, so the fix for these keys is outside the selector: keep the
 * disabled case out in JS and silence the one key with a comment that says so.
 */

/** Zero-specificity guard appended to a self-hover selector. */
const GUARD = ':where(:not(:disabled,[aria-disabled="true"]))';

/**
 * Is this key a `:hover` on the styled element itself?
 *
 * Anything that hovers another element — a descendant combinator, or `:hover`
 * buried inside `:is()`/`:where()`/`:has()` — is out of scope, so the test is
 * deliberately narrow: the key must OPEN with `:hover`.
 */
function isSelfHoverKey(key) {
  return typeof key === 'string' && /^:hover(?![-\w])/.test(key);
}

/** Already guarded, in any spelling a hand might use. */
function hasDisabledGuard(key) {
  return /:not\([^)]*(?::disabled|\[aria-disabled)/.test(key);
}

/** Carries a pseudo-ELEMENT (`::after`, `::before`, ...). */
function hasPseudoElement(key) {
  return key.includes('::');
}

/**
 * Insert the guard, keeping any pseudo-ELEMENT last.
 *
 * `:hover::after` becomes `:hover<guard>::after` — a pseudo-element has to
 * end the selector, so the guard cannot simply be appended.
 */
function guardKey(key) {
  const pseudoElement = key.indexOf('::');
  if (pseudoElement === -1) return key + GUARD;
  return key.slice(0, pseudoElement) + GUARD + key.slice(pseudoElement);
}

function keyOf(property) {
  if (!property || property.type !== 'Property') return null;
  if (property.key?.type === 'Literal') return String(property.key.value);
  if (property.key?.type === 'Identifier' && !property.computed) {
    return property.key.name;
  }
  return null;
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
    fixable: 'code',
    docs: {
      description:
        'A :hover condition must be written so it cannot match a disabled element',
      category: 'Accessibility',
      recommended: true,
    },
    messages: {
      unguardedHover:
        "'{{key}}' still matches a disabled element — browsers suppress a disabled control's events, not its hover styling. " +
        "Write '{{fixed}}' instead (`:where()` adds no specificity, so overrides are unaffected).",
      unguardedHoverPseudoElement:
        "'{{key}}' still matches a disabled element, and the rule cannot autofix it: StyleX 0.19.0 drops the pseudo-element's " +
        'priority from a key that also carries a `:not()` guard, so a guarded `::after`/`::before` hover rule loses to a plain ' +
        'one and never paints. Keep the disabled case out in JS instead (apply the class only when the control is enabled) ' +
        'and silence this key with an eslint-disable comment that says so.',
      guardedHoverPseudoElement:
        "'{{key}}' is guarded, but StyleX 0.19.0 drops the pseudo-element's priority from a key that carries a `:not()` guard, " +
        'so a plain `::after`/`::before` rule outranks it and the hover treatment never paints. Drop the guard from the key, ' +
        'keep the disabled case out in JS (apply the class only when the control is enabled), and silence this key with an ' +
        'eslint-disable comment that says so.',
    },
    schema: [],
  },
  create(context) {
    return {
      Property(node) {
        if (!isInsideStylexCreate(node)) return;
        const key = keyOf(node);
        if (!isSelfHoverKey(key)) return;

        // No guard written into a pseudo-element key survives StyleX's
        // ranking, so these are reported without a fix, guarded or not.
        if (hasPseudoElement(key)) {
          context.report({
            node: node.key,
            messageId: hasDisabledGuard(key)
              ? 'guardedHoverPseudoElement'
              : 'unguardedHoverPseudoElement',
            data: {key},
          });
          return;
        }

        if (hasDisabledGuard(key)) return;

        const fixed = guardKey(key);
        context.report({
          node: node.key,
          messageId: 'unguardedHover',
          data: {key, fixed},
          fix(fixer) {
            // Only a string-literal key can be rewritten safely; an identifier
            // key cannot spell this selector in the first place.
            if (node.key.type !== 'Literal') return null;
            // The guard carries double quotes, so the result is single-quoted
            // unless its own content rules that out.
            const quoted = fixed.includes("'")
              ? JSON.stringify(fixed)
              : `'${fixed}'`;
            return fixer.replaceText(node.key, quoted);
          },
        });
      },
    };
  },
};

export default rule;
export {GUARD, guardKey, isSelfHoverKey, hasDisabledGuard, hasPseudoElement};
