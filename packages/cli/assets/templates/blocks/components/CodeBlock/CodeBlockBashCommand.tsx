// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {VStack} from '@astryxdesign/core/Stack';

export default function CodeBlockBashCommand() {
  return (
    <VStack gap={4} style={{width: '100%', maxWidth: 400}}>
      <CodeBlock
        code="npm install @astryxdesign/core"
        language="bash"
        hasLanguageLabel={false}
        style={{width: '100%'}}
      />
      <CodeBlock
        code="yarn add @astryxdesign/theme-neutral"
        language="bash"
        hasLanguageLabel={false}
        style={{width: '100%'}}
      />
      <CodeBlock
        code={
          'astryx upgrade --from 0.6.0 --apply --path apps/web/src --install-deps\nnpm run build'
        }
        language="bash"
        hasLanguageLabel={false}
        style={{width: '100%'}}
      />
    </VStack>
  );
}
