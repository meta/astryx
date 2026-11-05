// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {component} from '../../../api/component/component.mjs';
import {findShowcase, findRelatedBlocks} from '../../../api/template/template.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

const CWD = {cwd: '.'};

// These cases resolve components by walking the source tree and importing
// every `.doc.mjs`, which takes several seconds and gets slower under the
// full-suite parallel load — enough to cross the default 5s per-test limit.
// Give the filesystem scans the same generous budget the spawned-CLI cases use.
const SCAN_TIMEOUT = 30_000;

// ─── Bug: sub-component doc resolution ──────────────────────────
// When asking for a sub-component (Code, HStack, Heading, SideNavItem),
// the API should scope the response to that specific sub-component,
// not return the entire parent doc.

describe('component() sub-component scoping', () => {
  it('component("Code") returns Code, not CodeBlock', async () => {
    const result = await component('Code', CWD);
    // Should be scoped to the Code sub-component
    expect(result.data.name).not.toBe('CodeBlock');
    // The response should contain Code's props, not CodeBlock's
    const props = result.data.props || result.data.components?.flatMap(c => c.props || []);
    const propNames = props?.map(p => p.name) || [];
    // Code has 'children', CodeBlock has 'code' + 'language'
    expect(propNames).toContain('children');
    expect(propNames).not.toContain('language');
  });

  it('component("HStack") returns HStack, not Stack', async () => {
    const result = await component('HStack', CWD);
    expect(result.data.name).not.toBe('Stack');
  });

  it('component("Heading") returns Heading, not Text', async () => {
    const result = await component('Heading', CWD);
    expect(result.data.name).not.toBe('Text');
  });

  it('component("SideNavItem") returns SideNavItem, not SideNav', async () => {
    const result = await component('SideNavItem', CWD);
    expect(result.data.name).not.toBe('SideNav');
  });

  it('component("GridSpan") returns GridSpan, not Grid', async () => {
    const result = await component('GridSpan', CWD);
    expect(result.data.name).not.toBe('Grid');
  });

  it('component("Tab") returns Tab, not TabList', async () => {
    const result = await component('Tab', CWD);
    expect(result.data.name).not.toBe('TabList');
  });

  // Non-regression: asking for the parent still returns the full doc, with its
  // family listed as name-only cross-links (sub-component content now lives in
  // each sub-component's own .doc.mjs file).
  it('component("CodeBlock") still returns full CodeBlock doc', async () => {
    const result = await component('CodeBlock', CWD);
    expect(result.data.name).toBe('CodeBlock');
    expect(result.data.components.length).toBeGreaterThanOrEqual(1);
    expect(result.data.components.every(c => typeof c.name === 'string')).toBe(true);
  });

  it('component("Stack") still returns full Stack doc', async () => {
    const result = await component('Stack', CWD);
    expect(result.data.name).toBe('Stack');
  });

  it('component("SideNav") still returns full SideNav doc', async () => {
    const result = await component('SideNav', CWD);
    expect(result.data.name).toBe('SideNav');
  });

  // `parentDoc` is part of the component.detail schema: the text view
  // projects it under the same key.
  it('component("HStack") names its parent doc in JSON and text', async () => {
    const result = await component('HStack', CWD);
    expect(result.data.parentDoc).toBe('Stack');

    const text = await runCli(['component', 'HStack'], process.cwd());
    expect(text.code).toBe(0);
    expect(text.stdout).toMatch(/^parentDoc: +Stack$/m);
  });

  it('component("Stack") carries no parentDoc in JSON or text', async () => {
    const result = await component('Stack', CWD);
    expect(result.data).not.toHaveProperty('parentDoc');

    const text = await runCli(['component', 'Stack'], process.cwd());
    expect(text.code).toBe(0);
    expect(text.stdout).not.toMatch(/^parentDoc:/m);
  });
}, SCAN_TIMEOUT);

// ─── Bug: findShowcase priority ─────────────────────────────────
// findShowcase should prioritize exact directory matches over
// componentsUsed matches from sibling directories.

describe('findShowcase() priority', () => {
  it('Badge resolves to Badge dir, not a sibling that uses Badge', async () => {
    const result = await findShowcase('Badge');
    expect(result).not.toBeNull();
    expect(result.filePath).toMatch(/[/\\]Badge[/\\]/);
  });

  it('Avatar resolves to Avatar dir, not AvatarStatusDot', async () => {
    const result = await findShowcase('Avatar');
    expect(result).not.toBeNull();
    expect(result.filePath).toMatch(/[/\\]Avatar[/\\]/);
    expect(result.filePath).not.toMatch(/AvatarStatusDot/);
  });

  it('ClickableCard resolves via componentsUsed in Card/', async () => {
    const result = await findShowcase('ClickableCard');
    expect(result).not.toBeNull();
    expect(result.name).toBe('ClickableCard');
    expect(result.filePath).toMatch(/[/\\]Card[/\\]/);
  });

  it('SelectableCard resolves via componentsUsed in Card/', async () => {
    const result = await findShowcase('SelectableCard');
    expect(result).not.toBeNull();
    expect(result.name).toBe('SelectableCard');
  });

  it('Stack resolves to Stack dir despite componentsUsed elsewhere', async () => {
    const result = await findShowcase('Stack');
    expect(result).not.toBeNull();
    expect(result.filePath).toMatch(/[/\\]Stack[/\\]/);
  });

  it('returns null for nonexistent component', async () => {
    const result = await findShowcase('NonExistentWidget');
    expect(result).toBeNull();
  });
}, SCAN_TIMEOUT);

// ─── Feature: component() → blocks (showcase, examples, related) ─
// The blocks API returns three separate lists so consumers can use
// the showcase hero, component-specific examples, and broader related
// blocks independently.

describe('component() blocks integration', () => {
  it('returns showcase, examples, and related as separate lists', async () => {
    const result = await component('Card', {...CWD, blocks: true});
    expect(result.type).toBe('component.detail.blocks');
    expect(result.data.component).toBe('Card');
    expect(result.data).toHaveProperty('showcase');
    expect(Array.isArray(result.data.examples)).toBe(true);
    expect(Array.isArray(result.data.related)).toBe(true);
  });

  it('showcase is the hero block for the component', async () => {
    const result = await component('Card', {...CWD, blocks: true});
    expect(result.data.showcase).not.toBeNull();
    expect(result.data.showcase.isShowcase).toBe(true);
    expect(result.data.showcase).toHaveProperty('name');
    expect(result.data.showcase).toHaveProperty('description');
  });

  it('examples are component-specific blocks excluding the showcase', async () => {
    const result = await component('Button', {...CWD, blocks: true});
    expect(result.data.showcase).not.toBeNull();
    expect(result.data.examples.length).toBeGreaterThan(0);
    // Showcase should not appear in examples
    const exampleNames = result.data.examples.map(b => b.name);
    expect(exampleNames).not.toContain(result.data.showcase.name);
    // Examples should be about Button, not random blocks that use Button
    for (const ex of result.data.examples) {
      expect(ex.category).toMatch(/Button/);
    }
  });

  it('related blocks use the component but are not primarily about it', async () => {
    const result = await component('Button', {...CWD, blocks: true});
    // Button is used in many blocks (dialogs, toolbars, etc.)
    expect(result.data.related.length).toBeGreaterThan(0);
    // Related should not overlap with examples or showcase
    const exampleNames = new Set(result.data.examples.map(b => b.name));
    for (const r of result.data.related) {
      expect(exampleNames.has(r.name)).toBe(false);
      expect(r.name).not.toBe(result.data.showcase?.name);
    }
  });

  it('sub-component blocks resolve via componentsUsed', async () => {
    const result = await component('ClickableCard', {...CWD, blocks: true});
    expect(result.data.component).toBe('ClickableCard');
    expect(result.data.showcase).not.toBeNull();
    expect(result.data.showcase.name).toMatch(/ClickableCard/);
  });

  it('component with showcase returns showcase data', async () => {
    const result = await component('Theme', {...CWD, blocks: true});
    expect(result.data.showcase).not.toBeNull();
    expect(result.data.showcase.name).toBe('ThemeShowcase');
    expect(result.data.showcase.isShowcase).toBe(true);
  });
}, SCAN_TIMEOUT);
