// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {CodeEditor} from '@astryxdesign/lab';
import {
  SyntaxTheme as SyntaxThemeProvider,
  defineSyntaxTheme,
} from '@astryxdesign/core/theme/syntax';
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

function ThemedEditor({
  theme,
  _title,
  initialCode = sampleCode,
}: {
  theme: Parameters<typeof SyntaxThemeProvider>[0]['theme'];
  _title?: string;
  initialCode?: string;
}) {
  const [value, setValue] = useState(initialCode);
  return (
    <SyntaxThemeProvider theme={theme}>
      <CodeEditor
        label="Code editor"
        value={value}
        onChange={setValue}
        language="typescript"
        hasLineNumbers
      />
    </SyntaxThemeProvider>
  );
}

const meta: Meta = {
  title: 'Lab/Themes/CodeEditorTheme',
  parameters: {
    docs: {
      description: {
        component:
          'Syntax theme showcase for CodeEditor. All themes from SyntaxTheme ' +
          'work identically on both CodeBlock and CodeEditor.',
      },
    },
  },
};

export default meta;

// ---------------------------------------------------------------------------
// Individual theme stories
// ---------------------------------------------------------------------------

export const OneDarkPro: StoryObj = {
  render: () => <ThemedEditor theme={oneDarkPro} />,
};

export const Dracula: StoryObj = {
  render: () => <ThemedEditor theme={dracula} />,
};

export const Monokai: StoryObj = {
  render: () => <ThemedEditor theme={monokai} />,
};

export const Nord: StoryObj = {
  render: () => <ThemedEditor theme={nord} />,
};

export const TokyoNight: StoryObj = {
  render: () => <ThemedEditor theme={tokyoNight} />,
};

export const CatppuccinMocha: StoryObj = {
  render: () => <ThemedEditor theme={catppuccinMocha} />,
};

export const GitHubLight: StoryObj = {
  render: () => <ThemedEditor theme={githubLight} />,
};

export const GitHubDark: StoryObj = {
  render: () => <ThemedEditor theme={githubDark} />,
};

export const SolarizedLight: StoryObj = {
  render: () => <ThemedEditor theme={solarizedLight} />,
};

export const OneLight: StoryObj = {
  render: () => <ThemedEditor theme={oneLight} />,
};

export const CatppuccinLatte: StoryObj = {
  render: () => <ThemedEditor theme={catppuccinLatte} />,
};

export const TokyoNightLight: StoryObj = {
  render: () => <ThemedEditor theme={tokyoNightLight} />,
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

function GalleryEditor({
  theme,
}: {
  theme: Parameters<typeof SyntaxThemeProvider>[0]['theme'];
}) {
  const [value, setValue] = useState(shortCode);
  return (
    <SyntaxThemeProvider theme={theme}>
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            marginBottom: 4,
            fontFamily: 'monospace',
          }}>
          {theme.name}
        </div>
        <CodeEditor
          value={value}
          onChange={setValue}
          language="typescript"
          label="Code editor"
          hasLineNumbers
        />
      </div>
    </SyntaxThemeProvider>
  );
}

export const AllThemesGallery: StoryObj = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        padding: 16,
      }}>
      {allSyntaxPresets.map(theme => (
        <GalleryEditor key={theme.name} theme={theme} />
      ))}
    </div>
  ),
  parameters: {layout: 'fullscreen'},
};

// ---------------------------------------------------------------------------
// Custom syntax theme
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
  render: () => <ThemedEditor theme={cyberpunk} />,
};
