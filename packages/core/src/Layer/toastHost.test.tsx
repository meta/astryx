// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file toastHost.test.tsx
 * @input LayerProvider, its toast outlet, the registered ToastViewport and
 *   useToast
 * @output Proves the outlet renders the registered viewport after the app,
 *   once per React root and only on the client. A toast the app shows as it
 *   mounts still appears. Without a provider, the fallback root's queue drops
 *   a toast dismissed while it waits. The queue stays connected while the
 *   viewport's props change, and under StrictMode's replayed effects. An
 *   empty uniqueID names no toast, before the viewport connects and after.
 * @position Unit tests for Layer/toastHost.tsx. The late registration has its
 *   own file, so this file's static Toast import cannot hide it.
 */

import {act, render, screen} from '@testing-library/react';
import {StrictMode, useEffect, useRef} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import type {ToastDismissFn} from '../Toast/types';
import {useToast} from '../Toast/useToast';
import {LayerProvider} from './LayerProvider';

/** Shows a toast from its first effect. */
function ShowsOnMount({text}: {text: string}) {
  const showToast = useToast();
  useEffect(() => {
    showToast({body: text, isAutoHide: false});
  }, [showToast, text]);
  return <p>{text} app</p>;
}

describe('LayerProvider toast outlet', () => {
  it('renders the viewport after the app, which keeps its own position', () => {
    const {container} = render(
      <LayerProvider>
        <p>App</p>
      </LayerProvider>,
    );
    expect(container.firstElementChild?.textContent).toBe('App');
    expect(container.querySelector('[popover="manual"]')).not.toBeNull();
  });

  it('shows a toast the app adds in its first effect, before the viewport takes toasts, once', async () => {
    render(
      <LayerProvider>
        <ShowsOnMount text="Saved" />
      </LayerProvider>,
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-toast-id]')).toHaveLength(1);
  });

  it('gives each React root its own viewport and toasts', async () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    const firstRoot = createRoot(first);
    const secondRoot = createRoot(second);
    await act(async () => {
      firstRoot.render(
        <LayerProvider>
          <ShowsOnMount text="First" />
        </LayerProvider>,
      );
      secondRoot.render(
        <LayerProvider>
          <ShowsOnMount text="Second" />
        </LayerProvider>,
      );
    });
    expect(first.querySelectorAll('[popover="manual"]')).toHaveLength(1);
    expect(second.querySelectorAll('[popover="manual"]')).toHaveLength(1);
    expect(first.textContent).toContain('First app');
    expect(first.textContent).not.toContain('Second');
    expect(second.textContent).toContain('Second app');
    expect(second.textContent).not.toContain('First');
    await act(async () => {
      firstRoot.unmount();
      secondRoot.unmount();
    });
    first.remove();
    second.remove();
  });

  it('renders no viewport on the server, and mounts it after hydration with no recoverable error', async () => {
    const app = (
      <LayerProvider>
        <p>App</p>
      </LayerProvider>
    );
    const html = renderToString(app);
    expect(html).toBe('<p>App</p>');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | null = null;
    await act(async () => {
      root = hydrateRoot(container, app, {
        onRecoverableError: error => {
          errors.push(error);
        },
      });
    });
    expect(errors).toEqual([]);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.firstElementChild?.textContent).toBe('App');
    expect(container.querySelector('[popover="manual"]')).not.toBeNull();
    await act(async () => {
      root?.unmount();
    });
    container.remove();
  });

  it('keeps the queue connected when the viewport changes: a dismissal in that commit still reports onHide', async () => {
    const onHide = vi.fn();
    function DismissesOnCue({dismissNow}: {dismissNow: boolean}) {
      const showToast = useToast();
      const dismissRef = useRef<ToastDismissFn | null>(null);
      useEffect(() => {
        dismissRef.current = showToast({
          body: 'Shown',
          isAutoHide: false,
          onHide,
        });
      }, [showToast]);
      useEffect(() => {
        if (dismissNow) {
          dismissRef.current?.();
        }
      }, [dismissNow]);
      return null;
    }
    const view = render(
      <LayerProvider toast={{maxVisible: 3}}>
        <DismissesOnCue dismissNow={false} />
      </LayerProvider>,
    );
    expect(await screen.findByText('Shown')).toBeInTheDocument();
    view.rerender(
      <LayerProvider toast={{maxVisible: 4}}>
        <DismissesOnCue dismissNow />
      </LayerProvider>,
    );
    expect(onHide.mock.calls).toEqual([['manual']]);
  });

  it('treats an empty uniqueID as no ID, before the viewport connects and after', async () => {
    function RaisesUnnamed({later}: {later: boolean}) {
      const showToast = useToast();
      useEffect(() => {
        showToast({body: 'Early one', uniqueID: '', isAutoHide: false});
        showToast({body: 'Early two', uniqueID: '', isAutoHide: false});
      }, [showToast]);
      useEffect(() => {
        if (later) {
          showToast({body: 'Late one', uniqueID: '', isAutoHide: false});
          showToast({body: 'Late two', uniqueID: '', isAutoHide: false});
        }
      }, [later, showToast]);
      return null;
    }
    const view = render(
      <LayerProvider toast={{maxVisible: 0}}>
        <RaisesUnnamed later={false} />
      </LayerProvider>,
    );
    expect(await screen.findByText('Early two')).toBeInTheDocument();
    expect(screen.getByText('Early one')).toBeInTheDocument();
    view.rerender(
      <LayerProvider toast={{maxVisible: 0}}>
        <RaisesUnnamed later />
      </LayerProvider>,
    );
    expect(await screen.findByText('Late two')).toBeInTheDocument();
    expect(screen.getByText('Late one')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-toast-id]')).toHaveLength(4);
  });

  it('shows a toast once under StrictMode, whose replayed effects reconnect the queue', async () => {
    const onHide = vi.fn();
    let dismiss: ToastDismissFn | null = null;
    function ShowsOnce() {
      const showToast = useToast();
      useEffect(() => {
        dismiss = showToast({body: 'Strict', isAutoHide: false, onHide});
        return () => dismiss?.();
      }, [showToast]);
      return null;
    }
    const view = render(
      <StrictMode>
        <LayerProvider>
          <ShowsOnce />
        </LayerProvider>
      </StrictMode>,
    );
    expect(await screen.findByText('Strict')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-toast-id]')).toHaveLength(1);
    act(() => {
      dismiss?.();
    });
    expect(onHide).toHaveBeenCalledWith('manual');
    view.unmount();
  });

  // Last in the file: the fallback root it creates lives for the whole file.
  it('without a provider, drops a toast dismissed before the fallback viewport connects, and reports its onHide once', async () => {
    const onHide = vi.fn();
    function DismissesAtOnce() {
      const showToast = useToast();
      useEffect(() => {
        showToast({body: 'Dismissed while waiting', onHide})();
        showToast({body: 'Shown by the fallback', isAutoHide: false});
      }, [showToast]);
      return null;
    }
    render(<DismissesAtOnce />);
    expect(onHide.mock.calls).toEqual([['manual']]);
    expect(
      await screen.findByText('Shown by the fallback'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Dismissed while waiting')).toBeNull();
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});
