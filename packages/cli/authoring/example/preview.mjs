// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether a doc example runs on its own, and the module that runs it.
 * @input One doc example (`{code, kind?}`) and its ExampleScope: the names it
 *   may use without importing them, and the packages it may import.
 * @output A PreviewableExample: the module a preview bundles, or why the
 *   example cannot preview.
 * @position packages/cli/authoring/example — the one definition Doctor's
 *   example checks and a preview builder share, so they cannot disagree.
 *
 * A `demo` example runs on its own (`ExampleKind`). Here that means: the code
 * compiles as a TSX module; it renders something (a default export, the last
 * component it declares, or the JSX it ends with); it imports only what an app
 * that installs the package can load in a browser; and every name it uses is
 * defined in it, imported, given by its scope, or a JavaScript or browser
 * global (the `globals` package's `builtin` and `browser` sets).
 */

import {builtinModules, createRequire} from 'node:module';

const require = createRequire(import.meta.url);
// Resolved, not loaded: a missing package fails here, at import. Most runs
// never read an example, so the packages load on first use.
for (const pkg of [
  '@babel/parser',
  '@babel/core',
  '@babel/plugin-transform-typescript',
  'globals',
]) {
  require.resolve(pkg);
}

/** @type {typeof import('@babel/parser') | undefined} */
let parserModule;
/** @type {typeof import('@babel/core') | undefined} */
let coreModule;
/** @type {import('@babel/core').PluginItem | undefined} */
let typeScriptPlugin;
/** @type {Set<string> | undefined} */
let standardGlobals;

const parser = () => (parserModule ??= require('@babel/parser'));
const babel = () => (coreModule ??= require('@babel/core'));
const stripTypes = () =>
  (typeScriptPlugin ??= require('@babel/plugin-transform-typescript').default);

/** The JavaScript and browser globals an example may use. */
const globalNames = () => {
  if (standardGlobals) return standardGlobals;
  /** @type {{builtin: Record<string, unknown>, browser: Record<string, unknown>}} */
  const sets = require('globals');
  standardGlobals = new Set([
    ...Object.keys(sets.builtin),
    ...Object.keys(sets.browser),
  ]);
  return standardGlobals;
};

/**
 * @typedef {import('./type.ts').ExampleScope} ExampleScope
 * @typedef {import('./type.ts').ExampleProblem} ExampleProblem
 * @typedef {import('./type.ts').PreviewableExample} PreviewableExample
 */

/** @type {import('@babel/parser').ParserOptions} */
const PARSE_OPTIONS = {sourceType: 'module', plugins: ['jsx', 'typescript']};

/** Imports a browser cannot load, besides an uninstalled Node built-in. */
const SERVER_ONLY_IMPORT =
  /^(?:server-only|next\/headers|next\/server|next\/cache|node:.+)$/u;

/** Packages whose names a scope provides, so an example may import them. */
const ALWAYS_IMPORTABLE = ['react', '@astryxdesign/core'];

/** The specifier the `React` namespace binds from. */
const REACT = 'react';

/**
 * Whether an import names code a browser cannot run: a server-only module,
 * or a Node built-in the package does not install from npm under that name
 * (an installed `buffer` or `events` is that package, which bundlers ship).
 * @param {string} specifier
 * @param {ReadonlyArray<string>} dependencies the packages the package declares
 */
export function isServerOnlyImport(specifier, dependencies) {
  if (SERVER_ONLY_IMPORT.test(specifier)) return true;
  return (
    builtinModules.includes(specifier) && !dependencies.includes(specifier)
  );
}

/**
 * Whether a member expression is `process.env`, the server's environment.
 * @param {any} node a Babel MemberExpression
 */
export function isProcessEnv(node) {
  const object = node?.object;
  return (
    object?.type === 'Identifier' &&
    object.name === 'process' &&
    !node.computed &&
    node.property?.name === 'env'
  );
}

/**
 * Whether a member expression is `process.env.NODE_ENV`, which bundlers
 * replace, so it is not a read of the server's environment.
 * @param {any} node a Babel MemberExpression
 */
export function isNodeEnvRead(node) {
  return (
    isProcessEnv(node?.object) &&
    !node.computed &&
    node.property?.name === 'NODE_ENV'
  );
}

/**
 * @typedef {object} ScopeTable
 * @property {Map<string, string>} names name → specifier, own > Core > React
 * @property {Set<string>} importable packages an example may import
 * @property {ReadonlyArray<string>} dependencies
 */

/** @type {WeakMap<ExampleScope, ScopeTable>} */
const TABLES = new WeakMap();

/**
 * @param {ExampleScope} scope
 * @returns {ScopeTable}
 */
function scopeTable(scope) {
  const cached = TABLES.get(scope);
  if (cached) return cached;
  /** @type {Map<string, string>} */
  const names = new Map();
  for (const list of [scope.packageNames ?? [], scope.coreNames ?? []]) {
    for (const entry of list) {
      if (!names.has(entry.name)) names.set(entry.name, entry.import);
    }
  }
  const reactNames = scope.reactNames ?? [];
  for (const name of reactNames) {
    if (name !== 'default' && !names.has(name)) names.set(name, REACT);
  }
  if (reactNames.length > 0 && !names.has('React')) names.set('React', REACT);
  const dependencies = scope.dependencies ?? [];
  const table = {
    names,
    importable: new Set([
      scope.packageName,
      ...dependencies,
      ...ALWAYS_IMPORTABLE,
    ]),
    dependencies,
  };
  TABLES.set(scope, table);
  return table;
}

/**
 * The package a bare specifier names: `@scope/name` or `name`.
 * @param {string} specifier
 */
function packageOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** @param {string} specifier */
function isBare(specifier) {
  return !/^(?:\.{0,2}\/|[a-z][a-z0-9+.-]*:)/iu.test(specifier);
}

/**
 * @param {string} code
 * @returns {{ast: any} | {error: any}}
 */
function tryParse(code) {
  try {
    return {ast: parser().parse(code, PARSE_OPTIONS)};
  } catch (error) {
    return {error};
  }
}

/** @param {any} node */
function isJsxStatement(node) {
  return (
    node?.type === 'ExpressionStatement' &&
    (node.expression.type === 'JSXElement' ||
      node.expression.type === 'JSXFragment')
  );
}

/** @param {any} node */
function isDefaultExport(node) {
  return (
    node.type === 'ExportDefaultDeclaration' ||
    (node.type === 'ExportNamedDeclaration' &&
      (node.specifiers ?? []).some(
        (/** @type {any} */ s) =>
          (s.exported?.name ?? s.exported?.value) === 'default',
      ))
  );
}

/** A component name: a capital first letter and a lowercase letter. */
const COMPONENT_NAME = /^[A-Z](?=.*[a-z])/u;

/**
 * The component a statement declares, if it declares one.
 * @param {any} node
 * @returns {string | null}
 */
function declaredComponent(node) {
  const declaration =
    node.type === 'ExportNamedDeclaration' ? node.declaration : node;
  if (!declaration) return null;
  if (
    (declaration.type === 'FunctionDeclaration' ||
      declaration.type === 'ClassDeclaration') &&
    declaration.id &&
    COMPONENT_NAME.test(declaration.id.name)
  ) {
    return declaration.id.name;
  }
  if (declaration.type === 'VariableDeclaration') {
    const [first] = declaration.declarations;
    if (
      declaration.declarations.length === 1 &&
      first.id.type === 'Identifier' &&
      first.init &&
      COMPONENT_NAME.test(first.id.name)
    ) {
      return first.id.name;
    }
  }
  return null;
}

/**
 * The module an example's code stands for, before its scope names are
 * imported: the code itself when it default-exports what it renders; the
 * code plus a default export of the last component it declares; or, for
 * code that ends with JSX, a component whose body is the code before that
 * JSX and which returns it (several sibling elements become one fragment).
 * @param {string} code
 * @returns {{module: string, renders: boolean} | {error: any}}
 */
function moduleFor(code) {
  const parsed = tryParse(code);
  if ('ast' in parsed) {
    const body = /** @type {any[]} */ (parsed.ast.program.body);
    if (body.some(isDefaultExport)) return {module: code, renders: true};
    let markupFrom = body.length;
    while (markupFrom > 0 && isJsxStatement(body[markupFrom - 1])) {
      markupFrom -= 1;
    }
    if (markupFrom < body.length) {
      const text = (/** @type {any} */ node) =>
        code.slice(node.start, node.end);
      const head = body.slice(0, markupFrom);
      const markup = body
        .slice(markupFrom)
        .map(node => code.slice(node.expression.start, node.expression.end));
      return composed(
        head.filter(node => node.type === 'ImportDeclaration').map(text),
        head.filter(node => node.type !== 'ImportDeclaration').map(text),
        markup.length === 1 ? markup[0] : fragment(markup.join('\n')),
      );
    }
    const component = body.map(declaredComponent).filter(Boolean).at(-1);
    if (component) {
      return {
        module: `${code}\n\nexport default ${component};\n`,
        renders: true,
      };
    }
    return {module: code, renders: false};
  }
  // Sibling elements at the end do not parse as statements. They start on a
  // line of their own, at the first column, and run to the end of the code.
  const lines = code.split('\n');
  let offset = 0;
  for (const line of lines) {
    const rest = code.slice(offset).trimEnd().replace(/;$/u, '');
    if (line.startsWith('<') && rest.endsWith('>')) {
      const head = tryParse(code.slice(0, offset));
      if ('ast' in head) {
        const prefix = code.slice(0, offset);
        const nodes = /** @type {any[]} */ (head.ast.program.body);
        const text = (/** @type {any} */ node) =>
          prefix.slice(node.start, node.end);
        const result = composed(
          nodes.filter(node => node.type === 'ImportDeclaration').map(text),
          nodes.filter(node => node.type !== 'ImportDeclaration').map(text),
          fragment(code.slice(offset, offset + rest.length)),
        );
        if ('module' in result && 'ast' in tryParse(result.module)) {
          return result;
        }
      }
      break;
    }
    offset += line.length + 1;
  }
  return {error: parsed.error};
}

/** @param {string} markup sibling elements */
const fragment = markup => `<>\n${markup}\n</>`;

/**
 * @param {string[]} imports
 * @param {string[]} statements
 * @param {string} element the JSX the component returns
 * @returns {{module: string, renders: boolean}}
 */
function composed(imports, statements, element) {
  return {
    module: `${imports.join('\n')}${imports.length > 0 ? '\n\n' : ''}export default function Example() {\n${statements.join('\n')}${statements.length > 0 ? '\n' : ''}return (\n${element}\n);\n}\n`,
    renders: true,
  };
}

/**
 * @param {any} error a Babel parse error
 * @param {string} code
 * @returns {ExampleProblem}
 */
function compileProblem(error, code) {
  const message = String(error?.message ?? error)
    .replace(/\s*\(\d+:\d+\)$/u, '')
    .replace(/\.$/u, '');
  const line = error?.loc?.line;
  const column = error?.loc?.column;
  const where = typeof line === 'number' ? ` (line ${line})` : '';
  const atEnd =
    typeof error?.pos === 'number' && error.pos >= code.trimEnd().length - 1;
  const fix =
    error?.reasonCode === 'IllegalReturn'
      ? "End the example with the JSX it renders instead of a `return`, or put the code in a component. If it is part of a function in an app, set `kind: 'setup'`."
      : atEnd
        ? "Show the whole statement, or set `kind: 'setup'` if the code is an excerpt of a larger file."
        : "Make it a complete TSX module, or set `kind: 'setup'` if it is not meant to run on its own.";
  return {
    code: 'example_does_not_compile',
    message: atEnd
      ? `does not compile: the code stops before its last statement ends${where}`
      : `does not compile: ${message}${where}`,
    fix,
    ...(typeof line === 'number' ? {line} : {}),
    ...(typeof column === 'number' ? {column} : {}),
  };
}

/**
 * The value imports of a module: static imports that are not type-only,
 * re-exports, and literal `import()` and `require()` calls.
 * @param {any} ast
 * @returns {string[]}
 */
function valueImports(ast) {
  /** @type {string[]} */
  const found = [];
  babel().traverse(ast, {
    ImportDeclaration(/** @type {any} */ path) {
      const node = /** @type {any} */ (path.node);
      const specifiers = node.specifiers ?? [];
      const typeOnly =
        node.importKind === 'type' ||
        (specifiers.length > 0 &&
          specifiers.every((/** @type {any} */ s) => s.importKind === 'type'));
      if (!typeOnly) found.push(String(node.source.value));
    },
    ExportNamedDeclaration(/** @type {any} */ path) {
      const node = /** @type {any} */ (path.node);
      if (node.source && node.exportKind !== 'type') {
        found.push(String(node.source.value));
      }
    },
    ExportAllDeclaration(/** @type {any} */ path) {
      const node = /** @type {any} */ (path.node);
      if (node.exportKind !== 'type') found.push(String(node.source.value));
    },
    CallExpression(/** @type {any} */ path) {
      const node = /** @type {any} */ (path.node);
      const isRequire =
        node.callee.type === 'Identifier' && node.callee.name === 'require';
      const isImport = node.callee.type === 'Import';
      const [first] = node.arguments;
      if ((isRequire || isImport) && first?.type === 'StringLiteral') {
        found.push(first.value);
      }
    },
    ImportExpression(/** @type {any} */ path) {
      const node = /** @type {any} */ (path.node);
      if (node.source?.type === 'StringLiteral') found.push(node.source.value);
    },
  });
  return found;
}

/**
 * The names a module uses but never binds, in order of first use, once its
 * types are stripped (a type is not a runtime name); the imported names it
 * uses, with the module each comes from; and whether it reads `process.env`
 * past `NODE_ENV`.
 * @param {string} module
 * @returns {{free: string[], imported: Array<{source: string, name: string}>, readsEnvironment: boolean} | {error: any}}
 */
function unboundNames(module) {
  /** @type {any} */
  let ast;
  try {
    ast = babel().transformSync(module, {
      babelrc: false,
      configFile: false,
      browserslistConfigFile: false,
      filename: 'example.tsx',
      sourceType: 'module',
      parserOpts: {plugins: ['jsx', 'typescript']},
      plugins: [
        [
          stripTypes(),
          {isTSX: true, allExtensions: true, onlyRemoveTypeImports: true},
        ],
      ],
      ast: true,
      code: false,
    })?.ast;
  } catch (error) {
    return {error};
  }
  /** @type {string[]} */
  const free = [];
  /** @type {Array<{source: string, name: string}>} */
  const imported = [];
  let readsEnvironment = false;
  babel().traverse(ast, {
    MemberExpression(/** @type {any} */ path) {
      const node = /** @type {any} */ (path.node);
      if (!isProcessEnv(node)) return;
      const parent = /** @type {any} */ (path.parent);
      if (!(parent?.object === node && isNodeEnvRead(parent))) {
        readsEnvironment = true;
      }
    },
    ReferencedIdentifier(/** @type {any} */ path) {
      const node = /** @type {any} */ (path.node);
      const name = String(node.name);
      // An intrinsic tag (`<div>`) is a string, not a reference.
      if (
        path.isJSXIdentifier() &&
        !path.parentPath?.isJSXMemberExpression() &&
        !/^[A-Z_$]/u.test(name)
      ) {
        return;
      }
      if (path.parentPath?.isUnaryExpression({operator: 'typeof'})) return;
      if (name === 'arguments' && path.scope.getFunctionParent()) return;
      // `process.env` is its own finding; `process.env.NODE_ENV` is replaced.
      const parent = /** @type {any} */ (path.parent);
      if (name === 'process' && isProcessEnv(parent)) return;
      const binding = path.scope.getBinding(name);
      if (binding?.kind === 'module') {
        const specifier = /** @type {any} */ (binding.path.node);
        const source = String(
          /** @type {any} */ (binding.path.parent)?.source?.value,
        );
        const importedName =
          specifier.type === 'ImportSpecifier'
            ? (specifier.imported.name ?? specifier.imported.value)
            : specifier.type === 'ImportDefaultSpecifier'
              ? 'default'
              : '*';
        if (
          !imported.some(
            use => use.source === source && use.name === importedName,
          )
        ) {
          imported.push({source, name: importedName});
        }
        return;
      }
      if (binding || path.scope.hasBinding(name, true)) return;
      if (!free.includes(name)) free.push(name);
    },
  });
  return {free, imported, readsEnvironment};
}

/**
 * @param {ExampleProblem[]} problems
 * @returns {PreviewableExample}
 */
function notPreviewable(problems) {
  return {previewable: false, setup: false, problems};
}

/**
 * Read a doc example as the module a live preview runs.
 *
 * A `kind: 'setup'` example is code only, by its author's choice. Any other
 * example must run on its own: it compiles as a TSX module, renders
 * something, imports only what a browser can load from the package and the
 * packages it declares (React and Core always), and uses only names it
 * defines, imports, or takes from its scope or the JavaScript and browser
 * globals. A previewable example's `module` imports each scope name it uses
 * (the package's own components and functions, then Core's, then React's)
 * and default-exports what it renders, so a bundler can build it as is.
 *
 * @param {{code: string, kind?: unknown}} example
 * @param {ExampleScope} scope
 * @returns {PreviewableExample}
 */
export function previewableExample(example, scope) {
  if (example?.kind === 'setup') return {previewable: false, setup: true};
  const code = typeof example?.code === 'string' ? example.code : '';
  const read = moduleFor(code);
  if ('error' in read)
    return notPreviewable([compileProblem(read.error, code)]);
  const parsed = tryParse(read.module);
  if ('error' in parsed) {
    return notPreviewable([compileProblem(parsed.error, read.module)]);
  }
  const unbound = unboundNames(read.module);
  if ('error' in unbound) {
    return notPreviewable([compileProblem(unbound.error, read.module)]);
  }
  const table = scopeTable(scope);
  /** @type {ExampleProblem[]} */
  const problems = [];
  if (!read.renders) {
    problems.push({
      code: 'example_renders_nothing',
      message:
        'renders nothing: it has no default export, declares no component, and does not end with JSX',
      fix: "End it with the JSX it renders, or set `kind: 'setup'` if it is code for an app to copy.",
    });
  }
  for (const specifier of new Set(valueImports(parsed.ast))) {
    if (
      isServerOnlyImport(specifier, table.dependencies) ||
      scope.isServerOnly?.(specifier) === true
    ) {
      problems.push({
        code: 'example_server_only',
        message: `imports '${specifier}', which runs only on a server, so a live preview in a browser cannot load it`,
        fix: "Set `kind: 'setup'` to show it as code only, or move the server code into the app and pass its values in as props.",
        specifier,
      });
    } else if (!isBare(specifier)) {
      problems.push({
        code: 'example_import_unresolvable',
        message: `imports '${specifier}', a file next to the code in an app, which a live preview does not have`,
        fix: "Drop the import, or set `kind: 'setup'` if the code is a file in an app.",
        specifier,
      });
    } else if (!table.importable.has(packageOf(specifier))) {
      problems.push({
        code: 'example_import_unresolvable',
        message: `imports '${specifier}', but ${scope.packageName} does not declare '${packageOf(specifier)}' in dependencies, peerDependencies or optionalDependencies, so an app that installs it may not have it`,
        fix: "Declare the package, import from one the package declares, or set `kind: 'setup'`.",
        specifier,
      });
    }
  }
  if (unbound.readsEnvironment) {
    problems.push({
      code: 'example_server_only',
      message:
        'reads process.env, which only a server has, so a live preview in a browser cannot run it',
      fix: "Pass the value in as a prop or a constant, or set `kind: 'setup'` to show it as code only.",
    });
  }
  const serverComponents = new Set(scope.serverComponents ?? []);
  const rendered = [
    ...unbound.free.filter(
      name =>
        serverComponents.has(name) &&
        packageOf(table.names.get(name) ?? '') === scope.packageName,
    ),
    ...unbound.imported
      .filter(
        use =>
          isBare(use.source) &&
          packageOf(use.source) === scope.packageName &&
          serverComponents.has(use.name),
      )
      .map(use => use.name),
  ];
  for (const name of new Set(rendered)) {
    problems.push({
      code: 'example_server_only',
      message: `renders \`${name}\`, an async component that only a server can render, so a live preview in a browser cannot show it`,
      fix: "Set `kind: 'setup'` to show it as code only, or show a component that renders in a browser instead.",
      names: [name],
    });
  }
  const globals = globalNames();
  const undefinedNames = unbound.free.filter(
    name => !table.names.has(name) && !globals.has(name),
  );
  if (undefinedNames.length > 0) {
    const shown = undefinedNames.map(name => `\`${name}\``).join(', ');
    problems.push({
      code: 'example_undefined_name',
      message: `uses ${shown} but never defines or imports ${undefinedNames.length === 1 ? 'it' : 'them'}, so a live preview throws a ReferenceError when that code runs`,
      fix: "Define each one in the example (a sample value is enough) or import it; only the components and functions the package and Core document, React's exports and browser globals need no import. If the code needs values from an app, set `kind: 'setup'` to show it as code only.",
      names: undefinedNames,
    });
  }
  if (problems.length > 0) return notPreviewable(problems);
  return {
    previewable: true,
    module: withScopeImports(
      read.module,
      unbound.free.filter(name => table.names.has(name)),
      table,
    ),
  };
}

/**
 * The module with one import line per specifier for the scope names it
 * uses, `React` as the namespace.
 * @param {string} module
 * @param {string[]} used
 * @param {ScopeTable} table
 */
function withScopeImports(module, used, table) {
  /** @type {Map<string, string[]>} */
  const bySpecifier = new Map();
  const lines = [];
  for (const name of used) {
    const specifier = /** @type {string} */ (table.names.get(name));
    if (name === 'React' && specifier === REACT) {
      lines.push(`import * as React from '${REACT}';`);
      continue;
    }
    const names = bySpecifier.get(specifier) ?? [];
    names.push(name);
    bySpecifier.set(specifier, names);
  }
  for (const [specifier, names] of [...bySpecifier].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    lines.push(`import {${names.sort().join(', ')}} from '${specifier}';`);
  }
  return lines.length > 0 ? `${lines.join('\n')}\n${module}` : module;
}
