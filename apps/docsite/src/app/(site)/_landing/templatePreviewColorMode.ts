// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Decides the color mode that a landing template preview page needs in its URL.
 * @input The site's color mode and the OS color scheme.
 * @output The URL fragment for the preview page: `#light`, `#dark`, or none.
 * @position Used by TemplatesPreview. The pages come from scripts/generate-landing-template-previews.mjs.
 */

/**
 * A preview page follows the OS color scheme on its own. It needs the site's
 * mode in its URL only when a visitor set a mode that differs from the OS.
 * The site's mode is `system` on the server and through hydration, so the
 * fragment is empty there whatever the OS scheme reads as.
 */
export function previewColorModeFragment(
  themeMode: 'system' | 'light' | 'dark',
  osPrefersDark: boolean,
): '' | '#light' | '#dark' {
  if (themeMode === 'system') {
    return '';
  }
  const osMode = osPrefersDark ? 'dark' : 'light';
  return themeMode === osMode ? '' : `#${themeMode}`;
}
