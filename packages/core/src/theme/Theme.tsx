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

import React, {use, useId, useInsertionEffect, useMemo, useState} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import * as stylex from '@stylexjs/stylex';
import type {ThemeMode} from './types';
import {colorVars, typographyVars} from './tokens.stylex';
import {generateThemeCSS, type DefinedTheme} from './defineTheme';
import {registerTheme} from './themeRegistry';
import {dataAttr} from '../naming';
import {ThemeContext} from './useTheme';
import {warnOnce} from '../utils/devWarning';
import {REDUCED_MOTION_PROPERTY, resolveMotionKnobs} from './themeMotion';
import {
  reducedMotionMarkProps,
  setRootReducedMotionMark,
} from '../privateAttributes/reducedMotion.stylex';
import {createSharedContext} from '../utils/sharedContext';

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
  // The mark's custom property (REDUCED_MOTION_PROPERTY), which every element
  // under the mark inherits.
  reducedMotion: {
    '--_astryx-reduced-motion': '1',
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
export const ThemeNestingContext = createSharedContext(
  'ThemeNestingContext',
  1,
  false,
);
ThemeNestingContext.displayName = 'ThemeNestingContext';

// =============================================================================
// Style injection for unbuilt themes
// =============================================================================

/**
 * The CSS is shared by the whole document. Remove it only when the last
 * `Theme` that uses it unmounts.
 */
interface InjectedTheme {
  /**
   * Each mounted `Theme` that uses this name, with its theme and id. The key
   * is one object per `Theme` instance: `useId` values can repeat across
   * separate React roots.
   */
  users: Map<object, {theme: DefinedTheme; id: string}>;
  /** The `Theme` whose theme is in the document. */
  owner: object;
  /**
   * The owner that last handed the CSS over. When the same `Theme` sets up
   * again in the same commit (its own theme changed), it takes the CSS back.
   */
  formerOwner: object | null;
  /** The theme whose CSS is in the document. */
  theme: DefinedTheme;
  styles: HTMLStyleElement[];
}
const injectedThemes = new Map<string, InjectedTheme>();
const THEME_LAYER_ORDER = '@layer reset, astryx-base, astryx-theme;';

function writeThemeStyles(theme: DefinedTheme, id: string): HTMLStyleElement[] {
  const {prose, component} = generateThemeCSS(theme);
  const styles: HTMLStyleElement[] = [];

  // Prose defaults go into @layer reset — lowest priority, scoped to
  // the theme region. Any class-based style (StyleX, .xds-*) wins.
  if (prose) {
    const proseStyle = document.createElement('style');
    proseStyle.setAttribute(dataAttr('theme-prose'), theme.name);
    proseStyle.setAttribute(dataAttr('id'), id);
    proseStyle.textContent = `${THEME_LAYER_ORDER}\n@layer reset {\n${prose}\n}`;
    document.head.appendChild(proseStyle);
    styles.push(proseStyle);
  }

  // Component overrides go into @layer astryx-theme — above StyleX layers
  // so themes can intentionally restyle components.
  if (component) {
    const compStyle = document.createElement('style');
    compStyle.setAttribute(dataAttr('theme'), theme.name);
    compStyle.setAttribute(dataAttr('id'), id);
    compStyle.textContent = `${THEME_LAYER_ORDER}\n@layer astryx-theme {\n${component}\n}`;
    document.head.appendChild(compStyle);
    styles.push(compStyle);
  }
  return styles;
}

/** Replace an entry's CSS with `theme`'s. */
function rewriteThemeStyles(
  entry: InjectedTheme,
  theme: DefinedTheme,
  id: string,
): void {
  for (const style of entry.styles) {
    style.remove();
  }
  entry.theme = theme;
  entry.styles = writeThemeStyles(theme, id);
}

/**
 * Hook to inject theme CSS into the document.
 * Built themes (from `astryx theme build`) skip injection — their CSS
 * is in a separate file imported by the consumer.
 */
function useThemeStyleInjection(theme: DefinedTheme): void {
  const id = useId();
  const [instance] = useState(() => ({}));

  // Syncs the document's stylesheets with the runtime theme CSS.
  useInsertionEffect(() => {
    // Built themes have their CSS in a separate file — skip injection
    if (theme.__built) {
      return;
    }

    const themeKey = `astryx-theme-${theme.name}`;
    let entry = injectedThemes.get(themeKey);
    if (entry == null) {
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
      entry = {
        users: new Map(),
        owner: instance,
        formerOwner: null,
        theme,
        styles: writeThemeStyles(theme, id),
      };
      injectedThemes.set(themeKey, entry);
    }
    // A later `Theme` does no generation. The CSS of the first `Theme` that
    // injected the name stays in the document.
    entry.users.set(instance, {theme, id});
    if (entry.formerOwner === instance) {
      // The owner's own theme changed: its new definition paints, as on main.
      entry.owner = instance;
      entry.formerOwner = null;
      if (entry.theme !== theme) {
        rewriteThemeStyles(entry, theme, id);
      }
    }
    const current = entry;

    return () => {
      current.users.delete(instance);
      if (current.users.size === 0) {
        for (const style of current.styles) {
          style.remove();
        }
        injectedThemes.delete(themeKey);
        return;
      }
      if (current.owner !== instance) {
        return;
      }
      // The earliest-mounted `Theme` that remains takes over the CSS. If its
      // theme differs, as after a redefinition under the same name, its CSS
      // replaces the old one.
      const [nextOwner, next] = [...current.users][0];
      current.owner = nextOwner;
      current.formerOwner = instance;
      if (next.theme !== current.theme) {
        rewriteThemeStyles(current, next.theme, next.id);
      }
    };
  }, [theme, id, instance]);
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
 *
 * A theme that reduces motion for everyone also marks `<html>` with
 * `data-astryx-reduced-motion` and its custom property, so layers portaled
 * outside the wrapper reduce their motion too.
 */
function useRootThemeSync(
  isNested: boolean,
  mode: ThemeMode,
  themeName: string,
  reducesMotion: boolean,
): void {
  // Syncs the theme attributes on the root `<html>` element.
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
    setRootReducedMotionMark(document.documentElement, reducesMotion);
    if (reducesMotion) {
      document.documentElement.style.setProperty(REDUCED_MOTION_PROPERTY, '1');
    } else {
      document.documentElement.style.removeProperty(REDUCED_MOTION_PROPERTY);
    }

    return () => {
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.removeAttribute(dataAttr('theme'));
      setRootReducedMotionMark(document.documentElement, false);
      document.documentElement.style.removeProperty(REDUCED_MOTION_PROPERTY);
    };
  }, [isNested, mode, themeName, reducesMotion]);
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
  // resolveMotionKnobs resolves no public theme to 'always', so no theme
  // marks its root.
  const reducesMotion =
    resolveMotionKnobs(theme.__axes?.motion).reducedMotion === 'always';
  useRootThemeSync(isNested, mode, theme.name, reducesMotion);

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
          {...stylex.props(
            wrapperStyles.base,
            colorSchemeStyle,
            reducesMotion && wrapperStyles.reducedMotion,
          )}
          data-astryx-theme={theme.name}
          {...reducedMotionMarkProps(reducesMotion)}
          data-theme={mode === 'system' ? undefined : mode}>
          {children}
        </div>
      </ThemeNestingContext>
    </ThemeContext>
  );
}

Theme.displayName = 'Theme';
