// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guards the RSC server/client boundary of every public component (#823).
 * @input Reads packages/core/package.json export map + every source file under
 *   packages/core/src, parsed with the TypeScript compiler API
 * @output Unit tests for the detection rules, plus two invariants tying the
 *   presence of `'use client'` to what a component's import graph actually needs
 * @position Cross-cutting meta-test; sibling of scripts/check-use-client.mjs
 *
 * `scripts/check-use-client.mjs` enforces one direction only, and only
 * directly: a file that *imports* a React client API must carry the directive.
 * It is blind to two things this test covers:
 *
 *   1. Components carrying `'use client'` that no longer need it. A stale
 *      directive is not a lint error, but it pins the component to the client
 *      bundle and blocks it from ever resolving through a `react-server`
 *      export condition (#823 Phase 2).
 *   2. Components that become client-only *transitively* — e.g. a directive-
 *      free `Badge.tsx` starting to import `Tooltip`. Badge itself imports no
 *      React client API, so check-use-client.mjs stays silent, yet Badge is no
 *      longer server-renderable.
 *
 * Both invariants below derive the server-safe set from the import graph, so
 * the safe list is never written down twice — adding a hook (or a client
 * import) to one of these components fails the test on its own.
 *
 * SYNC: When modified, update this header and scripts/check-use-client.mjs if
 * the client-API list changes.
 */

import {describe, it, expect} from 'vitest';
import {readdirSync, readFileSync, existsSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, dirname, resolve, relative} from 'node:path';
import ts from 'typescript';

const SRC_DIR = __dirname;
const PKG_JSON = join(SRC_DIR, '..', 'package.json');

/**
 * React APIs that only exist in a client component. Kept in sync with
 * `CLIENT_APIS` in scripts/check-use-client.mjs.
 */
const CLIENT_APIS = new Set([
  'createContext',
  'useContext',
  // React 19's context read. `use(promise)` *is* legal on the server, so this
  // over-approximates — but every `use()` call site in this package reads a
  // context, which is exactly as client-only as useContext.
  'use',
  'useActionState',
  'useState',
  'useEffect',
  'useEffectEvent',
  'useRef',
  'useCallback',
  'useMemo',
  'useReducer',
  'useId',
  'useTransition',
  'useOptimistic',
  'useSyncExternalStore',
  'useLayoutEffect',
  'useInsertionEffect',
  'useImperativeHandle',
  'useDeferredValue',
  // The one non-hook export in react's client-only set.
  'startTransition',
]);

const EXTENSIONS = ['.tsx', '.ts', '.mjs', '.js', '.jsx'];

/**
 * `'use client'` modules a server-safe component may render as a client
 * island: each does nothing on the server, so the component's server output
 * is unchanged. The walk stops at them.
 */
const CLIENT_ISLANDS = new Set(['hooks/AnnounceRenderedText.tsx']);

const isSourceFile = (name: string) =>
  /\.[jt]sx?$/.test(name) &&
  !/\.(test|test-violations|stories|doc|perf)\./.test(name) &&
  !name.endsWith('.d.ts');

/** Resolve a relative import specifier the way a bundler would. */
function resolveSpecifier(spec: string, fromFile: string): string | null {
  if (!spec.startsWith('.')) {
    return null;
  }
  const base = resolve(dirname(fromFile), spec);
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) {
      return base + ext;
    }
  }
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const index = join(base, `index${ext}`);
      if (existsSync(index)) {
        return index;
      }
    }
  }
  return null;
}

interface ReExport {
  target: string;
  exportedName: string;
  localName: string;
}

interface ModuleInfo {
  rel: string;
  hasUseClient: boolean;
  clientAPIs: string[];
  reactDom: string[];
  moduleMutableState: string[];
  /** Plain imports: the names pulled, or '*' for default/namespace/side-effect. */
  imports: {target: string; names: Set<string> | '*'}[];
  reExports: ReExport[];
  starReExports: string[];
  /** True when every top-level statement is an import or a re-export. */
  isPureBarrel: boolean;
}

const moduleCache = new Map<string, ModuleInfo>();

/** Every named binding in the clause is `type`-only, so the import is erased. */
function isTypeOnlyImport(clause: ts.ImportClause): boolean {
  if (clause.isTypeOnly) {
    return true;
  }
  if (clause.name) {
    return false;
  }
  const bindings = clause.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) {
    return false;
  }
  return (
    bindings.elements.length > 0 &&
    bindings.elements.every(element => element.isTypeOnly)
  );
}

function isTypeOnlyExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) {
    return true;
  }
  const clause = node.exportClause;
  if (!clause || !ts.isNamedExports(clause)) {
    return false;
  }
  return (
    clause.elements.length > 0 &&
    clause.elements.every(element => element.isTypeOnly)
  );
}

function parseModule(file: string): ModuleInfo {
  const cached = moduleCache.get(file);
  if (cached) {
    return cached;
  }
  const info = parseSource(readFileSync(file, 'utf-8'), file);
  moduleCache.set(file, info);
  return info;
}

/**
 * Parse one module's source. Split from {@link parseModule} so the detection
 * rules can be unit-tested against source strings rather than real files.
 */
function parseSource(text: string, file: string): ModuleInfo {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TSX,
  );

  const info: ModuleInfo = {
    rel: relative(SRC_DIR, file),
    hasUseClient: false,
    clientAPIs: [],
    reactDom: [],
    moduleMutableState: [],
    imports: [],
    reExports: [],
    starReExports: [],
    isPureBarrel: true,
  };

  // Directive prologue: only comments and blank lines may precede it, which
  // the parser has already stripped by the time we see `statements`. Walk past
  // *every* string-literal directive — stopping at the first non-`use client`
  // one would let `'use strict';` hide the directive behind it.
  for (const statement of sourceFile.statements) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression)
    ) {
      if (statement.expression.text === 'use client') {
        info.hasUseClient = true;
      }
      continue;
    }
    break;
  }

  /** Local names bound to the react namespace: `import React from 'react'`. */
  const reactNamespaces = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const spec = (statement.moduleSpecifier as ts.StringLiteral).text;
      const clause = statement.importClause;
      const typeOnly = clause ? isTypeOnlyImport(clause) : false;

      if (spec === 'react' && clause && !clause.isTypeOnly) {
        const reactBindings = clause.namedBindings;
        if (reactBindings && ts.isNamedImports(reactBindings)) {
          for (const element of reactBindings.elements) {
            const imported = (element.propertyName ?? element.name).text;
            if (!element.isTypeOnly && CLIENT_APIS.has(imported)) {
              info.clientAPIs.push(imported);
            }
          }
        }
        // `import React from 'react'` and `import * as React from 'react'` put
        // every client API one property access away, where the named scan above
        // cannot see it. Record the local name; the sweep below finds the uses.
        if (clause.name) {
          reactNamespaces.add(clause.name.text);
        }
        if (reactBindings && ts.isNamespaceImport(reactBindings)) {
          reactNamespaces.add(reactBindings.name.text);
        }
      }
      if (!typeOnly && spec.startsWith('react-dom')) {
        info.reactDom.push(spec);
      }

      if (!typeOnly) {
        const target = resolveSpecifier(spec, file);
        if (target) {
          let names: Set<string> | '*' = '*';
          const bindings = clause?.namedBindings;
          if (bindings && ts.isNamedImports(bindings) && !clause?.name) {
            names = new Set(
              bindings.elements
                .filter(element => !element.isTypeOnly)
                .map(element => (element.propertyName ?? element.name).text),
            );
          }
          info.imports.push({target, names});
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      const spec = (statement.moduleSpecifier as ts.StringLiteral).text;
      if (!isTypeOnlyExport(statement)) {
        const target = resolveSpecifier(spec, file);
        if (target) {
          const clause = statement.exportClause;
          if (clause && ts.isNamedExports(clause)) {
            for (const element of clause.elements) {
              if (element.isTypeOnly) {
                continue;
              }
              info.reExports.push({
                target,
                exportedName: element.name.text,
                localName: (element.propertyName ?? element.name).text,
              });
            }
          } else {
            info.starReExports.push(target);
          }
        }
      }
      continue;
    }

    // Anything else is real code, so this module is not a pass-through barrel.
    info.isPureBarrel = false;

    if (ts.isVariableStatement(statement)) {
      const isLet = !(statement.declarationList.flags & ts.NodeFlags.Const);
      for (const decl of statement.declarationList.declarations) {
        const name = decl.name.getText(sourceFile);
        if (isLet) {
          info.moduleMutableState.push(`let ${name}`);
        } else if (decl.initializer) {
          const ctor = /^new (Map|Set|WeakMap|WeakSet)\b/.exec(
            decl.initializer.getText(sourceFile),
          );
          if (ctor) {
            info.moduleMutableState.push(`const ${name} = new ${ctor[1]}()`);
          }
        }
      }
    }
  }

  // Value-position `React.useState(...)`. A type reference like
  // `React.ReactNode` parses as a QualifiedName rather than a
  // PropertyAccessExpression, so types never reach this branch.
  if (reactNamespaces.size > 0) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        reactNamespaces.has(node.expression.text) &&
        CLIENT_APIS.has(node.name.text)
      ) {
        info.clientAPIs.push(`${node.expression.text}.${node.name.text}`);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  return info;
}

/**
 * Walk the runtime import graph from `entry` and report every client-only
 * surface it reaches.
 *
 * `packages/core/package.json` declares `sideEffects` as a narrow allowlist
 * (`*.stylex.ts`, `componentStyles.ts`, `*.css`), so every other module is
 * side-effect free and a bundler may drop unused re-exports. A pure
 * pass-through barrel is therefore followed by *used export* rather than
 * wholesale — otherwise importing `mergeProps` from `../utils` would appear to
 * drag in every unrelated sibling the barrel happens to re-export.
 *
 * @param ownDir When set, `'use client'` directives on files directly inside
 *   this directory are ignored, so the walk reports what the component's code
 *   actually *needs* rather than what it is currently *marked* as.
 */
function findClientSurfaces(
  entry: string,
  ownDir: string | null,
): {reason: string; file: string; via: string}[] {
  const problems: {reason: string; file: string; via: string}[] = [];
  const visited = new Set<string>();
  const queue: [string, Set<string> | '*', string[]][] = [
    [entry, '*', [relative(SRC_DIR, entry)]],
  ];

  while (queue.length > 0) {
    const [file, names, via] = queue.pop()!;
    if (!/\.(tsx?|jsx?|mjs)$/.test(file)) {
      continue;
    }
    const key = `${file}|${names === '*' ? '*' : [...names].sort().join(',')}`;
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    if (CLIENT_ISLANDS.has(relative(SRC_DIR, file))) {
      continue;
    }

    const info = parseModule(file);
    const chain = via.join(' -> ');
    const insideOwnDir = ownDir !== null && dirname(file) === ownDir;

    if (info.hasUseClient && !insideOwnDir) {
      problems.push({
        reason: 'depends on a "use client" module',
        file: info.rel,
        via: chain,
      });
    }
    if (info.clientAPIs.length > 0) {
      const apis = [...new Set(info.clientAPIs)].join(', ');
      problems.push({
        reason: `imports ${apis} from react`,
        file: info.rel,
        via: chain,
      });
    }
    if (info.reactDom.length > 0) {
      problems.push({
        reason: `imports ${info.reactDom.join(', ')}`,
        file: info.rel,
        via: chain,
      });
    }
    if (info.moduleMutableState.length > 0) {
      problems.push({
        reason: `module-level mutable state (${info.moduleMutableState.join('; ')})`,
        file: info.rel,
        via: chain,
      });
    }

    const push = (target: string, next: Set<string> | '*') =>
      queue.push([target, next, [...via, relative(SRC_DIR, target)]]);

    if (info.isPureBarrel && names !== '*') {
      for (const wanted of names) {
        const providers = info.reExports.filter(r => r.exportedName === wanted);
        if (providers.length > 0) {
          for (const p of providers) {
            push(p.target, new Set([p.localName]));
          }
        } else {
          for (const t of info.starReExports) {
            push(t, new Set([wanted]));
          }
        }
      }
      for (const imp of info.imports) {
        push(imp.target, imp.names);
      }
    } else {
      for (const imp of info.imports) {
        push(imp.target, imp.names);
      }
      for (const r of info.reExports) {
        push(r.target, new Set([r.localName]));
      }
      for (const t of info.starReExports) {
        push(t, '*');
      }
    }
  }

  return problems;
}

interface Component {
  subpath: string;
  dir: string;
  entry: string;
  /** Source files in the component's own directory that carry the directive. */
  directiveFiles: string[];
}

/**
 * Every component the package exposes as a `./Name` subpath backed by
 * `./src/Name/index.ts`. Driving off the export map keeps the test aligned
 * with the package's real public surface.
 */
function publicComponents(): Component[] {
  const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf-8')) as {
    exports?: Record<string, {source?: string}>;
  };
  const components: Component[] = [];
  for (const [subpath, entryPoint] of Object.entries(pkg.exports ?? {})) {
    const source = entryPoint?.source;
    if (!source) {
      continue;
    }
    const match = /^\.\/src\/([^/]+)\/index\.ts$/.exec(source);
    if (!match) {
      continue;
    }
    const dir = join(SRC_DIR, match[1]);
    const entry = join(dir, 'index.ts');
    if (!existsSync(entry)) {
      continue;
    }
    const directiveFiles = readdirSync(dir)
      .filter(isSourceFile)
      .filter(name => parseModule(join(dir, name)).hasUseClient)
      .map(name => `${match[1]}/${name}`);
    components.push({subpath, dir, entry, directiveFiles});
  }
  return components;
}

const COMPONENTS = publicComponents();

const format = (problems: {reason: string; file: string; via: string}[]) =>
  [...new Map(problems.map(p => [`${p.file}|${p.reason}`, p])).values()]
    .map(p => `      ${p.file} ${p.reason}\n        via ${p.via}`)
    .join('\n');

/** Parse a source string as if it were a file inside `SRC_DIR`. */
const parse = (source: string) =>
  parseSource(source, join(SRC_DIR, 'probe.tsx'));

describe('parseSource', () => {
  it('reads a client API from a named react import', () => {
    expect(
      parse(`import {useState} from 'react';\nexport const a = 1;`).clientAPIs,
    ).toEqual(['useState']);
  });

  it('reads a client API reached through a default React binding', () => {
    const info = parse(
      `import React from 'react';\nexport const a = () => React.useState(0);`,
    );
    expect(info.clientAPIs).toEqual(['React.useState']);
  });

  it('reads a client API reached through a namespace React binding', () => {
    const info = parse(
      `import * as React from 'react';\nexport const C = React.createContext(false);`,
    );
    expect(info.clientAPIs).toEqual(['React.createContext']);
  });

  it('reads both halves of a mixed default-and-named react import', () => {
    const info = parse(
      `import React, {useRef} from 'react';\nexport const a = () => React.useState(0) && useRef(null);`,
    );
    expect(info.clientAPIs.sort()).toEqual(['React.useState', 'useRef']);
  });

  it('does not flag a React binding used only in type position', () => {
    const info = parse(
      `import * as React from 'react';\nexport type P = {a: React.ReactNode; b: React.KeyboardEvent};`,
    );
    expect(info.clientAPIs).toEqual([]);
  });

  it('treats React 19 `use` as a client API', () => {
    // `use(Context)` is a context read, exactly as client-only as useContext.
    expect(
      parse(`import {use} from 'react';\nexport const a = 1;`).clientAPIs,
    ).toEqual(['use']);
  });

  it.each(['useActionState', 'useEffectEvent', 'startTransition'])(
    'treats React 19 `%s` as a client API',
    api => {
      expect(
        parse(`import {${api}} from 'react';\nexport const a = 1;`).clientAPIs,
      ).toEqual([api]);
    },
  );

  it('reads a client API imported under an alias', () => {
    expect(
      parse(
        `import {useActionState as useSubmitState} from 'react';\nexport const a = 1;`,
      ).clientAPIs,
    ).toEqual(['useActionState']);
  });

  it('reads useEffectEvent reached through a default React binding', () => {
    expect(
      parse(
        `import React from 'react';\nexport const a = () => React.useEffectEvent(() => {});`,
      ).clientAPIs,
    ).toEqual(['React.useEffectEvent']);
  });

  it('sees `use client` behind another prologue directive', () => {
    expect(
      parse(`'use strict';\n'use client';\nexport const a = 1;`).hasUseClient,
    ).toBe(true);
  });

  it('ignores a `use client` string that follows real code', () => {
    expect(parse(`export const a = 1;\n'use client';`).hasUseClient).toBe(
      false,
    );
  });
});

describe('CLIENT_APIS', () => {
  it('covers every client-only hook the react-server build omits', () => {
    // React's own builds are the ground truth for "works on the server": the
    // react-server condition maps to a deliberate allowlist, and the exports
    // it drops are exactly the client-only surface. Every hook-shaped export
    // in the client build but not the server build must be in CLIENT_APIS,
    // or both invariants below go blind to it. The subset holds in one
    // direction only: `use`, useId, useMemo and useCallback are server-legal
    // but deliberately over-approximated as client APIs above.
    const nodeRequire = createRequire(import.meta.url);
    const cjs = join(dirname(nodeRequire.resolve('react/package.json')), 'cjs');
    const exportsOf = (file: string) =>
      new Set(
        [
          ...readFileSync(join(cjs, file), 'utf-8').matchAll(
            /exports\.(\w+)\s*=/g,
          ),
        ].map(m => m[1]),
      );
    const client = exportsOf('react.production.js');
    const server = exportsOf('react.react-server.production.js');
    const missing = [...client].filter(
      name =>
        (/^use[A-Z]/.test(name) || name === 'startTransition') &&
        !server.has(name) &&
        !CLIENT_APIS.has(name),
    );
    expect(
      missing,
      `\nreact marks these exports client-only (absent from its react-server\n` +
        `build) but CLIENT_APIS does not list them. Add them here and to\n` +
        `scripts/check-use-client.mjs:\n  ${missing.join(', ')}\n`,
    ).toEqual([]);
  });

  it('stays in sync with scripts/check-use-client.mjs', () => {
    const script = readFileSync(
      join(SRC_DIR, '..', '..', '..', 'scripts', 'check-use-client.mjs'),
      'utf-8',
    );
    const literal = /const CLIENT_APIS = \[([\s\S]*?)\];/.exec(script);
    const names =
      literal === null
        ? []
        : [
            ...literal[1]
              .split('\n')
              .filter(line => !line.trim().startsWith('//'))
              .join('\n')
              .matchAll(/'([^']+)'/g),
          ].map(m => m[1]);
    expect(new Set(names)).toEqual(CLIENT_APIS);
  });
});

describe('RSC server/client boundary (#823)', () => {
  it('finds the public component entry points', () => {
    // The export map lists 100+ component subpaths; a floor this close to the
    // real count catches a resolution bug that silently shrinks the covered set
    // and turns both invariants below into no-ops.
    expect(COMPONENTS.length).toBeGreaterThan(95);
  });

  it('does not mark server-safe components as "use client"', () => {
    const stale: string[] = [];
    for (const component of COMPONENTS) {
      if (component.directiveFiles.length === 0) {
        continue;
      }
      // Ignore this component's own directives so the graph reports what its
      // code needs, not what it is currently labelled.
      const problems = findClientSurfaces(component.entry, component.dir);
      if (problems.length === 0) {
        stale.push(
          `  ${component.subpath} is server-safe but still carries 'use client' in: ${component.directiveFiles.join(', ')}`,
        );
      }
    }
    expect(
      stale.join('\n'),
      `\nThese components import no client-only surface, so the directive pins them\n` +
        `to the client bundle for nothing. Remove it (source file *and* index.ts):\n`,
    ).toBe('');
  });

  it('keeps directive-free components free of client-only imports', () => {
    const leaked: string[] = [];
    for (const component of COMPONENTS) {
      if (component.directiveFiles.length > 0) {
        continue;
      }
      const problems = findClientSurfaces(component.entry, null);
      if (problems.length > 0) {
        leaked.push(`  ${component.subpath}:\n${format(problems)}`);
      }
    }
    expect(
      leaked.join('\n'),
      `\nThese components ship without 'use client', so they are server modules —\n` +
        `but they reach a client-only surface. Either drop the client dependency or\n` +
        `restore the directive. scripts/check-use-client.mjs cannot see this:\n`,
    ).toBe('');
  });
});
