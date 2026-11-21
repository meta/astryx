// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useCallback, use} from 'react';
import type {Root} from 'react-dom/client';
import {dataAttr} from '../naming';
import {ToastContext, type ToastContextValue} from './ToastContext';
import {ToastViewport} from './ToastViewport';
import {createToastQueue, ToastQueueConnector} from '../Layer/toastHost';
import {ThemeNestingContext} from '../theme/Theme';
import {ThemeSourceContext} from '../theme/useTheme';
import {devError, warnOnce} from '../utils/devWarning';
import type {
  ToastOptions,
  ToastDismissFn,
  ShowToastFn,
  ToastEntry,
} from './types';
import {createModuleLoader} from '../utils/moduleLoader';
import {sharedForReact} from '../utils/sharedForReact';
import {sharedSequence} from '../utils/sharedRealm';

// One fallback viewport per React for every copy of Core, so toasts from a
// swizzled copy and from the package show in one stack. It holds a React
// root, so a second React keeps its own.
const fallback = sharedForReact('toast/use-toast/fallback', 1, () => ({
  context: null as ToastContextValue | null,
  root: null as Root | null,
}));

// react-dom/client loads only on the first toast with no LayerProvider. A
// static import would load it for every import of the package, also where a
// toast never shows (a server, a test run).
const clientModule = createModuleLoader(async () => import('react-dom/client'));

const ROOT_THEME_ATTRS = ['data-theme', dataAttr('theme')] as const;

// The fallback container is a separate tree with no ThemeContext. A toast
// shown from inside a Theme draws under that Theme (CallerTheme). For other
// toasts, this copies the theme attributes of <html> to the container, so the
// theme's scoped CSS reaches them. The container lives as long as the app, so
// the observer stays connected, unless the viewport fails to load. Returns
// the function that disconnects it.
function syncRootThemeAttrs(container: HTMLElement): () => void {
  const sync = () => {
    let mirroredMode: string | null = null;
    for (const attr of ROOT_THEME_ATTRS) {
      const value = document.documentElement.getAttribute(attr);
      if (value == null) {
        container.removeAttribute(attr);
      } else {
        container.setAttribute(attr, value);
        if (attr === 'data-theme') {
          mirroredMode = value;
        }
      }
    }
    // Pages whose built theme CSS pins color-scheme unconditionally (#3658)
    // would otherwise resolve light-dark() tokens by OS preference while the
    // mirrored mode above follows the app theme; the inline style wins over
    // that CSS.
    if (mirroredMode === 'light' || mirroredMode === 'dark') {
      container.style.colorScheme = mirroredMode;
    } else {
      container.style.removeProperty('color-scheme');
    }
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [...ROOT_THEME_ATTRS],
  });
  return () => observer.disconnect();
}

function getFallbackContext(): ToastContextValue {
  if (fallback.context) {
    return fallback.context;
  }

  if (typeof document === 'undefined') {
    throw new Error(
      'useToast: Cannot create fallback viewport during SSR. ' +
        'Wrap your app with <LayerProvider>.',
    );
  }

  warnOnce(
    'toast-fallback-viewport',
    'useToast',
    'No LayerProvider found. Using fallback viewport. ' +
      'Wrap your app with <LayerProvider> for full control.',
  );

  const container = document.createElement('div');
  container.setAttribute('data-astryx-toast-fallback', '');
  document.body.appendChild(container);
  const stopThemeSync = syncRootThemeAttrs(container);

  // Toasts wait in the queue until the fallback viewport's context connects.
  const queue = createToastQueue();
  clientModule.load().then(
    ({createRoot}) => {
      fallback.root = createRoot(container);
      // This root sits inside the app, so a <Theme> in toast content is
      // nested: it themes its own subtree and leaves the app's <html> sync
      // alone.
      fallback.root.render(
        <ThemeNestingContext value={true}>
          <ToastViewport>
            <ToastQueueConnector queue={queue} />
          </ToastViewport>
        </ThemeNestingContext>,
      );
    },
    (error: unknown) => {
      // The next toast loads the viewport again, so one failed load does not
      // turn fallback toasts off for the rest of the page.
      if (fallback.context === queue.context) {
        fallback.context = null;
      }
      stopThemeSync();
      container.remove();
      devError(
        'useToast',
        'The fallback toast viewport did not load, so these toasts did not show. The next toast loads it again. Wrap your app with <LayerProvider> to avoid the fallback.',
        error,
      );
    },
  );

  fallback.context = queue.context;
  return queue.context;
}

// One sequence for every copy of Core: toasts from a swizzled copy share the
// package's queue, so their ids must not repeat.
const nextToastId = sharedSequence('toast/use-toast/toast-id', 1);
function generateToastId(): string {
  return `astryx-toast-${nextToastId()}`;
}

/**
 * Hook to show toast notifications.
 *
 * Returns an imperative function that shows a toast and returns a dismiss function.
 * Works with or without a provider — falls back to a self-mounting viewport.
 *
 * @example
 * ```
 * function SaveButton() {
 *   const toast = useToast();
 *   const handleSave = async () => {
 *     try {
 *       await saveData();
 *       toast({ body: 'Saved successfully' });
 *     } catch {
 *       toast({ body: 'Failed to save', type: 'error' });
 *     }
 *   };
 *   return <Button label="Save" onClick={handleSave} />;
 * }
 * ```
 */
export function useToast(): ShowToastFn {
  const contextFromProvider = use(ToastContext);
  // The fallback viewport renders outside this tree, and a host page can
  // rewrite `<html>`. So the toast takes its caller's Theme.
  const callerTheme = use(ThemeSourceContext);

  const showToast = useCallback(
    (options: ToastOptions): ToastDismissFn => {
      const ctx = contextFromProvider ?? getFallbackContext();
      const id = generateToastId();
      const entry: ToastEntry = {
        id,
        options,
        createdAt: Date.now(),
        ...(contextFromProvider == null && callerTheme != null
          ? {callerTheme}
          : null),
      };
      ctx.addToast(entry);
      return () => ctx.removeToast(id, 'manual');
    },
    [contextFromProvider, callerTheme],
  );

  return showToast;
}
