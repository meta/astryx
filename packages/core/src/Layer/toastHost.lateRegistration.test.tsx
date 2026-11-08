// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file toastHost.lateRegistration.test.tsx
 * @input LayerProvider and its toast context, with ToastViewport imported
 *   only inside a test
 * @output Proves LayerProvider alone renders no viewport, that a toast added
 *   before Toast loads shows once it loads, and that the app stays mounted.
 *   A waiting toast that is removed reports onHide once and never shows. A
 *   waiting namesake follows the uniqueID rules and reports no onHide.
 * @position Unit tests for Layer/toastHost.tsx. Each test reloads the
 *   modules, so Toast's registration is fresh in each one.
 */

import {act, render, screen} from '@testing-library/react';
import {use, useEffect} from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {ToastEntry} from '../Toast/types';

beforeEach(() => {
  vi.resetModules();
});

async function loadLayer() {
  const {LayerProvider} = await import('./LayerProvider');
  const {ToastContext} = await import('./toastHost');
  return {LayerProvider, ToastContext};
}

function entry(
  id: string,
  body: string,
  options: Pick<
    ToastEntry['options'],
    'uniqueID' | 'onHide' | 'collisionBehavior'
  > = {},
): ToastEntry {
  return {id, createdAt: Date.now(), options: {body, ...options}};
}

describe('LayerProvider before Toast is imported', () => {
  it('renders no toast viewport', async () => {
    const {LayerProvider} = await loadLayer();
    const {container} = render(
      <LayerProvider>
        <p>App</p>
      </LayerProvider>,
    );
    expect(container.innerHTML).toBe('<p>App</p>');
    expect(document.querySelector('[popover]')).toBeNull();
  });

  it('shows a toast added before Toast loads once it loads, exactly once, and keeps the app mounted', async () => {
    const {LayerProvider, ToastContext} = await loadLayer();
    function AddsOnMount() {
      const toasts = use(ToastContext);
      useEffect(() => {
        toasts?.addToast(entry('waits', 'Saved before the viewport'));
      }, [toasts]);
      return <p>App</p>;
    }
    const view = render(
      <LayerProvider>
        <AddsOnMount />
      </LayerProvider>,
    );
    const app = view.getByText('App');
    expect(screen.queryByText('Saved before the viewport')).toBeNull();
    await act(async () => {
      await import('../Toast/ToastViewport');
    });
    expect(
      await screen.findByText('Saved before the viewport'),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('[data-toast-id]')).toHaveLength(1);
    expect(view.getByText('App')).toBe(app);
  });

  it('drops a waiting toast that is removed, reports its onHide once, and finds a waiting one by uniqueID', async () => {
    const {LayerProvider, ToastContext} = await loadLayer();
    const onHide = vi.fn();
    let found: ToastEntry | undefined;
    function AddsTwo() {
      const toasts = use(ToastContext);
      useEffect(() => {
        toasts?.addToast(entry('first', 'Removed while waiting', {onHide}));
        toasts?.addToast(
          entry('second', 'Kept while waiting', {uniqueID: 'kept'}),
        );
        toasts?.removeToast('first', 'manual');
        toasts?.removeToast('first', 'manual');
        found = toasts?.findByUniqueID('kept');
      }, [toasts]);
      return null;
    }
    render(
      <LayerProvider>
        <AddsTwo />
      </LayerProvider>,
    );
    expect(found?.id).toBe('second');
    expect(onHide.mock.calls).toEqual([['manual']]);
    await act(async () => {
      await import('../Toast/ToastViewport');
    });
    expect(await screen.findByText('Kept while waiting')).toBeInTheDocument();
    expect(screen.queryByText('Removed while waiting')).toBeNull();
    expect(onHide).toHaveBeenCalledTimes(1);
  });
  it('replaces a waiting toast with a waiting namesake: dismissing the replaced one reports no onHide', async () => {
    const {LayerProvider, ToastContext} = await loadLayer();
    const onHide = vi.fn();
    function AddsNamesakes() {
      const toasts = use(ToastContext);
      useEffect(() => {
        toasts?.addToast(
          entry('first', 'Replaced while waiting', {uniqueID: 'same', onHide}),
        );
        toasts?.addToast(entry('second', 'Its namesake', {uniqueID: 'same'}));
        toasts?.removeToast('first', 'manual');
      }, [toasts]);
      return null;
    }
    render(
      <LayerProvider>
        <AddsNamesakes />
      </LayerProvider>,
    );
    await act(async () => {
      await import('../Toast/ToastViewport');
    });
    expect(await screen.findByText('Its namesake')).toBeInTheDocument();
    expect(screen.queryByText('Replaced while waiting')).toBeNull();
    expect(onHide).not.toHaveBeenCalled();
  });

  it('drops a waiting ignore namesake: dismissing it reports no onHide, and the first one shows', async () => {
    const {LayerProvider, ToastContext} = await loadLayer();
    const onHide = vi.fn();
    function AddsNamesakes() {
      const toasts = use(ToastContext);
      useEffect(() => {
        toasts?.addToast(entry('first', 'Shown first', {uniqueID: 'same'}));
        toasts?.addToast(
          entry('second', 'Ignored namesake', {
            uniqueID: 'same',
            collisionBehavior: 'ignore',
            onHide,
          }),
        );
        toasts?.removeToast('second', 'manual');
      }, [toasts]);
      return null;
    }
    render(
      <LayerProvider>
        <AddsNamesakes />
      </LayerProvider>,
    );
    await act(async () => {
      await import('../Toast/ToastViewport');
    });
    expect(await screen.findByText('Shown first')).toBeInTheDocument();
    expect(screen.queryByText('Ignored namesake')).toBeNull();
    expect(onHide).not.toHaveBeenCalled();
  });
});
