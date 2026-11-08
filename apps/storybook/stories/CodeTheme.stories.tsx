// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import React from 'react';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {
  SyntaxTheme as SyntaxThemeProvider,
  defineSyntaxTheme,
} from '@astryxdesign/core/theme/syntax';
import {defineTheme, Theme} from '@astryxdesign/core/theme';
import {
  oneDarkPro,
  dracula,
  monokai,
  nord,
  tokyoNight,
  catppuccinMocha,
  githubDark,
  githubLight,
  solarizedLight,
  oneLight,
  catppuccinLatte,
  tokyoNightLight,
  allSyntaxPresets,
} from '@astryxdesign/core/theme/syntax';

const sampleCode = [
  "import {useState, useEffect} from 'react';",
  '',
  'interface User {',
  '  id: string;',
  '  name: string;',
  '  roles: string[];',
  '}',
  '',
  'const API_URL = "https://api.example.com";',
  'const MAX_RETRIES = 3;',
  '',
  '// Fetch user data with retry logic',
  'async function fetchUser(id: string): Promise<User> {',
  '  const response = await fetch(`${API_URL}/users/${id}`);',
  '  if (!response.ok) {',
  '    throw new Error(`HTTP ${response.status}`);',
  '  }',
  '  return response.json();',
  '}',
  '',
  'export function UserCard({id}: {id: string}) {',
  '  const [user, setUser] = useState<User | null>(null);',
  '',
  '  useEffect(() => {',
  '    fetchUser(id).then(setUser);',
  '  }, [id]);',
  '',
  '  if (!user) return <div>Loading...</div>;',
  '',
  '  return (',
  '    <div className="card">',
  '      <h2>{user.name}</h2>',
  '      <span>{user.roles.length} roles</span>',
  '    </div>',
  '  );',
  '}',
].join('\n');

const meta: Meta = {
  title: 'Core/Themes/CodeTheme',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Syntax theme provider for code components. Wraps CodeBlock and CodeEditor ' +
          'to apply community syntax color themes. 12 presets ship in @astryxdesign/core/theme/syntax.',
      },
    },
  },
};

export default meta;

// ---------------------------------------------------------------------------
// Individual theme stories
// ---------------------------------------------------------------------------

export const OneDarkPro: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={oneDarkPro}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="UserCard.tsx"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

export const Dracula: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={dracula}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="UserCard.tsx"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

export const Monokai: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={monokai}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="UserCard.tsx"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

export const Nord: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={nord}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="UserCard.tsx"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

export const TokyoNight: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={tokyoNight}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="UserCard.tsx"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

export const CatppuccinMocha: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={catppuccinMocha}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="UserCard.tsx"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

export const GitHubLight: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={githubLight}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="UserCard.tsx"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

export const GitHubDark: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={githubDark}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="UserCard.tsx"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

export const SolarizedLight: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={solarizedLight}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="UserCard.tsx"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

export const OneLight: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={oneLight}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="UserCard.tsx"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

export const CatppuccinLatte: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={catppuccinLatte}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="UserCard.tsx"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

export const TokyoNightLight: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={tokyoNightLight}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="UserCard.tsx"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

// ---------------------------------------------------------------------------
// Gallery — all themes side by side
// ---------------------------------------------------------------------------

const shortCode = [
  'const greet = (name: string) => {',
  '  // Say hello',
  '  return `Hello, ${name}!`;',
  '};',
  '',
  'const result = greet("World");',
  'console.log(result); // Hello, World!',
].join('\n');

export const AllThemesGallery: StoryObj = {
  render: () => (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}}>
      {allSyntaxPresets.map(theme => (
        <SyntaxThemeProvider key={theme.name} theme={theme}>
          <CodeBlock
            code={shortCode}
            language="typescript"
            title={theme.name}
            hasLineNumbers
          />
        </SyntaxThemeProvider>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
  },
};

// ---------------------------------------------------------------------------
// Nested override — provider sets base, inner provider overrides
// ---------------------------------------------------------------------------

export const NestedOverride: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={nord}>
      <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <CodeBlock
          code="// Inherits Nord from provider"
          language="typescript"
          title="nord (from provider)"
        />
        <SyntaxThemeProvider theme={dracula}>
          <CodeBlock
            code="// Inner provider overrides to Dracula"
            language="typescript"
            title="dracula (inner override)"
          />
        </SyntaxThemeProvider>
      </div>
    </SyntaxThemeProvider>
  ),
};

// ---------------------------------------------------------------------------
// Custom syntax theme — defineSyntaxTheme() with your own colors
// ---------------------------------------------------------------------------

const cyberpunk = defineSyntaxTheme({
  name: 'cyberpunk',
  tokens: {
    keyword: '#ff2a6d',
    string: '#05d9e8',
    comment: '#4a5568',
    number: '#d1f7ff',
    function: '#ff6ac1',
    type: '#7efff5',
    variable: '#e2e8f0',
    operator: '#ff9e64',
    constant: '#d1f7ff',
    tag: '#ff2a6d',
    attribute: '#7efff5',
    property: '#05d9e8',
    punctuation: '#718096',
    background: '#0d0221',
  },
});

export const CustomTheme: StoryObj = {
  render: () => (
    <SyntaxThemeProvider theme={cyberpunk}>
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="Custom: Cyberpunk"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  ),
};

// ---------------------------------------------------------------------------
// Theme with syntax defaults — defineTheme({ syntax: ... })
// ---------------------------------------------------------------------------

const darkDevTheme = defineTheme({
  name: 'dark-dev',
  syntax: dracula,
  tokens: {
    '--color-background-surface': '#282a36',
    '--color-text-primary': '#f8f8f2',
  },
});

export const ThemeWithSyntaxDefaults: StoryObj = {
  render: () => (
    <Theme theme={darkDevTheme} mode="dark">
      <CodeBlock
        code={sampleCode}
        language="typescript"
        title="defineTheme with syntax: dracula"
        hasLineNumbers
      />
    </Theme>
  ),
};
