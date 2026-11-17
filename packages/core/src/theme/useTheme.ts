// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTheme.ts
 * @input ThemeContext provided by Theme
 * @output Exports useTheme, useThemeName, and internal theme-object access
 * @position Theme hook; used by data viz, canvas, and non-CSS consumers
 *
 * Provides synchronous access to theme token values resolved for the
 * current color mode, with no double render. The returned `mode` is always
 * 'light' | 'dark'. 'system', and any value outside the union, resolves the
 * way a system Theme's CSS does: to the one scheme the page root names (a
 * host that draws the page dark), else the OS preference; under a Theme that
 * forces light or dark, to the OS preference.
 * Without a reachable ThemeContext it consults `<html data-theme>` and
 * `<html data-astryx-theme>` (kept in sync by Theme) via shared, refcounted
 * MutationObservers before assuming OS preference/default tokens. A consumer
 * that reads a forced mode subscribes to no-op stores and creates no observer.
 * A consumer that resolves `system` under no forced Theme shares one more
 * observer, of the page root's scheme. Each observer runs only while a
 * consumer listens. Token resolution is shared with the server-safe helpers
 * in ./tokens.ts.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/theme/index.ts
 */

import {use, useCallback, useMemo, useSyncExternalStore} from 'react';
import type {ThemeMode} from './types';
import type {DefinedTheme} from './defineTheme';
import {resolveThemeTokens} from './tokens';
import {getRegisteredTheme} from './themeRegistry';
import {dataAttr} from '../naming';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {createSharedContext} from '../utils/sharedContext';
import {sharedState} from '../utils/sharedRealm';

// =============================================================================
// Context
// =============================================================================

/**
 * Internal context value — carries the theme + mode from Theme.
 * @internal
 */
export interface ThemeContextValue {
  /** The defined theme object */
  theme: DefinedTheme;
  /** The color mode prop passed to Theme */
  mode: ThemeMode;
}

/**
 * React context for the nearest Theme provider.
 * null when no provider is present.
 * @internal
 */
export const ThemeContext = createSharedContext<ThemeContextValue | null>(
  'ThemeContext',
  1,
  null,
);
ThemeContext.displayName = 'ThemeContext';

/**
 * What a `system` mode follows here: the page root's scheme, or the OS
 * preference below a Theme that forces light or dark. Theme provides it.
 * @internal Not exported from the theme barrel.
 */
export const SystemSchemeContext = createSharedContext<'root' | 'preference'>(
  'SystemSchemeContext',
  1,
  'root',
);
SystemSchemeContext.displayName = 'SystemSchemeContext';

// =============================================================================
// Return type
// =============================================================================

/**
 * Resolved theme data returned by useTheme.
 */
export interface UseThemeReturn {
  /** Theme name */
  name: string;
  /** Resolved effective mode ('light' | 'dark') — never 'system' */
  mode: 'light' | 'dark';
  /**
   * Resolve a token to its raw CSS value for the current color mode.
   *
   * For tokens with [light, dark] tuples, returns the value matching
   * the current mode. For single-value tokens, returns the value as-is.
   *
   * Falls back to tokenDefaults if the token isn't overridden by the theme.
   *
   * @example
   * ```
   * const accent = token('--color-accent'); // "#0064E0" in light mode
   * const spacing = token('--spacing-4');   // "1rem"
   * ```
   */
  token: (name: string) => string;
  /**
   * All tokens resolved for the current color mode.
   *
   * Merges tokenDefaults with the theme's overrides, resolving
   * light-dark() values based on the effective color mode.
   *
   * Memoized — stable reference unless theme or mode changes.
   */
  tokens: Record<string, string>;
}

// =============================================================================
// Hook
// =============================================================================

function getRootModeAttrSnapshot(): 'light' | 'dark' | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' || attr === 'dark' ? attr : null;
}

function getRootModeAttrServerSnapshot(): 'light' | 'dark' | null {
  return null;
}

function getRootNameAttrSnapshot(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return document.documentElement.getAttribute(dataAttr('theme'));
}

function getRootNameAttrServerSnapshot(): string | null {
  return null;
}

function getNullThemeSnapshot(): null {
  return null;
}

// Every no-context consumer wants the same <html data-theme> attribute, so
// one MutationObserver — refcounted via this listener set — serves all of
// them instead of one per consumer.
const rootModeAttrListeners = new Set<() => void>();
let rootModeAttrObserver: MutationObserver | null = null;

const rootNameAttrListeners = new Set<() => void>();
let rootNameAttrObserver: MutationObserver | null = null;

function notifyRootModeAttrListeners(): void {
  for (const listener of rootModeAttrListeners) {
    listener();
  }
}

function subscribeRootModeAttr(onStoreChange: () => void): () => void {
  rootModeAttrListeners.add(onStoreChange);

  if (
    rootModeAttrListeners.size === 1 &&
    typeof MutationObserver !== 'undefined'
  ) {
    rootModeAttrObserver = new MutationObserver(notifyRootModeAttrListeners);
    rootModeAttrObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  return () => {
    rootModeAttrListeners.delete(onStoreChange);
    if (rootModeAttrListeners.size === 0 && rootModeAttrObserver) {
      rootModeAttrObserver.disconnect();
      rootModeAttrObserver = null;
    }
  };
}

function notifyRootNameAttrListeners(): void {
  for (const listener of rootNameAttrListeners) {
    listener();
  }
}

function subscribeRootNameAttr(onStoreChange: () => void): () => void {
  rootNameAttrListeners.add(onStoreChange);

  if (
    rootNameAttrListeners.size === 1 &&
    typeof MutationObserver !== 'undefined'
  ) {
    rootNameAttrObserver = new MutationObserver(notifyRootNameAttrListeners);
    rootNameAttrObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [dataAttr('theme')],
    });
  }

  return () => {
    rootNameAttrListeners.delete(onStoreChange);
    if (rootNameAttrListeners.size === 0 && rootNameAttrObserver) {
      rootNameAttrObserver.disconnect();
      rootNameAttrObserver = null;
    }
  };
}

function subscribeNoop(): () => void {
  return () => {};
}

// A system consumer under no forced Theme resolves the way a system Theme's
// CSS does: from the one scheme the page root names, such as a host's
// `color-scheme: dark`. One observer serves them all, and it runs only while
// one listens. Every copy of Core on the page shares the listeners and the
// observer's `stop`, so the last copy to unsubscribe stops what the first
// started.
const rootScheme = sharedState(
  'theme/use-theme/root-scheme',
  1,
  (): {listeners: Set<() => void>; stop: (() => void) | null} => ({
    listeners: new Set(),
    stop: null,
  }),
);

const STYLE_NODES = 'style, link[rel~="stylesheet"]';

/** `light` or `dark` when the page root names only that scheme, else null. */
function getRootSchemeSnapshot(): 'light' | 'dark' | null {
  const declared: string | undefined = window.getComputedStyle(
    document.documentElement,
  ).colorScheme;
  const names = (declared ?? '').split(/\s+/);
  const light = names.includes('light');
  const dark = names.includes('dark');
  if (light === dark) {
    return null;
  }
  return dark ? 'dark' : 'light';
}

/**
 * Whether a change can change the root's scheme: one of the root's
 * attributes, the text of a style element, an attribute of a style or link
 * element (`href`, `media`, `disabled`, `rel`), or a style or stylesheet link
 * that came or went in the head.
 */
function changesRootScheme(records: MutationRecord[]): boolean {
  return records.some(record => {
    const target = record.target;
    if (target === document.documentElement) {
      return true;
    }
    const element = target instanceof Element ? target : target.parentElement;
    if (element?.closest('style') != null) {
      return true;
    }
    if (record.type === 'attributes') {
      return element?.matches('link, style') === true;
    }
    return [...record.addedNodes, ...record.removedNodes].some(
      node =>
        node instanceof Element &&
        (node.matches(STYLE_NODES) || node.querySelector(STYLE_NODES) != null),
    );
  });
}

function notifyRootSchemeChange(): void {
  for (const listener of rootScheme.listeners) {
    listener();
  }
}

function notifyRootSchemeListeners(records: MutationRecord[]): void {
  if (changesRootScheme(records)) {
    notifyRootSchemeChange();
  }
}

/**
 * A linked stylesheet applies when it loads, after its element is in the
 * head, so its load reads the root again. Load does not bubble; a capturing
 * listener on the document hears it.
 */
function onStylesheetLoad(event: Event): void {
  if (event.target instanceof HTMLLinkElement) {
    notifyRootSchemeChange();
  }
}

function subscribeRootScheme(onStoreChange: () => void): () => void {
  rootScheme.listeners.add(onStoreChange);
  if (
    rootScheme.listeners.size === 1 &&
    typeof MutationObserver !== 'undefined'
  ) {
    const observer = new MutationObserver(notifyRootSchemeListeners);
    observer.observe(document.documentElement, {attributes: true});
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href', 'media', 'disabled', 'rel'],
    });
    document.addEventListener('load', onStylesheetLoad, true);
    rootScheme.stop = () => {
      observer.disconnect();
      document.removeEventListener('load', onStylesheetLoad, true);
    };
  }
  return () => {
    rootScheme.listeners.delete(onStoreChange);
    if (rootScheme.listeners.size === 0 && rootScheme.stop != null) {
      rootScheme.stop();
      rootScheme.stop = null;
    }
  };
}

/**
 * The one scheme the page root names, or null when it names both or none.
 * With `watch` false it reads nothing and subscribes to nothing. Server
 * rendering reads null, so it resolves the OS preference as before.
 */
function useRootScheme(watch: boolean): 'light' | 'dark' | null {
  return useSyncExternalStore(
    watch ? subscribeRootScheme : subscribeNoop,
    watch ? getRootSchemeSnapshot : getNullThemeSnapshot,
    getNullThemeSnapshot,
  );
}

/**
 * Reads the root Theme's mode off `<html data-theme>`, live via the shared
 * MutationObserver. Null means no root Theme has synced it (none present,
 * or mode is 'system'). `hasCtx` switches which store this subscribes to —
 * a no-op store when a ThemeContext exists — instead of skipping the hook
 * call, so provider-path consumers never touch the DOM or the observer.
 */
function useRootModeAttr(hasCtx: boolean): 'light' | 'dark' | null {
  return useSyncExternalStore(
    hasCtx ? subscribeNoop : subscribeRootModeAttr,
    hasCtx ? getNullThemeSnapshot : getRootModeAttrSnapshot,
    getRootModeAttrServerSnapshot,
  );
}

function useRootThemeNameAttr(hasCtx: boolean): string | null {
  return useSyncExternalStore(
    hasCtx ? subscribeNoop : subscribeRootNameAttr,
    hasCtx ? getNullThemeSnapshot : getRootNameAttrSnapshot,
    getRootNameAttrServerSnapshot,
  );
}

/**
 * Return the nearest active Astryx theme name.
 *
 * Uses ThemeContext when present and otherwise follows the root Theme's
 * <html data-astryx-theme> attribute. This is intentionally lighter than
 * useTheme() for consumers that only need theme identity, such as semantic
 * icon resolution.
 */
export function useThemeName(): string | null {
  const ctx = use(ThemeContext);
  const hasCtx = ctx != null;
  const rootThemeName = useRootThemeNameAttr(hasCtx);

  return ctx?.theme.name ?? rootThemeName;
}

/**
 * Return the nearest theme object, falling back to the registered root theme
 * only when no provider context is available. With `enabled` false it reads
 * nothing and subscribes to nothing, for a consumer that needs the theme only
 * in some configurations.
 * @internal
 */
export function useThemeDefinition(enabled = true): DefinedTheme | undefined {
  // `use` may be called conditionally, unlike the other hooks.
  const ctx = enabled ? use(ThemeContext) : null;
  const hasCtx = ctx != null;
  const rootThemeName = useRootThemeNameAttr(hasCtx || !enabled);
  if (!enabled) {
    return undefined;
  }
  return ctx?.theme ?? getRegisteredTheme(rootThemeName) ?? undefined;
}

/**
 * Access the current Astryx theme's token values, resolved for the active color mode.
 *
 * Returns raw CSS values (hex colors, px values, etc.) suitable for
 * non-CSS consumers like canvas, SVG, or data visualization libraries
 * (e.g. Vega, D3, Chart.js) that need concrete values rather than
 * CSS custom property references.
 *
 * When called outside a <Theme> provider, resolves mode from the root
 * Theme's `<html data-theme>` when one is present, falling back to the
 * current system color mode otherwise.
 *
 * @example
 * ```
 * function Chart() {
 *   const { token, mode } = useTheme();
 *   return (
 *     <svg>
 *       <rect fill={token('--color-accent')} />
 *       <text fill={token('--color-text-primary')}>Sales</text>
 *     </svg>
 *   );
 * }
 * ```
 */
export function useTheme(): UseThemeReturn {
  const ctx = use(ThemeContext);
  const systemScheme = use(SystemSchemeContext);

  // Falls back to the root Theme's mode via <html data-theme> when there's
  // no ThemeContext ancestor (e.g. useToast's detached fallback viewport).
  // Resolves to null when `ctx` is present, so it has no effect there.
  const hasCtx = ctx != null;
  const rootAttrMode = useRootModeAttr(hasCtx);
  const rootThemeName = useRootThemeNameAttr(hasCtx);

  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  const mode = ctx?.mode ?? rootAttrMode ?? 'system';
  const theme = ctx?.theme ?? getRegisteredTheme(rootThemeName);

  // Anything outside light|dark (a stale persisted preference cast to
  // ThemeMode, say) resolves like 'system', the way the root Theme's <html>
  // sync already treats it, so the declared return type holds.
  const forced = mode === 'light' || mode === 'dark';
  const rootScheme = useRootScheme(!forced && systemScheme === 'root');
  const effectiveMode: 'light' | 'dark' = forced
    ? mode
    : (rootScheme ?? (prefersDark ? 'dark' : 'light'));

  // Build the full resolved map, memoized on theme + effective mode
  const tokens = useMemo(
    () => resolveThemeTokens(theme, {mode: effectiveMode}),
    [theme, effectiveMode],
  );

  const token = useCallback(
    (name: string): string => tokens[name] ?? '',
    [tokens],
  );
  const name = theme?.name ?? 'default';

  return useMemo(
    () => ({name, mode: effectiveMode, token, tokens}),
    [name, effectiveMode, token, tokens],
  );
}
