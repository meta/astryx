// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reads a doc module as data, without running it, when its text is
 * only exported literals: `export const <name> = <literal>` and
 * `export default <literal>`, with comments between them. A literal is an
 * object, array, string, template without substitutions, number, `true`,
 * `false` or `null`. Any other text (an import, a call, a reference, a
 * substitution) makes the module code, and the caller imports it.
 *
 * @input an absolute path to a `.doc.mjs` file
 * @output {@link readLiteralDoc}: the doc value an import gives, or null
 * @position foundation/doc-compiler: read by discovery where only what a doc
 *   declares is needed (docs-discovery.mjs readDocAsData), so the reads of a
 *   kept value are the doc files themselves.
 */

import * as fs from 'node:fs';

/**
 * The doc `file` exports, as `loadTopicModule` takes it from an import (its
 * `docs` export, else its default export), when the file holds only exported
 * literals; else null. Null also when it exports neither, or when its text
 * is not a valid module, so the import reports that.
 * @param {string} file
 * @returns {unknown | null}
 */
export function readLiteralDoc(file) {
  if (!file.endsWith('.mjs')) return null;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    const exported = readExports(text);
    if (!exported) return null;
    const doc = exported.consts.get('docs') ?? exported.fallback;
    return doc ?? null;
  } catch (err) {
    if (err === NOT_LITERAL) return null;
    throw err;
  }
}

/** Thrown inside the reader when the text is not only exported literals. */
const NOT_LITERAL = Symbol('not literal');

/** @returns {never} */
function notLiteral() {
  throw NOT_LITERAL;
}

const IDENTIFIER_RE = /[A-Za-z_$][\w$]*/y;
const NUMBER_RE = /(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w$.])/y;
const LINE_TERMINATOR_RE = /[\n\r\u2028\u2029]/;

/** Words a module cannot declare as a binding name. */
const RESERVED = new Set(
  (
    'await break case catch class const continue debugger default delete do ' +
    'else enum export extends false finally for function if implements ' +
    'import in instanceof interface let new null package private protected ' +
    'public return static super switch this throw true try typeof var void ' +
    'while with yield arguments eval'
  ).split(' '),
);

/**
 * The module's exported literals: each `export const` by name, and the
 * default export. Null when it has no export at all.
 * @param {string} text
 * @returns {{consts: Map<string, unknown>, fallback: unknown} | null}
 */
function readExports(text) {
  let at = 0;
  /** Whether the trivia last skipped held a line terminator. */
  let newline = false;

  const skipTrivia = () => {
    newline = false;
    while (at < text.length) {
      const char = text[at];
      if (char === '/' && text[at + 1] === '/') {
        const end = text.slice(at).search(LINE_TERMINATOR_RE);
        at = end === -1 ? text.length : at + end;
      } else if (char === '/' && text[at + 1] === '*') {
        const end = text.indexOf('*/', at + 2);
        if (end === -1) notLiteral();
        if (LINE_TERMINATOR_RE.test(text.slice(at, end))) newline = true;
        at = end + 2;
      } else if (/\s/.test(char)) {
        if (LINE_TERMINATOR_RE.test(char)) newline = true;
        at += 1;
      } else {
        break;
      }
    }
  };

  /** @param {RegExp} re */
  const match = re => {
    re.lastIndex = at;
    const found = re.exec(text);
    if (!found) return null;
    at = re.lastIndex;
    return found[0];
  };

  const identifier = () => match(IDENTIFIER_RE) ?? notLiteral();

  /** @param {string} token */
  const expect = token => {
    skipTrivia();
    if (!text.startsWith(token, at)) notLiteral();
    at += token.length;
  };

  /** @param {string} word */
  const keyword = word => {
    skipTrivia();
    if (identifier() !== word) notLiteral();
  };

  /** @returns {unknown} */
  const value = () => {
    skipTrivia();
    const char = text[at];
    if (char === '{') return object();
    if (char === '[') return array();
    if (char === "'" || char === '"') return string(char);
    if (char === '`') return template();
    if (char === '-') {
      at += 1;
      skipTrivia();
      return -number();
    }
    if (char >= '0' && char <= '9') return number();
    const word = identifier();
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    return notLiteral();
  };

  const number = () => Number(match(NUMBER_RE) ?? notLiteral());

  const object = () => {
    at += 1;
    /** @type {Record<string, unknown>} */
    const result = {};
    for (;;) {
      skipTrivia();
      if (text[at] === '}') break;
      const char = text[at];
      const key = char === "'" || char === '"' ? string(char) : identifier();
      // `__proto__: value` sets the prototype; a plain read would not.
      if (key === '__proto__') notLiteral();
      expect(':');
      result[key] = value();
      skipTrivia();
      if (text[at] === ',') at += 1;
      else if (text[at] !== '}') notLiteral();
    }
    at += 1;
    return result;
  };

  const array = () => {
    at += 1;
    /** @type {unknown[]} */
    const result = [];
    for (;;) {
      skipTrivia();
      if (text[at] === ']') break;
      // A hole reads as an absent element; leave that to an import.
      if (text[at] === ',') notLiteral();
      result.push(value());
      skipTrivia();
      if (text[at] === ',') at += 1;
      else if (text[at] !== ']') notLiteral();
    }
    at += 1;
    return result;
  };

  /** @param {string} quote */
  const string = quote => {
    at += 1;
    let result = '';
    for (;;) {
      if (at >= text.length) notLiteral();
      const char = text[at];
      if (char === quote) break;
      if (char === '\n' || char === '\r') notLiteral();
      if (char === '\\') result += escape();
      else {
        result += char;
        at += 1;
      }
    }
    at += 1;
    return result;
  };

  const template = () => {
    at += 1;
    let result = '';
    for (;;) {
      if (at >= text.length) notLiteral();
      const char = text[at];
      if (char === '`') break;
      if (char === '$' && text[at + 1] === '{') notLiteral();
      if (char === '\\') result += escape();
      else if (char === '\r') {
        // A template's value reads CR LF and a lone CR as LF.
        result += '\n';
        at += text[at + 1] === '\n' ? 2 : 1;
      } else {
        result += char;
        at += 1;
      }
    }
    at += 1;
    return result;
  };

  /** The value of the escape at `at`, as a strict-mode literal reads it. */
  const escape = () => {
    const char = text[at + 1];
    at += 2;
    switch (char) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'v':
        return '\v';
      case '0':
        // `\0` followed by a digit is a legacy octal escape: a module
        // rejects it.
        if (/[0-9]/.test(text[at] ?? '')) notLiteral();
        return '\0';
      case 'x': {
        const hex = text.slice(at, at + 2);
        if (!/^[0-9A-Fa-f]{2}$/.test(hex)) notLiteral();
        at += 2;
        return String.fromCharCode(parseInt(hex, 16));
      }
      case 'u': {
        if (text[at] === '{') {
          const end = text.indexOf('}', at);
          const hex = end === -1 ? '' : text.slice(at + 1, end);
          if (!/^[0-9A-Fa-f]+$/.test(hex)) notLiteral();
          const code = parseInt(hex, 16);
          if (code > 0x10ffff) notLiteral();
          at = end + 1;
          return String.fromCodePoint(code);
        }
        const hex = text.slice(at, at + 4);
        if (!/^[0-9A-Fa-f]{4}$/.test(hex)) notLiteral();
        at += 4;
        return String.fromCharCode(parseInt(hex, 16));
      }
      case '\r':
        if (text[at] === '\n') at += 1;
        return '';
      case '\n':
      case '\u2028':
      case '\u2029':
        return '';
      case undefined:
        return notLiteral();
      default:
        if (/[1-9]/.test(char)) notLiteral();
        return char;
    }
  };

  /** @type {Map<string, unknown>} */
  const consts = new Map();
  let hasDefault = false;
  /** @type {unknown} */
  let fallback;
  let any = false;
  // Whether the export before ended with `;`; else a line must end it.
  let ended = true;
  // The BOM a file may start with is whitespace to skipTrivia.
  for (;;) {
    skipTrivia();
    if (at >= text.length) break;
    if (!ended && !newline) notLiteral();
    keyword('export');
    skipTrivia();
    const word = identifier();
    if (word === 'const') {
      skipTrivia();
      const name = identifier();
      if (consts.has(name) || RESERVED.has(name)) notLiteral();
      expect('=');
      consts.set(name, value());
    } else if (word === 'default') {
      if (hasDefault) notLiteral();
      hasDefault = true;
      fallback = value();
    } else {
      notLiteral();
    }
    any = true;
    skipTrivia();
    ended = text[at] === ';';
    if (ended) at += 1;
  }
  return any ? {consts, fallback} : null;
}
