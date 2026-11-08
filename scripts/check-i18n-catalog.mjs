#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * CI gate for the i18n catalog — `node scripts/check-i18n-catalog.mjs`.
 *
 * `resolve.ts` falls through to rendering the raw key string when a key is
 * missing from every catalog, guarded only by a dev-time `warnOnce`. That is a
 * browser warning, not a gate, so a typo or a stale key ships. This asserts:
 *
 *   1. Source ⊆ catalog. Every `@astryx.*` key referenced in packages/core/src
 *      packages/lab/src, and packages/richtext/src exists in en.json.
 *   2. Locale parity. Translated catalogs may omit keys and fall back to en,
 *      but extra keys are stale and fail.
 *   3. Every en.json entry carries a non-empty `description` — the only
 *      context a Crowdin translator gets.
 *   4. Every source and translated message parses as ICU.
 *   5. Each translated message consumes the same argument and rich-text
 *      contract as its source, ignoring literal text, argument order, and
 *      locale-specific plural/selectordinal categories.
 *   6. Every named plural branch is reachable under that catalog's cardinal
 *      or ordinal rules. Source findings fail; translation findings are notes.
 *
 * Deliberately NOT checked: catalog keys with no call site. A shipped key is
 * public surface (consumers override any key through `overrides`), so an
 * "unused" key is legitimate and pruning one is a breaking change. Do not add
 * that check.
 *
 * Key references come from the TypeScript AST, reusing the call-site
 * definition in internal/eslint-plugin-astryx/i18n-key-format.js — a `t()` /
 * `translator()` / `translate()` call, or an `i18nKey:` property — so this
 * gate and that lint rule cannot disagree about what a key reference is. A
 * reference whose key is not statically knowable is reported as unverifiable
 * rather than passed or failed silently.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {parse, TYPE} from '@formatjs/icu-messageformat-parser';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIRS = [
  'packages/core/src',
  'packages/lab/src',
  'packages/richtext/src',
];
const LOCALES_DIR = 'packages/core/locales';

/**
 * Whether a locale missing a key that en.json has is an error.
 *
 * False, because a partial locale is the intended steady state, not a defect:
 * crowdin.yml sets `skip_untranslated_strings: true`, so Crowdin strips
 * untranslated keys out of every download, and `resolve.ts` falls back to en
 * for them without warning. Making this fatal would reject every partially
 * translated catalog. The other direction — a key a locale has and en does
 * not — is always an error: en is
 * the source of truth, so an extra key is stale and will never be read.
 */
const LOCALE_MISSING_KEYS_ARE_FATAL = false;

/** en.json is the source; pseudo.json is generated and gitignored. Same
 * exclusions the crowdin-download workflow applies to this directory. */
const NOT_A_SHIPPED_LOCALE = new Set(['en.json', 'pseudo.json']);

/** Translator call targets, per the i18n-key-format lint rule. */
const TRANSLATOR_CALL_NAMES = new Set(['t', 'translator', 'translate']);

const KEY_PREFIX = '@astryx.';

const ICU_ARGUMENT_KINDS = new Map([
  [TYPE.argument, 'argument'],
  [TYPE.number, 'number'],
  [TYPE.date, 'date'],
  [TYPE.time, 'time'],
]);

/** Parse one message with locations so syntax failures have stable diagnostics. */
function parseIcuMessage(message) {
  return parse(message, {captureLocation: true});
}

function formatIcuSyntaxError(error) {
  const start = error?.location?.start;
  const location = start
    ? ` at line ${start.line}, column ${start.column}`
    : '';
  const reason =
    error instanceof Error && error.message ? error.message : 'INVALID_MESSAGE';
  return `malformed ICU message${location}: ${reason}`;
}

function addUsage(group, name, kind, context, detail = '') {
  let usages = group.get(name);
  if (!usages) {
    usages = new Map();
    group.set(name, usages);
  }
  const usage = {kind, detail, context};
  usages.set(JSON.stringify([kind, detail, context]), usage);
}

/**
 * Reduce an ICU AST to the runtime value contract it consumes. Literal text and
 * sibling order are deliberately absent. Select option names remain part of
 * the contract, while plural categories do not: their valid sets are locale
 * dependent. Parent contexts retain nesting, including rich-text tags.
 */
function collectMessageContract(ast) {
  const contract = {
    arguments: new Map(),
    tags: new Map(),
    pounds: new Map(),
  };

  const walk = (elements, context = []) => {
    for (const element of elements) {
      if (element.type === TYPE.literal) continue;

      const simpleKind = ICU_ARGUMENT_KINDS.get(element.type);
      if (simpleKind) {
        addUsage(contract.arguments, element.value, simpleKind, context);
        continue;
      }

      if (element.type === TYPE.select) {
        const selectors = Object.keys(element.options).sort();
        addUsage(
          contract.arguments,
          element.value,
          'select',
          context,
          `options=[${selectors.join(', ')}]`,
        );
        for (const selector of selectors) {
          walk(element.options[selector].value, [
            ...context,
            `select "${element.value}" option "${selector}"`,
          ]);
        }
        continue;
      }

      if (element.type === TYPE.plural) {
        const kind =
          element.pluralType === 'ordinal' ? 'selectordinal' : 'plural';
        const exactSelectors = Object.keys(element.options)
          .filter(selector => selector.startsWith('='))
          .sort();
        addUsage(
          contract.arguments,
          element.value,
          kind,
          context,
          `offset=${element.offset}; exact=[${exactSelectors.join(', ')}]`,
        );
        // Named categories and their counts vary by locale, so merge their
        // child contracts. Walk the mandatory `other` branch a second time with
        // its own context so a translation cannot move a required value, tag,
        // or pound placeholder into a locale-specific branch. Exact-value
        // selectors remain locale-independent runtime branches.
        for (const [selector, option] of Object.entries(element.options)) {
          const pluralContext = `${kind} "${element.value}"`;
          if (selector.startsWith('=')) {
            walk(option.value, [
              ...context,
              `${pluralContext} exact "${selector}"`,
            ]);
            continue;
          }

          walk(option.value, [...context, pluralContext]);
          if (selector === 'other') {
            walk(option.value, [...context, `${pluralContext} option "other"`]);
          }
        }
        continue;
      }

      if (element.type === TYPE.tag) {
        addUsage(contract.tags, element.value, 'tag', context);
        walk(element.children, [...context, `tag <${element.value}>`]);
        continue;
      }

      if (element.type === TYPE.pound) {
        addUsage(contract.pounds, '#', 'pound', context);
      }
    }
  };

  walk(ast);
  return contract;
}

function usageLabel({kind, detail, context}) {
  const suffix = detail ? ` (${detail})` : '';
  const location =
    context.length > 0 ? ` inside ${context.join(' > ')}` : ' at message root';
  return `${kind}${suffix}${location}`;
}

function compareUsageGroup(label, source, translation) {
  const problems = [];
  const sourceNames = [...source.keys()].sort();
  const translationNames = [...translation.keys()].sort();
  const missing = sourceNames.filter(name => !translation.has(name));
  const extra = translationNames.filter(name => !source.has(name));

  if (missing.length > 0) {
    problems.push(`missing ${label}(s): ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    problems.push(`extra ${label}(s): ${extra.join(', ')}`);
  }

  for (const name of sourceNames) {
    const sourceUsages = source.get(name);
    const translationUsages = translation.get(name);
    if (!translationUsages) continue;

    const sourceSignatures = [...sourceUsages.keys()].sort();
    const translationSignatures = [...translationUsages.keys()].sort();
    if (
      sourceSignatures.length === translationSignatures.length &&
      sourceSignatures.every(
        (signature, index) => signature === translationSignatures[index],
      )
    ) {
      continue;
    }

    const sourceKinds = [
      ...new Set([...sourceUsages.values()].map(usage => usage.kind)),
    ].sort();
    const translationKinds = [
      ...new Set([...translationUsages.values()].map(usage => usage.kind)),
    ].sort();
    const sameKinds =
      sourceKinds.length === translationKinds.length &&
      sourceKinds.every((kind, index) => kind === translationKinds[index]);

    if (!sameKinds) {
      problems.push(
        `${label} "${name}" has incompatible kind: expected ${sourceKinds.join(
          ' + ',
        )}; found ${translationKinds.join(' + ')}`,
      );
      continue;
    }

    const expected = [...sourceUsages.values()]
      .map(usageLabel)
      .sort()
      .join(' | ');
    const found = [...translationUsages.values()]
      .map(usageLabel)
      .sort()
      .join(' | ');
    problems.push(
      `${label} "${name}" has incompatible structure: expected ${expected}; found ${found}`,
    );
  }

  return problems;
}

/** Compare parsed messages without comparing literal text or sibling order. */
function compareMessageContracts(sourceAst, translationAst) {
  const source = collectMessageContract(sourceAst);
  const translation = collectMessageContract(translationAst);
  return [
    ...compareUsageGroup('argument', source.arguments, translation.arguments),
    ...compareUsageGroup('rich-text tag', source.tags, translation.tags),
    ...compareUsageGroup(
      'pound placeholder',
      source.pounds,
      translation.pounds,
    ),
  ];
}

/**
 * Resolve the cardinal and ordinal category sets supplied by this Node runtime.
 * Locale identifiers rejected by `Intl.Locale` and valid-but-unsupported
 * identifiers stay distinct so the caller can explain why category validation
 * was skipped.
 */
function pluralRulesFor(locale) {
  let canonicalLocale;
  try {
    canonicalLocale = new Intl.Locale(locale).toString();
  } catch {
    return {
      status: 'invalid',
      reason: `locale identifier "${locale}" is not accepted by Intl.Locale`,
    };
  }

  if (Intl.PluralRules.supportedLocalesOf([canonicalLocale]).length === 0) {
    return {
      status: 'unsupported',
      reason: `this Node runtime has no plural-rule data for "${locale}"`,
    };
  }

  const cardinal = new Intl.PluralRules(canonicalLocale, {type: 'cardinal'});
  const ordinal = new Intl.PluralRules(canonicalLocale, {type: 'ordinal'});
  return {
    status: 'supported',
    cardinal: new Set([...cardinal.resolvedOptions().pluralCategories].sort()),
    ordinal: new Set([...ordinal.resolvedOptions().pluralCategories].sort()),
  };
}

function classifyLocalePluralRules(file) {
  const locale = path.basename(file, '.json');
  const pluralRules = pluralRulesFor(locale);
  if (pluralRules.status === 'supported') return {pluralRules};

  if (pluralRules.status === 'invalid') {
    return {
      pluralRules,
      error: {
        title: `${file}: invalid locale filename`,
        lines: [pluralRules.reason],
        hint: 'Rename the catalog to a locale identifier accepted by Intl.Locale.',
      },
    };
  }

  return {
    pluralRules,
    note:
      `${file}: plural categories unchecked — ${pluralRules.reason}; ` +
      'ICU syntax and source contracts were still validated',
  };
}

/** Find unreachable named categories throughout a parsed ICU message. */
function collectPluralCategoryProblems(ast, pluralRules) {
  if (pluralRules?.status !== 'supported') return [];

  const problems = [];
  const walk = elements => {
    for (const element of elements) {
      if (element.type === TYPE.plural) {
        const ordinal = element.pluralType === 'ordinal';
        const syntax = ordinal ? 'selectordinal' : 'plural';
        const ruleType = ordinal ? 'ordinal' : 'cardinal';
        const valid = ordinal ? pluralRules.ordinal : pluralRules.cardinal;
        for (const selector of Object.keys(element.options).sort()) {
          if (!selector.startsWith('=') && !valid.has(selector)) {
            problems.push(
              `${syntax} argument "${element.value}" uses unreachable ${ruleType} category "${selector}" ` +
                `(valid: ${[...valid].join(', ')})`,
            );
          }
        }
      }

      if (element.options) {
        for (const selector of Object.keys(element.options).sort()) {
          walk(element.options[selector].value);
        }
      }
      if (element.children) walk(element.children);
    }
  };

  walk(ast);
  return problems;
}

/**
 * Parse once, then share that AST between contract and plural validation.
 * Unsupported locale data suppresses only plural findings: syntax and source
 * contract checks still run.
 */
function analyzeIcuMessage(
  message,
  {sourceAst = null, pluralRules = null, isSource = false} = {},
) {
  let ast;
  try {
    ast = parseIcuMessage(message);
  } catch (error) {
    return {
      ast: null,
      syntaxError: formatIcuSyntaxError(error),
      contractProblems: [],
      pluralErrors: [],
      pluralNotes: [],
    };
  }

  const pluralProblems = collectPluralCategoryProblems(ast, pluralRules);
  return {
    ast,
    syntaxError: null,
    contractProblems: sourceAst ? compareMessageContracts(sourceAst, ast) : [],
    pluralErrors: isSource ? pluralProblems : [],
    pluralNotes: isSource ? [] : pluralProblems,
  };
}

/** Mirrors scripts/check-use-client.mjs — source files only, no tests,
 * stories, docs, or perf fixtures (those legitimately name absent keys). */
function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full));
    } else if (
      /\.[jt]sx?$/.test(entry.name) &&
      !entry.name.includes('.test.') &&
      !entry.name.includes('.stories.') &&
      !entry.name.includes('.doc.') &&
      !entry.name.includes('.perf.') &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(full);
    }
  }
  return results;
}

function unwrap(node) {
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node))
  ) {
    node = node.expression;
  }
  return node;
}

function literalText(node) {
  const n = unwrap(node);
  if (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))) {
    return n.text;
  }
  return null;
}

/**
 * Module-level `const NAME = '<key>'` and `const NAME = {a: '<key>'}`, so a
 * call site that reads one is still checkable. Every value of an object is
 * collected: `MAP[expr]` can select any of them.
 */
function collectConstants(sourceFile) {
  const consts = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const init = unwrap(decl.initializer);
      const direct = literalText(init);
      if (direct !== null) {
        consts.set(decl.name.text, [direct]);
      } else if (ts.isObjectLiteralExpression(init)) {
        const values = [];
        for (const prop of init.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const value = literalText(prop.initializer);
          if (value !== null) values.push(value);
        }
        if (values.length > 0) consts.set(decl.name.text, values);
      }
    }
  }
  return consts;
}

/** Resolve an expression to the key strings it can evaluate to, or null when
 * it is not statically knowable. */
function resolveKeys(node, consts) {
  const n = unwrap(node);
  if (!n) return null;

  const direct = literalText(n);
  if (direct !== null) return [direct];

  if (ts.isConditionalExpression(n)) {
    const whenTrue = resolveKeys(n.whenTrue, consts);
    const whenFalse = resolveKeys(n.whenFalse, consts);
    return whenTrue && whenFalse ? [...whenTrue, ...whenFalse] : null;
  }
  if (ts.isIdentifier(n)) {
    return consts.get(n.text) ?? null;
  }
  // MAP[expr] — any value of MAP may be selected, so check them all.
  if (ts.isElementAccessExpression(n)) {
    const object = unwrap(n.expression);
    if (object && ts.isIdentifier(object))
      return consts.get(object.text) ?? null;
  }
  return null;
}

function isTranslatorCall(node) {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return TRANSLATOR_CALL_NAMES.has(callee.text);
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
    return TRANSLATOR_CALL_NAMES.has(callee.name.text);
  }
  return false;
}

function propertyName(node) {
  if (ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isStringLiteral(node.name)) return node.name.text;
  return null;
}

/**
 * Extract every astryx catalog-key reference from one source file.
 * Pure — takes the text, so it is unit-testable without the filesystem.
 *
 * @param {string} source     file contents
 * @param {string} fileName   display name (drives .tsx parsing)
 * @returns {{refs: {line: number, key: string}[],
 *            unresolved: {line: number, expr: string}[]}}
 */
function extractKeyRefs(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') || fileName.endsWith('.jsx')
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );
  const consts = collectConstants(sourceFile);
  const refs = [];
  const unresolved = [];

  const lineOf = node =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
    1;

  const record = (expression, node) => {
    const keys = resolveKeys(expression, consts);
    if (keys === null) {
      unresolved.push({
        line: lineOf(node),
        expr: expression.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 80),
      });
      return;
    }
    // Non-astryx namespaces belong to their owners, per the lint rule.
    for (const key of keys) {
      if (key.startsWith(KEY_PREFIX)) refs.push({line: lineOf(node), key});
    }
  };

  const visit = node => {
    if (ts.isCallExpression(node) && isTranslatorCall(node)) {
      const arg = node.arguments[0];
      if (arg) record(arg, arg);
    }
    if (ts.isPropertyAssignment(node) && propertyName(node) === 'i18nKey') {
      record(node.initializer, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return {refs, unresolved};
}

/**
 * Validate the shape of the source catalog: every entry needs a usable
 * `defaultMessage` and a non-empty `description`.
 *
 * @param {object} catalog  parsed en.json
 * @returns {string[]}      human-readable problems (empty = valid)
 */
function validateSourceCatalog(catalog) {
  const problems = [];
  for (const [key, entry] of Object.entries(catalog)) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${key}: entry is not an object`);
      continue;
    }
    if (
      typeof entry.defaultMessage !== 'string' ||
      entry.defaultMessage === ''
    ) {
      problems.push(`${key}: missing or empty "defaultMessage"`);
    }
    if (
      typeof entry.description !== 'string' ||
      entry.description.trim() === ''
    ) {
      problems.push(`${key}: missing or empty "description"`);
    }
  }
  return problems;
}

/**
 * Compare one locale's key set against en's.
 *
 * @returns {{missing: string[], extra: string[]}}
 */
function compareLocale(enKeys, localeKeys) {
  const locale = new Set(localeKeys);
  return {
    missing: [...enKeys].filter(k => !locale.has(k)),
    extra: [...locale].filter(k => !enKeys.has(k)),
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const errors = [];
  const notes = [];

  // 1. Source ⊆ catalog
  const catalog = readJson(path.join(ROOT, LOCALES_DIR, 'en.json'));
  const enKeys = new Set(Object.keys(catalog));
  const sourceAsts = new Map();

  const catalogProblems = validateSourceCatalog(catalog);
  if (catalogProblems.length > 0) {
    errors.push({
      title: `${catalogProblems.length} en.json entry problem(s)`,
      lines: catalogProblems,
      hint: 'A description is the only context a Crowdin translator gets.',
    });
  }

  const sourceIcuProblems = [];
  const sourcePluralProblems = [];
  const enPluralRules = pluralRulesFor('en');
  for (const key of [...enKeys].sort()) {
    const message = catalog[key]?.defaultMessage;
    if (typeof message !== 'string' || message === '') continue;

    const analysis = analyzeIcuMessage(message, {
      pluralRules: enPluralRules,
      isSource: true,
    });
    if (analysis.syntaxError) {
      sourceIcuProblems.push(`${key}: ${analysis.syntaxError}`);
      continue;
    }

    sourceAsts.set(key, analysis.ast);
    for (const problem of analysis.pluralErrors) {
      sourcePluralProblems.push(`${key}: ${problem}`);
    }
  }
  if (sourceIcuProblems.length > 0) {
    errors.push({
      title: `en.json: ${sourceIcuProblems.length} invalid ICU message(s)`,
      lines: sourceIcuProblems,
      hint: 'Fix ICU syntax before translations are compared.',
    });
  }
  if (enPluralRules.status !== 'supported') {
    errors.push({
      title: 'en.json: plural categories could not be checked',
      lines: [enPluralRules.reason],
      hint: 'Use the repository-pinned Node version with full ICU data.',
    });
  }
  if (sourcePluralProblems.length > 0) {
    errors.push({
      title: `en.json: ${sourcePluralProblems.length} unreachable plural category finding(s)`,
      lines: sourcePluralProblems,
      hint: 'Intl.PluralRules never selects these branches for English.',
    });
  }

  const missingRefs = [];
  const unverifiable = [];
  let refCount = 0;
  const seen = new Set();

  for (const dir of SRC_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(ROOT, file);
      const {refs, unresolved} = extractKeyRefs(
        fs.readFileSync(file, 'utf8'),
        file,
      );
      refCount += refs.length;
      for (const {line, key} of refs) {
        seen.add(key);
        if (!enKeys.has(key)) missingRefs.push(`${rel}:${line}  ${key}`);
      }
      for (const {line, expr} of unresolved) {
        unverifiable.push(`${rel}:${line}  ${expr}`);
      }
    }
  }

  if (missingRefs.length > 0) {
    errors.push({
      title: `${missingRefs.length} key reference(s) not in en.json`,
      lines: missingRefs,
      hint: 'Add the key to packages/core/locales/en.json, or fix the typo at the call site.',
    });
  }

  // 2. Locale parity
  const localeFiles = fs
    .readdirSync(path.join(ROOT, LOCALES_DIR))
    .filter(f => f.endsWith('.json') && !NOT_A_SHIPPED_LOCALE.has(f))
    .sort();

  let translatedMessageCount = 0;
  for (const file of localeFiles) {
    const localeCatalog = readJson(path.join(ROOT, LOCALES_DIR, file));
    const {missing, extra} = compareLocale(enKeys, Object.keys(localeCatalog));
    if (extra.length > 0) {
      errors.push({
        title: `${file}: ${extra.length} key(s) not in en.json`,
        lines: extra,
        hint: 'en.json is the source of truth — these are stale and will never be read. Remove them, or restore the key in en.json.',
      });
    }
    if (missing.length > 0) {
      const summary = `${file}: ${missing.length}/${enKeys.size} key(s) untranslated (falls back to en)`;
      if (LOCALE_MISSING_KEYS_ARE_FATAL) {
        errors.push({title: summary, lines: missing, hint: ''});
      } else {
        notes.push(summary);
      }
    }

    const localeIcuProblems = [];
    const localePluralNotes = [];
    const {
      pluralRules: localePluralRules,
      error: localeRuleError,
      note: localeRuleNote,
    } = classifyLocalePluralRules(file);
    if (localeRuleError) errors.push(localeRuleError);
    if (localeRuleNote) notes.push(localeRuleNote);

    for (const key of Object.keys(localeCatalog).sort()) {
      const message = localeCatalog[key]?.defaultMessage;
      if (typeof message !== 'string' || message === '') {
        localeIcuProblems.push(`${key}: missing or empty "defaultMessage"`);
        continue;
      }

      translatedMessageCount += 1;
      const analysis = analyzeIcuMessage(message, {
        sourceAst: sourceAsts.get(key),
        pluralRules: localePluralRules,
      });
      if (analysis.syntaxError) {
        localeIcuProblems.push(`${key}: ${analysis.syntaxError}`);
        continue;
      }

      for (const problem of analysis.contractProblems) {
        localeIcuProblems.push(`${key}: ${problem}`);
      }
      for (const problem of analysis.pluralNotes) {
        localePluralNotes.push(`${key}: ${problem}`);
      }
    }

    if (localeIcuProblems.length > 0) {
      errors.push({
        title: `${file}: ${localeIcuProblems.length} ICU message problem(s)`,
        lines: localeIcuProblems,
        hint: 'Keep the translated message syntax valid and its runtime value contract aligned with en.json.',
      });
    }
    for (const problem of localePluralNotes) {
      notes.push(`${file}: ${problem}`);
    }
  }

  if (unverifiable.length > 0) {
    notes.push(
      `${unverifiable.length} key reference(s) unverifiable (key not statically knowable):\n` +
        unverifiable.map(l => `      ${l}`).join('\n'),
    );
  }

  if (errors.length > 0) {
    const count = errors.reduce((n, e) => n + e.lines.length, 0);
    console.error(`\n✗ check:i18n-catalog found ${count} problem(s):\n`);
    for (const {title, lines, hint} of errors) {
      console.error(`  ${title}:`);
      for (const line of lines) console.error(`    ${line}`);
      if (hint) console.error(`    → ${hint}`);
      console.error('');
    }
    process.exit(1);
  }

  console.log(
    `✓ check:i18n-catalog — ${seen.size} key(s) over ${refCount} reference(s) resolve; ` +
      `${enKeys.size} en and ${translatedMessageCount} translated message(s) parsed and contract-checked; ` +
      `plural categories evaluated with runtime CLDR ${process.versions.cldr}; ` +
      `${localeFiles.length} locale(s) consistent`,
  );
  for (const note of notes) console.log(`  · ${note}`);
}

// Run as a script, but stay importable for unit tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {
  extractKeyRefs,
  validateSourceCatalog,
  compareLocale,
  parseIcuMessage,
  formatIcuSyntaxError,
  collectMessageContract,
  compareMessageContracts,
  pluralRulesFor,
  classifyLocalePluralRules,
  analyzeIcuMessage,
};
