// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const themeEditorDirectory = join(
  testDirectory,
  '../app/playground/themeEditor',
);
const editorSource = readFileSync(
  join(themeEditorDirectory, 'ThemeEditor.tsx'),
  'utf8',
);
const baseStylesSource = readFileSync(
  join(themeEditorDirectory, 'BaseStylesPanel.tsx'),
  'utf8',
);
const helperSource = readFileSync(
  join(themeEditorDirectory, 'helpers.ts'),
  'utf8',
);

describe('theme editor color authoring', () => {
  it('does not expose or invoke accent-based palette expansion', () => {
    expect(baseStylesSource).not.toContain('Create from accent');
    expect(editorSource).not.toContain('expandColorScale');
    expect(editorSource).not.toContain('getExpandedColorScale');
    expect(helperSource).not.toContain('expandColorScale');
    expect(helperSource).not.toContain('getExpandedColorScale');
  });

  it('keeps direct editing for the visible semantic color foundations', () => {
    for (const token of [
      '--color-accent',
      '--color-neutral',
      '--color-background-card',
      '--color-background-surface',
      '--color-background-body',
      '--color-background-muted',
      '--color-text-primary',
    ]) {
      expect(baseStylesSource).toContain(`'${token}'`);
    }
  });
});
