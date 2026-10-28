// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CodeSyntaxPlugin.tsx
 * @input Uses @lexical/react (composer context), @lexical/code (CodeNode),
 *   lexical, and core CodeBlock's tokenizer, highlight ranges, and token
 *   types.
 * @output Exports CodeSyntaxPlugin, which colors the code in every fenced code
 *   block with core CodeBlock's tokenizer and syntax color tokens;
 *   CODE_SYNTAX_CLASS, the class the theme gives code blocks for it; and
 *   renderedTokens, which lays tokens out over a block's rendered text.
 * @position Rendered by RichTextEditor and RichTextView. A fenced code block
 *   with a language core CodeBlock knows is colored as core Markdown colors
 *   it: the same tokenizer finds the same tokens, and each token type takes
 *   its `--color-syntax-*` token (spec:AST-061 FR1) — no palette of its own.
 *   The colors are CSS Custom Highlight ranges over the text Lexical renders,
 *   the way core CodeBlock colors editable code, so the document and its DOM
 *   are untouched; the ranges are rebuilt when a block's code or language
 *   changes. Browsers without the Highlight API show plain code.
 */

import {useEffect, useState} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isCodeNode, CodeNode} from '@lexical/code';
import {$getNodeByKey, type NodeKey} from 'lexical';
import {
  applyHighlightRangesFlat,
  TOKEN_TYPES,
  tokenize,
  type CodeLanguage,
  type TokenLine,
} from '@astryxdesign/core/CodeBlock';
import {listedLanguage, sameLanguages} from './codeLanguages';

/** The class the theme adds to every code block (editorTheme.ts). */
export const CODE_SYNTAX_CLASS = 'astryx-richtext-code';

let hasInjectedRules = false;

/**
 * The highlight rules for code blocks, injected once: each token type takes
 * the same syntax color token core CodeBlock's rules use.
 */
function ensureRules(): void {
  if (hasInjectedRules || typeof document === 'undefined') {
    return;
  }
  hasInjectedRules = true;
  const style = document.createElement('style');
  style.setAttribute('data-astryx-richtext-code-syntax', '');
  style.textContent = TOKEN_TYPES.map(
    type =>
      `.${CODE_SYNTAX_CLASS}::highlight(astryx-${type}) { color: var(--color-syntax-${type}); }`,
  ).join('\n');
  document.head.append(style);
}

function supportsHighlights(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    'highlights' in CSS &&
    typeof Highlight !== 'undefined'
  );
}

/**
 * The tokens of `code`, laid out for the rendered text of its block: line by
 * line when the text keeps the line breaks, or as one line of offsets when
 * each line break is an element with no text. Null when the rendered text is
 * not the code (it is mid-update), so nothing is colored out of place.
 */
export function renderedTokens(
  code: string,
  language: string | CodeLanguage,
  rendered: string,
): TokenLine[] | null {
  const lines = tokenize(code, language);
  if (rendered === code) {
    return lines;
  }
  if (rendered !== code.replaceAll('\n', '')) {
    return null;
  }
  const flat: TokenLine = [];
  let offset = 0;
  code.split('\n').forEach((line, index) => {
    for (const token of lines[index] ?? []) {
      flat.push({
        type: token.type,
        start: offset + token.start,
        end: offset + token.end,
      });
    }
    offset += line.length;
  });
  return [flat];
}

interface Colored {
  readonly element: HTMLElement;
  readonly code: string;
  readonly language: string;
  readonly cleanup: () => void;
}

export function CodeSyntaxPlugin({
  codeLanguages,
}: {
  /** Language values a fence may name (component:Markdown FR30). */
  codeLanguages?: ReadonlyArray<CodeLanguage>;
} = {}): null {
  const [editor] = useLexicalComposerContext();
  // Keep one list while it names the same values, so an inline
  // `codeLanguages={[…]}` does not re-colour every block on each parent
  // render (adjusting state during render, not in an Effect).
  const [languages, setLanguages] = useState(codeLanguages);
  if (!sameLanguages(languages, codeLanguages)) {
    setLanguages(codeLanguages);
  }

  // Synchronizes the editor's code blocks with the CSS highlight registry:
  // Lexical update and mutation listeners colour each block, and the cleanup
  // removes the listeners and every highlight range they added.
  useEffect(() => {
    if (!supportsHighlights()) {
      return undefined;
    }
    ensureRules();
    // Every code block in the editor, and the ones colored, by node key.
    const blocks = new Set<NodeKey>();
    const colored = new Map<NodeKey, Colored>();
    const uncolor = (key: NodeKey) => {
      colored.get(key)?.cleanup();
      colored.delete(key);
    };
    const color = (key: NodeKey) => {
      const block = editor.getEditorState().read(() => {
        const node = $getNodeByKey(key);
        return $isCodeNode(node)
          ? {code: node.getTextContent(), language: node.getLanguage() ?? ''}
          : null;
      });
      const element = editor.getElementByKey(key);
      if (block == null || element == null) {
        uncolor(key);
        return;
      }
      const previous = colored.get(key);
      if (
        previous != null &&
        previous.element === element &&
        previous.code === block.code &&
        previous.language === block.language
      ) {
        return;
      }
      previous?.cleanup();
      const tokens = renderedTokens(
        block.code,
        listedLanguage(languages, block.language) ?? block.language,
        element.textContent ?? '',
      );
      if (tokens == null) {
        // Not rendered yet; the next update tries again.
        colored.delete(key);
        return;
      }
      colored.set(key, {
        element,
        ...block,
        cleanup: applyHighlightRangesFlat(element, tokens),
      });
    };
    const unregisterMutations = editor.registerMutationListener(
      CodeNode,
      mutations => {
        for (const [key, mutation] of mutations) {
          if (mutation === 'destroyed') {
            blocks.delete(key);
            uncolor(key);
          } else {
            blocks.add(key);
            color(key);
          }
        }
      },
      {skipInitialization: false},
    );
    // Typing in a block changes its text nodes, not always the block itself:
    // recheck every block after each update (unchanged ones stop at the
    // comparison above).
    const unregisterUpdates = editor.registerUpdateListener(() => {
      for (const key of blocks) {
        color(key);
      }
    });
    return () => {
      unregisterMutations();
      unregisterUpdates();
      for (const key of [...colored.keys()]) {
        uncolor(key);
      }
      blocks.clear();
    };
  }, [editor, languages]);

  return null;
}
