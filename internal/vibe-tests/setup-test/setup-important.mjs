// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Syntactic detection of a hardcoded `!important`.
 *
 * The `hardcoded-important` escape hatch used to be a lexical scan: any added
 * line matching `/!\s*important/i` failed the run. That reads prose as code. An
 * executor told — correctly, by the guidance itself — not to paper over a
 * containment problem with `!important` writes that sentence into a JSDoc block
 * above the workaround it chose instead, and the check fails the run for saying
 * the right thing. Three cells of one operator run failed exactly that way, all
 * three on a comment.
 *
 * A declaration is now found the way the browser finds one, by parsing:
 *
 * - CSS and CSS-like files go through **postcss**. `Declaration.important` is
 *   the parser's own answer to "does this declaration carry the flag", so a
 *   comment is a `Comment` node and never a declaration, and `content:
 *   "!important"` is a value string rather than a flag.
 * - Scripts go through the **TypeScript** parser, which handles `.js`, `.jsx`,
 *   `.ts`, and `.tsx` with one API. Comments are trivia and are not nodes, so
 *   they cannot be found; only string and template literals are examined, and
 *   only where the literal is applied as CSS.
 * - HTML, Vue, and Svelte are WALKED (see `setup-markup.mjs`) into their
 *   `<style>` blocks, their `style="…"` attributes, and their `<script>`
 *   blocks, and each part is handed to the analyzer above that owns it.
 *   Comments and text content are neither. The walk matters: `<!--` opens a
 *   comment only in markup text, so blanking those delimiters wherever they
 *   appear would let a script hide a flag in a string and then apply it.
 *
 * Ignoring comments and prose must not open a way to smuggle a real override
 * past the check, so a literal counts as CSS whenever it is applied as CSS:
 *
 * 1. it *is* a stylesheet — a selector with a braced block carrying the flag,
 *    which is what CSS-in-JS templates, `cssText`, and `insertRule` consume,
 *    and which is structure prose does not have;
 * 2. it *carries a declaration* AND something applies it: the literal sits in a
 *    CSS sink (a `style.*` assignment, a style-object entry, a JSX `style`,
 *    `setProperty`, `setAttribute('style', …)`, `insertRule`), or the BINDING it
 *    is bound to is one such a sink reads — which is how a declaration
 *    reassembled out of a cloaked string (`el.style.cssText = cloak.slice(4,
 *    -3)`) is still found. Reachability resolves each reference to its
 *    declaration through the scope chain, so a prose `value` in one function is
 *    not implicated by an unrelated `value` a sink reads in another;
 * 3. it *is* the value of a CSS property — a style-object entry, a `style.*`
 *    assignment, a JSX `style={{…}}` entry — where the property name is a real
 *    CSS property, taken from `CSSStyleDeclaration` in the TypeScript DOM
 *    library rather than from a hand-written list that could miss one;
 * 4. it is the priority argument of `setProperty(property, value, 'important')`,
 *    which sets the same flag without ever spelling `!important`, and which the
 *    old lexical scan could not see at all.
 *
 * Case 2's second half is what keeps prose quiet. Characters that spell a
 * declaration are not an override — `export const RULE = 'Never write color:
 * red !important'` is guidance, and failing a run for it is the exact fault
 * this file was written to fix. Only a declaration something in the file
 * APPLIES is one the host receives.
 *
 * Anything the parsers cannot read fails closed: an unparsable stylesheet falls
 * back to a scanner that skips only comments and quoted strings, and a file
 * whose CSS property vocabulary cannot be loaded treats every style-shaped
 * property as a CSS property. A file that cannot be understood is never given
 * the benefit of the doubt.
 *
 * KNOWN GAP, pre-dating this file: a declaration split across SEPARATE
 * variables (`const a = 'color: red'; const b = ' !important';
 * el.style.cssText = a + b`) is not found, because neither literal carries a
 * declaration on its own. Following values across bindings is real dataflow
 * analysis; a template's own interpolations are covered, and a value passed
 * into a function as an argument is likewise not traced. Recorded rather than
 * papered over.
 *
 * DELIBERATE OVER-REPORT: when one binding is written twice (`var v` declared
 * twice, or a `let` reassigned) and a sink reads it, EVERY declaration-carrying
 * literal written to that binding is reported. Which write reaches the sink is
 * a question of flow — a branch can make either one — so the check reports the
 * binding rather than guessing an order. This is the fail-closed direction: the
 * cost is naming an extra line in code that assigns prose and CSS to the same
 * variable, and the alternative is an executor defeating the check with an
 * `if`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import postcss from 'postcss';
import ts from 'typescript';
import {markupRegions} from './setup-markup.mjs';

/** The flag itself: `!important`, `! important`, `!IMPORTANT`. */
const IMPORTANT_FLAG = /!\s*important\b/gi;

/**
 * A declaration carrying the flag, inside arbitrary CSS text. The property may
 * be a custom property or an ordinary one, and the value may be anything that
 * does not close the declaration.
 *
 * The property is required not to CONTINUE an identifier — so `background-color:
 * red !important` is one declaration rather than also matching at `color` — but
 * it is not required to sit at the start of the text. That anchoring was a way
 * past the check: any prefix at all defeated it, so
 * `'<!-- color: red !important -->'` was not a declaration while the code
 * beside it still applied one.
 *
 * On its own this says only "these characters spell a declaration", which prose
 * does too ("never write `color: red !important`"). Inside a script it is
 * therefore not sufficient — see `carriesAppliedCss`.
 */
const DECLARATION_WITH_FLAG =
  /(?<![\w-])(?:--[\w-]+|[A-Za-z][\w-]*)\s*:\s*[^;{}]*?!\s*important\b/gi;

/**
 * A complete CSS RULE carrying the flag: a selector, a braced block, and a
 * flagged declaration inside it.
 *
 * This is structure prose does not have. A string shaped like a stylesheet IS a
 * stylesheet — it is what `cssText`, `insertRule`, and every CSS-in-JS template
 * consume — so it counts wherever it is written, without needing to be traced
 * to the code that applies it.
 */
const RULE_WITH_FLAG =
  /\{[^{}]*(?<![\w-])(?:--[\w-]+|[A-Za-z][\w-]*)\s*:\s*[^;{}]*?!\s*important\b[^{}]*\}/i;

export const CSS_EXTENSIONS = new Set([
  '.css',
  '.less',
  '.pcss',
  '.sass',
  '.scss',
]);
export const SCRIPT_KINDS = new Map([
  ['.cjs', ts.ScriptKind.JS],
  ['.js', ts.ScriptKind.JS],
  ['.jsx', ts.ScriptKind.JSX],
  ['.mjs', ts.ScriptKind.JS],
  ['.ts', ts.ScriptKind.TS],
  ['.tsx', ts.ScriptKind.TSX],
]);
export const MARKUP_EXTENSIONS = new Set(['.html', '.svelte', '.vue']);

/* ---------------------------------------------------------------------------
 * CSS property vocabulary
 *
 * `CSSStyleDeclaration` in TypeScript's DOM library is the browser's own list
 * of CSS properties in camelCase. Reading it keeps the check honest about
 * properties nobody thought to enumerate (`inset`, `scrollbarGutter`,
 * `anchorName`) instead of trusting a list that ages.
 * ------------------------------------------------------------------------- */

const kebab = name =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/^-(?=[a-z])/, '-')
    .toLowerCase();

let cssPropertyNames;

/**
 * Every CSS property name accepted in a style object, in camelCase and kebab
 * form, or `null` when the DOM library cannot be read.
 *
 * The interface that carries the properties has moved between TypeScript
 * versions — it is `CSSStyleProperties` today and was `CSSStyleDeclaration`
 * before — so both are read and unioned rather than assuming either.
 */
export function cssPropertyVocabulary() {
  if (cssPropertyNames !== undefined) {
    return cssPropertyNames;
  }
  cssPropertyNames = null;
  try {
    const require = createRequire(import.meta.url);
    const source = fs.readFileSync(
      require.resolve('typescript/lib/lib.dom.d.ts'),
      'utf8',
    );
    const names = new Set();
    for (const interfaceName of ['CSSStyleProperties', 'CSSStyleDeclaration']) {
      const start = source.indexOf(`\ninterface ${interfaceName}`);
      if (start === -1) {
        continue;
      }
      const bodyStart = source.indexOf('{', start);
      const end = source.indexOf('\n}', bodyStart);
      const body = source.slice(bodyStart, end === -1 ? undefined : end);
      for (const match of body.matchAll(
        /^\s{4}(?:readonly\s+)?(?:"([^"]+)"|([A-Za-z][\w]*))\s*:/gm,
      )) {
        const name = match[1] ?? match[2];
        names.add(name);
        names.add(kebab(name));
      }
    }
    // A scrape that came back thin means the shape changed again; a thin list
    // would quietly stop recognizing style objects, so it is treated as no list
    // at all and the fail-closed branch takes over.
    cssPropertyNames = names.size >= 100 ? names : null;
  } catch {
    cssPropertyNames = null;
  }
  return cssPropertyNames;
}

/**
 * Whether `name` names a CSS property in a style-object position.
 *
 * A custom property always qualifies. Otherwise the DOM vocabulary decides, and
 * when that cannot be loaded every hyphenated or camelCase identifier is
 * treated as a property, so a missing vocabulary over-reports rather than
 * letting an override through.
 */
export function isCssPropertyName(name) {
  if (typeof name !== 'string' || name === '') {
    return false;
  }
  if (name.startsWith('--')) {
    return true;
  }
  const vocabulary = cssPropertyVocabulary();
  if (vocabulary === null) {
    return /^[A-Za-z][\w-]*$/.test(name);
  }
  return vocabulary.has(name) || vocabulary.has(kebab(name));
}

/* ---------------------------------------------------------------------------
 * Offsets and lines
 * ------------------------------------------------------------------------- */

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineAt(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low + 1;
}

/** Every offset of the flag inside `text`, relative to `text`. */
function flagOffsets(text, base = 0) {
  const offsets = [];
  for (const match of text.matchAll(IMPORTANT_FLAG)) {
    offsets.push(base + match.index);
  }
  return offsets;
}

/** Offsets of the flag in every declaration that carries one, in CSS text. */
function declarationFlagOffsets(text, base = 0) {
  const offsets = [];
  for (const match of text.matchAll(DECLARATION_WITH_FLAG)) {
    const inner = /!\s*important\b/i.exec(match[0]);
    if (inner) {
      offsets.push(base + match.index + inner.index);
    }
  }
  return offsets;
}

/* ---------------------------------------------------------------------------
 * CSS
 * ------------------------------------------------------------------------- */

/**
 * Flag offsets in a stylesheet, via postcss.
 *
 * Returns `null` when the stylesheet cannot be parsed — SCSS `//` comments and
 * the indented Sass syntax both defeat the default parser — so the caller can
 * fall back rather than silently reporting nothing.
 */
function postcssFlagOffsets(text) {
  let root;
  try {
    root = postcss.parse(text, {from: undefined});
  } catch {
    return null;
  }
  const starts = lineStarts(text);
  const offsetOf = position => {
    if (position == null) {
      return null;
    }
    if (typeof position.offset === 'number') {
      return position.offset;
    }
    const start = starts[position.line - 1];
    return start === undefined ? null : start + position.column - 1;
  };
  const offsets = [];
  root.walkDecls(declaration => {
    if (!declaration.important) {
      return;
    }
    const start = offsetOf(declaration.source?.start);
    const end = offsetOf(declaration.source?.end);
    if (start === null) {
      return;
    }
    const slice = text.slice(start, end === null ? undefined : end + 1);
    const found = flagOffsets(slice, start);
    // `important` is set, so the flag is in this declaration's own text; if the
    // spelling defeats the search, report the declaration's start rather than
    // dropping the finding.
    offsets.push(found.length > 0 ? found.at(-1) : start);
  });
  return offsets;
}

/**
 * Flag offsets in text a parser could not read: everything outside comments and
 * quoted strings. Deliberately blunt — it is the fail-closed path.
 */
function scannedCssFlagOffsets(text) {
  let masked = '';
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === '/' && text[index + 1] === '*') {
      const close = text.indexOf('*/', index + 2);
      const end = close === -1 ? text.length : close + 2;
      masked += ' '.repeat(end - index);
      index = end;
      continue;
    }
    if (character === '/' && text[index + 1] === '/') {
      const close = text.indexOf('\n', index);
      const end = close === -1 ? text.length : close;
      masked += ' '.repeat(end - index);
      index = end;
      continue;
    }
    if (character === '"' || character === "'") {
      const start = index;
      index += 1;
      while (index < text.length && text[index] !== '\n') {
        if (text[index] === '\\') {
          index += 2;
          continue;
        }
        if (text[index] === character) {
          index += 1;
          break;
        }
        index += 1;
      }
      masked += ' '.repeat(index - start);
      continue;
    }
    masked += character;
    index += 1;
  }
  return flagOffsets(masked);
}

function cssFlagOffsets(text) {
  return postcssFlagOffsets(text) ?? scannedCssFlagOffsets(text);
}

/** Flag offsets in the body of a `style="…"` attribute. */
function styleAttributeFlagOffsets(value) {
  const prefix = 'a{';
  const wrapped = `${prefix}${value}}`;
  const offsets = postcssFlagOffsets(wrapped);
  const found = offsets ?? scannedCssFlagOffsets(wrapped);
  return found
    .map(offset => offset - prefix.length)
    .filter(offset => offset >= 0 && offset < value.length);
}

/* ---------------------------------------------------------------------------
 * Scripts
 * ------------------------------------------------------------------------- */

/** `foo.style.color = '…'` / `foo.style.cssText = '…'` — the assigned property. */
function styleAssignmentProperty(node) {
  const parent = node.parent;
  if (
    !parent ||
    !ts.isBinaryExpression(parent) ||
    parent.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
    parent.right !== node ||
    !ts.isPropertyAccessExpression(parent.left)
  ) {
    return null;
  }
  const owner = parent.left.expression;
  const ownerName = ts.isPropertyAccessExpression(owner)
    ? owner.name.text
    : ts.isIdentifier(owner)
      ? owner.text
      : null;
  if (ownerName !== 'style') {
    return null;
  }
  return parent.left.name.text;
}

/** The property name a literal sits under in an object literal, if any. */
function objectPropertyName(node) {
  const parent = node.parent;
  if (
    !parent ||
    !ts.isPropertyAssignment(parent) ||
    parent.initializer !== node
  ) {
    return null;
  }
  const name = parent.name;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }
  if (ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

/**
 * Whether the object literal a property belongs to is a style object regardless
 * of its keys: a JSX `style={{…}}` value, or a `style`/`sx`/`css` property.
 */
function inDeclaredStyleObject(node) {
  let current = node.parent;
  while (current) {
    if (ts.isObjectLiteralExpression(current)) {
      const owner = current.parent;
      if (owner && ts.isJsxExpression(owner)) {
        const attribute = owner.parent;
        if (
          attribute &&
          ts.isJsxAttribute(attribute) &&
          ts.isIdentifier(attribute.name) &&
          /^(?:style|sx|css)$/i.test(attribute.name.text)
        ) {
          return true;
        }
      }
      if (
        owner &&
        ts.isPropertyAssignment(owner) &&
        (ts.isIdentifier(owner.name) || ts.isStringLiteralLike(owner.name)) &&
        /^(?:style|sx|css)$/i.test(owner.name.text)
      ) {
        return true;
      }
      if (
        owner &&
        ts.isBinaryExpression(owner) &&
        owner.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(owner.left) &&
        /^(?:style|sx|css)$/i.test(owner.left.name.text)
      ) {
        return true;
      }
      return false;
    }
    if (ts.isBlock(current) || ts.isSourceFile(current)) {
      return false;
    }
    current = current.parent;
  }
  return false;
}

/** `element.style.setProperty('color', 'red !important')` — the value argument. */
function isSetPropertyValue(node) {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent)) return false;
  const callee = parent.expression;
  const name = ts.isPropertyAccessExpression(callee)
    ? callee.name.text
    : ts.isIdentifier(callee)
      ? callee.text
      : null;
  return name === 'setProperty' && parent.arguments.indexOf(node) === 1;
}

/** `element.style.setProperty('color', 'red', 'important')`. */
function isSetPropertyPriority(node) {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent)) {
    return false;
  }
  const callee = parent.expression;
  const name = ts.isPropertyAccessExpression(callee)
    ? callee.name.text
    : ts.isIdentifier(callee)
      ? callee.text
      : null;
  if (name !== 'setProperty') {
    return false;
  }
  const index = parent.arguments.indexOf(node);
  return index === 2 && /^\s*important\s*$/i.test(node.text);
}

/**
 * The cooked text of a template, with each interpolation replaced by a single
 * placeholder character, plus a map back to source offsets. A declaration split
 * across an interpolation — `` `color: ${value} !important` `` — is still a
 * declaration.
 */
function templateText(node) {
  const segments = [];
  let text = '';
  const push = (literal, contentStart) => {
    segments.push({
      start: text.length,
      end: text.length + literal.length,
      contentStart,
    });
    text += literal;
  };
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    push(node.text, node.getStart() + 1);
    return {text, segments};
  }
  push(node.head.text, node.head.getStart() + 1);
  for (const span of node.templateSpans) {
    text += '\u0001';
    push(span.literal.text, span.literal.getStart() + 1);
  }
  return {text, segments};
}

function mapTemplateOffset(segments, offset) {
  for (const segment of segments) {
    if (offset >= segment.start && offset < segment.end) {
      return segment.contentStart + (offset - segment.start);
    }
  }
  return null;
}

/**
 * A call whose argument is handed to the CSS engine.
 * `insertRule` and `appendRule` take a rule; `setAttribute('style', …)` and
 * `setProperty(prop, value)` take declarations.
 */
function cssSinkCall(node) {
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  const name = ts.isPropertyAccessExpression(callee)
    ? callee.name.text
    : ts.isIdentifier(callee)
      ? callee.text
      : null;
  if (name === 'insertRule' || name === 'appendRule') {
    return node.arguments[0] ?? null;
  }
  if (name === 'setProperty') {
    return node.arguments[1] ?? null;
  }
  if (name === 'setAttribute') {
    const attribute = node.arguments[0];
    if (
      attribute &&
      ts.isStringLiteralLike(attribute) &&
      attribute.text.toLowerCase() === 'style'
    ) {
      return node.arguments[1] ?? null;
    }
  }
  return null;
}

/**
 * The expression a CSS sink consumes, when `node` IS that sink.
 *
 * A sink is any place a value becomes style the host renders: an assignment to
 * `style.*` (`cssText` included), an entry of a style object, a JSX `style`
 * attribute, or a call that hands CSS to the engine.
 */
/** The property name of a member access, whether dotted or computed. */
function accessedName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    return argument && ts.isStringLiteralLike(argument) ? argument.text : null;
  }
  return null;
}

/** The object a member access reads from. */
function accessedOwner(node) {
  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    return node.expression;
  }
  return null;
}

/**
 * The expression a CSS sink consumes, when `node` IS that sink.
 *
 * A sink is any place a value becomes style the host renders: an assignment to
 * `style.*` (`cssText` included), an entry of a style object, a JSX `style`
 * attribute, or a call that hands CSS to the engine. Member access is read in
 * either spelling — `el.style.cssText` and `el.style['cssText']` set the same
 * property, and understanding only the dotted form left the other as a way
 * past the check.
 */
function cssSinkExpression(node) {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    const name = accessedName(node.left);
    if (name !== null) {
      const owner = accessedOwner(node.left);
      const ownerName =
        owner === null
          ? null
          : (accessedName(owner) ??
            (ts.isIdentifier(owner) ? owner.text : null));
      if (ownerName === 'style') return node.right;
      if (/^(?:style|sx|css)$/i.test(name)) return node.right;
    }
  }
  if (ts.isPropertyAssignment(node)) {
    const name =
      ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)
        ? node.name.text
        : null;
    if (
      name !== null &&
      (isCssPropertyName(name) || /^(?:style|sx|css)$/i.test(name))
    ) {
      return node.initializer;
    }
  }
  if (
    ts.isJsxAttribute(node) &&
    ts.isIdentifier(node.name) &&
    /^(?:style|sx|css)$/i.test(node.name.text)
  ) {
    return node.initializer ?? null;
  }
  return cssSinkCall(node);
}

/** Is this literal written inside something that applies it as CSS? */
function inCssSink(node) {
  let child = node;
  let current = node.parent;
  while (current) {
    const sink = cssSinkExpression(current);
    // The literal must be inside the CONSUMED expression — the right-hand side,
    // the argument — not merely somewhere in the same statement.
    if (sink !== null && sink !== undefined && containsNode(sink, child)) {
      return true;
    }
    if (ts.isSourceFile(current)) break;
    child = current;
    current = current.parent;
  }
  return false;
}

function containsNode(root, target) {
  let current = target;
  while (current) {
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

/* ---------------------------------------------------------------------------
 * Binding resolution
 *
 * Reachability is keyed on the DECLARATION a reference resolves to, not on the
 * identifier's name. Two functions may each declare `value`; only the one whose
 * `value` a CSS sink reads is applying anything, and reporting the other is the
 * prose false positive this file exists to prevent.
 *
 * The literals are parsed with `createSourceFile`, so there is no TypeChecker
 * to ask. The scope chain is walked directly instead: block scoping for
 * `let`/`const`/`class`, function scoping for `var` and function declarations,
 * plus parameters. That is the resolution JavaScript itself performs.
 * ------------------------------------------------------------------------- */

function isFunctionLikeScope(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function isScope(node) {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isModuleBlock(node) ||
    ts.isCaseBlock(node) ||
    ts.isCatchClause(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    isFunctionLikeScope(node)
  );
}

/**
 * The declarations a scope owns, by name.
 *
 * `var` and function declarations hoist out of nested blocks to the nearest
 * function or module scope, so they are collected through those blocks;
 * `let`/`const`/`class` stop at their own block. Nested functions leak nothing.
 *
 * A name may be declared more than once — `var v` twice in a function is ONE
 * binding, redeclared. Every declaration of a name therefore maps to the same
 * key (the first one seen), so a literal written at the second `var` and a sink
 * reading the name resolve to the same thing rather than missing each other.
 */
function collectDeclarations(scope) {
  const found = new Map();
  const add = (nameNode, declaration) => {
    if (nameNode && ts.isIdentifier(nameNode) && !found.has(nameNode.text)) {
      found.set(nameNode.text, declaration);
    }
  };

  if (isFunctionLikeScope(scope)) {
    for (const parameter of scope.parameters ?? [])
      add(parameter.name, parameter);
  }
  if (ts.isCatchClause(scope) && scope.variableDeclaration) {
    add(scope.variableDeclaration.name, scope.variableDeclaration);
  }

  const visit = (node, crossedBlock) => {
    if (node !== scope && isScope(node)) {
      // A nested function is a closed world; a nested block still lets `var`
      // and function declarations hoist through it.
      if (isFunctionLikeScope(node)) return;
      ts.forEachChild(node, child => visit(child, true));
      return;
    }
    if (ts.isVariableDeclarationList(node)) {
      const blockScoped =
        (node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0;
      if (!crossedBlock || !blockScoped) {
        for (const declaration of node.declarations)
          add(declaration.name, declaration);
      }
      return;
    }
    if (ts.isFunctionDeclaration(node)) {
      add(node.name, node);
      return;
    }
    if (ts.isClassDeclaration(node) && !crossedBlock) {
      add(node.name, node);
      return;
    }
    if (ts.isImportClause(node)) {
      add(node.name, node);
      if (node.namedBindings) {
        if (ts.isNamespaceImport(node.namedBindings)) {
          add(node.namedBindings.name, node.namedBindings);
        } else {
          for (const element of node.namedBindings.elements)
            add(element.name, element);
        }
      }
      return;
    }
    ts.forEachChild(node, child => visit(child, crossedBlock));
  };
  ts.forEachChild(scope, child => visit(child, false));
  return found;
}

/** The declaration an identifier resolves to, by walking its scope chain. */
function resolveBinding(identifier, cache) {
  let node = identifier.parent;
  while (node) {
    if (isScope(node)) {
      let declarations = cache.get(node);
      if (declarations === undefined) {
        declarations = collectDeclarations(node);
        cache.set(node, declarations);
      }
      const hit = declarations.get(identifier.text);
      if (hit) return hit;
    }
    node = node.parent;
  }
  return null;
}

/**
 * The declaration a literal is bound to, if it is bound to one at all.
 *
 * The declaration is resolved BY NAME through the scope chain rather than
 * returned directly, so a redeclared `var` yields the one binding both its
 * declarations share.
 */
function bindingOfLiteral(node, cache) {
  let current = node.parent;
  while (current) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return resolveBinding(current.name, cache) ?? current;
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(current.left)
    ) {
      return resolveBinding(current.left, cache);
    }
    if (ts.isStatement(current) || ts.isSourceFile(current)) return null;
    current = current.parent;
  }
  return null;
}

/**
 * Every identifier a CSS sink READS AS THE VALUE, as AST nodes rather than
 * names.
 *
 * A reference only counts when the value flowing into the sink can be the
 * binding's own. `el.style.cssText = guidance.length > 0 ? a : b` mentions
 * `guidance`, but what reaches the sink is a number's comparison and then some
 * other string — the guidance text itself never lands as CSS. Reading a
 * PROPERTY off the reference (`.length`, `.name`) is therefore not a use of the
 * string, while calling a method on it (`.slice`, `.trim`, `.replace`) is,
 * because that is exactly how a cloaked declaration is reassembled.
 */
function cssSinkReferences(source) {
  const references = [];
  const collect = node => {
    if (ts.isIdentifier(node) && !isNonValueMemberUse(node)) {
      references.push(node);
    }
    ts.forEachChild(node, collect);
  };
  const visit = node => {
    const sink = cssSinkExpression(node);
    if (sink !== null && sink !== undefined) collect(sink);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return references;
}

/**
 * Is this reference read only for a property of the value, rather than for the
 * value itself?
 *
 * The whole member chain is walked, because indexing and calling compose:
 * `parts[0].slice(4, -3)` reads an element and then calls a method on it, which
 * keeps the string in play, while `guidance.length` yields a number and the
 * string never reaches the sink. A chain that ends in a CALL is a use of the
 * value; a chain that ends in a plain read is not. The member NAME is never a
 * reference to the binding either.
 */
function isNonValueMemberUse(identifier) {
  const parent = identifier.parent;
  if (
    parent &&
    ts.isPropertyAccessExpression(parent) &&
    parent.name === identifier
  ) {
    return true;
  }

  let current = identifier;
  let sawMember = false;
  while (
    current.parent &&
    (ts.isPropertyAccessExpression(current.parent) ||
      ts.isElementAccessExpression(current.parent)) &&
    current.parent.expression === current
  ) {
    current = current.parent;
    sawMember = true;
  }
  if (!sawMember) return false;

  return !(
    current.parent &&
    ts.isCallExpression(current.parent) &&
    current.parent.expression === current
  );
}

/**
 * Flag offsets in a script: only inside string and template literals, and only
 * where the literal is applied as CSS.
 */
function scriptFlagOffsets(text, fileName, scriptKind) {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const offsets = [];
  const bindingCache = new Map();
  const sinkReferences = cssSinkReferences(source);

  /** Does a CSS sink read the very binding this literal is bound to? */
  const reachesSinkBinding = node => {
    const binding = bindingOfLiteral(node, bindingCache);
    if (binding === null) return false;
    return sinkReferences.some(
      reference => resolveBinding(reference, bindingCache) === binding,
    );
  };

  /**
   * Does this literal's declaration text count as CSS the host receives?
   *
   * A bare declaration is only characters — prose spells one when it tells an
   * executor not to write one — so it counts when something in the file APPLIES
   * it: the literal sits in a CSS sink, or the binding it is bound to is one a
   * sink reads. A literal carrying a whole braced rule is a stylesheet on its
   * face and needs no such evidence.
   */
  const carriesAppliedCss = (node, content) =>
    RULE_WITH_FLAG.test(content) || inCssSink(node) || reachesSinkBinding(node);

  const considerPlainLiteral = node => {
    const content = node.text;
    if (!IMPORTANT_FLAG.test(content)) {
      IMPORTANT_FLAG.lastIndex = 0;
      return;
    }
    IMPORTANT_FLAG.lastIndex = 0;
    const contentStart = node.getStart() + 1;
    const declarationOffsets = declarationFlagOffsets(content, contentStart);
    if (declarationOffsets.length > 0 && carriesAppliedCss(node, content)) {
      offsets.push(...declarationOffsets);
      return;
    }
    const property = objectPropertyName(node) ?? styleAssignmentProperty(node);
    if (
      isSetPropertyValue(node) ||
      (property !== null &&
        (property === 'cssText' ||
          isCssPropertyName(property) ||
          inDeclaredStyleObject(node)))
    ) {
      offsets.push(...flagOffsets(content, contentStart));
    }
  };

  const considerTemplate = node => {
    const {text: cooked, segments} = templateText(node);
    const declarationOffsets = declarationFlagOffsets(cooked);
    if (declarationOffsets.length > 0 && carriesAppliedCss(node, cooked)) {
      for (const offset of declarationOffsets) {
        const mapped = mapTemplateOffset(segments, offset);
        if (mapped !== null) {
          offsets.push(mapped);
        }
      }
      return;
    }
    const property = objectPropertyName(node) ?? styleAssignmentProperty(node);
    if (
      isSetPropertyValue(node) ||
      (property !== null &&
        (property === 'cssText' ||
          isCssPropertyName(property) ||
          inDeclaredStyleObject(node)))
    ) {
      for (const offset of flagOffsets(cooked)) {
        const mapped = mapTemplateOffset(segments, offset);
        if (mapped !== null) {
          offsets.push(mapped);
        }
      }
    }
  };

  const visit = node => {
    if (ts.isStringLiteral(node)) {
      if (isSetPropertyPriority(node)) {
        offsets.push(node.getStart());
      } else {
        considerPlainLiteral(node);
      }
    } else if (
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    ) {
      considerTemplate(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return offsets;
}

/* ---------------------------------------------------------------------------
 * Markup
 * ------------------------------------------------------------------------- */

/**
 * Flag offsets in markup, over the regions of the shared structural walk.
 *
 * The document is WALKED rather than scanned for `<!-- … -->`. A scan blanks
 * those delimiters wherever they occur — including inside a script's own string
 * — which let a flag be smuggled past this check and then applied:
 * `const c = '<!-- color: red !important -->'` was blanked, while
 * `style.cssText = c.slice(4, -3)` still set the override. Inside `<script>`
 * and `<style>`, and inside a tag's attribute values, those characters are
 * ordinary content, and each region's own parser is what decides whether the
 * flag is applied there.
 */
function markupFlagOffsets(text, fileName) {
  const offsets = [];
  for (const region of markupRegions(text)) {
    const body = text.slice(region.start, region.end);
    if (region.kind === 'style') {
      offsets.push(
        ...cssFlagOffsets(body).map(offset => offset + region.start),
      );
    } else if (region.kind === 'script') {
      offsets.push(
        ...scriptFlagOffsets(body, `${fileName}.ts`, ts.ScriptKind.TS).map(
          offset => offset + region.start,
        ),
      );
    } else if (region.kind === 'style-attribute') {
      offsets.push(
        ...styleAttributeFlagOffsets(body).map(offset => offset + region.start),
      );
    }
    // `comment` is prose, and ordinary text is not yielded at all.
  }
  return offsets;
}

/* ---------------------------------------------------------------------------
 * Entry point
 * ------------------------------------------------------------------------- */

/**
 * The 1-based line numbers of `text` that carry a hardcoded `!important`.
 *
 * A line is reported only when a parser places the flag in an applied CSS
 * declaration, so a comment, a JSDoc block, a prose string, and documentation
 * text are all silent while a real override on the same line is not.
 */
export function importantDeclarationLines(relativePath, text) {
  if (typeof text !== 'string' || text === '') {
    return new Set();
  }
  if (!/important/i.test(text)) {
    return new Set();
  }
  const extension = path.extname(relativePath).toLowerCase();
  let offsets;
  if (CSS_EXTENSIONS.has(extension)) {
    offsets = cssFlagOffsets(text);
  } else if (SCRIPT_KINDS.has(extension)) {
    offsets = scriptFlagOffsets(
      text,
      path.basename(relativePath),
      SCRIPT_KINDS.get(extension),
    );
  } else if (MARKUP_EXTENSIONS.has(extension)) {
    offsets = markupFlagOffsets(text, path.basename(relativePath));
  } else {
    // An extension with no analyzer is judged the fail-closed way rather than
    // waved through.
    offsets = scannedCssFlagOffsets(text);
  }
  const starts = lineStarts(text);
  return new Set(offsets.map(offset => lineAt(starts, offset)));
}
