// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compare a documented prop table with the props the TypeScript source
 * declares for the export it describes.
 *
 * The compiler is the project's own `typescript`. Without one it can use, the
 * comparison is skipped and says why. Every finding is a warning.
 *
 * `comparePropDocs` finds each component doc's prop tables first: a doc's
 * own `props` document the export its `name` names; each entry of a
 * multi-component doc documents its own export, which a member record
 * compares against its own source. Hook entries (`use…`) document parameters
 * and returns, not props, and are not compared.
 *
 * Each table (a doc's `props`, or a multi-component doc's entry, with the
 * export it documents and the files that may hold it) is compared with that
 * export's props type:
 * - `not_in_code`: a documented prop the props type does not have (a
 *   `data-*`-style name an index signature accepts counts as present);
 * - `not_in_doc`: a prop the package's own source declares, or builds with a
 *   mapped type from its own keys, that the table does not list. Props from
 *   outside the package (React, the DOM, another package's types or keys) are
 *   never required, and neither are `className`, `style`, `xstyle`,
 *   `data-testid`, `ref`, `key`, or a prop whose declaration carries an
 *   `internal` JSDoc tag;
 * - `required_mismatch`: `required` disagrees with whether every caller must
 *   pass the prop (one only some members of the props type require, or that
 *   the package's `defaultProps` fills, is optional, as it is to JSX
 *   callers; an entry that names several props claims its `required` for
 *   each);
 * - `type_mismatch`: for a prop declared in the package, the documented type
 *   differs from the code's where both sides read exactly (type-match.mjs
 *   states the rules); every other type is listed as not compared;
 * - `default_mismatch`: the doc's `default` and the literal default the
 *   component writes in its props parameter's destructuring (`size = 'md'`)
 *   differ, quotes and whitespace aside; where both write a default and
 *   either is not a literal, it is listed under `typesNotCompared`.
 *
 * @input Component records (name, docPath, sourcePath), or prop tables, the
 *   package root, and the directories to resolve `typescript` from.
 * @output A PropDriftReport.
 * @position Shared by `astryx doctor integration components` and the Astryx
 *   repository's test over Core's own component docs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {folderSourceFor} from './component-discovery.mjs';
import {loadComponentDoc} from './component-loader.mjs';
import {readPackageTsconfig} from './package-tsconfig.mjs';
import {
  resolveProjectTypeScript,
  TYPESCRIPT_FIX,
  unusableTypeScriptReason,
} from './project-typescript.mjs';
import {judgeType} from './type-match.mjs';
import {typeTextTooOld} from './type-text.mjs';
import {
  unresolvedGlobals,
  unresolvedReference,
} from './unresolved-references.mjs';

/**
 * @typedef {'not_in_code' | 'not_in_doc' | 'required_mismatch' | 'type_mismatch' | 'default_mismatch'} PropDriftKind
 */

/**
 * @typedef {object} PropDriftFinding
 * @property {string} component the documented component (export) name
 * @property {string} prop
 * @property {PropDriftKind} kind
 * @property {'warning'} severity
 * @property {string} message
 * @property {string} doc the doc file, relative to the package root
 * @property {string} source the source file, relative to the package root
 * @property {string} [docType] the documented type, as written
 * @property {string} [codeType] the type as the source declares it
 * @property {boolean} [docRequired]
 * @property {boolean} [codeRequired]
 * @property {string} [docDefault] the documented default, as written
 * @property {string} [codeDefault] the literal default the code writes
 * @property {string} [fix] what to change, ready to paste
 */

/**
 * @typedef {object} PropDriftUnchecked
 * @property {string} component
 * @property {string} doc the doc file, relative to the package root
 * @property {string} reason why its props could not be read
 */

/**
 * @typedef {object} PropDriftTypesNotCompared
 * @property {string} component
 * @property {string} doc the doc file, relative to the package root
 * @property {string} reason why: not a form the check judges exactly, a
 *   field the prop's variants give different types, a standard prop
 *   (`className`, `style`, …), a prop declared outside the package, or a
 *   default that is not a literal on one side
 * @property {string[]} props documented props whose types, or defaults, were
 *   not compared
 */

/**
 * @typedef {object} PropDriftReport
 * @property {'checked' | 'skipped'} status `skipped` means nothing was
 *   compared, and `reason` says why
 * @property {string} [reason]
 * @property {string} [typescript] the version of the compiler that read the props
 * @property {number} components how many documented prop tables were compared
 * @property {number} typesCompared how many documented prop types were judged
 * @property {string} [typesSkipped] why no prop type was judged
 * @property {PropDriftFinding[]} findings
 * @property {PropDriftUnchecked[]} unchecked documented components whose props
 *   could not be read from the source
 * @property {Array<PropDriftUnchecked & {props: string[]}>} [propsNotChecked]
 *   props a mapped type builds from keys the check can't trace, which a doc
 *   leaving out draws no warning for
 * @property {PropDriftTypesNotCompared[]} typesNotCompared every other
 *   documented prop type, grouped by why it was not judged
 */

/**
 * @typedef {object} PropDriftTable
 * @property {string} doc the doc file, relative to the package root
 * @property {string} name the export the table documents
 * @property {any[]} props the table's entries
 * @property {string[]} sources the files that may hold the export, in order
 */

/**
 * @typedef {object} PropDriftComponent
 * @property {string} name
 * @property {string} docPath absolute path to the component's `.doc.*` file
 * @property {string | null} sourcePath absolute path to its same-stem
 *   source, or null when no file in the package declares it (a family member
 *   only another folder or built output defines)
 */

/**
 * Props a doc never needs to list: the internal and styling props the
 * `ComponentPropDoc` authoring guidance says to skip, `ref`, which Core's
 * docs also leave out, and `key`, which React keeps for itself.
 */
export const PROPS_NOT_DOCUMENTED = Object.freeze([
  'className',
  'style',
  'xstyle',
  'data-testid',
  'ref',
  'key',
]);

/** The guidance's internal props: a declaration tagged `@internal`. */
const SKIP_TAGS = new Set(['internal']);
/** Why a documented prop type was not judged (`typesNotCompared`). */
const NOT_EXACT = 'not a form the check judges exactly';
/** A field documented with one variant's type, where they differ. */
const VARIANTS = "the prop's variants give this field different types";

/** A default the code writes that is not a literal (a constant, a call). */
const NOT_LITERAL = Symbol('not a literal');

/** Why a documented default was not compared with the code's. */
const CODE_DEFAULT_NOT_LITERAL =
  'its default in the code is not a literal, so the documented default was not compared';
const DOC_DEFAULT_NOT_LITERAL =
  "its documented default is not a literal, so it was not compared with the code's";
/** @type {(name: string, code?: CodeProp) => string} why a prop is not judged */
const outside = (name, code) =>
  code?.untraced
    ? NOT_EXACT
    : PROPS_NOT_DOCUMENTED.includes(name)
      ? 'standard prop, not compared'
      : 'declared outside the package, not compared';
const HOOK_NAME = /^use[A-Z0-9]/;

/** The line both surfaces print when the compiler is missing. */
export const TYPESCRIPT_MISSING_REASON = `TypeScript is not installed in this project, so documented props were not compared with the code. ${TYPESCRIPT_FIX}`;

/**
 * @template T
 * @param {() => T} compute
 * @returns {() => T}
 */
function memo(compute) {
  /** @type {{value: T} | null} */
  let cached = null;
  return () => {
    if (cached == null) cached = {value: compute()};
    return cached.value;
  };
}

/** @type {WeakMap<Function, (file: string) => boolean>} */
const MINE = new WeakMap();

/**
 * Whose type names the walk checks: the package's own files and any that
 * aren't a dependency's. The same test for the same own-file test.
 * @param {(file: string) => boolean} isOwnFile
 */
function mineFor(isOwnFile) {
  let mine = MINE.get(isOwnFile);
  if (!mine) {
    mine = (/** @type {string} */ file) =>
      isOwnFile(file) || !/[\\/]node_modules[\\/]/.test(file);
    MINE.set(isOwnFile, mine);
  }
  return mine;
}

/**
 * A memoized "is this file part of the package's own source?" test.
 * @param {string} root realpath of the package root
 */
function ownFileTest(root) {
  /** @type {Map<string, boolean>} */
  const cache = new Map();
  return (/** @type {string} */ file) => {
    let own = cache.get(file);
    if (own !== undefined) return own;
    let real = file;
    try {
      real = fs.realpathSync(file);
    } catch {
      // A lib or virtual file: compare as given.
    }
    const rel = path.relative(root, real);
    own =
      rel !== '' &&
      !rel.startsWith('..') &&
      !path.isAbsolute(rel) &&
      !rel.split(path.sep).includes('node_modules');
    cache.set(file, own);
    return own;
  };
}

/**
 * @typedef {object} CodeProp
 * @property {string} name
 * @property {boolean} required whether every caller must pass it: false
 *   when a member of the props type, an overload, or the package's
 *   `defaultProps` lets a caller leave it out
 * @property {boolean} own declared in the package's own source, or built
 *   from keys it writes
 * @property {boolean} [untraced] built from keys the check can't trace
 * @property {boolean} skipTagged its declaration carries an internal JSDoc tag
 * @property {string[]} declared the type as written, per own declaration
 * @property {() => string[][]} renderings the compiler's renderings, computed on demand
 * @property {() => any[]} types the prop's type in each member of the props type
 * @property {boolean} intersected one member declares it more than once (an
 *   intersection), so no one declaration's text is its type
 * @property {() => any[] | null} indexed the type an index signature gives
 *   the name in each member that lacks the prop; null when two signatures
 *   in one member take it
 * @property {any} location where names in the prop's type resolve
 */

/**
 * Read the props of one export.
 * @param {any} ts
 * @param {any} program
 * @param {any} checker
 * @param {string} sourcePath
 * @param {string} exportName
 * @param {(file: string) => boolean} isOwnFile
 * @param {import('./unresolved-references.mjs').UnresolvedReference | null} ambient
 *   what the program's other roots cannot resolve, which any component may
 *   use
 * @returns {{ok: true, props: Map<string, CodeProp>, accepts: (name: string) => any, defaults?: Map<string, string | number | boolean | null | symbol>} | {ok: false, reason: string}}
 */
function readCodeProps(
  ts,
  program,
  checker,
  sourcePath,
  exportName,
  isOwnFile,
  ambient,
) {
  const sourceFile = program.getSourceFile(sourcePath);
  const sourceName = path.basename(sourcePath);
  if (!sourceFile) {
    return {ok: false, reason: `the compiler could not read ${sourceName}`};
  }
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
  const stem = sourceName.replace(/\.[cm]?[jt]sx?$/, '');
  let symbol =
    exports.find(/** @param {any} s */ s => s.name === exportName) ??
    (stem === exportName
      ? exports.find(/** @param {any} s */ s => s.name === 'default')
      : undefined);
  if (!symbol) {
    return {
      ok: false,
      reason: `${sourceName} has no export named ${exportName}`,
    };
  }
  if (symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol);
  }
  // An import that does not resolve, in the files the component comes from,
  // can make any part of its props a guess, whatever the code looks like.
  // Some TypeScript versions read such a name as a plain `any`, so this comes
  // first.
  const own = [sourceFile, ...(symbol.declarations ?? [])]
    .map(/** @param {any} n */ n => n.getSourceFile())
    .filter(/** @param {any} sf */ sf => isOwnFile(sf.fileName));
  // Type names are checked in the files that aren't a dependency's. One
  // test per run, so the walk reads each file once for every component.
  const mine = mineFor(isOwnFile);
  const found = unresolvedReference(
    ts,
    program,
    checker,
    own,
    () => true,
    mine,
  );
  // A reference that doesn't resolve names what to install; a type the
  // compiler can't give in the component's own files may only show a broken
  // global one.
  const missing = found && found.how !== 'used' ? found : (ambient ?? found);
  if (missing) {
    const where =
      path.relative(path.dirname(sourcePath), missing.file) || sourceName;
    return {
      ok: false,
      reason:
        missing.how === 'used'
          ? `${exportName} depends on ${missing.name} (used in ${where}), a type the compiler can't work out, so its props would be a guess. Check that the package's dependencies are installed and its types compile, then run this check again`
          : `${exportName} depends on ${missing.name} (${missing.how} in ${where}), which the compiler could not resolve, usually a dependency that is not installed. Install the package's dependencies and run this check again`,
    };
  }
  const type = checker.getTypeOfSymbolAtLocation(symbol, sourceFile);
  // Each member of a union (`ComponentType<P>`: a class or a function).
  const signatures = (type.isUnion() ? type.types : [type]).flatMap(
    /** @param {any} t */ t => [
      ...t.getCallSignatures(),
      ...t.getConstructSignatures(),
    ],
  );
  if (signatures.length === 0) {
    // An `any` the source does not write comes from a type that does not
    // resolve, such as `forwardRef` when React's types are not installed.
    const writtenAny =
      symbol.valueDeclaration?.type?.kind === ts.SyntaxKind.AnyKeyword;
    const unresolved =
      !writtenAny &&
      (type.flags & ts.TypeFlags.Any ||
        hasUnresolvedPart(ts, checker, type, 0, new Set()));
    return {
      ok: false,
      reason: unresolved
        ? `${exportName}'s own type includes a type the compiler could not resolve, usually an import whose package is not installed (such as React's types, for a forwardRef or memo component). Install the package's dependencies and run this check again`
        : writtenAny
          ? `${exportName} is typed \`any\`, so it has no props to compare`
          : `${exportName} in ${sourceName} is not a component (it cannot be called with props)`,
    };
  }
  const unresolved = {
    ok: /** @type {const} */ (false),
    reason: `${exportName}'s props type includes a type the compiler could not resolve, usually an import whose package is not installed. Install the package's dependencies and run this check again`,
  };
  // Every overload: its props type joins the others as a member, as a
  // union's members do. An overload that takes no props makes every prop
  // optional.
  /** @type {any[]} */
  const propsTypes = [];
  let propless = false;
  for (const signature of signatures) {
    const parameter = signature.getParameters()[0];
    if (parameter) {
      propsTypes.push(checker.getTypeOfSymbolAtLocation(parameter, sourceFile));
    } else {
      propless = true;
    }
  }
  /** @type {Map<string, CodeProp>} */
  const props = new Map();
  if (propsTypes.length === 0) return {ok: true, props, accepts: () => []};

  // Props that are `any`, written so or made from it (`FC<any>`, or
  // `forwardRef<E, any>`'s `Omit<any, 'ref'>`).
  if (propsTypes.some(propsType => isAnyProps(ts, checker, propsType))) {
    return {
      ok: false,
      reason: `${exportName}'s props are typed \`any\`, so there is nothing to compare them with`,
    };
  }
  if (
    propsTypes.some(propsType =>
      hasUnresolvedPart(ts, checker, propsType, 0, new Set()),
    )
  ) {
    return unresolved;
  }

  const members = propsTypes
    .flatMap(propsType => (propsType.isUnion() ? propsType.types : [propsType]))
    .filter(
      /** @param {any} t */
      t => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
    );
  // A generic component whose props take their names from a type parameter
  // (the element it renders: `Omit<ComponentPropsWithoutRef<E>, 'as'>`, or a
  // bare `props: P`) accepts names that are known only where it is used.
  const generic = signatures.some(
    /** @param {any} signature */ signature =>
      (signature.getTypeParameters?.() ?? []).length > 0,
  );
  // Props that refer to a type parameter and show the compiler no members
  // at all would draw a finding for every documented name: listed too.
  const unnamed =
    members.some(member => isDeferred(ts, checker, member, true)) &&
    members.every(
      member =>
        checker.getPropertiesOfType(member).length === 0 &&
        (checker.getIndexInfosOfType?.(member) ?? []).length === 0,
    );
  if (
    generic &&
    (unnamed ||
      members.some(member => namesFromTypeParameter(ts, checker, member, 0)))
  ) {
    return {
      ok: false,
      reason: `${exportName}'s props take some of their names from a type parameter, such as the element it renders, so which props it accepts is known only where it is used`,
    };
  }
  // Each member of a prop's type is printed on its own, and long prints are
  // truncated: a type that expands to a huge structure (StyleX styles, say)
  // never matches a documented type anyway, and printing it whole can take
  // gigabytes.
  const flags =
    ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType |
    ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

  // `defaultProps` the package sets (a class's static field, one assigned to a
  // function, or the wrapped component's through up to two layers of `memo`
  // and `lazy`, as React's JSX types read it) lets JSX callers leave its props
  // out; `any` fills every prop. React's own types declare an optional one on
  // every component type.
  let holder = type;
  for (let i = 0; i < 2 && checker.getPropertyOfType(holder, '$$typeof'); i++) {
    const inner =
      checker.getPropertyOfType(holder, 'type') ??
      checker.getPropertyOfType(holder, '_result');
    if (!inner) break;
    holder = checker.getTypeOfSymbolAtLocation(inner, sourceFile);
  }
  const defaultProps = checker.getPropertyOfType(holder, 'defaultProps');
  const defaults = defaultProps?.declarations?.some(
    /** @param {any} d */ d => isOwnFile(d.getSourceFile().fileName),
  )
    ? checker.getTypeOfSymbolAtLocation(defaultProps, sourceFile)
    : null;
  const fillsAll = !!defaults && !!(defaults.flags & ts.TypeFlags.Any);
  const defaulted = new Set(
    defaults
      ? checker
          .getPropertiesOfType(defaults)
          .map(/** @param {any} s */ s => s.name)
      : [],
  );

  /** @type {Map<string, {symbols: any[], optional: number}>} */
  const byName = new Map();
  for (const member of members) {
    for (const prop of checker.getPropertiesOfType(member)) {
      const entry = byName.get(prop.name) ?? {symbols: [], optional: 0};
      entry.symbols.push(prop);
      if (prop.flags & ts.SymbolFlags.Optional) entry.optional++;
      byName.set(prop.name, entry);
    }
  }
  if (fillsAll) for (const name of byName.keys()) defaulted.add(name);

  /** @type {((prop: any) => string) | undefined} */
  let origin;
  // Read from the component's declaration, its props parameter's, and the
  // wrapped component's for `memo` and `lazy`.
  const originOf = (/** @type {any} */ prop) =>
    (origin ??= mappedPropOrigin(ts, checker, isOwnFile, [
      symbol.valueDeclaration ?? symbol.declarations?.[0],
      ...[
        ...signatures,
        ...(holder === type ? [] : holder.getCallSignatures()),
      ].map(
        (/** @type {any} */ signature) =>
          signature.getParameters()[0]?.valueDeclaration,
      ),
    ]))(prop);
  for (const [name, {symbols, optional}] of byName) {
    const declarations = symbols.flatMap(
      /** @param {any} s */ s => s.declarations ?? [],
    );
    const ownDeclarations = declarations.filter(
      /** @param {any} d */ d => isOwnFile(d.getSourceFile().fileName),
    );
    // A prop no declaration names, one a mapped type builds, is the
    // package's own when its key comes from the package's own source.
    const built =
      declarations.length === 0 ? strongest(symbols.map(originOf)) : null;
    // Optional when a caller may leave it out: an overload that takes no
    // props, or a member of the props type that does not require it.
    const required =
      !defaulted.has(name) &&
      !propless &&
      symbols.length === members.length &&
      optional === 0;
    props.set(name, {
      name,
      required,
      own: ownDeclarations.length > 0 || built === 'own',
      untraced:
        declarations.length === 0 && built !== 'own' && built !== 'foreign',
      skipTagged: ownDeclarations.some(
        /** @param {any} d */
        d =>
          ts
            .getJSDocTags(d)
            .some(
              /** @param {any} tag */ tag => SKIP_TAGS.has(tag.tagName.text),
            ),
      ),
      // A property's `type` is the prop's type; a method's is its return
      // type, so a method prop reads as the compiler renders it. A
      // declaration's text counts only for its own symbol, or where a mapping
      // copies its type unchanged (`Pick`, `Omit`): one that rewrites it
      // (`{[K in keyof T]: T[K][]}`, `Required<T>`) is judged by its type.
      declared: symbols.flatMap(
        /** @param {any} s */ s =>
          (s.declarations ?? [])
            .filter(
              /** @param {any} d */ d =>
                ownDeclarations.includes(d) &&
                d.type &&
                !ts.isMethodSignature(d) &&
                !ts.isMethodDeclaration(d) &&
                copiesType(ts, checker, s, d, sourceFile),
            )
            .map(/** @param {any} d */ d => d.type.getText(d.getSourceFile())),
      ),
      types: () =>
        symbols.map(
          /** @param {any} s */ s =>
            checker.getTypeOfSymbolAtLocation(s, sourceFile),
        ),
      intersected: symbols.some(
        /** @param {any} s */ s =>
          (s.declarations ?? []).filter(/** @param {any} d */ d => d.type)
            .length > 1,
      ),
      indexed: memo(() => {
        const lacking = members.filter(
          /** @param {any} m */ m => !checker.getPropertyOfType(m, name),
        );
        const each = lacking.map(
          /** @param {any} m */ m => indexesFor(ts, checker, [m], name),
        );
        return each.some(indexes => indexes.length > 1)
          ? null
          : each.flatMap(indexes => indexes.map(info => info.type));
      }),
      location: ownDeclarations[0] ?? sourceFile,
      // Printed where the prop is declared, where a documented type's names
      // resolve: a type another file imports under another name prints as
      // that file names it.
      renderings: memo(() => {
        const at = ownDeclarations[0] ?? sourceFile;
        /** @type {string[]} */
        const printed = [];
        /** @type {string[]} */
        const expanded = [];
        for (const s of symbols) {
          const propType = checker.getTypeOfSymbolAtLocation(s, sourceFile);
          for (const part of inDeclaredOrder(ts, checker, propType, s)) {
            printed.push(checker.typeToString(part, at, flags));
            expanded.push(
              checker.typeToString(
                part,
                at,
                flags | ts.TypeFormatFlags.InTypeAlias,
              ),
            );
          }
        }
        return [printed, expanded];
      }),
    });
  }

  /** The index signatures of the props type that take this name. */
  const accepts = (/** @type {string} */ name) =>
    indexesFor(ts, checker, members, name);
  return {ok: true, props, accepts, defaults: literalDefaults(ts, symbol)};
}

/**
 * The defaults a component writes in its props parameter's destructuring
 * (`{size = 'md'}`), by prop name, each as its value: a string, number,
 * boolean, or null, or NOT_LITERAL for any other default (a constant, a call,
 * an object), which is listed as not compared.
 * @param {any} ts
 * @param {any} symbol the component
 * @returns {Map<string, string | number | boolean | null | symbol>}
 */
function literalDefaults(ts, symbol) {
  /** @type {Map<string, string | number | boolean | null | symbol>} */
  const out = new Map();
  /** @param {any} node @param {number} depth @returns {any} */
  const fnOf = (node, depth) => {
    if (!node || depth > 4) return null;
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      return node;
    }
    if (ts.isVariableDeclaration(node))
      return fnOf(node.initializer, depth + 1);
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(node))
    ) {
      return fnOf(node.expression, depth + 1);
    }
    // `forwardRef(function …)`, `memo(…)`: the function they wrap.
    if (ts.isCallExpression(node)) {
      for (const argument of node.arguments) {
        const found = fnOf(argument, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const fn = fnOf(symbol?.valueDeclaration, 0);
  const pattern = fn?.parameters?.[0]?.name;
  if (!pattern || !ts.isObjectBindingPattern(pattern)) return out;
  for (const element of pattern.elements) {
    if (element.dotDotDotToken || !element.initializer) continue;
    const key = element.propertyName ?? element.name;
    if (!(
      ts.isIdentifier(key) ||
      ts.isStringLiteral(key) ||
      ts.isNumericLiteral(key)
    )) {
      continue;
    }
    const value = literalValue(ts, element.initializer);
    out.set(key.text, value === undefined ? NOT_LITERAL : value);
  }
  return out;
}

/**
 * A literal expression's value, or undefined for anything else.
 * @param {any} ts
 * @param {any} node
 * @returns {string | number | boolean | null | undefined}
 */
function literalValue(ts, node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  return undefined;
}

/**
 * A documented default as a literal value: a quoted string (quotes of any
 * kind, whitespace around it ignored), a number, `true`, `false`, or
 * `null`; undefined for prose or an expression, which is never compared.
 * @param {unknown} written
 * @returns {string | number | boolean | null | undefined}
 */
function documentedDefault(written) {
  if (typeof written === 'number' || typeof written === 'boolean') {
    return written;
  }
  if (written === null) return null;
  if (typeof written !== 'string') return undefined;
  const text = written.trim();
  const quoted = /^(['"`])([^'"`]*)\1$/.exec(text);
  if (quoted) return quoted[2];
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return Number(text);
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;
  return undefined;
}

/** @param {string | number | boolean | null} value */
function defaultText(value) {
  return typeof value === 'string' ? `'${value}'` : String(value);
}

/**
 * A prop type's union members in the order the source declares them,
 * through the type aliases it names; members it doesn't reach, such as the
 * `undefined` an optional prop adds, follow, sorted by their text. The
 * compiler's own order follows when each type was first made, so it would
 * move with whatever read the types first.
 * @param {any} ts
 * @param {any} checker
 * @param {any} type
 * @param {any} symbol the prop
 * @returns {any[]}
 */
function inDeclaredOrder(ts, checker, type, symbol) {
  if (!type.isUnion()) return [type];
  /** @type {any[]} */
  const order = [];
  const seen = new Set();
  /** @type {(node: any) => void} */
  const visit = node => {
    if (ts.isParenthesizedTypeNode(node)) return visit(node.type);
    if (ts.isUnionTypeNode(node)) return node.types.forEach(visit);
    if (ts.isTypeReferenceNode(node) && !node.typeArguments) {
      let target = checker.getSymbolAtLocation(node.typeName);
      if (target && target.flags & ts.SymbolFlags.Alias) {
        target = checker.getAliasedSymbol(target);
      }
      const alias = target?.declarations?.find(ts.isTypeAliasDeclaration);
      if (alias && !alias.typeParameters) {
        if (!seen.has(alias)) {
          seen.add(alias);
          visit(alias.type);
        }
        return;
      }
    }
    const found = checker.getTypeFromTypeNode(node);
    order.push(...(found.isUnion() ? found.types : [found]));
  };
  for (const declaration of symbol.declarations ?? []) {
    if (declaration.type) visit(declaration.type);
  }
  /** @type {(t: any) => number} */
  const place = t => {
    const at = order.indexOf(t);
    return at === -1 ? order.length : at;
  };
  /** @type {(t: any) => string} */
  const text = t => checker.typeToString(t);
  return [...type.types].sort(
    (a, b) => place(a) - place(b) || text(a).localeCompare(text(b)),
  );
}

/**
 * Whether a declaration's text reads as the prop's type: it is the prop's own
 * declaration, or the generic type's prop it instantiates when the result
 * prints as the declared type in the component's file (a generic component
 * passing its own type parameters on), or a mapping copies its type
 * unchanged. Instantiated with another type (`Box<string>`, `ListProps<T[]>`,
 * or an imported `Item` the file names another way), its text names a type
 * the prop no longer has.
 * @param {any} ts
 * @param {any} checker
 * @param {any} symbol the prop
 * @param {any} declaration one of its declarations
 * @param {any} location
 */
function copiesType(ts, checker, symbol, declaration, location) {
  const own = declaration.name && checker.getSymbolAtLocation(declaration.name);
  if (!own) return false;
  if (own === symbol) return true;
  const type = checker.getTypeOfSymbolAtLocation(symbol, location);
  const declared = checker.getTypeOfSymbolAtLocation(own, location);
  /** @param {any} t */
  const print = t =>
    checker.typeToString(t, location, ts.TypeFormatFlags.NoTruncation);
  return (
    declared === type ||
    (own === (symbol.links ?? symbol).target && print(type) === print(declared))
  );
}

/**
 * Does the code take `undefined` itself, written or through an alias? With
 * `exactOptionalPropertyTypes` that is part of the type a message shows;
 * otherwise an optional prop takes `undefined` anyway.
 * @param {any} checker
 * @param {CodeProp} code
 * @param {boolean} exactOptional
 */
function ownUndefined(checker, code, exactOptional) {
  const undefinedType = checker.getUndefinedType?.();
  return (
    exactOptional &&
    (code.declared.some(text => /\bundefined\b/.test(text)) ||
      code
        .types()
        .some(t => (t.isUnion() ? t.types : [t]).includes(undefinedType)))
  );
}

/**
 * One of a prop's renderings for a message, without the `undefined` an
 * optional prop adds, unless the code takes it itself.
 * @param {CodeProp} code
 * @param {number} which 0 as printed, 1 expanded
 * @param {boolean} keepUndefined
 */
function rendered(code, which, keepUndefined) {
  const parts = code.renderings()[which];
  return [
    ...new Set(
      parts.filter(
        part =>
          !(code.required !== true && part === 'undefined' && !keepUndefined),
      ),
    ),
  ].join(' | ');
}

/**
 * The prop's type for a message: as the source writes it when its
 * declarations agree, else (a method or accessor, or declarations that differ
 * or narrow each other in an intersection) as the compiler prints it.
 * @param {CodeProp} code
 * @param {boolean} keepUndefined
 */
function codeTypeText(code, keepUndefined) {
  const written = [...new Set(code.declared)];
  const text =
    written.length === 1 ? written[0] : rendered(code, 0, keepUndefined);
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Judge a documented type against a prop's code type (type-match.mjs).
 * @param {any} ts
 * @param {any} checker
 * @param {string} docType
 * @param {CodeProp} code
 * @param {{nullable: boolean, exactOptional: boolean, isDefaultLibrary: (file: any) => boolean}} reading
 *   how the project checks null, and which files are TypeScript's own
 */
function judgeProp(ts, checker, docType, code, reading) {
  // A member that lacks the prop may take its name through an index
  // signature, which a doc may describe too.
  const indexed = code.indexed();
  if (indexed == null) return 'not_compared';
  return judgeMembers(docType, [...code.types(), ...indexed], {
    ts,
    checker,
    location: code.location,
    optional: code.required !== true && !reading.exactOptional,
    ...reading,
    // Declared text reads as the type only when each declaration is one
    // member's; intersected declarations narrow each other.
    written: code.intersected
      ? code.renderings()
      : [
          code.declared,
          ...code.declared.map(text => [text]),
          ...code.renderings(),
        ],
  });
}

/**
 * Judge a documented type against the types a prop has in the members of a
 * union of props types: a doc may describe one member, so any member's type,
 * or their union, matches, and it is a mismatch only against every one.
 * @param {string} docType
 * @param {any[]} types the type in each member
 * @param {import('./type-match.mjs').JudgeContext} ctx
 * @returns {import('./type-match.mjs').TypeVerdict}
 */
function judgeMembers(docType, types, ctx) {
  const candidates =
    types.length > 1 ? [types, ...types.map(type => [type])] : [types];
  const verdicts = candidates.map(candidate =>
    judgeType(docType, candidate, ctx),
  );
  if (verdicts.includes('match')) return 'match';
  return verdicts.every(verdict => verdict === 'mismatch')
    ? 'mismatch'
    : 'not_compared';
}

/**
 * The props one doc entry names. `a / b` documents each of `a` and `b`, with
 * the entry's `required` (and the type split the same way when it splits
 * into as many parts); `x.y` (or
 * `x[].y`) documents a field of prop `x`; `...rest` documents a spread of
 * another props type and is not compared.
 * @param {any} raw
 * @returns {Array<{name: string, written: string, path: string[], spread: boolean, type?: string, required?: boolean}>}
 */
function documentedProps(raw) {
  const names = String(raw.name)
    .split(/\s+\/\s+/)
    .map(name => name.trim())
    .filter(Boolean);
  const types = typeof raw.type === 'string' ? raw.type.split(/\s+\/\s+/) : [];
  return names.map((written, i) => {
    const spread = written.startsWith('...');
    const [root = written, ...path] = written
      .replace(/\[\]/g, '')
      .split('.')
      .filter(Boolean);
    return {
      name: spread ? written : root,
      written,
      path: spread ? [] : path,
      spread,
      type:
        names.length === 1
          ? raw.type
          : types.length === names.length
            ? types[i]
            : undefined,
      required: raw.required,
    };
  });
}

/**
 * The types a field can sit on: each member of a union, through arrays and
 * tuples at any depth (`grid[][].id`).
 * @param {any} ts
 * @param {any} checker
 * @param {any} type
 * @param {number} [depth]
 * @returns {any[]}
 */
function holders(ts, checker, type, depth = 0) {
  if (depth > 8) return [type];
  if (type.isUnion()) {
    return type.types.flatMap(
      /** @param {any} t */ t => holders(ts, checker, t, depth + 1),
    );
  }
  const array =
    ['Array', 'ReadonlyArray'].includes(type.symbol?.name) ||
    type.target?.objectFlags & ts.ObjectFlags.Tuple;
  if (array && type.objectFlags & ts.ObjectFlags.Reference) {
    return checker
      .getTypeArguments(type)
      .flatMap(/** @param {any} t */ t => holders(ts, checker, t, depth + 1));
  }
  return [type];
}

/**
 * Whether a type takes `undefined` (an index signature's value type, which
 * TypeScript holds an explicit `undefined` to).
 * @param {any} ts
 * @param {any} type
 */
function takesUndefined(ts, type) {
  return (type.isUnion() ? type.types : [type]).some(
    /** @param {any} t */ t => t.flags & ts.TypeFlags.Undefined,
  );
}

/**
 * The types a field path reaches in a prop's type (in each member of a union
 * that has it, through arrays at any depth), and whether its last field is
 * optional: null when no member has the path, `any` when a type on the way
 * is `any` or `unknown`, which holds any field.
 * @param {any} ts
 * @param {any} checker
 * @param {CodeProp} code
 * @param {string[]} fieldPath
 * @returns {{types: any[], optional: boolean, ambiguous: boolean, indexed: boolean} | 'any' | null}
 *   `ambiguous` when two index signatures take a field on the path, and
 *   `indexed` when only index signatures take the last field
 */
function fieldTypes(ts, checker, code, fieldPath) {
  /** @type {any[]} */
  let current = code.types();
  let optional = false;
  let ambiguous = false;
  let indexed = false;
  for (const field of fieldPath) {
    /** @type {any[]} */
    const next = [];
    optional = false;
    let byName = false;
    for (const holder of current.flatMap(t => holders(ts, checker, t))) {
      if (holder.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
        return 'any';
      }
      const prop = checker.getPropertyOfType(holder, field);
      if (prop) {
        next.push(checker.getTypeOfSymbol(prop));
        if (prop.flags & ts.SymbolFlags.Optional) optional = true;
        byName = true;
        continue;
      }
      // A field an index signature takes (`Record<string, string>`) is of the
      // index's type, which takes `undefined` only when it says so; two that
      // take it hold it to both.
      const indexes = indexesFor(ts, checker, [holder], field);
      if (indexes.length > 1) ambiguous = true;
      if (indexes.length > 0) {
        next.push(indexes[0].type);
        if (takesUndefined(ts, indexes[0].type)) optional = true;
      }
    }
    if (next.length === 0) return null;
    current = next;
    indexed = !byName;
  }
  return {types: current, optional, ambiguous, indexed};
}

/**
 * The types a field path reaches, printed where the prop is declared, where
 * a documented type's names resolve.
 * @param {any} ts
 * @param {any} checker
 * @param {{types: any[], optional: boolean}} reached
 * @param {boolean} exactOptional the project sets `exactOptionalPropertyTypes`
 * @param {any} location where the prop is declared
 * @returns {string[]}
 */
function fieldTypeText(ts, checker, reached, exactOptional, location) {
  // An optional field's `undefined` is the compiler's own; with
  // `exactOptionalPropertyTypes` it is a marker of its own, and one the code
  // declares stays.
  const own = /** @param {any} t */ t =>
    reached.optional &&
    t.flags & ts.TypeFlags.Undefined &&
    (!exactOptional || t !== checker.getUndefinedType?.());
  return [
    ...new Set(
      reached.types
        .flatMap(t => (t.isUnion() ? t.types : [t]))
        .filter(t => !own(t))
        .map(t =>
          checker.typeToString(
            t,
            location,
            ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType,
          ),
        ),
    ),
  ];
}

/**
 * Is a type the compiler's stand-in for a name it could not resolve?
 * @param {any} ts
 * @param {any} type
 */
function isErrorType(ts, type) {
  return (
    (type.flags & ts.TypeFlags.Any) !== 0 && type.intrinsicName === 'error'
  );
}

/**
 * Do some of a generic component's prop names come from a type parameter:
 * a deferred type, an index signature keyed or valued by a type made from
 * one, or a mapped type whose keys are one (`Partial<P>`) or whose `as`
 * clause uses one? An interface whose values alone use it (`ListProps<T>`),
 * a mapping over keys of its own (`Record<'value', V>`), and an index that
 * takes any name (`[key: string]: any`) give names of its own.
 * @param {any} ts
 * @param {any} checker
 * @param {any} type
 * @param {number} depth
 * @returns {boolean}
 */
function namesFromTypeParameter(ts, checker, type, depth) {
  if (depth > 8) return false;
  if (type.isUnion() || type.isIntersection()) {
    return type.types.some(
      /** @param {any} t */ t =>
        namesFromTypeParameter(ts, checker, t, depth + 1),
    );
  }
  if (isDeferred(ts, checker, type)) return true;
  if (
    (checker.getIndexInfosOfType?.(type) ?? []).some(
      /** @param {any} info */ info =>
        isDeferred(ts, checker, info.type, true) ||
        isDeferred(ts, checker, info.keyType, true),
    )
  ) {
    return true;
  }
  if ((type.objectFlags & ts.ObjectFlags.Mapped) === 0) return false;
  // The keys, which the compiler works out when it reads the members.
  checker.getPropertiesOfType(type);
  return (
    (!!type.constraintType && isDeferred(ts, checker, type.constraintType)) ||
    renamedByTypeParameter(ts, checker, type)
  );
}

/**
 * Does a mapping's `as` clause use a type parameter besides its own key that
 * is still open where the props are read: one the component declares, or one
 * an alias passes on whose argument is still a type parameter (`` as
 * `${N}${K}` ``, `as T extends true ? K : never`)? Given fixed arguments
 * (`Prefixed<'my'>`, a key filter such as `Except<Props, 'b'>`), every key
 * gets its name. Its own key, and an `infer` inside the clause, are known
 * for each key.
 * @param {any} ts
 * @param {any} checker
 * @param {any} type a mapped type
 * @returns {boolean}
 */
function renamedByTypeParameter(ts, checker, type) {
  const clause = type.declaration?.nameType;
  if (!clause) return false;
  /** @type {(node: any) => boolean} */
  const uses = node => {
    const symbol = ts.isTypeReferenceNode(node)
      ? checker.getSymbolAtLocation(node.typeName)
      : undefined;
    const declaration =
      symbol && symbol.flags & ts.SymbolFlags.TypeParameter
        ? symbol.declarations?.[0]
        : undefined;
    const inClause =
      declaration?.getSourceFile() === clause.getSourceFile() &&
      declaration.pos >= clause.pos &&
      declaration.end <= clause.end;
    if (
      declaration &&
      declaration !== type.declaration.typeParameter &&
      !inClause
    ) {
      // Its value where the props are read, through the instantiation.
      const value = valueIn(
        ts,
        checker,
        checker.getDeclaredTypeOfSymbol(symbol),
        type.mapper,
        0,
      );
      if (!value || isDeferred(ts, checker, value, true)) return true;
    }
    return !!ts.forEachChild(
      node,
      /** @param {any} child */ child => uses(child) || undefined,
    );
  };
  return uses(clause);
}

/**
 * The value an instantiation gives a type parameter, as the compiler's own
 * mappers give it, through each mapper one combines; null when that takes
 * more than following parameters (a value made from one, or a mapper of
 * another form), which counts as open.
 * @param {any} ts
 * @param {any} checker
 * @param {any} parameter
 * @param {any} mapper
 * @param {number} depth
 * @returns {any}
 */
function valueIn(ts, checker, parameter, mapper, depth) {
  if (!mapper) return parameter;
  if (depth > 32) return null;
  if (mapper.mapper1 && mapper.mapper2) {
    const first = valueIn(ts, checker, parameter, mapper.mapper1, depth + 1);
    if (!first) return null;
    if (first === parameter || first.flags & ts.TypeFlags.TypeParameter) {
      return valueIn(ts, checker, first, mapper.mapper2, depth + 1);
    }
    return isDeferred(ts, checker, first, true) ? null : first;
  }
  if ('source' in mapper) {
    return mapper.source === parameter ? mapper.target : parameter;
  }
  if (Array.isArray(mapper.sources)) {
    const i = mapper.sources.indexOf(parameter);
    if (i < 0) return parameter;
    const target = mapper.targets?.[i];
    return typeof target === 'function' ? target() : (target ?? null);
  }
  return typeof mapper.func === 'function' ? mapper.func(parameter) : null;
}

/**
 * A type parameter, or a type the compiler defers until one is known (an
 * indexed access, a conditional), or a union, intersection or template
 * literal with one (`on${K}`, `Capitalize<K>`); with `deep`, also a type made
 * from one (through alias or reference arguments).
 * @param {any} ts
 * @param {any} checker
 * @param {any} t
 * @param {boolean} [deep]
 * @param {number} [depth]
 * @returns {boolean}
 */
function isDeferred(ts, checker, t, deep = false, depth = 0) {
  const F = ts.TypeFlags;
  if (
    t.flags &
    (F.TypeParameter |
      F.IndexedAccess |
      F.Conditional |
      F.Substitution |
      F.Index)
  ) {
    return true;
  }
  if (depth > 6) return false;
  const parts = [
    ...(t.isUnion() || t.isIntersection() ? t.types : []),
    ...(t.flags & F.TemplateLiteral ? (t.types ?? []) : []),
    ...(t.flags & F.StringMapping && t.type ? [t.type] : []),
    ...(deep ? (t.aliasTypeArguments ?? []) : []),
    ...(deep && t.objectFlags & ts.ObjectFlags.Reference
      ? checker.getTypeArguments(t)
      : []),
  ];
  return parts.some(u => isDeferred(ts, checker, u, deep, depth + 1));
}

/**
 * Does an index signature's key take this prop name, as TypeScript would? A
 * `string` key takes any name; a template literal key only the names that
 * match it (`data-${string}`, `col${number}`, `on${Capitalize<string>}`).
 * @param {any} ts
 * @param {any} checker
 * @param {any} key
 * @param {string} name
 */
function keyAccepts(ts, checker, key, name) {
  if (key.flags & ts.TypeFlags.String) return true;
  if (!(key.flags & ts.TypeFlags.TemplateLiteral)) return false;
  if (checker.getStringLiteralType && checker.isTypeAssignableTo) {
    return checker.isTypeAssignableTo(checker.getStringLiteralType(name), key);
  }
  // An older TypeScript has no literal-type factory: match the template.
  /** @type {Record<string, string>} */
  const mappings = {
    Uppercase: '[^a-z]*',
    Lowercase: '[^A-Z]*',
    Capitalize: '(?:[^a-z][\\s\\S]*)?',
    Uncapitalize: '(?:[^A-Z][\\s\\S]*)?',
  };
  const spans = (key.types ?? []).map(
    /** @param {any} span */ span =>
      span.flags & ts.TypeFlags.Number
        ? '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?'
        : (mappings[String(span.symbol?.escapedName)] ?? '[\\s\\S]*'),
  );
  const pattern = (key.texts ?? [])
    .map(
      (/** @type {string} */ text, /** @type {number} */ i) =>
        text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (spans[i] ?? ''),
    )
    .join('');
  return new RegExp(`^${pattern}$`).test(name);
}

/**
 * The index signatures of these types that take a name, as TypeScript
 * matches keys. TypeScript holds a value to every one of them.
 * @param {any} ts
 * @param {any} checker
 * @param {any[]} types
 * @param {string} name
 * @returns {any[]}
 */
function indexesFor(ts, checker, types, name) {
  // One signature seen through several union members is one signature.
  const seen = new Set();
  return types
    .flatMap(type => checker.getIndexInfosOfType?.(type) ?? [])
    .filter(
      /** @param {any} info */ info => {
        const key = `${checker.typeToString(info.keyType)}\0${checker.typeToString(info.type)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return (
          !holdsNothing(ts, info.type) &&
          keyAccepts(ts, checker, info.keyType, name)
        );
      },
    );
}

/**
 * Can a value of this type be passed at all? `never`, or only `undefined`
 * (`Record<string, never>`, the usual way to write "no props"), cannot.
 * @param {any} ts
 * @param {any} type
 */
function holdsNothing(ts, type) {
  const parts = type.isUnion() ? type.types : [type];
  return parts.every(
    /** @param {any} t */ t =>
      t.flags & (ts.TypeFlags.Never | ts.TypeFlags.Undefined),
  );
}

/** @param {Array<string | null>} found the answers for one key, by place */
const strongest = found =>
  ['own', 'foreign', 'unknown'].find(answer => found.includes(answer)) ?? null;

/**
 * Where the key of a prop a mapped type builds, which no declaration names,
 * comes from: `own` when the package's own source writes it, as a literal or
 * a property's declaration, `foreign` when another package's types do, and
 * `unknown` when the check can't trace it. It reads the mapping where the
 * component's declaration and props parameter reach it (and the component a
 * `memo`, `lazy` or `forwardRef` call wraps), through aliases, a generic's
 * arguments, `keyof`, `typeof`, and a conditional's branches (`Exclude`,
 * `Extract`).
 * @param {any} ts
 * @param {any} checker
 * @param {(file: string) => boolean} isOwnFile
 * @param {any[]} starts
 * @returns {(prop: any) => string}
 */
function mappedPropOrigin(ts, checker, isOwnFile, starts) {
  /** @type {Map<any, Map<any, any>[]>} each mapping, with its type arguments */
  const sites = new Map();
  let budget = 5000;
  /** @param {any} node */
  const where = node =>
    isOwnFile(node.getSourceFile().fileName) ? 'own' : 'foreign';
  /** @param {any} node */
  const target = node => {
    let symbol = checker.getSymbolAtLocation(
      node.typeName ?? node.exprName ?? node.expression ?? node,
    );
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    return symbol;
  };
  /** @type {(params: any, args: any, env: Map<any, any>) => Map<any, any>} */
  const bind = (params, args, env) => {
    const next = new Map(env);
    (params ?? []).forEach(
      (/** @type {any} */ param, /** @type {number} */ i) => {
        const node = args?.[i] ?? param.default;
        if (node)
          next.set(target(param.name), {node, env: args?.[i] ? env : next});
      },
    );
    return next;
  };
  /** @type {(node: any, env: Map<any, any>, depth: number) => void} */
  const visit = (node, env, depth) => {
    if (!node || depth > 40 || budget-- <= 0) return;
    if (ts.isMappedTypeNode(node)) {
      sites.set(node, [...(sites.get(node) ?? []), env]);
    }
    const reference =
      ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node);
    // A component another binding wraps: `memo(Inner)`, `forwardRef(Impl)`.
    const wrapped =
      ts.isIdentifier(node) &&
      (ts.isCallExpression(node.parent) ||
        ts.isVariableDeclaration(node.parent)) &&
      node !== node.parent.expression &&
      node !== node.parent.name;
    for (const declaration of reference || wrapped
      ? (target(node)?.declarations ?? [])
      : []) {
      const own = where(declaration) === 'own';
      if (reference && ts.isTypeAliasDeclaration(declaration)) {
        visit(
          declaration.type,
          bind(declaration.typeParameters, node.typeArguments, env),
          depth + 1,
        );
      } else if (reference && (own || !node.typeArguments)) {
        // Another package's interface: only what it extends.
        const next = bind(declaration.typeParameters, node.typeArguments, env);
        if (own) visit(declaration, next, depth + 1);
        else
          for (const clause of declaration.heritageClauses ?? [])
            visit(clause, next, depth + 1);
      } else if (wrapped && own) {
        visit(declaration, env, depth + 1);
      }
    }
    ts.forEachChild(node, (/** @type {any} */ child) =>
      visit(child, env, depth + 1),
    );
  };
  /** @type {(node: any, key: string, env: Map<any, any>, depth: number) => string | null} */
  const keyOrigin = (node, key, env, depth) => {
    if (!node || depth > 40) return 'unknown';
    const next = (/** @type {any} */ inner) =>
      keyOrigin(inner, key, env, depth + 1);
    if (ts.isParenthesizedTypeNode(node)) return next(node.type);
    if (ts.isLiteralTypeNode(node)) {
      return node.literal.text === key ? where(node) : null;
    }
    if (ts.isUnionTypeNode(node)) return strongest(node.types.map(next));
    if (ts.isConditionalTypeNode(node)) {
      return strongest([next(node.trueType), next(node.falseType)]);
    }
    if (
      ts.isTypeOperatorNode(node) &&
      node.operator === ts.SyntaxKind.KeyOfKeyword
    ) {
      const of =
        ts.isTypeReferenceNode(node.type) && env.get(target(node.type));
      const prop = checker.getPropertyOfType(
        checker.getTypeFromTypeNode(of ? of.node : node.type),
        key,
      );
      return prop ? propOrigin(prop, depth + 1) : null;
    }
    if (ts.isArrayTypeNode(node)) return next(node.elementType);
    if (ts.isTupleTypeNode(node)) return strongest(node.elements.map(next));
    if (ts.isTypeOperatorNode(node)) return next(node.type);
    if (ts.isIndexedAccessTypeNode(node)) {
      // `Props['size']` reads the property's own type; `(typeof SIZES)[number]`
      // reads the value's.
      const index = ts.isLiteralTypeNode(node.indexType)
        ? node.indexType.literal.text
        : undefined;
      if (index === undefined) return next(node.objectType);
      const declared = checker.getPropertyOfType(
        checker.getTypeFromTypeNode(node.objectType),
        index,
      )?.declarations?.[0];
      return declared ? valueOrigin(declared, key, depth + 1) : 'unknown';
    }
    if (ts.isTypeQueryNode(node)) {
      return valueOrigin(target(node)?.valueDeclaration, key, depth + 1);
    }
    if (ts.isTypeReferenceNode(node)) {
      const symbol = target(node);
      const bound = symbol && env.get(symbol);
      if (bound) return keyOrigin(bound.node, key, bound.env, depth + 1);
      const alias = symbol?.declarations?.find(ts.isTypeAliasDeclaration);
      if (alias) {
        return keyOrigin(
          alias.type,
          key,
          bind(alias.typeParameters, node.typeArguments, env),
          depth + 1,
        );
      }
      // An enum: where it is declared. A type parameter no argument binds,
      // such as an `infer`, can't be traced.
      if (
        symbol &&
        symbol.flags & (ts.SymbolFlags.Enum | ts.SymbolFlags.EnumMember)
      ) {
        return where(symbol.declarations[0]);
      }
    }
    return 'unknown';
  };
  /**
   * Where a value's literal keys are written: its declared type, or the
   * literals its initializer writes, through `as const` and other bindings.
   * @type {(node: any, key: string, depth: number) => string | null}
   */
  const valueOrigin = (node, key, depth) => {
    if (!node || depth > 40) return 'unknown';
    if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
      return node.text === key ? where(node) : null;
    }
    if (ts.isArrayLiteralExpression(node)) {
      return strongest(
        node.elements.map((/** @type {any} */ e) =>
          valueOrigin(e, key, depth + 1),
        ),
      );
    }
    // A declared type or a cast, but not `as const` or `satisfies`.
    const written =
      node.type &&
      !ts.isSatisfiesExpression?.(node) &&
      node.type.typeName?.text !== 'const';
    if (written) return keyOrigin(node.type, key, new Map(), depth + 1);
    const inner = node.initializer ?? node.expression;
    if (inner) return valueOrigin(inner, key, depth + 1);
    if (ts.isIdentifier(node)) {
      let symbol = checker.getSymbolAtLocation(node);
      if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
        symbol = checker.getAliasedSymbol(symbol);
      }
      return valueOrigin(symbol?.valueDeclaration, key, depth + 1);
    }
    return 'unknown';
  };
  /** @type {(prop: any, depth: number) => string | null} */
  const propOrigin = (prop, depth) => {
    if (depth > 40) return 'unknown';
    const declarations = prop.declarations ?? [];
    if (declarations.length > 0) {
      return declarations.some((/** @type {any} */ d) => where(d) === 'own')
        ? 'own'
        : 'foreign';
    }
    const links = prop.links ?? prop;
    if (links.syntheticOrigin)
      return propOrigin(links.syntheticOrigin, depth + 1);
    if (links.containingType) {
      return strongest(
        links.containingType.types.map((/** @type {any} */ t) => {
          const part = checker.getPropertyOfType(t, prop.name);
          return part && part !== prop ? propOrigin(part, depth + 1) : null;
        }),
      );
    }
    const mapping = links.mappedType?.declaration;
    const key = links.keyType?.value;
    if (!mapping || key === undefined) return 'unknown';
    return strongest(
      (sites.get(mapping) ?? []).map(env =>
        keyOrigin(
          mapping.typeParameter.constraint,
          String(key),
          env,
          depth + 1,
        ),
      ),
    );
  };
  for (const start of starts) {
    if (start && where(start) === 'own') visit(start, new Map(), 0);
  }
  return prop => propOrigin(prop, 0) ?? 'unknown';
}

/**
 * Are props `any`: a plain `any` (not one standing for a name that does not
 * resolve), or a type an alias makes from `any` by reading its keys, which
 * takes every name (`Omit<any, 'ref'>`, or React's `Omit` of one)? `Record<string, any>` only gives
 * names an `any` value, as an inline `[key: string]: any` does.
 * @param {any} ts
 * @param {any} checker
 * @param {any} type
 * @param {number} [depth] how far into an alias's arguments
 * @returns {boolean}
 */
function isAnyProps(ts, checker, type, depth = 0) {
  if (type.flags & ts.TypeFlags.Any) return !isErrorType(ts, type);
  const parts = type.isUnion() || type.isIntersection() ? type.types : [type];
  /** @type {(node: any) => any} the symbol a reference names */
  const target = node => {
    const used = checker.getSymbolAtLocation(node.typeName ?? node.expression);
    return used && used.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(used)
      : used;
  };
  /** @type {(node: any) => any} */
  const aliasOf = node =>
    target(node)?.declarations?.find(ts.isTypeAliasDeclaration);
  // Whether an alias reads its `i`th parameter's keys: `keyof T`, or `T`
  // passed on to an alias that does, as `type Without<T> = Omit<T, 'as'>`.
  /** @type {(alias: any, i: number, depth?: number) => boolean} */
  const readsKeys = (alias, i, depth = 0) => {
    const name = alias?.typeParameters?.[i]?.name.text;
    /** @type {(node: any) => boolean} */
    const visit = node =>
      (ts.isTypeOperatorNode(node) &&
        node.operator === ts.SyntaxKind.KeyOfKeyword &&
        node.type.typeName?.text === name) ||
      (ts.isTypeReferenceNode(node) &&
        depth < 8 &&
        (node.typeArguments ?? []).some(
          (/** @type {any} */ arg, /** @type {number} */ j) =>
            arg.typeName?.text === name &&
            readsKeys(aliasOf(node), j, depth + 1),
        )) ||
      !!ts.forEachChild(
        node,
        (/** @type {any} */ child) => visit(child) || undefined,
      );
    return !!name && visit(alias);
  };
  /** @type {(symbol: any) => any[]} an alias's type, or an interface's bases */
  const shapeOf = symbol =>
    (symbol?.declarations ?? []).flatMap((/** @type {any} */ d) =>
      ts.isTypeAliasDeclaration(d)
        ? [d.type]
        : (d.heritageClauses?.flatMap((/** @type {any} */ c) => c.types) ?? []),
    );
  // `any`, or such a type, passed where an alias reads its keys, written in
  // the props type or one of the package's names for it (`type P =
  // Without<any>`, `interface P extends Omit<Omit<any, 'as'>, 'ref'>`).
  /** @type {(node: any, depth: number) => boolean} */
  const anyKeyed = (node, depth) => {
    if (!node || depth > 8) return false;
    if (node.kind === ts.SyntaxKind.AnyKeyword) return true;
    if (ts.isParenthesizedTypeNode(node)) return anyKeyed(node.type, depth + 1);
    if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
      return node.types.some((/** @type {any} */ t) => anyKeyed(t, depth + 1));
    }
    // A reference: `Name<…>`, or an interface's `extends Name<…>`.
    if (!node.typeName && !node.expression) return false;
    const alias = aliasOf(node);
    return node.typeArguments
      ? node.typeArguments.some(
          (/** @type {any} */ arg, /** @type {number} */ i) =>
            anyKeyed(arg, depth + 1) && readsKeys(alias, i),
        )
      : shapeOf(target(node)).some(n => anyKeyed(n, depth + 1));
  };
  return parts.some(
    /** @param {any} part */ part =>
      ((part.aliasTypeArguments ?? []).some(
        /** @type {(t: any, i: number) => boolean} */ (t, i) =>
          (t.flags & ts.TypeFlags.Any
            ? !isErrorType(ts, t)
            : depth < 4 && isAnyProps(ts, checker, t, depth + 1)) &&
          readsKeys(part.aliasSymbol?.declarations?.[0], i),
      ) ||
        shapeOf(part.aliasSymbol ?? part.symbol).some(n => anyKeyed(n, 0))) &&
      (checker.getIndexInfosOfType?.(part) ?? []).some(
        /** @param {any} info */ info => info.type.flags & ts.TypeFlags.Any,
      ),
  );
}

/**
 * Is any part of a props type `any`, or built from a type the compiler could
 * not resolve (`Omit<Missing, 'x'>`, `Partial<Missing>`)? Then props it would
 * inherit are missing or unknown, and comparing would report documented
 * props as absent, or pass them unread.
 * @param {any} ts
 * @param {any} checker
 * @param {any} type
 * @param {number} depth
 * @param {Set<any>} seen types already read, so shared bases are read once
 * @returns {boolean}
 */
function hasUnresolvedPart(ts, checker, type, depth, seen) {
  if (depth > 24 || seen.has(type)) return false;
  seen.add(type);
  if (type.flags & ts.TypeFlags.Any) return true;
  // A type made from another keeps what it was made from: an alias its
  // arguments, a generic reference its type arguments.
  const made = [
    ...(type.aliasTypeArguments ?? []),
    ...(type.objectFlags & ts.ObjectFlags.Reference
      ? checker.getTypeArguments(type)
      : []),
  ];
  if (made.some(/** @param {any} t */ t => isErrorType(ts, t))) return true;
  // A mapped type over one that does not resolve keeps no arguments behind a
  // named alias (`type Base = Pick<Missing, 'title'>`): its properties have
  // the compiler's error type.
  if (
    type.objectFlags & ts.ObjectFlags.Mapped &&
    checker
      .getPropertiesOfType(type)
      .some(
        /** @param {any} p */ p => isErrorType(ts, checker.getTypeOfSymbol(p)),
      )
  ) {
    return true;
  }
  // A mapped type written over one that does not resolve
  // (`{[K in keyof Missing]?: string}`) keeps it only in its declaration.
  const constraint = type.declaration?.typeParameter?.constraint;
  const mappedOver =
    constraint && ts.isTypeOperatorNode(constraint)
      ? constraint.type
      : constraint;
  if (
    type.objectFlags & ts.ObjectFlags.Mapped &&
    mappedOver &&
    isErrorType(ts, checker.getTypeFromTypeNode(mappedOver))
  ) {
    return true;
  }
  // A type mapped over one that does not resolve (`Omit<Missing, 'x'>`,
  // `Partial<Missing>`), reached directly, through a named alias, or nested,
  // reads as index signatures whose value is that unresolved type, which no
  // source declares.
  if (
    type.flags & ts.TypeFlags.Object &&
    (checker.getIndexInfosOfType?.(type) ?? []).some(
      /** @param {any} info */ info =>
        !info.declaration && isErrorType(ts, info.type),
    )
  ) {
    return true;
  }
  if (type.isUnion() || type.isIntersection()) {
    return type.types.some(
      /** @param {any} t */ t =>
        hasUnresolvedPart(ts, checker, t, depth + 1, seen),
    );
  }
  if (type.flags & ts.TypeFlags.Object) {
    const target =
      type.objectFlags & ts.ObjectFlags.Reference ? type.target : type;
    if (target.objectFlags & ts.ObjectFlags.ClassOrInterface) {
      // An unresolved `extends` is dropped from the base types, so read the
      // heritage clauses themselves.
      for (const declaration of target.symbol?.declarations ?? []) {
        for (const clause of declaration.heritageClauses ?? []) {
          for (const node of clause.types) {
            const base = checker.getTypeAtLocation(node);
            if (hasUnresolvedPart(ts, checker, base, depth + 1, seen))
              return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Compare each documented prop table with the TypeScript props of the export
 * it describes.
 * @param {PropDriftTable[]} tables
 * @param {{packageDir: string, resolveFrom: Array<string | null | undefined>}} options
 * @returns {PropDriftReport}
 */
export function comparePropTables(tables, options) {
  const {packageDir, resolveFrom} = options;
  const compiler = resolveProjectTypeScript(resolveFrom);
  if (!compiler?.ts) {
    return {
      status: 'skipped',
      reason: compiler
        ? unusableTypeScriptReason(
            compiler.version,
            'documented props were not compared with the code',
          )
        : TYPESCRIPT_MISSING_REASON,
      components: 0,
      typesCompared: 0,
      findings: [],
      unchecked: [],
      typesNotCompared: [],
    };
  }
  const {ts, version} = compiler;
  let root = path.resolve(packageDir);
  try {
    root = fs.realpathSync(root);
  } catch {
    // Keep the resolved path.
  }
  const rel = (/** @type {string} */ file) =>
    path.relative(packageDir, file).split(path.sep).join('/');

  /** @type {PropDriftUnchecked[]} */
  const unchecked = [];
  if (tables.length === 0) {
    return {
      status: 'checked',
      typescript: version,
      components: 0,
      typesCompared: 0,
      findings: [],
      unchecked,
      typesNotCompared: [],
    };
  }

  const project = readPackageTsconfig(
    ts,
    packageDir,
    tables.flatMap(table => table.sources),
  );
  if (project.error) {
    // Read without the package's own config, the types would be guesses.
    for (const table of tables) {
      unchecked.push({
        component: table.name,
        doc: table.doc,
        reason: `the package's TypeScript config has an error, so props were not read (${project.error})`,
      });
    }
    unchecked.sort((a, b) => a.component.localeCompare(b.component));
    return {
      status: 'checked',
      typescript: version,
      components: 0,
      typesCompared: 0,
      findings: [],
      unchecked,
      typesNotCompared: [],
    };
  }
  const program = ts.createProgram({
    rootNames: [
      ...new Set([
        ...tables.flatMap(table => table.sources),
        ...project.declarations,
      ]),
    ],
    options: project.options,
  });
  const checker = program.getTypeChecker();
  const isOwnFile = ownFileTest(root);
  const ambient = unresolvedGlobals(
    ts,
    program,
    checker,
    project.declarations,
    project.options,
    isOwnFile,
  );
  // Without strict null checks the compiler drops `null` and `undefined`.
  // Whether they are on by default depends on the TypeScript version.
  const compilerOptions = program.getCompilerOptions();
  const nullable = !(typeof ts.getStrictOptionValue === 'function'
    ? ts.getStrictOptionValue(compilerOptions, 'strictNullChecks')
    : (compilerOptions.strictNullChecks ?? compilerOptions.strict ?? false));
  const reading = {
    nullable,
    // An optional prop takes `undefined` only when the project lets it.
    exactOptional:
      !nullable && compilerOptions.exactOptionalPropertyTypes === true,
    isDefaultLibrary: (/** @type {any} */ file) =>
      program.isSourceFileDefaultLibrary(file),
  };

  /** @type {PropDriftFinding[]} */
  const findings = [];
  /** @type {Array<PropDriftUnchecked & {props: string[]}>} */
  const propsNotChecked = [];
  let compared = 0;
  let typesCompared = 0;
  /** @type {PropDriftTypesNotCompared[]} */
  const typesNotCompared = [];
  const typesSkipped = typeTextTooOld(ts);
  for (const table of tables) {
    /** @type {ReturnType<typeof readCodeProps> | null} */
    let read = null;
    let sourcePath = table.sources[0];
    for (const candidate of table.sources) {
      const attempt = readCodeProps(
        ts,
        program,
        checker,
        candidate,
        table.name,
        isOwnFile,
        ambient,
      );
      if (attempt.ok || read == null) {
        read = attempt;
        sourcePath = candidate;
      }
      if (attempt.ok) break;
    }
    if (read == null || !read.ok) {
      unchecked.push({
        component: table.name,
        doc: table.doc,
        reason:
          read != null && !read.ok
            ? read.reason
            : `no source file for ${table.name}`,
      });
      continue;
    }
    compared++;
    const source = rel(sourcePath);
    const documented = new Set();
    /** @type {Map<string, Set<string>>} */
    const notCompared = new Map();
    /** @type {(reason: string, name: string) => void} */
    const skip = (reason, name) => {
      notCompared.set(reason, (notCompared.get(reason) ?? new Set()).add(name));
    };
    for (const raw of table.props) {
      if (!raw || typeof raw.name !== 'string') continue;
      const entries = documentedProps(raw);
      for (const entry of entries) {
        const propName = entry.name;
        if (entry.spread) continue;
        const docType = entry.type;
        if (typesSkipped) entry.type = undefined;
        documented.add(propName);
        const code = read.props.get(propName);
        const reached =
          code && entry.path.length > 0
            ? fieldTypes(ts, checker, code, entry.path)
            : null;
        if (
          entry.type === undefined &&
          !typesSkipped &&
          typeof raw.type === 'string' &&
          (code && entry.path.length > 0
            ? reached
            : code || read.accepts(propName).length > 0)
        ) {
          // `a / b` with one type that does not split across the names (a
          // field only once it is found).
          skip(
            code && !code.own ? outside(propName, code) : NOT_EXACT,
            entry.written,
          );
        }
        const base = {
          component: table.name,
          prop: entry.written,
          severity: /** @type {const} */ ('warning'),
          doc: table.doc,
          source,
        };
        if (entry.path.length > 0) {
          // Listed only once the field is found; a missing one is reported.
          if (code && !code.own && reached && typeof entry.type === 'string') {
            skip(outside(propName, code), entry.written);
          }
          if (reached === 'any') {
            // A field of an `any` or `unknown` prop has no type to judge.
            if (code?.own && typeof entry.type === 'string') {
              skip(NOT_EXACT, entry.written);
            }
            continue;
          }
          if (code && reached) {
            const fieldText = fieldTypeText(
              ts,
              checker,
              reached,
              reading.exactOptional,
              code.location,
            );
            const ctx = {
              ts,
              checker,
              location: code.location,
              // A name an index signature takes sets the index's
              // `undefined` aside, as a prop of that name does.
              optional:
                reached.optional && (!reading.exactOptional || reached.indexed),
              ...reading,
              written: [fieldText],
            };
            const verdict =
              code.own && typeof entry.type === 'string'
                ? reached.ambiguous
                  ? 'not_compared'
                  : judgeType(entry.type, reached.types, ctx)
                : null;
            // The field takes every variant's type: the types of only some
            // variants are neither its type nor wrong. Past six, the sets of
            // them are not tried, and the type is never reported.
            const variants = [...new Set(reached.types)];
            const someVariants =
              (verdict === 'mismatch' || verdict === 'not_compared') &&
              !reached.ambiguous &&
              variants.length > 1 &&
              (variants.length > 6 ||
                Array.from({length: 2 ** variants.length - 2}, (_, i) =>
                  variants.filter((__, j) => ((i + 1) >> j) & 1),
                ).some(
                  some => judgeType(entry.type ?? '', some, ctx) === 'match',
                ));
            if (someVariants) skip(VARIANTS, entry.written);
            else if (verdict === 'not_compared') skip(NOT_EXACT, entry.written);
            else if (verdict) typesCompared++;
            if (verdict === 'mismatch' && !someVariants) {
              const codeType = fieldText.join(' | ');
              findings.push({
                ...base,
                kind: 'type_mismatch',
                message: `"${entry.written}" is documented as ${entry.type}, but the code declares ${codeType}.`,
                docType: entry.type,
                codeType,
              });
            }
            continue;
          }
          if (!code && read.accepts(propName).length > 0) {
            // A field of a name only an index signature takes.
            if (typeof entry.type === 'string') skip(NOT_EXACT, entry.written);
            continue;
          }
          findings.push({
            ...base,
            kind: 'not_in_code',
            message: code
              ? `"${entry.written}" is documented, but ${table.name}'s "${propName}" has no "${entry.path.join('.')}".`
              : `"${entry.written}" is documented, but ${table.name}'s props have no "${propName}".`,
          });
          continue;
        }
        if (!code) {
          // A name an index signature takes is a prop of the index's type;
          // TypeScript holds it to every signature that takes it, so with
          // several its type is not compared. Another package's signature is
          // not the package's to judge, and a mapped type's (`Record`) has no
          // declaration to say whose it is.
          const indexes = read.accepts(propName);
          const own = indexes.filter(
            (/** @type {any} */ i) =>
              i.declaration &&
              isOwnFile(i.declaration.getSourceFile().fileName),
          );
          const index = indexes.length === 1 ? own[0] : null;
          if (indexes.length > 0 && !index && typeof entry.type === 'string') {
            const declared = indexes.every(
              (/** @type {any} */ i) => i.declaration,
            );
            skip(
              own.length || !declared ? NOT_EXACT : outside(propName),
              propName,
            );
          }
          if (index && typeof entry.type === 'string') {
            const verdict = judgeType(entry.type, [index.type], {
              ts,
              checker,
              location: index.declaration,
              // An index signature takes `undefined` only when its type does.
              optional: takesUndefined(ts, index.type),
              ...reading,
              // Printed where the index is declared, as the doc's names
              // resolve there.
              written: [
                [
                  checker.typeToString(
                    index.type,
                    index.declaration,
                    ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType,
                  ),
                ],
              ],
            });
            if (verdict === 'not_compared') skip(NOT_EXACT, propName);
            else typesCompared++;
            if (verdict === 'mismatch') {
              const codeType = checker.typeToString(
                index.type,
                index.declaration,
                ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType,
              );
              findings.push({
                ...base,
                kind: 'type_mismatch',
                message: `"${propName}" is documented as ${entry.type}, but ${table.name}'s props take it as ${codeType}.`,
                docType: entry.type,
                codeType,
              });
            }
          }
          if (indexes.length > 0) continue;
          findings.push({
            ...base,
            kind: 'not_in_code',
            message: `"${propName}" is documented, but ${table.name}'s props have no "${propName}".`,
            ...(typeof docType === 'string' ? {docType} : {}),
          });
          continue;
        }
        const docRequired = entry.required === true;
        if (docRequired !== code.required) {
          findings.push({
            ...base,
            kind: 'required_mismatch',
            message: code.required
              ? `"${propName}" is required in the code, but the doc does not mark it required.`
              : `"${propName}" is documented as required, but it is optional in the code.`,
            docRequired,
            codeRequired: code.required,
          });
        }
        // A literal default the code writes in its props destructuring and a
        // literal the doc writes must agree; where both write a default and
        // either is not a literal, the default is listed as not compared.
        const codeDefault = read.defaults?.get(propName);
        const docWrites =
          entries.length === 1 &&
          raw.default !== undefined &&
          raw.default !== '';
        const docDefault = docWrites
          ? documentedDefault(raw.default)
          : undefined;
        if (codeDefault !== undefined && docWrites) {
          if (codeDefault === NOT_LITERAL) {
            skip(CODE_DEFAULT_NOT_LITERAL, propName);
          } else if (docDefault === undefined) {
            skip(DOC_DEFAULT_NOT_LITERAL, propName);
          }
        }
        if (
          codeDefault !== undefined &&
          codeDefault !== NOT_LITERAL &&
          docDefault !== undefined &&
          codeDefault !== docDefault
        ) {
          const shown = defaultText(
            /** @type {string | number | boolean | null} */ (codeDefault),
          );
          findings.push({
            ...base,
            kind: 'default_mismatch',
            message: `"${propName}" is documented with default ${String(raw.default).trim()}, but the code defaults it to ${shown}.`,
            fix: `In ${table.doc}, set the "${propName}" prop's default to the code's: default: ${JSON.stringify(shown)}.`,
            docDefault: String(raw.default),
            codeDefault: shown,
          });
        }
        if (!code.own && typeof entry.type === 'string') {
          skip(outside(propName, code), propName);
        }
        if (code.own && typeof entry.type === 'string') {
          const verdict = judgeProp(
            ts,
            checker,
            String(entry.type),
            code,
            reading,
          );
          if (verdict === 'not_compared') skip(NOT_EXACT, propName);
          else typesCompared++;
          if (verdict === 'mismatch') {
            const keep = ownUndefined(checker, code, reading.exactOptional);
            const codeType = codeTypeText(code, keep);
            const expanded = rendered(code, 1, keep);
            // The optional prop's `undefined` the expansion sets aside is no
            // difference to show.
            const bare = codeType
              .split(' | ')
              .filter(part => part !== 'undefined')
              .join(' | ');
            const shown =
              expanded && expanded !== codeType && expanded !== bare
                ? `${codeType} (${expanded.length <= 400 ? expanded : `${expanded.slice(0, 400)}…`})`
                : codeType;
            findings.push({
              ...base,
              kind: 'type_mismatch',
              message: `"${propName}" is documented as ${entry.type}, but the code declares ${shown}.`,
              docType: entry.type,
              codeType,
            });
          }
        }
      }
    }
    /** @type {string[]} */
    const untraced = [];
    for (const code of read.props.values()) {
      if (
        documented.has(code.name) ||
        code.skipTagged ||
        PROPS_NOT_DOCUMENTED.includes(code.name)
      ) {
        continue;
      }
      if (!code.own) {
        if (code.untraced) untraced.push(code.name);
        continue;
      }
      const codeType = codeTypeText(
        code,
        ownUndefined(checker, code, reading.exactOptional),
      );
      findings.push({
        component: table.name,
        prop: code.name,
        kind: 'not_in_doc',
        severity: 'warning',
        message: `${table.name} declares "${code.name}", but the doc does not list it.`,
        doc: table.doc,
        source,
        codeType,
        codeRequired: code.required,
      });
    }
    if (untraced.length > 0) {
      propsNotChecked.push({
        component: table.name,
        doc: table.doc,
        reason: `a mapped type builds them from keys the check can't trace to the package's source, so it did not check that the doc lists them`,
        props: untraced.sort(),
      });
    }
    for (const [reason, props] of notCompared) {
      typesNotCompared.push({
        component: table.name,
        doc: table.doc,
        reason,
        props: [...props].sort(),
      });
    }
  }

  // Field by field: collation ignores a separator such as NUL, which would
  // sort one component's findings among another's that shares its prefix.
  findings.sort(
    (a, b) =>
      a.component.localeCompare(b.component) ||
      a.prop.localeCompare(b.prop) ||
      a.kind.localeCompare(b.kind),
  );
  unchecked.sort((a, b) => a.component.localeCompare(b.component));
  typesNotCompared.sort(
    (a, b) =>
      a.component.localeCompare(b.component) ||
      a.reason.localeCompare(b.reason),
  );
  return {
    status: 'checked',
    typescript: version,
    components: compared,
    typesCompared,
    findings,
    unchecked,
    typesNotCompared,
    ...(typesSkipped ? {typesSkipped} : {}),
    ...(propsNotChecked.length > 0 ? {propsNotChecked} : {}),
  };
}

/**
 * The prop tables one doc file documents, each with the export it describes.
 * A multi-component doc names each entry's export; an entry without `props`
 * (a reference to a sibling doc) and a hook entry are not prop tables.
 * @param {any} doc
 * @param {PropDriftComponent} component
 * @returns {Array<{name: string, props: any[]}>}
 */
function propTables(doc, component) {
  if (!doc || typeof doc !== 'object') return [];
  /** @type {Array<{name: string, props: any[]}>} */
  const tables = [];
  // A doc's own props document the export its `name` names, which can be
  // another file's export than the one its file is named after.
  const own = ownName(doc, component);
  if (Array.isArray(doc.props) && !HOOK_NAME.test(own)) {
    tables.push({name: own, props: doc.props});
  }
  if (Array.isArray(doc.components)) {
    for (const entry of doc.components) {
      if (
        entry &&
        typeof entry.name === 'string' &&
        Array.isArray(entry.props) &&
        !(Array.isArray(doc.props) && entry.name === own) &&
        !HOOK_NAME.test(entry.name)
      ) {
        tables.push({name: entry.name, props: entry.props});
      }
    }
  }
  return tables;
}

/**
 * The export a doc's own props document: its `name`, else its record's.
 * @param {any} doc
 * @param {PropDriftComponent} component
 */
function ownName(doc, component) {
  return typeof doc.name === 'string' && doc.name !== ''
    ? doc.name
    : component.name;
}

/**
 * The stem of a `<stem>.doc.{ts,mjs,js}` file: the name of the record that
 * owns the doc.
 * @param {string} docPath
 */
function docStem(docPath) {
  return path.basename(docPath).replace(/\.doc\.(ts|mjs|js)$/, '');
}

/**
 * Where an entry's export lives: `<entry>.tsx` beside the doc, else the doc's
 * own same-stem source, else the directory's `index.ts`/`index.tsx`, else the
 * `.tsx` in the doc's folder that declares it, as discovery finds a member's.
 * @param {string} name
 * @param {PropDriftComponent} component
 * @returns {string[]} candidates, in order
 */
function sourcesForEntry(name, component) {
  const own = component.sourcePath ? [component.sourcePath] : [];
  if (name === component.name) return own;
  const dir = path.dirname(component.docPath);
  return [
    path.join(dir, `${name}.tsx`),
    ...own,
    path.join(dir, 'index.ts'),
    path.join(dir, 'index.tsx'),
    folderSourceFor(dir, name),
  ].filter(
    /** @type {(file: string | null, i: number, all: Array<string | null>) => file is string} */ (
      (file, i, all) =>
        file != null && all.indexOf(file) === i && fs.existsSync(file)
    ),
  );
}

/**
 * Compare documented props with each component's TypeScript props: find each
 * doc's prop tables, then compare them (`comparePropTables`).
 * @param {PropDriftComponent[]} components
 * @param {{packageDir: string, resolveFrom: Array<string | null | undefined>, loadDoc?: (docPath: string) => Promise<any>}} options
 * @returns {Promise<PropDriftReport>}
 */
export async function comparePropDocs(components, options) {
  const {packageDir, resolveFrom, loadDoc = loadComponentDoc} = options;
  const rel = (/** @type {string} */ file) =>
    path.relative(packageDir, file).split(path.sep).join('/');

  /** @type {PropDriftTable[]} */
  const tables = [];
  /** @type {PropDriftUnchecked[]} */
  const unchecked = [];
  const seen = new Set();
  // A family doc can stand behind several records: its own, named after the
  // doc, and one per member entry that discovery records as a component of
  // its own. A member record compares only its own entry, against its own
  // source; the family record leaves those entries to the members.
  /** @type {Map<string, Set<string>>} */
  const namesByDoc = new Map();
  for (const component of components) {
    const names = namesByDoc.get(component.docPath) ?? new Set();
    names.add(component.name);
    namesByDoc.set(component.docPath, names);
  }
  /** @type {Map<string, Promise<any>>} */
  const docs = new Map();
  /** @type {Set<string>} docs whose own record is here */
  const owned = new Set();
  // Its own props, and every entry no member record compares: a hidden one,
  // or one discovery doesn't record. One whose source isn't found is listed
  // as not compared.
  const compareOwn = (
    /** @type {PropDriftComponent} */ component,
    /** @type {any} */ doc,
  ) => {
    const members = namesByDoc.get(component.docPath) ?? new Set();
    for (const table of propTables(doc, component)) {
      if (table.name !== component.name && members.has(table.name)) continue;
      const sources = sourcesForEntry(table.name, component);
      // One table per doc: two docs that each document a component both
      // get compared.
      const key = `${component.docPath}\0${sources[0]}\0${table.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tables.push({doc: rel(component.docPath), ...table, sources});
    }
  };
  for (const component of components) {
    let doc;
    try {
      let loading = docs.get(component.docPath);
      if (!loading) {
        loading = Promise.resolve(loadDoc(component.docPath));
        docs.set(component.docPath, loading);
      }
      doc = await loading;
    } catch (err) {
      unchecked.push({
        component: component.name,
        doc: rel(component.docPath),
        reason: `its doc does not load: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    // The doc's own record is named after its file, or after the export its
    // `name` names; any other record is a family member's.
    const ownRecord =
      component.name === docStem(component.docPath) ||
      (doc != null &&
        typeof doc === 'object' &&
        ownName(doc, component) === component.name);
    if (!ownRecord) {
      // A family member compares its own entry.
      const entry = Array.isArray(doc?.components)
        ? doc.components.find(
            (/** @type {any} */ candidate) =>
              candidate?.name === component.name &&
              Array.isArray(candidate.props),
          )
        : undefined;
      if (!entry || HOOK_NAME.test(component.name)) continue;
      const key = `${component.docPath}\0${component.sourcePath}\0${component.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tables.push({
        doc: rel(component.docPath),
        name: component.name,
        props: entry.props,
        sources: component.sourcePath ? [component.sourcePath] : [],
      });
      continue;
    }
    owned.add(component.docPath);
    compareOwn(component, doc);
  }
  // A family doc whose own record is missing, because its same-stem source
  // is, still has its own props and unrecorded entries compared or listed.
  for (const [docPath, loading] of docs) {
    if (owned.has(docPath)) continue;
    const doc = await loading.catch(() => null);
    if (doc == null || typeof doc !== 'object') continue;
    compareOwn({name: docStem(docPath), docPath, sourcePath: null}, doc);
  }
  const report = comparePropTables(tables, {packageDir, resolveFrom});
  if (report.status === 'skipped') return report;
  return {
    ...report,
    unchecked: [...unchecked, ...report.unchecked].sort((a, b) =>
      a.component.localeCompare(b.component),
    ),
  };
}
