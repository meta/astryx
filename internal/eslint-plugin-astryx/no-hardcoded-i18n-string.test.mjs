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
    // --- JSX children ---
    {code: "<span>{t('a.b.c')}</span>"},
    {code: '<span>{count}</span>'},
    {code: "<span>{formatValue?.(items) ?? t('a.b.count', {count})}</span>"},
    // Punctuation and number layout between interpolations is not English
    {code: '<span>{valueLength}/{maxLength}</span>'},
    {code: '<span>{`${a} – ${b}`}</span>'},
    {code: '<span>&times;</span>'},
    {code: '<span> · </span>'},
    // Line-break whitespace is not rendered, so this is one identifier-shaped word
    {code: '<span>\n  ok\n</span>'},
    // Attribute expression containers are not children
    {code: "<X data-state={open ? 'Open now' : 'Closed'} />"},
    // --- Object fields: punctuation-only template chunks ---
    {code: 'const x = {label: `${field}: ${value}`};'},
    {code: "const x = {label: t('a.b', {value})};"},
    // --- Local text-sink bindings ---
    {code: "const thumbLabel = isRange ? t('slider.min') : undefined;"},
    {code: 'const ariaLabel = `${prefix}: ${name}`;'},
    {code: 'const ariaLabel = label;'},
    // Non-sink names are not checked (no data-flow tracing)
    {code: "const status = 'Ready to go';"},
    {code: "const [label] = ['Destructured'];"},
    {
      code: "const displayPlaceholder = useMemo(() => placeholder ?? t('time.hint'), []);",
    },
    {
      code: "const thumbLabel = 'Minimum value';",
      filename: 'Slider.test.tsx',
    },
    // --- allowedStringsByFile ---
    {
      code: "const thumbLabel = 'Minimum value'; <span>Required</span>;",
      filename: '/repo/packages/core/src/Slider/Slider.tsx',
      options: [
        {
          allowedStringsByFile: {
            'Slider/Slider.tsx': ['Minimum value', 'Required'],
          },
        },
      ],
    },
    {
      code: 'const ariaLabel = `Resize column ${key}`;',
      filename: 'C:\\repo\\Table\\useTableColumnResize.tsx',
      options: [
        {
          allowedStringsByFile: {
            'Table/useTableColumnResize.tsx': ['Resize column '],
          },
        },
      ],
    },
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
    // --- JSX children ---
    {
      // A rendered fallback count is visible text, like a `label` prop.
      code: '<span>{formatValue?.(items) ?? `${items.length} selected`}</span>',
      errors: [
        {
          messageId: 'hardcodedString',
          data: {value: '" selected"', name: 'children'},
        },
      ],
    },
    {
      code: "<span>{count === 1 ? '1 filter' : `${count} filters`}</span>",
      errors: [{messageId: 'hardcodedString'}, {messageId: 'hardcodedString'}],
    },
    // JSX text is judged as rendered: the space next to an expression child
    // is output, so a one-word count suffix reads like a template chunk.
    {
      code: '<span>{count} items</span>',
      errors: [
        {
          messageId: 'hardcodedString',
          data: {value: '" items"', name: 'children'},
        },
      ],
    },
    {
      code: '<span>+{n} more</span>',
      errors: [
        {
          messageId: 'hardcodedString',
          data: {value: '" more"', name: 'children'},
        },
      ],
    },
    {
      code: '<span>\n  {count} items\n</span>',
      errors: [
        {
          messageId: 'hardcodedString',
          data: {value: '" items"', name: 'children'},
        },
      ],
    },
    {
      code: '<VisuallyHidden>Required</VisuallyHidden>',
      errors: [
        {
          messageId: 'hardcodedString',
          data: {value: '"Required"', name: 'children'},
        },
      ],
    },
    {
      code: '<>\n  No results found\n</>',
      errors: [
        {
          messageId: 'hardcodedString',
          data: {value: '"No results found"', name: 'children'},
        },
      ],
    },
    // --- Object fields walk templates and fallbacks ---
    {
      code: 'const row = {id, label: `Create "${trimmed}"`};',
      errors: [
        {
          messageId: 'hardcodedString',
          data: {value: '"Create \\""', name: 'label'},
        },
      ],
    },
    {
      code: "const item = {title: open ? 'Close panel' : 'Open panel'};",
      errors: [{messageId: 'hardcodedString'}, {messageId: 'hardcodedString'}],
    },
    {
      code: 'const option = {label: `${amount} ${unit} ago`};',
      errors: [{messageId: 'hardcodedString'}],
    },
    // --- Local text-sink bindings ---
    {
      code: "const thumbLabel = isRange ? (index === 0 ? 'Minimum value' : 'Maximum value') : undefined;",
      errors: [
        {
          messageId: 'hardcodedString',
          data: {value: '"Minimum value"', name: 'thumbLabel'},
        },
        {
          messageId: 'hardcodedString',
          data: {value: '"Maximum value"', name: 'thumbLabel'},
        },
      ],
    },
    {
      code: 'const ariaLabel = `Resize column ${columnKey}`;',
      errors: [
        {
          messageId: 'hardcodedString',
          data: {value: '"Resize column "', name: 'ariaLabel'},
        },
      ],
    },
    {
      code: "const emptyText = trigger.emptySearchText ?? 'No results';",
      errors: [{messageId: 'hardcodedString'}],
    },
    // A function bound to a text-sink name returns text.
    {
      code: "const displayPlaceholder = useMemo(() => { if (focused) { return is12h ? 'e.g., 2:30 PM' : 'e.g., 14:30'; } return placeholder; }, []);",
      errors: [
        {
          messageId: 'hardcodedReturn',
          data: {value: '"e.g., 2:30 PM"', name: 'displayPlaceholder'},
        },
        {
          messageId: 'hardcodedReturn',
          data: {value: '"e.g., 14:30"', name: 'displayPlaceholder'},
        },
      ],
    },
    {
      code: "const emptyLabel = () => 'Nothing here';",
      errors: [{messageId: 'hardcodedReturn'}],
    },
    // allowedStringsByFile is exact-value and file-scoped.
    {
      code: "const thumbLabel = 'Minimum value'; const emptyText = 'No results';",
      filename: '/repo/packages/core/src/Slider/Slider.tsx',
      options: [
        {allowedStringsByFile: {'Slider/Slider.tsx': ['Minimum value']}},
      ],
      errors: [
        {
          messageId: 'hardcodedString',
          data: {value: '"No results"', name: 'emptyText'},
        },
      ],
    },
    // An exempted chunk does not exempt the rest of its template.
    {
      code: 'const ariaLabel = `Resize column ${h} of ${total} total`;',
      filename: '/repo/Table/useTableColumnResize.tsx',
      options: [
        {
          allowedStringsByFile: {
            'Table/useTableColumnResize.tsx': ['Resize column '],
          },
        },
      ],
      errors: [
        {
          messageId: 'hardcodedString',
          data: {value: '" of "', name: 'ariaLabel'},
        },
      ],
    },
    {
      code: 'const x = <span>{count} items</span>;',
      filename: '/repo/PowerSearch/PowerSearch.tsx',
      options: [
        {allowedStringsByFile: {'PowerSearch/PowerSearch.tsx': ['items']}},
      ],
      errors: [
        {
          messageId: 'hardcodedString',
          data: {value: '" items"', name: 'children'},
        },
      ],
    },
    {
      code: "const thumbLabel = 'Minimum value';",
      filename: '/repo/packages/core/src/OtherSlider/OtherSlider.tsx',
      options: [
        {allowedStringsByFile: {'Slider/Slider.tsx': ['Minimum value']}},
      ],
      errors: [{messageId: 'hardcodedString'}],
    },
    {
      code: "const thumbLabel = 'Minimum value';",
      // A key matches whole path segments: Slider.tsx is not RangeSlider.tsx.
      filename: '/repo/packages/core/src/RangeSlider/RangeSlider.tsx',
      options: [{allowedStringsByFile: {'Slider.tsx': ['Minimum value']}}],
      errors: [{messageId: 'hardcodedString'}],
    },
    // --- Pre-existing surfaces still behave ---
    {
      code: '<button aria-label="Close">x</button>',
      errors: [{messageId: 'hardcodedString'}],
    },
  ],
});
