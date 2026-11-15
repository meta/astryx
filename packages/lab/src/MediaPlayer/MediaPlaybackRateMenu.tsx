// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaPlaybackRateMenu.tsx
 * @input The nearest MediaPlayer's playback speed, plus speeds, size, style,
 *   and DOM props
 * @output Exports `MediaPlaybackRateMenu`, a button that opens a menu of
 *   speeds, and its props
 * @position Lab media part in its own module, so a page that uses only
 *   MediaPlaybackRate does not load DropdownMenu
 */

import type {Ref} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';
import {mergeProps, themeProps} from '@astryxdesign/core/utils';
import {
  DEFAULT_PLAYBACK_RATES,
  useMediaPlayerContext,
  useMediaSelector,
} from './MediaPlayerContext';
import {
  rateButtonXstyle,
  useRateLabel,
  type MediaControlSize,
} from './MediaPlayerControls';

const styles = stylex.create({
  group: {
    display: 'grid',
    alignItems: 'center',
    // In a flex row the timeline gives up the space first.
    flexShrink: 0,
  },
});

export interface MediaPlaybackRateMenuProps extends Omit<
  BaseProps<HTMLDivElement>,
  'children'
> {
  /**
   * Speeds offered, in order. Defaults to 0.5, 0.75, 1, 1.25, 1.5, 1.75, and
   * 2, the same speeds the `<` and `>` shortcuts step through.
   */
  rates?: readonly number[];
  /** Control height. Follows the surrounding size, else `'md'`. */
  size?: MediaControlSize;
  /** Ref to the group element. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * Playback speed as a menu. The button names the current speed and keeps one
 * width at every speed; it opens a menu of speeds with the current one
 * checked. The menu keeps the controls visible while it is open.
 *
 * @example
 * ```
 * <MediaPlaybackRateMenu />
 * <MediaPlaybackRateMenu rates={[0.75, 1, 1.25, 1.5, 2]} />
 * ```
 */
export function MediaPlaybackRateMenu({
  rates = DEFAULT_PLAYBACK_RATES,
  size,
  xstyle,
  className,
  style,
  ...rest
}: MediaPlaybackRateMenuProps) {
  const {store, holdControls} = useMediaPlayerContext('MediaPlaybackRateMenu');
  const rate = useMediaSelector(
    'MediaPlaybackRateMenu',
    state => state.playbackRate,
  );
  const text = useRateLabel();
  return (
    <div
      {...rest}
      {...mergeProps(
        mergeProps(
          themeProps('media-playback-rate-menu'),
          stylex.props(styles.group, xstyle),
        ),
        {className, style},
      )}>
      <DropdownMenu
        button={{
          label: text.label(rate),
          'aria-label': text.name(rate),
          tooltip: text.tooltip,
          variant: 'ghost',
          size,
          xstyle: rateButtonXstyle,
          ...themeProps('media-playback-rate-button'),
        }}
        onOpenChange={isOpen => holdControls('menu', isOpen)}>
        <DropdownMenuRadioGroup
          label={text.tooltip}
          value={String(rate)}
          onChange={value => store.actions.setPlaybackRate(Number(value))}>
          {rates.map(option => (
            <DropdownMenuRadioItem
              key={option}
              value={String(option)}
              label={text.label(option)}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenu>
    </div>
  );
}

MediaPlaybackRateMenu.displayName = 'MediaPlaybackRateMenu';
