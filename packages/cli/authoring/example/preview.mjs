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

/** The package.json fields whose packages an app installs with a package. */
const INSTALLED_WITH = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
];

/**
 * The packages an app gets when it installs a package: those its package.json
 * declares in `dependencies`, `peerDependencies` and `optionalDependencies`.
 * `devDependencies` are installed only where the package is developed.
 * @param {unknown} manifest a parsed package.json
 * @returns {string[]}
 */
export function packagesInstalledWith(manifest) {
  const fields = /** @type {Record<string, unknown>} */ (
    manifest !== null && typeof manifest === 'object' ? manifest : {}
  );
  return INSTALLED_WITH.flatMap(field => {
    const value = fields[field];
    return value !== null && typeof value === 'object'
      ? Object.keys(value)
      : [];
  });
}

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
 * @property {Set<string>} serverOnly the package's own server-only specifiers
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
    serverOnly: new Set(scope.serverOnlyModules ?? []),
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

/** The React calls that return a component made from the one they take. */
const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef', 'lazy']);

/**
 * Whether a call is `memo(…)`, `forwardRef(…)` or `lazy(…)`, bare or on
 * `React`.
 * @param {any} callee
 */
const isComponentWrapper = callee =>
  (callee?.type === 'Identifier' && COMPONENT_WRAPPERS.has(callee.name)) ||
  (callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object?.type === 'Identifier' &&
    callee.object.name === 'React' &&
    callee.property?.type === 'Identifier' &&
    COMPONENT_WRAPPERS.has(callee.property.name));

/**
 * The function a component is declared with: a function or class, or
 * `memo`, `forwardRef` or `lazy` called on one, seen through parentheses and
 * type assertions.
 * @param {any} node an initializer
 * @returns {boolean}
 */
function isComponentValue(node) {
  let value = node;
  while (
    value?.type === 'TSAsExpression' ||
    value?.type === 'TSSatisfiesExpression' ||
    value?.type === 'TSNonNullExpression' ||
    value?.type === 'ParenthesizedExpression'
  ) {
    value = value.expression;
  }
  if (
    value?.type === 'ArrowFunctionExpression' ||
    value?.type === 'FunctionExpression' ||
    value?.type === 'ClassExpression'
  ) {
    return true;
  }
  return (
    value?.type === 'CallExpression' &&
    isComponentWrapper(value.callee) &&
    isComponentValue(value.arguments[0])
  );
}

/**
 * The component a statement declares, if it declares one: a function or
 * class with a component name, or a variable with a component name that holds
 * one.
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
      COMPONENT_NAME.test(first.id.name) &&
      isComponentValue(first.init)
    ) {
      return first.id.name;
    }
  }
  return null;
}

/**
 * Whether a statement is a block that holds only comments, as a `{/* … *\/}`
 * line between JSX elements parses at the top level.
 * @param {any} node
 */
const isCommentBlock = node =>
  node?.type === 'BlockStatement' &&
  node.body.length === 0 &&
  (node.directives ?? []).length === 0;

/**
 * Whether a statement is a block that holds one expression, as a `{…}` line
 * such as `{items.map(…)}` between JSX elements parses at the top level.
 * @param {any} node
 */
const isExpressionBlock = node =>
  node?.type === 'BlockStatement' &&
  node.body.length === 1 &&
  node.body[0].type === 'ExpressionStatement' &&
  (node.directives ?? []).length === 0;

/**
 * Whether a statement can be part of the JSX an example ends with: an
 * element, or a `{…}` line between or after elements.
 * @param {any} node
 */
const isMarkupStatement = node =>
  isJsxStatement(node) || isCommentBlock(node) || isExpressionBlock(node);

/**
 * Where the JSX a list of statements ends with begins: the first of the
 * trailing JSX statements and the `{…}` lines between or after them. The
 * list's length when it does not end with JSX.
 * @param {any[]} body
 */
function trailingMarkupStart(body) {
  let start = body.length;
  while (start > 0 && isMarkupStatement(body[start - 1])) start -= 1;
  while (start < body.length && !isJsxStatement(body[start])) start += 1;
  return start;
}

/**
 * A trailing JSX statement as a fragment child: the element, or a `{…}` line
 * as it is written (`{/* … *\/}` and `{items.map(…)}` are JSX children too).
 * @param {string} code
 * @param {any} node
 * @param {number} [offset] where `code` starts in the example's code
 * @returns {Piece}
 */
function markupPiece(code, node, offset = 0) {
  const part = isJsxStatement(node) ? node.expression : node;
  return {text: code.slice(part.start, part.end), from: offset + part.start};
}

/**
 * @typedef {object} ExampleModule
 * @property {string} module
 * @property {boolean} renders
 * @property {boolean} [wrapped] whether the module runs the code inside a
 *   component it adds, so an error can come from that component
 * @property {(position: number) => number | null} toExample the position in
 *   the example's code that a position in `module` comes from, or null for
 *   text the module adds around it
 */

/** @param {number} position */
const samePosition = position => position;

/**
 * The module an example's code stands for, before its scope names are
 * imported: the code itself when it default-exports what it renders; the
 * code plus a default export of the last component it declares; or, for
 * code that ends with JSX, a component whose body is the code before that
 * JSX and which returns it (several sibling elements become one fragment).
 * Directives, imports and re-exports stay at module scope; a declaration the
 * code exports moves into the component without its `export`.
 * @param {string} code
 * @returns {ExampleModule | {error: any}}
 */
function moduleFor(code) {
  const parsed = tryParse(code);
  if ('ast' in parsed) {
    const program = parsed.ast.program;
    const body = /** @type {any[]} */ (program.body);
    if (body.some(isDefaultExport)) {
      return {module: code, renders: true, toExample: samePosition};
    }
    const markupFrom = trailingMarkupStart(body);
    if (markupFrom < body.length) {
      const markup = body
        .slice(markupFrom)
        .map(node => markupPiece(code, node));
      return composed(
        code,
        program.directives,
        body.slice(0, markupFrom),
        markup.length === 1 ? markup : fragment(markup),
      );
    }
    const component = body.map(declaredComponent).filter(Boolean).at(-1);
    if (component) {
      return {
        module: `${code}\n\nexport default ${component};\n`,
        renders: true,
        toExample: samePosition,
      };
    }
    return {module: code, renders: false, toExample: samePosition};
  }
  const siblings = trailingSiblings(code);
  if (siblings) {
    return composed(
      code,
      siblings.directives,
      siblings.statements,
      fragment(siblings.elements),
    );
  }
  return {error: parsed.error};
}

/**
 * Code that ends with sibling elements, split where the parser says one
 * element ends and the next begins: the statements before them, and each
 * element, in order, with a `{…}` line between or after them kept as a JSX
 * child. Null when the code fails to parse for any other reason, or when
 * something else follows the first sibling.
 * @param {string} code
 * @returns {{directives: any[], statements: any[], elements: Piece[]} | null}
 */
function trailingSiblings(code) {
  /** @type {any[]} */
  let directives = [];
  /** @type {any[]} */
  let statements = [];
  /** @type {Piece[]} */
  const elements = [];
  let offset = 0;
  for (;;) {
    const rest = code.slice(offset);
    const whole = tryParse(rest);
    if ('ast' in whole) {
      if (offset === 0) return null;
      const body = /** @type {any[]} */ (whole.ast.program.body);
      if (!body.every(isMarkupStatement)) return null;
      for (const node of body) elements.push(markupPiece(rest, node, offset));
      return {directives, statements, elements};
    }
    const error = whole.error;
    if (
      error?.reasonCode !== 'UnwrappedAdjacentJSXElements' ||
      typeof error.pos !== 'number' ||
      error.pos === 0
    ) {
      return null;
    }
    const segment = tryParse(rest.slice(0, error.pos));
    if (!('ast' in segment)) return null;
    const body = /** @type {any[]} */ (segment.ast.program.body);
    if (!isJsxStatement(body.at(-1))) return null;
    const markupFrom = offset === 0 ? trailingMarkupStart(body) : 0;
    if (offset === 0) {
      directives = segment.ast.program.directives;
      statements = body.slice(0, markupFrom);
    } else if (!body.every(isMarkupStatement)) {
      return null;
    }
    for (const node of body.slice(markupFrom)) {
      elements.push(markupPiece(rest, node, offset));
    }
    offset += error.pos;
  }
}

/**
 * @typedef {string | {text: string, from: number}} Piece text the module
 *   adds, or text of the example and where it starts in the example's code
 */

/**
 * @param {string} code
 * @param {any} node
 * @returns {Piece}
 */
const piece = (code, node) => ({
  text: code.slice(node.start, node.end),
  from: node.start,
});

/**
 * Sibling elements as one fragment.
 * @param {Piece[]} elements
 * @returns {Piece[]}
 */
const fragment = elements => ['<>\n', ...joined(elements, '\n'), '\n</>'];

/**
 * @param {Piece[]} pieces
 * @param {string} separator
 * @returns {Piece[]}
 */
const joined = (pieces, separator) =>
  pieces.flatMap((each, index) => (index === 0 ? [each] : [separator, each]));

/** Statements that stay at module scope: imports and re-exports. */
const MODULE_SCOPE = new Set([
  'ImportDeclaration',
  'TSImportEqualsDeclaration',
  'ExportAllDeclaration',
]);

/**
 * The component an example's statements and trailing JSX stand for. Its
 * directives, imports and re-exports stay at module scope; every other
 * statement runs in the component, in order, a declaration it exports
 * without its `export` (an `export {…}` list of its own names is dropped).
 * @param {string} code
 * @param {any[]} directives
 * @param {any[]} statements
 * @param {Piece[]} element the JSX the component returns
 * @returns {ExampleModule}
 */
function composed(code, directives, statements, element) {
  // The component takes a name the example's code does not use, so no
  // import or declaration of the example can clash with it.
  const used = new Set(code.match(/\bExample\d*\b/gu) ?? []);
  let name = 'Example';
  for (let count = 2; used.has(name); count += 1) name = `Example${count}`;
  /** @type {Piece[]} */
  const prelude = directives.map(node => piece(code, node));
  /** @type {Piece[]} */
  const inside = [];
  for (const node of statements) {
    if (
      MODULE_SCOPE.has(node.type) ||
      (node.type === 'ExportNamedDeclaration' && node.source)
    ) {
      prelude.push(piece(code, node));
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) inside.push(piece(code, node.declaration));
    } else {
      inside.push(piece(code, node));
    }
  }
  return {
    ...assembled([
      ...joined(prelude, '\n'),
      prelude.length > 0 ? '\n\n' : '',
      `export default function ${name}() {\n`,
      ...joined(inside, '\n'),
      inside.length > 0 ? '\n' : '',
      'return (\n',
      ...element,
      '\n);\n}\n',
    ]),
    renders: true,
    wrapped: true,
  };
}

/**
 * Join pieces into a module, keeping the way back from a position in it to
 * the position in the example's code it comes from.
 * @param {Piece[]} pieces
 * @returns {{module: string, toExample: (position: number) => number | null}}
 */
function assembled(pieces) {
  let module = '';
  /** @type {Array<{at: number, from: number, length: number}>} */
  const spans = [];
  for (const each of pieces) {
    if (typeof each === 'string') {
      module += each;
      continue;
    }
    spans.push({at: module.length, from: each.from, length: each.text.length});
    module += each.text;
  }
  return {
    module,
    toExample: position => {
      const span = spans.find(
        each => position >= each.at && position <= each.at + each.length,
      );
      return span ? span.from + position - span.at : null;
    },
  };
}

/**
 * The 1-based line and 0-based column of a position in some text.
 * @param {string} text
 * @param {number} position
 */
function lineAndColumn(text, position) {
  const before = text.slice(0, position);
  const lineStart = before.lastIndexOf('\n') + 1;
  return {
    line: before.split('\n').length,
    column: position - lineStart,
  };
}

/**
 * The problem a parse error is, placed in the example's own code. An error
 * in the module but not in the code means a statement before the trailing
 * JSX cannot run inside the component that renders it, such as a top-level
 * `await`.
 * @param {any} error a Babel parse error
 * @param {string} code the example's code
 * @param {ExampleModule} [read] the module the error is in, when it is not
 *   the code itself
 * @returns {ExampleProblem}
 */
function compileProblem(error, code, read) {
  // A transform error starts with the file it read and ends with a code
  // frame of the module; the note keeps only what went wrong.
  const message = String(error?.message ?? error)
    .split('\n')[0]
    .replace(/^.*?example\.tsx: /u, '')
    .replace(/\s*\(\d+:\d+\)$/u, '')
    .replace(/\.$/u, '');
  const position =
    typeof error?.pos !== 'number'
      ? null
      : read
        ? read.toExample(error.pos)
        : error.pos;
  const place = position == null ? null : lineAndColumn(code, position);
  const where = place ? ` (line ${place.line})` : '';
  const located = place ? {line: place.line, column: place.column} : {};
  if (read) {
    return {
      code: 'example_does_not_compile',
      message: `does not compile once its code runs inside the component that renders its JSX: ${message}${where}`,
      fix: "Declare the component yourself and default-export it, with that code where it can run, or set `kind: 'setup'` if it is not meant to run on its own.",
      ...located,
    };
  }
  const atEnd = position != null && position >= code.trimEnd().length - 1;
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
    ...located,
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
 * types are stripped (a type is not a runtime name), and which of them name
 * an element; the imported names it uses, with the module each comes from;
 * and whether it reads `process.env` past `NODE_ENV`.
 * @param {string} module
 * @returns {{free: string[], elements: Set<string>, imported: Array<{source: string, name: string}>, readsEnvironment: boolean} | {error: any}}
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
  /** @type {Set<string>} */
  const elements = new Set();
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
      if (path.isJSXIdentifier()) elements.add(name);
    },
  });
  return {free, elements, imported, readsEnvironment};
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
 * (the package's own components, then Core's components and hooks, then
 * React's exports)
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
  if ('error' in read) {
    return notPreviewable([compileProblem(read.error, code)]);
  }
  const wrapper = read.wrapped ? read : undefined;
  const parsed = tryParse(read.module);
  if ('error' in parsed) {
    return notPreviewable([compileProblem(parsed.error, code, wrapper)]);
  }
  const unbound = unboundNames(read.module);
  if ('error' in unbound) {
    return notPreviewable([compileProblem(unbound.error, code, wrapper)]);
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
      table.serverOnly.has(specifier)
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
  // A browser global such as `Image` or `Map` is not a component, so an
  // element takes its name only from the example or its scope.
  const globals = globalNames();
  const undefinedNames = unbound.free.filter(
    name =>
      !table.names.has(name) &&
      (unbound.elements.has(name) || !globals.has(name)),
  );
  if (undefinedNames.length > 0) {
    const shown = undefinedNames.map(name => `\`${name}\``).join(', ');
    const notComponents = undefinedNames.filter(name => globals.has(name));
    problems.push({
      code: 'example_undefined_name',
      message:
        notComponents.length === 0
          ? `uses ${shown} but never defines or imports ${undefinedNames.length === 1 ? 'it' : 'them'}, so a live preview throws a ReferenceError when that code runs`
          : `uses ${shown} but never defines or imports ${undefinedNames.length === 1 ? 'it' : 'them'}, so a live preview throws when that code runs (the browser's ${notComponents.map(name => `\`${name}\``).join(', ')} ${notComponents.length === 1 ? 'is' : 'are'} not a component)`,
      fix: "Define each one in the example (a sample value is enough) or import it; only the package's documented components, Core's documented components and hooks, React's exports and browser globals need no import. If the code needs values from an app, set `kind: 'setup'` to show it as code only.",
      names: undefinedNames,
    });
  }
  if (problems.length > 0) return notPreviewable(problems);
  const directives = /** @type {any[]} */ (parsed.ast.program.directives);
  return {
    previewable: true,
    module: withScopeImports(
      read.module,
      unbound.free.filter(name => table.names.has(name)),
      table,
      directives.length > 0 ? directives[directives.length - 1].end : 0,
    ),
  };
}

/**
 * The module with one import line per specifier for the scope names it
 * uses, `React` as the namespace, after its directive prologue so a
 * directive such as `'use client'` stays one.
 * @param {string} module
 * @param {string[]} used
 * @param {ScopeTable} table
 * @param {number} prologueEnd where the module's directives end
 */
function withScopeImports(module, used, table, prologueEnd) {
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
  if (lines.length === 0) return module;
  if (prologueEnd === 0) return `${lines.join('\n')}\n${module}`;
  return `${module.slice(0, prologueEnd)}\n${lines.join('\n')}${module.slice(prologueEnd)}`;
}
