// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LightboxFilmstrip.tsx
 * @input A Lightbox's gallery, through useLightboxGallery
 * @output LightboxFilmstrip: a row of tiles, one per item; a pick moves there
 * @position Goes in a Lightbox's `footer`. Each tile shows the item's
 *   `thumbnail`, or an image's `src`, else its name.
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars, radiusVars, spacingVars} from '../theme/tokens.stylex';
import {Text} from '../Text/Text';
import {useLightboxGallery} from './LightboxContext';
import type {LightboxItem} from './Lightbox';

const styles = stylex.create({
  strip: {
    display: 'flex',
    gap: spacingVars['--spacing-2'],
    justifyContent: 'center',
    overflowX: 'auto',
    maxWidth: '100%',
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
  },
  tile: {
    flexShrink: 0,
    width: 56,
    height: 56,
    padding: 0,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: radiusVars['--radius-element'],
    overflow: 'hidden',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-on-light']} 60%, transparent)`,
    opacity: 0.6,
  },
  tileCurrent: {
    borderColor: colorVars['--color-on-dark'],
    opacity: 1,
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  name: {
    paddingInline: spacingVars['--spacing-1'],
  },
});

function nameOf(item: LightboxItem): string {
  return item.title || (item.type === 'custom' ? item.label : item.alt);
}

function thumbnailOf(item: LightboxItem): string | undefined {
  if (item.thumbnail != null) {
    return item.thumbnail;
  }
  return item.type === 'custom' || item.type === 'video' ? undefined : item.src;
}

/** Every item of the open gallery as a tile; a pick moves to that item. */
export function LightboxFilmstrip() {
  const {items, index, setIndex} = useLightboxGallery();
  return (
    <div {...stylex.props(styles.strip)}>
      {items.map((item, i) => {
        const thumbnail = thumbnailOf(item);
        return (
          <button
            // The items keep their order while the viewer is open.
            // eslint-disable-next-line @eslint-react/no-array-index-key
            key={i}
            type="button"
            aria-label={nameOf(item)}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => setIndex(i)}
            {...stylex.props(styles.tile, i === index && styles.tileCurrent)}>
            {thumbnail != null ? (
              <img
                src={thumbnail}
                alt=""
                draggable={false}
                {...stylex.props(styles.image)}
              />
            ) : (
              <Text
                as="span"
                type="supporting"
                maxLines={2}
                xstyle={styles.name}>
                {nameOf(item)}
              </Text>
            )}
          </button>
        );
      })}
    </div>
  );
}

LightboxFilmstrip.displayName = 'LightboxFilmstrip';
