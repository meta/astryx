// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaMarkerPopover.tsx
 * @input A timeline marker's button (by ref), its label, content and width,
 *   and its open state
 * @output The default export: the popover that opens a marker's content from
 *   the marker's own button
 * @position Loaded on demand by MediaPlayerControls.tsx, so a timeline with
 *   no marker content loads no Popover code. The button renders there, before
 *   this module loads, and this popover attaches to it.
 */

import type {ReactNode, RefObject} from 'react';
import {Popover} from '@astryxdesign/core/Popover';

export interface MediaMarkerPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  content: ReactNode;
  width: number;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

/**
 * Opens a marker's content above its button.
 */
export default function MediaMarkerPopover({
  anchorRef,
  label,
  content,
  width,
  isOpen,
  onOpenChange,
}: MediaMarkerPopoverProps) {
  return (
    <Popover
      // Popover's prop type predates nullable refs; it reads the ref after
      // mount and skips a null one.
      anchorRef={anchorRef as RefObject<HTMLElement>}
      label={label}
      content={content}
      placement="above"
      alignment="center"
      width={width}
      padding={0}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    />
  );
}
