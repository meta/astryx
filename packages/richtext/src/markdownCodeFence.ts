// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownCodeFence.ts
 * @input Uses @lexical/markdown (CODE) and @lexical/code.
 * @output Exports BACKTICK_CODE and TILDE_CODE, the transformers for fenced
 *   code blocks opened with backticks and with tildes.
 * @position Part of DEFAULT_TRANSFORMERS (markdownTable.ts): BACKTICK_CODE
 *   stands in for Lexical's CODE, and TILDE_CODE reads the `~~~` fences CODE
 *   does not (CommonMark 0.31 §4.5, spec:AST-061 FR5). Both read the opening
 *   line as core Markdown does: the rest of the line after the fence is the
 *   info string, never code; the language is its first word, after any
 *   spaces (so `~~~ c++` reads `c++`), as core and CommonMark read it. A
 *   block closes at
 *   a fence of its own character at least as long, or at the end of the
 *   document, and its code is exactly the lines between, blank lines
 *   included, each less as much indentation as the opening fence has (up to
 *   three spaces), as core reads it. Each keeps its fence and info
 *   string (spec:AST-062): an edited block exports them as written, with its
 *   language first when that was changed, and its fence lengthened when its
 *   code holds a run of the fence's character that long.
 *   A one-line backtick block (```` ```code``` ````) stays Lexical's.
 */

import {$createCodeNode, $isCodeNode} from '@lexical/code';
import {
  CODE,
  type ElementTransformer,
  type MultilineElementTransformer,
} from '@lexical/markdown';
import {
  $createTextNode,
  $getState,
  $setState,
  createState,
  type ElementNode,
} from 'lexical';

/**
 * The tilde fence a code block was opened with; null for a backtick block.
 * Lexical's own fence state holds only backtick fences.
 */
const tildeFence = createState('astryxTildeFence', {
  parse: (value: unknown): string | null =>
    typeof value === 'string' && /^~{3,}$/.test(value) ? value : null,
});

/**
 * The backtick fence a code block was opened with, when longer than three:
 * Lexical's own fence state is set only by its transformer, which this file
 * does not use to build blocks.
 */
const backtickFence = createState('astryxBacktickFence', {
  parse: (value: unknown): string | null =>
    typeof value === 'string' && /^`{4,}$/.test(value) ? value : null,
});

/** The info string a code block's opening fence carried, as written. */
const fenceInfo = createState('astryxFenceInfo', {
  parse: (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null,
});

/** The language core Markdown reads from an info string, or null. */
function languageOf(info: string): string | null {
  return /^\S+/.exec(info.trimStart())?.[0] ?? null;
}

/** An opening fence line: its indentation, its fence, and the info string. */
interface Opening {
  readonly indentation: number;
  readonly fence: string;
  readonly info: string;
}

/**
 * Reads an opening fence line: up to three spaces of indentation, then the
 * fence (CommonMark 0.31 §4.5), as core Markdown reads it.
 */
function readOpening(line: string): Opening | null {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (match == null) {
    return null;
  }
  const [, indentation, fence, info] = match;
  // A backtick fence's info string holds no backtick.
  return fence.startsWith('`') && info.includes('`')
    ? null
    : {indentation: indentation.length, fence, info};
}

/** The longest run of three or more of `character` in `text`, or 0. */
function longestFenceRun(text: string, character: '`' | '~'): number {
  return Math.max(
    0,
    ...(text.match(character === '`' ? /`{3,}/g : /~{3,}/g) ?? []).map(
      run => run.length,
    ),
  );
}

/**
 * Builds the code block an opening line starts, from the lines after it up
 * to its closing fence, and returns the index of the last line it used.
 */
function $importFencedCode(
  rootNode: ElementNode,
  lines: ReadonlyArray<string>,
  startLineIndex: number,
  opening: Opening,
): number {
  const {indentation, fence, info} = opening;
  const closing = new RegExp(
    `^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`,
  );
  // Each code line loses as much indentation as the opening fence has.
  const fenceIndentation = new RegExp(`^ {0,${indentation}}`);
  let end = startLineIndex + 1;
  while (end < lines.length && !closing.test(lines[end])) {
    end++;
  }
  // A fence left open runs to the end of the document, whose final line
  // ending starts no line of code (CommonMark 0.31 §4.5), as core reads it.
  const codeEnd =
    end === lines.length && end > startLineIndex + 1 && lines[end - 1] === ''
      ? end - 1
      : end;
  // The code is the lines between the fences, exactly: Lexical's own
  // transformer trims a space from the first line and drops blank first and
  // last lines, adjustments meant for its own reading of the opening line.
  const block = $createCodeNode(languageOf(info) ?? undefined);
  block.append(
    $createTextNode(
      lines
        .slice(startLineIndex + 1, codeEnd)
        .map(line => line.replace(fenceIndentation, ''))
        .join('\n'),
    ),
  );
  rootNode.append(block);
  if (fence.startsWith('~')) {
    $setState(block, tildeFence, fence);
  } else if (fence.length > 3) {
    $setState(block, backtickFence, fence);
  }
  $setState(block, fenceInfo, info.trimEnd());
  return Math.min(end, lines.length - 1);
}

/** Writes a code block that keeps its fence or info string; null otherwise. */
const exportFencedCode: ElementTransformer['export'] = node => {
  if (!$isCodeNode(node)) {
    return null;
  }
  const tilde = $getState(node, tildeFence);
  const backticks = $getState(node, backtickFence);
  const info = $getState(node, fenceInfo);
  if (tilde == null && backticks == null && info == null) {
    return null;
  }
  const text = node.getTextContent();
  const language = node.getLanguage() ?? '';
  let written = info ?? '';
  if ((languageOf(written) ?? '') !== language) {
    // The language changed: it leads, before the rest of the info string.
    const previous = languageOf(written);
    const rest =
      previous == null ? '' : written.trimStart().slice(previous.length).trim();
    written = rest === '' ? language : `${language} ${rest}`;
  }
  // A fence outlasts any run of its character in the code.
  const fence =
    tilde != null
      ? '~'.repeat(Math.max(tilde.length, longestFenceRun(text, '~') + 1))
      : '`'.repeat(
          Math.max((backticks ?? '```').length, longestFenceRun(text, '`') + 1),
        );
  return `${fence}${written}${text === '' ? '' : `\n${text}`}\n${fence}`;
};

export const BACKTICK_CODE: MultilineElementTransformer = {
  ...CODE,
  handleImportAfterStartMatch: args => {
    const opening = readOpening(args.lines[args.startLineIndex]);
    if (opening == null) {
      return CODE.handleImportAfterStartMatch?.(args) ?? null;
    }
    return [
      true,
      $importFencedCode(
        args.rootNode,
        args.lines,
        args.startLineIndex,
        opening,
      ),
    ];
  },
  export: (node, exportChildren) =>
    exportFencedCode(node, exportChildren) ??
    CODE.export?.(node, exportChildren) ??
    null,
};

export const TILDE_CODE: MultilineElementTransformer = {
  ...CODE,
  regExpStart: /^( {0,3}~{3,})(.*)$/,
  regExpEnd: {optional: true, regExp: /^ {0,3}~{3,}[ \t]*$/},
  handleImportAfterStartMatch: ({lines, rootNode, startLineIndex}) => {
    const opening = readOpening(lines[startLineIndex]);
    return opening == null
      ? null
      : [true, $importFencedCode(rootNode, lines, startLineIndex, opening)];
  },
  export: (node, exportChildren) =>
    exportFencedCode(node, exportChildren) ?? null,
};
