// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Theme Provider Component
 *
 * Applies theme tokens and sets color-scheme for light-dark() to work.
 * Themes are created with `defineTheme()` and applied via CSS:
 * - Token overrides set as CSS custom properties on [data-astryx-theme]
 * - Component overrides scoped via @scope'd CSS selectors on stable Astryx
 *   target classes combined with reflected `data-*` prop/state attributes
 *
 * Root detection: The first Theme in the tree (no parent Theme)
 * automatically syncs attributes to `document.documentElement`:
 * - `data-theme` — drives `color-scheme` via reset.css rules, ensuring browser
 *   chrome (scrollbars, native form controls, date pickers) reflects the mode.
 * - `data-astryx-theme` — enables @scope'd theme CSS to reach elements rendered
 *   outside the Theme wrapper (portals, toast fallback viewports).
 *
 * For RSC / SSR, set `data-theme` on `<html>` in your root server layout
 * to avoid a flash of wrong theme before hydration:
 *
 *   <html lang="en" data-theme="dark">
 *
 * @example
 * ```
 * const ocean = defineTheme({
 *   name: 'ocean',
 *   tokens: { '--color-accent': ['#0077B6', '#48CAE4'] },
 *   components: { card: { base: { borderWidth: '2px' } } },
 *   icons: oceanIcons,
 * });
 * <Theme theme={ocean}><App /></Theme>
 * ```
 */

import React, {use, useId, useInsertionEffect, useMemo} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import * as stylex from '@stylexjs/stylex';
import type {ThemeMode} from './types';
import {colorVars, typographyVars} from './tokens.stylex';
import {generateThemeCSS, type DefinedTheme} from './defineTheme';
import {registerTheme} from './themeRegistry';
import {dataAttr} from '../naming';
import {ThemeContext} from './useTheme';
import {warnOnce} from '../utils/devWarning';

/**
 * Theme provider props
 */
interface ThemeProps {
  /** Theme from defineTheme() */
  theme: DefinedTheme;
  /** Color mode - 'system' follows OS preference */
  mode?: ThemeMode;
  /** Children to render */
  children: React.ReactNode;
}

/**
 * Styles for the theme wrapper
 */
const wrapperStyles = stylex.create({
  base: {
    display: 'contents',
    color: colorVars['--color-text-primary'],
    fontFamily: typographyVars['--font-family-body'],
  },
  light: {
    colorScheme: 'light',
  },
  dark: {
    colorScheme: 'dark',
  },
  system: {
    colorScheme: 'light dark',
  },
});

// =============================================================================
// Nesting context — detect root vs nested Theme
// =============================================================================

/**
 * True below a Theme; the root Theme (no parent context) syncs data-theme
 * to <html>. A detached React root that conceptually sits inside the app
 * (useToast's fallback viewport) provides it as `true` itself, so a Theme
 * rendered in toast content themes its subtree without claiming <html> as
 * if it were the app's root Theme.
 * @internal Not exported from the theme barrel; useToast imports it from
 * './theme/Theme' directly.
 */
export const ThemeNestingContext = React.createContext(false);
ThemeNestingContext.displayName = 'ThemeNestingContext';

// =============================================================================
// Style injection for unbuilt themes
// =============================================================================

/** Track which themes have already been injected */
const injectedThemes = new Set<string>();
const THEME_LAYER_ORDER = '@layer reset, astryx-base, astryx-theme;';

/**
 * Hook to inject theme CSS into the document.
 * Built themes (from `astryx theme build`) skip injection — their CSS
 * is in a separate file imported by the consumer.
 */
function useThemeStyleInjection(theme: DefinedTheme): void {
  const id = useId();

  useInsertionEffect(() => {
    // Built themes have their CSS in a separate file — skip injection
    if (theme.__built) {
      return;
    }

    // Second and later `Theme`s using this theme do no work at all —
    // generation included. Its CSS is document-wide and identical for each.
    const themeKey = `astryx-theme-${theme.name}`;
    if (injectedThemes.has(themeKey)) {
      return;
    }

    // One-time perf hint per theme
    warnOnce(
      `theme-injection:${theme.name}`,
      'Theme',
      `"${theme.name}" is using runtime style injection. ` +
        `For better performance, use the pre-built theme:\n\n` +
        `  import {${theme.name}Theme} from '@astryxdesign/theme-${theme.name}/built';\n` +
        `  import '@astryxdesign/theme-${theme.name}/theme.css';\n\n` +
        `For custom themes, run \`npx @astryxdesign/cli theme build <file>\` to generate ` +
        `the built artifacts.`,
    );

    const {prose, component} = generateThemeCSS(theme);
    injectedThemes.add(themeKey);
    const cleanups: (() => void)[] = [() => injectedThemes.delete(themeKey)];

    // Prose defaults go into @layer reset — lowest priority, scoped to
    // the theme region. Any class-based style (StyleX, .xds-*) wins.
    if (prose) {
      const proseStyle = document.createElement('style');
      proseStyle.setAttribute(dataAttr('theme-prose'), theme.name);
      proseStyle.setAttribute(dataAttr('id'), id);
      proseStyle.textContent = `${THEME_LAYER_ORDER}\n@layer reset {\n${prose}\n}`;
      document.head.appendChild(proseStyle);
    }

    // Component overrides go into @layer astryx-theme — above StyleX layers
    // so themes can intentionally restyle components.
    if (component) {
      const compStyle = document.createElement('style');
      compStyle.setAttribute(dataAttr('theme'), theme.name);
      compStyle.setAttribute(dataAttr('id'), id);
      compStyle.textContent = `${THEME_LAYER_ORDER}\n@layer astryx-theme {\n${component}\n}`;
      document.head.appendChild(compStyle);
    }

    if (prose || component) {
      cleanups.push(() => {
        // Matched by the astryx id marker, which is always written above.
        const proseEl = document.querySelector(
          `style[${dataAttr('theme-prose')}="${theme.name}"][${dataAttr('id')}="${id}"]`,
        );
        const compEl = document.querySelector(
          `style[${dataAttr('theme')}="${theme.name}"][${dataAttr('id')}="${id}"]`,
        );
        proseEl?.remove();
        compEl?.remove();
      });
    }

    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [theme, id]);
}

// =============================================================================
// Root color-scheme sync
// =============================================================================

/**
 * Hook to sync theme attributes to document.documentElement for the root provider.
 * Skipped for nested Theme instances.
 *
 * Syncs two attributes:
 * - `data-theme` (light/dark) — reset.css maps this to color-scheme, controlling
 *   browser chrome (scrollbars, native form controls, date pickers).
 * - `data-astryx-theme` (theme name) — enables @scope'd theme CSS to reach elements
 *   outside the Theme wrapper (e.g. toast fallback viewports, portals).
 *
 * - 'light' | 'dark' → sets data-theme="light" | "dark"
 * - 'system' → removes data-theme (reset.css defaults to color-scheme: light dark)
 */
function useRootThemeSync(
  isNested: boolean,
  mode: ThemeMode,
  themeName: string,
): void {
  useIsomorphicLayoutEffect(() => {
    if (isNested) {
      return;
    }
    if (typeof document === 'undefined') {
      return;
    }

    if (mode === 'light' || mode === 'dark') {
      document.documentElement.setAttribute('data-theme', mode);
    } else {
      // system — remove attribute, let reset.css default apply
      document.documentElement.removeAttribute('data-theme');
    }

    // Sync theme name so @scope rules reach portals/fallback viewports.
    document.documentElement.setAttribute(dataAttr('theme'), themeName);

    return () => {
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.removeAttribute(dataAttr('theme'));
    };
  }, [isNested, mode, themeName]);
}

// =============================================================================
// Component
// =============================================================================

/**
 * Theme provider component
 *
 * Sets data-astryx-theme attribute so @scope'd CSS takes effect.
 * Component overrides are pure CSS scoped under the theme attribute —
 * components render with stable `.xds-*` classes plus `data-*` prop
 * reflections and don't need context.
 *
 * When this is the root Theme (no parent Theme in the tree),
 * it syncs `data-theme` and `data-astryx-theme` to `<html>` so browser
 * chrome reflects the active mode and @scope'd CSS reaches portals.
 * Nested Theme instances skip the sync.
 */
export function Theme({
  theme,
  mode = 'system',
  children,
}: ThemeProps): React.ReactElement {
  const isNested = use(ThemeNestingContext);

  registerTheme(theme);

  useThemeStyleInjection(theme);
  useRootThemeSync(isNested, mode, theme.name);

  // Get color-scheme style
  const colorSchemeStyle =
    mode === 'dark'
      ? wrapperStyles.dark
      : mode === 'light'
        ? wrapperStyles.light
        : wrapperStyles.system;

  // Memoize the context value to prevent unnecessary re-renders
  const ctxValue = useMemo(() => ({theme, mode}), [theme, mode]);

  return (
    <ThemeContext value={ctxValue}>
      <ThemeNestingContext value={true}>
        <div
          {...stylex.props(wrapperStyles.base, colorSchemeStyle)}
          data-astryx-theme={theme.name}
          data-theme={mode === 'system' ? undefined : mode}>
          {children}
        </div>
      </ThemeNestingContext>
    </ThemeContext>
  );
}

Theme.displayName = 'Theme';
