// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-raw-intl-locale.test.mjs
 * @description Tests for the Astryx no-raw-intl-locale ESLint rule.
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-raw-intl-locale.js';

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
  },
});

const rawIntlLocale = {messageId: 'rawIntlLocale'};
const rawIntlReference = {messageId: 'rawIntlReference'};
const ambientIntlInImplementation = {
  messageId: 'ambientIntlInImplementation',
};
const navigatorLocale = {messageId: 'navigatorLocale'};
const dateHelperLocale = {messageId: 'dateHelperLocale'};

// A file outside the approved infrastructure allowlist — the common case for
// shipped component code. Used as the default `filename` for every case that
// doesn't specifically test the infra boundary.
const COMPONENT_FILE = 'packages/core/src/Calendar/Calendar.tsx';
const INFRA_FILE = 'packages/core/src/utils/plainDate.ts';
const DATE_PARSER_INFRA_FILE = 'packages/core/src/utils/dateParser.ts';
const COLLATOR_INFRA_FILE = 'packages/core/src/i18n/useCollator.ts';
const LIST_FORMATTER_INFRA_FILE = 'packages/core/src/i18n/useListFormatter.ts';
const RELATIVE_TIME_INFRA_FILE =
  'packages/core/src/Timestamp/formatRelativeTime.ts';
const NUMBER_PARSER_INFRA_FILE =
  'packages/core/src/NumberInput/numberParser.ts';
const TIME_FORMAT_INFRA_FILE = 'packages/core/src/utils/timeFormat.ts';
const NUMBER_PARSER_TEST_ORACLE_FILE =
  'packages/core/src/NumberInput/numberParser.test.ts';
const NUMBER_PARSER_DOCBLOCK_ORACLE_FILE =
  'packages/core/src/NumberInput/numberParser.docblock.test.ts';
const CHARTS_INFRA_FILE = 'packages/charts/src/formatters.ts';
const TIMESTAMP_TEST_ORACLE_FILE =
  'packages/core/src/Timestamp/Timestamp.test.tsx';
const CALENDAR_TEST_ORACLE_FILE =
  'packages/core/src/Calendar/Calendar.test.tsx';
// A test file that is NOT one of the named oracle exceptions — proves the
// allowlist is exact-file, not "any *.test.tsx".
const OTHER_TEST_FILE = 'packages/core/src/DateInput/DateInput.test.tsx';
// The two feature-detection call sites the `typeof Intl.Segmenter` exemption
// exists for — neither is on the infra allowlist, since the exemption is
// meant to hold everywhere.
const CHARACTERS_FILE = 'packages/core/src/utils/characters.ts';

tester.run('no-raw-intl-locale', rule, {
  valid: [
    // -- Intl.Locale is never a formatter, anywhere, in any form --
    {code: `new Intl.Locale();`, filename: COMPONENT_FILE},
    {code: `new Intl.Locale(locale).baseName;`, filename: COMPONENT_FILE},
    {code: `x instanceof Intl.Locale;`, filename: COMPONENT_FILE},
    {code: `const Loc = Intl.Locale;`, filename: COMPONENT_FILE},

    // -- Grapheme-only Intl.Segmenter is exempt everywhere, infra or not --
    {code: `new Intl.Segmenter();`, filename: COMPONENT_FILE},
    {code: `Intl.Segmenter(undefined);`, filename: COMPONENT_FILE},
    {
      code: `new Intl.Segmenter(void 0, {granularity: 'grapheme'});`,
      filename: COMPONENT_FILE,
    },
    {code: `new Intl.Segmenter(undefined, {});`, filename: COMPONENT_FILE},
    {
      code: `new Intl.Segmenter('fr', {granularity: 'grapheme'});`,
      filename: COMPONENT_FILE,
    },
    // The exact feature-detection idiom characters.ts/useStreamingText.ts
    // use, paired with the grapheme-only call — neither file is on the infra
    // allowlist, since this exemption holds everywhere.
    {
      code: `typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity: 'grapheme'}) : null;`,
      filename: CHARACTERS_FILE,
    },

    // -- Type-only references emit no runtime Intl access. --
    {
      code: `let collator: Intl.Collator; type Options = Intl.CollatorOptions;`,
      filename: COMPONENT_FILE,
    },

    // -- A locally shadowed Intl is not the platform global --
    {
      code: `function format(Intl) { return new Intl.DateTimeFormat(); }`,
      filename: COMPONENT_FILE,
    },
    {
      code: `const Intl = factory(); Intl.NumberFormat();`,
      filename: COMPONENT_FILE,
    },
    // A shadowed Intl used to alias one of its members is still not a
    // reference to the platform global.
    {
      code: `function f(Intl) { const DTF = Intl.DateTimeFormat; return DTF; }`,
      filename: COMPONENT_FILE,
    },
    // `Intl` as a non-computed property name, or an object-literal key, is
    // not a value reference to the global at all.
    {code: `x.Intl.DateTimeFormat();`, filename: COMPONENT_FILE},
    {code: `const obj = {Intl: 5};`, filename: COMPONENT_FILE},

    // -- Approved implementation files may call Intl directly, but still
    //    require a syntactically explicit non-navigator locale. --
    {
      code: `new Intl.DateTimeFormat(locale, {dateStyle: 'long'});`,
      filename: INFRA_FILE,
    },
    {code: `new Intl.NumberFormat(locale).format(123);`, filename: INFRA_FILE},
    {
      code: `new Intl.DateTimeFormat('en-US', {timeZone});`,
      filename: INFRA_FILE,
    },
    {code: `value.toLocaleString(locale);`, filename: INFRA_FILE},
    {code: `left.localeCompare(right, locale);`, filename: INFRA_FILE},
    {
      code: `abs.toLocaleString(locale);`,
      filename: CHARTS_INFRA_FILE,
    },
    {
      code: `new Intl.Collator(locale, options);`,
      filename: COLLATOR_INFRA_FILE,
    },
    {
      code: `new Intl.ListFormat(locale, {type: 'unit', style: 'short'});`,
      filename: LIST_FORMATTER_INFRA_FILE,
    },
    {
      code: `new Intl.RelativeTimeFormat(locale, {style: 'narrow'});`,
      filename: RELATIVE_TIME_INFRA_FILE,
    },
    {
      code: `new Intl.NumberFormat(locale).formatToParts(12345.6);`,
      filename: NUMBER_PARSER_INFRA_FILE,
    },
    {
      code: `new Intl.DateTimeFormat(locale, {hour: 'numeric'}).resolvedOptions();`,
      filename: TIME_FORMAT_INFRA_FILE,
    },
    // -- Named test-oracle files retain meaningful explicit-locale fixtures. --
    {
      code: `number.toLocaleString('en-US');`,
      filename: 'packages/core/src/NumberInput/NumberInput.test.tsx',
    },
    {
      code: `left.localeCompare(right, 'en-US');`,
      filename:
        'packages/core/src/Table/plugins/tree/useTableTreeState.test.tsx',
    },
    {
      code: `new Intl.NumberFormat('de-DE').format(1234234234);`,
      filename: NUMBER_PARSER_TEST_ORACLE_FILE,
    },
    {
      code: `new Intl.NumberFormat(locale).formatToParts(11111111111);`,
      filename: NUMBER_PARSER_DOCBLOCK_ORACLE_FILE,
    },

    // -- A named test-oracle file may also construct raw Intl with a
    //    non-navigator locale argument, exactly like an infra implementation
    //    file — it is the same allowlist, not a separate mechanism. --
    {
      code: `new Intl.DateTimeFormat('en', {timeZoneName: 'long'}).formatToParts(date);`,
      filename: TIMESTAMP_TEST_ORACLE_FILE,
    },
    {
      code: `new Intl.DateTimeFormat('en', {year: 'numeric', month: 'long'}).format(date);`,
      filename: CALENDAR_TEST_ORACLE_FILE,
    },

    // -- Date helper calls resolve through real imports and pass locale. --
    {
      code: `import {plainDateFormat, formatSharedDate} from '../utils/plainDate'; plainDateFormat(date, options, locale); formatSharedDate(date, format, locale);`,
      filename: COMPONENT_FILE,
    },
    {
      code: `import {parseDateInput as parse, isLocaleDayFirst as dayFirst} from '../utils'; parse(value, locale); dayFirst(locale);`,
      filename: COMPONENT_FILE,
    },
    {
      code: `import * as dateHelpers from '../utils/plainDate'; dateHelpers.plainDateFormat(date, options, locale); dateHelpers['formatSharedDate'](date, format, locale);`,
      filename: COMPONENT_FILE,
    },
    {
      code: `function plainDateFormat(date, options) { return value; } plainDateFormat(date, options);`,
      filename: COMPONENT_FILE,
    },
    {
      code: `import {plainDateFormat} from 'another-library'; plainDateFormat(date, options);`,
      filename: COMPONENT_FILE,
    },
    {
      code: `import {plainDateFormat} from '../utils/plainDate'; function render(plainDateFormat) { return plainDateFormat(date, options); }`,
      filename: COMPONENT_FILE,
    },
    {
      code: `function plainDateFormat(date, options, locale) { return value; } plainDateFormat(date, options, locale);`,
      filename: INFRA_FILE,
    },
    {
      code: `import {plainDateFormat} from './plainDate'; plainDateFormat(date, options);`,
      filename: 'packages/core/src/utils/plainDate.test.ts',
    },
    {
      code: `import {parseDateInput} from './dateParser'; parseDateInput(value);`,
      filename: 'packages/core/src/utils/dateParser.test.ts',
    },

    // -- KNOWN GAP (syntax-only limitation, documented in the rule's file
    //    doc and README): a computed method name held in a variable cannot
    //    be resolved to 'toLocaleString' (or any other name) without
    //    value-flow analysis, so this locale-sensitive call is NOT caught.
    //    This is intentionally left unclosed — see LOCALE_FIRST_METHODS'
    //    static-name matching, which no syntax-only rule can generalize past
    //    a literal or no-substitution template. --
    {
      code: `const method = 'toLocaleString'; value[method]();`,
      filename: COMPONENT_FILE,
    },
  ],

  invalid: [
    // -- Production date-helper calls must pass the provider locale. --
    {
      code: `import {plainDateFormat} from '../utils/plainDate'; plainDateFormat(date, options);`,
      filename: COMPONENT_FILE,
      errors: [dateHelperLocale],
    },
    {
      code: `import {formatSharedDate} from '../utils/plainDate'; formatSharedDate(date, format, undefined);`,
      filename: COMPONENT_FILE,
      errors: [dateHelperLocale],
    },
    {
      code: `import {parseDateInput as parse} from '../utils'; parse(value);`,
      filename: COMPONENT_FILE,
      errors: [dateHelperLocale],
    },
    {
      code: `import * as dateHelpers from '../utils/dateParser'; dateHelpers.isLocaleDayFirst();`,
      filename: COMPONENT_FILE,
      errors: [dateHelperLocale],
    },
    {
      code: `import * as dateHelpers from '../utils/plainDate'; dateHelpers['plainDateFormat'](date, options);`,
      filename: COMPONENT_FILE,
      errors: [dateHelperLocale],
    },
    {
      code: `function plainDateFormat(date, options, locale) { return value; } plainDateFormat(date, options);`,
      filename: INFRA_FILE,
      errors: [dateHelperLocale],
    },
    {
      code: `function isLocaleDayFirst(locale) { return false; } isLocaleDayFirst();`,
      filename: DATE_PARSER_INFRA_FILE,
      errors: [dateHelperLocale],
    },

    // -- Approved implementation files still reject ambient locale calls and
    //    indirect Intl references. --
    {
      code: `new Intl.NumberFormat(undefined).format(value);`,
      filename: CHARTS_INFRA_FILE,
      errors: [ambientIntlInImplementation],
    },
    {
      code: `new Intl.NumberFormat().formatToParts(1);`,
      filename: NUMBER_PARSER_INFRA_FILE,
      errors: [ambientIntlInImplementation],
    },
    {
      code: `new Intl.DateTimeFormat(undefined, {hour: 'numeric'});`,
      filename: TIME_FORMAT_INFRA_FILE,
      errors: [ambientIntlInImplementation],
    },
    {
      code: `new Intl.RelativeTimeFormat();`,
      filename: RELATIVE_TIME_INFRA_FILE,
      errors: [ambientIntlInImplementation],
    },
    {
      code: `value.toLocaleString();`,
      filename: CHARTS_INFRA_FILE,
      errors: [ambientIntlInImplementation],
    },
    {
      code: `function plainDateFormat() { return new Intl.DateTimeFormat(undefined, options); }`,
      filename: INFRA_FILE,
      errors: [ambientIntlInImplementation],
    },
    {
      code: `function isLocaleDayFirst() { return new Intl.DateTimeFormat(); }`,
      filename: DATE_PARSER_INFRA_FILE,
      errors: [ambientIntlInImplementation],
    },
    {
      code: `function anotherFormatter() { return new Intl.DateTimeFormat(undefined, options); }`,
      filename: INFRA_FILE,
      errors: [ambientIntlInImplementation],
    },
    {
      code: `const DTF = Intl.DateTimeFormat; new DTF(locale);`,
      filename: INFRA_FILE,
      errors: [rawIntlReference],
    },
    {
      code: `const {DateTimeFormat} = Intl; new DateTimeFormat(locale);`,
      filename: INFRA_FILE,
      errors: [rawIntlReference],
    },

    // -- The core policy change: an explicit locale no longer satisfies the
    //    rule outside the approved infrastructure files. --
    {
      code: `new Intl.DateTimeFormat(locale, {dateStyle: 'long'});`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `new Intl.NumberFormat(locale).format(value);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    // -- Hard-coded display locales don't satisfy it either --
    {
      code: `new Intl.DateTimeFormat('en-US').format(date);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    // -- Nor does a missing/ambient locale, as before --
    {
      code: `new Intl.DateTimeFormat();`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `Intl.NumberFormat(undefined);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `new Intl.RelativeTimeFormat(void 0);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `new Intl['ListFormat'](locale);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `Intl?.DisplayNames?.(locale, {type: 'language'});`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    // -- A dynamic computed key on Intl itself, used directly as a call,
    //    can't be proven to be Locale or a grapheme Segmenter, so it must
    //    not be silently allowed the way a truly unrecognized static name
    //    used to be. --
    {
      code: `new Intl[key](locale);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    // -- Non-grapheme Segmenter granularities are locale-sensitive and follow
    //    the same policy as every other formatter. --
    {
      code: `new Intl.Segmenter('th', {granularity: 'word'});`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `Intl.Segmenter(locale, {granularity: 'sentence'});`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `new Intl.Segmenter(undefined, options);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `new Intl.Segmenter(undefined, {...options});`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    // -- Locale-sensitive prototype methods, with or without a locale arg --
    {
      code: `value.toLocaleString();`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `value.toLocaleString(locale);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `date['toLocaleDateString'](locale);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `time?.toLocaleTimeString?.(locale);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    // -- New in this policy: the case-conversion locale methods --
    {
      code: `value.toLocaleUpperCase();`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `value.toLocaleUpperCase(locale);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `value.toLocaleLowerCase(locale);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `left.localeCompare(right);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `left.localeCompare(right, locale);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },
    {
      code: `left['localeCompare'](right, locale, {numeric: true});`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },

    // -- navigator.language / navigator.languages are rejected as a locale
    //    source, with a dedicated message, everywhere including infra --
    {
      code: `new Intl.DateTimeFormat(navigator.language);`,
      filename: COMPONENT_FILE,
      errors: [navigatorLocale],
    },
    {
      code: `new Intl.NumberFormat(navigator.languages);`,
      filename: COMPONENT_FILE,
      errors: [navigatorLocale],
    },
    {
      code: `new Intl.DateTimeFormat(navigator['language']);`,
      filename: COMPONENT_FILE,
      errors: [navigatorLocale],
    },
    {
      code: `value.toLocaleString(navigator.language);`,
      filename: COMPONENT_FILE,
      errors: [navigatorLocale],
    },
    {
      code: `left.localeCompare(right, navigator.language);`,
      filename: COMPONENT_FILE,
      errors: [navigatorLocale],
    },
    {
      code: `new Intl.DateTimeFormat(navigator.language);`,
      filename: INFRA_FILE,
      errors: [navigatorLocale],
    },
    {
      code: `new Intl.Collator(navigator.language, options);`,
      filename: COLLATOR_INFRA_FILE,
      errors: [navigatorLocale],
    },
    {
      code: `new Intl.ListFormat(navigator.language);`,
      filename: LIST_FORMATTER_INFRA_FILE,
      errors: [navigatorLocale],
    },

    // -- New in this policy: navigator.language/languages is banned in ANY
    //    position, not only as an Intl/locale-method argument. --
    {
      code: `recognition.lang = lang ?? navigator.language;`,
      filename: COMPONENT_FILE,
      errors: [navigatorLocale],
    },
    {
      code: `const preferred = navigator.languages[0];`,
      filename: COMPONENT_FILE,
      errors: [navigatorLocale],
    },
    {
      code: `someFn(navigator.language);`,
      filename: COMPONENT_FILE,
      errors: [navigatorLocale],
    },
    {
      // Even inside an approved infra file, and even with no Intl call in
      // sight.
      code: `const fallback = navigator.language;`,
      filename: INFRA_FILE,
      errors: [navigatorLocale],
    },

    // -- A locally shadowed `navigator` outside infra still fails, just for
    //    the general reason rather than as a navigator-sourced locale. --
    {
      code: `function f(navigator) { return new Intl.DateTimeFormat(navigator.language); }`,
      filename: COMPONENT_FILE,
      errors: [rawIntlLocale],
    },

    // -- Shadowing Intl does not also shadow navigator: the Intl call is
    //    exempted from Intl-specific reporting (Intl here is a parameter,
    //    not the global), but navigator.language is still the real global
    //    and is independently flagged. --
    {
      code: `function f(Intl) { return Intl.DateTimeFormat(navigator.language); }`,
      filename: COMPONENT_FILE,
      errors: [navigatorLocale],
    },

    // -- The allowlist is exact-file: an ordinary component test not on the
    //    list still fails, proving this isn't a general "*.test.tsx" carve-out. --
    {
      code: `new Intl.DateTimeFormat('en', {year: 'numeric', month: 'long'});`,
      filename: OTHER_TEST_FILE,
      errors: [rawIntlLocale],
    },

    // -- New in this policy: referencing the global Intl object OUTSIDE the
    //    direct-call shape — aliasing, destructuring, or a bare computed
    //    index — is flagged even with no locale argument in sight, because
    //    the eventual call this alias enables is invisible to every other
    //    check in this rule. Exactly one diagnostic each: the reference
    //    itself, not any later call through the alias. --
    {
      code: `const DTF = Intl.DateTimeFormat; new DTF(locale);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlReference],
    },
    {
      code: `const {DateTimeFormat} = Intl; new DateTimeFormat(locale);`,
      filename: COMPONENT_FILE,
      errors: [rawIntlReference],
    },
    {
      code: `const {DateTimeFormat, NumberFormat} = Intl;`,
      filename: COMPONENT_FILE,
      errors: [rawIntlReference],
    },
    {
      code: `const ctor = Intl[key];`,
      filename: COMPONENT_FILE,
      errors: [rawIntlReference],
    },
    {
      code: `const formatters = Intl;`,
      filename: COMPONENT_FILE,
      errors: [rawIntlReference],
    },
    // A shadowed Intl inside the SAME infra file is fine to alias — the file
    // trust boundary covers it — but outside infra, aliasing Intl.Segmenter
    // (rather than calling it directly with grapheme options) still isn't
    // exempt: the exemption is a call shape, not a bare reference.
    {
      code: `const Seg = Intl.Segmenter; new Seg(undefined, {granularity: 'grapheme'});`,
      filename: COMPONENT_FILE,
      errors: [rawIntlReference],
    },
  ],
});
