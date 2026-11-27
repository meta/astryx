// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tour.announcement.test.tsx
 * @input Tour, with the shared announcer replaced by a recorder
 * @output Tests that Tour announces a step once for each start, politely, and
 *   only when focus stays where the person placed it; hidden words are left
 *   out, and words on two lines stay apart
 * @position Lab test for Tour's own announcement Effect
 */

import {StrictMode, useRef, useState} from 'react';
import {beforeEach, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';

const announce = vi.hoisted(() => vi.fn());

// A new function at each render, so a render alone gives Tour's Effect a
// reason to run again.
vi.mock('@astryxdesign/core/hooks', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAnnounce:
    () =>
    (...args: unknown[]) =>
      announce(...args),
}));

const {Tour} = await import('./Tour');

function Page({initialId = null}: {initialId?: string | null}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [renders, setRenders] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setActiveId('save')}>
        Start
      </button>
      <button type="button" onClick={() => setRenders(count => count + 1)}>
        Render again {renders}
      </button>
      <button type="button" ref={anchorRef}>
        Save
      </button>
      <Tour
        steps={[
          {
            id: 'save',
            anchorRef,
            title: (
              <>
                <span aria-hidden="true">★</span> Save
                <br />
                your work
              </>
            ),
          },
        ]}
        activeId={activeId}
        onActiveIdChange={setActiveId}
        onEnd={() => setActiveId(null)}
      />
    </>
  );
}

beforeEach(() => {
  announce.mockClear();
});

it('announces a step once for each start, politely, with the words of its title that are not hidden, each line apart', async () => {
  render(<Page />);
  // Focus that the person placed outside the tour stays there, so the step
  // is announced.
  const start = screen.getByRole('button', {name: 'Start'});
  act(() => start.focus());
  fireEvent.click(start);
  await waitFor(() => expect(announce).toHaveBeenCalledTimes(1));
  expect(announce).toHaveBeenCalledWith('Save your work', 'polite');

  // A later render of the same step says nothing more.
  fireEvent.click(screen.getByRole('button', {name: /Render again/}));
  fireEvent.click(screen.getByRole('button', {name: /Render again/}));
  await act(async () => {});
  expect(announce).toHaveBeenCalledTimes(1);

  fireEvent.click(
    screen.getByRole('button', {name: 'Close tour', hidden: true}),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog', {hidden: true})).toBeNull(),
  );
  act(() => start.focus());
  fireEvent.click(start);
  await waitFor(() => expect(announce).toHaveBeenCalledTimes(2));
});

it('announces a step once under React StrictMode', async () => {
  render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
  const start = screen.getByRole('button', {name: 'Start'});
  act(() => start.focus());
  fireEvent.click(start);
  await waitFor(() => expect(announce).toHaveBeenCalled());
  await act(async () => {});
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith('Save your work', 'polite');
});

it('announces nothing for a step that takes focus', async () => {
  render(<Page initialId="save" />);
  await waitFor(() =>
    expect(screen.getByRole('heading', {hidden: true})).toHaveFocus(),
  );
  await act(async () => {});
  expect(announce).not.toHaveBeenCalled();
});
