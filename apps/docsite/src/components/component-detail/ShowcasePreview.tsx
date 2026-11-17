// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useState, type ComponentType} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Center} from '@astryxdesign/core/Center';
import {Text} from '@astryxdesign/core/Text';
import {Spinner} from '@astryxdesign/core/Spinner';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {showcaseRegistry} from '../../generated/showcaseRegistry';
import {preventPreviewNavigation} from './previewNavigation';

// The hero card has no padding, so each inline edge of the stage holds a
// gutter. A showcase that can shrink stops at the gutters. A showcase that
// cannot shrink takes the gutters' space first. It stays centered, and the
// stage scrolls only when the showcase is wider than the card. The gutters'
// shrink factors add up to 1, so together they can give up all their space.
const styles = stylex.create({
  stage: {
    '::before': {
      content: '""',
      flexGrow: 0,
      flexShrink: 0.5,
      flexBasis: spacingVars['--spacing-4'],
      minWidth: 0,
    },
    '::after': {
      content: '""',
      flexGrow: 0,
      flexShrink: 0.5,
      flexBasis: spacingVars['--spacing-4'],
      minWidth: 0,
    },
  },
});

interface ShowcasePreviewProps {
  name: string;
}

export function ShowcasePreview({name}: ShowcasePreviewProps) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState(false);
  const isSmall = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    const loader = showcaseRegistry[name];
    if (!loader) {
      setError(true);
      return;
    }
    loader()
      .then(mod => setComponent(() => mod.default))
      .catch(() => setError(true));
  }, [name]);

  const previewNavigationProps =
    name === 'SideNav' ? {onClickCapture: preventPreviewNavigation} : {};

  const placeholderStyle = isSmall
    ? {minHeight: 160, width: '100%'}
    : {aspectRatio: '16 / 9', width: '100%'};

  if (error) {
    return (
      <Center style={placeholderStyle}>
        <Text type="supporting" color="secondary">
          Preview not available
        </Text>
      </Center>
    );
  }

  if (!Component) {
    return (
      <Center style={placeholderStyle}>
        <Spinner size="md" />
      </Center>
    );
  }

  if (isSmall) {
    return (
      <div
        {...stylex.props(styles.stage)}
        style={{
          width: '100%',
          overflow: 'auto',
          minHeight: 160,
          display: 'flex',
          alignItems: 'center',
          // `safe center` centers the preview when it fits but falls back to
          // start alignment when it overflows the frame, so a showcase wider
          // than the viewport isn't pushed into the unscrollable negative
          // gutter and clipped at its leading edge.
          justifyContent: 'safe center',
        }}
        {...previewNavigationProps}>
        <div
          style={{
            // `fit-content` would size the wrapper to the whole stage and
            // leave the gutters no space. The high shrink factor makes the
            // wrapper shrink before the gutters do.
            minWidth: 'min-content',
            flexShrink: 1000,
          }}>
          <Component />
        </div>
      </div>
    );
  }

  return (
    <div
      {...stylex.props(styles.stage)}
      style={{
        width: '100%',
        aspectRatio: '16 / 9',
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        // See the small-viewport branch above: `safe center` keeps the leading
        // edge reachable when a preview overflows instead of clipping it.
        justifyContent: 'safe center',
      }}
      {...previewNavigationProps}>
      <Component />
    </div>
  );
}
