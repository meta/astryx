// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Show a decorative preview that the build rendered to static HTML.
 * @input A preview id from previewSnapshotSources.tsx.
 * @output The preview markup. It ships no client JavaScript and follows the
 *   page's light or dark mode through CSS variables.
 * @position Server component. Pass it to a client component as a prop. A
 *   client module that imports it puts every snapshot in its bundle.
 */

import type {CSSProperties} from 'react';
import {PREVIEW_SNAPSHOTS} from '@/generated/previewSnapshots';
import previewSurface from '../../../components/TemplatePreviewSurface.module.css';
import styles from './FrozenPreview.module.css';

export function FrozenPreview({
  id,
  fillHeight = false,
  className,
  style,
}: {
  id: string;
  /** Stretch the preview's root to the full height of its box, as the live
   *  template preview surface does. */
  fillHeight?: boolean;
  /** Styles for the element that holds the snapshot, so it can be the
   *  caller's own layout box instead of an extra wrapper. */
  className?: string;
  style?: CSSProperties;
}) {
  const html = PREVIEW_SNAPSHOTS[id];
  if (html == null) {
    throw new Error(
      `No preview snapshot "${id}". Add it to previewSnapshotSources.tsx.`,
    );
  }
  return (
    <div
      className={[
        styles.snapshot,
        fillHeight && previewSurface.snapshotHost,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      dangerouslySetInnerHTML={{__html: html}}
    />
  );
}
