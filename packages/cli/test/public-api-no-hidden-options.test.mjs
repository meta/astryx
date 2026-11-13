// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file No public API function takes an undocumented `__`-prefixed option.
 *
 * What the CLI alone hands a build or a check (a batch's claimed outputs, a
 * scratch build's write root, the command words of a rebuild hint) travels
 * through a CLI-internal function, never through an option of a function a
 * package entry exports. This test loads every entry in package.json
 * `exports` with TypeScript, takes each exported function (and each method
 * of an exported object or class), and fails on a `__`-prefixed property of
 * any parameter type. A `__` field that Core declares on a theme it resolves
 * (`__onDark`, `__onLight`, ...) is data a theme carries, not an option, and
 * is the one thing allowed. A second check reads every CLI source file's
 * AST and fails on a `__` option read from an `options`/`opts` parameter in
 * any spelling (`.__x`, `['__x']`, destructured) or destructured in a
 * parameter itself.
 *
 * @position packages/cli/test — package-surface guard; not shipped
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const CLI_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const require = createRequire(path.join(CLI_ROOT, 'package.json'));
const ts = require('typescript');

const HIDDEN = /^__[a-zA-Z]/;

/** Every module file a package.json `exports` entry names, by subpath. */
function publicEntryFiles() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
  );
  /** @type {Array<{subpath: string, file: string}>} */
  const entries = [];
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    // A string target is the bin, a command line rather than an API.
    if (typeof target === 'string') continue;
    for (const condition of ['import', 'types']) {
      const rel = target[condition];
      if (!rel) continue;
      const file = path.join(CLI_ROOT, rel);
      // `api/*.d.mts` is generated at pack time from the `.mjs` JSDoc, which
      // the `import` file already covers.
      if (fs.existsSync(file)) entries.push({subpath, file});
    }
  }
  return entries;
}

/**
 * A field Core declares on a theme it resolves: data, not an option.
 * @param {any} prop
 */
function isCoreThemeField(prop) {
  const decls = prop.declarations ?? [];
  return (
    decls.length > 0 &&
    decls.every((/** @type {any} */ d) => {
      const file = d.getSourceFile().fileName.split(path.sep).join('/');
      return /\/packages\/core\/|\/@astryxdesign\/core\//.test(file);
    })
  );
}

/** `entry name(param).__field` for every hidden option on the public surface. */
function hiddenOptions() {
  const entries = publicEntryFiles();
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.join(CLI_ROOT, 'tsconfig.strict.json'),
    {},
    {...ts.sys, onUnRecoverableConfigFileDiagnostic() {}},
  );
  const program = ts.createProgram(
    entries.map(e => e.file),
    {...parsed.options, noEmit: true},
  );
  const checker = program.getTypeChecker();
  /** @type {string[]} */
  const found = [];
  let functions = 0;

  /** @param {string} label @param {any} type @param {any} at */
  const scanCallable = (label, type, at) => {
    const signatures = [
      ...type.getCallSignatures(),
      ...type.getConstructSignatures(),
    ];
    if (signatures.length > 0) functions++;
    for (const signature of signatures) {
      for (const param of signature.getParameters()) {
        const paramType = checker.getNonNullableType(
          checker.getTypeOfSymbolAtLocation(param, at),
        );
        const parts = paramType.isUnion() ? paramType.types : [paramType];
        for (const part of parts) {
          for (const prop of checker.getPropertiesOfType(part)) {
            if (HIDDEN.test(prop.name) && !isCoreThemeField(prop)) {
              found.push(`${label}(${param.name}).${prop.name}`);
            }
          }
        }
      }
    }
  };

  for (const {subpath, file} of entries) {
    const source = program.getSourceFile(file);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    expect(moduleSymbol, `${subpath} (${file}) is a module`).toBeTruthy();
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported;
      const at = symbol.valueDeclaration ?? symbol.declarations?.[0];
      if (!at || !(symbol.flags & ts.SymbolFlags.Value)) continue;
      const label = `${subpath} ${exported.name}`;
      const type = checker.getTypeOfSymbolAtLocation(symbol, at);
      scanCallable(label, type, at);
      // An exported object's or class instance's methods (logger.setSilent,
      // ...) are public functions too.
      const instance = type
        .getConstructSignatures()
        .map((/** @type {any} */ s) => s.getReturnType());
      for (const owner of [type, ...instance]) {
        for (const member of checker.getPropertiesOfType(owner)) {
          const memberAt = member.valueDeclaration ?? at;
          scanCallable(
            `${label}.${member.name}`,
            checker.getTypeOfSymbolAtLocation(member, memberAt),
            memberAt,
          );
        }
      }
    }
  }
  return {found, functions};
}

/** Non-test `.mjs` files under `dir`. @param {string} dir @returns {string[]} */
function sourceFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === '__tests__'
        ? []
        : sourceFiles(full);
    }
    return entry.name.endsWith('.mjs') && !entry.name.includes('.test.')
      ? [full]
      : [];
  });
}

/**
 * Every place a source file reads a `__`-prefixed option, found in its AST:
 * from a parameter named `options` or `opts` (`.__x`, `?.__x`, `['__x']`,
 * destructured in a declaration or an assignment), and a `__` property in a
 * parameter's own destructuring pattern. Every function counts, exported or
 * not, so a hand-off cannot hide one call deeper.
 * @param {string} file
 * @param {string} code
 * @returns {string[]}
 */
function scanSource(file, code) {
  const source = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  /** @type {string[]} */
  const hits = [];
  /** @param {any} node @param {string} what */
  const hit = (node, what) => {
    const {line} = source.getLineAndCharacterOfPosition(node.getStart());
    hits.push(`${file}:${line + 1} ${what}`);
  };
  const OPTION_NAMES = new Set(['options', 'opts']);
  /**
   * The options parameter, however it is spelled: through parentheses and a
   * JSDoc cast (`/** @type {any} *\/ (options)`), an `as`/`satisfies`/type
   * assertion, or on the left of a default (`options ?? {}`, `opts || {}`).
   * @param {any} n
   * @returns {boolean}
   */
  const isOptions = n => {
    if (!n) return false;
    if (ts.isIdentifier(n)) return OPTION_NAMES.has(n.text);
    if (
      ts.isParenthesizedExpression(n) ||
      (ts.isAsExpression && ts.isAsExpression(n)) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n)) ||
      (ts.isTypeAssertionExpression && ts.isTypeAssertionExpression(n)) ||
      (ts.isNonNullExpression && ts.isNonNullExpression(n))
    )
      return isOptions(n.expression);
    if (
      ts.isBinaryExpression(n) &&
      (n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        n.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    )
      return isOptions(n.left);
    return false;
  };
  /** @param {any} n */
  const propName = n =>
    n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : null;
  /** A `__` key in an object binding or assignment pattern. @param {any} pattern */
  const hiddenKeys = pattern => {
    /** @type {string[]} */
    const keys = [];
    if (ts.isObjectBindingPattern(pattern)) {
      for (const el of pattern.elements) {
        const key = propName(el.propertyName) ?? propName(el.name);
        if (key && HIDDEN.test(key)) keys.push(key);
      }
    } else if (ts.isObjectLiteralExpression(pattern)) {
      for (const p of pattern.properties) {
        const key = propName(p.name);
        if (key && HIDDEN.test(key)) keys.push(key);
      }
    }
    return keys;
  };
  /** @param {any} node */
  const visit = node => {
    if (
      (ts.isPropertyAccessExpression(node) ||
        ts.isPropertyAccessChain?.(node)) &&
      isOptions(node.expression) &&
      HIDDEN.test(node.name.text)
    )
      hit(node, node.getText());
    if (
      ts.isElementAccessExpression(node) &&
      isOptions(node.expression) &&
      ts.isStringLiteral(node.argumentExpression) &&
      HIDDEN.test(node.argumentExpression.text)
    )
      hit(node, node.getText());
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isOptions(node.initializer)
    )
      for (const key of hiddenKeys(node.name))
        hit(node, `{${key}} = ${node.initializer.getText()}`);
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isOptions(node.right)
    ) {
      const left = ts.isParenthesizedExpression(node.left)
        ? node.left.expression
        : node.left;
      for (const key of hiddenKeys(left))
        hit(node, `{${key}} = ${node.right.getText()}`);
    }
    if (ts.isParameter(node))
      for (const key of hiddenKeys(node.name)) hit(node, `parameter {${key}}`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

/** Every hidden option read in the CLI's own source. */
function hiddenOptionReads() {
  /** @type {string[]} */
  const hits = [];
  for (const dir of ['api', 'clients', 'foundation', 'host', 'authoring']) {
    for (const file of sourceFiles(path.join(CLI_ROOT, dir))) {
      hits.push(
        ...scanSource(
          path.relative(CLI_ROOT, file),
          fs.readFileSync(file, 'utf8'),
        ),
      );
    }
  }
  return hits;
}

describe('public API functions take no hidden options', () => {
  it('no exported function has a `__`-prefixed option', () => {
    const {found, functions} = hiddenOptions();
    // The scan reached the surface: the API entry alone exports dozens.
    expect(functions).toBeGreaterThan(50);
    expect(found).toEqual([]);
  }, 60_000);

  it('no CLI code reads a `__`-prefixed option, by any spelling', () => {
    const hits = hiddenOptionReads();
    expect(hits).toEqual([]);
  });

  it('the read scan catches every spelling of a hidden option', () => {
    // Each line plants one spelling the scan must name.
    const planted = [
      'export function a(file, options = {}) { return options.__x; }',
      'export function b(file, options) { return options?.__x; }',
      "export function c(file, opts) { return opts['__x']; }",
      'export function d(file, options) { const {out, __writeRoot} = options; return out; }',
      'export function e(file, options) { const {__x: y} = options; return y; }',
      'export function f(file, {out, __x} = {}) { return out; }',
      'export function g(file, options) { let w; ({__x: w} = options); return w; }',
      'export function i(file, options) { return /** @type {any} */ (options).__x; }',
      'export function j(file, options) { const {__x} = /** @type {any} */ (options); return __x; }',
      'export function k(file, options) { const {__x} = options ?? {}; return __x; }',
      'export function l(file, opts) { const {__x} = opts || {}; return __x; }',
      "export function m(file, options) { return (options ?? {})['__x']; }",
    ];
    for (const code of planted) {
      expect(scanSource('planted.mjs', code), code).not.toEqual([]);
    }
    // A theme's own `__` fields read from the theme are not options.
    expect(
      scanSource(
        'theme.mjs',
        'export function h(theme, options) { return theme.__icons ?? options.out; }',
      ),
    ).toEqual([]);
  });
});
