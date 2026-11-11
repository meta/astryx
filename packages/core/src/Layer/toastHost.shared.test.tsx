// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file toastHost.shared.test.tsx
 * @input Two loads of the toast host module, as the package and a swizzled
 *   copy of LayerProvider each carry one
 * @output Proves a viewport the package's Toast registers renders in a copied
 *   LayerProvider's outlet, before and after the outlet mounts, and that a
 *   viewport registered on another React does not
 * @position Unit tests for Layer/toastHost.tsx (spec:AST-110 FR3)
 */

import {createRequire} from 'node:module';
import {act, render, screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

/**
 * A second instance of React, as a page that loads two React copies has.
 * Node keeps one instance per resolved file, so drop React's files from the
 * require cache, load it again, then put the first instance back.
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

function Host({children}: {children?: ReactNode}) {
  return <div data-testid="toast-host">{children}</div>;
}

afterEach(async () => {
  const toastHost = await import('./toastHost');
  toastHost.__resetToastHostForTest();
  vi.resetModules();
});

describe('the toast host a swizzled LayerProvider shares', () => {
  it("renders the viewport the package registered in a copy's outlet", async () => {
    const pkg = await import('./toastHost');
    vi.resetModules();
    const copy = await import('./toastHost');
    expect(copy).not.toBe(pkg);
    pkg.registerToastHost(Host);
    render(<copy.ToastHostOutlet>app</copy.ToastHostOutlet>);
    expect(screen.getByTestId('toast-host')).toBeInTheDocument();
  });

  it("keeps a viewport registered on another React out of this React's outlet", async () => {
    const otherReact = secondReact();
    vi.resetModules();
    vi.doMock('react', () => ({...otherReact, default: otherReact}));
    const onOtherReact = await import('./toastHost');
    vi.doUnmock('react');
    onOtherReact.registerToastHost(Host);
    vi.resetModules();
    const onThisReact = await import('./toastHost');
    render(<onThisReact.ToastHostOutlet>app</onThisReact.ToastHostOutlet>);
    expect(screen.queryByTestId('toast-host')).toBeNull();
    onOtherReact.__resetToastHostForTest();
  });

  it("renders a viewport registered after a copy's outlet mounted", async () => {
    const pkg = await import('./toastHost');
    vi.resetModules();
    const copy = await import('./toastHost');
    render(<copy.ToastHostOutlet>app</copy.ToastHostOutlet>);
    expect(screen.queryByTestId('toast-host')).toBeNull();
    act(() => {
      pkg.registerToastHost(Host);
    });
    expect(screen.getByTestId('toast-host')).toBeInTheDocument();
  });
});
