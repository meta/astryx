// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Find the references in a package's TypeScript project that the
 * compiler cannot resolve, so a check that reads the package's types knows
 * when part of them is a guess: a dependency that is not installed can make
 * any type built from it the compiler's error type, whatever the code looks
 * like.
 *
 * - From given files: their imports, re-exports, `/// <reference>`
 *   directives and side-effect imports, and the files those reach in turn;
 *   and in the package's own files, each type the compiler can only give its
 *   error type.
 * - From the program's global roots: the package's own declaration files
 *   that act globally and the type packages the program loads by name
 *   (`compilerOptions.types`).
 *
 * @input The project's own `typescript`, a program and its checker.
 * @output The first reference that does not resolve, or null.
 * @position Foundation discovery, used by the documented-props comparison.
 */

import * as path from 'node:path';

/**
 * What the walk learns about one program for one `mine`: each source file's
 * references (the first that doesn't resolve, the first type it can't give,
 * the files they reach), what each declaration's type is inferred from, and
 * the declarations whose whole reach reads clean. Each is a fact about the
 * program, so an answer never depends on what an earlier call read; the
 * record goes when the program does.
 * @type {WeakMap<any, WeakMap<Function, {files: Map<any, any>, local: Map<any, any>, clean: Set<any>, untypedNames: Map<any, Set<string>>, errors: Map<any, any[]>}>>}
 */
const PROGRAMS = new WeakMap();

/**
 * @typedef {object} UnresolvedReference
 * @property {string} name the reference as written, quoted
 * @property {string} file the file that writes it
 * @property {'imported' | 'used' | 'named'} how a file imports it, a file
 *   uses it as a type name, or the config names it
 */

/**
 * The JSDoc tags whose types the compiler reads in a JavaScript file, in the
 * TypeScript versions that have them. It never checks the others (`@throws`,
 * `@exception`, `@see`, `@example` …), so a name declared nowhere in one
 * decides no type.
 */
const TYPED_JSDOC_TAGS = [
  'JSDocTypeTag',
  'JSDocParameterTag',
  'JSDocReturnTag',
  'JSDocTypedefTag',
  'JSDocCallbackTag',
  'JSDocTemplateTag',
  'JSDocPropertyTag',
  'JSDocThisTag',
  'JSDocEnumTag',
  'JSDocAugmentsTag',
  'JSDocImplementsTag',
  'JSDocSatisfiesTag',
  'JSDocOverloadTag',
  'JSDocImportTag',
];

/**
 * The first reference that does not resolve from the given files, the files
 * they import, and so on, as far as `follow` allows. A reference fails when
 * the program finds no module, no type package or no file for it, when a
 * module does not export a name imported from it, or, in the files `mine`
 * accepts, when a type name resolves to no declaration (TS2304). A module
 * found without types (a JavaScript file) resolves: its names are `any`. A
 * side-effect import counts where the compiler checks one
 * (`noUncheckedSideEffectImports`, on by default from TypeScript 6).
 * @param {any} ts the project's own `typescript`
 * @param {any} program
 * @param {any} checker
 * @param {any[]} roots source files
 * @param {(file: string) => boolean} follow which files it reads past them
 * @param {(file: string) => boolean} mine whose type names it checks
 * @returns {UnresolvedReference | null}
 */
export function unresolvedReference(ts, program, checker, roots, follow, mine) {
  const K = ts.SyntaxKind;
  const typedTags = new Set(
    TYPED_JSDOC_TAGS.map(name => K[name]).filter(kind => kind !== undefined),
  );
  const STARTS = new Set([
    K.TypeReference,
    K.TypeQuery,
    K.IndexedAccessType,
    K.ImportType,
    K.ExpressionWithTypeArguments,
  ]);
  const options = program.getCompilerOptions();
  const sideEffects =
    options.noUncheckedSideEffectImports ??
    Number.parseInt(ts.versionMajorMinor, 10) >= 6;
  let byMine = PROGRAMS.get(program);
  if (!byMine) {
    byMine = new WeakMap();
    PROGRAMS.set(program, byMine);
  }
  let state = byMine.get(mine);
  if (!state) {
    state = {
      files: new Map(),
      local: new Map(),
      clean: new Set(),
      untypedNames: new Map(),
      errors: new Map(),
    };
    byMine.set(mine, state);
  }
  const record = state;
  /**
   * The names a file imports from modules found without types.
   * @type {(file: any) => Set<string>}
   */
  const untypedNamesOf = file => {
    let names = record.untypedNames.get(file);
    if (names) return names;
    names = new Set();
    for (const literal of file.imports ?? []) {
      if (literal.pos < 0 || checker.getSymbolAtLocation(literal)) continue;
      if (
        ts.resolveModuleName(literal.text, file.fileName, options, ts.sys)
          .resolvedModule
      ) {
        for (const name of boundNames(ts, literal.parent)) names.add(name);
      }
    }
    record.untypedNames.set(file, names);
    return names;
  };
  /**
   * Whether `tsc` reports an error inside a node. It leaves a line
   * `@ts-expect-error` covers alone, and a `@ts-nocheck` file, and without
   * `noImplicitAny` it gives some reads the error type with no diagnostic.
   * @type {(file: any, node: any) => boolean}
   */
  const errorReported = (file, node) => {
    const errors =
      record.errors.get(file) ??
      program
        .getSemanticDiagnostics(file)
        .filter(
          (/** @type {any} */ d) => d.category === ts.DiagnosticCategory.Error,
        );
    record.errors.set(file, errors);
    const start = node.getStart(file);
    return errors.some(
      (/** @type {any} */ d) =>
        d.start !== undefined && d.start >= start && d.start < node.end,
    );
  };
  /**
   * Whether a function's type comes from overload signatures.
   * @type {(fn: any) => boolean}
   */
  const overloaded = fn => {
    const symbol = fn.name && checker.getSymbolAtLocation(fn.name);
    return (symbol?.declarations ?? []).some(
      (/** @type {any} */ d) => d !== fn && ts.isFunctionLike(d) && !d.body,
    );
  };
  /**
   * The expressions a declaration's type is inferred from: an initializer
   * with no type written, what a function returns when its return type
   * isn't written, and a parameter's default. A class's names come from
   * its written members and its base; a member's type is read where a type
   * indexes it. A type written down, or overloads, decide it alone.
   * @type {(declaration: any) => any[]}
   */
  const typeSources = declaration => {
    /** @type {any[]} */
    const sources = [];
    const fromFunction = (/** @type {any} */ fn) => {
      if (overloaded(fn)) return;
      for (const parameter of fn.parameters ?? []) {
        if (!parameter.type && parameter.initializer) {
          sources.push(parameter.initializer);
        }
      }
      if (fn.type || !fn.body) return;
      if (!ts.isBlock(fn.body)) {
        sources.push(fn.body);
        return;
      }
      // A function or class nested in the body returns for itself.
      const visit = (/** @type {any} */ n) => {
        if (ts.isFunctionLike(n) || ts.isClassLike(n)) return;
        if (ts.isReturnStatement(n) && n.expression) sources.push(n.expression);
        ts.forEachChild(n, visit);
      };
      ts.forEachChild(fn.body, visit);
    };
    if (ts.isFunctionLike(declaration)) {
      fromFunction(declaration);
    } else if (ts.isClassLike(declaration)) {
      for (const clause of declaration.heritageClauses ?? []) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const base of clause.types) sources.push(base.expression);
        }
      }
    } else if (ts.isBindingElement(declaration)) {
      if (declaration.initializer) sources.push(declaration.initializer);
      let root = declaration.parent;
      while (root && !ts.isVariableDeclaration(root) && !ts.isParameter(root)) {
        root = root.parent;
      }
      if (root && !root.type && root.initializer) {
        sources.push(root.initializer);
      }
    } else if (!declaration.type && declaration.initializer) {
      sources.push(declaration.initializer);
    }
    return sources;
  };
  /**
   * What one declaration's type is inferred from, read on its own: the
   * first value read there that the compiler can only give its error type
   * and `tsc` reports, and the declarations it names, whose types count
   * too.
   * @type {(declaration: any) => {found: {node: any, file: any} | null, names: any[]}}
   */
  const localScan = declaration => {
    const known = record.local.get(declaration);
    if (known) return known;
    const file = declaration.getSourceFile();
    const untypedHere = untypedNamesOf(file);
    /** @type {any[]} */
    const names = [];
    /** @type {{node: any, file: any} | null} */
    let found = null;
    /** @type {(node: any) => void} */
    const scan = node => {
      if (found) return;
      // A JSX element is a `JSX.Element`, whatever it holds.
      if (
        ts.isJsxElement(node) ||
        ts.isJsxSelfClosingElement(node) ||
        ts.isJsxFragment(node)
      ) {
        return;
      }
      // A cast that writes the type decides it, whatever the value.
      if (
        (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
        !ts.isConstTypeReference(node.type)
      ) {
        return;
      }
      if (ts.isFunctionLike(node) || ts.isClassLike(node)) {
        for (const source of typeSources(node)) scan(source);
        return;
      }
      ts.forEachChild(node, scan);
      if (found) return;
      if (
        readsValue(ts, node) &&
        !untypedHere.has(rootName(ts, node)) &&
        isErrorValue(checker, node) &&
        errorReported(file, node)
      ) {
        found = {node, file};
        return;
      }
      // A name for another declaration: its type comes from there.
      if (!ts.isIdentifier(node)) return;
      let symbol =
        ts.isShorthandPropertyAssignment(node.parent) &&
        node.parent.name === node
          ? checker.getShorthandAssignmentValueSymbol(node.parent)
          : checker.getSymbolAtLocation(node);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
        symbol = checker.getAliasedSymbol(symbol);
      }
      for (const named of symbol?.declarations ?? []) {
        if (!names.includes(named)) names.push(named);
      }
    };
    for (const source of typeSources(declaration)) {
      scan(source);
      if (found) break;
    }
    const result = {found, names};
    record.local.set(declaration, result);
    return result;
  };
  /**
   * The first such read in what the declarations' types are inferred from,
   * in the package's own TypeScript files, following the declarations each
   * names, depth first. A declaration whose whole reach read clean before
   * is skipped, which changes no answer.
   * @type {(declarations: readonly any[]) => {node: any, file: any} | null}
   */
  const scanDeclarations = declarations => {
    const visited = new Set();
    /** @type {(list: readonly any[]) => {node: any, file: any} | null} */
    const walk = list => {
      for (const declaration of list) {
        const file = declaration.getSourceFile();
        if (
          visited.has(declaration) ||
          record.clean.has(declaration) ||
          file.isDeclarationFile ||
          !/\.[cm]?tsx?$/.test(file.fileName) ||
          !mine(file.fileName)
        ) {
          continue;
        }
        visited.add(declaration);
        const {found, names} = localScan(declaration);
        const reached = found ?? walk(names);
        if (reached) return reached;
      }
      return null;
    };
    const found = walk(declarations);
    if (!found)
      for (const declaration of visited) record.clean.add(declaration);
    return found;
  };
  /** @type {(sf: any) => {missing: UnresolvedReference | null, untyped: UnresolvedReference | null, next: any[]}} */
  const read = sf => {
    const cache = record.files;
    if (cache.has(sf)) return cache.get(sf);
    /** @type {UnresolvedReference | null} */
    let missing = null;
    /** @type {any[]} */
    const next = [];
    /** @type {(name: string, how?: UnresolvedReference['how']) => void} */
    const fail = (name, how = 'imported') => {
      missing ??= {name, file: sf.fileName, how};
    };
    // A module found without types gives its names no types: they are
    // `any`, not missing.
    /** @type {Set<string>} */
    const untypedNames = new Set();
    for (const literal of sf.imports ?? []) {
      const parent = literal.parent;
      // The JSX runtime import the compiler adds itself shapes no types.
      if (!parent || missing || literal.pos < 0) continue;
      if (
        ts.isImportDeclaration(parent) &&
        !parent.importClause &&
        !sideEffects
      ) {
        continue;
      }
      const module = checker.getSymbolAtLocation(literal);
      if (!module) {
        const found = ts.resolveModuleName(
          literal.text,
          sf.fileName,
          options,
          ts.sys,
        ).resolvedModule;
        if (!found) fail(`\`${literal.text}\``);
        else for (const name of boundNames(ts, parent)) untypedNames.add(name);
        continue;
      }
      for (const d of module.declarations ?? []) next.push(d.getSourceFile());
      // Each name an import or a re-export takes from the module. One it
      // does not export resolves to the compiler's `unknown` symbol.
      const clause = ts.isImportDeclaration(parent)
        ? parent.importClause
        : null;
      const bound = clause?.namedBindings;
      const exported = ts.isExportDeclaration(parent)
        ? parent.exportClause
        : null;
      const names = [
        ...(clause?.name ? [clause.name] : []),
        ...(bound && ts.isNamedImports(bound) ? bound.elements : []),
        ...(exported && ts.isNamedExports(exported) ? exported.elements : []),
      ].map(/** @param {any} n */ n => n.name ?? n);
      for (const name of names) {
        const alias = checker.getSymbolAtLocation(name);
        const resolved = alias && checker.getAliasedSymbol(alias);
        if (
          !resolved ||
          (resolved.escapedName === 'unknown' && !resolved.declarations?.length)
        ) {
          fail(`\`${name.text}\` from \`${literal.text}\``);
        }
      }
    }
    for (const ref of sf.typeReferenceDirectives ?? []) {
      const found = ts.resolveTypeReferenceDirective(
        ref.fileName,
        sf.fileName,
        options,
        ts.sys,
      ).resolvedTypeReferenceDirective?.resolvedFileName;
      if (!found) fail(`the types \`${ref.fileName}\``);
      else if (program.getSourceFile(found)) {
        next.push(program.getSourceFile(found));
      }
    }
    for (const ref of sf.referencedFiles ?? []) {
      const file = path.resolve(path.dirname(sf.fileName), ref.fileName);
      const found = ['', '.ts', '.tsx', '.d.ts']
        .map(ext => program.getSourceFile(file + ext))
        .find(Boolean);
      if (found) next.push(found);
      else fail(`\`${ref.fileName}\``);
    }
    // A type the compiler can only give its error type: a name or value
    // declared nowhere, a property that doesn't exist. `keyof` or a template
    // literal key over one hides the error, so it is found where it starts.
    // `as const` is a type reference named `const`. A JavaScript file's
    // JSDoc types count too, in the tags the compiler reads types from;
    // TypeScript reads no types from a `.ts` file's.
    /** @type {UnresolvedReference | null} */
    let untyped = null;
    const js = /\.[cm]?jsx?$/.test(sf.fileName);
    // A name, or an `import()` type, from a module found without types.
    /** @type {(node: any) => boolean} */
    const fromUntyped = node => {
      if (ts.isImportTypeNode(node)) {
        const literal = node.argument?.literal;
        return (
          !!literal &&
          ts.isStringLiteral(literal) &&
          !checker.getSymbolAtLocation(literal) &&
          !!ts.resolveModuleName(literal.text, sf.fileName, options, ts.sys)
            .resolvedModule
        );
      }
      let name = ts.isTypeQueryNode(node)
        ? node.exprName
        : ts.isTypeReferenceNode(node)
          ? node.typeName
          : null;
      while (name && ts.isQualifiedName(name)) name = name.left;
      return !!name && ts.isIdentifier(name) && untypedNames.has(name.text);
    };
    // A value `typeof` reads, or a class a type names, in a TypeScript file
    // of the package's own, whose type is inferred from a value the compiler
    // can't type: a property that doesn't exist, spread into an object,
    // turns it `any`, so `keyof typeof` it takes any name. Only an error
    // `tsc` reports counts.
    /** @type {(name: any, classes?: boolean) => boolean} */
    const readsErrorValue = (name, classes = false) => {
      let target = checker.getSymbolAtLocation(name);
      if (target && target.flags & ts.SymbolFlags.Alias) {
        target = checker.getAliasedSymbol(target);
      }
      const declarations = (target?.declarations ?? []).filter(
        (/** @type {any} */ d) => !classes || ts.isClassLike(d),
      );
      const found = scanDeclarations(declarations);
      if (found) {
        untyped = {
          name: `\`${oneLine(found.node.getText(found.file))}\``,
          file: found.file.fileName,
          how: 'used',
        };
      }
      return false;
    };
    // The members a type indexes, such as `Store['slots']`: a member's
    // type is inferred from its own initializer or body.
    /** @type {(node: any) => boolean} */
    const readsIndexedMembers = node => {
      const object = checker.getTypeFromTypeNode(node.objectType);
      const index = checker.getTypeFromTypeNode(node.indexType);
      const keys = (index.isUnion() ? index.types : [index]).filter(
        (/** @type {any} */ key) =>
          key.isStringLiteral() || key.isNumberLiteral(),
      );
      const members = keys.map((/** @type {any} */ key) =>
        checker.getPropertyOfType(object, String(key.value)),
      );
      const found = scanDeclarations(
        members.flatMap(
          (/** @type {any} */ member) => member?.declarations ?? [],
        ),
      );
      if (found) {
        untyped = {
          name: `\`${oneLine(found.node.getText(found.file))}\``,
          file: found.file.fileName,
          how: 'used',
        };
      }
      return false;
    };
    // A class's base, in its `extends` clause or a JavaScript file's
    // `@augments` tag, that names nothing: the compiler can give the class no
    // type, so it has no props to read. A base that resolves is read as a
    // value below.
    /** @type {(node: any) => boolean} */
    const baseless = node =>
      isValueWithTypeArguments(ts, node) &&
      (ts.isHeritageClause(node.parent) ||
        ts.isJSDocAugmentsTag(node.parent)) &&
      ts.isEntityNameExpression(node.expression) &&
      !checker.getSymbolAtLocation(node.expression);
    // The innermost such type names it: its parts are read first.
    /** @type {(node: any) => void} */
    const visit = node => {
      if (untyped) return;
      for (const doc of js ? (node.jsDoc ?? []) : []) {
        for (const tag of doc.tags ?? []) {
          if (typedTags.has(tag.kind)) visit(tag);
        }
      }
      ts.forEachChild(node, visit);
      if (!untyped && baseless(node)) {
        untyped = {
          name: `\`${node.expression.getText(sf)}\``,
          file: sf.fileName,
          how: 'used',
        };
      }
      if (
        !untyped &&
        ((STARTS.has(node.kind) &&
          !(ts.isTypeReferenceNode(node) && ts.isConstTypeReference(node)) &&
          !isValueWithTypeArguments(ts, node) &&
          !fromUntyped(node) &&
          isErrorType(checker, node)) ||
          (ts.isTypeQueryNode(node) && readsErrorValue(node.exprName)) ||
          (ts.isIndexedAccessTypeNode(node) && readsIndexedMembers(node)) ||
          // A class a type names: its instance type is inferred too.
          (ts.isTypeReferenceNode(node) &&
            readsErrorValue(node.typeName, true)) ||
          (ts.isExpressionWithTypeArguments(node) &&
            readsErrorValue(node.expression, true)))
      ) {
        untyped = {
          name: `\`${node.getText(sf)}\``,
          file: sf.fileName,
          how: 'used',
        };
      }
    };
    if (!missing && mine(sf.fileName)) visit(sf);
    const entry = {missing, untyped, next};
    cache.set(sf, entry);
    return entry;
  };
  // A reference that doesn't resolve, anywhere the walk goes, names what to
  // install; a type the compiler can't give is often only where it shows.
  /** @type {UnresolvedReference | null} */
  let firstUntyped = null;
  const seen = new Set();
  const queue = roots.filter(Boolean);
  while (queue.length > 0) {
    const sf = queue.shift();
    if (seen.has(sf)) continue;
    seen.add(sf);
    const {missing, untyped, next} = read(sf);
    if (missing) return missing;
    firstUntyped ??= untyped;
    queue.push(...next.filter(file => follow(file.fileName)));
  }
  return firstUntyped;
}

/**
 * The local names an import binds: its default, its namespace, the names it
 * lists, or an `import x = require()`.
 * @param {any} ts
 * @param {any} parent the import's declaration
 * @returns {string[]}
 */
function boundNames(ts, parent) {
  if (ts.isExternalModuleReference(parent)) return [parent.parent.name.text];
  const clause = ts.isImportDeclaration(parent) ? parent.importClause : null;
  const bound = clause?.namedBindings;
  return [
    ...(clause?.name ? [clause.name.text] : []),
    ...(bound && ts.isNamespaceImport(bound) ? [bound.name.text] : []),
    ...(bound && ts.isNamedImports(bound)
      ? bound.elements.map(/** @param {any} e */ e => e.name.text)
      : []),
  ];
}

/**
 * Whether an import takes any names; one that takes none loads its module
 * for what that does globally, as a side-effect import does.
 * @param {any} ts
 * @param {any} statement
 */
function importsNames(ts, statement) {
  const clause = statement.importClause;
  const bound = clause?.namedBindings;
  return (
    !!clause &&
    (!!clause.name ||
      (!!bound && (!ts.isNamedImports(bound) || bound.elements.length > 0)))
  );
}

/**
 * Whether a node gives type arguments to a value, not a type name: the base
 * a class extends, or an instantiation expression (`select<string>`).
 * @param {any} ts
 * @param {any} node
 */
function isValueWithTypeArguments(ts, node) {
  if (!ts.isExpressionWithTypeArguments(node)) return false;
  const clause = node.parent;
  if (!ts.isHeritageClause(clause)) return true;
  return (
    clause.token === ts.SyntaxKind.ExtendsKeyword &&
    (ts.isClassDeclaration(clause.parent) ||
      ts.isClassExpression(clause.parent))
  );
}

/**
 * Source text on one line, comments dropped, for a reason.
 * @param {string} text
 */
function oneLine(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether a node reads a value: a property or element access, a call, or a
 * name spread, assigned, passed or returned. A name that only declares or
 * imports something is not read here, and may stand for a type.
 * @param {any} ts
 * @param {any} node
 */
function readsValue(ts, node) {
  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    ts.isCallExpression(node)
  ) {
    return true;
  }
  if (!ts.isIdentifier(node)) return false;
  const parent = node.parent;
  return (
    ts.isSpreadAssignment(parent) ||
    ts.isSpreadElement(parent) ||
    ts.isJsxSpreadAttribute(parent) ||
    ts.isShorthandPropertyAssignment(parent) ||
    ((ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
      parent.initializer === node) ||
    (ts.isCallExpression(parent) && parent.arguments.includes(node)) ||
    ts.isReturnStatement(parent) ||
    ts.isArrayLiteralExpression(parent) ||
    ts.isParenthesizedExpression(parent) ||
    ts.isAsExpression(parent) ||
    ts.isConditionalExpression(parent) ||
    ts.isJsxExpression(parent) ||
    ts.isExportAssignment(parent)
  );
}

/**
 * The name an access or call starts from: `fmt` in `fmt.parse(text)`.
 * @param {any} ts
 * @param {any} node
 * @returns {string}
 */
function rootName(ts, node) {
  let root = node;
  while (
    ts.isPropertyAccessExpression(root) ||
    ts.isElementAccessExpression(root) ||
    ts.isCallExpression(root)
  ) {
    root = root.expression;
  }
  return ts.isIdentifier(root) ? root.text : '';
}

/**
 * Whether the compiler can only give a value its error type.
 * @param {any} checker
 * @param {any} node
 */
function isErrorValue(checker, node) {
  try {
    return checker.getTypeAtLocation(node).intrinsicName === 'error';
  } catch {
    return false;
  }
}

/**
 * Whether the compiler can only give a type node its error type.
 * @param {any} checker
 * @param {any} node
 */
function isErrorType(checker, node) {
  try {
    return checker.getTypeFromTypeNode(node).intrinsicName === 'error';
  } catch {
    return false;
  }
}

/**
 * The first reference that does not resolve from the program's global roots,
 * whose types every file sees: a type package the program loads by name
 * (`compilerOptions.types`, `*` expanded as TypeScript does, or every
 * package in `typeRoots` where TypeScript loads them all) that cannot be
 * found, or a reference in a declaration file the package's own config
 * includes, wherever it sits, or in the package's own type packages, or in a
 * file they import. Of those, only a file that acts globally starts the walk:
 * a script, `declare global`, `declare module`, `export as namespace`, an
 * import that takes no names (a side-effect import, `import {} from`), a
 * bare `export *`, or a `/// <reference>`. A config from above the package,
 * such as a monorepo's root config, may include the whole repository, so
 * only the package's own declaration files start the walk then. A
 * dependency's declarations (below `node_modules`) are not followed: `tsc`
 * skips their errors (`skipLibCheck`), and they reach a component only
 * through the globals they declare.
 * @param {any} ts the project's own `typescript`
 * @param {any} program
 * @param {any} checker
 * @param {string[]} declarations the declaration files the config includes
 * @param {any} options the program's compiler options
 * @param {(file: string) => boolean} isOwnFile whether a file is the
 *   package's own
 * @returns {UnresolvedReference | null}
 */
export function unresolvedGlobals(
  ts,
  program,
  checker,
  declarations,
  options,
  isOwnFile,
) {
  const config =
    options.configFilePath ??
    path.join(ts.sys.getCurrentDirectory(), 'tsconfig.json');
  /** @type {(file: string) => boolean} */
  const follow = file =>
    isOwnFile(file) || !/[\\/]node_modules[\\/]/.test(file);
  const own = isOwnFile(config);
  // A declaration file reaches a component through what it does globally: a
  // script, `declare global`, `declare module`, `export as namespace`, or an
  // import that takes no names, a bare `export *` or a `/// <reference>`, made
  // for what those load. A module that does none of these counts only where a
  // component imports it.
  /** @type {(sf: any) => boolean} */
  const global = sf =>
    sf &&
    (!ts.isExternalModule(sf) ||
      sf.referencedFiles.length > 0 ||
      sf.typeReferenceDirectives.length > 0 ||
      sf.statements.some(
        (/** @type {any} */ statement) =>
          (ts.isModuleDeclaration(statement) &&
            (ts.isGlobalScopeAugmentation(statement) ||
              ts.isStringLiteral(statement.name))) ||
          ts.isNamespaceExportDeclaration(statement) ||
          (ts.isImportDeclaration(statement) && !importsNames(ts, statement)) ||
          (ts.isExportDeclaration(statement) &&
            !!statement.moduleSpecifier &&
            !statement.exportClause),
      ));
  const roots = declarations
    .filter(file => own || isOwnFile(file))
    .map(file => program.getSourceFile(file))
    .filter(global);
  // With `types` unset TypeScript 5 loads every package in `typeRoots`, and
  // TypeScript 6 loads none; this asks the project's own which it loads.
  for (const name of ts.getAutomaticTypeDirectiveNames(options, ts.sys)) {
    const found = ts.resolveTypeReferenceDirective(
      name,
      path.join(path.dirname(config), '__inferred type names__.ts'),
      options,
      ts.sys,
    ).resolvedTypeReferenceDirective?.resolvedFileName;
    if (!found) {
      return {name: `the types \`${name}\``, file: config, how: 'named'};
    }
    const sf = follow(found) && program.getSourceFile(found);
    if (global(sf)) roots.push(sf);
  }
  return unresolvedReference(ts, program, checker, roots, follow, follow);
}
