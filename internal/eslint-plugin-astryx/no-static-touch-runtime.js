// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-static-touch-runtime.js
 * @description Keeps the shared touch runtime (the animator and the gesture
 * host) out of every Core component's static module graph. The runtime loads
 * once per page after first paint through `utils/touchRuntime.ts`
 * (`architecture:react-component-runtime` INV13), so a component that
 * imports it statically puts it back in the page's first load.
 *
 * The rule walks Core's static import graph from each component entry
 * (`packages/core/src/<Component>/index.ts`). Inside component folders it
 * follows every static import. It reports the import where a component file
 * reaches a shared module (outside the component folders) that reaches
 * `motion/animator` or `gestures/GestureHost` statically. Type-only imports
 * and `import()` are not edges. A runtime part that only the loader's
 * `import()` reaches is never walked, so it may use the runtime freely.
 *
 * Options: `{allowlist, root, srcRoot, optInFolders}`.
 * - `allowlist`: `{"<file> -> <module>": {why, removedBy}}`, src-relative.
 *   An import that reaches the runtime today stays allowed until the change
 *   in `removedBy` moves it behind the loader. The list only shrinks: a
 *   test fails when an entry no longer reaches the runtime.
 * - `root`: the repository root; `srcRoot` is relative to it
 *   (default `packages/core/src`).
 * - `optInFolders`: folders whose entry a caller opts into, such as
 *   `SnapPaging`; they count as shared modules, not as component entries.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** Where the repo config turns the rule on. */
export const scope = {
  files: ['packages/core/src/**/*.{ts,tsx}'],
  ignores: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/*.testing.*',
    '**/*.render-testing.*',
    '**/__tests__/**',
    '**/__fixtures__/**',
    'packages/core/src/utils/touchRuntime.ts',
    'packages/core/src/utils/touchRuntimeModules.tsx',
  ],
};

/** The shared touch modules no component may reach statically. */
export const TOUCH_MODULES = ['motion/animator.ts', 'gestures/GestureHost.ts'];

const EXTENSIONS = ['.ts', '.tsx'];
const IGNORED_FILE = /\.(test|spec|stories|testing|render-testing)\.[tj]sx?$/;

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function sourceFiles(directory) {
  const out = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['__tests__', '__fixtures__', 'node_modules'].includes(entry.name)) {
        out.push(...sourceFiles(full));
      }
    } else if (
      EXTENSIONS.includes(path.extname(entry.name)) &&
      !entry.name.endsWith('.d.ts') &&
      !IGNORED_FILE.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

/** Whether an import or export brings only types, which the compiler erases. */
function isTypeOnly(statement) {
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (clause == null) {
      return false;
    }
    if (clause.isTypeOnly) {
      return true;
    }
    const bindings = clause.namedBindings;
    return (
      clause.name == null &&
      bindings != null &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every(element => element.isTypeOnly)
    );
  }
  if (statement.isTypeOnly) {
    return true;
  }
  const exported = statement.exportClause;
  return (
    exported != null &&
    ts.isNamedExports(exported) &&
    exported.elements.length > 0 &&
    exported.elements.every(element => element.isTypeOnly)
  );
}

/**
 * The relative modules a file imports or re-exports statically. It reads a
 * real parse, so a string such as `'image/*'` cannot hide an import.
 */
export function staticImports(file) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    false,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out = [];
  for (const statement of source.statements) {
    if (!(
      ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
    )) {
      continue;
    }
    const specifierNode = statement.moduleSpecifier;
    if (
      specifierNode == null ||
      !ts.isStringLiteral(specifierNode) ||
      isTypeOnly(statement)
    ) {
      continue;
    }
    const specifier = specifierNode.text;
    const resolved = resolveRelative(file, specifier);
    if (resolved != null) {
      out.push({specifier, file: resolved});
    }
  }
  return out;
}

export function resolveRelative(importer, specifier) {
  if (!/^\.\.?(\/|$)/.test(specifier)) {
    return null;
  }
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    base,
    ...EXTENSIONS.map(extension => base + extension),
    ...EXTENSIONS.map(extension => path.join(base, `index${extension}`)),
  ];
  // A `.js` specifier names the `.ts` file TypeScript compiles to it.
  if (/\.js$/.test(base)) {
    candidates.push(
      base.replace(/\.js$/, '.ts'),
      base.replace(/\.js$/, '.tsx'),
    );
  }
  return candidates.find(isFile) ?? null;
}

const cache = new Map();
/** How long a graph is reused before the files are checked for changes. */
const REVALIDATE_MS = 1000;

/** The files' paths and change times, so an edit in any file is seen. */
function signature(files) {
  return files
    .map(file => {
      try {
        return `${file}:${fs.statSync(file).mtimeMs}`;
      } catch {
        return `${file}:gone`;
      }
    })
    .join('\n');
}

/**
 * Each import where a component file reaches a shared module that reaches
 * the touch runtime, as `{from, to, specifier}` with src-relative paths.
 */
export function touchRuntimeImports(srcRoot, optInFolders = []) {
  const key = `${srcRoot}\0${optInFolders.join(',')}`;
  const cached = cache.get(key);
  const now = Date.now();
  if (cached != null && now - cached.checkedAt < REVALIDATE_MS) {
    return cached.found;
  }
  const files = sourceFiles(srcRoot);
  const currentSignature = signature(files);
  if (cached != null && cached.signature === currentSignature) {
    cached.checkedAt = now;
    return cached.found;
  }
  const rel = file => path.relative(srcRoot, file).split(path.sep).join('/');
  const edges = new Map(files.map(file => [file, staticImports(file)]));
  // Every module that reaches a touch module statically.
  const importers = new Map();
  for (const [file, imports] of edges) {
    for (const {file: target} of imports) {
      if (!importers.has(target)) {
        importers.set(target, []);
      }
      importers.get(target).push(file);
    }
  }
  const reaches = new Set(
    TOUCH_MODULES.map(module => path.join(srcRoot, module)).filter(isFile),
  );
  const queue = [...reaches];
  while (queue.length > 0) {
    for (const importer of importers.get(queue.shift()) ?? []) {
      if (!reaches.has(importer)) {
        reaches.add(importer);
        queue.push(importer);
      }
    }
  }
  // A component is a capitalised top-level folder. One with no index, such
  // as a folder of shared parts, is walked only when an entry imports it.
  const isComponentFile = file => {
    const folder = rel(file).split('/')[0];
    return (
      rel(file).includes('/') &&
      /^[A-Z]/.test(folder) &&
      !optInFolders.includes(folder)
    );
  };
  const entries = files.filter(
    file => isComponentFile(file) && /^[^/]+\/index\.tsx?$/.test(rel(file)),
  );
  const found = [];
  const seen = new Set(entries);
  const walk = [...entries];
  while (walk.length > 0) {
    const file = walk.shift();
    for (const {file: target, specifier} of edges.get(file) ?? []) {
      if (!isComponentFile(target) && reaches.has(target)) {
        if (isComponentFile(file)) {
          found.push({from: rel(file), to: rel(target), specifier});
        }
        continue;
      }
      if (!seen.has(target)) {
        seen.add(target);
        walk.push(target);
      }
    }
  }
  cache.set(key, {found, signature: currentSignature, checkedAt: now});
  return found;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a static import that puts the shared touch runtime in a Core component’s first load; take it from the touch loader',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowlist: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                why: {type: 'string'},
                removedBy: {type: 'string'},
              },
              required: ['why', 'removedBy'],
            },
          },
          root: {type: 'string'},
          srcRoot: {type: 'string'},
          optInFolders: {type: 'array', items: {type: 'string'}},
        },
        additionalProperties: false,
      },
    ],
    messages: {
      runtime:
        "'{{specifier}}' reaches the shared touch runtime ({{to}}), so every page that renders this component loads it before first paint. Take what the component needs from the touch loader (`utils/touchRuntime.ts`) instead.",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const root = options.root ?? context.cwd;
    const srcRoot = path.resolve(root, options.srcRoot ?? 'packages/core/src');
    const filename = context.filename;
    if (!filename.startsWith(srcRoot + path.sep)) {
      return {};
    }
    const from = path.relative(srcRoot, filename).split(path.sep).join('/');
    const allowlist = options.allowlist ?? {};
    const reported = touchRuntimeImports(srcRoot, options.optInFolders ?? [])
      .filter(found => found.from === from)
      .filter(found => !(`${found.from} -> ${found.to}` in allowlist));
    if (reported.length === 0) {
      return {};
    }
    const bySpecifier = new Map(
      reported.map(found => [found.specifier, found]),
    );
    function check(node) {
      if (node.importKind === 'type' || node.exportKind === 'type') {
        return;
      }
      const found = bySpecifier.get(node.source?.value);
      if (found != null) {
        context.report({
          node: node.source,
          messageId: 'runtime',
          data: {specifier: found.specifier, to: found.to},
        });
      }
    }
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};

export default rule;
