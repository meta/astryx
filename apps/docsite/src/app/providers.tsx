// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useState,
} from 'react';
import Link from 'next/link';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {Theme} from '@astryxdesign/core/theme';
import {LinkProvider} from '@astryxdesign/core/Link';
import {astryxTheme} from '../themes/astryx';

type ThemeMode = 'light' | 'dark';

const OS_DARK_SCHEME = '(prefers-color-scheme: dark)';

const ThemeModeContext = createContext<{
  themeMode: 'system' | ThemeMode;
  toggleMode: () => void;
}>({
  themeMode: 'system',
  toggleMode: () => {},
});

export function useThemeMode(): {
  /** Resolved color mode for UI consumers (toggle icon, ColorSwatch). */
  mode: ThemeMode;
  /**
   * Raw, system-aware mode for theme rendering. Stays 'system' on the first
   * paint so nested <Theme> scopes keep `color-scheme: light dark` and their
   * light-dark() tokens follow the OS preference — no flash before the OS mode
   * resolves (#2713).
   */
  themeMode: 'system' | ThemeMode;
  /** The OS color scheme, whatever mode the visitor set. */
  osMode: ThemeMode;
  toggleMode: () => void;
} {
  const {themeMode, toggleMode} = useContext(ThemeModeContext);
  // Until the provider resolves `system`, each consumer reads the OS scheme
  // itself. The provider resolves it in a transition, which can commit
  // seconds after a consumer is live on a slow device.
  const osPrefersDark = useMediaQuery(OS_DARK_SCHEME);
  const osMode: ThemeMode = osPrefersDark ? 'dark' : 'light';
  return {
    mode: themeMode === 'system' ? osMode : themeMode,
    themeMode,
    osMode,
    toggleMode,
  };
}

export function Providers({children}: {children: React.ReactNode}) {
  // Start in 'system' so SSR and the first paint defer to the OS scheme via
  // reset.css's `color-scheme: light dark` + light-dark() tokens — no flash,
  // no script (#2713). The effect resolves it to a concrete 'light'/'dark'
  // (visually identical) and tracks OS changes until the user toggles.
  // A fully SSR-correct manual toggle would need a server-read cookie; left
  // out of scope here.
  const [mode, setMode] = useState<'system' | ThemeMode>('system');
  const [isManual, setIsManual] = useState(false);

  // Syncs the mode with the OS color scheme until the visitor sets one.
  useEffect(() => {
    if (isManual) {
      return;
    }
    const mq = window.matchMedia(OS_DARK_SCHEME);
    // The mode is context above every page, and this runs when the site
    // shell is live. On a slow connection the page's own script is not there
    // yet. React answers an urgent update above a page it has not hydrated by
    // rendering the page again in place of its server HTML, and it holds the
    // shell's other start-up updates until the script arrives. A transition
    // waits for the page to hydrate.
    const sync = () =>
      startTransition(() => setMode(mq.matches ? 'dark' : 'light'));
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [isManual]);

  const toggleMode = () => {
    // The visitor can use the toggle before the transition above commits.
    const shown =
      mode === 'system'
        ? window.matchMedia(OS_DARK_SCHEME).matches
          ? 'dark'
          : 'light'
        : mode;
    setIsManual(true);
    setMode(shown === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeModeContext value={{themeMode: mode, toggleMode}}>
      <Theme theme={astryxTheme} mode={mode}>
        <LinkProvider component={Link}>{children}</LinkProvider>
      </Theme>
    </ThemeModeContext>
  );
}
