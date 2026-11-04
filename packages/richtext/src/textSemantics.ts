// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textSemantics.ts
 * @input Uses lexical (TextNode, configExtension) and @lexical/html
 *   (DOMRenderExtension, domOverride).
 * @output Exports TextSemanticsExtension, which renders struck-through text
 *   inside a `<del>` and bold italic text inside an `<em>`, the elements core
 *   Markdown renders for them.
 * @position A dependency of the RichTextEditor and RichTextView extensions.
 *   Lexical draws struck text as a styled `<span>`, or as the `<strong>`,
 *   `<em>`, or `<code>` its other marks call for, and draws bold italic text
 *   as a `<strong>` alone, so assistive technology hears no deletion, and no
 *   emphasis on bold italic text, where core Markdown exposes them
 *   (spec:AST-061 FR7). Giving Lexical's element another role would replace
 *   the one it already has; instead each text node's element, exactly as
 *   Lexical builds it, sits inside the elements it is missing — a `<del>`,
 *   then an `<em>` — so every mark is exposed together. Struck text inside a
 *   link is a deletion inside the link. The document, its Markdown, and the
 *   selection model are unchanged: the text node's element is still the one
 *   Lexical created and updates, and Lexical finds its text by walking down
 *   from the outermost element.
 */

import {DOMRenderExtension, domOverride} from '@lexical/html';
import {
  configExtension,
  TEXT_TYPE_TO_FORMAT,
  TextNode,
  type AnyLexicalExtensionArgument,
} from 'lexical';

const STRIKETHROUGH = TEXT_TYPE_TO_FORMAT.strikethrough;
const BOLD_ITALIC = TEXT_TYPE_TO_FORMAT.bold | TEXT_TYPE_TO_FORMAT.italic;

/**
 * The elements this version of `node` sits inside, outermost first. Reads the
 * version's own field: Lexical's getters read the latest version, so
 * `prevNode.hasFormat()` would answer for the next one.
 */
function wrappersOf(node: TextNode): ReadonlyArray<'del' | 'em'> {
  const format = node.__format;
  const wrappers: Array<'del' | 'em'> = [];
  if ((format & STRIKETHROUGH) !== 0) {
    wrappers.push('del');
  }
  // Lexical draws bold italic text as a `<strong>` with an italic class.
  if ((format & BOLD_ITALIC) === BOLD_ITALIC) {
    wrappers.push('em');
  }
  return wrappers;
}

function sameWrappers(
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>,
): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

// Typed as an extension argument: its inferred type names Lexical types the
// package's declarations cannot (TS4023).
export const TextSemanticsExtension: AnyLexicalExtensionArgument =
  configExtension(DOMRenderExtension, {
    overrides: [
      domOverride([TextNode], {
        $createDOM(node, $next) {
          let element = $next();
          for (const tag of [...wrappersOf(node)].reverse()) {
            const wrapper = document.createElement(tag);
            wrapper.append(element);
            element = wrapper;
          }
          return element;
        },
        $updateDOM(nextNode, prevNode, dom, $next, editor) {
          const wrappers = wrappersOf(nextNode);
          if (!sameWrappers(wrappers, wrappersOf(prevNode))) {
            // Adding or removing a wrapper recreates the element.
            return true;
          }
          if (wrappers.length === 0) {
            return $next();
          }
          // Lexical updates its own element, inside the wrappers.
          let element: Element | null = dom;
          for (const tag of wrappers) {
            if (element?.tagName.toLowerCase() !== tag) {
              return true;
            }
            element = element.firstElementChild;
          }
          if (element == null) {
            return true;
          }
          return nextNode.updateDOM(
            prevNode,
            element as HTMLElement,
            editor._config,
          );
        },
      }),
    ],
  });
