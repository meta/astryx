// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getNodeText.ts
 * @input Receives a React node
 * @output Exports getNodeText, the node's plain text
 * @position Shared utility; consumed where a rendered node also needs a
 *   spoken name (Toast announcements, Table column-resize handle names, List
 *   reorder names, a tooltip's description)
 */

import {Fragment, isValidElement} from 'react';
import {isRenderable} from './isRenderable';
import type {ReactNode} from 'react';

// Host elements that start a new line or box, so their text never runs into
// the text beside them. Inline elements join the text beside them as it
// renders.
const BLOCK_ELEMENTS: ReadonlySet<string> = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'br',
  'caption',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

interface TextPiece {
  readonly text: string;
  // Whether a block starts or ends the piece: its text then stands apart
  // from the text before or after it.
  readonly startsBlock: boolean;
  readonly endsBlock: boolean;
}

/**
 * The block edges an inline element takes from its children: a block before
 * its first text starts it, and a block after its last text ends it.
 */
function edgesOf(
  pieces: ReadonlyArray<TextPiece>,
): Pick<TextPiece, 'startsBlock' | 'endsBlock'> {
  const edge = (ordered: ReadonlyArray<TextPiece>, isStart: boolean) => {
    for (const piece of ordered) {
      if (piece.text === '') {
        if (piece.startsBlock || piece.endsBlock) {
          return true;
        }
        continue;
      }
      return isStart ? piece.startsBlock : piece.endsBlock;
    }
    return false;
  };
  return {
    startsBlock: edge(pieces, true),
    endsBlock: edge([...pieces].reverse(), false),
  };
}

function piecesOf(node: ReactNode): TextPiece[] {
  if (!isRenderable(node)) {
    return [];
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return [{text: String(node), startsBlock: false, endsBlock: false}];
  }
  if (Array.isArray(node)) {
    return node.flatMap(piecesOf);
  }
  if (isValidElement(node)) {
    const {children} = node.props as {children?: ReactNode};
    if (node.type === Fragment) {
      return piecesOf(children);
    }
    const pieces = piecesOf(children);
    const text = joinPieces(pieces);
    // A component's display is unknown here, so its text stands apart, as a
    // block's does.
    if (typeof node.type !== 'string' || BLOCK_ELEMENTS.has(node.type)) {
      return [{text, startsBlock: true, endsBlock: true}];
    }
    return [{text, ...edgesOf(pieces)}];
  }
  return [];
}

function joinPieces(pieces: ReadonlyArray<TextPiece>): string {
  let text = '';
  let isAfterBlock = false;
  for (const piece of pieces) {
    if (piece.text === '') {
      isAfterBlock ||= piece.startsBlock || piece.endsBlock;
      continue;
    }
    const needsSpace =
      text !== '' &&
      (piece.startsBlock || isAfterBlock) &&
      !/\s$/.test(text) &&
      !/^\s/.test(piece.text);
    text += (needsSpace ? ' ' : '') + piece.text;
    isAfterBlock = piece.endsBlock;
  }
  return text;
}

/**
 * The plain text a node renders through strings, numbers and element
 * children, as it reads on the page: inline elements join the text beside
 * them, and a block element, a `<br>` or a component stands apart with a
 * space, also when an inline element holds it. Text a component renders
 * internally, from props other than `children`, is not reachable and yields
 * `''`.
 */
export function getNodeText(node: ReactNode): string {
  return joinPieces(piecesOf(node));
}
