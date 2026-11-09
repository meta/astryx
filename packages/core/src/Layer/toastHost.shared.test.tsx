// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file toastHost.shared.test.tsx
 * @input Two loads of the toast host module, as the package and a swizzled
 *   copy of LayerProvider each carry one
 * @output Proves a viewport the package's Toast registers renders in a copied
 *   LayerProvider's outlet, before and after the outlet mounts
 * @position Unit tests for Layer/toastHost.tsx (spec:AST-110 FR3)
 */

import {act, render, screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

function Host({children}: {children?: ReactNode}) {
  return <div data-testid="toast-host">{children}</div>;
}

afterEach(async () => {
  const toastHost = await import('./toastHost');
  toastHost.__resetToastHostForTest?.();
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
