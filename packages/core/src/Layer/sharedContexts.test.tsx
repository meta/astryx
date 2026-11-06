// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A swizzled copy loads its own instance of Core's modules beside the
 * package's. These tests load a second instance of a module, as a copy does,
 * and check that the copy and the package still share one context.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {render, screen} from '@testing-library/react';
import {use} from 'react';
import {describe, expect, it, vi} from 'vitest';

/** A new instance of a module, as a swizzled copy of it loads. */
async function freshInstance<T>(load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return load();
}

describe('contexts shared by a swizzled copy and the package', () => {
  it('two instances of a context module give one context', async () => {
    const pkg = await freshInstance(
      async () => import('../InputGroup/InputGroupInternalContext'),
    );
    const copy = await freshInstance(
      async () => import('../InputGroup/InputGroupInternalContext'),
    );
    // Two module instances, as a copy and the package are.
    expect(copy).not.toBe(pkg);
    expect(copy.InputGroupInternalContext).toBe(pkg.InputGroupInternalContext);
  });

  it('a provider from the package reaches a consumer from a copy', async () => {
    const pkg = await freshInstance(async () => import('../Layer/toastHost'));
    const copy = await freshInstance(async () => import('../Layer/toastHost'));
    const value = {} as NonNullable<React.ContextType<typeof pkg.ToastContext>>;
    function CopiedConsumer() {
      return (
        <span data-testid="probe">
          {String(use(copy.ToastContext) === value)}
        </span>
      );
    }
    render(
      <pkg.ToastContext value={value}>
        <CopiedConsumer />
      </pkg.ToastContext>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('true');
  });

  it("the package's layer boundary resets a copy's layer-scoped context", async () => {
    const pkg = await freshInstance(async () => import('./layerScopedContext'));
    const copy = await freshInstance(
      async () => import('../InputGroup/InputGroupInternalContext'),
    );
    function CopiedConsumer() {
      const {isDisabled} = use(copy.InputGroupInternalContext);
      return <span data-testid="probe">{String(isDisabled)}</span>;
    }
    render(
      <copy.InputGroupInternalContext value={{isDisabled: true}}>
        <pkg.LayerContentBoundary>
          <CopiedConsumer />
        </pkg.LayerContentBoundary>
      </copy.InputGroupInternalContext>,
    );
    // Group state stops at the layer boundary, as it does with the package alone.
    expect(screen.getByTestId('probe').textContent).toBe('false');
  });
});

describe('every Core context is registered under a versioned key', () => {
  const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sources = fs
    .readdirSync(SRC, {recursive: true, withFileTypes: true})
    .filter(
      entry =>
        entry.isFile() &&
        /\.tsx?$/.test(entry.name) &&
        !/\.(test|spec|stories|d)\.tsx?$/.test(entry.name) &&
        !entry.parentPath.includes('__tests__'),
    )
    .map(entry => path.join(entry.parentPath, entry.name));
  const FACTORIES = new Set([
    path.join(SRC, 'utils/sharedContext.ts'),
    path.join(SRC, 'Layer/layerScopedContext.tsx'),
  ]);

  it('no module creates a context of its own', () => {
    const direct = sources
      .filter(file => !FACTORIES.has(file))
      .filter(file =>
        /\bcreateContext\s*[<(]/.test(fs.readFileSync(file, 'utf-8')),
      )
      .map(file => path.relative(SRC, file));
    expect(direct).toEqual([]);
  });

  it('each key names one context', () => {
    const owners = new Map<string, string[]>();
    for (const file of sources) {
      if (FACTORIES.has(file)) {
        continue;
      }
      const text = fs.readFileSync(file, 'utf-8');
      for (const m of text.matchAll(
        /\bcreate(?:Shared|LayerScoped)Context\b[^(]*\(\s*'([^']+)',\s*\d+\s*,/g,
      )) {
        owners.set(m[1], [
          ...(owners.get(m[1]) ?? []),
          path.relative(SRC, file),
        ]);
      }
    }
    expect(owners.size).toBeGreaterThan(0);
    const shared = [...owners].filter(([, files]) => files.length > 1);
    expect(shared).toEqual([]);
  });
});
