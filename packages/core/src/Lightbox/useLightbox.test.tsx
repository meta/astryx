// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useLightbox.test.tsx
 * @input Uses vitest, @testing-library/react, useLightbox hook
 * @output Unit tests for lightbox open/close state and trigger props
 * @position Testing; validates useLightbox.tsx implementation
 *
 * SYNC: When useLightbox.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  renderHook,
  act,
} from '@testing-library/react';
import {useLightbox} from './useLightbox';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';

// jsdom doesn't implement dialog.showModal/close.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

// Lightbox announces gallery navigation through the singleton live regions
// useAnnounce mounts on <body>; reset them so nothing leaks between tests.
afterEach(() => {
  __resetLiveRegionsForTest();
});

// Module scope so the reference stays stable across rerenders.
const photos = [
  {src: '/p1.jpg', alt: 'Photo 1'},
  {src: '/p2.jpg', alt: 'Photo 2'},
  {src: '/p3.jpg', alt: 'Photo 3'},
  {src: '/p4.jpg', alt: 'Photo 4'},
];

/** Renders both trigger flavors plus the lightbox element itself. */
function Gallery() {
  const lightbox = useLightbox({media: photos});

  return (
    <div>
      <span data-testid="status">{lightbox.isOpen ? 'open' : 'closed'}</span>
      <span data-testid="index">{lightbox.index}</span>
      <span data-testid="shared" {...lightbox.triggerProps}>
        Open gallery
      </span>
      {photos.map((photo, i) => (
        <img
          key={photo.src}
          src={photo.src}
          alt={`thumb ${i}`}
          data-testid={`thumb-${i}`}
          {...lightbox.getTriggerProps(i)}
        />
      ))}
      {lightbox.element}
    </div>
  );
}

describe('useLightbox — state', () => {
  it('starts closed at the first item', () => {
    const {result} = renderHook(() => useLightbox({media: photos}));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.index).toBe(0);
  });

  it('opens at the first item when open() is called without an index', () => {
    const {result} = renderHook(() => useLightbox({media: photos}));

    act(() => result.current.open(2));
    act(() => result.current.close());
    // A bare open() resets to the start rather than reusing the last index.
    act(() => result.current.open());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.index).toBe(0);
  });

  it('opens at the requested index', () => {
    const {result} = renderHook(() => useLightbox({media: photos}));

    act(() => result.current.open(2));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.index).toBe(2);
  });

  it('close() closes without rewinding the index', () => {
    const {result} = renderHook(() => useLightbox({media: photos}));

    act(() => result.current.open(3));
    act(() => result.current.close());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.index).toBe(3);
  });

  // The `if (!nextOpen)` guard in the hook's onOpenChange is deliberately not
  // covered: Lightbox only ever reports `false`, so the ignored-`true` path is
  // unreachable through the public surface. Reaching into the element's props
  // to force it would assert a value that is already settled, and it can only
  // be exercised for real once something emits `true`.
});

describe('useLightbox — trigger props', () => {
  it('gives the trigger button semantics', () => {
    render(<Gallery />);
    const trigger = screen.getByTestId('shared');
    expect(trigger).toHaveAttribute('role', 'button');
    expect(trigger).toHaveAttribute('tabindex', '0');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('gives every indexed trigger the same button semantics', () => {
    render(<Gallery />);
    const trigger = screen.getByTestId('thumb-2');
    expect(trigger).toHaveAttribute('role', 'button');
    expect(trigger).toHaveAttribute('tabindex', '0');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('opens at the first item when the shared trigger is clicked', () => {
    render(<Gallery />);
    fireEvent.click(screen.getByTestId('shared'));
    expect(screen.getByTestId('status').textContent).toBe('open');
    expect(screen.getByTestId('index').textContent).toBe('0');
  });

  it('opens on Enter and swallows the key press', () => {
    render(<Gallery />);
    const notDefaultPrevented = fireEvent.keyDown(
      screen.getByTestId('shared'),
      {
        key: 'Enter',
      },
    );
    expect(notDefaultPrevented).toBe(false);
    expect(screen.getByTestId('status').textContent).toBe('open');
  });

  it('opens on Space and swallows the key press', () => {
    render(<Gallery />);
    const notDefaultPrevented = fireEvent.keyDown(
      screen.getByTestId('shared'),
      {
        key: ' ',
      },
    );
    expect(notDefaultPrevented).toBe(false);
    expect(screen.getByTestId('status').textContent).toBe('open');
  });

  it('leaves other keys alone', () => {
    render(<Gallery />);
    for (const key of ['a', 'Tab', 'ArrowRight', 'Escape']) {
      const notDefaultPrevented = fireEvent.keyDown(
        screen.getByTestId('shared'),
        {key},
      );
      expect(notDefaultPrevented).toBe(true);
      expect(screen.getByTestId('status').textContent).toBe('closed');
    }
  });

  it('opens at the trigger index when an indexed trigger is clicked', () => {
    render(<Gallery />);
    fireEvent.click(screen.getByTestId('thumb-2'));
    expect(screen.getByTestId('status').textContent).toBe('open');
    expect(screen.getByTestId('index').textContent).toBe('2');
  });

  it('opens at the trigger index on Enter and swallows the key press', () => {
    render(<Gallery />);
    const notDefaultPrevented = fireEvent.keyDown(
      screen.getByTestId('thumb-3'),
      {key: 'Enter'},
    );
    expect(notDefaultPrevented).toBe(false);
    expect(screen.getByTestId('index').textContent).toBe('3');
  });

  it('opens at the trigger index on Space and swallows the key press', () => {
    render(<Gallery />);
    const notDefaultPrevented = fireEvent.keyDown(
      screen.getByTestId('thumb-1'),
      {key: ' '},
    );
    expect(notDefaultPrevented).toBe(false);
    expect(screen.getByTestId('index').textContent).toBe('1');
  });

  it('leaves other keys alone on an indexed trigger', () => {
    render(<Gallery />);
    const notDefaultPrevented = fireEvent.keyDown(
      screen.getByTestId('thumb-1'),
      {key: 'a'},
    );
    expect(notDefaultPrevented).toBe(true);
    expect(screen.getByTestId('status').textContent).toBe('closed');
  });
});

describe('useLightbox — element wiring', () => {
  it('keeps the lightbox closed until a trigger fires', () => {
    render(<Gallery />);
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');
  });

  it('shows the media for the index the trigger opened', () => {
    render(<Gallery />);
    fireEvent.click(screen.getByTestId('thumb-2'));

    const dialog = document.querySelector('dialog')!;
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByAltText('Photo 3')).toBeInTheDocument();
    expect(screen.queryByAltText('Photo 1')).toBeNull();
  });

  it('closes when the lightbox close button is pressed', () => {
    render(<Gallery />);
    fireEvent.click(screen.getByTestId('thumb-2'));

    fireEvent.click(screen.getByRole('button', {name: 'Close'}));

    expect(screen.getByTestId('status').textContent).toBe('closed');
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');
  });

  it('follows the index when the lightbox navigates', () => {
    render(<Gallery />);
    fireEvent.click(screen.getByTestId('thumb-2'));

    fireEvent.click(screen.getByRole('button', {name: 'Next'}));

    expect(screen.getByTestId('index').textContent).toBe('3');
    expect(screen.getByAltText('Photo 4')).toBeInTheDocument();
  });

  it('reopens at a new index after closing', () => {
    render(<Gallery />);
    fireEvent.click(screen.getByTestId('thumb-0'));
    fireEvent.click(screen.getByRole('button', {name: 'Close'}));

    fireEvent.click(screen.getByTestId('thumb-3'));

    expect(screen.getByTestId('index').textContent).toBe('3');
    expect(screen.getByAltText('Photo 4')).toBeInTheDocument();
  });
});
