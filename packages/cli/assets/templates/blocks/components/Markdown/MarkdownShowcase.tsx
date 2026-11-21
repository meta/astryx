// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Markdown} from '@astryxdesign/core/Markdown';
import {Center} from '@astryxdesign/core/Center';

const content = [
  '# Markdown Demo',
  '',
  'Renders **markdown** with *design-system-consistent* styling.',
  '',
  '## Features',
  '',
  '- Headings mapped to the Astryx type scale',
  '- **Bold**, *italic*, and ~~strikethrough~~ text',
  '- [Links](https://example.com) with external detection',
  '',
  '> Block quote indented text',
].join('\n');

export default function MarkdownShowcase() {
  return (
    <Center width={400} maxWidth="100%">
      <Markdown>{content}</Markdown>
    </Center>
  );
}
