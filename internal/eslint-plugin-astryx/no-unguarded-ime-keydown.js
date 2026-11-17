// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-unguarded-ime-keydown.js
 * @description Flag an `onKeyDown` handler on an editable surface that branches
 *   on a "command" key (Enter/Escape/arrows/Page/Home/End or a legacy
 *   `keyCode`/`which`) WITHOUT an IME composition guard.
 *
 *   THE BUG: for CJK (Korean/Japanese/Chinese) input, the browser fires
 *   `keydown` with `isComposing === true` (or the legacy `keyCode === 229`)
 *   BEFORE `compositionend` writes the pending syllable. A handler that reads
 *   `e.key === 'Enter'` (or `'Escape'`, an arrow, etc.) to accept a suggestion,
 *   select an option, submit, or close then misfires on the keystroke that was
 *   only meant to COMMIT the composition — e.g. it selects the highlighted
 *   option AND clears the field, so the IME's subsequent `compositionend`
 *   writes the pending syllable into the freshly-cleared input and a second
 *   spurious selection happens on the next real Enter.
 *
 *   THE FIX (already shipped reactively in Typeahead #4860, ChatComposerInput,
 *   PowerSearchEditPopover, Dialog, Tooltip): early-return when
 *   `isImeKeyEvent(e.nativeEvent)` is true. `isImeKeyEvent` lives in
 *   `packages/core/src/utils/ime.ts` and returns
 *   `event.isComposing === true || event.keyCode === 229`. This rule ENFORCES
 *   that guard so new editable surfaces can't reintroduce the bug silently.
 *
 * @see packages/core/src/utils/ime.ts (isImeKeyEvent)
 * @see https://github.com/meta/astryx/issues/4892
 *
 * SEVERITY: shipped at `warn` in BOTH tiers (see index.js). Selector and
 *   MultiSelector currently violate it and are fixed in a separate stream; a
 *   `warn` surfaces the debt everywhere (incl. CI) without failing the build.
 *   Promote to `error` in strict once those migrate (issue #4892).
 *
 * HEURISTIC (pragmatic AST + source-text scan, NOT dataflow — matches sibling
 *   rules like no-style-only-wrapper). It flags an `onKeyDown` JSX attribute
 *   only when ALL of:
 *     1. The element it is on is an EDITABLE surface (a `<textarea>`, an
 *        `<input>` whose `type` can host text composition — i.e. not
 *        checkbox/number/date/etc., see NON_COMPOSABLE_INPUT_TYPES — a
 *        `contentEditable` element, an element with `role="textbox"`/
 *        `"searchbox"`/`"combobox"`, or a known Astryx text-input component in
 *        EDITABLE_COMPONENTS) and is NOT an explicitly non-editable element
 *        (`<button>`, `<a>`, `role="button"`) — IME composition cannot run on a
 *        button even if it carries `role="combobox"` (this is exactly the
 *        Selector trigger case).
 *     2. Its handler (an inline arrow/function, OR a same-file identifier that
 *        resolves to a function/arrow/useCallback) branches on a COMMAND key —
 *        an `e.key`/`event.key` compared against Enter/Escape/arrow/Page/
 *        Home/End (or a `switch (e.key)` over those), OR reads a legacy
 *        `keyCode`/`which`.
 *     3. The handler body does NOT contain a composition guard: a source-text
 *        scan finds no `isImeKeyEvent(`, `.isComposing`, or `229`.
 *
 * INTENTIONAL FALSE-NEGATIVES (a noisy rule gets disabled — we prefer to miss):
 *   - Guard detection is a lenient text scan of the handler range: ANY mention
 *     of `isImeKeyEvent(`, `.isComposing`, or `229` marks the handler guarded,
 *     even if that mention is dead code or in a nested closure.
 *   - Handler indirection is resolved only ONE hop within the SAME file. A
 *     handler imported from another module, or reached through a variable that
 *     aliases another variable, is treated as "unknown" and NOT flagged.
 *   - Command-key detection is a text scan for the key names / `keyCode` /
 *     `which`; a handler that compares against a variable
 *     (`e.key === ENTER_KEY`) is not detected.
 *   - Editability of native tags is judged by JSX attributes present literally
 *     on the element; a `role`/`contentEditable` spread via `{...props}` is not
 *     seen.
 */

/**
 * `<input type="...">` values that CANNOT host IME text composition, so an
 * onKeyDown on them is not an IME hazard (a checkbox/number/date input never
 * runs a composition session). Any other type — including `text`, `search`,
 * `email`, an absent type, or a dynamic `type={...}` we can't read — is treated
 * as potentially composable and stays in scope.
 */
const NON_COMPOSABLE_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
  'range',
  'color',
  'number',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
  'hidden',
  'image',
]);

/**
 * Native tags / roles that can NEVER host IME composition. If the element is
 * one of these it is treated as non-editable even when it also carries an
 * editable role (e.g. the Selector trigger `<button role="combobox">`).
 */
const NON_EDITABLE_TAGS = new Set(['button', 'a']);
const NON_EDITABLE_ROLES = new Set([
  'button',
  'link',
  'menuitem',
  'tab',
  'option',
]);

/** ARIA roles that denote an editable text surface. */
const EDITABLE_ROLES = new Set(['textbox', 'searchbox', 'combobox']);

/**
 * Astryx components that render an underlying editable `<input>`/`<textarea>`
 * and forward `onKeyDown` to it. Matched by JSX element name.
 */
const EDITABLE_COMPONENTS = new Set([
  'TextInput',
  'TextArea',
  'Textarea',
  'NumberInput',
  'SearchInput',
  'Typeahead',
  'BaseTypeahead',
  'ComboBox',
  'Combobox',
  'ChatComposerInput',
]);

/** Command keys whose literal comparison in a handler indicates branching. */
const COMMAND_KEYS = [
  'Enter',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
];

/** JSX element name as a string (`input`, `TextInput`, `foo.Bar` -> `Bar`). */
function jsxName(nameNode) {
  if (!nameNode) return null;
  if (nameNode.type === 'JSXIdentifier') return nameNode.name;
  // JSXMemberExpression (e.g. Foo.Bar) — use the trailing property.
  if (nameNode.type === 'JSXMemberExpression')
    return jsxName(nameNode.property);
  return null;
}

/**
 * Read the static string value of a JSX attribute (`role="combobox"` ->
 * `combobox`). Returns null for expression-container / non-string values.
 */
function staticAttrValue(attr) {
  if (!attr || attr.type !== 'JSXAttribute') return null;
  const v = attr.value;
  if (v == null) return true; // boolean attribute present (e.g. contentEditable)
  if (v.type === 'Literal' && typeof v.value === 'string') return v.value;
  if (
    v.type === 'JSXExpressionContainer' &&
    v.expression?.type === 'Literal' &&
    typeof v.expression.value === 'string'
  ) {
    return v.expression.value;
  }
  return null;
}

/** Find a named attribute (case-insensitive on the React prop name). */
function findAttr(openingElement, name) {
  const lower = name.toLowerCase();
  return openingElement.attributes.find(
    a =>
      a.type === 'JSXAttribute' &&
      a.name?.type === 'JSXIdentifier' &&
      a.name.name.toLowerCase() === lower,
  );
}

/**
 * Is the element this `onKeyDown` is attached to an editable surface? Returns
 * false for buttons/links and button-ish roles even if an editable role is
 * also present (IME can't compose on them).
 */
function isEditableElement(openingElement) {
  const tag = jsxName(openingElement.name);
  if (tag == null) return false;

  const roleAttr = findAttr(openingElement, 'role');
  const role = roleAttr ? staticAttrValue(roleAttr) : null;

  // Hard non-editable: native button/anchor, or an explicit button-ish role.
  if (NON_EDITABLE_TAGS.has(tag)) return false;
  if (typeof role === 'string' && NON_EDITABLE_ROLES.has(role)) return false;

  // Native editable tags. For <input>, exclude non-text `type`s (checkbox,
  // number, date, …) that can't host IME composition. A dynamic/absent type is
  // treated as composable (stays in scope).
  if (tag === 'input') {
    const typeAttr = findAttr(openingElement, 'type');
    const typeVal = typeAttr ? staticAttrValue(typeAttr) : null;
    if (
      typeof typeVal === 'string' &&
      NON_COMPOSABLE_INPUT_TYPES.has(typeVal)
    ) {
      return false;
    }
    return true;
  }
  if (tag === 'textarea') return true;
  // Known Astryx text-input components.
  if (EDITABLE_COMPONENTS.has(tag)) return true;
  // contentEditable (present as boolean or ="true"/={true}).
  const ce = findAttr(openingElement, 'contentEditable');
  if (ce) {
    const val = staticAttrValue(ce);
    if (val === true || val === 'true' || val === '') return true;
    if (
      ce.value?.type === 'JSXExpressionContainer' &&
      ce.value.expression?.type === 'Literal' &&
      ce.value.expression.value === true
    ) {
      return true;
    }
  }
  // Editable ARIA role on a non-button element.
  if (typeof role === 'string' && EDITABLE_ROLES.has(role)) return true;

  return false;
}

/**
 * Resolve the handler NODE for an `onKeyDown` attribute value. Handles:
 *   - inline arrow/function expression
 *   - a same-file identifier bound to an arrow/function/useCallback(...) or a
 *     function declaration.
 * Returns the node whose source text should be scanned, or null if unknown.
 */
function resolveHandlerNode(attrValue, context) {
  if (!attrValue || attrValue.type !== 'JSXExpressionContainer') return null;
  const expr = attrValue.expression;
  if (expr == null) return null;

  if (
    expr.type === 'ArrowFunctionExpression' ||
    expr.type === 'FunctionExpression'
  ) {
    return expr;
  }

  if (expr.type === 'Identifier') {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const scope = sourceCode.getScope
      ? sourceCode.getScope(expr)
      : context.getScope();
    const resolved = findVariable(scope, expr.name);
    if (!resolved) return null;
    for (const def of resolved.defs) {
      if (def.type === 'FunctionName' && def.node) return def.node;
      if (def.node?.type === 'VariableDeclarator' && def.node.init) {
        return unwrapInit(def.node.init);
      }
    }
  }
  return null;
}

/** Walk a scope chain to find a variable by name. */
function findVariable(scope, name) {
  let current = scope;
  while (current) {
    const found = current.variables.find(v => v.name === name);
    if (found) return found;
    current = current.upper;
  }
  return null;
}

/**
 * Unwrap common wrappers around a handler initializer:
 *   const h = useCallback(() => {...}, [...])  -> the inner arrow
 *   const h = () => {...}                       -> the arrow itself
 */
function unwrapInit(init) {
  if (init == null) return null;
  if (
    init.type === 'ArrowFunctionExpression' ||
    init.type === 'FunctionExpression'
  ) {
    return init;
  }
  // useCallback(fn, deps) / React.useCallback(fn, deps) — first arg is the fn.
  if (init.type === 'CallExpression') {
    const callee = init.callee;
    const calleeName =
      callee?.type === 'Identifier'
        ? callee.name
        : callee?.type === 'MemberExpression'
          ? callee.property?.name
          : null;
    if (calleeName === 'useCallback' || calleeName === 'useMemo') {
      const first = init.arguments?.[0];
      if (
        first?.type === 'ArrowFunctionExpression' ||
        first?.type === 'FunctionExpression'
      ) {
        return first;
      }
    }
  }
  return null;
}

/**
 * Does the handler source text branch on a command key? Looks for either
 *   - a `.key` comparison / switch that mentions any COMMAND_KEYS literal, or
 *   - a legacy `keyCode` / `which` read.
 */
function branchesOnCommandKey(text) {
  const readsKey = /\.\s*key\b/.test(text);
  const mentionsCommandKey = COMMAND_KEYS.some(k =>
    new RegExp(`['"\`]${k}['"\`]`).test(text),
  );
  if (readsKey && mentionsCommandKey) return true;
  // Legacy numeric key reads are themselves command-key branching.
  if (/\.\s*(keyCode|which)\b/.test(text)) return true;
  return false;
}

/**
 * Lenient guard detection: any mention of a composition guard anywhere in the
 * handler body counts. Prefer false-negatives (miss) over false-positives.
 */
function hasImeGuard(text) {
  if (/\bisImeKeyEvent\s*\(/.test(text)) return true;
  if (/\.\s*isComposing\b/.test(text)) return true;
  if (/\bisComposing\b/.test(text)) return true;
  if (/\b229\b/.test(text)) return true;
  return false;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require an IME composition guard (isImeKeyEvent / isComposing) in an ' +
        'onKeyDown handler on an editable surface that branches on Enter/Escape/' +
        'arrow/Page/Home/End keys — otherwise CJK composition keystrokes misfire.',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/meta/astryx/issues/4892',
    },
    messages: {
      unguardedImeKeydown:
        'This `onKeyDown` on an editable surface branches on a command key ' +
        '(Enter/Escape/arrows/…) without an IME composition guard. A CJK ' +
        'composition keystroke fires `keydown` before `compositionend`, so it ' +
        'misfires this branch. Early-return on ' +
        '`isImeKeyEvent(e.nativeEvent)` (from ' +
        '`@astryxdesign/core/utils/ime`) before handling command keys.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    // Test/story fixtures intentionally exercise raw patterns.
    if (filename.includes('.test.') || filename.includes('.stories.')) {
      return {};
    }
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      JSXAttribute(node) {
        if (
          node.name?.type !== 'JSXIdentifier' ||
          node.name.name !== 'onKeyDown'
        ) {
          return;
        }
        const openingElement = node.parent;
        if (openingElement?.type !== 'JSXOpeningElement') return;

        if (!isEditableElement(openingElement)) return;

        const handlerNode = resolveHandlerNode(node.value, context);
        if (handlerNode == null) return;

        const text = sourceCode.getText(handlerNode);
        if (!branchesOnCommandKey(text)) return;
        if (hasImeGuard(text)) return;

        context.report({
          node: node,
          messageId: 'unguardedImeKeydown',
        });
      },
    };
  },
};

export default rule;
