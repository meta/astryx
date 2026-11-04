// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {rewriteImports, swizzle} from './swizzle.mjs';

// api/swizzle/ -> up 3 = packages/cli, up 4 = repo root (has packages/core).
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('rewriteImports', () => {
  it('preserves the theme token subpath (StyleX module is a dedicated export)', () => {
    const input = `import { tokens } from '../theme/tokens.stylex';`;
    const result = rewriteImports(input);
    expect(result).toBe(
      `import { tokens } from '@astryxdesign/core/theme/tokens.stylex';`,
    );
  });

  it('rewrites ../utils/mergeProps to @astryxdesign/core/utils', () => {
    const input = `import { mergeProps } from '../utils/mergeProps';`;
    const result = rewriteImports(input);
    expect(result).toBe(`import { mergeProps } from '@astryxdesign/core/utils';`);
  });

  it('leaves same-level relative imports untouched', () => {
    const input = `import { helper } from './helper';`;
    const result = rewriteImports(input);
    expect(result).toBe(`import { helper } from './helper';`);
  });

  it('rewrites export from statements', () => {
    const input = `export { foo } from '../hooks/useLayout';`;
    const result = rewriteImports(input);
    expect(result).toBe(`export { foo } from '@astryxdesign/core/hooks';`);
  });

  it('handles double quotes', () => {
    const input = `import { tokens } from "../theme/tokens.stylex";`;
    const result = rewriteImports(input);
    expect(result).toBe(
      `import { tokens } from "@astryxdesign/core/theme/tokens.stylex";`,
    );
  });

  it('handles multiple imports in one file', () => {
    const input = [
      `import { tokens } from '../theme/tokens.stylex';`,
      `import { mergeProps } from '../utils/mergeProps';`,
      `import { helper } from './helper';`,
    ].join('\n');

    const result = rewriteImports(input);
    expect(result).toBe(
      [
        `import { tokens } from '@astryxdesign/core/theme/tokens.stylex';`,
        `import { mergeProps } from '@astryxdesign/core/utils';`,
        `import { helper } from './helper';`,
      ].join('\n'),
    );
  });

  it('rewrites a dynamic import() of a sibling component', () => {
    const input = `const T = lazy(() => import('../Tooltip/Tooltip'));`;
    expect(rewriteImports(input)).toBe(
      `const T = lazy(() => import('@astryxdesign/core/Tooltip'));`,
    );
  });

  it('rewrites a two-levels-up asset import to a valid subpath (never /..)', () => {
    const input = `import en from '../../locales/en.json' with {type: 'json'};`;
    const out = rewriteImports(input);
    expect(out).not.toContain('@astryxdesign/core/..');
    expect(out).toBe(
      `import en from '@astryxdesign/core/locales/en.json' with {type: 'json'};`,
    );
  });

  it('rewrites ANY non-theme .stylex import to a deep path (not the barrel)', () => {
    // Every .stylex module needs the deep path so the StyleX compiler can
    // resolve styles at compile time. The barrel re-export loses identity.
    const input = `import { interactionOverlayStyles } from '../utils/interactionOverlay.stylex';`;
    expect(rewriteImports(input)).toBe(
      `import { interactionOverlayStyles } from '@astryxdesign/core/utils/interactionOverlay.stylex';`,
    );
  });

  it('rewrites a Layout .stylex import to a deep path', () => {
    const input = `import { container } from '../Layout/container.stylex';`;
    expect(rewriteImports(input)).toBe(
      `import { container } from '@astryxdesign/core/Layout/container.stylex';`,
    );
  });

  it('rewrites a two-levels-up .stylex import to a deep path', () => {
    const input = `import { focusOutlineProps } from '../../utils/focusOutline.stylex';`;
    expect(rewriteImports(input)).toBe(
      `import { focusOutlineProps } from '@astryxdesign/core/utils/focusOutline.stylex';`,
    );
  });
});

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

describe('swizzle rewriteImports compiles for components with .stylex imports', () => {
  it('Button: every rewritten import resolves in the core exports map', async () => {
    const corePkg = JSON.parse(
      fs.readFileSync(
        path.join(REPO, 'packages/core/package.json'),
        'utf-8',
      ),
    );
    const exportKeys = new Set(Object.keys(corePkg.exports));

    const buttonDir = path.join(REPO, 'packages/core/src/Button');
    const files = fs.readdirSync(buttonDir).filter(
      f => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.') && !f.includes('.doc.'),
    );

    for (const file of files) {
      const content = fs.readFileSync(path.join(buttonDir, file), 'utf-8');
      const rewritten = rewriteImports(content);

      // Extract all rewritten @astryxdesign/core/* imports
      const importRe = /from ['"](@astryxdesign\/core\/[^'"]+)['"]/g;
      let m;
      while ((m = importRe.exec(rewritten)) !== null) {
        const specifier = m[1];
        const subpath = './' + specifier.replace('@astryxdesign/core/', '');

        expect(
          exportKeys.has(subpath),
          `${specifier} (subpath ${subpath}) must resolve in core exports`,
        ).toBe(true);
      }
    }
  });
});
