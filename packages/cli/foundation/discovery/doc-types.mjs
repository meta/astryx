// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Check each authored doc against its published authoring type.
 *
 * The compiler is the project's own `typescript`, resolved from the
 * directories the caller names. Without it nothing is checked and the report
 * says why: it never passes silently. The types are the ones this CLI
 * publishes as `@astryxdesign/cli/authoring`, so a doc is checked against what
 * the CLI that reads it documents.
 *
 * Each doc file's value (the export its root reads) is checked the way
 * TypeScript checks `value satisfies Type` against the published type for its
 * kind, so a doc passes exactly when `tsc` would accept it with that type, and
 * an unknown field, a missing required field, and a value outside a field's
 * type are each reported:
 * - components root: `ComponentDoc` (read as TypeScript reads the union, with
 *   the member the doc's shape names, so messages are about that member); its
 *   `docsZh` and `docsDense` translations against `ComponentTranslationDoc`,
 *   or, when a translation carries props, `ComponentDoc` with no field
 *   required but each prop's and sub-component entry's `name`, as the CLI
 *   overlays them on the base doc by name;
 * - hooks (Core): `HookDoc`, translations against `HookTranslationDoc`;
 * - templates root: `IntegrationTemplateDoc` (`TemplateDoc`, whose `category`
 *   is a `TemplateCategory` value, for Core's own templates);
 * - docs root: the type the doc's `type` names (`ReferenceDoc` when it names
 *   none), and a `<topic>.doc.<lang>.mjs` overlay against
 *   `ReferenceTranslationDoc`;
 * - themes root: `ThemeDoc`;
 * - iconSets root: `IconSetDoc`.
 * Every finding is a warning, names the field, and says how to fix it.
 *
 * @input Doc files with the root each was found in, the package root, and the
 *   directories to resolve `typescript` from.
 * @output A DocTypesReport.
 * @position The check `astryx doctor integration validate` runs on an
 *   integration's docs, and the Astryx repository's test runs on Core's own.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  resolveProjectTypeScript,
  TYPESCRIPT_FIX,
  unusableTypeScriptReason,
} from './project-typescript.mjs';

/**
 * @typedef {'components' | 'hooks' | 'templates' | 'docs' | 'docs-overlay' | 'themes' | 'icon-sets'} DocRoot
 */

/**
 * @typedef {object} DocFile
 * @property {string} path absolute path to the doc file
 * @property {DocRoot} root the contribution root it was found in
 */

/**
 * @typedef {'unknown_field' | 'missing_field' | 'wrong_type'} DocTypeProblem
 */

/**
 * @typedef {object} DocTypeFinding
 * @property {string} doc the doc file, relative to the package root
 * @property {number} line 1-based line of the field (or of the doc value)
 * @property {string} export the export checked (`default`, `docs`, `docsZh`, …)
 * @property {string} type the authoring type it was checked against
 * @property {string} field the field's path in the doc, such as
 *   `usage.bestPractices[2].guidance`; empty for the doc value as a whole
 * @property {DocTypeProblem} problem
 * @property {'warning'} severity
 * @property {string} message what TypeScript reports, shortened
 * @property {string} fix what to change
 */

/**
 * @typedef {object} DocTypesUnchecked
 * @property {string} doc the doc file, relative to the package root
 * @property {string} reason why it was not checked
 */

/**
 * @typedef {object} DocTypesReport
 * @property {'checked' | 'skipped'} status `skipped` means nothing was checked,
 *   and `reason` says why
 * @property {string} [reason]
 * @property {string} [typescript] the version of the compiler that checked
 * @property {number} docs how many doc values were checked
 * @property {DocTypeFinding[]} findings
 * @property {DocTypesUnchecked[]} unchecked doc files with nothing to check,
 *   or not fully checked
 */

/** The line both surfaces print when the compiler is missing. */
export const DOC_TYPES_TYPESCRIPT_MISSING_REASON = `TypeScript is not installed in this project, so docs were not checked against the authoring types. ${TYPESCRIPT_FIX}`;

const AUTHORING = '@astryxdesign/cli/authoring';
const AUTHORING_TYPES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'authoring',
  'index.d.ts',
);

const TRANSLATIONS = ['docsZh', 'docsDense'];

/** How each root's module names its doc, in the readers' precedence order. */
const MAIN_EXPORTS = {
  components: ['default', 'docs'],
  hooks: ['default', 'docs'],
  templates: ['default', 'doc'],
  docs: ['docs', 'default'],
  'docs-overlay': [],
  themes: ['default', 'doc', 'docs'],
  'icon-sets': ['default'],
};

/** The type a docs-root doc's `type` stamp names. */
const DOCS_ROOT_TYPES = {
  generic: 'ReferenceDoc',
  namespace: 'NamespaceDoc',
  function: 'FunctionDoc',
  schema: 'SchemaDoc',
  command: 'CommandDoc',
  enum: 'EnumDoc',
  theme: 'ThemeDoc',
  component: 'ComponentDoc',
  page: 'IntegrationTemplateDoc',
  block: 'IntegrationTemplateDoc',
};

/**
 * Each pass sets aside at least one more field, so a doc needs at most one
 * pass per field. One still finding new problems after this many is listed as
 * not fully checked.
 */
const MAX_PASSES = 50;

/** TypeScript's assignability diagnostics: the only ones reported. */
const RELEVANT = new Set([
  1360, 2322, 2353, 2559, 2561, 2739, 2740, 2741, 2820,
]);

/**
 * @typedef {object} Target
 * @property {string} exportName
 * @property {any} node the doc value's expression
 * @property {string} typeExpr the authoring type, as a type expression
 * @property {string} typeName how findings name that type
 * @property {any[]} blank nodes whose leading JSDoc annotations are blanked
 * @property {Array<[number, number]>} blankRanges source ranges to blank
 */

/**
 * @param {string} name
 */
const authoring = name => `import('${AUTHORING}').${name}`;

/**
 * The top-level property names and `type` stamp of an object literal, or null
 * when the value is not one.
 * @param {any} ts
 * @param {any} node
 * @returns {{names: Set<string>, stamp: string | null, componentsWithProps: boolean} | null}
 */
function shapeOf(ts, node) {
  if (!ts.isObjectLiteralExpression(node)) return null;
  const names = new Set();
  /** @type {string | null} */
  let stamp = null;
  let componentsWithProps = false;
  for (const property of node.properties) {
    const key = property.name ? propertyName(ts, property.name) : null;
    if (key == null) continue;
    names.add(key);
    if (
      key === 'type' &&
      ts.isPropertyAssignment(property) &&
      ts.isStringLiteralLike(property.initializer)
    ) {
      stamp = property.initializer.text;
    }
    if (
      key === 'components' &&
      ts.isPropertyAssignment(property) &&
      ts.isArrayLiteralExpression(property.initializer)
    ) {
      componentsWithProps = property.initializer.elements.some(
        (/** @type {any} */ element) =>
          ts.isObjectLiteralExpression(element) &&
          element.properties.some(
            (/** @type {any} */ p) =>
              p.name && propertyName(ts, p.name) === 'props',
          ),
      );
    }
  }
  return {names, stamp, componentsWithProps};
}

/**
 * @param {any} ts
 * @param {any} name
 * @returns {string | null}
 */
function propertyName(ts, name) {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteralLike(name) ||
    ts.isNumericLiteral(name) ||
    ts.isPrivateIdentifier?.(name)
  ) {
    return name.text;
  }
  return null;
}

/**
 * The `ComponentDoc` member a doc's shape selects (`subComponentOf`,
 * `components`, `props`), widened by every field the other members declare,
 * typed `unknown`. That is how TypeScript reads a value against the union:
 * a field any member declares is not unknown, and the value must be
 * assignable to one member. Picking the member keeps the messages about it
 * (`SingleComponentDoc requires displayName`) instead of whichever member
 * TypeScript guesses.
 * @param {{names: Set<string>} | null} shape
 * @returns {{typeExpr: string, typeName: string}}
 */
function componentType(shape) {
  const union = authoring('ComponentDoc');
  const member = shape?.names.has('subComponentOf')
    ? `Extract<${union}, {subComponentOf: string}>`
    : shape && shape.names.has('components') && !shape.names.has('props')
      ? authoring('MultiComponentDoc')
      : shape && !shape.names.has('components')
        ? authoring('SingleComponentDoc')
        : null;
  if (!member) return {typeExpr: union, typeName: 'ComponentDoc'};
  const allKeys = `(${union} extends infer U ? U extends unknown ? keyof U : never : never)`;
  return {
    typeExpr: `${member} & Partial<Record<Exclude<${allKeys}, keyof ${member}>, unknown>>`,
    typeName: 'ComponentDoc',
  };
}

/**
 * The authoring type one doc value is checked against.
 * @param {any} ts
 * @param {DocRoot} root
 * @param {string} exportName
 * @param {any} node
 * @param {boolean} [core] the docs are Core's own
 * @returns {{typeExpr: string, typeName: string}}
 */
function expectedType(ts, root, exportName, node, core = false) {
  const shape = shapeOf(ts, node);
  const translation = TRANSLATIONS.includes(exportName);
  if (root === 'components') {
    if (
      translation &&
      !(shape?.names.has('props') || shape?.componentsWithProps)
    ) {
      return {
        typeExpr: authoring('ComponentTranslationDoc'),
        typeName: 'ComponentTranslationDoc',
      };
    }
    // A translation with props overlays the base doc, which supplies every
    // field it leaves out: each field it writes must match, none is required.
    // Props and sub-component entries merge by `name`, the base doc keeping
    // each prop's `type`, so an entry needs only its `name`.
    if (translation) {
      const full = componentType(shape);
      const prop = `Partial<${authoring('ComponentPropDoc')}> & {name: string}`;
      const entry = `Partial<Omit<${authoring('ComponentEntry')}, 'props'>> & {name: string; props?: Array<${prop}>}`;
      return {
        typeExpr: `Omit<Partial<${full.typeExpr}>, 'props' | 'components'> & {props?: Array<${prop}>; components?: Array<${entry}>}`,
        typeName: full.typeName,
      };
    }
    return componentType(shape);
  }
  if (root === 'hooks') {
    if (translation && !shape?.names.has('params')) {
      return {
        typeExpr: authoring('HookTranslationDoc'),
        typeName: 'HookTranslationDoc',
      };
    }
    if (translation) {
      return {
        typeExpr: `Partial<${authoring('HookDoc')}>`,
        typeName: 'HookDoc',
      };
    }
    return {typeExpr: authoring('HookDoc'), typeName: 'HookDoc'};
  }
  if (root === 'templates') {
    const typeName = core ? 'TemplateDoc' : 'IntegrationTemplateDoc';
    return {typeExpr: authoring(typeName), typeName};
  }
  if (root === 'docs-overlay') {
    return {
      typeExpr: authoring('ReferenceTranslationDoc'),
      typeName: 'ReferenceTranslationDoc',
    };
  }
  if (root === 'themes') {
    return {typeExpr: authoring('ThemeDoc'), typeName: 'ThemeDoc'};
  }
  if (root === 'icon-sets') {
    return {typeExpr: authoring('IconSetDoc'), typeName: 'IconSetDoc'};
  }
  if (translation) {
    return {
      typeExpr: authoring('ReferenceTranslationDoc'),
      typeName: 'ReferenceTranslationDoc',
    };
  }
  const named =
    shape?.stamp != null
      ? /** @type {Record<string, string>} */ (DOCS_ROOT_TYPES)[shape.stamp]
      : undefined;
  if (named === 'ComponentDoc') return componentType(shape);
  const typeName =
    core && named === 'IntegrationTemplateDoc'
      ? 'TemplateDoc'
      : (named ?? 'ReferenceDoc');
  return {typeExpr: authoring(typeName), typeName};
}

/**
 * The exported values of a module, by export name: each statement and the
 * expression it exports.
 * @param {any} ts
 * @param {any} sf
 * @returns {Map<string, {statement: any, expression: any}>}
 */
function moduleExports(ts, sf) {
  /** @type {Map<string, {statement: any, expression: any}>} */
  const locals = new Map();
  /** @type {Map<string, {statement: any, expression: any}>} */
  const exported = new Map();
  for (const statement of sf.statements) {
    if (ts.isVariableStatement(statement)) {
      const isExported = statement.modifiers?.some(
        (/** @type {any} */ m) => m.kind === ts.SyntaxKind.ExportKeyword,
      );
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer)
          continue;
        const entry = {statement, expression: declaration.initializer};
        locals.set(declaration.name.text, entry);
        if (isExported) exported.set(declaration.name.text, entry);
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      exported.set('default', {statement, expression: statement.expression});
    }
  }
  for (const statement of sf.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        const local = (element.propertyName ?? element.name).text;
        const entry = locals.get(local);
        if (entry) exported.set(element.name.text, entry);
      }
    }
  }
  // `export default docs` exports a local's initializer.
  for (const [name, entry] of exported) {
    let expression = entry.expression;
    for (let hop = 0; hop < 3 && ts.isIdentifier(expression); hop++) {
      const local = locals.get(expression.text);
      if (!local) break;
      expression = local.expression;
      exported.set(name, {statement: local.statement, expression});
    }
  }
  return exported;
}

/**
 * Strip the wrappers around a doc value (parentheses, `satisfies`, `as`,
 * JSDoc casts), returning the value and the wrappers.
 * @param {any} ts
 * @param {any} expression
 */
function unwrap(ts, expression) {
  /** @type {any[]} */
  const wrappers = [];
  let node = expression;
  for (;;) {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(node)) ||
      (ts.isTypeAssertionExpression && ts.isTypeAssertionExpression(node))
    ) {
      wrappers.push(node);
      node = node.expression;
      continue;
    }
    return {node, wrappers};
  }
}

/**
 * The doc values one file holds, with the type each is checked against.
 * @param {any} ts
 * @param {any} sf
 * @param {DocRoot} root
 * @param {boolean} [core] the docs are Core's own
 * @returns {Target[]}
 */
function targetsOf(ts, sf, root, core = false) {
  const exported = moduleExports(ts, sf);
  /** @type {string[]} */
  const names = [];
  const main = MAIN_EXPORTS[root].find(name => exported.has(name));
  if (main) names.push(main);
  if (root !== 'templates' && root !== 'themes' && root !== 'icon-sets') {
    for (const name of TRANSLATIONS) if (exported.has(name)) names.push(name);
  }
  /** @type {Target[]} */
  const targets = [];
  const seen = new Set();
  for (const exportName of names) {
    const entry = /** @type {{statement: any, expression: any}} */ (
      exported.get(exportName)
    );
    const {node, wrappers} = unwrap(ts, entry.expression);
    if (seen.has(node)) continue;
    seen.add(node);
    /** @type {Array<[number, number]>} */
    const blankRanges = [];
    for (const wrapper of wrappers) {
      if (ts.isTypeAssertionExpression?.(wrapper)) {
        // `<X>` before the value.
        blankRanges.push([
          wrapper.getStart(sf),
          wrapper.expression.getStart(sf),
        ]);
      } else if (
        // ` satisfies X` / ` as X` after the value.
        !ts.isParenthesizedExpression(wrapper) &&
        !ts.isNonNullExpression(wrapper) &&
        wrapper.end > wrapper.expression.end
      ) {
        blankRanges.push([wrapper.expression.end, wrapper.end]);
      }
    }
    // The variable's own annotation: `const docs: ReferenceDoc = …`.
    for (const declaration of ts.isVariableStatement(entry.statement)
      ? entry.statement.declarationList.declarations
      : []) {
      if (declaration.initializer === entry.expression && declaration.type) {
        blankRanges.push([declaration.name.end, declaration.type.end]);
      }
    }
    targets.push({
      exportName,
      node,
      ...expectedType(ts, root, exportName, node, core),
      blank: [entry.statement, ...wrappers],
      blankRanges,
    });
  }
  return targets;
}

/**
 * The file's text with each doc value wrapped in a `satisfies` check of its
 * type, the authors' own type annotations on it blanked (so a value is checked
 * once, against the type for its root), and a map back to the original text.
 * `removed` ranges (unknown fields already reported) are blanked too, and
 * `casts` ranges (values already reported outside their type) are cast to
 * `any`, so the next pass reports what TypeScript stopped at them to report.
 * Blanking keeps every offset, so lines and fields map back unchanged.
 * @param {any} ts
 * @param {any} sf
 * @param {Target[]} targets
 * @param {boolean} isTs
 * @param {Array<[number, number]>} [removed]
 * @param {Array<[number, number]>} [casts]
 */
function instrument(ts, sf, targets, isTs, removed = [], casts = []) {
  const text = sf.text;
  const chars = text.split('');
  const blank = (/** @type {number} */ from, /** @type {number} */ to) => {
    for (let i = from; i < to; i++)
      if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
  };
  for (const [from, to] of removed) blank(from, to);
  for (const target of targets) {
    for (const node of target.blank) {
      for (const range of ts.getLeadingCommentRanges(text, node.pos) ?? []) {
        const comment = text.slice(range.pos, range.end);
        if (
          comment.startsWith('/**') &&
          /@(?:type|satisfies)\b/.test(comment)
        ) {
          blank(range.pos, range.end);
        }
      }
    }
    for (const [from, to] of target.blankRanges) blank(from, to);
  }
  /** @type {Array<{at: number, text: string}>} */
  const insertions = [];
  for (const target of targets) {
    const start = target.node.getStart(sf);
    if (isTs) {
      insertions.push({at: start, text: '('});
      insertions.push({
        at: target.node.end,
        text: `) satisfies ${target.typeExpr}`,
      });
    } else {
      insertions.push({
        at: start,
        text: `/** @satisfies {${target.typeExpr}} */ (`,
      });
      insertions.push({at: target.node.end, text: ')'});
    }
  }
  for (const [from, to] of casts) {
    insertions.push({at: from, text: isTs ? '(' : '/** @type {any} */ ('});
    insertions.push({at: to, text: isTs ? ' as any)' : ')'});
  }
  insertions.sort((a, b) => a.at - b.at);
  let out = '';
  let cursor = 0;
  for (const insertion of insertions) {
    out += chars.slice(cursor, insertion.at).join('') + insertion.text;
    cursor = insertion.at;
  }
  out += chars.slice(cursor).join('');
  /** @param {number} virtual */
  const toOriginal = virtual => {
    let shift = 0;
    for (const insertion of insertions) {
      const virtualAt = insertion.at + shift;
      if (virtual < virtualAt) return virtual - shift;
      if (virtual < virtualAt + insertion.text.length) return insertion.at;
      shift += insertion.text.length;
    }
    return virtual - shift;
  };
  return {text: out, toOriginal};
}

/**
 * The path from a doc value to the field at `pos`: `a.b[2].c`.
 * @param {any} ts
 * @param {any} sf
 * @param {any} root
 * @param {number} pos
 */
function fieldPathAt(ts, sf, root, pos) {
  /** @type {Array<string | number>} */
  const parts = [];
  let node = root;
  for (;;) {
    /** @type {any} */
    let next;
    ts.forEachChild(node, (/** @type {any} */ child) => {
      if (!next && child.getStart(sf) <= pos && pos < child.end) next = child;
    });
    if (!next) break;
    if (ts.isArrayLiteralExpression(node))
      parts.push(node.elements.indexOf(next));
    if (
      (ts.isPropertyAssignment(next) ||
        ts.isShorthandPropertyAssignment(next) ||
        ts.isMethodDeclaration(next)) &&
      next.name
    ) {
      const key = propertyName(ts, next.name);
      if (key != null) parts.push(key);
    }
    node = next;
  }
  return parts;
}

/** @param {Array<string | number>} parts */
function formatPath(parts) {
  return parts
    .map((part, i) =>
      typeof part === 'number' ? `[${part}]` : i === 0 ? part : `.${part}`,
    )
    .join('');
}

/**
 * Shorten long quoted types in a TypeScript message.
 * @param {string} message
 */
function shorten(message) {
  return message
    .replace(/\s+/g, ' ')
    .replace(/'([^']{90,})'/g, (_, type) => `'${type.slice(0, 70)}…'`)
    .trim();
}

/**
 * Every message in a diagnostic's chain, outermost first.
 * @param {any} ts
 * @param {any} messageText
 * @returns {string[]}
 */
function chainOf(ts, messageText) {
  if (typeof messageText === 'string') return [messageText];
  /** @type {string[]} */
  const out = [];
  /** @param {any} chain */
  const visit = chain => {
    out.push(chain.messageText);
    if (chain.next?.length) visit(chain.next[0]);
  };
  visit(messageText);
  return out;
}

/**
 * The source range of the property whose name holds `pos`, with the comma
 * after it, or null.
 * @param {any} ts
 * @param {any} sf
 * @param {any} root
 * @param {number} pos
 * @returns {[number, number] | null}
 */
function propertyRangeAt(ts, sf, root, pos) {
  /** @type {any} */
  let found = null;
  let node = root;
  for (;;) {
    /** @type {any} */
    let next;
    ts.forEachChild(node, (/** @type {any} */ child) => {
      if (!next && child.getStart(sf) <= pos && pos < child.end) next = child;
    });
    if (!next) break;
    if (
      (ts.isPropertyAssignment(next) ||
        ts.isShorthandPropertyAssignment(next) ||
        ts.isMethodDeclaration(next)) &&
      next.name &&
      next.name.getStart(sf) <= pos &&
      pos < next.name.end
    ) {
      found = next;
    }
    node = next;
  }
  if (!found) return null;
  let end = found.end;
  const text = sf.text;
  let i = end;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] === ',') end = i + 1;
  return [found.getStart(sf), end];
}

/**
 * The source range of the value a diagnostic at `pos` is about: the value of
 * the property whose name holds `pos`, else the array element that holds it,
 * or null.
 * @param {any} ts
 * @param {any} sf
 * @param {any} root
 * @param {number} pos
 * @returns {[number, number] | null}
 */
function valueRangeAt(ts, sf, root, pos) {
  /** @type {any} */
  let found = null;
  let node = root;
  for (;;) {
    /** @type {any} */
    let next;
    ts.forEachChild(node, (/** @type {any} */ child) => {
      if (!next && child.getStart(sf) <= pos && pos < child.end) next = child;
    });
    if (!next) break;
    if (
      ts.isPropertyAssignment(next) &&
      next.name.getStart(sf) <= pos &&
      pos < next.name.end
    ) {
      found = next.initializer;
    } else if (ts.isArrayLiteralExpression(node)) {
      found = next;
    }
    node = next;
  }
  if (!found || found === root) return null;
  return [found.getStart(sf), found.end];
}

/**
 * The source range of the innermost object literal, below the doc value
 * itself, that holds `pos`, or null.
 * @param {any} ts
 * @param {any} sf
 * @param {any} root
 * @param {number} pos
 * @returns {[number, number] | null}
 */
function objectRangeAt(ts, sf, root, pos) {
  /** @type {any} */
  let found = null;
  let node = root;
  for (;;) {
    /** @type {any} */
    let next;
    ts.forEachChild(node, (/** @type {any} */ child) => {
      if (!next && child.getStart(sf) <= pos && pos < child.end) next = child;
    });
    if (!next) break;
    if (ts.isObjectLiteralExpression(next)) found = next;
    node = next;
  }
  if (!found || found === root) return null;
  return [found.getStart(sf), found.end];
}

/**
 * The module a file re-exports one of `names` from (`export {default} from
 * './x.mjs'`, or `export * from`), or null.
 * @param {any} ts
 * @param {any} sf
 * @param {string[]} names
 * @returns {string | null}
 */
function reexportSource(ts, sf, names) {
  for (const statement of sf.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const clause = statement.exportClause;
    if (
      clause == null ||
      (ts.isNamedExports(clause) &&
        clause.elements.some(
          /** @param {any} element */ element =>
            names.includes(element.name.text),
        ))
    ) {
      return statement.moduleSpecifier.text;
    }
  }
  return null;
}

/**
 * A message with each quoted object type that holds a set-aside `any`
 * replaced by "this value".
 * @param {string} message
 */
function unquoteSetAside(message) {
  return message
    .replace(/\btype '\{[^']*\bany\b[^']*\}'/g, 'this value')
    .replace(/^Type '\{[^']*\bany\b[^']*\}'/, 'This value');
}

/**
 * A property name as TypeScript prints it, without the quotes a quoted key
 * keeps (`"keyword"`).
 * @param {string} name
 */
function unquote(name) {
  return name.replace(/^"(.*)"$/, '$1');
}

/**
 * Findings for one diagnostic.
 * @param {any} ts
 * @param {any} diagnostic
 * @param {Array<string | number>} astPath
 * @param {{root: DocRoot, doc: string, line: number, exportName: string, typeName: string}} where
 * @returns {DocTypeFinding[]}
 */
function findingsFor(ts, diagnostic, astPath, where) {
  // The widened member reads as the member itself.
  const chain = chainOf(ts, diagnostic.messageText).map(message =>
    message.replace(/ & Partial<Record<[^']*/g, ''),
  );
  // "Types of property 'x' are incompatible." steps further down the doc.
  const below = chain
    .map(
      message =>
        /^Types of property '([^']+)' are incompatible/.exec(message)?.[1],
    )
    .filter(key => key != null);
  const parts = [...astPath];
  for (const key of below)
    if (parts[parts.length - 1] !== key)
      parts.push(/** @type {string} */ (key));
  const leaf = chain[chain.length - 1];
  const base = {
    doc: where.doc,
    line: where.line,
    export: where.exportName,
    type: where.typeName,
    severity: /** @type {const} */ ('warning'),
  };

  const missing =
    /Property '([^']+)' is missing in type/.exec(leaf)?.[1] != null
      ? [/Property '([^']+)' is missing in type/.exec(leaf)?.[1]]
      : /is missing the following properties from type '[^']*': (.+?)(?:, and \d+ more)?\.?$/
          .exec(leaf)?.[1]
          ?.split(', ');
  if (missing?.length) {
    const owner = /required in type '([^']+)'|from type '([^']+)'/.exec(leaf);
    const named = owner?.[1] ?? owner?.[2];
    const ownerType =
      named != null && /^[A-Za-z_$][\w$]*$/.test(named)
        ? named
        : where.typeName;
    // One diagnostic can list several missing fields; each finding's message
    // names only its own field, so two findings never share one message.
    const source = /^Type '(.*)' is missing the following properties/.exec(
      leaf,
    )?.[1];
    return missing.map(name => {
      const key = unquote(/** @type {string} */ (name));
      const field = formatPath([...parts, key]);
      const message =
        missing.length > 1
          ? `Property '${key}' is missing${source == null ? '' : ` in type '${source}'`} but required in type '${ownerType}'.`
          : leaf;
      return {
        ...base,
        field,
        problem: /** @type {const} */ ('missing_field'),
        message: shorten(message),
        fix: `Add \`${field}\`: ${shorten(ownerType)} requires it.`,
      };
    });
  }

  const unknown =
    /Object literal may only specify known properties, (?:and|but) '([^']+)' does not exist in type '([^']+)'(?:\. Did you mean to write '([^']+)'\?)?/.exec(
      chain.find(message =>
        /Object literal may only specify known properties/.test(message),
      ) ?? '',
    );
  if (unknown) {
    const key = unquote(unknown[1]);
    const owner = /^[A-Za-z_$][\w$]*$/.test(unknown[2])
      ? unknown[2]
      : where.typeName;
    const suggestion = unknown[3] == null ? undefined : unquote(unknown[3]);
    if (parts[parts.length - 1] !== key) parts.push(key);
    const field = formatPath(parts);
    return [
      {
        ...base,
        field,
        problem: 'unknown_field',
        message: shorten(leaf),
        fix: suggestion
          ? `Rename \`${field}\` to \`${suggestion}\`.`
          : `Remove \`${field}\`: ${shorten(owner)} has no field \`${key}\`.`,
      },
    ];
  }

  const field = formatPath(parts);
  const didYouMean = /Did you mean '([^']+)'\?/.exec(chain.join(' '))?.[1];
  const assignable = [...chain]
    .reverse()
    .map(message => /is not assignable to type '([^']+)'/.exec(message)?.[1])
    .find(type => type != null);
  let fix;
  if (field === 'type' && where.root === 'components') {
    fix =
      "This doc is in the components root, so it is a component doc: set type: 'component', or move it to the docs root.";
  } else if (didYouMean) {
    fix = `Change \`${field || 'the doc'}\` to ${didYouMean}.`;
  } else if (assignable) {
    fix = `Change \`${field || 'the doc'}\` to a value of type ${shorten(`'${assignable}'`).slice(1, -1)}.`;
  } else {
    fix = `Make \`${field || 'the doc'}\` match ${where.typeName}.`;
  }
  return [
    {
      ...base,
      field,
      problem: 'wrong_type',
      message: shorten(leaf),
      fix,
    },
  ];
}

/**
 * Check each doc file's values against the published authoring types.
 * @param {DocFile[]} files
 * @param {{packageDir: string, resolveFrom: Array<string | null | undefined>, core?: boolean}} options
 *   `core`: the docs are Core's own, so templates are held to TemplateDoc
 * @returns {Promise<DocTypesReport>}
 */
export async function checkDocTypes(files, options) {
  const {packageDir, resolveFrom, core = false} = options;
  // With no doc files there is nothing to check, TypeScript or not.
  if (files.length === 0) {
    return {status: 'checked', docs: 0, findings: [], unchecked: []};
  }
  const compiler = resolveProjectTypeScript(resolveFrom);
  if (!compiler?.ts) {
    return {
      status: 'skipped',
      reason: compiler
        ? unusableTypeScriptReason(compiler.version, 'docs were not checked')
        : DOC_TYPES_TYPESCRIPT_MISSING_REASON,
      docs: 0,
      findings: [],
      unchecked: [],
    };
  }
  const {ts, version} = compiler;
  const [major = 0, minor = 0] = String(ts.versionMajorMinor ?? version)
    .split('.')
    .map(Number);
  const hasJs = files.some(file => !/\.ts$/.test(file.path));
  // Every doc is checked with `satisfies`, which needs TypeScript 4.9; its
  // JSDoc form, for a JavaScript doc, needs 5.0.
  const [needMajor, needMinor] = hasJs ? [5, 0] : [4, 9];
  if (major < needMajor || (major === needMajor && minor < needMinor)) {
    return {
      status: 'skipped',
      reason: `TypeScript ${version} cannot check ${hasJs ? 'a JavaScript doc' : 'a doc'} against its type (that needs TypeScript ${needMajor}.${needMinor} or later), so docs were not checked. ${TYPESCRIPT_FIX}`,
      docs: 0,
      findings: [],
      unchecked: [],
    };
  }
  const rel = (/** @type {string} */ file) =>
    path.relative(packageDir, file).split(path.sep).join('/');

  /**
   * @typedef {object} Entry
   * @property {DocFile} file
   * @property {any} sf the original source
   * @property {Target[]} targets
   * @property {boolean} isTs
   * @property {{text: string, toOriginal: (v: number) => number}} virtual
   * @property {any} virtualSf
   * @property {Array<[number, number]>} removed
   * @property {Array<[number, number]>} casts
   * @property {Set<string>} seen
   */
  /** @type {Map<string, Entry>} */
  const instrumented = new Map();
  /** @type {DocTypesUnchecked[]} */
  const unchecked = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file.path, 'utf8');
    } catch (err) {
      unchecked.push({
        doc: rel(file.path),
        reason: `it cannot be read: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    const isTs = /\.ts$/.test(file.path);
    const sf = ts.createSourceFile(
      file.path,
      text,
      ts.ScriptTarget.Latest,
      true,
      isTs ? ts.ScriptKind.TS : ts.ScriptKind.JS,
    );
    const targets = targetsOf(ts, sf, file.root, core);
    if (targets.length === 0) {
      const names = MAIN_EXPORTS[file.root];
      const from = reexportSource(ts, sf, [...names, ...TRANSLATIONS]);
      unchecked.push({
        doc: rel(file.path),
        reason: from
          ? `it re-exports its doc from ${from}, which this check does not follow, so it was not checked`
          : names.length > 0
            ? `it exports no doc the CLI reads (${names.join(' or ')})`
            : `it exports no translation the CLI reads (${TRANSLATIONS.join(' or ')})`,
      });
      continue;
    }
    const virtual = instrument(ts, sf, targets, isTs);
    instrumented.set(path.resolve(file.path), {
      file,
      sf,
      targets,
      isTs,
      virtual,
      virtualSf: virtualSourceFile(ts, file.path, virtual.text, isTs),
      removed: [],
      casts: [],
      seen: new Set(),
    });
  }

  const options_ = {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    noImplicitAny: false,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    resolveJsonModule: true,
    esModuleInterop: true,
    allowImportingTsExtensions: true,
    types: [],
    paths: {[AUTHORING]: [AUTHORING_TYPES]},
  };
  const host = ts.createCompilerHost(options_);
  const getSourceFile = host.getSourceFile.bind(host);
  // Every other file is parsed once, so a later pass reuses it.
  /** @type {Map<string, any>} */
  const parsed = new Map();
  host.getSourceFile = (
    /** @type {string} */ fileName,
    /** @type {any} */ languageVersion,
    /** @type {any} */ onError,
    /** @type {any} */ shouldCreate,
  ) => {
    const entry = instrumented.get(path.resolve(fileName));
    if (entry) return entry.virtualSf;
    if (!parsed.has(fileName)) {
      parsed.set(
        fileName,
        getSourceFile(fileName, languageVersion, onError, shouldCreate),
      );
    }
    return parsed.get(fileName);
  };
  const readFile = host.readFile.bind(host);
  host.readFile = (/** @type {string} */ fileName) =>
    instrumented.get(path.resolve(fileName))?.virtual.text ??
    readFile(fileName);

  /** @type {DocTypeFinding[]} */
  const findings = [];
  const stamped = new Set(); // docs-root docs whose `type` names no type
  let checked = [...instrumented.values()].reduce(
    (sum, entry) => sum + entry.targets.length,
    0,
  );
  const rootNames = [...instrumented.values()].map(entry => entry.file.path);
  // TypeScript stops at an object's first unknown field, and a value outside
  // its type hides the rest of its object, so a doc is checked again with each
  // unknown field blanked and each such value cast to `any`, until nothing new
  // is found, the doc's own `type` too where its root fixes its type.
  /** @type {Entry[]} */
  let pending = [...instrumented.values()];
  /** @type {any} */
  let program;
  for (let pass = 0; pending.length > 0; pass++) {
    if (pass === MAX_PASSES) {
      for (const entry of pending) {
        unchecked.push({
          doc: rel(entry.file.path),
          reason: `TypeScript still found new problems after ${MAX_PASSES} passes, so not every field was checked; fix the ones reported and run the check again`,
        });
      }
      break;
    }
    program = ts.createProgram({
      rootNames,
      options: options_,
      host,
      oldProgram: program,
    });
    /** @type {Entry[]} */
    const again = [];
    for (const entry of pending) {
      const virtualSf = program.getSourceFile(entry.file.path);
      if (!virtualSf) continue;
      const doc = rel(entry.file.path);
      // Text the compiler cannot parse proves nothing about its types.
      const [syntax] = program.getSyntacticDiagnostics(virtualSf);
      if (syntax) {
        if (pass === 0) checked -= entry.targets.length;
        unchecked.push({
          doc,
          reason: `TypeScript ${version} cannot parse it with its type check added (${ts.flattenDiagnosticMessageText(syntax.messageText, ' ')}), so ${pass === 0 ? 'it was not checked' : 'not every field was checked'}`,
        });
        continue;
      }
      let changed = false;
      for (const diagnostic of program.getSemanticDiagnostics(virtualSf)) {
        if (!RELEVANT.has(diagnostic.code) || diagnostic.start == null) {
          continue;
        }
        const pos = entry.virtual.toOriginal(diagnostic.start);
        const target = entry.targets.find(
          candidate =>
            candidate.node.getStart(entry.sf) <= pos &&
            pos <= candidate.node.end,
        );
        if (!target) continue;
        const astPath = fieldPathAt(ts, entry.sf, target.node, pos);
        const line = entry.sf.getLineAndCharacterOfPosition(pos).line + 1;
        for (const finding of findingsFor(ts, diagnostic, astPath, {
          root: entry.file.root,
          doc,
          line,
          exportName: target.exportName,
          typeName: target.typeName,
        })) {
          if (finding.problem === 'unknown_field') {
            const range = propertyRangeAt(ts, entry.sf, target.node, pos);
            if (range && !entry.removed.some(([from]) => from === range[0])) {
              entry.removed.push(range);
              changed = true;
            }
          } else if (
            finding.problem === 'missing_field' &&
            /[.[]/.test(finding.field)
          ) {
            // A nested object missing a field hides the doc's other
            // findings, so that object is set aside.
            const range =
              valueRangeAt(ts, entry.sf, target.node, pos) ??
              objectRangeAt(ts, entry.sf, target.node, pos);
            if (range && !entry.casts.some(([from]) => from === range[0])) {
              entry.casts.push(range);
              changed = true;
            }
          } else if (finding.problem === 'wrong_type') {
            // A deeper `type` picks the shape of the object that holds it, so
            // that object is set aside; a docs-root doc's own `type` is not.
            const picked =
              finding.field === 'type' &&
              entry.file.root === 'docs' &&
              !TRANSLATIONS.includes(target.exportName);
            if (picked && !stamped.has(doc)) {
              stamped.add(doc);
              unchecked.push({
                doc,
                reason:
                  'its `type` names no type the docs root takes, so its other fields were not checked; fix the `type` and run the check again',
              });
            }
            const range = picked
              ? null
              : /\.type$/.test(finding.field)
                ? objectRangeAt(ts, entry.sf, target.node, pos)
                : valueRangeAt(ts, entry.sf, target.node, pos);
            if (range && !entry.casts.some(([from]) => from === range[0])) {
              entry.casts.push(range);
              changed = true;
            }
          }
          const key = `${finding.export}\0${finding.field}\0${finding.problem}`;
          if (entry.seen.has(key)) continue;
          entry.seen.add(key);
          // After a pass sets values aside, TypeScript quotes them as `any`:
          // name the value instead of quoting text the doc does not have.
          if (pass > 0) finding.message = unquoteSetAside(finding.message);
          findings.push(finding);
        }
      }
      if (changed) {
        entry.virtual = instrument(
          ts,
          entry.sf,
          entry.targets,
          entry.isTs,
          entry.removed,
          entry.casts,
        );
        entry.virtualSf = virtualSourceFile(
          ts,
          entry.file.path,
          entry.virtual.text,
          entry.isTs,
        );
        again.push(entry);
      }
    }
    pending = again;
  }
  findings.sort(
    (a, b) =>
      a.doc.localeCompare(b.doc) ||
      a.line - b.line ||
      a.field.localeCompare(b.field),
  );
  unchecked.sort((a, b) => a.doc.localeCompare(b.doc));
  return {
    status: 'checked',
    typescript: version,
    docs: checked,
    // A docs-root doc whose `type` names no type reports only that.
    findings: findings.filter(f => !stamped.has(f.doc) || f.field === 'type'),
    unchecked,
  };
}

/**
 * @param {any} ts
 * @param {string} fileName
 * @param {string} text
 * @param {boolean} isTs
 */
function virtualSourceFile(ts, fileName, text, isTs) {
  return ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    isTs ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
}
