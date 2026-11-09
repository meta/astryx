// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ThemedImage.tsx
 * Theme-aware image. Give it a `lightSrc` and/or a `darkSrc`; it shows the one
 * matching the docsite's resolved color mode. If only one is provided, that
 * one is always used.
 *
 * Honors the MANUAL theme toggle, not just the OS preference:
 *  - Before mount / while mode is 'system': renders a <picture> whose
 *    `prefers-color-scheme: dark` <source> lets the browser pick from the OS
 *    scheme with no flash and no JS.
 *  - After the user toggles (themeMode resolves to a concrete 'light'|'dark'):
 *    renders a single <img> for that mode so the toggle beats the media query.
 *
 * When both variants exist but the dark asset happens to be missing at runtime,
 * an onError handler falls back to the light asset (and vice-versa).
 */

'use client';

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useThemeMode} from '../../app/providers';
import {blogDarkImages, blogImageSizes} from '../../generated/blogRegistry';

const styles = stylex.create({
  image: {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    borderRadius: 'var(--radius-md, 8px)',
    // A subtle frame so a screenshot reads as intentional on either
    // background. Drawn as an outline, not a border, so an `@2x` image's
    // `width` is exactly its painted width (the site's `box-sizing:
    // border-box` would otherwise take the frame out of it and resample).
    outlineWidth: 1,
    outlineStyle: 'solid',
    outlineColor: 'var(--color-border, rgba(0,0,0,0.12))',
    outlineOffset: 0,
  },
});

export interface ThemedImageProps {
  /** Image shown in light mode. Falls back to darkSrc if omitted. */
  lightSrc?: string;
  /** Image shown in dark mode. Falls back to lightSrc if omitted. */
  darkSrc?: string;
  alt: string;
}

/** `name@2x.png`, `name@2x.dark.png`: a screenshot taken at 2× pixel density. */
const RETINA_SRC = /@2x(\.dark)?\.[a-zA-Z0-9]+$/;

/**
 * The CSS width a body image renders at, or undefined to let the image size
 * itself. An `@2x` image whose natural size the build recorded renders at half
 * its pixel width — the component's real on-screen size — and the dark
 * sibling takes the light one's width so the two never shift on toggle.
 */
export function displayWidthFor(src: string): number | undefined {
  if (!RETINA_SRC.test(src)) return undefined;
  const size = blogImageSizes[src];
  return size ? Math.round(size.width / 2) : undefined;
}

export function ThemedImage({lightSrc, darkSrc, alt}: ThemedImageProps) {
  const {themeMode} = useThemeMode();
  const [failed, setFailed] = useState<string | null>(null);

  const light = lightSrc ?? darkSrc;
  const dark = darkSrc ?? lightSrc;
  // `max-width: 100%` and `height: auto` stay in the style, so a wide
  // screenshot still fits the column and keeps its aspect ratio.
  const width = displayWidthFor(light ?? dark ?? '');

  // Only one variant available (or both point at the same asset): plain image.
  if (light == null || dark == null || light === dark) {
    const only = (light ?? dark) as string;
    return (
      <img src={only} alt={alt} width={width} {...stylex.props(styles.image)} />
    );
  }

  // Manual toggle resolved to a concrete mode — honor it directly.
  if (themeMode === 'light' || themeMode === 'dark') {
    const wanted = themeMode === 'dark' ? dark : light;
    const other = themeMode === 'dark' ? light : dark;
    const src = failed === wanted ? other : wanted;
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        onError={() => setFailed(wanted)}
        {...stylex.props(styles.image)}
      />
    );
  }

  // First paint / 'system': let the browser choose from the OS scheme.
  return (
    <picture>
      <source srcSet={dark} media="(prefers-color-scheme: dark)" />
      <img
        src={light}
        alt={alt}
        width={width}
        {...stylex.props(styles.image)}
      />
    </picture>
  );
}

/**
 * Markdown image override for post bodies. Markdown carries a single `src`, so
 * we derive a candidate dark-mode variant by convention (`foo.png` ->
 * `foo.dark.png`) and use it only if that asset is in the build-time
 * `blogDarkImages` manifest (scanned from public/blog by generate-data.mjs).
 * This keeps ThemedImage's API explicit (lightSrc/darkSrc) while letting
 * plain-markdown posts opt into a dark variant just by dropping a `*.dark.*`
 * file next to the image — no runtime existence probe, no broken-image flash.
 * Posts with no dark variant (the common case) render a single framed image.
 */
export function MarkdownImage({src, alt}: {src: string; alt: string}) {
  const m = /^(.*)\.([a-zA-Z0-9]+)$/.exec(src);
  const candidate =
    m && !m[1].endsWith('.dark') ? `${m[1]}.dark.${m[2]}` : undefined;
  const darkSrc =
    candidate != null && blogDarkImages.includes(candidate)
      ? candidate
      : undefined;

  return <ThemedImage lightSrc={src} darkSrc={darkSrc} alt={alt} />;
}
