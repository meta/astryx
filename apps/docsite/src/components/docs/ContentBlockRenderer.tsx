// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ProseBlock} from './ProseBlock';
import {CodeBlockRenderer} from './CodeBlock';
import {TableBlock} from './TableBlock';
import {ListBlock} from './ListBlock';
import {Heading} from '@astryxdesign/core/Text';
import type {ContentBlock} from '../../generated/docsRegistry';

export function ContentBlockRenderer({block}: {block: ContentBlock}) {
  switch (block.type) {
    case 'prose':
      return <ProseBlock text={block.text ?? ''} />;
    case 'heading': {
      const headingBlock = block as ContentBlock & {
        level?: 3 | 4 | 5 | 6;
      };
      return (
        <Heading level={headingBlock.level ?? 3}>
          {headingBlock.text ?? ''}
        </Heading>
      );
    }
    case 'code':
      return (
        <CodeBlockRenderer
          lang={block.lang ?? 'text'}
          code={block.code ?? ''}
          label={block.label}
        />
      );
    case 'table':
      return (
        <TableBlock headers={block.headers ?? []} rows={block.rows ?? []} />
      );
    case 'list':
      return <ListBlock items={block.items ?? []} listStyle={block.style} />;
    default: {
      const type = (block as {type?: unknown}).type;
      if (
        type === 'workflow' ||
        type === 'collection' ||
        type === 'reference'
      ) {
        throw new Error(
          `Documentation block "${type}" requires the compiled graph renderer.`,
        );
      }
      return null;
    }
  }
}
