// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file runner.ts
 * @input User TSX source + the in-browser TypeScript compiler
 * @output A live React component (or a structured error)
 * @position Playground preview iframe — compiles & evaluates user code.
 *
 * Transpiles TSX → CommonJS with the self-hosted TypeScript compiler
 * (window.ts, served from /vendor/typescript.js — corpnet blocks CDNs), then
 * evaluates it with a custom `require` mapped to the preview scope plus a
 * global scope so unimported React hooks / Astryx components still resolve.
 */

import type * as TS from 'typescript';
import {scope} from '@/generated/playground-scope';

/** Set by the page after loading /vendor/typescript.js */
let ts: typeof TS | null = null;

export function setTypeScript(instance: typeof TS) {
  ts = instance;
}

type RunPhase = 'compile' | 'runtime';

type RunResult =
  | {Component: React.ComponentType; error?: undefined}
  | {Component?: undefined; error: string; phase: RunPhase};

const ASSET_RE =
  /\.(png|jpe?g|gif|svg|webp|ico|bmp|css|scss|less|sass|woff2?|ttf|eot|otf|mp4|webm|ogg|mp3|wav)$/i;

const scopeLookup = new Map<string, Record<string, unknown>>();
for (const [key, value] of Object.entries(scope)) {
  scopeLookup.set(key.toLowerCase(), value as Record<string, unknown>);
}

const warnedModules = new Set<string>();

/**
 * The placeholder proxy below is deliberately forgiving — user code in the
 * playground may import anything, and a hard failure on every stray import
 * would make the editor unusable. The cost is that a module missing from the
 * generated scope is indistinguishable from one that renders nothing: Recharts
 * went unnoticed this way, with every chart in the dashboard templates
 * resolving to `() => null` while the legends around it painted normally. Say
 * so once per module, so the next gap is one console line rather than a
 * silently empty preview.
 */
function warnUnresolved(id: string): void {
  if (warnedModules.has(id)) {
    return;
  }
  warnedModules.add(id);
  console.warn(
    `[playground] "${id}" is not in the preview scope — its exports will ` +
      `render nothing. Add it in apps/docsite/scripts/generate-scope.mjs.`,
  );
}

/**
 * Modules a blog post's live example may import by relative path (`./Name`):
 * the post-local example assets beside that post's Markdown file
 * (spec:AST-033 FR22). Only the post's own frame receives them.
 */
export type LocalModules = Readonly<Record<string, Record<string, unknown>>>;

/** A CommonJS-style require resolving against the preview scope. */
function makeRequire(localModules?: LocalModules): (id: string) => unknown {
  return (id: string) => {
    if (ASSET_RE.test(id)) {
      return {default: '', __esModule: true};
    }
    const local = localModules?.[id];
    if (local) {
      return local.__esModule ? local : {...local, __esModule: true};
    }
    const mod = scopeLookup.get(id.toLowerCase());
    if (mod) {
      // Mark as an ES module so TS esModuleInterop uses `.default` correctly.
      return (mod as {__esModule?: boolean}).__esModule
        ? mod
        : {...mod, __esModule: true};
    }
    warnUnresolved(id);
    // Unknown module — return placeholders that render nothing.
    return new Proxy(
      {__esModule: true},
      {
        get(_target, prop) {
          if (prop === '__esModule') {
            return true;
          }
          if (typeof prop === 'string') {
            const placeholder = () => null;
            (placeholder as {displayName?: string}).displayName =
              `${id}/${prop}`;
            return placeholder;
          }
          return undefined;
        },
      },
    );
  };
}

/**
 * Names we must NOT inject as globals because doing so would shadow a JavaScript
 * built-in / standard global that user code relies on. lucide-react, for
 * example, exports icons literally named `Map` and `Image`; injecting them as
 * parameters shadows the native `Map`/`Image`, so `new Map()` throws "Map is
 * not a constructor". Leaving these out lets the names resolve to the real
 * built-in via the function's normal scope chain.
 */
const RESERVED_GLOBALS = new Set([
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Date',
  'Promise',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'BigInt',
  'RegExp',
  'Error',
  'Function',
  'Proxy',
  'Reflect',
  'JSON',
  'Math',
  'Intl',
  'Image',
  'Event',
  'URL',
]);

/**
 * Build a scope with ALL named exports from every module so React hooks and
 * Astryx components are available as globals without an explicit import.
 *
 * Excludes names that would shadow JS built-ins (see RESERVED_GLOBALS).
 */
function buildGlobalScope(): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  for (const moduleExports of Object.values(scope)) {
    for (const [name, value] of Object.entries(moduleExports)) {
      if (
        name !== 'default' &&
        name !== '__esModule' &&
        !RESERVED_GLOBALS.has(name)
      ) {
        vars[name] = value;
      }
    }
  }
  // React global for classic JSX (React.createElement).
  vars.React = scope['react']?.default ?? scope['react'];
  return vars;
}

// The global scope and require resolver depend only on the static `scope`
// import, so build them once and reuse across every run (evaluate() is on the
// hot path — it runs on every debounced edit).
let globalScopeCache: Record<string, unknown> | null = null;
function getGlobalScope(): Record<string, unknown> {
  return (globalScopeCache ??= buildGlobalScope());
}

const sharedRequire = makeRequire();

function compile(code: string): string {
  if (ts == null) {
    throw new Error(
      'TypeScript has not been loaded yet — call setTypeScript()',
    );
  }
  const result = ts.transpileModule(code, {
    fileName: 'playground.tsx',
    reportDiagnostics: false,
    compilerOptions: {
      jsx: ts.JsxEmit.React, // emit React.createElement (classic runtime)
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      allowJs: true,
    },
  });
  return result.outputText;
}

/**
 * Names the user's code declares at the top level of the compiled module.
 *
 * Globals (every Astryx/icon export) are passed to `new Function` as parameters so
 * unimported components resolve. But a top-level `const Foo = ...` in the user
 * code collides with a `Foo` parameter ("Identifier 'Foo' has already been
 * declared") — e.g. a template defining `const AppleIcon` clashes with
 * lucide-react's `AppleIcon`. So we drop any global the user declares; their
 * declaration wins.
 */
function findDeclaredIdentifiers(compiled: string): Set<string> {
  const names = new Set<string>();
  // Top-level declarations (function/class and simple const/let/var bindings).
  const declRe =
    /^(?:export\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(compiled)) !== null) {
    names.add(m[1]);
  }
  return names;
}

function evaluate(
  compiled: string,
  localModules?: LocalModules,
): React.ComponentType {
  const exportsObj: Record<string, unknown> = {};
  const moduleObj = {exports: exportsObj};
  const globals = getGlobalScope();

  // Don't inject globals the user already declares — a parameter and a
  // top-level `const`/`function`/`class` of the same name can't coexist.
  const declared = findDeclaredIdentifiers(compiled);
  const globalNames = Object.keys(globals).filter(
    name =>
      !declared.has(name) &&
      name !== 'module' &&
      name !== 'exports' &&
      name !== 'require',
  );

  const keys = ['module', 'exports', 'require', ...globalNames];
  const values = [
    moduleObj,
    exportsObj,
    localModules == null ? sharedRequire : makeRequire(localModules),
    ...globalNames.map(name => globals[name]),
  ];

  const fn = new Function(...keys, compiled);
  fn(...values);

  const defaultExport =
    (moduleObj.exports as Record<string, unknown>).default ??
    exportsObj.default;

  if (typeof defaultExport !== 'function') {
    throw new Error(
      'No default export found. Add `export default function YourComponent()`.',
    );
  }

  return defaultExport as React.ComponentType;
}

export function runCode(code: string, localModules?: LocalModules): RunResult {
  if (!ts) {
    return {error: 'TypeScript compiler not loaded yet', phase: 'compile'};
  }

  let compiled: string;
  try {
    compiled = compile(code);
  } catch (e: unknown) {
    return {
      error: e instanceof Error ? e.message : String(e),
      phase: 'compile',
    };
  }

  try {
    const Component = evaluate(compiled, localModules);
    return {Component};
  } catch (e: unknown) {
    return {
      error: e instanceof Error ? e.message : String(e),
      phase: 'runtime',
    };
  }
}
