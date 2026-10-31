// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {ReferenceContentBlock} from '@astryxdesign/cli/authoring';
import {Heading} from '@astryxdesign/core/Text';
import {ProseBlock} from './ProseBlock';
import {CodeBlock} from './CodeBlock';
import {TableBlock} from './TableBlock';
import {ListBlock} from './ListBlock';

/**
 * Renders a single ReferenceContentBlock by dispatching to the appropriate
 * component. The preview renders docs as `astryx docs` reads them, so a block
 * it has no renderer for fails here, where it is met, instead of leaving the
 * preview without it; a new kind also fails the switch's exhaustiveness.
 */
export function ContentBlockRenderer({block}: {block: ReferenceContentBlock}) {
  switch (block.type) {
    case 'prose':
      return <ProseBlock text={block.text} />;
    case 'heading':
      return <Heading level={block.level}>{block.text}</Heading>;
    case 'code':
      return (
        <CodeBlock lang={block.lang} code={block.code} label={block.label} />
      );
    case 'table':
      return <TableBlock headers={block.headers} rows={block.rows} />;
    case 'list':
      return <ListBlock items={block.items} listStyle={block.style} />;
    case 'token-ref':
      throw new Error(
        `The doc preview met a token reference to "${block.topic}" / "${block.section}": a docs read inlines token references, so its data did not come from one.`,
      );
    default: {
      const unhandled: never = block;
      throw new Error(
        `The doc preview has no renderer for "${(unhandled as {type: string}).type}" blocks.`,
      );
    }
  }
}
