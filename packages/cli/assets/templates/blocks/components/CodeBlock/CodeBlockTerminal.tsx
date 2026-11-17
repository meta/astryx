// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {SyntaxTheme} from '@astryxdesign/core/theme';
import {githubDark} from '@astryxdesign/core/theme/syntax';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';

const commands = `$ astryx init --features agents
[ok] AI agent docs: AGENTS.md created (Astryx 0.7.17)
$ pnpm astryx component CodeBlock --dense`;

export default function CodeBlockTerminal() {
  return (
    <SyntaxTheme theme={githubDark}>
      <CodeBlock
        code={commands}
        language="bash"
        hasCopyButton
        style={{width: '100%', maxWidth: 480}}
      />
    </SyntaxTheme>
  );
}
