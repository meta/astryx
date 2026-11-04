// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {ReferenceContentBlock} from '@astryxdesign/cli/authoring';
import {ProseBlock} from './ProseBlock';
import {CodeBlock} from './CodeBlock';
import {TableBlock} from './TableBlock';
import {ListBlock} from './ListBlock';

/**
 * Renders a single ReferenceContentBlock by dispatching to the appropriate component.
 */
export function ContentBlockRenderer({block}: {block: ReferenceContentBlock}) {
  switch (block.type) {
    case 'prose':
      return <ProseBlock text={block.text} />;
    case 'code':
      return (
        <CodeBlock lang={block.lang} code={block.code} label={block.label} />
      );
    case 'table':
      return <TableBlock headers={block.headers} rows={block.rows} />;
    case 'list':
      return <ListBlock items={block.items} listStyle={block.style} />;
    case 'token-ref':
      return null;
    default:
      return null;
  }
}
