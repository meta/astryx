// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {swizzle} from './swizzle.mjs';

// api/swizzle/ -> up 3 = packages/cli, up 4 = repo root (has packages/core).
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('swizzle() API', () => {
  it('no component → swizzle.list of core components', async () => {
    const r = await swizzle(undefined, {cwd: REPO});
    expect(r.type).toBe('swizzle.list');
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data).toContain('Button');
  });

  it('--list → swizzle.list even with a component arg', async () => {
    const r = await swizzle('Button', {cwd: REPO, list: true});
    expect(r.type).toBe('swizzle.list');
  });

  it('unknown component → AstryxError ERR_UNKNOWN_COMPONENT with suggestions', async () => {
    await expect(swizzle('NotARealComponent99', {cwd: REPO})).rejects.toMatchObject({
      code: 'ERR_UNKNOWN_COMPONENT',
    });
  });
});

describe('swizzle imports resolve for components with .stylex imports', () => {
  const OUT = 'tmp-swizzle-resolve-test';
  afterEach(() => {
    fs.rmSync(path.join(REPO, OUT), {recursive: true, force: true});
  });

  it('Button: every import in the copy resolves, in the core exports map or to a copied file', async () => {
    const corePkg = JSON.parse(
      fs.readFileSync(
        path.join(REPO, 'packages/core/package.json'),
        'utf-8',
      ),
    );
    const exportKeys = new Set(Object.keys(corePkg.exports));

    const r = await swizzle('Button', {cwd: REPO, output: './' + OUT});
    const outputDir = path.join(REPO, r.data.outputDir);
    const copied = r.data.files
      .filter(f => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'))
      .map(f => path.join(outputDir, f));

    for (const file of copied) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const m of content.matchAll(/from ['"]([^'"]+)['"]/g)) {
        const specifier = m[1];
        if (specifier.startsWith('@astryxdesign/core/')) {
          const subpath = './' + specifier.replace('@astryxdesign/core/', '');
          expect(
            exportKeys.has(subpath),
            `${specifier} (subpath ${subpath}) must resolve in core exports`,
          ).toBe(true);
        } else if (specifier.startsWith('.')) {
          // A relative import names a file the copy wrote: one of the
          // component's own, or an owner module carried beside it (FR4).
          const target = path.resolve(path.dirname(file), specifier);
          expect(
            ['', '.ts', '.tsx', '.mjs', '.js'].some(ext => fs.existsSync(target + ext)),
            `${specifier} in ${path.relative(outputDir, file)} must name a copied file`,
          ).toBe(true);
        }
      }
    }
  }, 30_000);
});
