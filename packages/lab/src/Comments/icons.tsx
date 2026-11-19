// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file icons.tsx
 * @input Uses React, Icon, getExtendedIcon, and useThemeName
 * @output Exports COMMENT_ICON_KEYS and the CommentIcon renderer
 * @position Glyphs the Comments family owns: themeable by namespaced key,
 *   with bundled inline defaults and no icon-library dependency
 *
 * A theme replaces any glyph by key:
 *   defineTheme({icons: {'comment:reply': <MyReplyIcon />}})
 */

import type {ReactNode, SVGProps} from 'react';
import {getExtendedIcon, Icon, type IconColor} from '@astryxdesign/core/Icon';
import {useThemeName} from '@astryxdesign/core/theme';

/** Stable icon-registry keys for the Comments family's glyphs. */
export const COMMENT_ICON_KEYS = {
  addReaction: 'comment:addReaction',
  reply: 'comment:reply',
  copyLink: 'comment:copyLink',
  resolve: 'comment:resolve',
  edit: 'comment:edit',
  delete: 'comment:delete',
  attach: 'comment:attach',
  emoji: 'comment:emoji',
  event: 'comment:event',
} as const;

export type CommentIconName = keyof typeof COMMENT_ICON_KEYS;

type Glyph = (props: SVGProps<SVGSVGElement>) => React.JSX.Element;

function glyph(paths: readonly string[]): Glyph {
  function CommentGlyph(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}>
        {paths.map(d => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  }
  return CommentGlyph;
}

/** Glyphs the system registry already has: their keys fall back to it. */
const REGISTRY_FALLBACKS = {resolve: 'check'} as const;

/** Bundled defaults, drawn on a 24px grid with 1.5px strokes. */
const FALLBACK_GLYPHS: Record<
  Exclude<CommentIconName, keyof typeof REGISTRY_FALLBACKS>,
  Glyph
> = {
  // A smiling face with a plus at its upper end.
  addReaction: glyph([
    'M20.5 12.5A8.5 8.5 0 1 1 11.5 3.5',
    'M8.5 14.5a4 4 0 0 0 7 0',
    'M9 10h.01M15 10h.01',
    'M19 2.5v5M16.5 5h5',
  ]),
  // A speech bubble.
  reply: glyph([
    'M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5v-3.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z',
  ]),
  // Two chain links.
  copyLink: glyph([
    'M10 14a4.5 4.5 0 0 0 6.36 0l3-3a4.5 4.5 0 0 0-6.36-6.36l-1.25 1.25',
    'M14 10a4.5 4.5 0 0 0-6.36 0l-3 3a4.5 4.5 0 0 0 6.36 6.36l1.25-1.25',
  ]),
  // A pencil.
  edit: glyph(['M15.5 4.5l4 4L8 20H4v-4L15.5 4.5z', 'M13.5 6.5l4 4']),
  // A bin with a lid.
  delete: glyph([
    'M4.5 6.5h15',
    'M9.5 6.5v-2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2',
    'M6.5 6.5l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13',
    'M10.5 10.5v6M13.5 10.5v6',
  ]),
  // A paper clip.
  attach: glyph([
    'M19.5 11.5l-7.6 7.6a4.5 4.5 0 0 1-6.36-6.36l7.95-7.95a3 3 0 0 1 4.24 4.24l-7.6 7.6a1.5 1.5 0 0 1-2.12-2.12l7.07-7.07',
  ]),
  // A smiling face.
  emoji: glyph([
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M8.5 14.5a4 4 0 0 0 7 0',
    'M9 10h.01M15 10h.01',
  ]),
  // A point on a timeline.
  event: glyph([
    'M12 3v5.5M12 15.5V21',
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  ]),
};

/**
 * The fallback `getExtendedIcon` returns only when no theme, registered, or
 * built-in entry answers a key. A function entry that returns `null` still
 * answers it: its result is final, so the glyph draws nothing.
 */
const NO_ENTRY: ReactNode = <></>;

/**
 * A comment glyph at the icon slot's size: the active theme's icon for its
 * `comment:*` key when one is registered, else the bundled default.
 */
export function CommentIcon({
  name,
  color = 'secondary',
  size = 'sm',
}: {
  name: CommentIconName;
  color?: IconColor;
  size?: 'xsm' | 'sm' | 'md' | 'lg';
}) {
  const themeName = useThemeName();
  const key = COMMENT_ICON_KEYS[name];
  const hasOverride = getExtendedIcon(key, NO_ENTRY, themeName) !== NO_ENTRY;
  const fallback =
    name in REGISTRY_FALLBACKS
      ? REGISTRY_FALLBACKS[name as keyof typeof REGISTRY_FALLBACKS]
      : FALLBACK_GLYPHS[name as keyof typeof FALLBACK_GLYPHS];
  return <Icon icon={hasOverride ? key : fallback} color={color} size={size} />;
}
