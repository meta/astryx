// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  discoverComponents,
  discoverExternalComponentsGrouped,
  findExternalComponentDoc,
  findComponentReadme,
  findComponentSource,
  levenshteinDistance,
  findClosestComponents,
} from './component.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-component-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('discoverComponents', () => {
  it('reads group from .doc.mjs and groups components', () => {
    const srcDir = path.join(tmpDir, 'src');

    // Button with group: 'Buttons'
    const buttonDir = path.join(srcDir, 'Button');
    fs.mkdirSync(buttonDir, {recursive: true});
    fs.writeFileSync(path.join(buttonDir, 'XDSButton.tsx'), '');
    fs.writeFileSync(
      path.join(buttonDir, 'Button.doc.mjs'),
      "export const docs = {\n  name: 'Button',\n  group: 'Buttons',\n};",
    );

    // IconButton with group: 'Buttons'
    const iconBtnDir = path.join(srcDir, 'IconButton');
    fs.mkdirSync(iconBtnDir, {recursive: true});
    fs.writeFileSync(path.join(iconBtnDir, 'XDSIconButton.tsx'), '');
    fs.writeFileSync(
      path.join(iconBtnDir, 'IconButton.doc.mjs'),
      "export const docs = {\n  name: 'IconButton',\n  group: 'Buttons',\n};",
    );

    // Avatar with no group
    const avatarDir = path.join(srcDir, 'Avatar');
    fs.mkdirSync(avatarDir, {recursive: true});
    fs.writeFileSync(path.join(avatarDir, 'XDSAvatar.tsx'), '');
    fs.writeFileSync(
      path.join(avatarDir, 'Avatar.doc.mjs'),
      "export const docs = {name: 'Avatar'};",
    );

    const result = discoverComponents(tmpDir);

    expect(result).toEqual({
      Avatar: ['Avatar'],
      Buttons: ['Button', 'IconButton'],
    });
  });

  it('sorts groups and ungrouped components alphabetically', () => {
    const srcDir = path.join(tmpDir, 'src');

    // Zebra (ungrouped)
    const zebraDir = path.join(srcDir, 'Zebra');
    fs.mkdirSync(zebraDir, {recursive: true});
    fs.writeFileSync(path.join(zebraDir, 'XDSZebra.tsx'), '');
    fs.writeFileSync(
      path.join(zebraDir, 'Zebra.doc.mjs'),
      "export const docs = {name: 'Zebra'};",
    );

    // Alpha (ungrouped)
    const alphaDir = path.join(srcDir, 'Alpha');
    fs.mkdirSync(alphaDir, {recursive: true});
    fs.writeFileSync(path.join(alphaDir, 'XDSAlpha.tsx'), '');
    fs.writeFileSync(
      path.join(alphaDir, 'Alpha.doc.mjs'),
      "export const docs = {name: 'Alpha'};",
    );

    // Middle in group 'Inputs'
    const middleDir = path.join(srcDir, 'Middle');
    fs.mkdirSync(middleDir, {recursive: true});
    fs.writeFileSync(path.join(middleDir, 'XDSMiddle.tsx'), '');
    fs.writeFileSync(
      path.join(middleDir, 'Middle.doc.mjs'),
      "export const docs = {\n  name: 'Middle',\n  group: 'Inputs',\n};",
    );

    const result = discoverComponents(tmpDir);
    const keys = Object.keys(result);

    expect(keys).toEqual(['Alpha', 'Inputs', 'Zebra']);
  });

  it('skips test files', () => {
    const srcDir = path.join(tmpDir, 'src');
    const buttonDir = path.join(srcDir, 'Button');
    fs.mkdirSync(buttonDir, {recursive: true});
    fs.writeFileSync(path.join(buttonDir, 'XDSButton.tsx'), '');
    fs.writeFileSync(path.join(buttonDir, 'XDSButton.test.tsx'), '');
    fs.writeFileSync(
      path.join(buttonDir, 'Button.doc.mjs'),
      "export const docs = {name: 'Button'};",
    );

    const result = discoverComponents(tmpDir);
    expect(result).toEqual({Button: ['Button']});
  });

  it('skips components without a .doc.mjs file', () => {
    const srcDir = path.join(tmpDir, 'src');
    const customDir = path.join(srcDir, 'CustomWidget');
    fs.mkdirSync(customDir, {recursive: true});
    fs.writeFileSync(path.join(customDir, 'XDSCustomWidget.tsx'), '');

    const result = discoverComponents(tmpDir);
    expect(result).toEqual({});
  });

  it('skips hooks/utils directories', () => {
    const srcDir = path.join(tmpDir, 'src');
    const hooksDir = path.join(srcDir, 'hooks');
    fs.mkdirSync(hooksDir, {recursive: true});
    fs.writeFileSync(path.join(hooksDir, 'XDSHook.tsx'), '');

    const utilsDir = path.join(srcDir, 'utils');
    fs.mkdirSync(utilsDir, {recursive: true});
    fs.writeFileSync(path.join(utilsDir, 'XDSUtil.tsx'), '');

    const result = discoverComponents(tmpDir);
    expect(result).toEqual({});
  });

  // XDS-prefix migration (P2380608025, P4): source files are renamed from
  // `XDS{Name}.tsx` to the bare `{Name}.tsx`. Discovery must find both.
  it('discovers components from bare {Name}.tsx files (post-rename)', () => {
    const srcDir = path.join(tmpDir, 'src');
    const buttonDir = path.join(srcDir, 'Button');
    fs.mkdirSync(buttonDir, {recursive: true});
    // Bare component file (no XDS prefix) + its doc
    fs.writeFileSync(path.join(buttonDir, 'Button.tsx'), '');
    fs.writeFileSync(
      path.join(buttonDir, 'Button.doc.mjs'),
      "export const docs = {name: 'Button'};",
    );

    const result = discoverComponents(tmpDir);
    expect(result).toEqual({Button: ['Button']});
  });

  it('discovers a mix of prefixed and bare component files', () => {
    const srcDir = path.join(tmpDir, 'src');

    const buttonDir = path.join(srcDir, 'Button');
    fs.mkdirSync(buttonDir, {recursive: true});
    fs.writeFileSync(path.join(buttonDir, 'Button.tsx'), ''); // bare
    fs.writeFileSync(
      path.join(buttonDir, 'Button.doc.mjs'),
      "export const docs = {name: 'Button'};",
    );

    const cardDir = path.join(srcDir, 'Card');
    fs.mkdirSync(cardDir, {recursive: true});
    fs.writeFileSync(path.join(cardDir, 'XDSCard.tsx'), ''); // prefixed
    fs.writeFileSync(
      path.join(cardDir, 'Card.doc.mjs'),
      "export const docs = {name: 'Card'};",
    );

    const result = discoverComponents(tmpDir);
    expect(result).toEqual({Button: ['Button'], Card: ['Card']});
  });

  it('does not surface bare PascalCase helper files without a doc', () => {
    const srcDir = path.join(tmpDir, 'src');
    const overlayDir = path.join(srcDir, 'Overlay');
    fs.mkdirSync(overlayDir, {recursive: true});
    // Real component (documented) + an internal PascalCase helper (no doc).
    fs.writeFileSync(path.join(overlayDir, 'Overlay.tsx'), '');
    fs.writeFileSync(path.join(overlayDir, 'OverlayScrim.tsx'), '');
    fs.writeFileSync(
      path.join(overlayDir, 'Overlay.doc.mjs'),
      "export const docs = {name: 'Overlay'};",
    );

    const result = discoverComponents(tmpDir);
    // OverlayScrim has no doc, so it must NOT be surfaced as a component.
    expect(result).toEqual({Overlay: ['Overlay']});
  });

  it('finds the source file for both prefixed and bare names', () => {
    const srcDir = path.join(tmpDir, 'src');

    const buttonDir = path.join(srcDir, 'Button');
    fs.mkdirSync(buttonDir, {recursive: true});
    fs.writeFileSync(path.join(buttonDir, 'Button.tsx'), '// bare');
    fs.writeFileSync(
      path.join(buttonDir, 'Button.doc.mjs'),
      "export const docs = {name: 'Button'};",
    );

    const cardDir = path.join(srcDir, 'Card');
    fs.mkdirSync(cardDir, {recursive: true});
    fs.writeFileSync(path.join(cardDir, 'XDSCard.tsx'), '// prefixed');

    expect(findComponentSource(tmpDir, 'Button')).toBe(
      path.join(buttonDir, 'Button.tsx'),
    );
    expect(findComponentSource(tmpDir, 'Card')).toBe(
      path.join(cardDir, 'XDSCard.tsx'),
    );
  });
});

describe('findComponentReadme', () => {
  it('finds direct .doc.mjs: src/{name}/{Name}.doc.mjs', () => {
    const srcDir = path.join(tmpDir, 'src');
    const compDir = path.join(srcDir, 'Button');
    fs.mkdirSync(compDir, {recursive: true});
    fs.writeFileSync(
      path.join(compDir, 'Button.doc.mjs'),
      'export const docs = {}',
    );

    const result = findComponentReadme(tmpDir, 'Button');
    expect(result).toBe(path.join(compDir, 'Button.doc.mjs'));
  });

  it('finds nested .doc.mjs: src/*/{name}/{Name}.doc.mjs', () => {
    const srcDir = path.join(tmpDir, 'src');
    const nestedDir = path.join(srcDir, 'Layout', 'Container');
    fs.mkdirSync(nestedDir, {recursive: true});
    fs.writeFileSync(
      path.join(nestedDir, 'Container.doc.mjs'),
      'export const docs = {}',
    );

    const result = findComponentReadme(tmpDir, 'Container');
    expect(result).toBe(path.join(nestedDir, 'Container.doc.mjs'));
  });

  it('finds parent .doc.mjs for sub-components', () => {
    const srcDir = path.join(tmpDir, 'src');
    const stackDir = path.join(srcDir, 'Stack');
    fs.mkdirSync(stackDir, {recursive: true});
    fs.writeFileSync(path.join(stackDir, 'XDSStackItem.tsx'), '');
    fs.writeFileSync(
      path.join(stackDir, 'Stack.doc.mjs'),
      'export const docs = {}',
    );

    const result = findComponentReadme(tmpDir, 'StackItem');
    expect(result).toBe(path.join(stackDir, 'Stack.doc.mjs'));
  });

  it('ignores README.md files', () => {
    const srcDir = path.join(tmpDir, 'src');
    const compDir = path.join(srcDir, 'Button');
    fs.mkdirSync(compDir, {recursive: true});
    fs.writeFileSync(path.join(compDir, 'README.md'), '# Button');

    const result = findComponentReadme(tmpDir, 'Button');
    expect(result).toBeNull();
  });

  it('returns null when no doc found', () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, {recursive: true});
    expect(findComponentReadme(tmpDir, 'NonExistent')).toBeNull();
  });
});

describe('findComponentSource', () => {
  it('finds direct source: src/{name}/XDS{name}.tsx', () => {
    const srcDir = path.join(tmpDir, 'src');
    const compDir = path.join(srcDir, 'Button');
    fs.mkdirSync(compDir, {recursive: true});
    fs.writeFileSync(path.join(compDir, 'XDSButton.tsx'), '');

    const result = findComponentSource(tmpDir, 'Button');
    expect(result).toBe(path.join(compDir, 'XDSButton.tsx'));
  });

  it('finds nested source: src/{name}/XDS{name}/XDS{name}.tsx', () => {
    const srcDir = path.join(tmpDir, 'src');
    const nestedDir = path.join(srcDir, 'Layout', 'XDSLayout');
    fs.mkdirSync(nestedDir, {recursive: true});
    fs.writeFileSync(path.join(nestedDir, 'XDSLayout.tsx'), '');

    const result = findComponentSource(tmpDir, 'Layout');
    expect(result).toBe(path.join(nestedDir, 'XDSLayout.tsx'));
  });

  it('finds deep fallback: src/*/*/XDS{name}.tsx', () => {
    const srcDir = path.join(tmpDir, 'src');
    const deepDir = path.join(srcDir, 'Layout', 'Container');
    fs.mkdirSync(deepDir, {recursive: true});
    fs.writeFileSync(path.join(deepDir, 'XDSCard.tsx'), '');

    const result = findComponentSource(tmpDir, 'Card');
    expect(result).toBe(path.join(deepDir, 'XDSCard.tsx'));
  });

  it('returns null when source not found', () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, {recursive: true});
    expect(findComponentSource(tmpDir, 'NonExistent')).toBeNull();
  });
});

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('button', 'button')).toBe(0);
  });

  it('returns correct distance for single edit', () => {
    expect(levenshteinDistance('button', 'buton')).toBe(1);
  });

  it('returns correct distance for multiple edits', () => {
    expect(levenshteinDistance('button', 'butan')).toBe(2);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('handles completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });
});

describe('findClosestComponents', () => {
  const components = {
    Action: ['Button', 'CloseButton', 'Link'],
    Form: ['TextInput', 'CheckboxInput', 'Switch'],
    Display: ['Avatar', 'Badge', 'Text'],
  };

  it('finds exact match (distance 0)', () => {
    const matches = findClosestComponents('Button', components);
    expect(matches[0]).toEqual({name: 'Button', distance: 0});
  });

  it('finds close match for misspelling', () => {
    const matches = findClosestComponents('buton', components);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].name).toBe('Button');
    expect(matches[0].distance).toBe(1);
  });

  it('is case-insensitive', () => {
    const matches = findClosestComponents('BUTTON', components);
    expect(matches[0]).toEqual({name: 'Button', distance: 0});
  });

  it('returns empty array for no close matches', () => {
    const matches = findClosestComponents('zzzzzzzzz', components);
    expect(matches).toEqual([]);
  });

  it('returns multiple matches when ambiguous', () => {
    // "Buttn" is close to both "Button" (distance 1) and could be near others
    const matches = findClosestComponents('Butten', components);
    // Should match at least Button
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].name).toBe('Button');
    // With maxDistance=3, "Badge" (distance 5) won't match,
    // but let's verify multiple matches with a wider net
    const wideMatches = findClosestComponents('Butten', components, 5);
    expect(wideMatches.length).toBeGreaterThan(1);
  });

  it('respects maxDistance parameter', () => {
    const matches = findClosestComponents('buton', components, 0);
    expect(matches).toEqual([]);
  });
});

describe('discoverExternalComponentsGrouped', () => {
  it('reads group: from doc files and groups components', () => {
    const docsDir = path.join(tmpDir, 'src');

    // AppShell with group
    const shellDir = path.join(docsDir, 'AppShell');
    fs.mkdirSync(shellDir, {recursive: true});
    fs.writeFileSync(
      path.join(shellDir, 'AppShell.doc.mjs'),
      "export const docs = {\n  name: 'AppShell',\n  group: 'App Chrome',\n};",
    );

    // SideNav with same group
    const navDir = path.join(docsDir, 'SideNav');
    fs.mkdirSync(navDir, {recursive: true});
    fs.writeFileSync(
      path.join(navDir, 'SideNav.doc.mjs'),
      "export const docs = {\n  name: 'SideNav',\n  group: 'App Chrome',\n};",
    );

    // Diff with no group
    const diffDir = path.join(docsDir, 'Diff');
    fs.mkdirSync(diffDir, {recursive: true});
    fs.writeFileSync(
      path.join(diffDir, 'Diff.doc.mjs'),
      "export const docs = {\n  name: 'Diff',\n};",
    );

    const result = discoverExternalComponentsGrouped(docsDir);
    expect(result).toEqual({
      'App Chrome': ['AppShell', 'SideNav'],
      Diff: ['Diff'],
    });
  });

  it('returns empty object for nonexistent directory', () => {
    const result = discoverExternalComponentsGrouped(path.join(tmpDir, 'nope'));
    expect(result).toEqual({});
  });

  it('skips hidden components', () => {
    const docsDir = path.join(tmpDir, 'src');
    const compDir = path.join(docsDir, 'Internal');
    fs.mkdirSync(compDir, {recursive: true});
    fs.writeFileSync(
      path.join(compDir, 'Internal.doc.mjs'),
      "export const docs = {\n  name: 'Internal',\n  hidden: true,\n};",
    );

    fs.writeFileSync(
      path.join(docsDir, 'Visible.doc.mjs'),
      "export const docs = {\n  name: 'Visible',\n};",
    );

    const result = discoverExternalComponentsGrouped(docsDir);
    expect(result).toEqual({Visible: ['Visible']});
  });

  it('sorts groups and ungrouped alphabetically', () => {
    const docsDir = path.join(tmpDir, 'src');

    const zDir = path.join(docsDir, 'Zebra');
    fs.mkdirSync(zDir, {recursive: true});
    fs.writeFileSync(
      path.join(zDir, 'Zebra.doc.mjs'),
      "export const docs = {\n  name: 'Zebra',\n  group: 'Animals',\n};",
    );

    const aDir = path.join(docsDir, 'Alpha');
    fs.mkdirSync(aDir, {recursive: true});
    fs.writeFileSync(
      path.join(aDir, 'Alpha.doc.mjs'),
      "export const docs = {\n  name: 'Alpha',\n};",
    );

    const bDir = path.join(docsDir, 'Bear');
    fs.mkdirSync(bDir, {recursive: true});
    fs.writeFileSync(
      path.join(bDir, 'Bear.doc.mjs'),
      "export const docs = {\n  name: 'Bear',\n  group: 'Animals',\n};",
    );

    const result = discoverExternalComponentsGrouped(docsDir);
    const keys = Object.keys(result);
    expect(keys).toEqual(['Alpha', 'Animals']);
    expect(result['Animals']).toEqual(['Bear', 'Zebra']);
  });
});

describe('findExternalComponentDoc', () => {
  it('finds a doc file by component name', () => {
    const docsDir = path.join(tmpDir, 'src');
    const compDir = path.join(docsDir, 'Employee');
    fs.mkdirSync(compDir, {recursive: true});
    const docPath = path.join(compDir, 'EmployeeHoverCard.doc.mjs');
    fs.writeFileSync(docPath, '');

    const result = findExternalComponentDoc(docsDir, 'EmployeeHoverCard');
    expect(result).toBe(docPath);
  });

  it('searches nested directories', () => {
    const docsDir = path.join(tmpDir, 'src');
    const deepDir = path.join(docsDir, 'nested', 'deep');
    fs.mkdirSync(deepDir, {recursive: true});
    const docPath = path.join(deepDir, 'DeepThing.doc.mjs');
    fs.writeFileSync(docPath, '');

    const result = findExternalComponentDoc(docsDir, 'DeepThing');
    expect(result).toBe(docPath);
  });

  it('returns null when component not found', () => {
    const docsDir = path.join(tmpDir, 'src');
    fs.mkdirSync(docsDir, {recursive: true});

    const result = findExternalComponentDoc(docsDir, 'NonExistent');
    expect(result).toBeNull();
  });

  it('returns null for nonexistent directory', () => {
    const result = findExternalComponentDoc(path.join(tmpDir, 'nope'), 'Foo');
    expect(result).toBeNull();
  });

  it('skips node_modules and __tests__', () => {
    const docsDir = path.join(tmpDir, 'src');
    const nmDir = path.join(docsDir, 'node_modules', 'dep');
    fs.mkdirSync(nmDir, {recursive: true});
    fs.writeFileSync(path.join(nmDir, 'Hidden.doc.mjs'), '');

    const result = findExternalComponentDoc(docsDir, 'Hidden');
    expect(result).toBeNull();
  });
});

describe('searchComponents', () => {
  it('finds Collapsible when searching "accordion"', async () => {
    const {searchComponents, discoverComponents} =
      await import('./component.mjs');
    const components = discoverComponents('packages/core');
    const results = await searchComponents(
      'accordion',
      'packages/core',
      components,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('Collapsible');
    expect(results[0].score).toBe(90);
  });

  it('finds Dialog when searching "modal"', async () => {
    const {searchComponents, discoverComponents} =
      await import('./component.mjs');
    const components = discoverComponents('packages/core');
    const results = await searchComponents(
      'modal',
      'packages/core',
      components,
    );
    const dialog = results.find(r => r.name === 'Dialog');
    expect(dialog).toBeDefined();
    expect(dialog.score).toBe(90);
  });

  it('returns multiple matches for ambiguous terms like "select"', async () => {
    const {searchComponents, discoverComponents} =
      await import('./component.mjs');
    const components = discoverComponents('packages/core');
    const results = await searchComponents(
      'select',
      'packages/core',
      components,
    );
    const top90 = results.filter(r => r.score === 90);
    expect(top90.length).toBeGreaterThan(1);
    const names = top90.map(r => r.name);
    expect(names).toContain('Selector');
  });

  it('finds exact name matches with score 100', async () => {
    const {searchComponents, discoverComponents} =
      await import('./component.mjs');
    const components = discoverComponents('packages/core');
    const results = await searchComponents(
      'Button',
      'packages/core',
      components,
    );
    expect(results[0].name).toBe('Button');
    expect(results[0].score).toBe(100);
  });

  it('returns empty array for complete gibberish', async () => {
    const {searchComponents, discoverComponents} =
      await import('./component.mjs');
    const components = discoverComponents('packages/core');
    const results = await searchComponents(
      'zzzzzzzzzzz',
      'packages/core',
      components,
    );
    expect(results.length).toBe(0);
  });
});

describe('component <Name> text output', () => {
  // The text is a projection of the JSON envelope: it may show less, never
  // data the envelope does not carry.
  it('shows no related-block records that the JSON lacks', async () => {
    const json = await runCli(['--json', 'component', 'Button'], REPO_ROOT);
    expect(json.code).toBe(0);
    expect(JSON.stringify(JSON.parse(json.stdout).data)).not.toContain('dirName');

    const text = await runCli(['component', 'Button'], REPO_ROOT);
    expect(text.code).toBe(0);
    expect(text.stdout).toContain('# Button');
    expect(text.stdout).not.toMatch(/^dirName:/m);
    expect(text.stdout).not.toContain('Related block templates');
  }, 30_000);
});
