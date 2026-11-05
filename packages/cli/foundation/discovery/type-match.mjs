// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Judge a documented prop type against the type the code declares,
 * only where both sides can be judged exactly.
 *
 * A documented type matches when its text equals the type as the source
 * writes it (or as the compiler prints it) once type-text.mjs normalizes
 * both, unless a `React.X` on either side names another type than a bare `X`
 * does where the prop is declared (`React.KeyboardEvent` beside the DOM's
 * `KeyboardEvent`, or a file's own `Key`); text that writes `readonly` matches only exactly as written,
 * whitespace aside. Otherwise both sides are judged only when each is built from exact
 * parts: the primitives `string`, `number`, `boolean`, `bigint`, `symbol`,
 * `null`, `undefined`, `void` and `object`; string, number and boolean
 * literals; string enum members (each of its own enum: another enum's member
 * of the same value is another type, and a member beside the literal of its
 * own value adds nothing, as TypeScript passes a member where that literal is
 * taken); arrays of these (`T[]`, `Array<T>`,
 * `ReadonlyArray<T>`); unions of these; and a name that resolves to one of
 * these where the prop is declared (not one only TypeScript's own libraries
 * declare, which the code may not mean; `React.X` resolves through `React`
 * there, as the code would read it). The two sides must then hold the same
 * parts, in any order, as TypeScript reduces a union at any depth (a literal
 * beside its primitive is absorbed by it), with `undefined` set aside on an
 * optional prop, and `null` and `undefined` dropped at any depth when the
 * project has no strict null checks.
 *
 * Every other form is not compared, and never reported as a mismatch: a
 * callback, an object, a tuple, a generic with arguments, `keyof`, an
 * intersection, a mapped or conditional type, `any` or `unknown`, a numeric
 * enum, two enums of one name (TypeScript relates them by their members, by
 * rules its versions differ on), and a type that does not resolve.
 *
 * @input A documented type string, the prop's types, and the compiler.
 * @output 'match', 'mismatch' or 'not_compared'.
 * @position Used by the prop-drift comparison (prop-drift.mjs).
 */

import {normalizeTypeText, UNPARSED} from './type-text.mjs';

/** @typedef {'match' | 'mismatch' | 'not_compared'} TypeVerdict */

/**
 * @typedef {object} JudgeContext
 * @property {any} ts
 * @property {any} checker
 * @property {any} location where names in the documented type resolve (the
 *   prop's declaration, else the component's source file)
 * @property {boolean} optional the prop is optional, so `undefined` is set
 *   aside on both sides
 * @property {(file: any) => boolean} [isDefaultLibrary] whether a source
 *   file is one of TypeScript's own libraries
 * @property {boolean} [nullable] the project checks without strict null
 *   checks, so the compiler drops `null` and `undefined` from every type and
 *   both are set aside on both sides
 * @property {boolean} [exactOptional] the project sets
 *   `exactOptionalPropertyTypes`: an optional prop takes `undefined` only when
 *   its type says so, and the compiler's mark for an absent prop is not a
 *   type the prop takes
 * @property {string[][]} written the code's type as the source writes it and
 *   as the compiler prints it, each a list of union members
 */

const MAX_DEPTH = 6;

/**
 * A string literal as one part: quoted, with quotes and backslashes escaped,
 * so no text inside it reads as other parts (`"a'|'b"` is one literal).
 * @param {string} value
 */
const literalPart = value =>
  `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * Text as part of an enum part: each character but a word character as its
 * code point (`%41;`), so no text reads as a separator and no string, an
 * unpaired surrogate included, fails to encode.
 * @param {string} text
 */
const encodePart = text =>
  [...text]
    .map(c =>
      /[\w-]/.test(c) ? c : `%${(c.codePointAt(0) ?? 0).toString(16)};`,
    )
    .join('');

/** @param {string} text */
const decodePart = text =>
  text.replace(/%([0-9a-f]+);/g, (_, hex) =>
    String.fromCodePoint(parseInt(hex, 16)),
  );

/** Type keywords, which never name an alias. */
const KEYWORD_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'bigint',
  'symbol',
  'object',
  'any',
  'unknown',
  'never',
  'void',
  'undefined',
  'null',
  'true',
  'false',
]);

/**
 * Judge a documented type. A doc may name an alias and spell out what it
 * stands for, as `Name = expansion` or `Name (expansion)` (text that is not a
 * type by itself): both parts are judged, and a mismatch in either is one;
 * with one value after it (`Size = 'md'`, `Size = Size.Md`), or after a
 * keyword, that part may be a default, and only the name is judged.
 * @param {string} docType
 * @param {any[]} codeTypes the prop's type in each member of the props type
 * @param {JudgeContext} ctx
 * @returns {TypeVerdict}
 */
export function judgeType(docType, codeTypes, ctx) {
  const notation = parseType(ctx.ts, docType)
    ? null
    : (/^\s*([A-Za-z_$][\w$.]*)\s*=(?!>)\s*([\s\S]+)$/.exec(docType) ??
      /^\s*([A-Za-z_$][\w$.]*)\s*\(([\s\S]+)\)\s*$/.exec(docType));
  /** @type {string[]} */
  let texts = [docType];
  if (notation) {
    const [, name, rest] = notation;
    const restNode = parseType(ctx.ts, rest);
    if (!restNode) return 'not_compared'; // prose, not a type or a default
    // After a type keyword, or as one value (`'md'`, `Size.Md`), the second
    // part may be the prop's default, not an alias's expansion: only the
    // type is judged.
    const isDefault =
      KEYWORD_TYPES.has(name) ||
      (restNode != null && isValue(ctx.ts, restNode));
    texts = isDefault ? [name] : [name, rest];
  }
  const verdicts = texts.map(text => judgeOne(text, codeTypes, ctx));
  if (verdicts.includes('mismatch')) return 'mismatch';
  return verdicts.every(verdict => verdict === 'match')
    ? 'match'
    : 'not_compared';
}

/** A string literal, kept as written, or a run of whitespace. */
const QUOTED_OR_SPACE =
  /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\s+/g;

/**
 * A type's text without whitespace outside string literals, but for one space
 * between two words.
 * @param {string} text
 */
function asWritten(text) {
  return text
    .trim()
    .replace(QUOTED_OR_SPACE, (match, offset, whole) =>
      !/^\s/.test(match)
        ? match
        : /[\w$]/.test(whole[offset - 1] ?? '') &&
            /[\w$]/.test(whole[offset + match.length] ?? '')
          ? ' '
          : '',
    );
}

/**
 * @param {string} docType
 * @param {any[]} codeTypes
 * @param {JudgeContext} ctx
 * @returns {TypeVerdict}
 */
function judgeOne(docType, codeTypes, ctx) {
  const {optional} = ctx;
  const doc = normalizeTypeText(docType, {optional, ts: ctx.ts}).join('|');
  // Text that does not parse is never a match.
  if (doc.startsWith(UNPARSED)) return 'not_compared';
  // The text match sets `readonly` aside, so text that writes `readonly`
  // matches only as written: the same text, whitespace aside, with
  // `readonly` kept on both sides. Any other goes to the parts below.
  // Outside string literals: `'readonly'` is a word, not the modifier.
  const readonly = (/** @type {string} */ text) =>
    /\breadonly\b(?!\s*[:?])|\bReadonly(?:Array)?\s*</.test(
      text.replace(QUOTED_OR_SPACE, part => (/^\s/.test(part) ? part : "''")),
    );
  const docReadonly = readonly(docType);
  const sameText = ctx.written.some(
    texts =>
      (docReadonly || texts.some(readonly)
        ? texts.length === 1 && asWritten(texts[0]) === asWritten(docType)
        : texts.length > 0 &&
          [
            ...new Set(
              texts.flatMap(text =>
                normalizeTypeText(text, {optional, ts: ctx.ts}),
              ),
            ),
          ]
            .sort()
            .join('|') === doc) && !reactNameDiffers(ctx, docType, texts),
  );
  if (sameText) return 'match';
  const node = parseType(ctx.ts, docType);
  const docParts = node ? docAtoms(ctx, node, 0) : null;
  const codeParts = codeAtoms(ctx, codeTypes, 0);
  if (!docParts || !codeParts) return 'not_compared';
  // `readonly` set aside, outside string literals.
  const mutable = (/** @type {string[]} */ atoms) =>
    reduced(
      ctx,
      atoms.map(atom =>
        atom.replace(/'(?:\\.|[^'\\])*'|readonly\[/g, part =>
          part === 'readonly[' ? '[' : part,
        ),
      ),
      true,
    );
  const doc_ = reduced(ctx, docParts, true);
  const code = reduced(ctx, codeParts, true);
  // A doc that names a mutable array where the code takes a readonly one
  // matches, as TypeScript passes it.
  if (doc_ === code || doc_ === mutable(codeParts)) return 'match';
  // Two enums of one name are not judged (see the file's comment).
  const owners = new Set(
    [...docParts, ...codeParts].join('|').match(/enum:[^#|\]]*#[^#|\]]*/g),
  );
  const names = [...owners].map(owner => owner.split('#')[0]);
  if (new Set(names).size < names.length) return 'not_compared';
  if (mutable(docParts) !== mutable(codeParts)) return 'mismatch';
  // Only `readonly` differs: a readonly doc for mutable code is wrong; a
  // nested mix is not placed.
  return code === mutable(codeParts) ? 'mismatch' : 'not_compared';
}

/**
 * A union's exact parts, as TypeScript reduces them, at any depth: a literal
 * beside its primitive is absorbed by it (`IconName | string` is `string`),
 * and `null` and `undefined` are dropped without strict null checks, as the
 * compiler drops them. On an optional prop `undefined` is set aside too, as
 * the prop takes it anyway.
 * @param {JudgeContext} ctx
 * @param {string[]} atoms
 * @param {boolean} top the prop's own type, not an array element
 * @returns {string}
 */
function reduced(ctx, atoms, top) {
  const kept = new Set(
    atoms.filter(
      atom =>
        !(atom === 'undefined' && ((top && ctx.optional) || ctx.nullable)) &&
        !(atom === 'null' && ctx.nullable),
    ),
  );
  if (kept.has('string')) {
    for (const atom of [...kept]) {
      if (atom.startsWith("'") || atom.startsWith('enum:')) kept.delete(atom);
    }
  }
  for (const atom of [...kept]) {
    const value = atom.startsWith('enum:')
      ? decodePart(atom.slice(atom.lastIndexOf('#') + 1))
      : null;
    if (value != null && kept.has(literalPart(value))) kept.delete(atom);
  }
  if (kept.has('number')) {
    for (const atom of [...kept]) {
      if (/^-?\d/.test(atom) || /^(?:NaN|-?Infinity)$/.test(atom)) {
        kept.delete(atom);
      }
    }
  }
  // A member another covers adds nothing, as TypeScript passes it there:
  // `undefined` beside `void`, an array beside `object`, and an array whose
  // element types another array (readonly, or as mutable) also takes.
  if (kept.has('void')) kept.delete('undefined');
  for (const atom of [...kept]) {
    if (
      isArrayPart(atom) &&
      (kept.has('object') ||
        [...kept].some(other => other !== atom && arrayCovers(other, atom)))
    ) {
      kept.delete(atom);
    }
  }
  return [...kept].sort().join('|');
}

/** @param {string} atom */
const isArrayPart = atom => /^(?:readonly)?\[/.test(atom);

/**
 * The parts of a reduced union's text, split at the top level, outside
 * string literals and arrays.
 * @param {string} text
 * @returns {string[]}
 */
function unionParts(text) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '\\') i++;
      else if (c === "'") quoted = false;
    } else if (c === "'") quoted = true;
    else if (c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === '|' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.filter(Boolean);
}

/**
 * Does array part `wide` take every value of array part `narrow`: readonly,
 * or both mutable, with each of `narrow`'s element types one of `wide`'s or
 * covered by one?
 * @param {string} wide
 * @param {string} narrow
 * @returns {boolean}
 */
function arrayCovers(wide, narrow) {
  if (!isArrayPart(wide) || !isArrayPart(narrow)) return false;
  const readonly = (/** @type {string} */ part) => part.startsWith('readonly');
  if (readonly(narrow) && !readonly(wide)) return false;
  const inner = (/** @type {string} */ part) =>
    unionParts(part.slice(part.indexOf('[') + 1, -1));
  const taken = inner(wide);
  return inner(narrow).every(
    part =>
      taken.includes(part) ||
      (taken.includes('string') &&
        (part.startsWith("'") || part.startsWith('enum:'))) ||
      (taken.includes('number') && /^(?:-?\d|NaN$|-?Infinity$)/.test(part)) ||
      (part === 'undefined' && taken.includes('void')) ||
      (isArrayPart(part) &&
        (taken.includes('object') ||
          taken.some(other => arrayCovers(other, part)))),
  );
}

/**
 * Is a type node one value a default could be: a literal (`'md'`, `0`,
 * `false`, `null`), or a name with no type arguments (`Size.Md`)?
 * @param {any} ts
 * @param {any} node
 * @returns {boolean}
 */
function isValue(ts, node) {
  if (ts.isParenthesizedTypeNode(node)) return isValue(ts, node.type);
  return (
    ts.isLiteralTypeNode(node) ||
    node.kind === ts.SyntaxKind.UndefinedKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isTypeReferenceNode(node) && !node.typeArguments?.length)
  );
}

/**
 * Parse a type expression with the project's TypeScript.
 * @param {any} ts
 * @param {string} text
 * @returns {any | null} the type node, or null when the text is not a type
 */
function parseType(ts, text) {
  const source = ts.createSourceFile(
    '__documented_type__.ts',
    `type __Documented = ${text};`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const [statement, ...rest] = source.statements;
  if (
    (source.parseDiagnostics?.length ?? 0) > 0 ||
    rest.length > 0 ||
    !statement ||
    !ts.isTypeAliasDeclaration(statement) ||
    statement.type.end !== source.text.length - 1
  ) {
    return null;
  }
  return statement.type;
}

/**
 * The exact parts of a documented type, or null when it has a part that is
 * not exact.
 * @param {JudgeContext} ctx
 * @param {any} node
 * @param {number} depth
 * @returns {string[] | null}
 */
function docAtoms(ctx, node, depth) {
  const {ts} = ctx;
  const SyntaxKind = ts.SyntaxKind;
  if (depth > MAX_DEPTH) return null;
  if (ts.isParenthesizedTypeNode(node)) return docAtoms(ctx, node.type, depth);
  if (ts.isUnionTypeNode(node)) {
    const parts = node.types.map(
      /** @param {any} t */ t => docAtoms(ctx, t, depth + 1),
    );
    return parts.every(Boolean) ? parts.flat() : null;
  }
  /** @type {Record<number, string[]>} */
  const keywords = {
    [SyntaxKind.StringKeyword]: ['string'],
    [SyntaxKind.NumberKeyword]: ['number'],
    [SyntaxKind.BooleanKeyword]: ['false', 'true'],
    [SyntaxKind.BigIntKeyword]: ['bigint'],
    [SyntaxKind.SymbolKeyword]: ['symbol'],
    [SyntaxKind.UndefinedKeyword]: ['undefined'],
    [SyntaxKind.VoidKeyword]: ['void'],
    [SyntaxKind.ObjectKeyword]: ['object'],
    [SyntaxKind.NullKeyword]: ['null'],
    [SyntaxKind.NeverKeyword]: [],
  };
  if (keywords[node.kind]) return keywords[node.kind];
  if (ts.isLiteralTypeNode(node)) {
    const literal = node.literal;
    if (
      ts.isStringLiteral(literal) ||
      ts.isNoSubstitutionTemplateLiteral(literal)
    )
      return [literalPart(literal.text)];
    if (ts.isNumericLiteral(literal)) return [String(Number(literal.text))];
    if (
      ts.isPrefixUnaryExpression(literal) &&
      literal.operator === SyntaxKind.MinusToken &&
      ts.isNumericLiteral(literal.operand)
    ) {
      return [String(-Number(literal.operand.text))];
    }
    if (literal.kind === SyntaxKind.TrueKeyword) return ['true'];
    if (literal.kind === SyntaxKind.FalseKeyword) return ['false'];
    if (literal.kind === SyntaxKind.NullKeyword) return ['null'];
    return null;
  }
  // A readonly array is its own type: TypeScript does not pass one where a
  // mutable array is taken.
  const array = (/** @type {any} */ element, readonly = false) => {
    const parts = docAtoms(ctx, element, depth + 1);
    return parts
      ? [`${readonly ? 'readonly' : ''}[${reduced(ctx, parts, false)}]`]
      : null;
  };
  if (ts.isArrayTypeNode(node)) return array(node.elementType);
  if (
    ts.isTypeOperatorNode(node) &&
    node.operator === SyntaxKind.ReadonlyKeyword &&
    ts.isArrayTypeNode(node.type)
  ) {
    return array(node.type.elementType, true);
  }
  if (ts.isTypeReferenceNode(node)) {
    const name = referenceName(ts, node.typeName);
    const args = node.typeArguments ?? [];
    if ((name === 'Array' || name === 'ReadonlyArray') && args.length === 1)
      return array(args[0], name === 'ReadonlyArray');
    if (args.length > 0) return null;
    const named = resolveName(ctx, name);
    return named ? codeAtoms(ctx, [named], depth + 1) : null;
  }
  return null;
}

/**
 * The exact parts of the code's type, or null when it has a part that is not
 * exact.
 * @param {JudgeContext} ctx
 * @param {any[]} types
 * @param {number} depth
 * @returns {string[] | null}
 */
function codeAtoms(ctx, types, depth) {
  const {ts, checker} = ctx;
  const F = ts.TypeFlags;
  if (depth > MAX_DEPTH) return null;
  /** @type {string[]} */
  const out = [];
  for (const type of types) {
    for (const t of type.isUnion() ? type.types : [type]) {
      if (t.flags & F.EnumLiteral) {
        // A string enum member is exact, and only its own enum's: TypeScript
        // takes no other enum's member of the same value. A numeric enum also
        // takes numbers.
        const decl = t.symbol?.valueDeclaration;
        const owner = decl && checker.getSymbolAtLocation(decl.parent.name);
        if (!(t.flags & F.StringLiteral) || !owner) return null;
        out.push(
          `enum:${owner.name}#${encodePart(checker.getFullyQualifiedName(owner))}#${encodePart(t.value)}`,
        );
      } else if (t.flags & F.StringLiteral) out.push(literalPart(t.value));
      else if (t.flags & F.NumberLiteral) out.push(String(t.value));
      else if (t.flags & F.BooleanLiteral) out.push(t.intrinsicName);
      else if (t.flags & F.String) out.push('string');
      else if (t.flags & F.Number) out.push('number');
      else if (t.flags & F.BigInt) out.push('bigint');
      else if (t.flags & F.ESSymbol) out.push('symbol');
      else if (t.flags & F.Null) out.push('null');
      else if (t.flags & F.Undefined) {
        // `exactOptionalPropertyTypes` marks an optional prop with its own
        // `undefined`, which `prop={undefined}` does not satisfy.
        if (!ctx.exactOptional || t === ctx.checker.getUndefinedType?.()) {
          out.push('undefined');
        }
      } else if (t.flags & F.Void) out.push('void');
      else if (t.flags & F.NonPrimitive) out.push('object');
      else if (t.flags & F.Never) continue;
      else {
        const name = t.symbol?.name;
        const element =
          (name === 'Array' || name === 'ReadonlyArray') &&
          t.objectFlags & ts.ObjectFlags.Reference
            ? checker.getTypeArguments(t)[0]
            : undefined;
        const parts = element ? codeAtoms(ctx, [element], depth + 1) : null;
        if (!parts) return null;
        out.push(
          `${name === 'ReadonlyArray' ? 'readonly' : ''}[${reduced(ctx, parts, false)}]`,
        );
      }
    }
  }
  return out;
}

/**
 * The text of a type reference's name, `React.` kept: it resolves through
 * `React` where the prop is declared, which may not be what a bare name
 * means there.
 * @param {any} ts
 * @param {any} typeName
 * @returns {string}
 */
function referenceName(ts, typeName) {
  if (ts.isIdentifier(typeName)) return typeName.text;
  return `${referenceName(ts, typeName.left)}.${typeName.right.text}`;
}

/**
 * Does one side write `React.X` where the other writes a bare `X` that names
 * another type where the prop is declared (the DOM's `KeyboardEvent`, a
 * file's own `Key`)? The text reading sets the qualifier aside, so then the
 * two must not be read as one. A bare name that resolves to nothing there
 * leaves `React.X` as what it means.
 * @param {JudgeContext} ctx
 * @param {string} docType
 * @param {string[]} texts the code's type, one way it is written
 * @returns {boolean}
 */
function reactNameDiffers(ctx, docType, texts) {
  const names = (/** @type {string[]} */ list) => {
    const masked = list
      .map(text =>
        text.replace(QUOTED_OR_SPACE, part => (/^\s/.test(part) ? ' ' : "''")),
      )
      .join(' ');
    const qualified = new Set(
      [...masked.matchAll(/(?<![\w$.])React\s*\.\s*([A-Za-z_$][\w$]*)/g)].map(
        match => match[1],
      ),
    );
    const bare = new Set(
      [...masked.matchAll(/(?<![\w$.]|\.\s)([A-Za-z_$][\w$]*)/g)].map(
        match => match[1],
      ),
    );
    return {qualified, bare};
  };
  const doc = names([docType]);
  const code = names(texts);
  const crossed = [
    ...[...doc.qualified].filter(name => code.bare.has(name)),
    ...[...code.qualified].filter(name => doc.bare.has(name)),
  ];
  return crossed.some(name => {
    const bare = resolveSymbol(ctx, name);
    return !!bare && bare !== resolveSymbol(ctx, `React.${name}`);
  });
}

/**
 * The type a name the documented type uses resolves to, where the prop is
 * declared, or null.
 * @param {JudgeContext} ctx
 * @param {string} name
 * @returns {any | null}
 */
function resolveName(ctx, name) {
  const {ts, checker} = ctx;
  try {
    const resolved = resolveSymbol(ctx, name);
    // A name only TypeScript's own libraries declare (the DOM's
    // `ScrollBehavior`) is one the code may not mean: not resolved.
    const declarations = resolved?.declarations ?? [];
    if (
      ctx.isDefaultLibrary &&
      declarations.length > 0 &&
      declarations.every(
        /** @param {any} d */ d => ctx.isDefaultLibrary?.(d.getSourceFile()),
      )
    ) {
      return null;
    }
    return resolved && resolved.flags & ts.SymbolFlags.Type
      ? checker.getDeclaredTypeOfSymbol(resolved)
      : null;
  } catch {
    return null;
  }
}

/**
 * The symbol a name resolves to where the prop is declared, through aliases
 * and namespaces (`React.Key` through `React`, imported or global), or
 * undefined.
 * @param {JudgeContext} ctx
 * @param {string} name
 * @returns {any}
 */
function resolveSymbol(ctx, name) {
  const {ts, checker} = ctx;
  const meaning =
    ts.SymbolFlags.Type | ts.SymbolFlags.Alias | ts.SymbolFlags.Namespace;
  const target = (/** @type {any} */ symbol) =>
    symbol && symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  try {
    const [head, ...tail] = name.split('.');
    // A module's own declarations can come back as local symbols without
    // flags: take the export symbol, and the first one that names a type or
    // namespace.
    let symbol = checker
      .getSymbolsInScope(ctx.location, meaning)
      .filter(/** @param {any} s */ s => s.name === head)
      .map(/** @param {any} s */ s => checker.getExportSymbolOfSymbol(s))
      .find(/** @param {any} s */ s => (s.flags & meaning) !== 0);
    for (const part of tail) {
      symbol = symbol
        ? checker
            .getExportsOfModule(target(symbol))
            .find(/** @param {any} s */ s => s.name === part)
        : undefined;
    }
    return target(symbol);
  } catch {
    return undefined;
  }
}
