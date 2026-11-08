// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A topic section's blocks are the six stable ReferenceContentBlock kinds and
 * the reference block, which a read inlines as the doc it includes. This
 * switch renders every one, so `typecheck:authoring` fails the moment a
 * section takes another kind. ReferenceContentBlock itself keeps its six
 * (reference-content-block.exhaustive.ts).
 */

import type {ReferenceSection} from '@astryxdesign/cli/authoring';

export function renderSectionBlock(
  block: ReferenceSection['content'][number],
): string {
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
    case 'reference':
      return [block.target, ...(block.projection?.fields ?? [])].join(' ');
    default: {
      const unhandled: never = block;
      return unhandled;
    }
  }
}
