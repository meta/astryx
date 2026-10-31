// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BottomSheetSwitcherContext.ts
 * @input Uses React context
 * @output Internal phase, lifecycle, and host-dialog context shared by BottomSheetSwitcher and BottomSheet
 * @position Private coordination layer for mutually exclusive BottomSheets
 *
 * Every child sheet renders its own native `<dialog>`; the switcher's only
 * element is a flow wrapper. This context carries the phase machine, the
 * host-dialog selection, and the switcher's dialog-level props and handlers
 * down to those sheet hosts.
 */

import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  SyntheticEvent,
} from 'react';
import {createContext} from 'react';
import type {BaseProps} from '../BaseProps';
import type {DialogPurpose} from '../Dialog';
import type {BottomSheetStackView} from './bottomSheetStack';

export type BottomSheetSwitcherPhase =
  | 'entering'
  | 'active'
  | 'covered'
  | 'aligning'
  | 'fading'
  | 'exiting'
  | 'hidden';

export interface BottomSheetSwitcherTransitionEvent {
  sheetId: string;
  phase: 'entering' | 'aligning' | 'fading' | 'exiting';
}

/**
 * The switcher's own dialog surface, applied by every sheet host. `ref` is not
 * part of it: the switcher resolves its ref to the host sheet's dialog, and
 * the single-instance attributes (`id`, `data-testid`) render there only.
 */
export type BottomSheetSwitcherDialogProps = Omit<
  BaseProps<HTMLDialogElement>,
  'onClick' | 'onKeyDown'
>;

export interface BottomSheetSwitcherContextValue {
  activeSheet: string | null;
  hasScrim: boolean;
  onActiveSheetChange: (sheetId: string | null) => void;
  getSheetPhase: (sheetId: string) => BottomSheetSwitcherPhase;
  getSheetAlignmentOffset: (sheetId: string) => number;
  /**
   * The sheet whose dialog hosts the flow: the active sheet, the exiting
   * sheet through its exit, and the last host (or the first mounted sheet)
   * while the flow is closed. The switcher's ref and its single-instance
   * attributes resolve to this sheet's dialog.
   */
  hostSheet: string | null;
  /**
   * Whether this sheet's dialog paints the flow's one scrim right now. During
   * a handoff the retained sheet keeps it, so the entering dialog's backdrop
   * stays transparent above the still-visible previous panel.
   */
  isScrimOwner: (sheetId: string) => boolean;
  /** The flow is closing: the owning backdrop fades out on the exit curve. */
  isFlowClosing: boolean;
  registerSheetElement: (sheetId: string, element: HTMLElement | null) => void;
  registerSheetDialog: (
    sheetId: string,
    dialog: HTMLDialogElement | null,
  ) => void;
  registerSheetPurpose: (
    sheetId: string,
    purpose: DialogPurpose | null,
  ) => void;
  /**
   * Called by a sheet host just before it presents its dialog modally, so the
   * switcher can remember the page element that opened the flow.
   */
  onBeforeSheetPresent: (sheetId: string) => void;
  /**
   * Whether a modal sheet dialog that is already open sits beneath another
   * open sheet dialog in the top layer, so it must re-present to become the
   * topmost layer again.
   */
  isCoveredInTopLayer: (sheetId: string) => boolean;
  onSheetEnterStart: (sheetId: string) => void;
  onSheetTransitionComplete: (
    event: BottomSheetSwitcherTransitionEvent,
  ) => void;
  onSheetScrimOpacityChange: (sheetId: string, opacity: number) => void;
  /**
   * The switcher's place in the stack of presented modal sheets. The whole
   * switcher is one level; each step's positioner recedes by this view.
   */
  stackView: BottomSheetStackView;
  /** Consumer dialog props the switcher forwards to every sheet dialog. */
  dialogProps: BottomSheetSwitcherDialogProps;
  onDialogCancel: (event: SyntheticEvent<HTMLDialogElement>) => void;
  onDialogClick: (event: ReactMouseEvent<HTMLDialogElement>) => void;
  onDialogKeyDown: (event: ReactKeyboardEvent<HTMLDialogElement>) => void;
}

export const BottomSheetSwitcherContext =
  createContext<BottomSheetSwitcherContextValue | null>(null);

BottomSheetSwitcherContext.displayName = 'BottomSheetSwitcherContext';
