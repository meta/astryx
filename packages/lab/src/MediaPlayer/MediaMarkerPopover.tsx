// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaMarkerPopover.tsx
 * @input A timeline marker's label, its content, and its button
 * @output The default export: the popover that opens a marker's content
 * @position Loaded on demand by MediaPlayerControls.tsx, so a timeline with
 *   no marker content loads no Popover code
 */

import type {ReactElement, ReactNode} from 'react';
import {Popover} from '@astryxdesign/core/Popover';

export interface MediaMarkerPopoverProps {
  label: string;
  content: ReactNode;
  width: number;
  onOpenChange: (isOpen: boolean) => void;
  children: ReactElement;
}

/**
 * Opens a marker's content above its button.
 */
export default function MediaMarkerPopover({
  label,
  content,
  width,
  onOpenChange,
  children,
}: MediaMarkerPopoverProps) {
  return (
    <Popover
      label={label}
      content={content}
      placement="above"
      alignment="center"
      width={width}
      padding={0}
      onOpenChange={onOpenChange}>
      {children}
    </Popover>
  );
}
