// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TokenFocusHandoff.tsx
 * @input A link Token's rendered structure
 * @output Exports TokenFocusHandoff, which keeps focus when a link Token's
 *   structure is replaced, and TokenLinkLabel and TokenRemoveButton, the parts
 *   that report focus to it
 * @position Internal to Token; keeps Token.tsx presentational
 *
 * Token is a presentational component (see
 * /internal/eslint-plugin-astryx/presentational-component.js) and must not use
 * refs or effects. A link Token replaces its structure when `isDisabled`
 * changes: the link becomes a plain anchor, or a button when the Token has
 * `onClick` or sits in a trigger, and the Remove button is replaced with it.
 * TokenFocusHandoff stays in place above that structure and holds the refs
 * that hand focus from the old label and Remove button to the new ones.
 */

import {
  createContext,
  use,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {useFocusAcrossSwap} from '../utils/useFocusAcrossSwap';

type FocusHandoffRef<T extends HTMLElement> = (
  node: T | null,
) => (() => void) | undefined;

const TokenFocusHandoffContext = createContext<{
  labelRef: FocusHandoffRef<HTMLSpanElement>;
  removeButtonRef: FocusHandoffRef<HTMLButtonElement>;
} | null>(null);
TokenFocusHandoffContext.displayName = 'TokenFocusHandoffContext';

/**
 * The control a label sits in, when that control belongs to the same Token.
 * A router link can keep no ref. The label stays in the Token, so the hook
 * finds the control from it.
 */
function tokenControlOfLabel(label: HTMLElement): HTMLElement | null {
  const control = label.closest<HTMLElement>(
    'a, button, [role="link"], [role="button"]',
  );
  const token = label.closest('.astryx-token');
  return control != null &&
    token != null &&
    control.closest('.astryx-token') === token
    ? control
    : null;
}

/** Holds a link Token's focus handoff across a structure replacement. */
export function TokenFocusHandoff({children}: {children: ReactNode}) {
  const labelRef = useFocusAcrossSwap<HTMLSpanElement>(undefined, {
    getFocusTarget: tokenControlOfLabel,
  });
  const removeButtonRef = useFocusAcrossSwap<HTMLButtonElement>();
  const handoff = useMemo(
    () => ({labelRef, removeButtonRef}),
    [labelRef, removeButtonRef],
  );
  return (
    <TokenFocusHandoffContext value={handoff}>
      {children}
    </TokenFocusHandoffContext>
  );
}

/** A link Token's label; it hands focus to the Token's new control. */
export function TokenLinkLabel(props: Omit<ComponentProps<'span'>, 'ref'>) {
  const handoff = use(TokenFocusHandoffContext);
  return <span ref={handoff?.labelRef} {...props} />;
}

/** A link Token's Remove button; it hands focus to the new Remove button. */
export function TokenRemoveButton(
  props: Omit<ComponentProps<'button'>, 'ref'>,
) {
  const handoff = use(TokenFocusHandoffContext);
  return <button type="button" ref={handoff?.removeButtonRef} {...props} />;
}
