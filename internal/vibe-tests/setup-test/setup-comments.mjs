// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Where a file's prose is, so an escape hatch never reads it as code.
 *
 * `hardcoded-important` was fixed this way in #5856: the flag is found by
 * parsing, so an executor that writes "do not reach for `!important`" in a
 * JSDoc block above the workaround it chose instead no longer fails the run for
 * saying the right thing. The two hatches still matched by pattern —
 * `blanket-reset` and `dark-mode-disabled` — had the same fault, in the same
 * shape: a guidance sentence naming `all: unset`, or a comment explaining that
 * the host's `color-scheme: light` arm was left alone, is prose, and prose is
 * not a change to the host.
 *
 * Rather than teach each pattern to recognize a comment, the comment is located
 * once, by the parser that owns the file, and blanked out of the line before
 * any pattern sees it:
 *
 * - CSS and CSS-like files go through **postcss**, whose `Comment` node is the
 *   parser's own answer to "is this prose"; a `/* … *\/` inside a quoted value
 *   is part of that value and is never a Comment.
 * - Scripts go through the **TypeScript** parser, which handles `.js`, `.jsx`,
 *   `.ts`, and `.tsx` with one API and reports comments as trivia, so `//` in a
 *   URL string and `/*` in a regular expression are not comments.
 * - HTML, Vue, and Svelte are WALKED rather than scanned (see
 *   `setup-markup.mjs`, the walk this shares with `setup-important.mjs`),
 *   because `<!--` opens a comment only in markup text: inside `<script>` and
 *   `<style>`, and inside a tag's attribute values, those four characters are
 *   ordinary content. Each raw-text element's body is handed to the analyzer
 *   for its own language.
 *
 * Blanking preserves offsets and line boundaries, so a hatch written on the
 * same line as a comment is still found, and only the comment's own characters
 * stop being code.
 *
 * Anything that cannot be parsed reports NO comments. That is the fail-closed
 * direction here: a file this module cannot read keeps every character subject
 * to the scan, so an unreadable file can never be used to hide a real hatch —
 * it only risks the false positive that was already there.
 */

import postcss from 'postcss';
import ts from 'typescript';
import * as path from 'node:path';

import {
  CSS_EXTENSIONS,
  MARKUP_EXTENSIONS,
  SCRIPT_KINDS,
} from './setup-important.mjs';
import {markupRegions} from './setup-markup.mjs';

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

/** Comment spans in a stylesheet, via postcss; none when it cannot be read. */
function cssCommentSpans(text) {
  let root;
  try {
    root = postcss.parse(text, {from: undefined});
  } catch {
    return [];
  }
  const starts = lineStarts(text);
  const offsetOf = position => {
    if (position == null) return null;
    if (typeof position.offset === 'number') return position.offset;
    const start = starts[position.line - 1];
    return start === undefined ? null : start + position.column - 1;
  };
  const spans = [];
  root.walkComments(comment => {
    const start = offsetOf(comment.source?.start);
    const end = offsetOf(comment.source?.end);
    if (start === null) return;
    // postcss's `end` names the comment's last character; a span is exclusive.
    spans.push({start, end: end === null ? text.length : end + 1});
  });
  return spans;
}

/** Comment spans in a script, via the TypeScript parser's own trivia. */
function scriptCommentSpans(text, fileName, scriptKind) {
  let source;
  try {
    source = ts.createSourceFile(
      fileName,
      text,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );
  } catch {
    return [];
  }
  const spans = [];
  const seen = new Set();
  const collect = ranges => {
    for (const range of ranges ?? []) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      spans.push({start: range.pos, end: range.end});
    }
  };
  const visit = node => {
    // JSX text is content, not trivia: `//` in a sentence or a URL there is
    // part of the document, and scanning it for comments would blank real
    // markup.
    if (node.kind !== ts.SyntaxKind.JsxText) {
      // Leading ranges stop at the first line break, so a comment that begins
      // on the same line as the code before it is only ever a TRAILING range —
      // which is where `// note` after a statement, and the body of a JSX
      // `{/* … */}`, both live.
      collect(ts.getLeadingCommentRanges(text, node.getFullStart()));
      collect(ts.getTrailingCommentRanges(text, node.getEnd()));
    }
    // `getChildren` walks tokens as well as nodes, which is what a JSX comment
    // needs: `{/* … */}` holds no expression, so its comment hangs off the
    // braces and `forEachChild` never reaches them.
    for (const child of node.getChildren(source)) {
      visit(child);
    }
  };
  try {
    visit(source);
  } catch {
    return [];
  }
  return spans;
}

/**
 * Comment spans in markup, over the regions of the shared structural walk.
 *
 * WHERE a comment can begin is the whole point — see `setup-markup.mjs`. A real
 * `<!-- … -->` is prose; a raw-text element's body is handed to the analyzer
 * for ITS language, where only a real `/* … *\/` or `//` counts; a tag and its
 * attribute values are neither, so `<!--` written inside one stays visible.
 */
function markupCommentSpans(text, fileName) {
  const spans = [];
  for (const region of markupRegions(text)) {
    if (region.kind === 'comment') {
      spans.push({start: region.start, end: region.end});
      continue;
    }
    if (region.kind !== 'style' && region.kind !== 'script') continue;
    const body = text.slice(region.start, region.end);
    const inner =
      region.kind === 'style'
        ? cssCommentSpans(body)
        : scriptCommentSpans(body, `${fileName}.ts`, ts.ScriptKind.TS);
    for (const span of inner) {
      spans.push({
        start: span.start + region.start,
        end: span.end + region.start,
      });
    }
  }
  return spans;
}

/**
 * The character spans of every comment in `text`, as `{start, end}` offsets.
 *
 * A file whose extension has no analyzer, and a file its analyzer cannot read,
 * both report no comments: nothing is exempted from the scan on a guess.
 */
export function commentSpans(relativePath, text) {
  if (typeof text !== 'string' || text === '') return [];
  const extension = path.extname(relativePath).toLowerCase();
  if (CSS_EXTENSIONS.has(extension)) {
    return cssCommentSpans(text);
  }
  if (SCRIPT_KINDS.has(extension)) {
    return scriptCommentSpans(
      text,
      path.basename(relativePath),
      SCRIPT_KINDS.get(extension),
    );
  }
  if (MARKUP_EXTENSIONS.has(extension)) {
    return markupCommentSpans(text, path.basename(relativePath));
  }
  return [];
}
