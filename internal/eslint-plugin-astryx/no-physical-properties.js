// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-physical-properties.js
 * @description Disallow physical left/right CSS properties (and physical
 *   left/right VALUES) inside stylex.create(). Physical properties don't flip
 *   under RTL; the CSS logical-property equivalents (inline-start/inline-end,
 *   start/end) do, so they're required for correct right-to-left rendering.
 *
 *   Three kinds of violation are detected:
 *   1. KEY-BASED — the object key is itself a banned physical property
 *      (e.g. `marginLeft`, `borderRightColor`, `left`, `borderTopLeftRadius`).
 *      The suggested fix renames the key to the logical equivalent.
 *   2. VALUE-BASED — the key is fine, but a specific physical VALUE is used
 *      (e.g. `textAlign: 'left'`, `float: 'right'`, `clear: 'left'`). The
 *      suggested fix replaces only the value; the key is left alone.
 *   3. RELATIONSHIP-BASED — a logical 50% inline anchor is paired with a
 *      physical horizontal translate under the same conditions, but has no RTL
 *      transform counterpart. Each declaration looks safe alone; together they
 *      displace the element by its own width under RTL.
 *
 *   EXCEPTION — inline centering: `left: '50%'` paired with a `translate`/
 *   `translateX` in the same style object is a deliberate, direction-symmetric
 *   centering idiom (physical anchor + physical translate reference the same
 *   edge). Logicalizing it to `insetInlineStart` BREAKS RTL centering, so the
 *   rule flags it with a distinct, non-autofixing message that points to the
 *   shared `rtlStyles.centerInline()` helper (the one sanctioned place the
 *   physical `left` lives, behind a single suppression).
 *
 * SEVERITY: shipped at `error` in both the `strict` and `recommended` tiers
 *   (see index.js). The RTL physical→logical migration is complete, so this
 *   rule gates against regressions rather than merely warning.
 *
 * AUTOFIX: this rule is fixable (`meta.fixable: 'code'`).
 *   - VALUE-BASED fixes are always safe: only the value literal is replaced.
 *   - KEY-BASED fixes rename the key token, but ONLY when the logical key is not
 *     already present in the same style object. If BOTH the physical and logical
 *     key are present, renaming would produce a duplicate property (and the two
 *     silently collide — last one wins in LTR), so instead of autofixing we
 *     surface a distinct `physicalKeyConflict` message for a human to resolve.
 *
 * READING TRANSFORMS — fail closed. Both centering diagnostics depend on what a
 *   sibling `transform` does to the inline axis, and BOTH act on the answer: the
 *   `left` rename rewrites code, and the logical-anchor report clears code as
 *   correct. An analysis that guesses in either direction is therefore a defect,
 *   not a rough edge, so `horizontalTranslate` splits the transform into its
 *   function calls, reads them IN ORDER (a list composes: a translation written
 *   after a `rotate`/`skew` is measured on axes this rule can no longer
 *   identify), and answers "none" only when it read every one of them.
 *   `matrix()`, `scaleX()`, a template interpolation, two horizontal
 *   translations, a translation composed after a rotation, and syntax it cannot
 *   parse all answer "unknown", which withholds the fix and reports;
 *   `compareTranslations` likewise recognises an
 *   RTL reversal only in a plain negated length with a matching unit, so
 *   `calc()` and `var()` no longer pass as compensation, and `-50%` against
 *   `50px` is reported as the mismatch it is.
 */

/**
 * Physical property KEYS → their CSS logical equivalent.
 * When one of these appears as an object key inside stylex.create(), flag it
 * and suggest the logical rename.
 *
 * The corner-radius mappings are diagonal-aware: a physical corner is named
 * <vertical><horizontal>, while the logical corner is named <block><inline>.
 *   top-left     → start(block) start(inline) → borderStartStartRadius
 *   top-right    → start(block) end(inline)   → borderStartEndRadius
 *   bottom-left  → end(block)   start(inline) → borderEndStartRadius
 *   bottom-right → end(block)   end(inline)   → borderEndEndRadius
 */
const PHYSICAL_KEY_MAP = {
  // Margin
  marginLeft: 'marginInlineStart',
  marginRight: 'marginInlineEnd',
  // Padding
  paddingLeft: 'paddingInlineStart',
  paddingRight: 'paddingInlineEnd',
  // Border side shorthands
  borderLeft: 'borderInlineStart',
  borderRight: 'borderInlineEnd',
  // Border side longhands (left)
  borderLeftWidth: 'borderInlineStartWidth',
  borderLeftStyle: 'borderInlineStartStyle',
  borderLeftColor: 'borderInlineStartColor',
  // Border side longhands (right)
  borderRightWidth: 'borderInlineEndWidth',
  borderRightStyle: 'borderInlineEndStyle',
  borderRightColor: 'borderInlineEndColor',
  // Inset
  left: 'insetInlineStart',
  right: 'insetInlineEnd',
  // Corner radii (diagonal-aware: vertical+horizontal → block+inline)
  borderTopLeftRadius: 'borderStartStartRadius',
  borderTopRightRadius: 'borderStartEndRadius',
  borderBottomLeftRadius: 'borderEndStartRadius',
  borderBottomRightRadius: 'borderEndEndRadius',
};

/**
 * Property KEYS whose physical left/right VALUES should be flagged. The key
 * itself is fine — only the specific physical value literal is a violation.
 * Maps `key → { physicalValue → logicalValue }`.
 */
const PHYSICAL_VALUE_MAP = {
  textAlign: {left: 'start', right: 'end'},
  float: {left: 'inline-start', right: 'inline-end'},
  clear: {left: 'inline-start', right: 'inline-end'},
};

export function isInsideStylexCreate(node) {
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
 * Stands in for a template-literal interpolation. It is a character CSS can
 * never contain, so any analysis that meets it knows it is looking at a value
 * only the runtime can resolve, instead of silently reading `${x}` as empty.
 */
const INTERPOLATION = '\u0000';

function getStaticValue(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return null;
}

function getStaticText(node) {
  const value = getStaticValue(node);
  if (value !== null) return value;
  if (node?.type === 'Literal') {
    // `null` is StyleX's own "no value in this branch", and a number is a
    // length this rule can read. Both are absences of a physical translation,
    // not values it failed to read.
    if (node.value === null) return '';
    if (typeof node.value === 'number') return String(node.value);
  }
  if (node?.type === 'Identifier' && node.name === 'undefined') return '';
  if (node?.type === 'TemplateLiteral') {
    return node.quasis.map(quasi => quasi.value.raw).join(INTERPOLATION);
  }
  return null;
}

/** Text this rule can read end to end — no interpolation, no unknown node. */
function isReadable(text) {
  return text !== null && !text.includes(INTERPOLATION);
}

function propertyName(property) {
  return property?.key?.name ?? property?.key?.value ?? null;
}

/**
 * Flatten a StyleX conditional value into its leaves. `default` is kept in the
 * path here and normalized only when conditions are compared.
 *
 * A leaf whose value is not a static string carries `text: null` rather than
 * being dropped: a value only the runtime knows (an identifier, a call, a
 * spread) is a value this rule cannot clear, and dropping it would let it pass
 * as an absence.
 */
function conditionalLeaves(node, path = []) {
  if (node?.type !== 'ObjectExpression') {
    return [{path, text: getStaticText(node)}];
  }

  return node.properties.flatMap(property => {
    if (property.type !== 'Property') return [{path, text: null}];
    const name = propertyName(property);
    if (typeof name !== 'string') return [{path, text: null}];
    return conditionalLeaves(property.value, [...path, name]);
  });
}

function isRtlCondition(condition) {
  return (
    /\[dir\s*=\s*["']rtl["']\]/.test(condition) ||
    /:dir\(\s*rtl\s*\)/.test(condition)
  );
}

function normalizedConditions(path) {
  return path.filter(
    condition => condition !== 'default' && !isRtlCondition(condition),
  );
}

function sameConditions(a, b) {
  const left = normalizedConditions(a);
  const right = normalizedConditions(b);
  return (
    left.length === right.length &&
    left.every((condition, index) => condition === right[index])
  );
}

/**
 * Where the horizontal (inline-axis) argument sits in each transform function
 * that can move an element along that axis.
 */
const HORIZONTAL_TRANSLATE_ARGUMENT = new Map([
  ['translate', 0],
  ['translatex', 0],
  ['translate3d', 0],
]);

/**
 * Transform functions that leave the inline axis alone AND leave the coordinate
 * system's axes where they were, so a later translation still means what it
 * says.
 *
 * `scale`, `scaleX`, `scale3d`, `matrix` and `matrix3d` are deliberately absent:
 * each can mirror or shift the horizontal axis (`scaleX(-1)` reverses it,
 * `matrix(a, b, c, d, tx, ty)` carries its own translation), so they are read as
 * unanalyzable rather than as harmless.
 */
const AXIS_PRESERVING = new Set([
  'scaley',
  'scalez',
  'translatey',
  'translatez',
]);

/**
 * Transform functions that ROTATE OR SHEAR the coordinate system. They add no
 * horizontal translation themselves, but every translation written after one is
 * measured along axes this rule can no longer identify.
 *
 * This is why order matters: `translateY(-50%) rotate(45deg)` translates along
 * the parent's vertical axis and then spins the element in place, while
 * `rotate(90deg) translateY(-50%)` rotates the axes FIRST, so the `translateY`
 * that follows moves the element HORIZONTALLY by half its height.
 */
const AXIS_CHANGING = new Set([
  'perspective',
  'rotate',
  'rotate3d',
  'rotatex',
  'rotatey',
  'rotatez',
  'skew',
  'skewx',
  'skewy',
]);

/**
 * Split a transform value into its function calls, or `null` when the text is
 * not a transform list this rule can read end to end.
 *
 * Arguments are split on TOP-LEVEL commas only, so `translate(calc(-50% + 4px),
 * 0)` keeps its first argument whole instead of being cut at the comma inside
 * `calc()` — the bug that made the old scan read `calc(-50%` as a value.
 */
function parseTransformFunctions(text) {
  const functions = [];
  let index = 0;

  while (index < text.length) {
    if (/[\s,]/.test(text[index])) {
      index += 1;
      continue;
    }

    const name = /^[A-Za-z][\w-]*/.exec(text.slice(index));
    if (!name) return null;
    index += name[0].length;
    while (index < text.length && /\s/.test(text[index])) index += 1;

    if (text[index] !== '(') {
      // `none` is the only bare keyword a transform list may hold.
      if (name[0].toLowerCase() === 'none') continue;
      return null;
    }

    const args = [];
    let argument = '';
    let depth = 1;
    index += 1;
    while (index < text.length && depth > 0) {
      const character = text[index];
      if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      if (depth === 0) break;
      if (character === ',' && depth === 1) {
        args.push(argument);
        argument = '';
      } else {
        argument += character;
      }
      index += 1;
    }
    if (depth !== 0) return null;
    args.push(argument);
    index += 1;

    functions.push({name: name[0].toLowerCase(), args});
  }

  return functions;
}

/** A length that moves nothing: `0`, `-0`, `0px`, `0%`. */
function isZeroLength(text) {
  return /^[-+]?0(?:\.0+)?[a-z%]*$/i.test(text.trim());
}

/**
 * The horizontal translation a transform value applies:
 *
 * - `null` — provably none, so a physical anchor beside it is untouched by any
 *   inline-axis shift;
 * - `{opaque: true}` — the value may translate horizontally and this rule
 *   cannot tell (a `matrix()`, a `scaleX()`, an interpolation in the horizontal
 *   argument, two horizontal translations that would have to be summed, a
 *   translation composed after the axes were rotated or sheared, or syntax it
 *   cannot read);
 * - `{value}` — exactly one horizontal translation, as written.
 *
 * Functions are read IN ORDER, because a transform list composes: each function
 * acts in the coordinate system the ones before it established. Once a rotate or
 * a skew has turned the axes, this rule can no longer say which direction a
 * later `translateY` moves — so everything after one is opaque, and only a
 * translation written before any of them is read at face value.
 *
 * Every unreadable shape lands in `opaque` rather than in `null`: an analysis
 * that cannot see a translation must not report that there is none, because
 * both callers treat "none" as permission to act.
 */
function horizontalTranslate(text) {
  if (text === null) return {opaque: true};

  const functions = parseTransformFunctions(text);
  if (functions === null) return {opaque: true};

  const values = [];
  let axesIntact = true;
  for (const {name, args} of functions) {
    if (AXIS_CHANGING.has(name)) {
      axesIntact = false;
      continue;
    }

    const argument = HORIZONTAL_TRANSLATE_ARGUMENT.get(name);
    if (argument === undefined) {
      // A translation along any axis becomes a horizontal one once the axes
      // have turned, so an "axis-preserving" function only preserves anything
      // while they are still where they started.
      if (AXIS_PRESERVING.has(name) && axesIntact) continue;
      return {opaque: true};
    }
    if (!axesIntact) return {opaque: true};

    const value = args[argument];
    if (value === undefined || !isReadable(value)) return {opaque: true};
    if (isZeroLength(value)) continue;
    values.push(value.trim());
  }

  if (values.length === 0) return null;
  // Two horizontal translations would have to be summed to be compared, and
  // `translateX(-50%) translateX(4px)` cannot be summed without layout.
  if (values.length > 1) return {opaque: true};
  return {value: values[0]};
}

/**
 * How an RTL translation relates to the default one it is meant to reverse:
 * `'opposite'`, `'not-opposite'`, or `'unknown'`.
 *
 * Only a plain signed number can be compared. `calc()` and `var()` resolve at
 * layout time and answer `'unknown'`, which is neither compensation nor a
 * proven break; a unit mismatch (`-50%` against `50px`) answers
 * `'not-opposite'`, because a percentage of the element's own width and a fixed
 * length do not cancel. The old check answered "compensated" to all three, so
 * an RTL branch that reversed nothing silenced the diagnostic.
 */
function compareTranslations(a, b) {
  const simple = /^([-+]?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]*)$/i;
  const left = simple.exec(a);
  const right = simple.exec(b);
  if (!left || !right) return 'unknown';
  if (left[2].toLowerCase() !== right[2].toLowerCase()) return 'not-opposite';
  return Number(left[1]) === -Number(right[1]) ? 'opposite' : 'not-opposite';
}

function siblingProperty(node, keyName) {
  const object = node.parent;
  if (object?.type !== 'ObjectExpression') return null;
  return (
    object.properties.find(
      property =>
        property.type === 'Property' && propertyName(property) === keyName,
    ) ?? null
  );
}

/**
 * Does the given ObjectExpression already contain a Property whose key is
 * `keyName`? Handles both identifier keys (`marginLeft`) and string-literal
 * keys (`'marginLeft'`).
 */
function objectHasKey(objectExpression, keyName) {
  if (!objectExpression || objectExpression.type !== 'ObjectExpression') {
    return false;
  }
  return objectExpression.properties.some(prop => {
    if (prop.type !== 'Property') return false;
    const name = prop.key?.name ?? prop.key?.value;
    return name === keyName;
  });
}

/**
 * The sibling `transform`'s leaves that carry (or may carry) a horizontal
 * translation, or `null` when there is no sibling `transform` at all.
 */
function horizontalTransformLeaves(node) {
  const transform = siblingProperty(node, 'transform');
  if (!transform) return null;
  return conditionalLeaves(transform.value)
    .map(leaf => ({...leaf, horizontal: horizontalTranslate(leaf.text)}))
    .filter(leaf => leaf.horizontal !== null);
}

/**
 * An anchor this rule can see IS the fixed 50% centering anchor.
 *
 * The relationship diagnostic judges only these. A variable anchor (`size *
 * ratio`, a token, an interpolation) is a position, not a centering idiom, and
 * this rule has never had an opinion about one.
 */
function isFixedCenteringAnchor(leaf) {
  return isReadable(leaf.text) && (leaf.text === '50%' || leaf.text === '-50%');
}

/**
 * An anchor that MIGHT be the fixed centering anchor — the same values, plus
 * any this rule could not read.
 *
 * Only the autofix uses this wider net: withholding a rename costs a developer
 * one manual edit, while applying it to an unread centering pair breaks RTL
 * silently.
 */
function mayBeCenteringAnchor(leaf) {
  return !isReadable(leaf.text) || isFixedCenteringAnchor(leaf);
}

/**
 * How a physical `left` relates to its sibling `transform`:
 *
 * - `null` — not the centering idiom, so the logical rename is safe;
 * - `{certain: true, value}` — a 50% anchor and a horizontal translate are
 *   active under the same conditions: the sanctioned centering idiom, which
 *   must NOT be renamed;
 * - `{certain: false}` — one side cannot be read, so whether this is centering
 *   is unknown and the rename must not be applied for it either.
 */
function inlineCenteringStatus(node) {
  const transforms = horizontalTransformLeaves(node);
  if (transforms === null) return null;

  let unknown = null;
  for (const anchor of conditionalLeaves(node.value)) {
    if (!mayBeCenteringAnchor(anchor)) continue;
    const matching = transforms.filter(leaf =>
      sameConditions(anchor.path, leaf.path),
    );
    if (matching.length === 0) continue;
    if (
      isReadable(anchor.text) &&
      matching.some(leaf => leaf.horizontal.value !== undefined)
    ) {
      return {certain: true, value: anchor.text};
    }
    unknown ??= {certain: false};
  }
  return unknown;
}

/**
 * Every fixed 50% logical inline anchor paired with a horizontal translate, and
 * what this rule could establish about each one.
 *
 * `compensated` is only ever true when an RTL branch provably reverses every
 * default translation. `certain` says whether the verdict is proven either way,
 * so a pairing whose reversal can be neither confirmed nor refuted — a `calc()`
 * against a `calc()`, a `matrix()`, an interpolated length — is reported as
 * unverified rather than as safe or as definitely broken.
 *
 * Both answers turn on the TRANSFORMS alone: once an RTL branch reverses the
 * default translation, the pair mirrors correctly whatever the anchor reads.
 */
export function logicalCenteringStatuses(node) {
  const transforms = horizontalTransformLeaves(node);
  if (transforms === null) return [];
  const statuses = [];

  for (const anchor of conditionalLeaves(node.value)) {
    if (!isFixedCenteringAnchor(anchor)) continue;
    const defaults = transforms.filter(
      leaf =>
        !leaf.path.some(isRtlCondition) &&
        sameConditions(anchor.path, leaf.path),
    );
    if (defaults.length === 0) continue;

    const rtlTransforms = transforms.filter(
      leaf =>
        leaf.path.some(isRtlCondition) &&
        sameConditions(anchor.path, leaf.path),
    );
    const readable = [...defaults, ...rtlTransforms].every(
      leaf => leaf.horizontal.value !== undefined,
    );
    const comparisons = defaultTransform =>
      rtlTransforms.map(rtlTransform =>
        compareTranslations(
          defaultTransform.horizontal.value,
          rtlTransform.horizontal.value,
        ),
      );
    const compensated =
      readable &&
      defaults.every(defaultTransform =>
        comparisons(defaultTransform).includes('opposite'),
      );
    // A mismatch is only stated as fact when every candidate reversal was
    // read and refuted; an RTL branch that cannot be compared leaves the
    // verdict unproven, and an absent RTL branch refutes nothing vacuously.
    const certain =
      compensated ||
      (readable &&
        defaults.every(defaultTransform =>
          comparisons(defaultTransform).every(
            comparison => comparison === 'not-opposite',
          ),
        ));
    statuses.push({compensated, certain, value: anchor.text});
  }
  return statuses;
}

function uncompensatedLogicalCentering(node) {
  return (
    logicalCenteringStatuses(node).find(status => !status.compensated) ?? null
  );
}

const rule = {
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Disallow physical left/right CSS properties and values, plus unsafe ' +
        'logical-centering transforms, inside stylex.create(). Use logical ' +
        'properties for directional placement and rtlStyles.centerInline() ' +
        'for fixed geometric centering.',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      physicalKey:
        'Use `{{logical}}` instead of `{{physical}}` for RTL support.',
      physicalValue:
        "Use `{{prop}}: '{{logical}}'` instead of " +
        "`{{prop}}: '{{physical}}'` for RTL support.",
      physicalKeyConflict:
        '`{{physical}}` conflicts with `{{logical}}` already set on this ' +
        'style object — remove `{{physical}}`.',
      inlineCentering:
        '`left: {{value}}` with a `translate` centers this element — do NOT ' +
        'rename it to `insetInlineStart` (that breaks centering under RTL). ' +
        'Use the shared `rtlStyles.centerInline(blockOffset)` helper instead.',
      inlineCenteringUnknown:
        '`left` is paired with a `transform` this rule cannot analyse, so ' +
        'renaming it to `insetInlineStart` could silently break RTL centering. ' +
        'Resolve it by hand, or use `rtlStyles.centerInline(blockOffset)`.',
      logicalCenteringTransform:
        '`{{property}}: {{value}}` flips its anchor under RTL, but its paired ' +
        'horizontal `translate` does not. Use `rtlStyles.centerInline(blockOffset)` ' +
        'for fixed centering, or add an opposite RTL transform for a variable position.',
      logicalCenteringUnverified:
        '`{{property}}` flips its anchor under RTL, and this rule cannot verify ' +
        'that its paired horizontal `translate` is reversed to match. Use ' +
        '`rtlStyles.centerInline(blockOffset)` for fixed centering, or write the ' +
        'RTL transform as a plain negated length so the pair can be checked.',
    },
    schema: [],
  },
  create(context) {
    return {
      Property(node) {
        if (!isInsideStylexCreate(node)) return;

        const propName = node.key?.name || node.key?.value;
        if (!propName) return;

        // KEY-BASED: the object key is itself a physical property.
        const logicalKey = PHYSICAL_KEY_MAP[propName];
        if (logicalKey) {
          // Special case: `left: '50%'` + a centering `translate` must NOT be
          // logicalized (it would break RTL centering). Point at the shared
          // helper instead, and do NOT autofix. When either side of that
          // pairing cannot be read, the rename is withheld too: an unreadable
          // transform may be centering this element, and a fix applied on a
          // guess corrupts the layout silently.
          const centering =
            propName === 'left' ? inlineCenteringStatus(node) : null;
          if (centering !== null) {
            context.report({
              node: node.key,
              messageId: centering.certain
                ? 'inlineCentering'
                : 'inlineCenteringUnknown',
              data: {value: centering.value},
            });
            return;
          }

          // Guard: if the logical key is ALSO present in the same object,
          // renaming would create a duplicate/silent collision. Ambiguous
          // which value the author meant — surface a distinct message, no fix.
          if (objectHasKey(node.parent, logicalKey)) {
            context.report({
              node: node.key,
              messageId: 'physicalKeyConflict',
              data: {
                physical: propName,
                logical: logicalKey,
              },
            });
            return;
          }

          // Preserve the original key's quoting: a string-literal key is
          // replaced with a quoted string; an identifier key stays unquoted.
          // All logical names are valid identifiers.
          const isStringLiteralKey =
            node.key.type === 'Literal' && typeof node.key.value === 'string';
          const newKeyText = isStringLiteralKey
            ? `'${logicalKey}'`
            : logicalKey;

          context.report({
            node: node.key,
            messageId: 'physicalKey',
            data: {
              physical: propName,
              logical: logicalKey,
            },
            fix(fixer) {
              return fixer.replaceText(node.key, newKeyText);
            },
          });
          return;
        }

        // RELATIONSHIP-BASED: a logical 50% anchor flips under RTL while a
        // physical horizontal translation does not. Inspect matching nested
        // media/state branches and accept an explicit opposite RTL transform.
        if (propName === 'insetInlineStart' || propName === 'insetInlineEnd') {
          const centering = uncompensatedLogicalCentering(node);
          if (centering !== null) {
            context.report({
              node: node.key,
              messageId: centering.certain
                ? 'logicalCenteringTransform'
                : 'logicalCenteringUnverified',
              data: {property: propName, value: centering.value},
            });
            return;
          }
        }

        // VALUE-BASED: the key is fine, but the value may be physical.
        const valueMap = PHYSICAL_VALUE_MAP[propName];
        if (valueMap) {
          const value = getStaticValue(node.value);
          if (value !== null && valueMap[value]) {
            const logicalValue = valueMap[value];
            context.report({
              node: node.value,
              messageId: 'physicalValue',
              data: {
                prop: propName,
                physical: value,
                logical: logicalValue,
              },
              fix(fixer) {
                return fixer.replaceText(node.value, `'${logicalValue}'`);
              },
            });
          }
        }
      },
    };
  },
};

export default rule;
