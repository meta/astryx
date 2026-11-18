// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {requireNatively} from '../../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('../../../api/template/template.mjs')} */
const {
  findShowcase,
  findRelatedBlocks,
} = require('../../../api/template/template.mjs');

// These tests verify that findShowcase and findRelatedBlocks can discover
// blocks from external packages that declare xds.blocks in package.json.

let tmpDir;

function createFixture() {
  // Symlink real core package (needed for findCoreDir)
  const realCoreDir = path.resolve(import.meta.dirname, '..', '..', '..', '..', 'core');
  const coreDir = path.join(tmpDir, 'packages', 'core');
  fs.mkdirSync(path.dirname(coreDir), {recursive: true});
  fs.symlinkSync(realCoreDir, coreDir);

  // External package with blocks
  const extDir = path.join(tmpDir, 'node_modules', '@test', 'ext');
  const blocksDir = path.join(extDir, 'blocks', 'components');

  // Employee showcase
  const employeeDir = path.join(blocksDir, 'Employee');
  fs.mkdirSync(employeeDir, {recursive: true});
  fs.writeFileSync(path.join(employeeDir, 'EmployeeShowcase.doc.mjs'), `
export const doc = {
  type: 'block',
  name: 'Employee — Profile Card',
  description: 'Employee profile card with hover preview.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Employee'],
};
`);
  fs.writeFileSync(path.join(employeeDir, 'EmployeeShowcase.tsx'),
    "'use client';\nexport default function EmployeeShowcase() { return <div>Employee</div>; }");

  // Diff showcase + example
  const diffDir = path.join(blocksDir, 'Diff');
  fs.mkdirSync(diffDir, {recursive: true});
  fs.writeFileSync(path.join(diffDir, 'DiffShowcase.doc.mjs'), `
export const doc = {
  type: 'block',
  name: 'Diff — Link with Hover Card',
  description: 'Diff link with automatic hover card preview.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Diff'],
};
`);
  fs.writeFileSync(path.join(diffDir, 'DiffShowcase.tsx'),
    "'use client';\nexport default function DiffShowcase() { return <div>Diff</div>; }");
  fs.writeFileSync(path.join(diffDir, 'DiffStatusBadges.doc.mjs'), `
export const doc = {
  type: 'block',
  name: 'Diff — Status Badges',
  description: 'Shows diff status badge variants.',
  isReady: true,
  aspectRatio: 1,
  componentsUsed: ['Diff', 'Badge'],
};
`);
  fs.writeFileSync(path.join(diffDir, 'DiffStatusBadges.tsx'),
    "'use client';\nexport default function DiffStatusBadges() { return <div>Diff</div>; }");

  fs.writeFileSync(path.join(extDir, 'package.json'), JSON.stringify({
    name: '@test/ext',
    astryx: {docs: './src', category: 'Common', blocks: './blocks/components'},
  }));

  // Need src dir for docs (even if empty) since discoverExternalPackages checks it
  fs.mkdirSync(path.join(extDir, 'src'), {recursive: true});
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-showcase-test-'));
  createFixture();
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('findShowcase() with external packages', () => {
  it('finds showcase from external package by directory name', async () => {
    const result = await findShowcase('Employee', tmpDir);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Employee — Profile Card');
    expect(result.filePath).toContain('EmployeeShowcase.tsx');
  });

  it('finds showcase from external package by componentsUsed', async () => {
    const result = await findShowcase('Diff', tmpDir);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Diff — Link with Hover Card');
  });

  it('returns null for component with no showcase', async () => {
    const result = await findShowcase('NonExistent', tmpDir);
    expect(result).toBeNull();
  });
});

describe('findRelatedBlocks() with external packages', () => {
  it('finds related blocks from external package', async () => {
    const result = await findRelatedBlocks('Diff', tmpDir);
    expect(result).toHaveLength(2);
    const names = result.map(b => b.dirName).sort();
    expect(names).toEqual(['DiffShowcase', 'DiffStatusBadges']);
  });

  it('finds cross-package component references', async () => {
    const result = await findRelatedBlocks('Badge', tmpDir);
    expect(result.some(b => b.dirName === 'DiffStatusBadges')).toBe(true);
  });
});
