// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @file Guards closed string unions in doc prop types against the TypeScript types.
 * @input Every {Name}.doc.mjs and the Core program rooted at index.ts.
 * @output Fails when a doc lists a string union that differs from the prop's type.
 * @position Repo-wide doc-shape guard, sibling of docPropLiterals.test.ts.
 *
 * `astryx component <Name>` prints the doc's `type`, and tools read its values
 * to judge what a page passes. A doc that lists `'span' | 'p'` for a prop typed
 * `'span' | 'p' | 'h1'` tells readers that `h1` is wrong. This test reads the
 * type from the TypeScript checker, not from source text, so inline unions,
 * aliases and `keyof` maps all resolve. Docs follow the types.
 */

import {describe, it, expect} from 'vitest';
import {readdirSync} from 'node:fs';
import {join, relative} from 'node:path';
import ts from 'typescript';

const SRC_DIR = __dirname;

type PropEntry = {name: string; type?: unknown};
type DocExport = {
  name?: string;
  props?: PropEntry[];
  components?: {name?: string; props?: PropEntry[]}[];
};

function findDocFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findDocFiles(full));
    } else if (entry.name.endsWith('.doc.mjs')) {
      out.push(full);
    }
  }
  return out;
}

// --- Doc side --------------------------------------------------------------

const STRING_LITERAL = String.raw`(?:'[^']*'|"[^"]*")`;
const MEMBER = String.raw`(?:${STRING_LITERAL}|null|undefined)`;
const CLOSED_STRING_UNION = new RegExp(
  String.raw`^\s*\|?\s*${MEMBER}(?:\s*\|\s*${MEMBER})*\s*$`,
);

/** The string members of a doc type, or null when it is not a closed string union. */
function docStringUnion(type: string): string[] | null {
  if (!CLOSED_STRING_UNION.test(type)) {
    return null;
  }
  const members = [...type.matchAll(/'([^']*)'|"([^"]*)"/g)].map(
    m => m[1] ?? m[2],
  );
  return members.length > 0 ? members : null;
}

// --- TypeScript side -------------------------------------------------------

const configPath = join(SRC_DIR, '..', 'tsconfig.json');
const config = ts.getParsedCommandLineOfConfigFile(
  configPath,
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      throw new Error(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      );
    },
  },
);
const indexPath = join(SRC_DIR, 'index.ts');
const program = ts.createProgram({
  rootNames: [indexPath],
  options: {...config!.options, noEmit: true},
});
const checker = program.getTypeChecker();
const indexSymbol = checker.getSymbolAtLocation(
  program.getSourceFile(indexPath)!,
);
const coreExports = new Map(
  checker.getExportsOfModule(indexSymbol!).map(s => [s.name, s] as const),
);

/**
 * The props type of an exported component or hook: the first parameter of
 * its LAST call signature. `React.ComponentProps<typeof X>` reads the same
 * signature, so a deprecated overload placed first is not the contract.
 */
function propsTypeOf(name: string): ts.Type | undefined {
  const exported = coreExports.get(name);
  if (!exported) {
    return undefined;
  }
  const symbol =
    exported.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(exported)
      : exported;
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (!declaration) {
    return undefined;
  }
  const signatures = checker
    .getTypeOfSymbolAtLocation(symbol, declaration)
    .getCallSignatures();
  const props = signatures.at(-1)?.parameters[0];
  if (!props) {
    return undefined;
  }
  return checker.getApparentType(
    checker.getTypeOfSymbolAtLocation(
      props,
      props.valueDeclaration ?? declaration,
    ),
  );
}

function hasDeprecatedComment(node: ts.Node): boolean {
  const text = node.getSourceFile().text;
  return (ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []).some(
    range => text.slice(range.pos, range.end).includes('@deprecated'),
  );
}

/**
 * Sorts the string literals a declared type spells into `deprecated` and
 * `live`. A literal is deprecated when its union member carries a
 * `@deprecated` comment, or when it is a `@deprecated` key of a `keyof T`
 * map. Aliases are followed to their declarations.
 */
function collectDeprecation(
  node: ts.TypeNode,
  deprecated: Set<string>,
  live: Set<string>,
  seen = new Set<ts.Node>(),
): void {
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  if (ts.isUnionTypeNode(node)) {
    for (const member of node.types) {
      if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) {
        (hasDeprecatedComment(member) ? deprecated : live).add(
          member.literal.text,
        );
      } else {
        collectDeprecation(member, deprecated, live, seen);
      }
    }
  } else if (ts.isParenthesizedTypeNode(node)) {
    collectDeprecation(node.type, deprecated, live, seen);
  } else if (
    ts.isTypeOperatorNode(node) &&
    node.operator === ts.SyntaxKind.KeyOfKeyword
  ) {
    for (const key of checker.getPropertiesOfType(
      checker.getTypeFromTypeNode(node.type),
    )) {
      const isDeprecated = (key.declarations ?? []).some(
        d => ts.getJSDocDeprecatedTag(d) !== undefined,
      );
      (isDeprecated ? deprecated : live).add(key.name);
    }
  } else if (ts.isTypeReferenceNode(node)) {
    let symbol = checker.getSymbolAtLocation(node.typeName);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    for (const declaration of symbol?.declarations ?? []) {
      if (ts.isTypeAliasDeclaration(declaration)) {
        collectDeprecation(declaration.type, deprecated, live, seen);
      }
    }
  }
}

type TypeUnion =
  | {kind: 'missing'}
  | {kind: 'open'; text: string}
  | {kind: 'closed'; members: string[]; deprecated: string[]};

/** What TypeScript accepts for `prop` on `propsType`, without null/undefined. */
function typeStringUnion(propsType: ts.Type, prop: string): TypeUnion {
  const symbol = propsType.getProperty(prop);
  if (!symbol) {
    return {kind: 'missing'};
  }
  let type = checker.getTypeOfSymbol(symbol);
  if (type.flags & ts.TypeFlags.TypeParameter) {
    type = checker.getBaseConstraintOfType(type) ?? type;
  }
  const members: string[] = [];
  for (const part of type.isUnion() ? type.types : [type]) {
    if (part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) {
      continue;
    }
    if (!part.isStringLiteral()) {
      return {kind: 'open', text: checker.typeToString(type)};
    }
    members.push(part.value);
  }
  const deprecated = new Set<string>();
  const live = new Set<string>();
  for (const declaration of symbol.declarations ?? []) {
    const node = (declaration as {type?: ts.TypeNode}).type;
    if (node) {
      collectDeprecation(node, deprecated, live);
    }
  }
  for (const literal of live) {
    deprecated.delete(literal);
  }
  return {kind: 'closed', members, deprecated: [...deprecated]};
}

/**
 * Why a doc union differs from the type, or null when they agree. A doc may
 * leave out a deprecated member; it may not list a value the type rejects
 * or omit one it accepts.
 */
function unionDrift(docMembers: string[], typed: TypeUnion): string | null {
  // A documented prop the type lacks is a different drift; this guard skips it.
  if (typed.kind === 'missing') {
    return null;
  }
  if (typed.kind === 'open') {
    return `the doc lists a closed union, but the type accepts ${typed.text}.`;
  }
  const doc = new Set(docMembers);
  const accepted = new Set(typed.members);
  const extra = [...doc].filter(m => !accepted.has(m));
  const missing = typed.members.filter(
    m => !doc.has(m) && !typed.deprecated.includes(m),
  );
  if (extra.length === 0 && missing.length === 0) {
    return null;
  }
  // Keep the doc's order and append what it lacks.
  const expected = [...docMembers.filter(m => accepted.has(m)), ...missing]
    .map(m => `'${m}'`)
    .join(' | ');
  const parts = [
    missing.length > 0 && `missing ${missing.map(m => `'${m}'`).join(', ')}`,
    extra.length > 0 &&
      `lists ${extra.map(m => `'${m}'`).join(', ')}, which the type rejects`,
  ].filter(Boolean);
  return `${parts.join('; ')}. Write: "${expected}".`;
}

// --- Doc props -------------------------------------------------------------

interface DocUnionProp {
  where: string;
  component: string;
  prop: string;
  members: string[];
}

const docUnionProps: DocUnionProp[] = [];
for (const file of findDocFiles(SRC_DIR)) {
  const mod = require(file) as {docs?: DocExport; docsZh?: DocExport};
  for (const key of ['docs', 'docsZh'] as const) {
    const docs = mod[key];
    if (!docs) {
      continue;
    }
    for (const {name, props} of [
      {name: docs.name, props: docs.props},
      ...(docs.components ?? []),
    ]) {
      if (!name || !Array.isArray(props)) {
        continue;
      }
      for (const prop of props) {
        const members =
          typeof prop.type === 'string' ? docStringUnion(prop.type) : null;
        if (members) {
          docUnionProps.push({
            where: `${relative(SRC_DIR, file)}${key === 'docsZh' ? ' (zh)' : ''}`,
            component: name,
            prop: prop.name,
            members,
          });
        }
      }
    }
  }
}

function realProp(component: string, prop: string): DocUnionProp {
  const found = docUnionProps.find(
    p =>
      p.component === component && p.prop === prop && !p.where.endsWith('(zh)'),
  );
  if (!found) {
    throw new Error(`no closed-union doc prop ${component}.${prop}`);
  }
  return found;
}

function typedFor(component: string, prop: string): TypeUnion {
  const propsType = propsTypeOf(component);
  if (!propsType) {
    throw new Error(`no exported component or hook ${component}`);
  }
  return typeStringUnion(propsType, prop);
}

describe('doc string unions match the TypeScript prop types', () => {
  it('sanity: reads doc unions and resolves their components', () => {
    expect(docUnionProps.length).toBeGreaterThan(400);
    const unresolved = [
      ...new Set(
        docUnionProps
          .filter(p => propsTypeOf(p.component) === undefined)
          .map(p => p.component),
      ),
    ];
    expect(unresolved).toEqual([]);
  });

  it('every closed string union in a doc equals its prop type', () => {
    const drift: string[] = [];
    for (const {where, component, prop, members} of docUnionProps) {
      const reason = unionDrift(members, typedFor(component, prop));
      if (reason) {
        drift.push(`${where} — ${component}.${prop}: ${reason}`);
      }
    }
    expect(drift, drift.join('\n')).toEqual([]);
  });

  describe('the type reader', () => {
    it('reads an inline union', () => {
      const typed = typedFor('Text', 'as');
      expect(typed).toMatchObject({kind: 'closed', deprecated: []});
      // The checker orders union members by its own type ids.
      expect(typed.kind === 'closed' && [...typed.members].sort()).toEqual([
        'div',
        'h1',
        'h2',
        'h3',
        'label',
        'p',
        'span',
      ]);
    });

    it('reads the last overload and drops a deprecated keyof member', () => {
      // FieldStatus's first overload takes the deprecated `variant: 'tooltip'`.
      const typed = typedFor('FieldStatus', 'variant');
      expect(typed).toMatchObject({kind: 'closed', deprecated: ['tooltip']});
      expect(unionDrift(['attached', 'detached'], typed)).toBeNull();
    });

    it('keeps a member that another branch of the type adds back', () => {
      // FieldStatusPlacement = keyof FieldStatusVariantMap | 'tooltip'.
      const typed = typedFor('PowerSearch', 'statusVariant');
      expect(typed).toMatchObject({kind: 'closed', deprecated: []});
      expect(unionDrift(['attached', 'detached'], typed)).toContain(
        "missing 'tooltip'",
      );
    });
  });

  describe('the guard bites', () => {
    it('fails a doc that drops a member', () => {
      const as = realProp('Text', 'as');
      expect(unionDrift(as.members, typedFor('Text', 'as'))).toBeNull();
      const stale = as.members.filter(m => m !== 'h3');
      expect(unionDrift(stale, typedFor('Text', 'as'))).toContain(
        "missing 'h3'",
      );
    });

    it('fails a doc that lists a value the type rejects', () => {
      const as = realProp('Text', 'as');
      expect(
        unionDrift([...as.members, 'h4'], typedFor('Text', 'as')),
      ).toContain("lists 'h4', which the type rejects");
    });

    it('fails a closed doc union over an open type', () => {
      expect(unionDrift(['a', 'b'], {kind: 'open', text: 'string'})).toContain(
        'the type accepts string',
      );
    });

    it('accepts a doc that also lists a deprecated member', () => {
      expect(
        unionDrift(['attached', 'detached', 'tooltip'], {
          kind: 'closed',
          members: ['attached', 'detached', 'tooltip'],
          deprecated: ['tooltip'],
        }),
      ).toBeNull();
    });

    it('reads only closed string unions from docs', () => {
      expect(docStringUnion("'a' | 'b' | undefined")).toEqual(['a', 'b']);
      expect(docStringUnion("'a' | string")).toBeNull();
      expect(docStringUnion('0 | 1')).toBeNull();
      expect(docStringUnion('ButtonVariant')).toBeNull();
    });
  });
});
