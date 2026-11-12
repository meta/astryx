// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Show a decorative preview that the build rendered to static HTML.
 * @input A preview id from previewSnapshotSources.tsx.
 * @output The preview markup. It ships no client JavaScript and follows the
 *   page's light or dark mode through CSS variables.
 * @position Server component. Pass it to a client component as a prop. A
 *   client module that imports it puts every snapshot in its bundle.
 */

import {PREVIEW_SNAPSHOTS} from '@/generated/previewSnapshots';
import styles from './FrozenPreview.module.css';

export function FrozenPreview({
  id,
  fillHeight = false,
}: {
  id: string;
  /** Stretch the preview's root to the full height of its box. */
  fillHeight?: boolean;
}) {
  const html = PREVIEW_SNAPSHOTS[id];
  if (html == null) {
    throw new Error(
      `No preview snapshot "${id}". Add it to previewSnapshotSources.tsx.`,
    );
  }
  return (
    <div
      className={
        fillHeight ? `${styles.snapshot} ${styles.fill}` : styles.snapshot
      }
      dangerouslySetInnerHTML={{__html: html}}
    />
  );
}
