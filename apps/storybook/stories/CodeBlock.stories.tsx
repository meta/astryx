// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {IconButton} from '@astryxdesign/core/IconButton';

const meta: Meta<typeof CodeBlock> = {
  title: 'Core/CodeBlock',
  component: CodeBlock,
  tags: ['autodocs'],
  argTypes: {
    language: {
      control: 'select',
      options: [
        'typescript',
        'javascript',
        'json',
        'html',
        'css',
        'python',
        'bash',
        'php',
        'hack',
        'yaml',
        'markdown',
        'plaintext',
      ],
      description: 'Language for syntax highlighting',
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'Text size',
    },
    width: {
      control: 'text',
      description: 'Width of the code block (any CSS width value)',
    },
    container: {
      control: 'select',
      options: ['card', 'section'],
      description: 'Container presentation style',
    },
    hasLineNumbers: {control: 'boolean'},
    hasCopyButton: {control: 'boolean'},
    isWrapped: {control: 'boolean'},
    isCollapsible: {control: 'boolean'},
    collapsibleThreshold: {control: 'number'},
  },
};

export default meta;
type Story = StoryObj<typeof CodeBlock>;

const tsExample = `import {useState, useEffect} from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

async function fetchUser(id: string): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  if (!response.ok) {
    throw new Error(\`HTTP \${response.status}\`);
  }
  return response.json();
}

export function useUser(id: string) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetchUser(id).then(setUser);
  }, [id]);

  return user;
}`;

export const Default: Story = {
  args: {
    code: tsExample,
    language: 'typescript',
    title: 'useUser.ts',
    hasLineNumbers: true,
    hasCopyButton: true,
  },
};

export const WithHighlightedLines: Story = {
  args: {
    code: tsExample,
    language: 'typescript',
    title: 'useUser.ts',
    hasLineNumbers: true,
    highlightLines: [9, 10, 11, 12, 13],
  },
};

/**
 * The diff layer over a language: `+` lines sit on a success-tinted row and
 * `-` lines on an error-tinted row, the `@@` header is a quiet row, and the
 * rest of every line keeps the language's syntax highlighting. The glyph has
 * its own column, so the code's indentation lines up on every row, and copy
 * returns the exact source with its glyphs. Markdown gets this from a
 * ```diff-tsx fence.
 */
export const Diff: Story = {
  args: {
    language: 'tsx',
    isDiff: true,
    title: 'Button.tsx',
    hasLineNumbers: true,
    code: `@@ -12,7 +12,7 @@ export function Button({children, ...props}: ButtonProps) {
   return (
     <button
-      className="astryx-button"
+      className="astryx-button astryx-button-primary"
       type="button"
       {...props}>
       {children}`,
  },
};

/**
 * A diff whose changed lines run past the viewport: the row tint and the
 * gutter tint must follow the line to the end of the scroll width, not stop at
 * the visible edge. Toggle `isWrapped` to see the same rows wrapped instead.
 */
export const DiffLongLines: Story = {
  args: {
    language: 'tsx',
    isDiff: true,
    hasLineNumbers: true,
    isWrapped: false,
    code: `@@ -1,3 +1,3 @@
 export function Button({children, ...props}: ButtonProps) {
-  return <button className="astryx-button" type="button" aria-label="A deliberately long accessible label that pushes this changed line well past the width of a phone-sized viewport" {...props}>{children}</button>;
+  return <button className="astryx-button astryx-button-primary" type="button" aria-label="A deliberately long accessible label that pushes this changed line well past the width of a phone-sized viewport" {...props}>{children}</button>;
 }`,
  },
};

/**
 * The code viewport is a keyboard stop only while its content overflows.
 * This story starts fitting; the browser contract widens the code and caps
 * the height to prove each state, and shrinks it again to prove focus stays.
 */
export const OverflowStop: Story = {
  args: {
    language: 'tsx',
    code: 'const fits = true;',
  },
};

// No title and no language label, so there is no header and Copy floats in
// the corner. The first line is longer than the block, so it must end before
// the button rather than run under it.
export const CopyClearance: Story = {
  args: {
    code: 'pnpm --filter @astryxdesign/core exec vitest run src/CodeBlock --reporter=verbose --coverage\nexit 0',
    width: '360px',
  },
};

// A product action beside Copy, as a ghost sm IconButton like Copy. With a
// header it sits in the header; with no title and the label hidden it sits
// in the corner column beside the code.
const terminalIcon = (
  <svg
    viewBox="0 0 24 24"
    width={16}
    height={16}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true">
    <path d="m7 11 2-2-2-2" />
    <path d="M11 13h4" />
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);
const runAction = (
  <IconButton
    variant="ghost"
    size="sm"
    label="Run in terminal"
    tooltip="Run in terminal"
    icon={terminalIcon}
  />
);

export const EndContent: Story = {
  args: {
    code: 'npm install @astryxdesign/core',
    language: 'bash',
    endContent: runAction,
    width: '360px',
  },
};

export const EndContentHeaderless: Story = {
  args: {
    code: 'pnpm --filter @astryxdesign/core exec vitest run src/CodeBlock --reporter=verbose --coverage\nexit 0',
    language: 'bash',
    hasLanguageLabel: false,
    endContent: runAction,
    width: '360px',
  },
};

// A taller caller control (the default IconButton size) still sits centred on
// the first line of a headerless one-line block.
export const EndContentTall: Story = {
  args: {
    code: 'npm install @astryxdesign/core',
    language: 'bash',
    hasLanguageLabel: false,
    endContent: (
      <IconButton label="Run in terminal" variant="ghost" icon={terminalIcon} />
    ),
    width: '360px',
  },
};

export const JSON: Story = {
  args: {
    code: `{
  "name": "@astryxdesign/core",
  "version": "0.0.5",
  "dependencies": {
    "@stylexjs/stylex": "^0.17.5",
    "react": "^19.0.0"
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest"
  }
}`,
    language: 'json',
    title: 'package.json',
    hasLineNumbers: true,
  },
};

export const Python: Story = {
  args: {
    code: `#!/usr/bin/env python3
"""Data processing pipeline."""

from dataclasses import dataclass
from typing import List, Optional

@dataclass
class Config:
    input_path: str
    output_path: str
    batch_size: int = 100

def process(config: Config) -> None:
    """Process data according to config."""
    print(f"Processing {config.input_path}")
    # TODO: implement pipeline
    pass

if __name__ == "__main__":
    cfg = Config("input.csv", "output.csv")
    process(cfg)`,
    language: 'python',
    title: 'pipeline.py',
    hasLineNumbers: true,
    highlightLines: [7, 8, 9, 10, 11],
  },
};

export const HTML: Story = {
  args: {
    code: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Hello World</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main id="app">
      <h1>Hello, World!</h1>
      <p class="subtitle">Welcome to Astryx.</p>
    </main>
    <script src="app.js"></script>
  </body>
</html>`,
    language: 'html',
    title: 'index.html',
    hasLineNumbers: true,
  },
};

export const CSS: Story = {
  args: {
    code: `:root {
  --color-primary: #0064E0;
  --radius: 8px;
}

.button {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: var(--radius);
  background-color: var(--color-primary);
  color: white;
  font-weight: 600;
  transition: opacity 0.15s ease;
}

.button:hover {
  opacity: 0.9;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: #2694FE;
  }
}`,
    language: 'css',
    title: 'button.css',
    hasLineNumbers: true,
  },
};

export const Bash: Story = {
  args: {
    code: `#!/bin/bash
# Deploy script for production

set -euo pipefail

DEPLOY_DIR="/opt/app"
VERSION=$(git describe --tags --always)

echo "Deploying version $VERSION..."

if [ ! -d "$DEPLOY_DIR" ]; then
  mkdir -p "$DEPLOY_DIR"
fi

pnpm build
cp -r dist/* "$DEPLOY_DIR/"

echo "Deploy complete: $VERSION"`,
    language: 'bash',
    title: 'deploy.sh',
    hasLineNumbers: true,
  },
};

export const SingleLine: Story = {
  args: {
    code: 'npm install @astryxdesign/core',
    language: 'bash',
    hasCopyButton: true,
  },
};

export const Wrapped: Story = {
  args: {
    code: `// This is a very long line that demonstrates the word wrapping behavior of the code block component when isWrapped is set to true, which causes long lines to wrap instead of scrolling horizontally
const result = someVeryLongFunctionName(parameterOne, parameterTwo, parameterThree, parameterFour, parameterFive);`,
    language: 'typescript',
    isWrapped: true,
    hasLineNumbers: true,
  },
};

export const WithMaxHeight: Story = {
  args: {
    code: Array.from(
      {length: 50},
      (_, i) => `const line${i + 1} = ${i + 1};`,
    ).join('\n'),
    language: 'typescript',
    title: 'many-lines.ts',
    hasLineNumbers: true,
    maxHeight: 200,
  },
};

export const SmallSize: Story = {
  args: {
    code: tsExample,
    language: 'typescript',
    title: 'useUser.ts',
    hasLineNumbers: true,
    size: 'sm',
  },
};

export const NoHeader: Story = {
  args: {
    code: `const greeting = "Hello, world!";
console.log(greeting);`,
    language: 'typescript',
    hasLanguageLabel: false,
    hasCopyButton: true,
  },
};

export const Plaintext: Story = {
  args: {
    code: `This is plain text without any syntax highlighting.
It preserves whitespace and line breaks.

  Indentation is maintained.
    Nested indentation too.`,
    language: 'plaintext',
    title: 'notes.txt',
    hasLineNumbers: true,
  },
};

export const FullWidth: Story = {
  args: {
    code: tsExample,
    language: 'typescript',
    title: 'useUser.ts',
    width: '100%',
  },
};

export const ContainerSection: Story = {
  args: {
    code: tsExample,
    language: 'typescript',
    title: 'useUser.ts',
    width: '100%',
    container: 'section',
  },
};

export const Collapsible: Story = {
  args: {
    code: tsExample,
    language: 'typescript',
    title: 'useUser.ts',
    hasLineNumbers: true,
    isCollapsible: true,
  },
};
