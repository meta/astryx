// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tokensImports.test.ts
 * @input The source of theme/tokens.ts, theme/useTheme.ts, Icon, Button, the
 *   Button, Icon, Link and IconButton package entries, and every module they
 *   import
 * @output Token resolution, and so a first load that renders an Icon or a
 *   Button, imports no theme-rule generator, also when every export of a
 *   component entry is kept
 * @position Source boundary test of packages/core/src/theme/tokens.ts
 *
 * The walk follows static imports only: a type-only import is erased, and a
 * dynamic import loads later. A bundler can keep all of a module's own code
 * when the app uses any of its exports, so the walk follows every import of a
 * loaded module. A named re-export loads its target only for a name that an
 * importer uses, so the walk follows a re-export only for such a name.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

const SRC = path.resolve(__dirname, '..');
const PACKAGE_EXPORTS: Record<string, {source: string}> = JSON.parse(
  fs.readFileSync(path.resolve(SRC, '../package.json'), 'utf8'),
).exports;

type Names = ReadonlySet<string> | 'all';

interface ModuleLinks {
  /** Modules this module's own code imports, with the names it uses. */
  imports: {file: string; names: Names}[];
  /** Re-exports: an importer's name maps to a name in another module. */
  reexports: {file: string; names: ReadonlyMap<string, string> | 'all'}[];
}

function resolveModule(from: string, specifier: string): string {
  const base = path.resolve(path.dirname(from), specifier.replace(/\.js$/, ''));
  const resolved = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ].find(candidate => fs.existsSync(candidate));
  if (resolved == null) {
    throw new Error(`${from}: cannot resolve ${specifier}`);
  }
  return resolved;
}

function moduleLinks(file: string): ModuleLinks {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
  );
  const links: ModuleLinks = {imports: [], reexports: []};
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith('.') &&
      statement.importClause?.isTypeOnly !== true
    ) {
      const target = resolveModule(file, statement.moduleSpecifier.text);
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      if (bindings != null && ts.isNamespaceImport(bindings)) {
        links.imports.push({file: target, names: 'all'});
        continue;
      }
      const names = new Set<string>();
      if (clause?.name != null) {
        names.add('default');
      }
      for (const element of bindings?.elements ?? []) {
        if (!element.isTypeOnly) {
          names.add((element.propertyName ?? element.name).text);
        }
      }
      links.imports.push({file: target, names});
    } else if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier != null &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith('.')
    ) {
      const target = resolveModule(file, statement.moduleSpecifier.text);
      const clause = statement.exportClause;
      if (clause == null) {
        links.reexports.push({file: target, names: 'all'});
      } else if (ts.isNamespaceExport(clause)) {
        links.imports.push({file: target, names: 'all'});
      } else {
        const names = new Map<string, string>();
        for (const element of clause.elements) {
          if (!element.isTypeOnly) {
            names.set(
              element.name.text,
              (element.propertyName ?? element.name).text,
            );
          }
        }
        links.reexports.push({file: target, names});
      }
    }
  }
  return links;
}

/**
 * Every module a bundler keeps when an app imports any export of `entry`,
 * as paths relative to src/.
 */
function firstLoadModules(entry: string): Set<string> {
  const loaded = new Set<string>();
  const requested = new Map<string, Set<string> | 'all'>();
  const queue: {file: string; names: Names}[] = [
    {file: path.join(SRC, entry), names: 'all'},
  ];
  while (queue.length > 0) {
    const {file, names} = queue.pop() as {file: string; names: Names};
    const links = moduleLinks(file);
    if (!loaded.has(file)) {
      loaded.add(file);
      queue.push(...links.imports);
    }
    const before = requested.get(file) ?? new Set<string>();
    if (before === 'all') {
      continue;
    }
    const added =
      names === 'all' ? 'all' : [...names].filter(name => !before.has(name));
    if (added !== 'all' && added.length === 0) {
      continue;
    }
    requested.set(
      file,
      added === 'all' ? 'all' : new Set([...before, ...added]),
    );
    for (const reexport of links.reexports) {
      if (reexport.names === 'all') {
        queue.push({
          file: reexport.file,
          names: added === 'all' ? 'all' : new Set(added),
        });
        continue;
      }
      const forwarded = new Set<string>();
      for (const [exported, imported] of reexport.names) {
        if (added === 'all' || added.includes(exported)) {
          forwarded.add(imported);
        }
      }
      if (forwarded.size > 0) {
        queue.push({file: reexport.file, names: forwarded});
      }
    }
  }
  return new Set([...loaded].map(file => path.relative(SRC, file)));
}

describe('the theme tokens first load', () => {
  it.each([
    'theme/tokens.ts',
    'theme/useTheme.ts',
    'Icon/Icon.tsx',
    'Button/Button.tsx',
  ])('%s imports no theme-rule generator', entry => {
    expect(firstLoadModules(entry)).not.toContain(
      'theme/generateThemeRules.ts',
    );
  });

  // A host that lends a whole entry to other bundles keeps every export of
  // it, so nothing that entry exports may reach the generator.
  it.each(['./Button', './Icon', './Link', './IconButton'])(
    'every export of the %s entry imports no theme-rule generator',
    entry => {
      const source = path.resolve(SRC, '..', PACKAGE_EXPORTS[entry].source);
      expect(firstLoadModules(path.relative(SRC, source))).not.toContain(
        'theme/generateThemeRules.ts',
      );
    },
  );

  it('follows a re-export when an importer uses its name', () => {
    // theme/index.ts reaches the generator only through its re-exports.
    expect(firstLoadModules('theme/index.ts')).toContain(
      'theme/generateThemeRules.ts',
    );
  });
});
