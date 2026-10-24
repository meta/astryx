// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import {Profiler} from 'react';
import {Lightbox} from './Lightbox';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {InternationalizationProvider} from '../i18n';

// Mock showModal/close for jsdom
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

// useAnnounce mounts singleton live regions on <body>; reset between tests so
// stale announcements from one test don't leak into the next.
afterEach(() => {
  __resetLiveRegionsForTest();
});

function politeRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="polite"]');
}

// Both position messages, supplied by the test. Overriding the pair means an
// assertion also proves which of the two keys the component reached for.
const POSITION_MESSAGES = {
  fr: {
    '@astryx.lightbox.mediaPosition':
      '{alt}, vue {index, number} sur {total, number}',
    '@astryx.lightbox.imagePosition':
      'Photo {index, number} sur {total, number}',
  },
};

describe('Lightbox', () => {
  it('renders as a dialog element', () => {
    render(
      <Lightbox
        isOpen={false}
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'Photo'}}
      />,
    );
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('calls showModal when isOpen becomes true', () => {
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'Photo'}}
      />,
    );
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it('renders the image with correct src and alt', () => {
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'A beautiful photo'}}
      />,
    );
    const img = screen.getByAltText('A beautiful photo');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/photo.jpg');
  });

  it('renders caption when provided', () => {
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={() => {}}
        media={{
          src: '/photo.jpg',
          alt: 'Photo',
          caption: 'Sunset over the ocean',
        }}
      />,
    );
    expect(screen.getByText('Sunset over the ocean')).toBeInTheDocument();
  });

  it('does not render caption when not provided', () => {
    const {container} = render(
      <Lightbox
        isOpen={true}
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'Photo'}}
      />,
    );
    expect(container.querySelectorAll('[class*="caption"]').length).toBe(0);
  });

  it('calls onOpenChange(false) when close button is clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={onOpenChange}
        media={{src: '/photo.jpg', alt: 'Photo'}}
      />,
    );
    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange(false) on Escape via cancel event', () => {
    const onOpenChange = vi.fn();
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={onOpenChange}
        media={{src: '/photo.jpg', alt: 'Photo'}}
      />,
    );
    const dialog = document.querySelector('dialog')!;
    const cancelEvent = new Event('cancel', {cancelable: true});
    dialog.dispatchEvent(cancelEvent);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sets aria-label on the dialog', () => {
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'Beach sunset'}}
      />,
    );
    const dialog = document.querySelector('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Beach sunset');
  });

  it('forwards ref to dialog element', () => {
    const ref = {current: null as HTMLDialogElement | null};
    render(
      <Lightbox
        ref={ref}
        isOpen={false}
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'Photo'}}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDialogElement);
  });

  describe('gallery mode', () => {
    const media = [
      {src: '/a.jpg', alt: 'Image A', caption: 'First'},
      {src: '/b.jpg', alt: 'Image B', caption: 'Second'},
      {src: '/c.jpg', alt: 'Image C'},
    ];

    it('renders the image at the given index', () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={1}
        />,
      );
      expect(screen.getByAltText('Image B')).toBeInTheDocument();
    });

    it('shows gallery counter', () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={0}
        />,
      );
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    it('shows prev/next buttons for middle item', () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={1}
        />,
      );
      expect(screen.getByLabelText('Previous')).toBeInTheDocument();
      expect(screen.getByLabelText('Next')).toBeInTheDocument();
    });

    it('keeps prev mounted and disabled on first item', () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={0}
        />,
      );
      // The Prev button stays mounted at the range boundary (disabled) rather
      // than unmounting, so navigating to the first item never removes the
      // focused control and drops focus to <body>.
      const prev = screen.getByLabelText('Previous');
      expect(prev).toBeInTheDocument();
      expect(prev).toBeDisabled();
      expect(screen.getByLabelText('Next')).not.toBeDisabled();
    });

    it('keeps next mounted and disabled on last item', () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={2}
        />,
      );
      const next = screen.getByLabelText('Next');
      expect(next).toBeInTheDocument();
      expect(next).toBeDisabled();
      expect(screen.getByLabelText('Previous')).not.toBeDisabled();
    });

    it('does not drop focus to <body> when navigating to the last item', () => {
      const {rerender} = render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={1}
        />,
      );
      // Simulate arriving at the final item (Next becomes disabled).
      rerender(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={2}
        />,
      );
      // Both nav buttons remain in the DOM; the dialog stays available so
      // keyboard gallery navigation isn't dead-ended.
      expect(screen.getByLabelText('Previous')).toBeInTheDocument();
      expect(screen.getByLabelText('Next')).toBeInTheDocument();
      const dialog = document.querySelector('dialog');
      expect(dialog).toBeInTheDocument();
      // Arrow handling is on the dialog, so navigation still works at the edge.
      const onIndexChange = vi.fn();
      rerender(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={2}
          onIndexChange={onIndexChange}
        />,
      );
      if (dialog instanceof HTMLElement) {
        fireEvent.keyDown(dialog, {key: 'ArrowLeft'});
      }
      expect(onIndexChange).toHaveBeenCalledWith(1);
    });

    it('calls onIndexChange when next is clicked', () => {
      const onIndexChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={0}
          onIndexChange={onIndexChange}
        />,
      );
      fireEvent.click(screen.getByLabelText('Next'));
      expect(onIndexChange).toHaveBeenCalledWith(1);
    });

    it('calls onIndexChange when prev is clicked', () => {
      const onIndexChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={2}
          onIndexChange={onIndexChange}
        />,
      );
      fireEvent.click(screen.getByLabelText('Previous'));
      expect(onIndexChange).toHaveBeenCalledWith(1);
    });

    it('navigates via arrow keys', () => {
      const onIndexChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={1}
          onIndexChange={onIndexChange}
        />,
      );
      const dialog = document.querySelector('dialog')!;
      fireEvent.keyDown(dialog, {key: 'ArrowRight'});
      expect(onIndexChange).toHaveBeenCalledWith(2);
      fireEvent.keyDown(dialog, {key: 'ArrowLeft'});
      expect(onIndexChange).toHaveBeenCalledWith(0);
    });

    it('follows the visual direction of the arrows in RTL', () => {
      const onIndexChange = vi.fn();
      render(
        <div dir="rtl">
          <Lightbox
            isOpen={true}
            onOpenChange={() => {}}
            media={media}
            index={1}
            onIndexChange={onIndexChange}
          />
        </div>,
      );
      const dialog = document.querySelector('dialog')!;
      // The component resolves direction with getComputedStyle at keydown, and
      // jsdom does not inherit `dir` down to it, so set it on the dialog too.
      dialog.style.direction = 'rtl';
      // Next sits on the left in RTL: ArrowLeft moves to the next item.
      fireEvent.keyDown(dialog, {key: 'ArrowLeft'});
      expect(onIndexChange).toHaveBeenLastCalledWith(2);
      fireEvent.keyDown(dialog, {key: 'ArrowRight'});
      expect(onIndexChange).toHaveBeenLastCalledWith(0);
      expect(onIndexChange).toHaveBeenCalledTimes(2);
    });

    it('resolves the direction at keydown, so a direction change applies at once', () => {
      const onIndexChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={1}
          onIndexChange={onIndexChange}
        />,
      );
      const dialog = document.querySelector('dialog')!;
      fireEvent.keyDown(dialog, {key: 'ArrowLeft'});
      expect(onIndexChange).toHaveBeenLastCalledWith(0);
      dialog.style.direction = 'rtl';
      fireEvent.keyDown(dialog, {key: 'ArrowLeft'});
      expect(onIndexChange).toHaveBeenLastCalledWith(2);
    });
  });

  describe('screen-reader announcements', () => {
    const media = [
      {src: '/a.jpg', alt: 'Image A', caption: 'First'},
      {src: '/b.jpg', alt: 'Image B', caption: 'Second'},
      {src: '/c.jpg', alt: 'Image C'},
    ];

    it('announces the new image and position when navigating next via button', async () => {
      render(
        <InternationalizationProvider locale="fr" overrides={POSITION_MESSAGES}>
          <Lightbox
            isOpen={true}
            onOpenChange={() => {}}
            media={media}
            defaultIndex={0}
          />
        </InternationalizationProvider>,
      );
      fireEvent.click(screen.getByLabelText('Next'));
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('Image B, vue 2 sur 3');
      });
    });

    it('announces the new image and position when navigating via arrow keys', async () => {
      render(
        <InternationalizationProvider locale="fr" overrides={POSITION_MESSAGES}>
          <Lightbox
            isOpen={true}
            onOpenChange={() => {}}
            media={media}
            defaultIndex={1}
          />
        </InternationalizationProvider>,
      );
      const dialog = document.querySelector('dialog')!;
      fireEvent.keyDown(dialog, {key: 'ArrowRight'});
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('Image C, vue 3 sur 3');
      });
    });

    it('announces the new image and position when navigating prev', async () => {
      render(
        <InternationalizationProvider locale="fr" overrides={POSITION_MESSAGES}>
          <Lightbox
            isOpen={true}
            onOpenChange={() => {}}
            media={media}
            defaultIndex={2}
          />
        </InternationalizationProvider>,
      );
      fireEvent.click(screen.getByLabelText('Previous'));
      await waitFor(() => {
        expect(politeRegion()?.textContent).toBe('Image B, vue 2 sur 3');
      });
    });

    it('falls back to a positional label when the image has no alt', async () => {
      const unlabeled = [
        {src: '/a.jpg', alt: 'Image A'},
        {src: '/b.jpg', alt: ''},
      ];
      render(
        <InternationalizationProvider locale="fr" overrides={POSITION_MESSAGES}>
          <Lightbox
            isOpen={true}
            onOpenChange={() => {}}
            media={unlabeled}
            defaultIndex={0}
          />
        </InternationalizationProvider>,
      );
      fireEvent.click(screen.getByLabelText('Next'));
      await waitFor(() => {
        // imagePosition, not a mediaPosition with an empty {alt}.
        expect(politeRegion()?.textContent).toBe('Photo 2 sur 2');
      });
    });

    it('does not announce on initial open', async () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          defaultIndex={1}
        />,
      );
      // Allow any scheduled rAF to flush; nothing should have been announced.
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
      // The dialog's aria-label already names the current image on open, so no
      // live region is created (announce is never called).
      expect(politeRegion()).toBeNull();
    });

    it('does not announce when the lightbox opens at a new index', async () => {
      const {rerender} = render(
        <Lightbox
          isOpen={false}
          onOpenChange={() => {}}
          media={media}
          index={0}
        />,
      );
      rerender(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={2}
        />,
      );
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
      expect(politeRegion()).toBeNull();
    });
  });

  describe('keyboard zoom and pan', () => {
    const media = [
      {src: '/a.jpg', alt: 'Image A'},
      {src: '/b.jpg', alt: 'Image B'},
      {src: '/c.jpg', alt: 'Image C'},
    ];

    function zoomTarget(): HTMLElement {
      return screen.getByRole('button', {name: 'Zoom'});
    }

    it('exposes the image as a focusable zoom toggle when hasZoom is on', () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={{src: '/photo.jpg', alt: 'Photo'}}
          hasZoom
        />,
      );
      const target = zoomTarget();
      expect(target).toHaveAttribute('tabindex', '0');
      expect(target).toHaveAttribute('aria-pressed', 'false');
    });

    it('toggles zoom with Enter on the image', () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={{src: '/photo.jpg', alt: 'Photo'}}
          hasZoom
        />,
      );
      const target = zoomTarget();
      fireEvent.keyDown(target, {key: 'Enter'});
      expect(target).toHaveAttribute('aria-pressed', 'true');
      fireEvent.keyDown(target, {key: 'Enter'});
      expect(target).toHaveAttribute('aria-pressed', 'false');
    });

    it('toggles zoom with Space on the image', () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={{src: '/photo.jpg', alt: 'Photo'}}
          hasZoom
        />,
      );
      const target = zoomTarget();
      fireEvent.keyDown(target, {key: ' '});
      expect(target).toHaveAttribute('aria-pressed', 'true');
      fireEvent.keyDown(target, {key: ' '});
      expect(target).toHaveAttribute('aria-pressed', 'false');
    });

    it('zooms in with + and out with - from anywhere in the dialog', () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={{src: '/photo.jpg', alt: 'Photo'}}
          hasZoom
        />,
      );
      const dialog = document.querySelector('dialog')!;
      fireEvent.keyDown(dialog, {key: '+'});
      expect(zoomTarget()).toHaveAttribute('aria-pressed', 'true');
      fireEvent.keyDown(dialog, {key: '-'});
      expect(zoomTarget()).toHaveAttribute('aria-pressed', 'false');
      // `=` (unshifted `+` on most layouts) also zooms in.
      fireEvent.keyDown(dialog, {key: '='});
      expect(zoomTarget()).toHaveAttribute('aria-pressed', 'true');
    });

    it('pans with arrow keys while zoomed instead of navigating the gallery', () => {
      const onIndexChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={1}
          onIndexChange={onIndexChange}
          hasZoom
        />,
      );
      const dialog = document.querySelector('dialog')!;
      fireEvent.keyDown(zoomTarget(), {key: 'Enter'});
      const img = screen.getByAltText('Image B');
      expect(img.getAttribute('style') ?? '').toContain('translate(0px, 0px)');
      // ArrowRight reveals content to the right (image shifts left) and must
      // not fall through to gallery navigation.
      fireEvent.keyDown(dialog, {key: 'ArrowRight'});
      expect(onIndexChange).not.toHaveBeenCalled();
      expect(img.getAttribute('style') ?? '').toContain(
        'translate(-25px, 0px)',
      );
      fireEvent.keyDown(dialog, {key: 'ArrowDown'});
      expect(img.getAttribute('style') ?? '').toContain(
        'translate(-25px, -25px)',
      );
      fireEvent.keyDown(dialog, {key: 'ArrowLeft'});
      fireEvent.keyDown(dialog, {key: 'ArrowUp'});
      expect(img.getAttribute('style') ?? '').toContain('translate(0px, 0px)');
      expect(onIndexChange).not.toHaveBeenCalled();
    });

    it('navigates the gallery with arrows when not zoomed, even with hasZoom', () => {
      const onIndexChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={1}
          onIndexChange={onIndexChange}
          hasZoom
        />,
      );
      const dialog = document.querySelector('dialog')!;
      fireEvent.keyDown(dialog, {key: 'ArrowRight'});
      expect(onIndexChange).toHaveBeenCalledWith(2);
    });

    it('keeps panning physical in RTL: the image is not mirrored', () => {
      const onIndexChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={1}
          onIndexChange={onIndexChange}
          hasZoom
        />,
      );
      const dialog = document.querySelector('dialog')!;
      dialog.style.direction = 'rtl';
      fireEvent.keyDown(zoomTarget(), {key: 'Enter'});
      const img = screen.getByAltText('Image B');
      // ArrowRight still reveals what is to the right of the photo.
      fireEvent.keyDown(dialog, {key: 'ArrowRight'});
      expect(img.getAttribute('style') ?? '').toContain(
        'translate(-25px, 0px)',
      );
      expect(onIndexChange).not.toHaveBeenCalled();
    });

    it('announces zoom state changes politely', async () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={{src: '/photo.jpg', alt: 'Photo'}}
          hasZoom
        />,
      );
      fireEvent.keyDown(zoomTarget(), {key: 'Enter'});
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Zoomed in');
      });
      fireEvent.keyDown(zoomTarget(), {key: 'Enter'});
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Zoomed out');
      });
    });

    it('has no zoom target or key bindings when hasZoom is off', () => {
      const onIndexChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={1}
          onIndexChange={onIndexChange}
        />,
      );
      expect(screen.queryByRole('button', {name: 'Zoom'})).toBeNull();
      const dialog = document.querySelector('dialog')!;
      fireEvent.keyDown(dialog, {key: '+'});
      expect(document.querySelector('[aria-pressed]')).toBeNull();
      // Arrows still navigate the gallery.
      fireEvent.keyDown(dialog, {key: 'ArrowRight'});
      expect(onIndexChange).toHaveBeenCalledWith(2);
    });

    it('does not expose a zoom target for video items', () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={{src: '/clip.mp4', alt: 'A clip', type: 'video'}}
          hasZoom
        />,
      );
      expect(screen.queryByRole('button', {name: 'Zoom'})).toBeNull();
    });
  });

  describe('video support', () => {
    it('renders a video element when type is video', () => {
      const {container} = render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={{src: '/clip.mp4', alt: 'A clip', type: 'video'}}
        />,
      );
      const video = container.querySelector('video');
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute('src', '/clip.mp4');
      expect(video).toHaveAttribute('controls');
    });
  });

  it('does not crash with an empty media array', () => {
    const {container} = render(
      <Lightbox isOpen={true} onOpenChange={() => {}} media={[]} />,
    );
    expect(container.querySelector('dialog')).not.toBeInTheDocument();
  });

  describe('backdrop dismiss', () => {
    it('calls onOpenChange(false) when the dark area around the media is clicked', () => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={onOpenChange}
          media={{src: '/photo.jpg', alt: 'Photo'}}
        />,
      );
      // The container fills the whole dialog, so a click on the visual
      // backdrop (the dark area around the media) lands on it — not on the
      // dialog element itself.
      const dialog = document.querySelector('dialog')!;
      const container = dialog.firstElementChild!;
      fireEvent.click(container);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('does not close when the media itself is clicked', () => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={onOpenChange}
          media={{src: '/photo.jpg', alt: 'Photo'}}
        />,
      );
      fireEvent.click(screen.getByRole('img', {hidden: true}));
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });
});

describe('Lightbox zoom reset timing', () => {
  it('shows the next image unzoomed in the same commit that changes it', () => {
    const media = [
      {src: '/a.jpg', alt: 'Image A'},
      {src: '/b.jpg', alt: 'Image B'},
    ];
    const frames: string[] = [];
    const onRender = () =>
      frames.push(
        screen
          .queryByRole('button', {name: 'Zoom'})
          ?.getAttribute('aria-pressed') ?? '',
      );
    render(
      <Profiler id="lightbox" onRender={onRender}>
        <Lightbox isOpen={true} onOpenChange={() => {}} media={media} hasZoom />
      </Profiler>,
    );
    fireEvent.keyDown(screen.getByRole('button', {name: 'Zoom'}), {
      key: 'Enter',
    });
    expect(screen.getByRole('button', {name: 'Zoom'})).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    frames.length = 0;
    fireEvent.click(screen.getByRole('button', {name: /next/i}));

    expect(frames.length).toBeGreaterThan(0);
    expect(frames).not.toContain('true');
    expect(screen.getByRole('button', {name: 'Zoom'})).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('Lightbox with an unusable controlled index', () => {
  it('renders without looping when index is NaN', () => {
    expect(() =>
      render(
        <Lightbox
          isOpen={false}
          onOpenChange={() => {}}
          media={[
            {src: '/a.jpg', alt: 'Image A'},
            {src: '/b.jpg', alt: 'Image B'},
          ]}
          index={Number.NaN}
          onIndexChange={() => {}}
        />,
      ),
    ).not.toThrow();
  });
});
