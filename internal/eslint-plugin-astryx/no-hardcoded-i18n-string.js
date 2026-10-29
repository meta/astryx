// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-hardcoded-i18n-string.js
 * @description Disallow hardcoded English in user-facing text sinks and
 * formatter/helper returns. Any package that ships translatable UI can enable
 * this rule; scope it with the standard flat-config `files: [...]` pattern.
 *
 * The rule itself is filesystem-agnostic — it does not hardcode any path.
 * The caller decides where to run it via `files` / `ignores` in the ESLint
 * config, and where the i18n runtime itself lives via `ignores`.
 *
 * Flags:
 *   1. JSX attributes named like *Label / *Text / *Placeholder / *Title
 *      / *Message / *Tooltip / *Hint / *Description / *Summary, plus
 *      `label`, `placeholder`, `title`, `tooltip`, `text`, `summary`,
 *      `message`, `description`, `hint`, and the specific `aria-*`
 *      attributes that take user-visible text (`aria-label`,
 *      `aria-description`, `aria-placeholder`, `aria-roledescription`,
 *      `aria-valuetext`, `aria-braillelabel`, `aria-brailleroledescription`,
 *      `aria-keyshortcuts`), when the value is a hardcoded string literal
 *      that "looks user-facing". Other `aria-*` attributes (aria-controls,
 *      aria-expanded, aria-hidden, …) take IDs / booleans / enums and are
 *      NOT flagged.
 *   2. Object property assignments of the same names inside .tsx files.
 *   3. Destructure defaults (`function Foo({label = 'X'})`) of the same names.
 *   4. Call arguments: hardcoded first arguments to configured callees
 *      (default: `announce`, the live-region announcer returned by
 *      `useAnnounce()`). Matches by CALLEE NAME only — no import/scope
 *      tracing — so any local function named `announce` is checked. That is
 *      a deliberate simplicity tradeoff: false positives require shadowing
 *      the hook's conventional name, which the codebase does not do.
 *      The argument is walked the same way JSX attribute values are, so
 *      literals reached through a ternary or an `||`/`??` fallback and the
 *      literal chunks of an interpolated template are flagged too;
 *      identifiers and t(...) results are allowed.
 *   5. Returns from format* and get*String/Text/Label/Message helpers, including
 *      expression-bodied arrows. Helper names are a heuristic, not data-flow
 *      analysis. Obvious CSS serializer names (color, style, shadow, transform,
 *      gradient, length, angle, RGB/HSL/hex) are excluded; text-sink suffixes
 *      such as formatColorLabel remain checked. Standalone px/s/ms/deg unit
 *      chunks after interpolations are CSS fragments, not English. Nested
 *      callbacks are not the enclosing helper's returns. Concatenations and
 *      TypeScript assertions are walked along with templates and fallbacks.
 *
 * Ignores:
 *   - Test files (*.test.*, __tests__/**)
 *   - Storybook stories (*.stories.*)
 *   - Doc files (*.doc.mjs)
 *   - JSDoc @example blocks (comments)
 *   - Values that look non-user-facing (lowercase identifier-only, empty, etc.)
 *
 * Good:
 *   <button aria-label={t('foo.label')}>
 *   {label: t('powersearch.operator.contains')}
 *   function Foo({label: labelFromProps}) {
 *     const label = labelFromProps ?? t('foo.label');
 *   }
 *
 * Good:
 *   announce(t('tokenizer.announce.added', {label}));
 *   announce(message);
 *
 * Bad:
 *   <button aria-label="Close">
 *   {key: 'contains', label: 'contains'}
 *   function Foo({label = 'Cancel'})
 *   announce('Copied');
 *   announce(n === 0 ? 'No results' : 'Results found');
 *   announce(`Added ${label}`);
 *
 * Options:
 *   callees: string[] — function names whose first argument is a user-facing
 *     text sink. Default: ['announce'].
 *   allowedCalleeStrings: string[] — exact string values temporarily exempted
 *     from the callee check (grandfathered sites tracked for removal).
 *     Default: [].
 */

/**
 * Attribute / property names that we consider user-facing text sinks.
 * Exact matches AND suffix-match patterns.
 */
const EXACT_NAMES = new Set([
  'label',
  'placeholder',
  'title',
  'tooltip',
  'text',
  'summary',
  'message',
  'description',
  'hint',
]);

/**
 * `aria-*` attributes whose values are user-visible text per WAI-ARIA 1.3.
 * All other aria-* attributes take IDs, booleans, tristates, integers, or
 * enum tokens — not translatable prose — so we deliberately do NOT flag them.
 */
const ARIA_TEXT_ATTRS = new Set([
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'aria-braillelabel',
  'aria-brailleroledescription',
  // Note: aria-keyshortcuts contains keyboard key names ("Alt+Shift+P"); those
  // are typically NOT translated (key names are usually a locale/OS concern
  // handled by the platform), but consumers who DO want to localize should
  // still route them through i18n — we include it to prevent hardcoded English
  // key hints from slipping in.
  'aria-keyshortcuts',
]);

/**
 * Suffix patterns for user-facing prop names. Any prop name ending in
 * one of these is flagged.
 */
const SUFFIX_PATTERNS = [
  /Label$/,      // saveButtonLabel, cancelLabel, previousLabel, ...
  /Text$/,       // emptySearchText, helperText, errorText, ...
  /Placeholder$/,// searchPlaceholder, timePlaceholder, ...
  /Title$/,      // dialogTitle, ...
  /Message$/,    // disabledMessage, errorMessage, ...
  /Tooltip$/,    // ...
  /Hint$/,       // ...
  /Description$/,// ...
  /Summary$/,    // ...
];

function isUserFacingName(name) {
  if (typeof name !== 'string') return false;
  if (EXACT_NAMES.has(name)) return true;
  if (ARIA_TEXT_ATTRS.has(name)) return true;
  for (const pat of SUFFIX_PATTERNS) {
    if (pat.test(name)) return true;
  }
  return false;
}

/**
 * Heuristic — does this string LOOK like user-facing English?
 *   - Non-empty, longer than 1 char.
 *   - Starts with a capital, OR contains a space, OR ends with punctuation.
 *   - Not obviously an identifier (single lowercase word, all-caps constant).
 *   - Not a URL, path, or data: URI.
 */
function looksUserFacing(value) {
  if (typeof value !== 'string') return false;
  if (value.length < 2) return false;
  if (value.length > 200) return false; // probably not a UI label
  // URL / path / data
  if (
    value.startsWith('/') ||
    value.startsWith('http') ||
    value.startsWith('data:') ||
    value.startsWith('#') ||
    value.startsWith('.')
  ) {
    return false;
  }
  // All-caps enum constant like `IS_ANY_OF`
  if (value === value.toUpperCase() && /[A-Z_]/.test(value) && !/\s/.test(value)) {
    return false;
  }
  // Single lowercase word (identifier-shaped: `contains`, `email`, `foo123`)
  if (/^[a-z][a-z0-9]*$/.test(value)) return false;
  // Has a space, OR starts with uppercase, OR ends with ., …, !, ?
  const hasSpace = /\s/.test(value);
  const startsUpper = /^[A-Z]/.test(value);
  const endsWithPunct = /[.…!?]$/.test(value);
  return hasSpace || startsUpper || endsWithPunct;
}

const IGNORED_FILE_PATTERNS = [
  /\.test\./,
  /\.stories\./,
  /\.doc\.mjs$/,
  /__tests__/,
  /\.perf\.test\./,
];

function shouldIgnoreFile(filename) {
  return IGNORED_FILE_PATTERNS.some(p => p.test(filename));
}

/**
 * Walk into an expression and report any hardcoded user-facing string
 * literals found in the leaves. Handles the common patterns that slip past
 * a plain-literal check:
 *
 *   aria-label={isOpen ? 'Close X' : 'Open X'}     // ConditionalExpression
 *   aria-label={cond && 'Something'}                // LogicalExpression
 *   aria-label={fallback ?? 'Default label'}        // LogicalExpression
 *   aria-label={`Clear ${label}`}                   // TemplateLiteral
 *   aria-label={'Static'}                           // Literal in a container
 *
 * Deliberately does NOT walk into call expressions, member accesses,
 * identifiers, JSX expressions, or arbitrary function bodies — those are
 * either already handled (t() calls) or too likely to false-positive.
 *
 * `opts.messageId` overrides the reported message (the call-argument surface
 * has its own wording); `opts.allowed` is a Set of exact string values to skip.
 */
function reportUserFacingLiteralsIn(expr, name, context, isDefault, opts = {}) {
  if (expr == null) return;
  const messageId =
    opts.messageId ?? (isDefault ? 'hardcodedDefault' : 'hardcodedString');
  const allowed = opts.allowed;
  // Returns true when a report was actually emitted (i.e. not allowlisted).
  const report = (node, value) => {
    if (opts.requireEnglish && !/[A-Za-z]/.test(value)) return false;
    if (allowed?.has(value)) return false;
    context.report({
      node,
      messageId,
      data: {value: JSON.stringify(value), name},
    });
    return true;
  };
  switch (expr.type) {
    case 'Literal':
      if (typeof expr.value === 'string' && looksUserFacing(expr.value)) {
        report(expr, expr.value);
      }
      return;
    case 'TemplateLiteral':
      for (const [index, quasi] of expr.quasis.entries()) {
        const raw = quasi.value?.cooked ?? quasi.value?.raw ?? '';
        // A unit directly following an interpolation is CSS, not English.
        // Keep space-separated display units and prose such as "s remaining".
        if (opts.requireEnglish && index > 0 && /^(?:px|s|ms|deg)\s*$/.test(raw)) {
          continue;
        }
        if (typeof raw === 'string' && looksUserFacing(raw)) {
          // One report per template is enough.
          if (report(quasi, raw)) return;
        }
      }
      for (const expression of expr.expressions) {
        reportUserFacingLiteralsIn(expression, name, context, isDefault, opts);
      }
      return;
    case 'BinaryExpression':
      if (expr.operator === '+') {
        reportUserFacingLiteralsIn(expr.left, name, context, isDefault, opts);
        reportUserFacingLiteralsIn(expr.right, name, context, isDefault, opts);
      }
      return;
    case 'TSAsExpression':
    case 'TSTypeAssertion':
    case 'TSNonNullExpression':
    case 'TSSatisfiesExpression':
      reportUserFacingLiteralsIn(
        expr.expression,
        name,
        context,
        isDefault,
        opts,
      );
      return;
    case 'ConditionalExpression':
      reportUserFacingLiteralsIn(expr.consequent, name, context, isDefault, opts);
      reportUserFacingLiteralsIn(expr.alternate, name, context, isDefault, opts);
      return;
    case 'LogicalExpression':
      // Only the right side can be a fallback/default string; the left is a
      // condition and its string identity doesn't matter for i18n.
      reportUserFacingLiteralsIn(expr.right, name, context, isDefault, opts);
      return;
    // Anything else (CallExpression like t(...), MemberExpression,
    // Identifier, ArrowFunctionExpression body, JSXExpression, etc.) — skip.
    default:
      return;
  }
}

function isFormatterName(name) {
  if (typeof name !== 'string') return false;
  if (
    !/^format(?:[A-Z_]|$)|^get(?:[A-Z].*)?(?:String|Text|Label|Message)$/.test(name)
  ) {
    return false;
  }
  // These names describe CSS output, not interface copy. A text-sink suffix
  // still wins: formatColorLabel is not a color serializer.
  return !/(?:CSS|Css|Style|Styles|Color|Shadow|Transform|Gradient|Length|Angle|RGB|Rgb|HSL|Hsl|Hex|Transition|Font|Border|GridTemplate|ClassName|MediaQuery|Selector|Path)(?:String|Value)?$/.test(
    name,
  );
}

function getFunctionName(node) {
  const parent = node.parent;
  if (
    parent?.type === 'VariableDeclarator' &&
    parent.id.type === 'Identifier'
  ) {
    return parent.id.name;
  }
  if (
    (parent?.type === 'Property' || parent?.type === 'MethodDefinition' || parent?.type === 'PropertyDefinition') &&
    !parent.computed
  ) {
    return parent.key.type === 'Identifier'
      ? parent.key.name
      : parent.key.value;
  }
  if (parent?.type === 'AssignmentExpression' && parent.right === node) {
    const target = parent.left;
    if (target.type === 'Identifier') return target.name;
    if (target.type === 'MemberExpression' && !target.computed) return target.property.name;
  }
  if (
    parent?.type === 'CallExpression' && parent.arguments[0] === node &&
    parent.callee.type === 'Identifier' &&
    (parent.callee.name === 'useCallback' || parent.callee.name === 'useMemo')
  ) {
    return getFunctionName(parent);
  }
  return node.id?.name;
}

function isFunction(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  );
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hardcoded user-facing strings; route through useTranslator() instead',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      hardcodedString:
        'Hardcoded user-facing string {{value}} in `{{name}}`. ' +
        'Route through `t(\'<namespace>.<component>.<key>\')` via `useTranslator()` so it can be localized.',
      hardcodedDefault:
        'Hardcoded default {{value}} for prop `{{name}}`. ' +
        'Use the alias-and-resolve pattern: `{{name}}: {{name}}FromProps` in the destructure, then ' +
        '`const {{name}} = {{name}}FromProps ?? t(\'<namespace>.<component>.<key>\');` inside the body.',
      hardcodedReturn:
        'Hardcoded user-facing string {{value}} returned by `{{name}}()`. ' +
        'Use one catalog message via the provider-bound translator instead of constructing English text.',
      hardcodedCallArg:
        'Hardcoded user-facing string {{value}} passed to `{{name}}()`. ' +
        'Route through `t(\'<namespace>.<component>.<key>\')` via `useTranslator()` so it can be localized.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          callees: {
            type: 'array',
            items: {type: 'string'},
          },
          allowedCalleeStrings: {
            type: 'array',
            items: {type: 'string'},
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const filename = context.filename;
    if (shouldIgnoreFile(filename)) return {};

    const options = context.options[0] || {};
    const callees = new Set(options.callees ?? ['announce']);
    const allowedCalleeStrings = new Set(options.allowedCalleeStrings ?? []);

    return {
      ReturnStatement(node) {
        let owner = node.parent;
        while (owner && !isFunction(owner)) owner = owner.parent;
        const name = owner && getFunctionName(owner);
        if (!isFormatterName(name)) return;
        reportUserFacingLiteralsIn(node.argument, name, context, false, {
          messageId: 'hardcodedReturn',
          requireEnglish: true,
        });
      },

      ArrowFunctionExpression(node) {
        if (node.body.type === 'BlockStatement') return;
        const name = getFunctionName(node);
        if (!isFormatterName(name)) return;
        reportUserFacingLiteralsIn(node.body, name, context, false, {
          messageId: 'hardcodedReturn',
          requireEnglish: true,
        });
      },

      // 1. JSX attribute string literals:  <X label="Cancel">
      JSXAttribute(node) {
        if (!node.name || node.name.type === 'JSXNamespacedName') return;
        const name =
          node.name.type === 'JSXIdentifier'
            ? node.name.name
            : null;
        if (!isUserFacingName(name)) return;

        // 1. Bare string-literal attribute: <X label="Cancel">
        if (
          node.value?.type === 'Literal' &&
          typeof node.value.value === 'string'
        ) {
          const val = node.value.value;
          if (!looksUserFacing(val)) return;
          context.report({
            node: node.value,
            messageId: 'hardcodedString',
            data: {value: JSON.stringify(val), name},
          });
          return;
        }

        // 2. Expression container: <X aria-label={...}>. Walk the expression
        //    for hardcoded literals nested inside ternaries, logical
        //    expressions, or template literals — these are common i18n
        //    smells (isOpen ? 'Close' : 'Open'; `Clear ${label}`).
        if (node.value?.type === 'JSXExpressionContainer') {
          reportUserFacingLiteralsIn(
            node.value.expression,
            name,
            context,
            /*isDefault*/ false,
          );
        }
      },

      // 2. Object property `label: 'Xxx'`
      Property(node) {
        if (node.computed || node.shorthand) return;
        const name =
          node.key.type === 'Identifier'
            ? node.key.name
            : node.key.type === 'Literal'
            ? node.key.value
            : null;
        if (!isUserFacingName(name)) return;
        if (
          node.value.type !== 'Literal' ||
          typeof node.value.value !== 'string'
        )
          return;
        const val = node.value.value;
        if (!looksUserFacing(val)) return;
        context.report({
          node: node.value,
          messageId: 'hardcodedString',
          data: {value: JSON.stringify(val), name},
        });
      },

      // 3. Destructure default: `function Foo({label = 'X'} : Props)`
      //    ObjectPattern > Property with a shorthand-alike `key = default` pattern.
      //    In AST that's an AssignmentPattern whose parent is a Property in an ObjectPattern.
      AssignmentPattern(node) {
        // Only when we're the value of a Property inside an ObjectPattern
        if (
          node.parent?.type !== 'Property' ||
          node.parent.parent?.type !== 'ObjectPattern'
        )
          return;
        const property = node.parent;
        const name =
          property.key.type === 'Identifier'
            ? property.key.name
            : property.key.type === 'Literal'
            ? property.key.value
            : null;
        if (!isUserFacingName(name)) return;
        reportUserFacingLiteralsIn(
          node.right,
          name,
          context,
          /*isDefault*/ true,
        );
      },

      // 4. Call argument: `announce('Copied')`
      //    Matches by callee NAME only (no import/scope tracing) — see the
      //    file header for the rationale and limitation. The argument goes
      //    through the same walk as JSX attribute values, so a ternary or an
      //    interpolated template is caught like a bare literal.
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return;
        const name = node.callee.name;
        if (!callees.has(name)) return;
        const arg = node.arguments[0];
        if (arg == null) return;

        reportUserFacingLiteralsIn(arg, name, context, /*isDefault*/ false, {
          messageId: 'hardcodedCallArg',
          allowed: allowedCalleeStrings,
        });
      },
    };
  },
};

export default rule;
