// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getNodeText.ts
 * @input Receives a React node
 * @output Exports getNodeText, the node's plain text
 * @position Shared utility; consumed where a rendered node also needs a
 *   spoken name (Toast announcements, Table column-resize handle names)
 */

import {isValidElement} from 'react';
import type {ReactNode} from 'react';

/**
 * The plain text a node renders through strings, numbers and element
 * children, joined with spaces. Text a component renders internally, from
 * props other than `children`, is not reachable and yields `''`.
 */
export function getNodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getNodeText).filter(Boolean).join(' ');
  }
  if (isValidElement(node)) {
    const {children} = node.props as {children?: ReactNode};
    return getNodeText(children);
  }
  return '';
}
