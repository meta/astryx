// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The published ReferenceContentBlock union keeps its six members: every
 * exhaustive renderer written against it would break if one were added or
 * removed. This switch is such a renderer, so `typecheck:authoring` fails the
 * moment the union changes. Graph-only blocks live in GraphContentBlock.
 */

import type {ReferenceContentBlock} from '@astryxdesign/cli/authoring';

export function renderBlock(block: ReferenceContentBlock): string {
  switch (block.type) {
    case 'prose':
      return block.text;
    case 'heading':
      return block.text;
    case 'code':
      return block.code;
    case 'table':
      return block.headers.join(' | ');
    case 'list':
      return block.items.join('\n');
    case 'token-ref':
      return `${block.topic} / ${block.section}`;
    default: {
      const unhandled: never = block;
      return unhandled;
    }
  }
}
