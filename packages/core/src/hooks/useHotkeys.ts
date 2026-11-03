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
   * Key combo, e.g. 'mod+k', 'shift+/', 'c', 'escape'.
   * 'mod' = ⌘ on macOS, Ctrl elsewhere.
   *
   * Format: '+'-separated modifiers (mod, ctrl, meta, shift, alt) followed
   * by a final key compared case-insensitively against event.key.
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
  return event.key.toLowerCase() === expected;
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

  useEffect(() => {
    const isApple = isApplePlatform();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isImeKeyEvent(event)) {
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
