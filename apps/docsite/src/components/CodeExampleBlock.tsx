// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CodeExampleBlock.tsx
 * @input CodeBlock props for docsite-rendered examples
 * @output CodeBlock with docsite-only source cleanup applied
 * @position Shared docsite wrapper for displayed/copyable code snippets
 */

import {CodeBlock, type CodeBlockProps} from '@astryxdesign/core/CodeBlock';
import {stripCodeExampleCopyrightHeader} from '../lib/codeExamples';

export function CodeExampleBlock({code, ...props}: CodeBlockProps) {
  return <CodeBlock {...props} code={stripCodeExampleCopyrightHeader(code)} />;
}
