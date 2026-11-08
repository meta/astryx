// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readdirSync, readFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const componentDetailDir = join(srcDir, 'components/component-detail');

function readComponentDetailFile(name: string): string {
  return readFileSync(join(componentDetailDir, name), 'utf8');
}

// Every hand-written source file in the docsite. `generated/` is skipped: it is
// machine-written data that embeds core's own docs (which mention the icon API
// in prose), not code the docsite runs.
function sourceFiles(dir: string = srcDir): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'generated' || entry.name === '__tests__'
        ? []
        : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('component detail preview theming', () => {
  it('applies the neutral preview theme around preview containers', () => {
    expect(readComponentDetailFile('ComponentDetailClient.tsx')).toMatch(
      /<ComponentPreviewTheme>\s*<Card variant="muted" padding=\{0\}>/,
    );
    expect(readComponentDetailFile('InteractivePreview.tsx')).toMatch(
      /<ComponentPreviewTheme>\s*<Card[\s>]/,
    );
    expect(readComponentDetailFile('ExampleBlock.tsx')).toMatch(
      /<ComponentPreviewTheme>\s*<Card padding=\{3\}>/,
    );
  });

  it('keeps the theme boundary at the container instead of inside content', () => {
    expect(readComponentDetailFile('ShowcasePreview.tsx')).not.toContain(
      'Theme theme={neutralTheme}',
    );
    expect(readComponentDetailFile('InteractivePreview.tsx')).not.toContain(
      'Theme theme={neutralTheme}',
    );
    expect(readComponentDetailFile('ExampleBlock.tsx')).not.toContain(
      'Theme theme={neutralTheme}',
    );
  });

  it('lets <Theme> carry the preview icons instead of registering them globally', () => {
    // registerIcons() writes to a registry shared by the whole server process,
    // but on the client it only runs in the bundles that import the calling
    // module. Calling it from a route-specific module therefore hands SSR a set
    // of icons the client does not have, and every route that never loads that
    // module fails hydration with React #418. <Theme> already resolves a
    // theme's icons by name, so nothing here needs the global registry.
    const offenders = sourceFiles()
      .filter(file => /\bregisterIcons\s*\(/.test(readFileSync(file, 'utf8')))
      .map(file => relative(srcDir, file));

    expect(offenders).toEqual([]);
  });
});
