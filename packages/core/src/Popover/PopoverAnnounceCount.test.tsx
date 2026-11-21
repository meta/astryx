// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverAnnounceCount.test.tsx
 * @input usePopover opened and reopened from code, with the announcer
 *   replaced by a spy
 * @output Tests that a popover opened from code announces its name once for
 *   each open
 * @position Colocated with usePopover.tsx; PopoverAnnounce.test.tsx reads the
 *   real live regions
 */

import {useEffect, useState} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import type * as UseAnnounceModule from '../hooks/useAnnounce';
import {usePopover} from './usePopover';

const announce = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useAnnounce', async importOriginal => ({
  ...(await importOriginal<typeof UseAnnounceModule>()),
  useAnnounce: () => announce,
}));

afterEach(() => {
  announce.mockClear();
});

function Tip() {
  const [isShown, setIsShown] = useState(true);
  const [count, setCount] = useState(0);
  const popover = usePopover({
    dialogLabel: 'Tip: filters live here',
    hasAutoFocus: false,
    hasLightDismiss: false,
  });
  const {show, hide} = popover;
  useEffect(() => {
    if (isShown) {
      show();
    } else {
      hide();
    }
  }, [isShown, show, hide]);
  return (
    <>
      <button type="button" ref={popover.triggerRef}>
        Filters
      </button>
      <button type="button" onClick={() => setIsShown(shown => !shown)}>
        Toggle from code
      </button>
      <button type="button" onClick={() => setCount(value => value + 1)}>
        Render again {count}
      </button>
      {popover.render(<button type="button">Got it</button>)}
    </>
  );
}

// The announcement waits two frames for initial focus.
async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 120));
  });
}

describe('usePopover announcement count (AR4)', () => {
  it('announces once for an open from code, and not again when it renders', async () => {
    render(<Tip />);
    await waitFor(() => expect(announce).toHaveBeenCalledOnce());
    expect(announce).toHaveBeenCalledWith('Tip: filters live here', 'polite');
    fireEvent.click(screen.getByRole('button', {name: /Render again/}));
    await settle();
    expect(announce).toHaveBeenCalledOnce();
  });

  it('announces again when code closes it and opens it again', async () => {
    render(<Tip />);
    await waitFor(() => expect(announce).toHaveBeenCalledOnce());
    const toggle = screen.getByRole('button', {name: 'Toggle from code'});
    fireEvent.click(toggle);
    await settle();
    expect(announce).toHaveBeenCalledOnce();
    fireEvent.click(toggle);
    await waitFor(() => expect(announce).toHaveBeenCalledTimes(2));
    await settle();
    expect(announce).toHaveBeenCalledTimes(2);
  });
});
