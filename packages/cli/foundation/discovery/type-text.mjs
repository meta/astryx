// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Loose comparison of TypeScript type text, for checking a documented
 * prop type against the type its source declares.
 *
 * {@link normalizeTypeText} parses the text with the project's own TypeScript
 * and prints the type canonically, so grouping always comes from the parse.
 * Two texts are the same type here when they print the same. The printer
 * merges only what TypeScript reads as one type:
 * - comments, whitespace, parentheses that change nothing, and quote style;
 * - the names of function and tuple parameters (a `this` parameter is kept,
 *   and a type predicate names its parameter by place);
 * - the order of a union's members and of an object type's properties;
 * - `Array<T>` and `T[]`; a `React.` qualifier;
 * - `true | false` and `boolean`; a string, number or boolean literal beside
 *   its primitive; `never` among other union members; and `undefined` on an
 *   optional prop.
 * It also sets `readonly`, `Readonly<…>` and `ReadonlyArray<…>` aside: the
 * prop type judgment compares text that writes `readonly` exactly instead.
 * Below the top of a type, a function or conditional type is always printed
 * in parentheses, and a union or intersection wherever its members would
 * otherwise bind differently. Any form the printer does not know is kept as
 * written (comments and whitespace aside), so it never reads as another
 * type. Text that does not parse as one type comes back marked with
 * {@link UNPARSED}, which no printed type starts with, so it never matches.
 * {@link typeTextTooOld} says when the project's TypeScript is too old to
 * read type text with.
 *
 * @input Type text as written in a doc or a source file, or printed by the
 *   TypeScript compiler, and the project's own `typescript`.
 * @output The canonical members of the type's top-level union, sorted.
 * @position Used by the prop type judgment (type-match.mjs).
 */

/** Marks text that does not parse as one type: no printed type has it. */
export const UNPARSED = '\u0000';

/**
 * Why the project's TypeScript is too old for this module (before 4.8, the
 * oldest every printed form is tested on), or null.
 * @param {{version?: string}} ts
 * @returns {string | null}
 */
export function typeTextTooOld(ts) {
  const [major, minor] = String(ts.version).split('.').map(Number);
  return major > 4 || (major === 4 && minor >= 8)
    ? null
    : `TypeScript ${ts.version} is older than 4.8, the oldest the type comparison reads; install TypeScript 5.0 through 6 (\`npm install -D typescript@6\`), or on TypeScript 7 add \`@typescript/typescript6\`, to judge them`;
}

/** How tightly a printed type binds: a slot needs at least its level. */
const FN = 0; // a function, constructor or conditional type
const UNION = 1;
const INTERSECTION = 2;
const OPERATOR = 3; // `keyof T`, `unique symbol`, `infer U`
const POSTFIX = 4; // `T[]`, `T[K]`
const PRIMARY = 5;

/**
 * @typedef {object} Printed
 * @property {string} text
 * @property {number} level
 * @property {'string' | 'number' | 'boolean' | 'other'} [literal] a literal
 *   its primitive absorbs in a union
 */

/** @type {WeakMap<object, Map<string, readonly string[]>>} */
const CACHE = new WeakMap();

/**
 * Remove comments and whitespace outside string literals, keeping one space
 * between two words. Used for text the printer keeps as written.
 * @param {string} text
 * @returns {string}
 */
function compact(text) {
  /** @param {number} at */
  const comment = at =>
    text[at] === '/' && (text[at + 1] === '*' || text[at + 1] === '/');
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
      continue;
    }
    // Whitespace and comments: either separates two words.
    if (/\s/.test(c) || comment(i)) {
      let k = i;
      while (k < text.length && (/\s/.test(text[k]) || comment(k))) {
        if (!comment(k)) {
          k++;
          continue;
        }
        const end =
          text[k + 1] === '*'
            ? text.indexOf('*/', k + 2) + 2
            : text.indexOf('\n', k + 2);
        k = end <= 1 ? text.length : end;
      }
      const prev = out[out.length - 1];
      if (prev && /[\w$]/.test(prev) && /[\w$]/.test(text[k] ?? '')) {
        out += ' ';
      }
      i = k - 1;
      continue;
    }
    out += c;
  }
  return out;
}

/** @param {string} value */
const quote = value =>
  `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

/**
 * Print a type node canonically.
 * @param {any} ts
 * @param {any} sf
 * @param {any} node
 * @returns {Printed}
 */
function print(ts, sf, node) {
  const K = ts.SyntaxKind;
  /** @type {(child: any, level: number) => string} */
  const slot = (child, level) => at(ts, sf, child, level);
  /** @type {(text: string, level?: number) => Printed} */
  const done = (text, level = PRIMARY) => ({text, level});
  const kept = () => done(compact(node.getText(sf)), FN);

  if (ts.isParenthesizedTypeNode(node)) return print(ts, sf, node.type);
  if (ts.isUnionTypeNode(node)) {
    const parts = unionParts(ts, sf, node, false);
    return parts.length === 1
      ? parts[0]
      : done(parts.map(display).join('|'), UNION);
  }
  if (ts.isIntersectionTypeNode(node)) {
    /** @type {any[]} */
    const parts = [];
    const flatten = (/** @type {any} */ n) => {
      const inner = unwrap(ts, n);
      if (ts.isIntersectionTypeNode(inner)) inner.types.forEach(flatten);
      else parts.push(inner);
    };
    flatten(node);
    return done(parts.map(p => slot(p, OPERATOR)).join('&'), INTERSECTION);
  }
  if (ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node)) {
    const prefix = ts.isConstructorTypeNode(node)
      ? `${node.modifiers?.some((/** @type {any} */ m) => m.kind === K.AbstractKeyword) ? 'abstract ' : ''}new`
      : '';
    return done(
      `${prefix}${typeParameters(ts, sf, node)}(${parameters(ts, sf, node.parameters)})=>${returnType(ts, sf, node)}`,
      FN,
    );
  }
  if (ts.isConditionalTypeNode(node)) {
    return done(
      `${slot(node.checkType, UNION)} extends ${slot(node.extendsType, UNION)}?${slot(node.trueType, UNION)}:${slot(node.falseType, UNION)}`,
      FN,
    );
  }
  if (ts.isArrayTypeNode(node)) {
    return done(`${slot(node.elementType, POSTFIX)}[]`, POSTFIX);
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    return done(
      `${slot(node.objectType, POSTFIX)}[${slot(node.indexType, UNION)}]`,
      POSTFIX,
    );
  }
  if (ts.isTypeOperatorNode(node)) {
    // `readonly` is set aside.
    if (node.operator === K.ReadonlyKeyword) return print(ts, sf, node.type);
    const word = node.operator === K.KeyOfKeyword ? 'keyof' : 'unique';
    return done(`${word} ${slot(node.type, OPERATOR)}`, OPERATOR);
  }
  if (ts.isInferTypeNode(node)) {
    const parameter = node.typeParameter;
    return parameter.constraint
      ? done(
          `infer ${parameter.name.text} extends ${slot(parameter.constraint, UNION)}`,
          FN,
        )
      : done(`infer ${parameter.name.text}`, OPERATOR);
  }
  if (ts.isTypeReferenceNode(node)) {
    const name = entityName(ts, node.typeName, true);
    const args = node.typeArguments ?? [];
    if (args.length === 1 && (name === 'Array' || name === 'ReadonlyArray')) {
      return done(`${slot(args[0], POSTFIX)}[]`, POSTFIX);
    }
    // `Readonly<T>` is set aside: it prints as `T`, grouped where `T` is.
    if (args.length === 1 && name === 'Readonly') return print(ts, sf, args[0]);
    return done(name + typeArguments(ts, sf, args));
  }
  if (ts.isTypeQueryNode(node)) {
    return done(
      `typeof ${entityName(ts, node.exprName, false)}${typeArguments(ts, sf, node.typeArguments ?? [])}`,
    );
  }
  if (ts.isImportTypeNode(node)) {
    const literal = node.argument?.literal;
    // Import attributes change which file a module resolves to: kept as
    // written.
    if (
      !literal ||
      !ts.isStringLiteral(literal) ||
      node.attributes ||
      node.assertions
    ) {
      return kept();
    }
    const qualifier = node.qualifier
      ? `.${entityName(ts, node.qualifier, false)}`
      : '';
    return done(
      `${node.isTypeOf ? 'typeof ' : ''}import(${quote(literal.text)})${qualifier}${typeArguments(ts, sf, node.typeArguments ?? [])}`,
    );
  }
  if (ts.isTupleTypeNode(node)) {
    return done(
      `[${node.elements.map((/** @type {any} */ e) => tupleElement(ts, sf, e)).join(',')}]`,
    );
  }
  if (ts.isTypeLiteralNode(node)) return done(typeLiteral(ts, sf, node));
  if (ts.isMappedTypeNode(node)) {
    const parameter = node.typeParameter;
    const as = node.nameType ? ` as ${slot(node.nameType, UNION)}` : '';
    const question = node.questionToken
      ? node.questionToken.kind === K.MinusToken
        ? '-?'
        : '?'
      : '';
    const value = node.type ? `:${slot(node.type, UNION)}` : '';
    return done(
      `{[${parameter.name.text} in ${slot(parameter.constraint, UNION)}${as}]${question}${value}}`,
    );
  }
  if (ts.isLiteralTypeNode(node)) return literal(ts, node.literal) ?? kept();
  if (ts.isTemplateLiteralTypeNode(node)) {
    /** @type {(text: string) => string} */
    const raw = text => text.replace(/\\/g, '\\\\').replace(/`|\$\{/g, '\\$&');
    return done(
      '`' +
        raw(node.head.text) +
        node.templateSpans
          .map(
            (/** @type {any} */ span) =>
              `\${${slot(span.type, UNION)}}${raw(span.literal.text)}`,
          )
          .join('') +
        '`',
    );
  }
  if (node.kind === K.ThisType) return done('this');
  if (
    (node.kind >= K.FirstKeyword && node.kind <= K.LastKeyword) ||
    node.kind === K.NullKeyword
  ) {
    const text = node.getText(sf);
    return /^[a-z]+$/.test(text) ? done(text) : kept();
  }
  return kept();
}

/**
 * A parenthesized type's inner type, at any depth.
 * @param {any} ts
 * @param {any} node
 */
function unwrap(ts, node) {
  let inner = node;
  while (ts.isParenthesizedTypeNode(inner)) inner = inner.type;
  return inner;
}

/**
 * A union member as it prints among others: a function or conditional type
 * in parentheses, so joining members with `|` cannot read as one function.
 * @param {Printed} part
 */
function display(part) {
  return part.level < INTERSECTION ? `(${part.text})` : part.text;
}

/**
 * A union's members, canonical, merged and sorted.
 * @param {any} ts
 * @param {any} sf
 * @param {any} node a union, or any type (one member)
 * @param {boolean} optional drop `undefined`
 * @returns {Printed[]}
 */
function unionParts(ts, sf, node, optional) {
  /** @type {Printed[]} */
  const members = [];
  const visit = (/** @type {any} */ n) => {
    const inner = unwrap(ts, n);
    if (ts.isUnionTypeNode(inner)) {
      inner.types.forEach(visit);
      return;
    }
    // `Readonly<A | B>` and `readonly (A | B)` are `A | B`.
    if (
      ts.isTypeReferenceNode(inner) &&
      inner.typeArguments?.length === 1 &&
      entityName(ts, inner.typeName, true) === 'Readonly'
    ) {
      visit(inner.typeArguments[0]);
      return;
    }
    if (
      ts.isTypeOperatorNode(inner) &&
      inner.operator === ts.SyntaxKind.ReadonlyKeyword
    ) {
      visit(inner.type);
      return;
    }
    members.push(print(ts, sf, inner));
  };
  visit(node);
  const texts = new Set(members.map(display));
  /** @type {Set<string>} */
  const absorbed = new Set(
    ['string', 'number', 'boolean'].filter(t => texts.has(t)),
  );
  if (texts.has('true') && texts.has('false')) absorbed.add('boolean');
  /** @type {Map<string, Printed>} */
  const out = new Map();
  for (const m of members) {
    if (m.literal && m.literal !== 'other' && absorbed.has(m.literal)) continue;
    out.set(display(m), m);
  }
  if (absorbed.has('boolean')) {
    out.set('boolean', {text: 'boolean', level: PRIMARY});
  }
  if (out.size > 1) out.delete('never');
  if (optional) out.delete('undefined');
  return [...out.keys()].sort().map(k => /** @type {Printed} */ (out.get(k)));
}

/**
 * A literal type's text: strings single-quoted, numbers by value.
 * @param {any} ts
 * @param {any} literal
 * @returns {Printed | null}
 */
function literal(ts, literal) {
  const K = ts.SyntaxKind;
  if (
    ts.isStringLiteral(literal) ||
    literal.kind === K.NoSubstitutionTemplateLiteral
  ) {
    return {text: quote(literal.text), level: PRIMARY, literal: 'string'};
  }
  if (ts.isNumericLiteral(literal)) {
    const value = Number(literal.text);
    return Number.isFinite(value)
      ? {text: String(value), level: PRIMARY, literal: 'number'}
      : null;
  }
  if (
    ts.isPrefixUnaryExpression(literal) &&
    literal.operator === K.MinusToken &&
    ts.isNumericLiteral(literal.operand)
  ) {
    const value = -Number(literal.operand.text);
    return Number.isFinite(value)
      ? {text: String(value), level: PRIMARY, literal: 'number'}
      : null;
  }
  if (literal.kind === K.TrueKeyword || literal.kind === K.FalseKeyword) {
    return {
      text: literal.kind === K.TrueKeyword ? 'true' : 'false',
      level: PRIMARY,
      literal: 'boolean',
    };
  }
  if (literal.kind === K.NullKeyword) return {text: 'null', level: PRIMARY};
  return null;
}

/**
 * An entity name, `React.` dropped where asked.
 * @param {any} ts
 * @param {any} name
 * @param {boolean} dropReact
 * @returns {string}
 */
function entityName(ts, name, dropReact) {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isQualifiedName(name)) {
    const left = entityName(ts, name.left, false);
    return dropReact && left === 'React'
      ? name.right.text
      : `${dropReact ? entityName(ts, name.left, true) : left}.${name.right.text}`;
  }
  return compact(name.getText());
}

/**
 * @param {any} ts
 * @param {any} sf
 * @param {readonly any[]} args
 */
function typeArguments(ts, sf, args) {
  return args.length === 0
    ? ''
    : `<${args.map(a => at(ts, sf, a, UNION)).join(',')}>`;
}

/**
 * Print a child, in parentheses when it binds more loosely than the slot.
 * @param {any} ts
 * @param {any} sf
 * @param {any} node
 * @param {number} level
 */
function at(ts, sf, node, level) {
  const printed = print(ts, sf, node);
  return printed.level < level ? `(${printed.text})` : printed.text;
}

/**
 * @param {any} ts
 * @param {any} sf
 * @param {any} node a function-like node
 */
function typeParameters(ts, sf, node) {
  const list = node.typeParameters ?? [];
  if (list.length === 0) return '';
  return `<${list
    .map(
      (/** @type {any} */ p) =>
        p.name.text +
        (p.constraint ? ` extends ${at(ts, sf, p.constraint, UNION)}` : '') +
        (p.default ? `=${at(ts, sf, p.default, UNION)}` : ''),
    )
    .join(',')}>`;
}

/**
 * A parameter list without names: a `this` parameter keeps its name.
 * @param {any} ts
 * @param {any} sf
 * @param {readonly any[]} list
 */
function parameters(ts, sf, list) {
  return list
    .map(p => {
      const type = p.type ? at(ts, sf, p.type, UNION) : 'any';
      const self =
        ts.isIdentifier(p.name) && p.name.text === 'this' ? 'this:' : '';
      return `${p.dotDotDotToken ? '...' : ''}${self}${type}${p.questionToken ? '?' : ''}`;
    })
    .join(',');
}

/**
 * A function's return type; a type predicate names its parameter by place.
 * @param {any} ts
 * @param {any} sf
 * @param {any} node a function-like node
 */
function returnType(ts, sf, node) {
  const type = node.type;
  if (!type) return 'any';
  if (!ts.isTypePredicateNode(type)) return print(ts, sf, type).text;
  const name = type.parameterName;
  const place = ts.isIdentifier(name)
    ? node.parameters.findIndex(
        (/** @type {any} */ p) =>
          ts.isIdentifier(p.name) && p.name.text === name.text,
      )
    : -1;
  const subject = ts.isIdentifier(name)
    ? place === -1
      ? name.text
      : `#${place}`
    : 'this';
  const asserts = type.assertsModifier ? 'asserts ' : '';
  return `${asserts}${subject}${type.type ? ` is ${at(ts, sf, type.type, UNION)}` : ''}`;
}

/**
 * A tuple element without its name.
 * @param {any} ts
 * @param {any} sf
 * @param {any} element
 */
function tupleElement(ts, sf, element) {
  if (ts.isNamedTupleMember(element)) {
    return `${element.dotDotDotToken ? '...' : ''}${at(ts, sf, element.type, element.dotDotDotToken || element.questionToken ? POSTFIX : UNION)}${element.questionToken ? '?' : ''}`;
  }
  if (ts.isOptionalTypeNode(element))
    return `${at(ts, sf, element.type, POSTFIX)}?`;
  if (ts.isRestTypeNode(element))
    return `...${at(ts, sf, element.type, POSTFIX)}`;
  return at(ts, sf, element, UNION);
}

/**
 * An object type: properties sorted, everything else in written order.
 * @param {any} ts
 * @param {any} sf
 * @param {any} node
 */
function typeLiteral(ts, sf, node) {
  /** @type {string[]} */
  const properties = [];
  /** @type {string[]} */
  const others = [];
  for (const member of node.members) {
    const optional = member.questionToken ? '?' : '';
    if (ts.isPropertySignature(member)) {
      const type = member.type ? at(ts, sf, member.type, UNION) : 'any';
      properties.push(`${propertyName(ts, member.name)}${optional}:${type}`);
    } else if (ts.isMethodSignature(member)) {
      others.push(
        `${propertyName(ts, member.name)}${optional}${typeParameters(ts, sf, member)}(${parameters(ts, sf, member.parameters)}):${returnType(ts, sf, member)}`,
      );
    } else if (ts.isCallSignatureDeclaration(member)) {
      others.push(
        `${typeParameters(ts, sf, member)}(${parameters(ts, sf, member.parameters)}):${returnType(ts, sf, member)}`,
      );
    } else if (ts.isConstructSignatureDeclaration(member)) {
      // `new ` with a space: no method name prints that way, so a method
      // named `'new'` reads apart.
      others.push(
        `new ${typeParameters(ts, sf, member)}(${parameters(ts, sf, member.parameters)}):${returnType(ts, sf, member)}`,
      );
    } else if (ts.isIndexSignatureDeclaration(member)) {
      const key = member.parameters[0]?.type
        ? at(ts, sf, member.parameters[0].type, UNION)
        : 'any';
      // An index signature's key reads apart from a computed property name.
      others.push(
        `[_:${key}]:${member.type ? at(ts, sf, member.type, UNION) : 'any'}`,
      );
    } else {
      // An accessor, as written, without the `;` or `,` that ends it.
      others.push(compact(member.getText(sf)).replace(/[;,]$/, ''));
    }
  }
  return `{${[...properties.sort(), ...others].join(';')}}`;
}

/**
 * A property name: a quoted name that is an identifier reads as one.
 * @param {any} ts
 * @param {any} name
 */
function propertyName(ts, name) {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) {
    return /^[A-Za-z_$][\w$]*$/.test(name.text) ? name.text : quote(name.text);
  }
  if (ts.isNumericLiteral(name)) return String(Number(name.text));
  return compact(name.getText());
}

/**
 * Canonical type text: the members of the type's top-level union, sorted.
 * The result is cached and frozen, so no caller can change it for the next.
 * @param {string} text
 * @param {{ts: any, optional?: boolean}} options `ts` is the project's own
 *   `typescript`; with `optional`, `undefined` is dropped, as an optional
 *   prop takes it anyway
 * @returns {readonly string[]}
 */
export function normalizeTypeText(text, options) {
  const {ts, optional = false} = options;
  let cache = CACHE.get(ts);
  if (!cache) {
    cache = new Map();
    CACHE.set(ts, cache);
  }
  const key = `${optional ? 1 : 0}${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const source = String(text);
  const sf = ts.createSourceFile(
    'type-text.ts',
    `type T = ${source}\n;`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const [statement] = sf.statements;
  // `Foo<>`, `Foo<A,>`, `typeof Foo<>` and JSDoc's forms (`Array.<T>`,
  // `?string`, `*`) parse, but only the checker rejects them, as it does a
  // mapped type with members, a parameter with a modifier or an initializer,
  // a member with a modifier other than `readonly`, a property with an
  // initializer, an `in` or `out` type parameter, and an index signature
  // without one plain, typed parameter and a type. A comment before the `<`
  // is not a `.`.
  /** @type {(node: any) => boolean} */
  const invalid = node => {
    const args = node.typeArguments;
    const name = node.typeName ?? node.exprName ?? node.qualifier;
    const between =
      args && name
        ? sf.text
            .slice(name.end, args.pos)
            .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
        : '';
    return (
      (node.kind >= ts.SyntaxKind.FirstJSDocNode &&
        node.kind <= ts.SyntaxKind.LastJSDocNode) ||
      (!!args &&
        (args.length === 0 ||
          args.hasTrailingComma ||
          between.includes('.'))) ||
      (ts.isPropertySignature(node) && !!node.initializer) ||
      (ts.isTypeParameterDeclaration(node) &&
        (node.modifiers ?? []).some(
          (/** @type {any} */ m) =>
            m.kind === ts.SyntaxKind.InKeyword ||
            m.kind === ts.SyntaxKind.OutKeyword,
        )) ||
      (ts.isIndexSignatureDeclaration(node) &&
        (node.parameters.length !== 1 ||
          !node.type ||
          node.parameters.some(
            (/** @type {any} */ p) =>
              p.questionToken || p.dotDotDotToken || !p.type,
          ))) ||
      (ts.isMappedTypeNode(node) && !!node.members?.length) ||
      (ts.isParameter(node) &&
        !!(node.initializer || node.modifiers?.length)) ||
      (ts.isTypeElement(node) &&
        (node.modifiers ?? []).some(
          (/** @type {any} */ m) => m.kind !== ts.SyntaxKind.ReadonlyKeyword,
        )) ||
      !!ts.forEachChild(
        node,
        (/** @type {any} */ child) => invalid(child) || undefined,
      )
    );
  };
  const result = Object.freeze(
    sf.statements.length === 1 &&
      ts.isTypeAliasDeclaration(statement) &&
      (sf.parseDiagnostics ?? []).length === 0 &&
      !invalid(statement.type)
      ? unionParts(ts, sf, statement.type, optional).map(display)
      : [`${UNPARSED}${compact(source)}`],
  );
  cache.set(key, result);
  return result;
}
