// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A swizzled copy carries its own copy of a module that brands a value, such
 * as the animated-layout handle. The package's values and the copy's must
 * still be one type and one runtime protocol, so a package handle passed to
 * a copied component works.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('brands a swizzled copy shares with the package', () => {
  it('a copy of the animated-layout module reads a package handle', async () => {
    const pkg = await import('../motion/animatedLayout');
    vi.resetModules();
    const copy = await import('../motion/animatedLayout');
    expect(copy).not.toBe(pkg);
    const area = document.createElement('div');
    const handle = pkg.createAnimatedLayout(() => area);
    expect(() => copy.playLayoutFrames(handle, [])()).not.toThrow();
  });

  it('a copy of the snap-paging module accepts a package paging value', async () => {
    const pkg = await import('../SnapPaging/snapPagingValue');
    vi.resetModules();
    const copy = await import('../SnapPaging/snapPagingValue');
    expect(copy).not.toBe(pkg);
    const value = pkg.makeSnapPaging(() => ({
      detach: () => {},
      move: () => {},
      moveHeld: () => false,
    }));
    expect(copy.isSnapPaging(value)).toBe(true);
  });

  it("a copy of List's reorder context reads a package reorderable object", async () => {
    const {createReorderable} =
      await import('../reorderable/createReorderable');
    const pkg = await import('../List/listReorderContext');
    vi.resetModules();
    const copy = await import('../List/listReorderContext');
    expect(copy).not.toBe(pkg);
    // A swizzled List carries its own listReorderContext and reads the
    // object the package's createReorderable made.
    const reorderable = createReorderable({onReorder: () => {}});
    const internals = reorderable as unknown as Record<symbol, unknown>;
    expect(internals[copy.REORDER_ENGINE]).toBeDefined();
    expect(internals[copy.REORDER_ENGINE]).toBe(internals[pkg.REORDER_ENGINE]);
  });

  it('the package List reads an object a copy of the Lab reorder entry adapted', async () => {
    const {createReorderable} =
      await import('../reorderable/createReorderable');
    const pkg = await import('../List/listReorderContext');
    vi.resetModules();
    const copy = await import('../internal/reorder');
    // A swizzled TransferList or ListInput carries Core's internal reorder
    // entry and adapts the owner's object with it, for the package List.
    const reorderable = createReorderable({onReorder: () => {}});
    const adapted = copy.adaptReorderable(reorderable, {onReorder: () => {}});
    expect(
      (adapted as unknown as Record<symbol, unknown>)[pkg.REORDER_ENGINE],
    ).toBe(
      (reorderable as unknown as Record<symbol, unknown>)[pkg.REORDER_ENGINE],
    );
    expect(
      (adapted as unknown as Record<symbol, unknown>)[pkg.REORDER_ENGINE],
    ).toBeDefined();
  });

  it("a copy of Table's virtualization module reads a package capability", async () => {
    const pkg =
      await import('../Table/plugins/virtualization/useTableRowsVirtualization');
    vi.resetModules();
    const copy =
      await import('../Table/plugins/virtualization/useTableRowsVirtualization');
    expect(copy).not.toBe(pkg);
    // A swizzled Table carries its own copy of this module and reads the
    // capability the package's useTableRowsVirtualization made.
    const {result} = renderHook(() =>
      pkg.useTableRowsVirtualization({
        rowHeight: 40,
        initialViewportHeight: 400,
      }),
    );
    expect(copy.getTableVirtualizationConfig(result.current)).toEqual({
      rowHeight: 40,
      initialViewportHeight: 400,
    });
    // The brand member is required, so a plain object is not a capability:
    // only the hook makes one.
    // @ts-expect-error -- `{}` lacks the capability's brand.
    const notACapability: typeof result.current = {};
    expect(copy.getTableVirtualizationConfig(notACapability)).toBeUndefined();
  });

  it('the package and a copy give the branded types one shape', () => {
    // Two paths to Core's source that TypeScript reads as two modules each,
    // as it reads a package module and the copy of it.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-brands-'));
    try {
      fs.symlinkSync(SRC, path.join(dir, 'pkg'), 'junction');
      fs.symlinkSync(SRC, path.join(dir, 'copy'), 'junction');
      const check = path.join(dir, 'check.ts');
      const pairs = [
        ['motion/animatedLayout', 'AnimatedLayout'],
        ['CodeBlock/grammar', 'CodeLanguage'],
        ['SnapPaging/snapPagingValue', 'SnapPaging'],
        ['Markdown/plugins/protocol', 'MarkdownPluginEntry'],
        ['Markdown/plugins/protocol', 'MarkdownTransform'],
        [
          'Table/plugins/virtualization/useTableRowsVirtualization',
          'TableVirtualizationCapability',
        ],
      ];
      fs.writeFileSync(
        check,
        pairs
          .map(
            ([file, name], i) =>
              `import type {${name} as P${i}} from './pkg/${file}';\n` +
              `import type {${name} as C${i}} from './copy/${file}';\n` +
              `export const toCopy${i}: C${i} = null as unknown as P${i};\n` +
              `export const toPackage${i}: P${i} = null as unknown as C${i};\n`,
          )
          .join(''),
      );
      const program = ts.createProgram([check], {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        preserveSymlinks: true,
      });
      const errors = program
        .getSemanticDiagnostics(program.getSourceFile(check))
        .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      expect(errors).toEqual([]);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 120_000);
});
