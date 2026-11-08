// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * ComponentPreviewTheme.
 *
 * @input component preview chrome and preview content from the docsite
 * @output children rendered under the neutral preview theme with the current mode
 * @position Component detail previews — wraps the preview container as well as
 * the component so their backgrounds, borders, and content tokens match.
 */

import {type ReactNode} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {useThemeMode} from '../../app/providers';

// The neutral theme's icons reach the previews through <Theme> alone: it calls
// registerTheme(theme) as it renders, and every Icon below resolves its
// semantic name against that theme (useThemeName -> getIcon(name, themeName)).
//
// Do NOT add a global icon registration here. That API writes to a process-wide
// registry, and this module is in the client bundle of the component-detail
// routes ONLY — while on the server one module registry is shared by every
// route. Registering here therefore gave the SSR pass of pages that never load
// this module (the home page, /blog, /templates, /docs/*) the Lucide icons
// while their client bundle still had the built-in defaults, and hydration
// failed with React #418 on those routes.

export function ComponentPreviewTheme({children}: {children: ReactNode}) {
  const {mode} = useThemeMode();

  return (
    <Theme theme={neutralTheme} mode={mode}>
      {children}
    </Theme>
  );
}
