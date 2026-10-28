// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Kbd.tsx
 * @input Uses React, StyleX, theme tokens, shortcut key names, aliases, provider-bound translator
 * @output Exports Kbd component and KbdProps with localized shortcut text
 * @position Core implementation; renders styled keyboard shortcut indicators
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Kbd/index.ts
 * - /packages/cli/assets/templates/blocks/components/Kbd/ (showcase blocks)
 */

import React, {useSyncExternalStore} from 'react';
import * as stylex from '@stylexjs/stylex';
import {mergeProps} from '../utils';
import {isApplePlatform} from '../utils/isApplePlatform';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {useTranslator, type TranslatorFn} from '../i18n';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typographyVars,
  fontWeightVars,
  typeScaleVars,
} from '../theme/tokens.stylex';

const styles = stylex.create({
  wrapper: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    flexShrink: 0,
  },
  kbd: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: spacingVars['--spacing-5'],
    height: spacingVars['--spacing-5'],
    paddingInline: spacingVars['--spacing-1'],
    borderRadius: radiusVars['--radius-inner'],
    backgroundColor: colorVars['--color-neutral'],
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border-emphasized'],
    color: colorVars['--color-text-primary'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    userSelect: 'none',
  },
});

/**
 * Map of modifier key names to display symbols.
 * Note: `mod` is not in this map — it resolves dynamically via platform
 * detection inside the component.
 */
const KEY_DISPLAY = new Map<string, string>([
  ['ctrl', '\u2303'], // ⌃
  ['alt', '\u2325'], // ⌥
  ['shift', '\u21E7'], // ⇧
  ['enter', '\u21B5'], // ↵
  ['backspace', '\u232B'], // ⌫
  ['tab', '\u21E5'], // ⇥
  ['up', '\u2191'],
  ['down', '\u2193'],
  ['left', '\u2190'],
  ['right', '\u2192'],
  ['plus', '+'],
]);

const KBD_KEY_ALIASES = new Map<string, string>([
  ['esc', 'escape'],
  ['return', 'enter'],
]);

/**
 * Resolves a key name to its display string. Handles the platform-aware
 * `mod` key (⌘ on macOS, Ctrl on other platforms) and falls back to
 * KEY_DISPLAY or uppercased key name.
 */
function getKeyDisplay(key: string, isMac: boolean, t: TranslatorFn): string {
  if (key === 'mod') {
    return isMac ? '\u2318' : t('@astryx.kbd.key.controlShort');
  }
  if (key === 'escape') return t('@astryx.kbd.key.escapeShort');
  return KEY_DISPLAY.get(key) ?? key.toUpperCase();
}

/**
 * Spoken-word labels for screen readers. The visual `KEY_DISPLAY` uses glyphs
 * (⌘, ⇧, ↵, …) that assistive tech cannot announce meaningfully, so the
 * accessible name for the shortcut is built from these words instead.
 */
const KEY_LABEL = new Map<string, string>([
  ['ctrl', '@astryx.kbd.key.control'],
  ['alt', '@astryx.kbd.key.alt'],
  ['shift', '@astryx.kbd.key.shift'],
  ['enter', '@astryx.kbd.key.enter'],
  ['backspace', '@astryx.kbd.key.backspace'],
  ['escape', '@astryx.kbd.key.escape'],
  ['tab', '@astryx.kbd.key.tab'],
  ['up', '@astryx.kbd.key.up'],
  ['down', '@astryx.kbd.key.down'],
  ['left', '@astryx.kbd.key.left'],
  ['right', '@astryx.kbd.key.right'],
  ['plus', '@astryx.kbd.key.plus'],
]);

function getKeyLabel(key: string, isMac: boolean, t: TranslatorFn): string {
  if (key === 'mod') {
    return t(isMac ? '@astryx.kbd.key.command' : '@astryx.kbd.key.control');
  }
  const labelKey = KEY_LABEL.get(key);
  return labelKey ? t(labelKey) : key.toUpperCase();
}

function subscribeToPlatformChanges(): () => void {
  return () => {};
}

function getServerPlatformSnapshot(): boolean {
  return false;
}

export interface KbdProps extends BaseProps<HTMLSpanElement> {
  ref?: React.Ref<HTMLSpanElement>;
  /**
   * Keyboard shortcut string. Use "+" to separate keys.
   * Special keys: mod (Cmd on Mac), ctrl, alt, shift, enter, backspace, escape,
   * tab, up, down, left, and right.
   * Aliases: "esc" for "escape" and "return" for "enter".
   * Use "plus" to render a literal "+" key (e.g. "shift+plus").
   *
   * @example
   * ```
   * "mod+k"
   * "mod+shift+p"
   * "shift+plus"
   * "enter"
   * ```
   */
  keys: string;
}

/**
 * Displays a keyboard shortcut as styled <kbd> elements.
 *
 * A general-purpose component for rendering keyboard shortcuts
 * anywhere in the system — tooltips, menus, documentation, etc.
 *
 * Platform-aware: `mod` renders as ⌘ on macOS and Ctrl elsewhere.
 * SSR-safe — defers platform detection through useSyncExternalStore to avoid
 * hydration mismatches.
 *
 * @example
 * ```
 * <Kbd keys="mod+k" />
 * ```
 */
export function Kbd({keys, ref, xstyle, className, style, ...rest}: KbdProps) {
  const t = useTranslator();
  const isMac = useSyncExternalStore(
    subscribeToPlatformChanges,
    isApplePlatform,
    getServerPlatformSnapshot,
  );

  const keyOccurrences = new Map<string, number>();
  const parts = keys
    .split('+')
    .map(key => key.trim().toLowerCase())
    .map(sourceKey => {
      const occurrence = keyOccurrences.get(sourceKey) ?? 0;
      keyOccurrences.set(sourceKey, occurrence + 1);
      return {
        key: KBD_KEY_ALIASES.get(sourceKey) ?? sourceKey,
        reactKey: `${sourceKey}:${occurrence}`,
      };
    });

  // Screen-reader name: the joined spoken labels (e.g. "Command + K"), since
  // the visual glyphs below are announced meaninglessly by assistive tech.
  const accessibleName = parts
    .map(({key}) => getKeyLabel(key, isMac, t))
    .reduce(
      (shortcut, key, index) =>
        index === 0 ? key : t('@astryx.kbd.shortcut', {shortcut, key}),
      '',
    );

  return (
    <span
      {...rest}
      ref={ref}
      role="img"
      aria-label={accessibleName}
      {...mergeProps(
        themeProps('kbd'),
        stylex.props(styles.wrapper, xstyle),
        className,
        style,
      )}>
      {parts.map(({key, reactKey}) => (
        <kbd key={reactKey} aria-hidden="true" {...stylex.props(styles.kbd)}>
          {getKeyDisplay(key, isMac, t)}
        </kbd>
      ))}
    </span>
  );
}

Kbd.displayName = 'Kbd';
