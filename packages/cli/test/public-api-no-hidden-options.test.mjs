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
 * is the one thing allowed. A second check keeps the CLI's own code from
 * reading an `options.__*` hand-off again.
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

describe('public API functions take no hidden options', () => {
  it('no exported function has a `__`-prefixed option', () => {
    const {found, functions} = hiddenOptions();
    // The scan reached the surface: the API entry alone exports dozens.
    expect(functions).toBeGreaterThan(50);
    expect(found).toEqual([]);
  }, 60_000);

  it('no CLI code reads an `options.__*` hand-off', () => {
    const read = /\b(?:options|opts)\??\.__[a-zA-Z]\w*/g;
    /** @type {string[]} */
    const hits = [];
    for (const dir of ['api', 'clients', 'foundation', 'host', 'authoring']) {
      for (const file of sourceFiles(path.join(CLI_ROOT, dir))) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          for (const match of line.matchAll(read)) {
            hits.push(`${path.relative(CLI_ROOT, file)}:${i + 1} ${match[0]}`);
          }
        });
      }
    }
    expect(hits).toEqual([]);
  });
});
