// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Declaration boundary scanner
 *
 * Decides whether a consumer-supplied property name and value can be emitted
 * as exactly one CSS declaration, `name: value;`, without the value ending
 * the declaration early or swallowing what follows it. Theme definitions are
 * code, but apps assemble them from stored input (brand colors,
 * white-labeling), so the generated stylesheet must never extend beyond the
 * declarations it means to emit.
 *
 * The scanner follows the CSS Syntax Module Level 3 tokenizer for everything
 * that decides where a declaration ends: strings with backslash escapes and
 * line continuations, comments, `url()` with an unquoted body, escaped code
 * points outside strings, and `()`, `[]`, `{}` block nesting. Inside any of
 * those a `;` or a brace is inert, exactly as a browser reads it, so a `data:`
 * URI, `Gill\ Sans`, or a closed comment passes through byte-identically.
 * Only what a browser would read as the end of the declaration or rule is
 * rejected: an unnested `;`, `{` or `}`, an unbalanced closer, and anything
 * left open at the end of the value (a string, comment, block, or url whose
 * closer would then be the generator's own `;` or `}`). A `bad-string` or
 * `bad-url` token is rejected as well: the browser would discard the
 * declaration anyway, and a diagnostic beats a silent no-op.
 *
 * @input A property name or a declaration value as authored in a theme
 * @output `null` when it can be emitted, otherwise the reason it cannot
 * @position packages/core/src/theme/declarationBoundary.ts
 */

/** Newline per CSS Syntax §4.2 (after preprocessing, CR and FF are newlines). */
function isNewline(ch: string): boolean {
  return ch === '\n' || ch === '\r' || ch === '\f';
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || isNewline(ch);
}

function isHexDigit(ch: string): boolean {
  return /^[0-9a-fA-F]$/.test(ch);
}

/** Name-start code point: letter, underscore, or any non-ASCII code point. */
function isNameStart(ch: string): boolean {
  return /^[A-Za-z_]$/.test(ch) || ch.charCodeAt(0) >= 0x80;
}

function isNameChar(ch: string): boolean {
  return isNameStart(ch) || /^[0-9-]$/.test(ch);
}

/** CSS Syntax §3.3 preprocessing, for scanning only; emitted bytes stay intact. */
function preprocess(input: string): string {
  const normalized = input.replace(/\r\n?|\f/g, '\n').replace(/\0/g, '\uFFFD');
  let output = '';
  for (let index = 0; index < normalized.length; index++) {
    const code = normalized.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = normalized.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += normalized[index] + normalized[index + 1];
        index++;
      } else {
        output += '\uFFFD';
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      output += '\uFFFD';
    } else {
      output += normalized[index];
    }
  }
  return output;
}

/** Non-printable code points make an unquoted url() a bad-url token. */
// eslint-disable-next-line no-control-regex -- these code points are the subject
const NON_PRINTABLE = /[\x01-\x08\x0b\x0e-\x1f\x7f]/;

/** "Check if two code points are a valid escape" (§4.3.8). */
function isValidEscape(input: string, pos: number): boolean {
  return (
    input[pos] === '\\' && pos + 1 < input.length && !isNewline(input[pos + 1])
  );
}

/** "Check if three code points would start an ident sequence" (§4.3.9). */
function startsIdent(input: string, pos: number): boolean {
  const ch = input[pos];
  if (ch === '-') {
    const next = input[pos + 1];
    return (
      next !== undefined &&
      (next === '-' || isNameStart(next) || isValidEscape(input, pos + 1))
    );
  }
  if (ch === '\\') {
    return isValidEscape(input, pos);
  }
  return ch !== undefined && isNameStart(ch);
}

/**
 * "Consume an escaped code point" (§4.3.7), positioned after the backslash.
 * Returns the position after the escape. A hex escape takes up to six hex
 * digits plus one optional whitespace; anything else takes one code point.
 */
function consumeEscape(input: string, pos: number): number {
  if (isHexDigit(input[pos])) {
    let end = pos;
    while (end < input.length && end - pos < 6 && isHexDigit(input[end])) {
      end++;
    }
    if (end < input.length && isWhitespace(input[end])) {
      end++;
    }
    return end;
  }
  // A surrogate pair is one code point.
  const code = input.codePointAt(pos) ?? 0;
  return pos + (code > 0xffff ? 2 : 1);
}

/**
 * "Consume an ident sequence" (§4.3.11) starting at `pos`. Returns the
 * position after it and the decoded name (escapes resolved, for the
 * case-insensitive `url` check; hex escapes decode to their code point).
 */
function consumeIdent(input: string, pos: number): {end: number; name: string} {
  let name = '';
  let i = pos;
  while (i < input.length) {
    const ch = input[i];
    if (isNameChar(ch)) {
      name += ch;
      i++;
    } else if (isValidEscape(input, i)) {
      const end = consumeEscape(input, i + 1);
      if (isHexDigit(input[i + 1])) {
        const hex = input.slice(i + 1, end).trim();
        const code = parseInt(hex, 16);
        name +=
          code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
            ? '\uFFFD'
            : String.fromCodePoint(code);
      } else {
        name += input.slice(i + 1, end);
      }
      i = end;
    } else {
      break;
    }
  }
  return {end: i, name};
}

/**
 * "Consume a string token" (§4.3.5), positioned at the opening quote.
 * Returns the position after the closing quote, or a rejection reason.
 */
function consumeString(
  input: string,
  pos: number,
): {end: number} | {reason: string} {
  const quote = input[pos];
  let i = pos + 1;
  while (i < input.length) {
    const ch = input[i];
    if (ch === quote) {
      return {end: i + 1};
    }
    if (isNewline(ch)) {
      // A raw newline ends the string as a bad-string token; the browser
      // discards the declaration, so a diagnostic is more useful than
      // reasoning about where that leaves the next `;`.
      return {reason: 'a newline inside a quoted string makes a bad string'};
    }
    if (ch === '\\') {
      if (i + 1 >= input.length) {
        break;
      }
      // Escaped newline is a line continuation; any other escape consumes
      // the escaped code point (so `\"` never closes the string).
      i = isNewline(input[i + 1]) ? i + 2 : consumeEscape(input, i + 1);
      continue;
    }
    i++;
  }
  return {
    reason: `an unclosed ${quote} string would swallow the rest of the rule`,
  };
}

/**
 * "Consume a url token" (§4.3.6), positioned after `url(` and any leading
 * whitespace, with a non-quote next code point. Returns the position after
 * the closing `)`, or a rejection reason (bad-url or unclosed).
 */
function consumeUrl(
  input: string,
  pos: number,
): {end: number} | {reason: string} {
  let i = pos;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ')') {
      return {end: i + 1};
    }
    if (isWhitespace(ch)) {
      while (i < input.length && isWhitespace(input[i])) {
        i++;
      }
      if (i >= input.length) {
        break;
      }
      if (input[i] === ')') {
        return {end: i + 1};
      }
      return {reason: 'whitespace inside an unquoted url() makes a bad url'};
    }
    if (NON_PRINTABLE.test(ch)) {
      return {reason: 'a non-printable character inside url() makes a bad url'};
    }
    if (ch === '"' || ch === "'" || ch === '(') {
      return {
        reason: `"${ch}" inside an unquoted url() makes a bad url; quote the URL instead`,
      };
    }
    if (ch === '\\') {
      if (!isValidEscape(input, i)) {
        return {reason: 'a stray backslash inside url() makes a bad url'};
      }
      i = consumeEscape(input, i + 1);
      continue;
    }
    i++;
  }
  return {reason: 'an unclosed url( would swallow the rest of the rule'};
}

const CLOSER: Record<string, string> = {'(': ')', '[': ']', '{': '}'};

/**
 * Why `value` cannot be emitted as the value of one declaration, or `null`
 * when it can. Valid CSS a browser keeps inside one declaration always
 * returns `null`; see the file header for the exact rules.
 */
export function checkDeclarationValue(input: string): string | null {
  const value = preprocess(input);
  const open: string[] = [];
  let i = 0;
  while (i < value.length) {
    const ch = value[i];

    if (ch === '/' && value[i + 1] === '*') {
      const close = value.indexOf('*/', i + 2);
      if (close === -1) {
        return 'an unclosed /* comment would swallow the rest of the rule';
      }
      i = close + 2;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const result = consumeString(value, i);
      if ('reason' in result) {
        return result.reason;
      }
      i = result.end;
      continue;
    }

    if (startsIdent(value, i)) {
      const ident = consumeIdent(value, i);
      i = ident.end;
      if (value[i] === '(' && ident.name.toLowerCase() === 'url') {
        let j = i + 1;
        while (j < value.length && isWhitespace(value[j])) {
          j++;
        }
        if (value[j] === '"' || value[j] === "'") {
          // `url("...")` is an ordinary function token; the string and the
          // closing paren are handled by the loop.
          open.push(')');
          i = i + 1;
          continue;
        }
        const result = consumeUrl(value, j);
        if ('reason' in result) {
          return result.reason;
        }
        i = result.end;
      }
      continue;
    }

    if (ch === '\\') {
      if (i + 1 >= value.length) {
        // `\` followed by the generator's own `;` would escape it.
        return 'a trailing backslash would escape the declaration terminator';
      }
      // `\` + newline is not an escape: the backslash is a delim and the
      // newline is whitespace. Anything else escapes the next code point.
      i = isNewline(value[i + 1]) ? i + 1 : consumeEscape(value, i + 1);
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      if (ch === '{' && open.length === 0) {
        return 'an unquoted "{" would open a nested block';
      }
      open.push(CLOSER[ch]);
      i++;
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      if (open.length === 0) {
        return ch === '}'
          ? 'an unquoted "}" would close the rule'
          : `an unbalanced "${ch}" has nothing to close`;
      }
      const expected = open.pop();
      if (expected !== ch) {
        return `"${ch}" does not close the open "${expected === ')' ? '(' : expected === ']' ? '[' : '{'}"`;
      }
      i++;
      continue;
    }

    if (ch === ';' && open.length === 0) {
      return 'an unquoted ";" would end the declaration';
    }

    i++;
  }

  if (open.length > 0) {
    const closer = open[open.length - 1];
    const opener = closer === ')' ? '(' : closer === ']' ? '[' : '{';
    return `an unclosed "${opener}" would swallow the rest of the rule`;
  }
  return null;
}

export interface DeclarationValueAnalysis {
  reason: string | null;
  references: string[];
  important: boolean;
  singleVarReference: string | null;
}

function skipWhitespaceAndComments(input: string, start: number): number {
  let index = start;
  for (;;) {
    while (index < input.length && isWhitespace(input[index])) {
      index++;
    }
    if (input[index] !== '/' || input[index + 1] !== '*') {
      return index;
    }
    const close = input.indexOf('*/', index + 2);
    if (close === -1) {
      return input.length;
    }
    index = close + 2;
  }
}

function varReferenceAt(input: string, openParen: number): string | null {
  const start = skipWhitespaceAndComments(input, openParen + 1);
  if (!startsIdent(input, start)) {
    return null;
  }
  const token = consumeIdent(input, start);
  if (!token.name.startsWith('--')) {
    return null;
  }
  const end = skipWhitespaceAndComments(input, token.end);
  return input[end] === ',' || input[end] === ')' ? token.name : null;
}

function startsNumber(input: string, position: number): boolean {
  const first = input[position];
  const second = input[position + 1];
  const third = input[position + 2];
  if (first === '+' || first === '-') {
    return (
      /^[0-9]$/.test(second ?? '') ||
      (second === '.' && /^[0-9]$/.test(third ?? ''))
    );
  }
  return (
    /^[0-9]$/.test(first ?? '') ||
    (first === '.' && /^[0-9]$/.test(second ?? ''))
  );
}

function consumeNumber(input: string, position: number): number {
  let index = position;
  if (input[index] === '+' || input[index] === '-') {
    index++;
  }
  while (/^[0-9]$/.test(input[index] ?? '')) {
    index++;
  }
  if (input[index] === '.' && /^[0-9]$/.test(input[index + 1] ?? '')) {
    index += 2;
    while (/^[0-9]$/.test(input[index] ?? '')) {
      index++;
    }
  }
  if (
    (input[index] === 'e' || input[index] === 'E') &&
    (/^[0-9]$/.test(input[index + 1] ?? '') ||
      ((input[index + 1] === '+' || input[index + 1] === '-') &&
        /^[0-9]$/.test(input[index + 2] ?? '')))
  ) {
    index++;
    if (input[index] === '+' || input[index] === '-') {
      index++;
    }
    while (/^[0-9]$/.test(input[index] ?? '')) {
      index++;
    }
  }
  return index;
}

const DECLARATION_ANALYSIS_CACHE = new Map<string, DeclarationValueAnalysis>();
const MAX_DECLARATION_ANALYSIS_CACHE = 4096;

/**
 * Analyze one accepted declaration value using the same CSS tokenization rules
 * as the declaration-boundary check.
 */
export function analyzeDeclarationValue(
  input: string,
): DeclarationValueAnalysis {
  const cached = DECLARATION_ANALYSIS_CACHE.get(input);
  if (cached !== undefined) {
    return cached;
  }
  const reason = checkDeclarationValue(input);
  if (reason !== null) {
    const analysis = {
      reason,
      references: [],
      important: false,
      singleVarReference: null,
    };
    if (DECLARATION_ANALYSIS_CACHE.size >= MAX_DECLARATION_ANALYSIS_CACHE) {
      DECLARATION_ANALYSIS_CACHE.clear();
    }
    DECLARATION_ANALYSIS_CACHE.set(input, analysis);
    return analysis;
  }

  const value = preprocess(input);
  const references: string[] = [];
  const open: string[] = [];
  type TopLevelToken = {
    type: 'delim' | 'ident' | 'var-function' | 'other';
    value: string;
    reference?: string;
  };
  const topLevelTokens: TopLevelToken[] = [];
  const firstTopLevelTokens: TopLevelToken[] = [];
  let topLevelTokenCount = 0;
  const recordTopLevel = (token: TopLevelToken): void => {
    if (open.length === 0) {
      topLevelTokenCount++;
      if (firstTopLevelTokens.length === 0) {
        firstTopLevelTokens.push(token);
      }
      topLevelTokens.push(token);
      if (topLevelTokens.length > 2) {
        topLevelTokens.shift();
      }
    }
  };

  let index = 0;
  while (index < value.length) {
    const character = value[index];
    if (isWhitespace(character)) {
      index++;
      continue;
    }
    if (character === '/' && value[index + 1] === '*') {
      index = value.indexOf('*/', index + 2) + 2;
      continue;
    }
    if (character === '"' || character === "'") {
      recordTopLevel({type: 'other', value: character});
      const string = consumeString(value, index);
      index = 'end' in string ? string.end : value.length;
      continue;
    }
    if (character === '#') {
      const nameStart = index + 1;
      if (isNameChar(value[nameStart]) || isValidEscape(value, nameStart)) {
        recordTopLevel({type: 'other', value: '#'});
        index = consumeIdent(value, nameStart).end;
        continue;
      }
    }
    if (character === '@' && startsIdent(value, index + 1)) {
      recordTopLevel({type: 'other', value: '@'});
      index = consumeIdent(value, index + 1).end;
      continue;
    }
    if (startsNumber(value, index)) {
      recordTopLevel({type: 'other', value: character});
      index = consumeNumber(value, index);
      if (startsIdent(value, index)) {
        index = consumeIdent(value, index).end;
      } else if (value[index] === '%') {
        index++;
      }
      continue;
    }
    if (startsIdent(value, index)) {
      const ident = consumeIdent(value, index);
      index = ident.end;
      const isFunction = value[index] === '(';
      const reference =
        isFunction && ident.name.toLowerCase() === 'var'
          ? varReferenceAt(value, index)
          : null;
      recordTopLevel(
        reference !== null
          ? {type: 'var-function', value: ident.name, reference}
          : {
              type: isFunction ? 'other' : 'ident',
              value: ident.name,
            },
      );
      if (isFunction) {
        if (reference !== null) {
          references.push(reference);
        }
        if (ident.name.toLowerCase() === 'url') {
          let body = index + 1;
          while (body < value.length && isWhitespace(value[body])) {
            body++;
          }
          if (value[body] !== '"' && value[body] !== "'") {
            const url = consumeUrl(value, body);
            index = 'end' in url ? url.end : value.length;
            continue;
          }
        }
        open.push(')');
        index++;
      }
      continue;
    }
    if (character === '(' || character === '[' || character === '{') {
      recordTopLevel({type: 'other', value: character});
      open.push(CLOSER[character]);
      index++;
      continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      open.pop();
      index++;
      continue;
    }
    if (character === '!') {
      recordTopLevel({type: 'delim', value: character});
    } else {
      recordTopLevel({type: 'other', value: character});
    }
    index++;
  }

  const previousTopLevel = topLevelTokens.at(-2);
  const lastTopLevel = topLevelTokens.at(-1);
  const important =
    previousTopLevel?.type === 'delim' &&
    previousTopLevel.value === '!' &&
    lastTopLevel?.type === 'ident' &&
    lastTopLevel.value.toLowerCase() === 'important';
  const firstTopLevelToken = firstTopLevelTokens[0];
  const singleVarReference =
    topLevelTokenCount - (important ? 2 : 0) === 1 &&
    firstTopLevelToken?.type === 'var-function'
      ? (firstTopLevelToken.reference ?? null)
      : null;
  const analysis = {reason: null, references, important, singleVarReference};
  if (DECLARATION_ANALYSIS_CACHE.size >= MAX_DECLARATION_ANALYSIS_CACHE) {
    DECLARATION_ANALYSIS_CACHE.clear();
  }
  DECLARATION_ANALYSIS_CACHE.set(input, analysis);
  return analysis;
}

/** The browser-canonical spelling of one valid declaration name. */
export function canonicalizeDeclarationName(input: string): string | null {
  const name = preprocess(input);
  if (name.length === 0 || !startsIdent(name, 0)) {
    return null;
  }
  const ident = consumeIdent(name, 0);
  return ident.end === name.length ? ident.name : null;
}

/**
 * Why `name` cannot be emitted as a declaration's property name, or `null`
 * when it can. A property name is one CSS ident sequence: a standard
 * property (`color`), a vendor-prefixed one (`-webkit-line-clamp`), or a
 * custom property (`--brand-accent`, `--_internal`). Escapes are allowed
 * because an ident allows them. Whether the name means anything to the
 * browser is not this check's concern; only that it cannot end the
 * declaration or leak a second one.
 */
export function checkDeclarationName(input: string): string | null {
  const name = preprocess(input);
  if (name.length === 0 || !startsIdent(name, 0)) {
    return 'a property name must be a CSS identifier';
  }
  const {end} = consumeIdent(name, 0);
  if (end !== name.length) {
    return `a property name must be one CSS identifier; "${name[end]}" cannot appear in one`;
  }
  return null;
}
