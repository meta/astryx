// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaRateMenu.tsx
 * @input The speeds, the current speed, its texts, and the button props the
 *   speed control builds
 * @output The default export: the menu of speeds behind MediaPlaybackRate's
 *   `variant="menu"`
 * @position Loaded on demand by MediaPlayerControls.tsx, so a page that uses
 *   only the slider variant loads no DropdownMenu code
 */

import type {ComponentProps} from 'react';
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';

export interface MediaRateMenuProps {
  rates: readonly number[];
  rate: number;
  groupLabel: string;
  optionLabel: (rate: number) => string;
  button: ComponentProps<typeof DropdownMenu>['button'];
  onChange: (rate: number) => void;
  onOpenChange: (isOpen: boolean) => void;
}

/**
 * Opens a menu of speeds, with the current one checked.
 */
export default function MediaRateMenu({
  rates,
  rate,
  groupLabel,
  optionLabel,
  button,
  onChange,
  onOpenChange,
}: MediaRateMenuProps) {
  return (
    <DropdownMenu button={button} onOpenChange={onOpenChange}>
      <DropdownMenuRadioGroup
        label={groupLabel}
        value={String(rate)}
        onChange={value => onChange(Number(value))}>
        {rates.map(option => (
          <DropdownMenuRadioItem
            key={option}
            value={String(option)}
            label={optionLabel(option)}
          />
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenu>
  );
}
