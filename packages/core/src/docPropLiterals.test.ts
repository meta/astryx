// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * @file Guards doc prop types against opaque named unions (#1645).
 * @input Every {Name}.doc.mjs plus the TypeScript sources they describe,
 *   including same-file private aliases used by exported literal unions.
 * @output Fails when a documented prop type hides its legal literal values.
 * @position Repo-wide doc-shape guard, sibling of docPropReferences.test.ts.
 *
 * A prop type of `SpacingStep` or `TableSortState<TSortKey>` names a type
 * without revealing what may be written into it. Readers without an IDE —
 * agents especially — then guess: `gap={16}` (pixels, not a scale step),
 * `direction: 'desc'` (the type says `'descending'`). Both fail to compile.
 * `ComponentPropDoc.type` in docs-types.ts already asks for inlined unions
 * (`"'primary' | 'secondary' | 'ghost'"`); this test holds docs to it.
 *
 * Two ways a doc prop can hide values, checked at different strictness:
 *
 *   1. DIRECT — the prop type *is* (or contains) a literal-union type name.
 *      `gap: SpacingStep` must read `gap: 0 | 0.5 | 1 | …`. The name never
 *      buys the reader anything the literals don't, so inlining is required;
 *      prose is not an escape (see ENUMERATED_IN_PROSE for the one exception).
 *
 *   2. INDIRECT — the prop type names a composite whose own definition
 *      carries a literal union: `status: InputStatus` hides
 *      `'warning' | 'error' | 'success'`, `sort: TableSortState` hides
 *      `direction: 'ascending' | 'descending'`. Here the values may be
 *      surfaced in the type (spell the shape out — preferred when the object
 *      is small) *or* in the description, because forcing a twelve-field
 *      object into the type column would make the docs worse, not better.
 *
 * Both registries are derived from the TypeScript sources at test time, so a
 * new member on a union (or a renamed one) fails here until docs catch up.
 */

import {describe, it, expect} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';

const SRC_DIR = __dirname;

type DocExport = {
  name?: string;
  props?: PropEntry[];
  components?: {name?: string; props?: PropEntry[]}[];
};

type DocModule = {
  docs?: DocExport;
  docsZh?: DocExport;
};

type PropEntry = {name: string; type?: string; description?: string};

/**
 * Unions too large to read inside a prop-type cell. Exempt from inlining,
 * but only while the prop's description enumerates every member — the
 * values still have to be discoverable from the docs alone.
 */
const ENUMERATED_IN_PROSE = new Set(['IconName']);

/**
 * Generic wrappers whose type argument is still a value the consumer writes,
 * so the walk descends through them. Every other generic (`ReactElement<P>`,
 * `Record<K, V>`, `Ref<T>`) wraps a type the consumer never spells out by
 * hand, and descending into it would demand, say, all 26 icon names in
 * Button's `endContent` docs.
 */
const TRANSPARENT_WRAPPERS = new Set(['Array', 'ReadonlyArray']);

/**
 * A union of nothing but string/number literals (plus null/undefined).
 *
 * Built so each separator has exactly ONE way to be parsed. The obvious
 * spelling — `(?:\s*\|?\s*LITERAL\s*(?:\|\s*)?)+` — lets a repetition's
 * trailing `(?:\|\s*)?` and the next one's leading `\|?` both claim the same
 * pipe, so every separator doubles the parse tree. On a union that *fails* to
 * match (a literal prefix ending in a named type, e.g. `'a' | 'b' | … |
 * ComponentType` — an ordinary TS pattern) the engine explores all 2^n of them:
 * measured at 1.2s for 10 members and 7.8s for 12. This form is linear, and
 * agrees with the old one on every type alias in the package.
 */
const LITERAL = String.raw`(?:'[^']*'|-?\d+(?:\.\d+)?|null|undefined)`;
const LITERAL_UNION = new RegExp(
  String.raw`^\s*\|?\s*${LITERAL}(?:\s*\|\s*${LITERAL})*\s*$`,
);

function findFiles(dir: string, suffixes: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findFiles(full, suffixes));
    } else if (suffixes.some(s => entry.name.endsWith(s))) {
      out.push(full);
    }
  }
  return out;
}

/** Strip comments so a doc block's prose never reads as type syntax. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Literal members of a union flagged `@deprecated` in source. Docs shouldn't
 * advertise a deprecated value as a legal option (the prose can still mention
 * it), so the guard doesn't require it to be inlined. Detected from the *raw*
 * declaration, because the registry parses members from comment-stripped
 * source where the `@deprecated` marker is already gone. A member is
 * deprecated when a `@deprecated` JSDoc or line comment immediately precedes
 * it in the union — e.g. a member `'c'` written just after a
 * `@deprecated`-tagged block comment is treated as deprecated and dropped,
 * while undecorated members like `'a'` and `'b'` are kept.
 */
function deprecatedLiteralMembers(rawRhs: string): Set<string> {
  const out = new Set<string>();
  const marker =
    /(?:\/\*\*?[\s\S]*?@deprecated[\s\S]*?\*\/|\/\/[^\n]*@deprecated[^\n]*)\s*\|\s*('[^']*'|-?\d+(?:\.\d+)?|null|undefined)/g;
  for (const m of rawRhs.matchAll(marker)) {
    out.add(m[1]);
  }
  return out;
}

/**
 * Names a consumer would have to write values for, given a type expression.
 * Skips string literals, generic parameters, and the type arguments of any
 * wrapper that isn't transparent.
 */
function authoredTypeNames(expr: string): string[] {
  const names: string[] = [];
  const text = expr.replace(/'[^']*'/g, "''");
  let i = 0;
  while (i < text.length) {
    const match = /[A-Za-z_$][A-Za-z0-9_$]*/.exec(text.slice(i));
    if (!match) {
      break;
    }
    const start = i + match.index;
    const name = match[0];
    let end = start + name.length;
    if (/^[A-Z]/.test(name)) {
      names.push(name);
    }
    // A '<' directly after the name opens that name's type arguments.
    const rest = text.slice(end);
    const open = /^\s*</.exec(rest);
    if (open) {
      let depth = 0;
      let j = end + open[0].length - 1;
      for (; j < text.length; j++) {
        if (text[j] === '<') {
          depth++;
        } else if (text[j] === '>') {
          depth--;
          if (depth === 0) {
            break;
          }
        }
      }
      const args = text.slice(end + open[0].length, j);
      if (TRANSPARENT_WRAPPERS.has(name)) {
        names.push(...authoredTypeNames(args));
      }
      end = j + 1;
    }
    i = end;
  }
  return names;
}

// --- Registries, read straight from the TypeScript sources -----------------

/** Literal-union type name → its members, e.g. "'start' | 'center'". */
const literalUnions = new Map<string, string>();
/** Every other exported type/interface name → its definition body. */
const namedBodies = new Map<string, string>();

for (const file of findFiles(SRC_DIR, ['.ts', '.tsx'])) {
  if (file.includes('.test.')) {
    continue;
  }
  const raw = readFileSync(file, 'utf8');
  const src = stripComments(raw);
  // Raw type declarations, keyed by name, so we can inspect `@deprecated`
  // markers the comment-stripped `src` has already removed.
  const rawTypeRhs = new Map<string, string>();
  for (const m of raw.matchAll(
    /\btype ([A-Z][A-Za-z0-9]*)(?:<[^>]*>)?\s*=\s*([^;]+);/g,
  )) {
    rawTypeRhs.set(m[1], m[2]);
  }
  const declarations = [
    ...src.matchAll(
      /\b(export )?type ([A-Z][A-Za-z0-9]*)(?:<[^>]*>)?\s*=\s*([^;]+);/g,
    ),
  ];
  // Resolve same-file literal aliases before registering exported types.
  // Repeat until no new literal unions are found.
  const fileLiterals = new Map<string, string>();
  let previousSize: number;
  do {
    previousSize = fileLiterals.size;
    for (const [, , name, rhsRaw] of declarations) {
      const rhs = rhsRaw
        .replace(/\s+/g, ' ')
        .trim()
        .split('|')
        .map(part => fileLiterals.get(part.trim()) ?? part.trim())
        .join(' | ');

      if (!LITERAL_UNION.test(rhs)) {
        continue;
      }
      const deprecated = deprecatedLiteralMembers(rawTypeRhs.get(name) ?? '');
      fileLiterals.set(
        name,
        rhs
          .replace(/^\|\s*/, '')
          .split('|')
          .map(s => s.trim())
          .filter(Boolean)
          .filter(member => !deprecated.has(member))
          .join(' | '),
      );
    }
  } while (fileLiterals.size !== previousSize);
  for (const [, exported, name, rhsRaw] of declarations) {
    if (!exported) {
      continue;
    }
    const literals = fileLiterals.get(name);
    if (literals !== undefined) {
      literalUnions.set(name, literals);
    } else {
      namedBodies.set(name, rhsRaw.replace(/\s+/g, ' ').trim());
    }
  }
  for (const m of src.matchAll(
    /export interface ([A-Z][A-Za-z0-9]*)(?:<[^>]*>)?\s*(?:extends [^{]+)?\{/g,
  )) {
    const open = src.indexOf('{', m.index);
    let depth = 0;
    let close = open;
    for (; close < src.length; close++) {
      if (src[close] === '{') {
        depth++;
      } else if (src[close] === '}') {
        depth--;
        if (depth === 0) {
          break;
        }
      }
    }
    namedBodies.set(m[1], src.slice(open, close + 1).replace(/\s+/g, ' '));
  }
}

/** Literal unions a consumer must know to author a value of `name`. */
function requiredUnions(
  name: string,
  seen = new Set<string>(),
): Map<string, string> {
  const found = new Map<string, string>();
  if (seen.has(name)) {
    return found;
  }
  seen.add(name);
  const literals = literalUnions.get(name);
  if (literals) {
    found.set(name, literals);
    return found;
  }
  const body = namedBodies.get(name);
  if (!body) {
    return found;
  }
  for (const inner of authoredTypeNames(body)) {
    for (const [k, v] of requiredUnions(inner, seen)) {
      found.set(k, v);
    }
  }
  return found;
}

// --- Source prop declarations, per component directory ---------------------

/**
 * "{dir}::{Component}Props" → prop name → the type expression source declares.
 *
 * Keyed by the exact prop bag, never by directory: Chat/ alone holds
 * ChatComposer, ChatMessage and ChatToolCalls, each with a differently-typed
 * `status`, and judging one component's docs against a sibling's declaration
 * is a false accusation. A component with no `{Name}Props` bag here (Heading
 * re-exports its props from elsewhere) is simply not checked by this pass —
 * a missed prop costs nothing, a wrong failure costs the guard its
 * credibility.
 */
const sourcePropTypes = new Map<string, Map<string, string>>();

/**
 * Bag name → its members, for bags whose name is unique across the package;
 * `null` marks a name declared in more than one place, which is never
 * resolved rather than resolved wrongly.
 *
 * A hook's config bag does not live in the directory its doc does:
 * `useTableSortable.doc.mjs` sits in `Table/`, but `UseTableSortableConfig`
 * is declared in `Table/plugins/sortable/`. Directory-keying alone therefore
 * cannot see it — which is why `sort`, the very prop #1645 was filed about,
 * had no source-side guard at all until this index existed.
 */
const bagsByName = new Map<string, Map<string, string> | null>();

/**
 * Bags a hook's config may be called. Astryx spells it `Use{Name}Config` or
 * `Use{Name}Options` (see UseTableSortableConfig, UsePopoverOptions); the
 * other two are cheap insurance and cost nothing when absent.
 */
const HOOK_BAG_SUFFIXES = ['Config', 'Options', 'Props', 'Params'];

for (const file of findFiles(SRC_DIR, ['.ts', '.tsx'])) {
  if (file.includes('.test.')) {
    continue;
  }
  const dir = file.slice(0, file.lastIndexOf('/'));
  const src = stripComments(readFileSync(file, 'utf8'));
  for (const m of src.matchAll(
    /export (?:interface|type) ([A-Z][A-Za-z0-9]*(?:Props|Config|Options|Params))(?:<[^>]*>)?\s*(?:extends [^{]+|=\s*)?\{/g,
  )) {
    const open = src.indexOf('{', m.index);
    let depth = 0;
    let close = open;
    for (; close < src.length; close++) {
      if (src[close] === '{') {
        depth++;
      } else if (src[close] === '}') {
        depth--;
        if (depth === 0) {
          break;
        }
      }
    }
    const body = src.slice(open + 1, close);
    const byProp = new Map<string, string>();
    // Top-level `name?: Type;` members only — nested object literals would
    // need a real parser, and a missed prop costs nothing here.
    let depthInBody = 0;
    for (const rawLine of body.split(/[;\n]/)) {
      // `=>` is an arrow, not a closing angle bracket: counting it as one
      // drives the depth negative and silently swallows every prop below a
      // callback member. (It did, until this line.)
      const line = rawLine.replace(/=>/g, '');
      const opens = (line.match(/[{(<]/g) || []).length;
      const closes = (line.match(/[})>]/g) || []).length;
      const member = /^\s*([a-z][A-Za-z0-9]*)\??\s*:\s*(.+?)\s*$/.exec(rawLine);
      if (depthInBody === 0 && member) {
        byProp.set(member[1], member[2]);
      }
      depthInBody = Math.max(0, depthInBody + opens - closes);
    }
    sourcePropTypes.set(`${dir}::${m[1]}`, byProp);
    // Second index, keyed by bag name alone, for the cross-directory hook
    // lookup below. A duplicate name poisons the entry: guessing between two
    // declarations is how a guard earns a false accusation.
    bagsByName.set(m[1], bagsByName.has(m[1]) ? null : byProp);
  }
}

/**
 * The type source declares for `Component.prop`, if it can be found.
 *
 * Two lookups, most-specific first:
 *   1. The component's own `{Name}Props` bag in its own directory. Exact, and
 *      the only pass that runs for components — Chat/ holds three differently
 *      typed `status` props, so a directory-wide search would misjudge them.
 *   2. For hooks only (`useThing`), the uniquely-named `UseThingConfig` /
 *      `UseThingOptions` bag, wherever in the package it is declared.
 *
 * Anything else stays undefined and is judged on the doc alone: a missed prop
 * costs nothing, a wrong failure costs the guard its credibility. (Heading
 * re-exports its props and so has no bag here — deliberately unresolved.)
 */
function declaredType(
  dir: string,
  component: string,
  prop: string,
): string | undefined {
  const own = sourcePropTypes.get(`${dir}::${component}Props`)?.get(prop);
  if (own !== undefined) {
    return own;
  }
  if (!/^use[A-Z]/.test(component)) {
    return undefined;
  }
  const pascal = component[0].toUpperCase() + component.slice(1);
  for (const suffix of HOOK_BAG_SUFFIXES) {
    const declared = bagsByName.get(`${pascal}${suffix}`)?.get(prop);
    if (declared !== undefined) {
      return declared;
    }
  }
  return undefined;
}

// --- Doc props -------------------------------------------------------------

const docFiles = findFiles(SRC_DIR, ['.doc.mjs']);

interface DocProp {
  file: string;
  dir: string;
  component: string;
  prop: string;
  type: string;
  description: string;
}

const docProps: DocProp[] = [];
for (const file of docFiles) {
  const mod = require(file) as DocModule;
  // A type is language-neutral: the translated docs carry their own props[]
  // (the `--zh` CLI surface renders them), so they are held to the same bar.
  for (const key of ['docs', 'docsZh'] as const) {
    const docs = mod[key];
    if (!docs) {
      continue;
    }
    const entries = [
      {name: docs.name, props: docs.props},
      ...(docs.components || []),
    ];
    for (const {name, props} of entries) {
      if (!name || !Array.isArray(props)) {
        continue;
      }
      for (const prop of props) {
        if (typeof prop.type !== 'string') {
          continue;
        }
        docProps.push({
          file: `${relative(SRC_DIR, file)}${key === 'docsZh' ? ' (zh)' : ''}`,
          dir: file.slice(0, file.lastIndexOf('/')),
          component: name,
          prop: prop.name,
          type: prop.type,
          description: prop.description || '',
        });
      }
    }
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/** The value members of a union — `null`/`undefined` carry nothing to spell. */
function literalMembers(literals: string): string[] {
  return literals
    .split('|')
    .map(s => s.trim())
    .filter(s => s.startsWith("'") || /^-?\d/.test(s));
}

/**
 * Where a literal has to be written to count as surfaced.
 *
 * `code` — a type column. The literal must appear *as a literal*: quotes
 * intact for strings, digit-boundary-anchored for numbers.
 * `prose` — a free-text description. Quotes are optional (prose may say
 * `direction is ascending or descending`), but the boundary still holds.
 *
 * The boundary is the whole point. A bare `text.includes('sm')` is satisfied
 * by `'xsm'`, and `text.includes('1')` by `1.5` or `10` — so a doc could drop
 * a member and stay "green" purely because a longer sibling contains its
 * characters. Every union whose members share substrings (TextSize, TextType,
 * SpacingStep, IconName) is exposed to that, which is most of them.
 */
type Surface = 'code' | 'prose';

function isSurfaced(text: string, literal: string, surface: Surface): boolean {
  const isString = literal.startsWith("'");
  const inner = isString ? literal.slice(1, -1) : literal;
  if (isString) {
    // In code, the quotes are part of the literal: 'xsm' does not contain
    // the *literal* 'sm', only the characters. In prose they are optional.
    const body = escapeRe(inner);
    return surface === 'code'
      ? new RegExp(`['"\`]${body}['"\`]`).test(text)
      : new RegExp(`(?<![\\w-])${body}(?![\\w-])`).test(text);
  }
  // Numbers: reject a match that is really part of a longer number — `1` must
  // not be found inside `1.5`, `10` or `-1`. A trailing dot is allowed only
  // when it is sentence punctuation ("steps go 0, 0.5, 1."), not a decimal.
  return new RegExp(`(?<![\\w.-])${escapeRe(inner)}(?![\\w-])(?!\\.\\d)`).test(
    text,
  );
}

/** Members of `literals` not written out in `text`. */
function missingFrom(
  text: string,
  literals: string,
  surface: Surface = 'code',
): string[] {
  return literalMembers(literals).filter(
    literal => !isSurfaced(text, literal, surface),
  );
}

interface Violation {
  where: string;
  detail: string;
}

/**
 * Reasons this one prop hides values a reader would have to guess at.
 *
 * `resolveFrom` is the type expression whose unions the reader must know;
 * `type`/`description` are what the docs actually say. They are the same
 * expression for the doc-side pass, and differ for the source-side pass,
 * where the component's own `.tsx` declaration is the authority and the docs
 * are the thing on trial. That second pass is what makes the guard
 * drift-proof: inlined literals go stale the moment the union in source
 * gains a member, and only the source knows that happened.
 *
 * Pure — the synthetic cases below exercise it directly, so the guard is
 * proven to bite without dirtying a real doc.
 */
function hiddenValueReasons(
  type: string,
  description: string,
  resolveFrom: string = type,
): string[] {
  const reasons: string[] = [];
  for (const named of authoredTypeNames(resolveFrom)) {
    for (const [union, literals] of requiredUnions(named)) {
      if (ENUMERATED_IN_PROSE.has(union)) {
        const missing = missingFrom(description, literals, 'prose');
        if (missing.length > 0) {
          reasons.push(
            `${union} is exempt from inlining only while its description ` +
              `enumerates every value; these are missing from the ` +
              `description: ${missing.join(', ')}.`,
          );
        }
      } else if (named === union) {
        // DIRECT: the name is the union. Inlining is always affordable, so
        // the type column is the only surface that counts.
        if (missingFrom(type, literals, 'code').length > 0) {
          reasons.push(
            `names the union ${union} instead of inlining it. ` +
              `Write: "${literals}".`,
          );
        }
      } else if (
        // INDIRECT: the union hides inside a composite. Spell the shape out
        // in the type, or name the values in the description. Each surface is
        // read on its own terms — the type as code, the description as prose —
        // rather than concatenated, so a value half-spelled in one and
        // half-mentioned in the other cannot pass for a value that is written
        // down anywhere.
        literalMembers(literals).some(
          literal =>
            !isSurfaced(type, literal, 'code') &&
            !isSurfaced(description, literal, 'prose'),
        )
      ) {
        reasons.push(
          `${named} hides ${union} = ${literals}, and neither the type nor ` +
            `the description says so. Spell the shape out in the type ` +
            `(preferred for small objects) or name the legal values in the ` +
            `description, so a reader without an IDE can see what is legal.`,
        );
      }
    }
  }
  return reasons;
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];
  for (const {file, dir, component, prop, type, description} of docProps) {
    const where = `${file} — ${component}.${prop}: "${type}"`;
    const seen = new Set<string>();
    const report = (detail: string) => {
      if (!seen.has(detail)) {
        seen.add(detail);
        violations.push({where, detail});
      }
    };
    // Pass 1: what the docs themselves name.
    for (const detail of hiddenValueReasons(type, description)) {
      report(detail);
    }
    // Pass 2: what the component actually declares in source.
    const declared = declaredType(dir, component, prop);
    if (declared) {
      for (const detail of hiddenValueReasons(type, description, declared)) {
        report(`source declares \`${prop}: ${declared}\` — ${detail}`);
      }
    }
  }
  return violations;
}

describe('doc prop types surface their literal values (#1645)', () => {
  it('sanity: finds doc props and literal-union types in source', () => {
    expect(docProps.length).toBeGreaterThan(0);
    expect(literalUnions.size).toBeGreaterThan(0);
  });

  it('sanity: the registries read the real source definitions', () => {
    expect(literalUnions.get('SpacingStep')).toBe(
      '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
    );
    expect(literalUnions.get('TableSortDirection')).toBe(
      "'ascending' | 'descending'",
    );
    // @deprecated members are dropped: SwitchLabelSpacing is
    // `'hug' | 'spread' | (@deprecated) 'default'`, and docs shouldn't have to
    // advertise the deprecated value as a legal option.
    expect(literalUnions.get('SwitchLabelSpacing')).toBe("'hug' | 'spread'");
    expect([...requiredUnions('InputStatus').keys()]).toContain(
      'InputStatusType',
    );
    expect([...requiredUnions('TableSortState').keys()]).toContain(
      'TableSortDirection',
    );
  });

  it('sanity: does not descend into opaque generic wrappers', () => {
    // Button's endContent is ReactElement<IconProps>; the consumer writes
    // <Icon icon="check" />, not an IconProps object, so IconName's 26
    // values are Icon's business, not Button's.
    expect(authoredTypeNames('ReactElement<IconProps>')).toEqual([
      'ReactElement',
    ]);
    expect(authoredTypeNames('Record<string, MarkdownSource>')).toEqual([
      'Record',
    ]);
    expect(
      authoredTypeNames('ReadonlyArray<TableSortEntry<TSortKey>>'),
    ).toEqual(['ReadonlyArray', 'TableSortEntry']);
  });

  it('LITERAL_UNION rejects a long near-miss union in linear time', () => {
    // Every `export type` in the package is fed to this regex, so it must stay
    // cheap on the ones that DON'T match. The dangerous shape is a long literal
    // prefix ending in something that isn't a literal — `'a' | 'b' | … |
    // ComponentType`, the autocomplete escape hatch — which the regex can only
    // reject after trying every way to parse it. An ambiguous pattern has 2^n
    // of those. This union is 24 members long: linear, it is instant; ambiguous,
    // it would outlive the CI job.
    const nearMiss =
      Array.from({length: 24}, (_, i) => `'v${i}'`).join(' | ') +
      ' | ComponentType';
    const start = performance.now();
    expect(LITERAL_UNION.test(nearMiss)).toBe(false);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('no documented prop type hides its legal values', () => {
    const violations = findViolations();
    expect(
      violations,
      violations.map(v => `${v.where}\n    ${v.detail}`).join('\n'),
    ).toEqual([]);
  });

  describe('the guard bites (synthetic props, not real docs)', () => {
    it('flags a bare literal-union name and accepts the inlined form', () => {
      expect(hiddenValueReasons('SpacingStep', 'Gap between items.')).toEqual([
        expect.stringContaining('names the union SpacingStep'),
      ]);
      expect(
        hiddenValueReasons(
          '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          'Gap between items.',
        ),
      ).toEqual([]);
    });

    it('is not fooled by prose alone for a direct union', () => {
      // The #1645 failure mode: prose hints at the scale, the type column
      // still says nothing, and the CLI signature builder (which splits the
      // type on `|`) still has no values to print.
      expect(
        hiddenValueReasons('SpacingStep', 'Steps: 0, 0.5, 1, 1.5, 2, 3, 4.'),
      ).not.toEqual([]);
    });

    it('flags a partially inlined union — one forgotten member is enough', () => {
      // Judged against what source declares, so a doc that drops 'stretch'
      // (or an inlined SpacingStep that misses a step the scale later gains)
      // is caught even though the doc no longer names the type at all.
      expect(
        hiddenValueReasons(
          "'start' | 'center' | 'end'",
          'Alignment.',
          'GridAlignment',
        ),
      ).toEqual([expect.stringContaining('GridAlignment')]);
      expect(
        hiddenValueReasons(
          "'start' | 'center' | 'end' | 'stretch'",
          'Alignment.',
          'GridAlignment',
        ),
      ).toEqual([]);
    });

    it('the source-side pass indexes the real component prop bags', () => {
      const gridDir = docProps.find(p => p.component === 'Grid')!.dir;
      expect(declaredType(gridDir, 'Grid', 'gap')).toBe('SpacingStep');
      expect(declaredType(gridDir, 'Grid', 'align')).toBe('GridAlignment');
    });

    it('never judges a component against a sibling in the same directory', () => {
      // Chat/ declares three differently-typed `status` props. Reading
      // ChatComposer's docs against ChatMessageMetadata's declaration would
      // be a false accusation, so the index is keyed by prop bag, not folder.
      const chatDir = docProps.find(p => p.component === 'ChatComposer')!.dir;
      expect(declaredType(chatDir, 'ChatComposer', 'status')).toBe(
        'ChatComposerStatus',
      );
      expect(declaredType(chatDir, 'ChatMessageMetadata', 'status')).toBe(
        'ChatMessageStatus',
      );
      // Heading re-exports its props, so there is no HeadingProps bag here:
      // the pass must stay silent rather than borrow TextProps.
      const textDir = docProps.find(p => p.component === 'Text')!.dir;
      expect(declaredType(textDir, 'Heading', 'type')).toBeUndefined();
    });

    it('flags a composite that hides a union, and takes either surface', () => {
      expect(hiddenValueReasons('InputStatus', 'Validation status.')).toEqual([
        expect.stringContaining('InputStatus hides InputStatusType'),
      ]);
      // Spelled out in the type…
      expect(
        hiddenValueReasons(
          "{type: 'warning' | 'error' | 'success', message?: string}",
          'Validation status.',
        ),
      ).toEqual([]);
      // …or named in the description.
      expect(
        hiddenValueReasons(
          'InputStatus',
          "Validation status. type is 'warning', 'error', or 'success'.",
        ),
      ).toEqual([]);
    });

    it("catches the issue's headline: sort direction is not 'asc'/'desc'", () => {
      expect(
        hiddenValueReasons(
          'TableSortState<TSortKey>',
          'Ordered array of {sortKey, direction} entries.',
        ),
      ).toEqual([expect.stringContaining("'ascending' | 'descending'")]);
      // The word "descending" contains "ascending"'s literal only as a
      // substring of itself, so a doc naming just one is still flagged.
      expect(
        hiddenValueReasons(
          'TableSortState<TSortKey>',
          "Entries sort 'ascending' by default.",
        ),
      ).toEqual([expect.stringContaining("'ascending' | 'descending'")]);
    });

    it('lets a value-free type through untouched', () => {
      expect(hiddenValueReasons('boolean', 'Disables the control.')).toEqual(
        [],
      );
      expect(hiddenValueReasons('ReactNode', 'Slot content.')).toEqual([]);
      expect(hiddenValueReasons('(value: string) => void', 'Called.')).toEqual(
        [],
      );
    });

    it('a longer sibling literal does not mask a shorter one', () => {
      // A substring match lies: 'sm' looks "present" inside 'xsm', and the
      // spacing step 1 looks "present" inside 1.5 and 10. Both unions below
      // are complete EXCEPT for the masked member — so the *only* thing that
      // can fail them is the guard noticing the masked one is really gone.
      // (Every other member is still listed. A test that drops extra members
      // too would pass on the substring match alone and prove nothing —
      // which is precisely why GridAlignment, whose members share no
      // substrings, cannot exercise this class at all.)
      expect(
        hiddenValueReasons(
          // TextSize without 'sm'. 'xsm' is still there, masking it.
          "'4xs' | '3xs' | '2xs' | 'xsm' | 'base' | 'lg' | 'xl' | '2xl' | " +
            "'3xl' | '4xl'",
          'Size.',
          'TextSize',
        ),
      ).toEqual([expect.stringContaining('TextSize')]);
      expect(
        hiddenValueReasons(
          // SpacingStep without the step 1. 1.5 and 10 still mask it.
          '0 | 0.5 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          'Gap.',
          'SpacingStep',
        ),
      ).toEqual([expect.stringContaining('SpacingStep')]);
      // …and the complete unions still pass, so the boundary match is not
      // simply rejecting everything.
      expect(
        hiddenValueReasons(
          "'4xs' | '3xs' | '2xs' | 'xsm' | 'sm' | 'base' | 'lg' | 'xl' | " +
            "'2xl' | '3xl' | '4xl'",
          'Size.',
          'TextSize',
        ),
      ).toEqual([]);
      expect(
        hiddenValueReasons(
          '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          'Gap.',
          'SpacingStep',
        ),
      ).toEqual([]);
    });

    it('holds the prose exemption to its bargain', () => {
      // IconName may stay named — but only while every value is in the prose.
      const enumerated = docProps.find(
        p => p.component === 'Icon' && p.prop === 'icon',
      );
      expect(enumerated?.type).toContain('IconName');
      expect(
        hiddenValueReasons(enumerated!.type, enumerated!.description),
      ).toEqual([]);
      // Drop the enumeration and the exemption stops covering it.
      expect(
        hiddenValueReasons('IconName | ComponentType<SVGProps>', 'An icon.'),
      ).toEqual([expect.stringContaining('exempt from inlining only while')]);
    });
  });

  /**
   * The synthetic cases above prove the predicate bites. These prove the
   * *shipped docs are actually wired to it* — each one takes a real doc
   * entry, stages the exact drift the PR exists to prevent, and asserts the
   * guard fails. A guard that green-lights the regression it was built to
   * catch is decoration; these are the tests that stop it becoming one.
   */
  describe('the guard bites the real docs when they drift', () => {
    const realProp = (component: string, prop: string): DocProp => {
      const found = docProps.find(
        p =>
          p.component === component &&
          p.prop === prop &&
          !p.file.includes('(zh)'),
      );
      if (!found) {
        throw new Error(`no doc prop ${component}.${prop}`);
      }
      return found;
    };

    /** What source says this doc prop is — the authority drift is judged against. */
    const authority = (p: DocProp): string => {
      const declared = declaredType(p.dir, p.component, p.prop);
      if (!declared) {
        throw new Error(
          `${p.component}.${p.prop} has no source declaration, so nothing ` +
            `holds its inlined literals to the union in source.`,
        );
      }
      return declared;
    };

    it("#1645's headline prop is guarded: useTableSortable.sort", () => {
      // The hook's config bag is UseTableSortableConfig, and it lives in
      // Table/plugins/sortable/ while the doc sits in Table/ — so this only
      // resolves because the source pass looks past `{Name}Props` *and* past
      // the doc's own directory.
      const sort = realProp('useTableSortable', 'sort');
      expect(authority(sort)).toBe('TableSortState<TSortKey>');
      // The shipped doc is honest today…
      expect(
        hiddenValueReasons(sort.type, sort.description, authority(sort)),
      ).toEqual([]);
      // …and the moment it stops naming 'descending', the guard fails. This
      // is the doc lying about the legal sort values all over again — the
      // literal bug #1645 was filed for.
      const stale = (s: string) => s.replace(/'?descending'?/g, '');
      expect(stale(sort.type)).not.toBe(sort.type);
      expect(
        hiddenValueReasons(
          stale(sort.type),
          stale(sort.description),
          authority(sort),
        ),
      ).toEqual([expect.stringContaining("'ascending' | 'descending'")]);
    });

    it('Timestamp.size cannot quietly lose a step masked by a sibling', () => {
      const size = realProp('Timestamp', 'size');
      expect(authority(size)).toBe('TextSize');
      expect(
        hiddenValueReasons(size.type, size.description, authority(size)),
      ).toEqual([]);
      // Delete 'sm'. A substring match calls it present — 'xsm' contains it.
      const stale = size.type.replace("'sm' | ", '');
      expect(stale).not.toBe(size.type);
      expect(stale).toContain("'xsm'");
      expect(
        hiddenValueReasons(stale, size.description, authority(size)),
      ).toEqual([expect.stringContaining('TextSize')]);
    });

    /**
     * The two props that must NOT be inlined. Everything else in this file
     * pushes toward spelling unions out; these two push back, because the
     * docsite playground reads `type` to choose a control. What each one is
     * really protecting differs, and the specifics live next to the playground
     * itself — see apps/docsite/src/__tests__/component-prop-controls.test.ts,
     * which exercises the actual gate. These only pin the doc's shape, so the
     * next person to "finish the job" trips here first.
     */
    it('AppShell.mobileNav stays a bare ReactNode (the editor hides on an exact string)', () => {
      const nav = realProp('AppShell', 'mobileNav');
      // PropertyEditor's UNSUPPORTED_PROP_TYPES is a Set of exact type strings.
      // Widening drops that match, and the prop would then be hidden only by
      // the second, incidental gate (its slotElements). Keep the exact string.
      expect(nav.type).toBe('ReactNode');
      // The values still have to be discoverable — they live in the prose.
      expect(nav.description).toContain('breakpoint');
      expect(nav.description).toContain("'md'");
    });

    it('Lightbox.media keeps naming its type (spelling it out yields a string control)', () => {
      const media = realProp('Lightbox', 'media');
      expect(media.type).toBe('LightboxMedia | LightboxMedia[]');
      // Same bargain as IconName: named is allowed only while the prose
      // carries the values a consumer must write.
      expect(media.description).toContain("'image'");
      expect(media.description).toContain("'video'");
    });

    it('Grid.gap cannot quietly lose the step 1, masked by 1.5 and 10', () => {
      const gap = realProp('Grid', 'gap');
      expect(authority(gap)).toBe('SpacingStep');
      expect(
        hiddenValueReasons(gap.type, gap.description, authority(gap)),
      ).toEqual([]);
      const stale = gap.type.replace('1 | 1.5', '1.5');
      expect(stale).not.toBe(gap.type);
      expect(stale).toContain('1.5');
      expect(stale).toContain('10');
      expect(
        hiddenValueReasons(stale, gap.description, authority(gap)),
      ).toEqual([expect.stringContaining('SpacingStep')]);
    });
  });
});
