// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A swizzled copy loads its own instance of Core's modules beside the
 * package's. These tests load a second instance of a module, as a copy does,
 * and check that the copy and the package still share one context.
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
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

  it("the package's English context resolves a copy's English", async () => {
    const pkg = await freshInstance(
      async () => import('../i18n/InternationalizationContext'),
    );
    const copy = await freshInstance(
      async () => import('../i18n/englishFallback'),
    );
    // A copied component registers the English it names when it loads.
    copy.registerEnglishFallback({'@astryx.test.copyOnly': 'Copied English'});
    function CopiedConsumer() {
      const {translate} = use(pkg.InternationalizationContext);
      return (
        <span data-testid="probe">
          {translate('@astryx.test.copyOnly', undefined)}
        </span>
      );
    }
    render(<CopiedConsumer />);
    expect(screen.getByTestId('probe').textContent).toBe('Copied English');
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

describe('two Reacts in one process', () => {
  /**
   * A second instance of React, as a server that loads two React copies has.
   * Node keeps one instance per resolved file, so drop React's files from
   * the require cache, load it again, then put the first instance back.
   */
  function secondReact(): typeof import('react') {
    const require = createRequire(import.meta.url);
    const isReactFile = (file: string) =>
      /[\\/]node_modules[\\/]react[\\/]/.test(file);
    const saved = Object.keys(require.cache)
      .filter(isReactFile)
      .map(file => [file, require.cache[file]] as const);
    for (const [file] of saved) {
      Reflect.deleteProperty(require.cache, file);
    }
    try {
      return require('react') as typeof import('react');
    } finally {
      for (const [file, module] of saved) {
        require.cache[file] = module;
      }
    }
  }

  /** The shared-context module as it loads on `react`. */
  async function sharedContextOn(react: typeof import('react')) {
    vi.resetModules();
    vi.doMock('react', () => ({...react, default: react}));
    try {
      return await import('../utils/sharedContext');
    } finally {
      vi.doUnmock('react');
    }
  }

  it('gives each React its own context under a key, and one per React', async () => {
    const otherReact = secondReact();
    expect(otherReact.createContext).not.toBe(
      (await import('react')).createContext,
    );
    const onThisReact = await freshInstance(
      async () => import('../utils/sharedContext'),
    );
    const copyOnThisReact = await freshInstance(
      async () => import('../utils/sharedContext'),
    );
    const onOtherReact = await sharedContextOn(otherReact);
    const name = 'TwoReactsProbe';
    const context = onThisReact.createSharedContext(name, 1, 'default');
    // Two copies of Core on one React share the context.
    expect(copyOnThisReact.createSharedContext(name, 1, 'default')).toBe(
      context,
    );
    // A copy on another React gets its own, so a request it renders never
    // reads a value a request on this React provided.
    const other = onOtherReact.createSharedContext(name, 1, 'default');
    expect(other).not.toBe(context);
    expect(onOtherReact.createSharedContext(name, 1, 'default')).toBe(other);
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
      const text = fs
        .readFileSync(file, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const calls =
        text.match(/\bcreate(?:Shared|LayerScoped)Context\b/g) ?? [];
      const keyed = [
        ...text.matchAll(
          /\bcreate(?:Shared|LayerScoped)Context\b(?:<[\s\S]*?>)?\(\s*'([^']+)',\s*\d+\s*,/g,
        ),
      ];
      // Every call names its key and version; imports name the factory too.
      const imports = (
        text.match(
          /import[^;]*\bcreate(?:Shared|LayerScoped)Context\b[^;]*;/g,
        ) ?? []
      ).length;
      expect(keyed.length, path.relative(SRC, file)).toBe(
        calls.length - imports,
      );
      for (const m of keyed) {
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

describe('shared state in server-safe modules', () => {
  const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  /** Every module a file reaches through relative imports, itself included. */
  function reachedFrom(entry: string): string[] {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.shift() as string;
      if (seen.has(file)) {
        continue;
      }
      seen.add(file);
      const text = fs.readFileSync(file, 'utf-8');
      for (const m of text.matchAll(
        /^import[^'"]*['"](\.{1,2}\/[^'"]+)['"]/gm,
      )) {
        if (/^import\s+type\b/.test(m[0])) {
          continue;
        }
        const base = path.resolve(path.dirname(file), m[1]);
        const target = ['.ts', '.tsx', '/index.ts']
          .map(ext => base + ext)
          .find(f => fs.existsSync(f));
        if (target) {
          queue.push(target);
        }
      }
    }
    return [...seen];
  }

  it('the English fallback reaches no client module, so it still loads on the server', () => {
    const client = reachedFrom(path.join(SRC, 'i18n/englishFallback.ts'))
      .filter(file =>
        /^(?:\/\/[^\n]*\n|\s)*['"]use client['"]/.test(
          fs.readFileSync(file, 'utf-8'),
        ),
      )
      .map(file => path.relative(SRC, file));
    expect(client).toEqual([]);
  });
});
