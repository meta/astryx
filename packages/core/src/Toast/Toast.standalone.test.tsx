// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Toast.standalone.test.tsx
 * @input A Toast rendered on its own, outside a ToastViewport
 * @output Proves that no live element holds its text and it announces
 *   nothing, while its text stays in the accessibility tree
 * @position Toast's announcement-ownership test for the inline card
 */

import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Toast} from './Toast';

const LIVE = '[role="status"], [role="alert"], [aria-live]';

/** Text in the page's shared live regions, which outlive one render. */
const sharedLiveText = () =>
  [...document.querySelectorAll('[data-astryx-live-region]')]
    .map(region => region.textContent ?? '')
    .join('');

async function nextFrame() {
  await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
}

describe('Toast rendered on its own', () => {
  it.each(['info', 'error'] as const)(
    'holds no live role for a %s card, and keeps its text readable',
    type => {
      render(
        <Toast
          type={type}
          body="Changes saved"
          isAutoHide={false}
          autoHideDuration={0}
          onDismiss={() => {}}
        />,
      );
      const text = screen.getByText('Changes saved');
      expect(text.closest(LIVE)).toBeNull();
      expect(text).toBeVisible();
    },
  );

  // The caller that renders a Toast on its own owns its announcement, so the
  // card does not speak through the shared channel either.
  it('announces nothing for a custom layout', async () => {
    const before = sharedLiveText();
    render(
      <Toast
        type="info"
        body="Upload complete"
        isAutoHide={false}
        autoHideDuration={0}
        onDismiss={() => {}}
        renderContent={({body}) => <span>{body}</span>}
      />,
    );
    await nextFrame();
    await nextFrame();
    expect(screen.getByText('Upload complete').closest(LIVE)).toBeNull();
    expect(sharedLiveText()).toBe(before);
  });
});
