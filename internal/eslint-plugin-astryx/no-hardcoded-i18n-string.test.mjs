// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-hardcoded-i18n-string.test.mjs
 * @description Tests for the no-hardcoded-i18n-string ESLint rule: formatter
 * returns, announce() live-region messages, and JSX-attribute anchors.
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import noHardcodedI18nStringRule from './no-hardcoded-i18n-string.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: {jsx: true},
    },
  },
});

// RuleTester registers its own describe/it blocks internally, so it
// must run at the top level. Vitest 4 forbids calling suite functions
// (describe/it) from inside another it() callback.
ruleTester.run('no-hardcoded-i18n-string', noHardcodedI18nStringRule, {
  valid: [
    // --- Call arguments (announce) ---
    // t(...) result is the pattern we want
    {code: "announce(t('codeblock.announce.copied'));"},
    // Variables are fine — we can't know their provenance
    {code: 'announce(message);'},
    // Interpolation-only template has no literal chunk to translate
    {code: 'announce(`${count}`);'},
    // A ternary between two t() results is the pattern we want
    {
      code: "announce(cond ? t('a.b.c') : t('a.b.d'));",
    },
    // Empty string (used to clear the live region) is not user-facing
    {code: "announce('');"},
    // Identifier-shaped single lowercase word is not user-facing
    {code: "announce('copied');"},
    // No arguments
    {code: 'announce();'},
    // Only the configured callees are checked (default: announce)
    {code: "notify('Something happened');"},
    // Member calls are not matched (callee-name matching only)
    {code: "screenReader.announce('Copied');"},
    // Allowlisted string (grandfathered site awaiting its sweep PR)
    {
      code: "announce('Copied');",
      options: [{allowedCalleeStrings: ['Copied']}],
    },
    // Test files are ignored by the rule itself
    {
      code: "announce('Copied');",
      filename: 'CodeBlock.test.tsx',
    },
    // Stories are ignored by the rule itself
    {
      code: "announce('Copied');",
      filename: 'CodeBlock.stories.tsx',
    },
    // --- Formatter/helper returns ---
    {code: "function formatLabel(count) { return t('items.count', {count}); }"},
    {code: "const getStatusText = () => t('status.ready');"},
    {code: 'const formatRangeDisplay = (start, end) => `${start} – ${end}`;'},
    {
      code: 'function formatDevMessage(prefix, message) { return `${prefix}: ${message}`; }',
    },
    {
      code: 'function formatShortcut(parts) { return `${parts[0]} + ${parts[1]}`; }',
    },
    {code: 'function formatValue(value) { return value; }'},
    {code: 'const formatCount = count => `${count}`;'},
    {code: "function getIdentifier() { return 'Internal value'; }"},
    {
      code: "function formatLabel() { function callback() { return 'Not its return'; } return label; }",
    },
    {code: "const formatLabel = () => { return () => 'Not its return'; };"},
    {code: 'function formatColor(r, g, b) { return `rgb(${r}, ${g}, ${b})`; }'},
    {code: 'const formatShadow = value => `0 0 ${value}px black`;'},
    {code: "function getStyleString() { return 'display: flex; gap: 4px'; }"},
    ...[
      'const formatTransition = ms => `opacity ${ms}ms ease`;',
      'const formatFont = size => `${size}px Inter, sans-serif`;',
      'const formatBorder = width => `${width}px solid currentColor`;',
      'const formatGridTemplate = count => `repeat(${count}, 1fr)`;',
      'const formatBoxShadowValue = y => `0 ${y}px 2px black`;',
      'const getPathString = width => `M 0 0 L ${width} 0`;',
      'const getMediaQueryString = width => `(min-width: ${width}px)`;',
      'const formatClassName = name => `${name} Button-root`;',
    ].map(code => ({code})),
    // CSS units adjacent to interpolated values are serializers, even when
    // the helper's name is generic or describes a motion role.
    {code: 'function format(x, y) { return `${x}px ${y}px`; }'},
    {
      code: 'function formatMotionRoleValue(duration, bounce) { return `${duration}s ${bounce}`; }',
    },
    ...['px', 's', 'ms', 'deg'].map(unit => ({
      code: `const format = (a, b) => \`\${a}${unit} \${b}${unit}\`;`,
    })),
    {code: 'const formatLength = size => `${size}px`;'},
    {
      code: "function formatLabel() { return 'No results'; }",
      filename: 'Labels.test.ts',
    },
    {
      code: "const getStatusText = () => 'Ready';",
      filename: 'Labels.stories.tsx',
    },
    {code: "function formatLabel() { return 'READY_STATE'; }"},
    {code: "function formatLabel() { return '/assets/icon.svg'; }"},
    // --- Pre-existing surfaces still behave ---
    {code: "<button aria-label={t('dialog.close')}>x</button>"},
  ],
  invalid: [
    // Plain hardcoded string
    {
      code: "announce('Copied');",
      errors: [{messageId: 'hardcodedCallArg'}],
    },
    {
      code: "announce('Selection cleared');",
      errors: [{messageId: 'hardcodedCallArg'}],
    },
    // Expression-free template literal is equivalent to a string literal
    {
      code: 'announce(`All selected`);',
      errors: [{messageId: 'hardcodedCallArg'}],
    },
    // Allowlist is exact-match — other strings still flagged
    {
      code: "announce('Removed item');",
      options: [{allowedCalleeStrings: ['Copied']}],
      errors: [{messageId: 'hardcodedCallArg'}],
    },
    // Custom callees option
    {
      code: "notify('Something happened');",
      options: [{callees: ['notify']}],
      errors: [{messageId: 'hardcodedCallArg'}],
    },
    // Ternary branches are walked, like an aria-label expression container
    {
      code: "announce(n === 0 ? 'No results found' : 'Results found');",
      errors: [
        {messageId: 'hardcodedCallArg'},
        {messageId: 'hardcodedCallArg'},
      ],
    },
    // Only the offending branch is reported
    {
      code: "announce(n === 0 ? t('a.b.empty') : 'Results found');",
      errors: [{messageId: 'hardcodedCallArg'}],
    },
    // Interpolated template: the literal chunks are still English
    {
      code: 'announce(`Added ${item.label}`);',
      errors: [{messageId: 'hardcodedCallArg'}],
    },
    {
      code: 'announce(`${count} of ${total} selected`);',
      errors: [{messageId: 'hardcodedCallArg'}],
    },
    // Fallback on the right of ?? / ||
    {
      code: "announce(emptyText ?? 'No results found');",
      errors: [{messageId: 'hardcodedCallArg'}],
    },
    // --- Formatter/helper returns ---
    ...[
      'const getAriaLabel = useCallback(count => `${count} items`, []);',
      'const getStatusText = useMemo(() => `Ready to go`, []);',
      "class Helpers { getStatusText = () => 'Ready'; }",
      "helpers.formatLabel = () => 'Ready';",
      "getStatusText = () => 'Ready';",
      "function format() { return 'No results'; }",
      "function getString() { return 'No results'; }",
      'function formatLabel(count) { return `${count} chars`; }',
      "function formatFileSize(bytes) { return bytes + ' B'; }",
      'const formatLabel = count => `${count} chars`;',
      'const formatLabel = function(count) { return `${count} chars`; };',
      "function getStatusString() { return 'Ready'; }",
      "const getStatusText = () => 'Ready';",
      "function getKeyLabel() { return 'Control'; }",
      "function getErrorMessage() { return 'Try again'; }",
      'const helpers = {formatLabel(count) { return `${count} chars`; }};',
      "class Helpers { getStatusText() { return 'Ready'; } }",
      "function formatLabel(count) { return (count + ' chars') as string; }",
      "function formatLabel(count) { return `${count}${' chars'}`; }",
      'function formatLabel(count) { return label ?? `${count} chars`; }',
      "function formatLabel() { return label || 'No results'; }",
      "function formatLabel() { return 'No ' + 'results'; }",
      "function outer() { function formatLabel() { return 'Ready'; } }",
    ].map(code => ({code, errors: [{messageId: 'hardcodedReturn'}]})),
    {
      code: "function formatLabel(count) { return count > 1 ? `${count} lines` : 'One line'; }",
      errors: [{messageId: 'hardcodedReturn'}, {messageId: 'hardcodedReturn'}],
    },
    // Non-CSS copy must not be exempted merely for mentioning a CSS term.
    {
      code: "function formatColorLabel() { return 'Choose a color'; }",
      errors: [{messageId: 'hardcodedReturn'}],
    },
    // A space between a number and its unit is display text, not CSS.
    ...['px', 's', 'ms', 'deg'].map(unit => ({
      code: `const format = value => \`\${value} ${unit}\`;`,
      errors: [{messageId: 'hardcodedReturn'}],
    })),
    // CSS-fragment exemptions must not hide prose or affect other sinks.
    ...[
      'function formatLabel(seconds, count) { return `${seconds}s ${count} remaining`; }',
      'function formatLabel(count) { return `${count} seconds remaining`; }',
      'function formatLabel(count, total) { return `${count} in ${total}`; }',
      "function formatLabel() { return 'px '; }",
    ].map(code => ({code, errors: [{messageId: 'hardcodedReturn'}]})),
    {
      code: 'announce(`${duration}s ${bounce}`);',
      errors: [{messageId: 'hardcodedCallArg'}],
    },
    // The callee allowlist must not exempt formatter returns.
    {
      code: "function formatLabel() { return 'Copied'; }",
      options: [{allowedCalleeStrings: ['Copied']}],
      errors: [{messageId: 'hardcodedReturn'}],
    },
    // Concatenation and assertions also preserve the older text sinks.
    {
      code: "announce('Added ' + label);",
      errors: [{messageId: 'hardcodedCallArg'}],
    },
    {
      code: "<X label={'Hello ' + name} />",
      errors: [{messageId: 'hardcodedString'}],
    },
    {
      code: "<X label={(name ?? 'No name') as string} />",
      errors: [{messageId: 'hardcodedString'}],
    },
    {
      code: "function Input({label = 'Hello ' + name}) {}",
      errors: [{messageId: 'hardcodedDefault'}],
    },
    {
      code: "<X aria-label={`${open ? 'Close' : 'Open'}`} />",
      errors: [{messageId: 'hardcodedString'}, {messageId: 'hardcodedString'}],
    },
    // --- Pre-existing surfaces still behave ---
    {
      code: '<button aria-label="Close">x</button>',
      errors: [{messageId: 'hardcodedString'}],
    },
  ],
});
