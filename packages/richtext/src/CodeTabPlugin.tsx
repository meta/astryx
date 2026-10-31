// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CodeTabPlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/code (CodeNode), and
 *   lexical.
 * @output Exports CodeTabPlugin, which makes Tab and Shift+Tab in a code block
 *   indent and outdent every line the selection touches, by the indent the
 *   block's own lines use.
 * @position Rendered by RichTextEditor; always on, and not exported from the
 *   package (spec:AST-061 DEC-8). A press indents by the block's own indent,
 *   so edited code keeps the indentation its author chose (spec:AST-062
 *   DEC-1); the selection stays on the same characters, and each press is
 *   one undo step. It replaces only what Tab did in a code block before:
 *   TabIndentationPlugin put a tab character in place of the selection. Its
 *   listener sits at the front of the editor-priority queue, ahead of
 *   TabIndentationPlugin and behind every low-priority listener, so Escape
 *   then Tab still moves focus out of the editor (TabFocusEscapePlugin, WCAG
 *   2.1.2). A selection that reaches outside the code block keeps
 *   TabIndentationPlugin's meaning. Read-only and disabled editors are
 *   unchanged.
 */

import {useEffect} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isCodeNode, type CodeNode} from '@lexical/code';
import {
  $addUpdateTag,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTabNode,
  $isTextNode,
  COMMAND_PRIORITY_BEFORE_EDITOR,
  HISTORY_PUSH_TAG,
  KEY_TAB_COMMAND,
  type LexicalNode,
  type PointType,
  type RangeSelection,
  type TextNode,
} from 'lexical';

/** The narrowest space indent a block uses, and the widest. */
const MIN_SPACE_INDENT = 2;
const MAX_SPACE_INDENT = 8;

function leadingSpaces(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0;
}

/**
 * The indent a code block's lines use: a tab when any line starts with one;
 * otherwise the fewest spaces an indented line starts with, kept between two
 * and eight; otherwise two spaces.
 */
function codeIndentUnit(lines: ReadonlyArray<string>): string {
  if (lines.some(line => line.startsWith('\t'))) {
    return '\t';
  }
  const widths = lines.map(leadingSpaces).filter(width => width > 0);
  const width = widths.length === 0 ? MIN_SPACE_INDENT : Math.min(...widths);
  return ' '.repeat(
    Math.min(MAX_SPACE_INDENT, Math.max(MIN_SPACE_INDENT, width)),
  );
}

/**
 * A code block's children, the offset in the block's text where each one
 * starts, and that text. A line ends at a line break node or at a newline
 * inside a text node: imported code holds newlines, and Enter adds line
 * break nodes.
 */
interface CodeLayout {
  readonly children: ReadonlyArray<LexicalNode>;
  readonly starts: ReadonlyArray<number>;
  readonly text: string;
}

function $layoutOf(code: CodeNode): CodeLayout {
  const children = code.getChildren();
  const starts: number[] = [];
  let text = '';
  for (const child of children) {
    starts.push(text.length);
    text += child.getTextContent();
  }
  return {children, starts, text};
}

/** A text node that can take a caret and grow: any but a tab node. */
function $isPlainText(node: LexicalNode): node is TextNode {
  return $isTextNode(node) && !$isTabNode(node);
}

/** The code block that holds both ends of the selection, or null. */
function $selectionCodeBlock(selection: RangeSelection): CodeNode | null {
  const blockOf = (point: PointType) => {
    const node = point.getNode();
    return $isCodeNode(node) ? node : node.getParent();
  };
  const block = blockOf(selection.anchor);
  return $isCodeNode(block) && block.is(blockOf(selection.focus))
    ? block
    : null;
}

/** Where a point of the block's selection falls in the block's text. */
function $offsetOf(
  code: CodeNode,
  layout: CodeLayout,
  point: PointType,
): number {
  if (point.key === code.getKey()) {
    return point.offset < layout.children.length
      ? layout.starts[point.offset]
      : layout.text.length;
  }
  const index = layout.children.findIndex(
    child => child.getKey() === point.key,
  );
  return index < 0 ? 0 : layout.starts[index] + point.offset;
}

/**
 * Moves a selection point to an offset in the block's text: into the text
 * node there, or between children where none holds it (beside a tab or a
 * line break, or on an empty line).
 */
function $placePoint(code: CodeNode, point: PointType, offset: number): void {
  const children = code.getChildren();
  let start = 0;
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    const size = child.getTextContentSize();
    if ($isPlainText(child) && offset >= start && offset <= start + size) {
      point.set(child.getKey(), offset - start, 'text');
      return;
    }
    if (offset <= start) {
      point.set(code.getKey(), index, 'element');
      return;
    }
    start += size;
  }
  point.set(code.getKey(), children.length, 'element');
}

/** Inserts text at an offset in the block's text. */
function $insertAt(code: CodeNode, offset: number, text: string): void {
  const {children, starts} = $layoutOf(code);
  for (let index = 0; index < children.length; index++) {
    const child = children[index];
    const start = starts[index];
    if (
      $isPlainText(child) &&
      offset >= start &&
      offset <= start + child.getTextContentSize()
    ) {
      const content = child.getTextContent();
      const at = offset - start;
      child.setTextContent(content.slice(0, at) + text + content.slice(at));
      return;
    }
    if (offset <= start) {
      child.insertBefore($createTextNode(text));
      return;
    }
  }
  code.append($createTextNode(text));
}

/** Removes `count` characters at an offset in the block's text. */
function $removeAt(code: CodeNode, offset: number, count: number): void {
  const {children, starts} = $layoutOf(code);
  let left = count;
  for (let index = 0; index < children.length && left > 0; index++) {
    const child = children[index];
    const size = child.getTextContentSize();
    if (!$isTextNode(child) || starts[index] + size <= offset) {
      continue;
    }
    const from = Math.max(0, offset - starts[index]);
    const removed = Math.min(left, size - from);
    const content = child.getTextContent();
    const rest = content.slice(0, from) + content.slice(from + removed);
    if (rest === '') {
      child.remove();
    } else {
      child.setTextContent(rest);
    }
    left -= removed;
  }
}

/**
 * Indents, or outdents, every line the selection touches by the block's own
 * indent, and puts the selection back on the characters it held.
 */
function $shiftLines(
  code: CodeNode,
  selection: RangeSelection,
  isOutdent: boolean,
): void {
  const layout = $layoutOf(code);
  const lines = layout.text.split('\n');
  const lineStarts: number[] = [];
  let lineStart = 0;
  for (const line of lines) {
    lineStarts.push(lineStart);
    lineStart += line.length + 1;
  }
  const lineAt = (offset: number) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) {
      line++;
    }
    return line;
  };
  const unit = codeIndentUnit(lines);
  // A tab-indented block outdents a space-indented line by the narrowest
  // space indent.
  const spaceUnit = unit === '\t' ? MIN_SPACE_INDENT : unit.length;
  const anchor = $offsetOf(code, layout, selection.anchor);
  const focus = $offsetOf(code, layout, selection.focus);
  const start = Math.min(anchor, focus);
  const end = Math.max(anchor, focus);
  const first = lineAt(start);
  let last = lineAt(end);
  // A selection that ends where a line begins does not reach into that line.
  if (last > first && lineStarts[last] === end) {
    last--;
  }
  // Each edit as [offset, characters added (negative when removed)], made
  // from the last line up so the offsets of the lines above stay true.
  const edits: Array<readonly [number, number]> = [];
  for (let line = last; line >= first; line--) {
    const at = lineStarts[line];
    if (!isOutdent) {
      $insertAt(code, at, unit);
      edits.push([at, unit.length]);
      continue;
    }
    const removed = lines[line].startsWith('\t')
      ? 1
      : Math.min(leadingSpaces(lines[line]), spaceUnit);
    if (removed > 0) {
      $removeAt(code, at, removed);
      edits.push([at, -removed]);
    }
  }
  // A point keeps its character: text added at or before it pushes it on,
  // and a point inside removed indentation moves to its line's start.
  const shifted = (offset: number) =>
    edits.reduce((moved, [at, delta]) => {
      if (delta > 0) {
        return offset >= at ? moved + delta : moved;
      }
      return offset > at ? moved - Math.min(-delta, offset - at) : moved;
    }, offset);
  $placePoint(code, selection.anchor, shifted(anchor));
  $placePoint(code, selection.focus, shifted(focus));
}

export function CodeTabPlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        KEY_TAB_COMMAND,
        event => {
          const selection = $getSelection();
          if (!editor.isEditable() || !$isRangeSelection(selection)) {
            return false;
          }
          const code = $selectionCodeBlock(selection);
          if (code == null) {
            return false;
          }
          event.preventDefault();
          // One undo step per press, even when a press adds or removes a
          // single character beside the caret, which history would
          // otherwise merge with typing or with the press before.
          $addUpdateTag(HISTORY_PUSH_TAG);
          $shiftLines(code, selection, event.shiftKey);
          return true;
        },
        // After TabFocusEscapePlugin's low-priority listener, which lets an
        // armed Tab move focus, and before TabIndentationPlugin's; see the
        // file header.
        COMMAND_PRIORITY_BEFORE_EDITOR,
      ),
    [editor],
  );
  return null;
}
