// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-raw-intl-locale.js
 * @description Forbid raw `Intl` access — direct formatter/method calls AND
 * any other reference to the global `Intl` object (aliasing, destructuring,
 * computed indexing) — outside the approved i18n infrastructure boundary.
 * Separately, forbid `navigator.language`/`navigator.languages` as a locale
 * source anywhere in the lint scope, in any position, not only as an
 * argument to an `Intl`/locale-method call.
 *
 * `InternationalizationProvider` is the sole user-facing locale source.
 * Shipped component code must read it through the public provider-aware
 * locale utilities (`useLocale()`, `useCollator()` from
 * `@astryxdesign/core/i18n`, or an existing formatting helper such as
 * `plainDateFormat`/`formatInstant`/`formatRelativeTime`/`formatFilterValue`) —
 * never construct an
 * `Intl` formatter or call a locale-sensitive prototype method directly.
 * Calls to the public date helpers are tracked through named imports, aliases,
 * and namespace imports and must pass their locale argument explicitly.
 * Passing an explicit locale expression does not satisfy this rule: a
 * hardcoded literal, `navigator.language`, or an arbitrary variable are all
 * still raw Intl access from the policy's point of view.
 *
 * Raw `Intl` is confined to two short, explicit lists below. Approved
 * implementations may call Intl directly but still require an explicit locale;
 * named test-oracle files may construct independent expected values. No ESLint
 * option can widen these boundaries.
 *
 * `navigator.language`/`navigator.languages` are rejected everywhere,
 * including inside an approved infrastructure file — the provider is the
 * only sanctioned entry point for a real locale, so infrastructure code must
 * still receive one from a caller rather than reading the host default
 * itself. This is a standalone check, not limited to Intl call arguments:
 * `recognition.lang = lang ?? navigator.language` is flagged even though no
 * `Intl` API is involved.
 *
 * `Intl.Locale` is not policed — any reference to it, however used, is out
 * of scope: it inspects a tag rather than formatting display output.
 * `Intl.Segmenter` called directly with grapheme segmentation (the
 * standards-defined default granularity) is exempt everywhere, infra or not
 * — grapheme boundaries do not vary meaningfully by locale, which is also why
 * `packages/core/src/utils/characters.ts` and
 * `packages/core/src/hooks/useStreamingText.ts` call it with no locale (their
 * `typeof Intl.Segmenter === 'function'` feature-detection read is also
 * exempt, since it constructs nothing). Any other `Intl.Segmenter`
 * granularity (word, sentence, …) is genuinely locale-sensitive and follows
 * the same rule as every other formatter — and, like every other formatter,
 * aliasing it defeats the exemption: only the direct
 * `new Intl.Segmenter(undefined, {granularity: 'grapheme'})` call shape (or
 * the `typeof` check) is recognized, not a variable that might hold it.
 *
 * Beyond the direct-call shape (`new Intl.X(...)`/`Intl.X(...)`), this rule
 * also flags any OTHER reference to the global `Intl` identifier outside an
 * approved file: `const DTF = Intl.DateTimeFormat`, `const {DateTimeFormat} =
 * Intl`, and `Intl[key]` all construct a formatter without ever appearing as
 * a call this rule's other checks can see, so the reference itself — not a
 * later call through the alias — is what gets reported.
 *
 * KNOWN LIMITATIONS (syntax-only, by design — see the repository's
 * `no-raw-intl-locale` README section for the full discussion):
 *   - This does not trace an alias back to its origin: `const lang =
 *     navigator.language; new Intl.DateTimeFormat(lang)` reports the
 *     `navigator.language` read but not the later `Intl` call as
 *     navigator-sourced (it still gets `rawIntlLocale`).
 *   - The locale-sensitive PROTOTYPE methods
 *     (toLocaleString/toLocaleDateString/toLocaleTimeString/
 *     toLocaleUpperCase/toLocaleLowerCase/localeCompare) are matched on
 *     METHOD NAME alone, with no knowledge of the receiver's type. A custom
 *     class that happens to define its own same-named method for unrelated,
 *     non-locale-sensitive behavior will still be flagged (a false
 *     positive); there is no receiver-type analysis available to a
 *     syntax-only rule. This has not surfaced in the current codebase.
 *   - A COMPUTED method name that isn't a literal or a no-substitution
 *     template — `date[computedMethodName]()` where `computedMethodName` is
 *     a variable — cannot be resolved to `'toLocaleString'` (or any other
 *     name) without value-flow analysis, so it is NOT caught. This mirrors
 *     the same limitation `Intl[key]` closes only for the `Intl` object
 *     itself (a static, nameable global), not for its methods on arbitrary
 *     receivers.
 */

// String/Date prototype methods that take a locale (or locales list) as
// their first argument. `localeCompare` is handled separately — its locale
// argument is second.
const LOCALE_FIRST_METHODS = new Set([
  'toLocaleString',
  'toLocaleDateString',
  'toLocaleTimeString',
  'toLocaleUpperCase',
  'toLocaleLowerCase',
]);

/**
 * Approved implementation files may construct direct Intl formatters and call
 * locale-sensitive methods only with a syntactically explicit locale. Named
 * test-oracle files may construct independent expected values so tests do not
 * reuse the production helper under test. Aliasing/destructuring Intl remains
 * forbidden in implementations; only test-oracle files trust arbitrary raw
 * Intl references.
 *
 * `navigator.language`/`navigator.languages` are never covered by either list.
 * Paths match against the end of the filename for absolute/relative parity;
 * every added file requires a rule-source change and focused rule test.
 */
const APPROVED_IMPLEMENTATION_FILES = [
  // Date formatting/parsing core.
  'packages/core/src/utils/plainDate.ts',
  'packages/core/src/utils/dateParser.ts',
  // Timestamp's absolute/relative formatters and tooltip zone resolution (the
  // latter's fixed en-US locale only probes identifier validity).
  'packages/core/src/Timestamp/formatInstant.ts',
  'packages/core/src/Timestamp/formatRelativeTime.ts',
  'packages/core/src/Timestamp/tooltipEntries.ts',
  'packages/core/src/PowerSearch/formatFilterValue.ts',
  // NumberInput's locale-aware read of typed and pasted text: it derives the
  // grouping/decimal separators and group sizes from Intl rather than a table.
  'packages/core/src/NumberInput/numberParser.ts',
  // TimeInput/DateTimeInput time text: the locale's hour cycle, digits,
  // separator and day-period words, read off Intl and parsed back.
  'packages/core/src/utils/timeFormat.ts',
  'packages/core/src/i18n/useCollator.ts',
  // Joins several catalog messages into one locale-correct list (INV8).
  'packages/core/src/i18n/useListFormatter.ts',
  'packages/charts/src/formatters.ts',
];

const APPROVED_TEST_ORACLE_FILES = [
  'packages/charts/src/formatters.test.ts',
  'packages/core/src/Calendar/Calendar.test.tsx',
  'packages/core/src/NumberInput/NumberInput.test.tsx',
  'packages/core/src/NumberInput/numberParser.test.ts',
  // The docblock grader's oracle: it re-derives the locale's separators and
  // group sizes from Intl so the prose is checked against something other
  // than the helper it grades.
  'packages/core/src/NumberInput/numberParser.docblock.test.ts',
  'packages/core/src/Table/plugins/tree/useTableTreeState.test.tsx',
  'packages/core/src/Timestamp/tooltipEntries.test.ts',
  'packages/core/src/PowerSearch/formatFilterValue.test.ts',
  'packages/core/src/Timestamp/Timestamp.test.tsx',
  'packages/core/src/i18n/__tests__/useListFormatter.test.tsx',
];

// These exact helper suites are the public default-behavior oracles. Production
// callers must pass locale explicitly even though the public APIs retain their
// deterministic defaults for backward compatibility.
const DATE_HELPER_DEFAULT_TEST_FILES = [
  'packages/core/src/utils/plainDate.test.ts',
  'packages/core/src/utils/dateParser.test.ts',
];

const DATE_HELPER_LOCALE_ARGUMENTS = new Map([
  ['plainDateFormat', 2],
  ['formatSharedDate', 2],
  ['parseDateInput', 1],
  ['isLocaleDayFirst', 0],
]);

const DATE_HELPER_IMPLEMENTATION_FILES = new Map([
  [
    'packages/core/src/utils/plainDate.ts',
    new Set(['plainDateFormat', 'formatSharedDate']),
  ],
  [
    'packages/core/src/utils/dateParser.ts',
    new Set(['parseDateInput', 'isLocaleDayFirst']),
  ],
]);

function unwrap(node) {
  let current = node;
  while (
    current?.type === 'ChainExpression' ||
    current?.type === 'TSAsExpression' ||
    current?.type === 'TSNonNullExpression' ||
    current?.type === 'TSTypeAssertion'
  ) {
    current = current.expression;
  }
  return current;
}

function staticPropertyName(member) {
  if (member?.type !== 'MemberExpression') {
    return null;
  }
  const property = unwrap(member.property);
  if (!member.computed && property?.type === 'Identifier') {
    return property.name;
  }
  if (
    member.computed &&
    property?.type === 'Literal' &&
    typeof property.value === 'string'
  ) {
    return property.value;
  }
  if (
    member.computed &&
    property?.type === 'TemplateLiteral' &&
    property.expressions.length === 0
  ) {
    return property.quasis[0].value.cooked;
  }
  return null;
}

function isUndefinedExpression(node) {
  const value = unwrap(node);
  return (
    value == null ||
    (value.type === 'Identifier' && value.name === 'undefined') ||
    (value.type === 'UnaryExpression' && value.operator === 'void')
  );
}

function segmenterUsesOnlyGraphemes(optionsNode) {
  const options = unwrap(optionsNode);
  if (options == null || isUndefinedExpression(options)) {
    return true;
  }
  if (options.type !== 'ObjectExpression') {
    return false;
  }

  let granularity = null;
  for (const property of options.properties) {
    if (property.type === 'SpreadElement') {
      return false;
    }
    if (property.type !== 'Property' || property.kind !== 'init') {
      continue;
    }
    const name = property.computed
      ? property.key.type === 'Literal' &&
        typeof property.key.value === 'string'
        ? property.key.value
        : null
      : property.key.type === 'Identifier'
        ? property.key.name
        : property.key.type === 'Literal'
          ? property.key.value
          : null;
    if (name === 'granularity') {
      granularity = unwrap(property.value);
    }
  }

  // ECMA-402 defaults Segmenter granularity to grapheme. A literal object with
  // no spread and no granularity therefore has the same intentionally
  // grapheme-only use as an explicit {granularity: 'grapheme'} here.
  if (granularity == null) {
    return true;
  }
  return granularity.type === 'Literal' && granularity.value === 'grapheme';
}

/**
 * Whether `identifier` resolves to the platform global of that name — i.e.
 * has no local declaration/parameter/import shadowing it in any enclosing
 * scope. Shared by the `Intl` and `navigator` checks below.
 */
function isGlobalBinding(sourceCode, identifier) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set?.get(identifier.name);
    if (variable) {
      return variable.defs.length === 0;
    }
    scope = scope.upper;
  }
  return true;
}

/**
 * Whether `node` is (possibly wrapped) `navigator.language` or
 * `navigator.languages`, with `navigator` resolving to the platform global —
 * a locally shadowed `navigator` (a parameter, an import, a local factory)
 * is not the browser global and must not be flagged.
 */
function isNavigatorLocale(sourceCode, node) {
  const value = unwrap(node);
  if (value?.type !== 'MemberExpression') {
    return false;
  }
  const object = unwrap(value.object);
  if (
    object?.type !== 'Identifier' ||
    object.name !== 'navigator' ||
    !isGlobalBinding(sourceCode, object)
  ) {
    return false;
  }
  const property = staticPropertyName(value);
  return property === 'language' || property === 'languages';
}

function normalizeFilename(filename) {
  return filename.replace(/\\/g, '/');
}

function isListedFile(filename, approvedFiles) {
  const normalized = normalizeFilename(filename);
  return approvedFiles.some(approved => normalized.endsWith(approved));
}

function findVariable(sourceCode, identifier) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set?.get(identifier.name);
    if (variable) {
      return variable;
    }
    scope = scope.upper;
  }
  return null;
}

function importSourceForSpecifier(specifier) {
  const declaration = specifier?.parent;
  return declaration?.type === 'ImportDeclaration' ? declaration.source : null;
}

function isDateHelperModule(source) {
  if (typeof source?.value !== 'string') {
    return false;
  }
  const value = source.value.replace(/\\/g, '/');
  if (
    value === '@astryxdesign/core' ||
    value === '@astryxdesign/core/utils' ||
    value.startsWith('@astryxdesign/core/utils/')
  ) {
    return true;
  }
  if (!value.startsWith('.')) {
    return false;
  }
  return (
    /(?:^|\/)(?:utils\/)?(?:plainDate|dateParser)$/.test(value) ||
    /(?:^|\/)utils$/.test(value)
  );
}

function importedName(specifier) {
  const imported = specifier?.imported;
  if (imported?.type === 'Identifier') {
    return imported.name;
  }
  return typeof imported?.value === 'string' ? imported.value : null;
}

function importedDateHelperName(sourceCode, callee) {
  if (callee?.type === 'Identifier') {
    const variable = findVariable(sourceCode, callee);
    const definition = variable?.defs.find(
      def =>
        def.type === 'ImportBinding' && def.node?.type === 'ImportSpecifier',
    );
    if (
      definition &&
      isDateHelperModule(importSourceForSpecifier(definition.node))
    ) {
      const name = importedName(definition.node);
      return DATE_HELPER_LOCALE_ARGUMENTS.has(name) ? name : null;
    }
    return null;
  }

  if (callee?.type !== 'MemberExpression') {
    return null;
  }
  const object = unwrap(callee.object);
  if (object?.type !== 'Identifier') {
    return null;
  }
  const variable = findVariable(sourceCode, object);
  const definition = variable?.defs.find(
    def =>
      def.type === 'ImportBinding' &&
      def.node?.type === 'ImportNamespaceSpecifier',
  );
  if (
    !definition ||
    !isDateHelperModule(importSourceForSpecifier(definition.node))
  ) {
    return null;
  }
  const name = staticPropertyName(callee);
  return DATE_HELPER_LOCALE_ARGUMENTS.has(name) ? name : null;
}

function localDateHelperName(sourceCode, filename, callee) {
  if (callee?.type !== 'Identifier') {
    return null;
  }
  const normalized = normalizeFilename(filename);
  let allowedNames = null;
  for (const [implementationFile, names] of DATE_HELPER_IMPLEMENTATION_FILES) {
    if (normalized.endsWith(implementationFile)) {
      allowedNames = names;
      break;
    }
  }
  if (!allowedNames?.has(callee.name)) {
    return null;
  }
  const variable = findVariable(sourceCode, callee);
  const isFunctionDeclaration = variable?.defs.some(
    def =>
      def.type === 'FunctionName' &&
      def.node?.type === 'FunctionDeclaration' &&
      def.node.id?.name === callee.name,
  );
  return isFunctionDeclaration ? callee.name : null;
}

/**
 * Whether `identifier` (an `Intl` reference) sits in a position that does
 * not read its VALUE at all — a non-computed property name (`x.Intl`) or an
 * object-literal key (`{Intl: 1}`) — and so must not be scope-resolved as a
 * reference to the global. `isGlobalBinding`'s scope walk would otherwise
 * match the global `Intl` for these positions too, since it only checks
 * "is a variable named Intl visible here", not "is this identifier used as
 * a value".
 */
function isNonReferencePosition(identifier) {
  const parent = identifier.parent;
  if (!parent) {
    return false;
  }
  if (parent.type === 'TSQualifiedName' && parent.left === identifier) {
    // Type-only reference such as `collator: Intl.Collator`; it emits no
    // runtime Intl access and is part of the public TypeScript contract.
    return true;
  }
  if (
    parent.type === 'MemberExpression' &&
    parent.property === identifier &&
    !parent.computed
  ) {
    return true;
  }
  if (
    (parent.type === 'Property' || parent.type === 'TSPropertySignature') &&
    parent.key === identifier &&
    !parent.computed &&
    parent.value !== identifier
  ) {
    return true;
  }
  return false;
}

/**
 * Whether `memberExpr` (an `Intl.<prop>` or `Intl[<prop>]` access) is used
 * as the callee of the New/Call expression it is immediately part of — the
 * shape `checkIntlFormatter` already owns end-to-end (including reporting).
 * The generic Intl-reference check defers to it here so the same occurrence
 * is never reported twice.
 */
function isDirectInvocationCallee(memberExpr) {
  const parent = memberExpr.parent;
  return (
    (parent?.type === 'CallExpression' || parent?.type === 'NewExpression') &&
    parent.callee === memberExpr
  );
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid raw Intl access outside approved infrastructure, navigator.language(s) as a locale source, and date-helper calls that omit provider locale',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      rawIntlLocale:
        'Do not call Intl directly. Use a public provider-aware locale ' +
        'utility instead (useLocale()/useCollator() from ' +
        '@astryxdesign/core/i18n, or an existing formatting helper such as ' +
        'plainDateFormat/formatInstant/formatRelativeTime/formatFilterValue) ' +
        'so the locale ' +
        'always traces back to InternationalizationProvider. An explicit ' +
        'locale argument does not satisfy this rule — literals, variables, ' +
        'and navigator.language are all still raw Intl access here. Raw ' +
        'Intl is reserved for the approved infrastructure files listed in ' +
        'internal/eslint-plugin-astryx/README.md.',
      rawIntlReference:
        'Do not reference the global Intl object outside the approved i18n ' +
        'infrastructure files. Aliasing (const DTF = Intl.DateTimeFormat), ' +
        'destructuring (const {DateTimeFormat} = Intl), or indexing with a ' +
        'computed key (Intl[key]) can construct a locale-sensitive ' +
        'formatter without ever appearing as the direct call this rule ' +
        'otherwise checks. Call the formatter directly inside an approved ' +
        'file, or use a public provider-aware locale utility ' +
        '(useLocale()/useCollator() from @astryxdesign/core/i18n) instead.',
      ambientIntlInImplementation:
        'Approved Intl implementation files must still pass an explicit locale. ' +
        'A missing, undefined, or void locale would reintroduce host-dependent behavior.',
      dateHelperLocale:
        'Pass the provider locale explicitly to {{helper}}. Read it with ' +
        'useLocale() in React code and thread it into pure helpers; omitted or ' +
        'undefined locale arguments fall back deterministically but do not ' +
        'follow InternationalizationProvider.',
      navigatorLocale:
        'Do not source a locale from navigator.language/navigator.languages, ' +
        'in any position — not only as an argument to Intl or a locale ' +
        'method. InternationalizationProvider is the sole locale source for ' +
        'Astryx — read it through the provider-aware locale utilities ' +
        'instead, even inside an approved i18n infrastructure file.',
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const filename = context.filename ?? context.getFilename();
    const implementationFile = isListedFile(
      filename,
      APPROVED_IMPLEMENTATION_FILES,
    );
    const testOracleFile = isListedFile(filename, APPROVED_TEST_ORACLE_FILES);

    function report(node, messageId) {
      context.report({node, messageId});
    }

    /** @returns whether the call/new-expression was an Intl formatter (handled either way) */
    function checkIntlFormatter(node) {
      const callee = unwrap(node.callee);
      if (callee?.type !== 'MemberExpression') {
        return false;
      }
      const object = unwrap(callee.object);
      if (
        object?.type !== 'Identifier' ||
        object.name !== 'Intl' ||
        !isGlobalBinding(sourceCode, object)
      ) {
        return false;
      }

      const formatter = staticPropertyName(callee);
      if (formatter === 'Locale') {
        // Intl.Locale inspects a tag; it never formats display output, so it
        // is out of scope regardless of how it's called.
        return true;
      }
      if (
        formatter === 'Segmenter' &&
        segmenterUsesOnlyGraphemes(node.arguments[1])
      ) {
        return true;
      }

      // Every other static member — a named formatter, an unrecognized
      // static API, or an unresolvable computed key (`Intl[key](...)`) —
      // funnels through the same navigator/infra check. A computed key that
      // can't be proven to be 'Locale' or a grapheme-only 'Segmenter' call
      // must not be silently allowed just because its name is unknown.
      const localeArg = node.arguments[0];
      if (isNavigatorLocale(sourceCode, localeArg)) {
        // Reported once by the standalone navigator visitor below.
      } else if (testOracleFile) {
        // Named tests may build independent Intl oracles, including the host
        // default where that is the behavior under test.
      } else if (implementationFile) {
        if (isUndefinedExpression(localeArg)) {
          report(node, 'ambientIntlInImplementation');
        }
      } else {
        report(node, 'rawIntlLocale');
      }
      return true;
    }

    function checkLocaleMethod(node) {
      const callee = unwrap(node.callee);
      if (callee?.type !== 'MemberExpression') {
        return;
      }
      const method = staticPropertyName(callee);

      let localeArg;
      if (LOCALE_FIRST_METHODS.has(method)) {
        localeArg = node.arguments[0];
      } else if (method === 'localeCompare') {
        localeArg = node.arguments[1];
      } else {
        return;
      }

      if (isNavigatorLocale(sourceCode, localeArg)) {
        // Reported once by the standalone navigator visitor below.
      } else if (testOracleFile) {
        // Named tests may use locale methods as independent oracles.
      } else if (implementationFile) {
        if (isUndefinedExpression(localeArg)) {
          report(node, 'ambientIntlInImplementation');
        }
      } else {
        report(node, 'rawIntlLocale');
      }
    }

    function checkDateHelperCall(node) {
      if (isListedFile(filename, DATE_HELPER_DEFAULT_TEST_FILES)) {
        return;
      }
      const callee = unwrap(node.callee);
      const helper =
        importedDateHelperName(sourceCode, callee) ??
        localDateHelperName(sourceCode, filename, callee);
      if (!helper) {
        return;
      }
      const localeArgumentIndex = DATE_HELPER_LOCALE_ARGUMENTS.get(helper);
      const localeArgument = node.arguments[localeArgumentIndex];
      if (
        isUndefinedExpression(localeArgument) ||
        localeArgument?.type === 'SpreadElement'
      ) {
        context.report({
          node,
          messageId: 'dateHelperLocale',
          data: {helper},
        });
      }
    }

    return {
      NewExpression(node) {
        checkIntlFormatter(node);
      },
      CallExpression(node) {
        if (!checkIntlFormatter(node)) {
          checkLocaleMethod(node);
        }
        checkDateHelperCall(node);
      },

      // Unconditional: navigator.language/languages is never an acceptable
      // locale source, in ANY position — an Intl argument, an assignment
      // target's value, a default parameter, anywhere. This is the single
      // place that reports `navigatorLocale`; the call-shape checks above
      // recognize the same expression and defer to this visitor instead of
      // reporting it a second time.
      MemberExpression(node) {
        if (isNavigatorLocale(sourceCode, node)) {
          report(node, 'navigatorLocale');
        }
      },

      // Any OTHER reference to the global `Intl` identifier — one not
      // already owned by checkIntlFormatter's direct-call handling above —
      // is raw Intl access outside an approved file: aliasing, destructuring,
      // or a bare computed-index read all construct a formatter without ever
      // being the direct call this rule's other checks can see.
      Identifier(node) {
        if (node.name !== 'Intl') {
          return;
        }
        if (isNonReferencePosition(node)) {
          return;
        }
        if (!isGlobalBinding(sourceCode, node)) {
          return;
        }

        const parent = node.parent;
        const isObjectOfMember =
          parent?.type === 'MemberExpression' && parent.object === node;

        if (isObjectOfMember && isDirectInvocationCallee(parent)) {
          // Owned by checkIntlFormatter (NewExpression/CallExpression
          // handlers above) — including its Locale/grapheme-Segmenter
          // exemptions and its own report-or-not decision. Reporting here
          // too would duplicate that diagnostic.
          return;
        }

        if (isObjectOfMember) {
          const property = staticPropertyName(parent);
          if (property === 'Locale') {
            // Bare `Intl.Locale` access (not a call) — e.g. `x instanceof
            // Intl.Locale` — is out of scope, same as the call form.
            return;
          }
          if (
            property === 'Segmenter' &&
            parent.parent?.type === 'UnaryExpression' &&
            parent.parent.operator === 'typeof'
          ) {
            // `typeof Intl.Segmenter === 'function'` feature-detection reads
            // the binding but constructs nothing; the two grapheme-only call
            // sites in this repo pair every such check with the direct call
            // form above, which is separately exempted.
            return;
          }
        }

        if (testOracleFile) {
          return;
        }
        report(node, 'rawIntlReference');
      },
    };
  },
};

export default rule;
