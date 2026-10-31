// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Preview only (do not merge): the shared pager under a laptop's fine
 * pointer, so a trackpad's two-finger swipe can be tried live. Carousel
 * attaches the pager only under a coarse pointer, and Lightbox has none yet.
 */

import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {usePager} from '../../../packages/core/src/hooks/usePager';

const PAGES = ['Photo 1', 'Photo 2', 'Photo 3', 'Photo 4', 'Photo 5'];
const TINTS = [
  'var(--color-background-blue)',
  'var(--color-background-green)',
  'var(--color-background-orange)',
  'var(--color-background-purple)',
  'var(--color-background-red)',
];

function PagerPreview() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  usePager({viewportRef, trackRef, count: PAGES.length, gap: 0, onIndexChange: setIndex});
  return (
    <div style={{maxWidth: 560}}>
      <div
        ref={viewportRef}
        style={{overflow: 'hidden', height: 280, borderRadius: 12, overscrollBehaviorX: 'contain'}}>
        <div ref={trackRef} style={{display: 'flex', height: '100%'}}>
          {PAGES.map((page, i) => (
            <div
              key={page}
              style={{
                flex: '0 0 100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 700,
                background: TINTS[i],
              }}>
              {page}
            </div>
          ))}
        </div>
      </div>
      <p style={{textAlign: 'center'}}>
        Photo {index + 1} of {PAGES.length}: swipe two fingers sideways, one photo per swipe.
      </p>
    </div>
  );
}

const meta: Meta<typeof PagerPreview> = {
  title: 'Preview/Trackpad step pager',
  component: PagerPreview,
};
export default meta;

export const Default: StoryObj<typeof PagerPreview> = {
  render: () => <PagerPreview />,
};
