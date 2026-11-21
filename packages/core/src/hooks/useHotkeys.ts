// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useHotkeys.ts
 * @input React effects and refs
 * @output useHotkeys hook and Hotkey interface for global keyboard shortcuts
 * @position Core hook for app-level keyboard shortcuts. `mod` uses the same
 *   isApplePlatform util as Kbd, so shown and handled shortcuts agree.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/useHotkeys.doc.mjs
 */

import {useEffect, useRef} from 'react';
import {isApplePlatform} from '../utils/isApplePlatform';
import {isImeKeyEvent} from '../utils/ime';

/**
 * A single keyboard shortcut registration.
 */
export interface Hotkey {
  /**
   * Key combo, e.g. 'mod+k', '?', 'c', 'escape'.
   * 'mod' = ⌘ on macOS, Ctrl elsewhere.
   *
   * Format: '+'-separated modifiers (mod, ctrl, meta, shift, alt) followed
   * by a final key compared case-insensitively against event.key. On Apple
   * platforms (macOS, and iPadOS or iOS with a hardware keyboard), where
   * Option changes the typed character, an 'alt' combo whose final key
   * is a letter, digit, punctuation key or space also matches that key's US
   * position (event.code), whatever the layout, when Option typed a dead key
   * or a non-ASCII character. When Option types a plain ASCII character, the
   * combo matches that character: on a German Mac Option+L types '@', so it
   * fires 'alt+@', not 'alt+l'. On Apple platforms, name punctuation that shift changes
   * with shift: 'alt+shift+/', not 'alt+?'.
   * Named keys: 'escape', 'enter', 'space', 'up', 'down', 'left', 'right'
   * (arrow names map to ArrowUp/ArrowDown/ArrowLeft/ArrowRight).
   * Use 'plus' for a literal '+' key.
   *
   * Shift semantics: when 'shift' is not specified, shift state is ignored,
   * so single letters match regardless of shift. When 'shift' is specified,
   * shiftKey must be pressed and the final key is still compared against
   * event.key — for punctuation that shift transforms (e.g. shift+/ produces
   * '?' on US layouts), prefer registering the produced character instead.
   */
  keys: string;
  /** Called when the combo matches. The event has preventDefault() applied. */
  onPress: (event: KeyboardEvent) => void;
  /**
   * Fire even when focus is in an input/textarea/select/contenteditable.
   * @default false
   */
  allowInInputs?: boolean;
  /** Temporarily disable this hotkey without unregistering it. */
  isDisabled?: boolean;
}

/** Aliases for the final key of a combo, normalized to event.key values. */
const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  return: 'enter',
  plus: '+',
};

/** `event.code` of the punctuation keys, by the character they type unshifted. */
const PUNCTUATION_CODES: Record<string, string> = {
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  ';': 'Semicolon',
  "'": 'Quote',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  '-': 'Minus',
  '=': 'Equal',
  '`': 'Backquote',
};

/**
 * The physical key (`event.code`) that types `key` on a US layout, for a
 * letter, digit or punctuation key; null for any other key.
 */
function physicalKeyCode(key: string): string | null {
  if (key === ' ') {
    return 'Space';
  }
  if (/^[a-z]$/.test(key)) {
    return `Key${key.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(key)) {
    return `Digit${key}`;
  }
  return PUNCTUATION_CODES[key] ?? null;
}

/**
 * A browser may report an Option dead key (Option+E on macOS) with the IME
 * key code 229 although it starts no composition there, so an alt combo may
 * still match it. A dead key that composes text in a field is not this case.
 */
function isOptionDeadKey(event: KeyboardEvent): boolean {
  return event.key === 'Dead' && event.altKey && event.isComposing !== true;
}

/**
 * Whether the event target is a typing surface where global shortcuts
 * should stay silent by default.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Whether a keydown event matches a '+'-separated combo string.
 */
function matchesCombo(
  keys: string,
  event: KeyboardEvent,
  isApple: boolean,
): boolean {
  const parts = keys
    .toLowerCase()
    .split('+')
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return false;
  }

  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));

  const wantsMod = mods.has('mod');
  const wantsCtrl = mods.has('ctrl') || (wantsMod && !isApple);
  const wantsMeta = mods.has('meta') || (wantsMod && isApple);
  const wantsAlt = mods.has('alt');
  const wantsShift = mods.has('shift');

  // Non-shift modifiers must match exactly so 'k' doesn't fire on 'mod+k'.
  if (event.ctrlKey !== wantsCtrl) {
    return false;
  }
  if (event.metaKey !== wantsMeta) {
    return false;
  }
  if (event.altKey !== wantsAlt) {
    return false;
  }
  // Shift is only enforced when specified — see Hotkey.keys docs.
  if (wantsShift && !event.shiftKey) {
    return false;
  }

  const expected = KEY_ALIASES[key] ?? key;
  if (event.key.toLowerCase() === expected) {
    return true;
  }
  // On Apple platforms (macOS, and iPadOS or iOS with a hardware keyboard),
  // Option changes the character a key types: Option+A types "å",
  // Option+1 types "¡", and some keys are dead keys. Elsewhere Alt changes no
  // character, and AltGr (Ctrl+Alt) types letters that must not fire
  // shortcuts.
  const isRewrittenByOption =
    event.key === 'Dead' ||
    (event.key.length === 1 && event.key.charCodeAt(0) > 0x7e);
  return (
    isApple &&
    wantsAlt &&
    isRewrittenByOption &&
    event.code !== '' &&
    event.code === physicalKeyCode(expected)
  );
}

/**
 * Registers global keyboard shortcuts on window.
 *
 * A single keydown listener is attached per hook instance; the hotkey
 * definitions live in a ref, so re-renders update behavior without
 * re-subscribing. First matching hotkey wins per event.
 *
 * Accessibility (WCAG 2.1.4 — Character Key Shortcuts): a shortcut whose
 * combo is a single unmodified character (letter, digit, punctuation or
 * symbol — e.g. 'c' or '/') is easily triggered by accident by speech-input
 * users and keyboard users with motor impairments. If you register one, you
 * MUST also provide at least one of: (a) a way to turn the shortcut off,
 * (b) a way to remap it to include a modifier, or (c) scope it so it is only
 * active while the relevant component has focus. Prefer `mod`-based combos
 * where possible; the `isDisabled` flag can back a user-facing off switch.
 *
 * @param hotkeys - Shortcut registrations to listen for.
 *
 * @example
 * ```
 * useHotkeys([
 *   { keys: 'mod+k', onPress: () => openCommandPalette() },
 *   { keys: 'escape', onPress: () => closePanel(), allowInInputs: true },
 *   { keys: 'c', onPress: () => compose(), isDisabled: isModalOpen },
 * ]);
 * ```
 */
export function useHotkeys(hotkeys: Hotkey[]): void {
  const hotkeysRef = useRef(hotkeys);

  // Keep the latest definitions available to the stable listener.
  useEffect(() => {
    hotkeysRef.current = hotkeys;
  });

  // Syncs a window keydown listener with this mount. The listener runs the
  // first hotkey that matches.
  useEffect(() => {
    const isApple = isApplePlatform();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (isImeKeyEvent(event) && !isOptionDeadKey(event))
      ) {
        return;
      }
      const isTyping = isTypingTarget(event.target);
      for (const hotkey of hotkeysRef.current) {
        if (hotkey.isDisabled) {
          continue;
        }
        if (isTyping && !hotkey.allowInInputs) {
          continue;
        }
        if (matchesCombo(hotkey.keys, event, isApple)) {
          event.preventDefault();
          hotkey.onPress(event);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
