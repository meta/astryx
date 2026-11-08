// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * One structural walk of a markup document, shared by every check that has to
 * ask "what kind of thing am I looking at here".
 *
 * `<!--` opens a comment only where markup TEXT can appear. Inside `<script>`
 * and `<style>` — raw-text elements whose content is JavaScript and CSS, not
 * markup — and inside a tag's own attribute values, the same four characters
 * are ordinary content. A check that scans for the delimiters instead of
 * walking the document blanks them anywhere they occur, and that is not a
 * false positive: it is a way past the check. A script can write
 * `const c = '<!-- color: red !important -->'`, have the scan agree not to look
 * at it, and then apply it with `style.cssText = c.slice(4, -3)`.
 *
 * Both `setup-comments.mjs` (which asks where the prose is) and
 * `setup-important.mjs` (which asks where the CSS is) need the same answer to
 * the same question, so they read the same regions from here rather than each
 * keeping a scanner that can drift out of agreement with the other.
 *
 * The walk is deliberately structural and nothing more: it says where each
 * region begins and ends, and leaves what counts as a finding inside one to the
 * caller and its own language's parser.
 */

/**
 * The raw-text element this `<` opens, or `null`.
 *
 * The name must match EXACTLY. `<style-note>` and `<script-note>` are ordinary
 * custom elements whose content is markup, but a prefix test reads them as
 * raw-text openers and then hunts for a `</style>` that never comes — so the
 * rest of the document is swallowed as one element body and every real
 * attribute, comment and override after it goes unexamined.
 */
function rawTextTag(text, start) {
  const match = /^<(script|style)(?=[\s/>])/i.exec(
    text.slice(start, start + 8),
  );
  return match ? match[1].toLowerCase() : null;
}

/**
 * Read one start or end tag, from its `<` to just past its `>`.
 *
 * The tag is TOKENIZED into attributes rather than pattern-matched, because
 * both halves of "is this a style attribute" are easy to get wrong:
 *
 * - the NAME must be exactly `style`. A regex looking for `style\s*=` also
 *   matches `data-style=` and `my-style=`, and treating those as CSS reported
 *   findings against an attribute the browser never applies as style;
 * - the VALUE may be double-quoted, single-quoted, or UNQUOTED
 *   (`style=color:red!important`, valid HTML). A quoted-only pattern skipped
 *   the unquoted form entirely, which is a real override going unseen.
 *
 * Tokenizing also fixes the boundary: a quoted value is consumed whole, so a
 * `>` inside one does not end the tag early, and a `<!--` inside one is never
 * read as a comment opener.
 *
 * Returns the tag's end offset and the body span of every `style` attribute
 * it carries.
 */
function readTag(text, start) {
  const attributes = [];
  let cursor = start + 1;

  // The tag name, and for an end tag the `/` before it.
  while (cursor < text.length && /[^\s/>]/.test(text[cursor])) cursor += 1;

  while (cursor < text.length) {
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
    if (cursor >= text.length) break;
    if (text[cursor] === '>') {
      cursor += 1;
      break;
    }
    if (text[cursor] === '/') {
      cursor += 1;
      continue;
    }

    const nameStart = cursor;
    while (cursor < text.length && /[^\s=/>]/.test(text[cursor])) cursor += 1;
    const name = text.slice(nameStart, cursor).toLowerCase();
    if (cursor === nameStart) {
      // Not a name character and not a delimiter: step over it rather than
      // spinning forever on malformed markup.
      cursor += 1;
      continue;
    }

    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
    if (text[cursor] !== '=') continue; // A bare attribute has no value.
    cursor += 1;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;

    const quote = text[cursor];
    let valueStart;
    let valueEnd;
    if (quote === '"' || quote === "'") {
      valueStart = cursor + 1;
      cursor = valueStart;
      while (cursor < text.length && text[cursor] !== quote) cursor += 1;
      valueEnd = cursor;
      cursor = Math.min(cursor + 1, text.length);
    } else {
      valueStart = cursor;
      while (cursor < text.length && /[^\s>]/.test(text[cursor])) cursor += 1;
      valueEnd = cursor;
    }

    if (name === 'style') {
      attributes.push({
        kind: 'style-attribute',
        start: valueStart,
        end: valueEnd,
      });
    }
  }

  return {end: cursor, attributes};
}

/**
 * The regions of a markup document, in source order.
 *
 * Each is `{kind, start, end}` over the ORIGINAL text, so a caller can map a
 * finding straight back to a line:
 *
 * - `comment` — a real `<!-- … -->`, spanning its delimiters. An unterminated
 *   one runs to the end of the document, which is how a browser reads it.
 * - `style` / `script` — a raw-text element's BODY, to be handed to the parser
 *   for that language. An unterminated one runs to the end of the document.
 * - `style-attribute` — the body of a `style` attribute, quoted or unquoted.
 *   The name must be exactly `style`, so `data-style` is not one.
 *
 * Ordinary text is not yielded: it is neither prose to exempt nor code to
 * parse, and every caller so far treats it as plain content. A `style=` written
 * in text is therefore text, not an attribute.
 */
export function* markupRegions(text) {
  let index = 0;

  while (index < text.length) {
    const next = text.indexOf('<', index);
    if (next === -1) return;

    if (text.startsWith('<!--', next)) {
      const close = text.indexOf('-->', next + 4);
      const end = close === -1 ? text.length : close + 3;
      yield {kind: 'comment', start: next, end};
      index = end;
      continue;
    }

    const rawText = rawTextTag(text, next);
    const tag = readTag(text, next);
    yield* tag.attributes;

    if (rawText) {
      const closing = new RegExp(`</${rawText}\\s*>`, 'i').exec(
        text.slice(tag.end),
      );
      const bodyEnd = closing ? tag.end + closing.index : text.length;
      yield {kind: rawText, start: tag.end, end: bodyEnd};
      index = closing ? bodyEnd + closing[0].length : text.length;
      continue;
    }

    index = tag.end;
  }
}
