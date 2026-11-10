// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, render, screen, fireEvent, waitFor} from '@testing-library/react';
import {Profiler, StrictMode, useState} from 'react';
import {Lightbox} from './Lightbox';
import {getFocusableElements} from '../hooks/useFocusTrap';
import {getGestureHost} from '../gestures/GestureHost';
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

/**
 * jsdom has no layout, so give the zoom stage what a browser measures. The
 * stage is 400 × 600, with a landscape photo fitted 400 × 200 at its vertical
 * centre. Filling the stage zooms that photo 3×. Returns the undo.
 */
function stubStageLayout(): () => void {
  const undo: (() => void)[] = [];
  const define = (
    proto: object,
    key: string,
    get: (element: HTMLElement) => number,
  ) => {
    const original = Object.getOwnPropertyDescriptor(proto, key);
    Object.defineProperty(proto, key, {
      configurable: true,
      get(this: HTMLElement) {
        return get(this);
      },
    });
    undo.push(() => {
      if (original) {
        Object.defineProperty(proto, key, original);
      } else {
        Reflect.deleteProperty(proto, key);
      }
    });
  };
  const isPhoto = (element: Element) => element instanceof HTMLImageElement;
  // The zoom stage: a single item's photo box, or a gallery page's.
  const isStage = (element: Element) =>
    element.hasAttribute('data-lightbox-page-media') ||
    element.querySelector(':scope > img') != null;
  define(HTMLElement.prototype, 'offsetWidth', element =>
    isPhoto(element) ? 400 : 0,
  );
  define(HTMLElement.prototype, 'offsetHeight', element =>
    isPhoto(element) ? 200 : 0,
  );
  define(Element.prototype, 'clientWidth', element =>
    isStage(element) ? 400 : 0,
  );
  define(Element.prototype, 'clientHeight', element =>
    isStage(element) ? 600 : 0,
  );
  return () => undo.reverse().forEach(restore => restore());
}

/** A phone: the primary pointer is coarse, so the touch layer is on. Returns the undo. */
function stubCoarsePointer(): () => void {
  const original = window.matchMedia;
  window.matchMedia = (query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  return () => {
    window.matchMedia = original;
  };
}

/** The photo's inline `translate` and `scale`, as the zoom stage wrote them. */
function photoTransform(img: HTMLElement): {translate: string; scale: string} {
  return {translate: img.style.translate, scale: img.style.scale};
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

/** A mouse press on `target` from `from` to `to`, as a browser sends it. */
/** A client rectangle at a place, for a test that sets an element's box. */
function rectAt(left: number, top: number, width: number, height: number) {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  };
}

/**
 * Lays out a gallery's current page for a mouse's click: its photo's box,
 * natural width and caption, and the viewer's width. jsdom lays out nothing.
 */
function layOutPage(
  page: Element,
  {
    photo,
    natural,
    caption,
    viewer,
  }: {
    photo: ReturnType<typeof rectAt>;
    natural: number;
    caption?: ReturnType<typeof rectAt>;
    viewer: number;
  },
): void {
  const define = (element: Element, values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(element, key, {configurable: true, value});
    }
  };
  const img = page.querySelector('img')!;
  define(img, {
    getBoundingClientRect: () => photo,
    offsetHeight: photo.height,
    naturalWidth: natural,
  });
  // The photo's own box hugs it without zoom.
  define(img.parentElement!, {
    getBoundingClientRect: () => photo,
    clientHeight: photo.height,
    clientWidth: photo.width,
  });
  const text = page.querySelector('[data-lightbox-caption]');
  if (caption != null && text != null) {
    define(text, {
      getBoundingClientRect: () => caption,
      offsetWidth: caption.width,
    });
  }
  define(page.closest('[data-lightbox-page]')!.parentElement!.parentElement!, {
    clientWidth: viewer,
  });
}

function mousePress(
  target: Element,
  from: {x: number; y: number},
  to: {x: number; y: number} = from,
): void {
  const send = (
    type: string,
    {x, y}: {x: number; y: number},
    buttons: number,
  ) => {
    const event = new Event(type, {bubbles: true, cancelable: true});
    for (const [key, value] of Object.entries({
      pointerType: 'mouse',
      pointerId: 1,
      isPrimary: true,
      button: 0,
      buttons,
      clientX: x,
      clientY: y,
      timeStamp: performance.now(),
    })) {
      Object.defineProperty(event, key, {value});
    }
    act(() => {
      target.dispatchEvent(event);
    });
  };
  send('pointerdown', from, 1);
  if (to.x !== from.x || to.y !== from.y) {
    send('pointermove', to, 1);
  }
  send('pointerup', to, 0);
  // Then the click a mouse's press and release make.
  act(() => {
    target.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
        clientX: to.x,
        clientY: to.y,
      }),
    );
  });
}

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

  it('opens once an item arrives when opened with none', () => {
    const {rerender} = render(
      <Lightbox isOpen={true} onOpenChange={() => {}} media={[]} />,
    );
    expect(document.querySelector('dialog')).toBeNull();
    rerender(
      <Lightbox
        isOpen={true}
        onOpenChange={() => {}}
        media={[{src: '/photo.jpg', alt: 'Photo'}]}
      />,
    );
    expect(document.querySelector('dialog')).toHaveAttribute('open');
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

  it('ignores a cancel that bubbles up from inside it', () => {
    const onOpenChange = vi.fn();
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={onOpenChange}
        media={{src: '/photo.jpg', alt: 'Photo'}}
      />,
    );
    // Only a close request fired at the <dialog> itself dismisses; a bubbling
    // `cancel` from a control inside (a dismissed file picker) does not.
    const inside = document.querySelector('dialog button')!;
    const fromInside = new Event('cancel', {bubbles: true, cancelable: true});
    inside.dispatchEvent(fromInside);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(fromInside.defaultPrevented).toBe(false);
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

    it('renders the current item and its neighbours as pages, each with its own caption', () => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          index={1}
        />,
      );
      const pages = [
        ...document.querySelectorAll<HTMLElement>('[data-lightbox-page]'),
      ];
      expect(pages).toHaveLength(3);
      const current = pages.filter(page => page.hasAttribute('data-current'));
      expect(current).toHaveLength(1);
      expect(current[0]).toContainElement(screen.getByAltText('Image B'));
      expect(current[0]).toHaveTextContent('Second');
      // The neighbours are off screen: hidden from assistive technology.
      for (const page of pages.filter(p => p !== current[0])) {
        const img = page.querySelector('img');
        expect(img).toHaveAttribute('aria-hidden', 'true');
        expect(img).toHaveAttribute('alt', '');
      }
      expect(pages[0]).toHaveTextContent('First');
    });

    it('closes on a click beside the photo on a page', () => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={onOpenChange}
          media={media}
          index={0}
        />,
      );
      const current = document.querySelector('[data-current]')!;
      mousePress(current.querySelector('[data-lightbox-page-media]')!, {
        x: 20,
        y: 20,
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('closes on a mouse press beside the photo that moved past the tap limit', () => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={onOpenChange}
          media={media}
          index={0}
        />,
      );
      const pageMedia = document.querySelector(
        '[data-current] [data-lightbox-page-media]',
      )!;
      // 60 px straight down: past the tap's 45 px limit. A mouse's click
      // closes it, as on the backdrop, however far the press moved.
      mousePress(pageMedia, {x: 100, y: 100}, {x: 100, y: 160});
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('leaves the viewer open when the keyboard activates a caption link after a mouse press', () => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={onOpenChange}
          media={[
            {src: '/a.jpg', alt: 'A', caption: <a href="#more">More</a>},
            {src: '/b.jpg', alt: 'B'},
          ]}
          index={0}
        />,
      );
      const link = screen.getByRole('link', {name: 'More'});
      // A mouse press on the stage, then Enter on the caption's link: the
      // browser clicks the link with no pointer (detail 0, at 0, 0).
      const down = new Event('pointerdown', {bubbles: true, cancelable: true});
      Object.defineProperty(down, 'pointerType', {value: 'mouse'});
      act(() => {
        link.dispatchEvent(down);
      });
      act(() => {
        link.dispatchEvent(
          new MouseEvent('click', {bubbles: true, cancelable: true, detail: 0}),
        );
      });
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('plays a video again when paging back to it, with hasAutoPlay', () => {
      const play = vi
        .spyOn(HTMLMediaElement.prototype, 'play')
        .mockImplementation(async () => {});
      try {
        const withVideo = [
          {src: '/a.jpg', alt: 'Image A'},
          {src: '/clip.webm', alt: 'Clip', type: 'video' as const},
        ];
        const {rerender} = render(
          <Lightbox
            isOpen={true}
            onOpenChange={() => {}}
            media={withVideo}
            index={0}
            hasAutoPlay
          />,
        );
        expect(play).not.toHaveBeenCalled();
        rerender(
          <Lightbox
            isOpen={true}
            onOpenChange={() => {}}
            media={withVideo}
            index={1}
            hasAutoPlay
          />,
        );
        expect(play).toHaveBeenCalledTimes(1);
        expect(play.mock.contexts[0]).toBe(
          document.querySelector('[data-current] video'),
        );
      } finally {
        play.mockRestore();
      }
    });

    it('shows the last item as the current one for an index past the end', () => {
      for (const props of [
        {index: media.length + 2},
        {defaultIndex: media.length + 2},
      ]) {
        const {unmount} = render(
          <Lightbox
            isOpen={true}
            onOpenChange={() => {}}
            media={media}
            {...props}
          />,
        );
        const photo = screen.getByAltText('Image C');
        expect(photo).not.toHaveAttribute('aria-hidden');
        const page = photo.closest('[data-lightbox-page]')!;
        expect(page).toHaveAttribute('data-current');
        expect(page).not.toHaveAttribute('inert');
        expect(
          screen.getByText(`${media.length} / ${media.length}`),
        ).toBeTruthy();
        unmount();
      }
    });

    it('shows the first item as the current one for an index below 0', () => {
      for (const props of [{index: -1}, {defaultIndex: -3}]) {
        const {unmount} = render(
          <Lightbox
            isOpen={true}
            onOpenChange={() => {}}
            media={media}
            {...props}
          />,
        );
        const photo = screen.getByAltText('Image A');
        expect(photo).not.toHaveAttribute('aria-hidden');
        const page = photo.closest('[data-lightbox-page]')!;
        expect(page).toHaveAttribute('data-current');
        expect(page).not.toHaveAttribute('inert');
        expect(screen.getByText(`1 / ${media.length}`)).toBeTruthy();
        unmount();
      }
    });

    // An index that is not a whole number opens the nearest item, as an
    // index past either end does.
    it.each([
      ['a controlled NaN index', {index: Number.NaN}, 'Image A', 1],
      ['a default NaN index', {defaultIndex: Number.NaN}, 'Image A', 1],
      ['a controlled index of 1.5', {index: 1.5}, 'Image C', 3],
      ['a controlled index of 0.4', {index: 0.4}, 'Image A', 1],
      ['a default index of 1.2', {defaultIndex: 1.2}, 'Image B', 2],
    ])('opens the nearest item for %s', (_, indexProps, alt, position) => {
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={media}
          {...indexProps}
        />,
      );
      const page = screen.getByAltText(alt).closest('[data-lightbox-page]')!;
      expect(page).toHaveAttribute('data-current');
      expect(screen.getByText(`${position} / ${media.length}`)).toBeTruthy();
    });

    it('pauses a playing video once the viewer moves to another item', () => {
      const items = [
        {src: '/clip.mp4', alt: 'A clip', type: 'video' as const},
        {src: '/b.jpg', alt: 'Image B'},
      ];
      const {rerender} = render(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={items}
          index={0}
        />,
      );
      const video = document.querySelector('video')!;
      // Started by someone: playing, with its sound.
      const pause = vi.fn();
      video.pause = pause;
      Object.defineProperty(video, 'paused', {
        configurable: true,
        get: () => pause.mock.calls.length > 0,
      });
      rerender(
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={items}
          index={1}
        />,
      );
      // Still mounted as the pager's neighbour, and stopped.
      expect(document.querySelector('video')).toBe(video);
      expect(pause).toHaveBeenCalledTimes(1);
    });

    it("keeps a paged-away video's element and time once the viewer pages back", () => {
      const items = [
        {src: '/clip.mp4', alt: 'A clip', type: 'video' as const},
        {src: '/b.jpg', alt: 'Image B'},
      ];
      const view = (index: number) => (
        <Lightbox
          isOpen={true}
          onOpenChange={() => {}}
          media={items}
          index={index}
        />
      );
      const {rerender} = render(view(0));
      const video = document.querySelector('video')!;
      // Played for 12 s, then paged away from.
      let time = 12;
      Object.defineProperty(video, 'currentTime', {
        configurable: true,
        get: () => time,
        set: (value: number) => {
          time = value;
        },
      });
      const load = vi.fn();
      video.load = load;
      video.pause = vi.fn();
      rerender(view(1));
      rerender(view(0));
      // The same element, at the same time: nothing reloads or rewinds it.
      expect(document.querySelector('video')).toBe(video);
      expect(time).toBe(12);
      expect(load).not.toHaveBeenCalled();
    });

    it('stays open on a click on the photo, with zoom off', () => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={onOpenChange}
          media={media}
          index={0}
        />,
      );
      const current = document.querySelector('[data-current]')!;
      const box = current.querySelector<HTMLElement>(
        '[data-lightbox-page-media]',
      )!;
      // The photo takes no pointer events: a press on it lands on its box.
      layOutPage(current, {
        photo: rectAt(100, 100, 400, 200),
        natural: 400,
        viewer: 1000,
      });
      mousePress(box, {x: 300, y: 200});
      expect(onOpenChange).not.toHaveBeenCalled();
      // Beside the photo, past its natural width, the click is the backdrop's.
      mousePress(box, {x: 20, y: 200});
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('closes on a mouse press beside the photo that is released on it', () => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={onOpenChange}
          media={media}
          index={0}
        />,
      );
      const current = document.querySelector('[data-current]')!;
      layOutPage(current, {
        photo: rectAt(100, 100, 400, 200),
        natural: 400,
        viewer: 1000,
      });
      // A press that starts on the backdrop closes, wherever it ends.
      mousePress(
        current.querySelector('[data-lightbox-page-media]')!,
        {x: 20, y: 200},
        {x: 300, y: 200},
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("stays open on a mouse click beside a narrow photo, within its caption's width", () => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={onOpenChange}
          media={media}
          index={0}
        />,
      );
      const current = document.querySelector('[data-current]')!;
      const box = current.querySelector('[data-lightbox-page-media]')!;
      layOutPage(current, {
        photo: rectAt(250, 100, 100, 300),
        natural: 100,
        caption: rectAt(100, 410, 400, 30),
        viewer: 1000,
      });
      // The media is as wide as the caption here, so this point is on it.
      mousePress(box, {x: 150, y: 250});
      expect(onOpenChange).not.toHaveBeenCalled();
      // Past the caption's width, the click is the backdrop's.
      mousePress(box, {x: 50, y: 250});
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('stays open on a mouse click beside a large photo, level with it, since its media spans the viewer', () => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={onOpenChange}
          media={media}
          index={0}
        />,
      );
      const current = document.querySelector('[data-current]')!;
      // A photo wider than the viewer, shown at 400 px.
      layOutPage(current, {
        photo: rectAt(300, 100, 400, 200),
        natural: 3000,
        viewer: 1000,
      });
      mousePress(current.querySelector('[data-lightbox-page-media]')!, {
        x: 990,
        y: 200,
      });
      expect(onOpenChange).not.toHaveBeenCalled();
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
      expect(prev).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByLabelText('Next')).not.toHaveAttribute(
        'aria-disabled',
      );
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
      expect(next).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByLabelText('Previous')).not.toHaveAttribute(
        'aria-disabled',
      );
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
    let restoreLayout: () => void = () => {};
    beforeEach(() => {
      restoreLayout = stubStageLayout();
    });
    afterEach(() => {
      restoreLayout();
    });

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

    it('returns a zoomed photo to its fitted size with 0', () => {
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
      fireEvent.keyDown(dialog, {key: '0'});
      expect(zoomTarget()).toHaveAttribute('aria-pressed', 'false');
      // At the fitted size, 0 leaves the photo there.
      fireEvent.keyDown(dialog, {key: '0'});
      expect(zoomTarget()).toHaveAttribute('aria-pressed', 'false');
    });

    it('leaves Ctrl+0 and Cmd+0 to the browser', () => {
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
      expect(fireEvent.keyDown(dialog, {key: '0', ctrlKey: true})).toBe(true);
      expect(fireEvent.keyDown(dialog, {key: '0', metaKey: true})).toBe(true);
      expect(zoomTarget()).toHaveAttribute('aria-pressed', 'true');
    });

    it('announces a zoom inside the open modal viewer', async () => {
      // jsdom has no :modal; treat an open dialog as modal, as showModal()
      // makes it in a browser.
      const matches = Element.prototype.matches;
      const spy = vi
        .spyOn(Element.prototype, 'matches')
        .mockImplementation(function (this: Element, selector: string) {
          return selector === ':modal'
            ? this instanceof HTMLDialogElement && this.open
            : matches.call(this, selector);
        });
      try {
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
        await waitFor(() => {
          expect(
            dialog.querySelector(
              ':scope > [data-astryx-modal-live-region="polite"]',
            ),
          ).toHaveTextContent('Zoomed in');
        });
        expect(politeRegion()?.textContent ?? '').toBe('');
      } finally {
        spy.mockRestore();
      }
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
      // Lightbox's released zoom: 2× about the stage's centre, so 800 × 400
      // with its centre on the stage's centre. Filling the stage would take
      // 3× for this photo.
      expect(photoTransform(img)).toEqual({
        translate: '-200px -100px',
        scale: '2 2',
      });
      // ArrowRight reveals content to the right (image shifts left) and must
      // not fall through to gallery navigation.
      fireEvent.keyDown(dialog, {key: 'ArrowRight'});
      expect(onIndexChange).not.toHaveBeenCalled();
      expect(photoTransform(img).translate).toBe('-250px -100px');
      // At 400 px the photo is shorter than the 600 px stage, so it stays
      // centred vertically.
      fireEvent.keyDown(dialog, {key: 'ArrowDown'});
      expect(photoTransform(img).translate).toBe('-250px -100px');
      fireEvent.keyDown(dialog, {key: 'ArrowLeft'});
      fireEvent.keyDown(dialog, {key: 'ArrowUp'});
      expect(photoTransform(img).translate).toBe('-200px -100px');
      expect(onIndexChange).not.toHaveBeenCalled();
    });

    it('stops panning at the edges of the photo', () => {
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
      const img = screen.getByAltText('Photo');
      for (let i = 0; i < 12; i++) {
        fireEvent.keyDown(dialog, {key: 'ArrowLeft'});
      }
      // The photo's left edge rests on the stage's left edge, no gap: on main
      // the arrows could carry the photo out of view.
      expect(photoTransform(img).translate).toBe('0px -100px');
      for (let i = 0; i < 24; i++) {
        fireEvent.keyDown(dialog, {key: 'ArrowRight'});
      }
      // 800 px wide on a 400 px stage: its right edge on the stage's.
      expect(photoTransform(img).translate).toBe('-400px -100px');
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
      expect(photoTransform(img).translate).toBe('-250px -100px');
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
    it('closes on a click on the strip a raised caption leaves below the stage', () => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={onOpenChange}
          media={{src: '/photo.jpg', alt: 'Photo', caption: 'A caption'}}
          hasZoom
        />,
      );
      // The media group: the stage, then the caption's place below it. A
      // mouse's click there is below the raised caption.
      const group = screen.getByText('A caption').parentElement!;
      fireEvent.click(group, {detail: 1, clientY: 590});
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('without zoom, leaves a click beside a narrower caption alone', () => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={onOpenChange}
          media={{src: '/photo.jpg', alt: 'Photo', caption: 'A caption'}}
        />,
      );
      // The media group hugs its media and caption, as before.
      fireEvent.click(screen.getByText('A caption').parentElement!);
      expect(onOpenChange).not.toHaveBeenCalled();
    });

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

describe('Lightbox gestures for a mouse and a pen (spec:AST-094 FR43)', () => {
  // Gestures attach for every pointer. A mouse's or a pen's double-click
  // zooms 2×, and a zoomed photo pans once the pan begins.
  let restoreLayout: () => void = () => {};
  beforeEach(() => {
    restoreLayout = stubStageLayout();
  });
  afterEach(() => {
    restoreLayout();
  });

  /** A pointer event as a browser sends it, at `time` (ms). */
  function pointer(
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    target: Element,
    pointerType: 'mouse' | 'pen',
    x: number,
    y: number,
    time: number,
  ): void {
    const event = new Event(type, {bubbles: true, cancelable: true});
    const fields: Record<string, unknown> = {
      pointerType,
      pointerId: pointerType === 'pen' ? 7 : 1,
      isPrimary: true,
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      clientX: x,
      clientY: y,
      timeStamp: time,
    };
    for (const [key, value] of Object.entries(fields)) {
      Object.defineProperty(event, key, {value});
    }
    act(() => {
      target.dispatchEvent(event);
    });
  }

  /** Two clicks `gapMs` apart, then the browser's dblclick. */
  function doubleClick(
    target: Element,
    pointerType: 'mouse' | 'pen',
    x: number,
    y: number,
    gapMs = 80,
  ): void {
    const t0 = performance.now();
    pointer('pointerdown', target, pointerType, x, y, t0);
    pointer('pointerup', target, pointerType, x, y, t0 + 40);
    pointer('pointerdown', target, pointerType, x, y, t0 + 40 + gapMs);
    pointer('pointerup', target, pointerType, x, y, t0 + 80 + gapMs);
    act(() => {
      target.dispatchEvent(
        new MouseEvent('dblclick', {bubbles: true, clientX: x, clientY: y}),
      );
    });
  }

  /** A finger's double tap, on a phone (a coarse primary pointer). */
  function fingerDoubleTap(target: Element, x: number, y: number): void {
    const t0 = performance.now();
    const at = (type: string, down: boolean, time: number) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      const entry = {identifier: 1, clientX: x, clientY: y, target};
      Object.defineProperty(event, 'touches', {value: down ? [entry] : []});
      Object.defineProperty(event, 'changedTouches', {value: [entry]});
      Object.defineProperty(event, 'timeStamp', {value: time});
      act(() => {
        target.dispatchEvent(event);
      });
    };
    at('touchstart', true, t0);
    at('touchend', false, t0 + 40);
    at('touchstart', true, t0 + 120);
    at('touchend', false, t0 + 160);
  }

  function renderPhoto() {
    const view = render(
      <Lightbox
        isOpen={true}
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'Photo'}}
        hasZoom
      />,
    );
    return {
      view,
      stage: screen.getByRole('button', {name: 'Zoom'}),
      img: screen.getByAltText('Photo'),
    };
  }

  it('zooms a mouse double-click 2× about the clicked point, and back', async () => {
    const {stage, img} = renderPhoto();
    // Filling the viewer would take 3×. The clicked photo point stays under
    // the pointer, and the photo stays centred on the axis it fits.
    doubleClick(stage, 'mouse', 20, 220);
    expect(photoTransform(img)).toEqual({
      translate: '-20px -100px',
      scale: '2 2',
    });
    expect(stage).toHaveAttribute('aria-pressed', 'true');
    // The next double-click reads where the photo shows: let the zoom land.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 400));
    });
    doubleClick(stage, 'mouse', 20, 220);
    expect(stage).toHaveAttribute('aria-pressed', 'false');
  });

  it('zooms a slow double-click too, as the browser reports it', () => {
    const {stage, img} = renderPhoto();
    // 600 ms between the clicks: past UIKit's 350 ms tap interval, inside a
    // system's slower double-click setting.
    doubleClick(stage, 'mouse', 20, 220, 600);
    expect(photoTransform(img)).toEqual({
      translate: '-20px -100px',
      scale: '2 2',
    });
  });

  it("zooms a finger's double tap to fill the viewer, about the tapped point", () => {
    const restoreCoarse = stubCoarsePointer();
    try {
      const {stage, img} = renderPhoto();
      fingerDoubleTap(stage, 20, 220);
      expect(photoTransform(img)).toEqual({
        translate: '-40px -200px',
        scale: '3 3',
      });
    } finally {
      restoreCoarse();
    }
  });

  it('zooms a pen double-click 2× too', () => {
    const {stage, img} = renderPhoto();
    doubleClick(stage, 'pen', 200, 300);
    expect(photoTransform(img).scale).toBe('2 2');
    expect(stage).toHaveAttribute('aria-pressed', 'true');
  });

  it('pans a zoomed photo under a mouse drag from its first move, with the grab cursor', async () => {
    const {stage, img} = renderPhoto();
    fireEvent.keyDown(document.querySelector('dialog')!, {key: '+'});
    // A drag starts where the photo shows: let the zoom's spring come to
    // rest first.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1500));
    });
    const t0 = performance.now();
    pointer('pointerdown', stage, 'mouse', 200, 300, t0);
    // The press holds the photo where it shows, so the drag moves from there.
    const from = photoTransform(img).translate;
    const [fromX, fromY] = from.split(' ').map(parseFloat);
    const moved = () => {
      const [x, y] = photoTransform(img).translate.split(' ').map(parseFloat);
      return {x: x - fromX, y: y - fromY};
    };
    // A finger's 10 px begin threshold does not apply: 2 px already pans.
    pointer('pointermove', stage, 'mouse', 198, 300, t0 + 16);
    expect(moved().x).toBeCloseTo(-2, 5);
    expect(moved().y).toBeCloseTo(0, 5);
    expect(stage).toHaveAttribute('data-zoom-dragging');
    pointer('pointermove', stage, 'mouse', 170, 300, t0 + 32);
    expect(moved().x).toBeCloseTo(-30, 5);
    pointer('pointerup', stage, 'mouse', 170, 300, t0 + 48);
    expect(stage).not.toHaveAttribute('data-zoom-dragging');
  });

  it('takes the zoom pan\u2019s begin threshold from the shared pan, with no pointerdown listener of its own on the stage', () => {
    const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
    try {
      const {stage} = renderPhoto();
      // The gesture host's own press listener is passive. Any other press
      // listener on the stage would be Lightbox's own.
      const ownPress = added.mock.calls.filter(
        ([type, , options], index) =>
          added.mock.contexts[index] === stage &&
          type === 'pointerdown' &&
          !(typeof options === 'object' && options.passive === true),
      );
      expect(ownPress).toHaveLength(0);
    } finally {
      added.mockRestore();
    }
  });

  it('leaves the viewer open on a caption click after a zoomed drag from above the photo', async () => {
    const onOpenChange = vi.fn();
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={onOpenChange}
        media={{src: '/photo.jpg', alt: 'Photo', caption: 'A caption'}}
        hasZoom
      />,
    );
    const dialog = document.querySelector('dialog')!;
    const stage = screen.getByRole('button', {name: 'Zoom'});
    fireEvent.keyDown(dialog, {key: '+'});
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 400));
    });
    // A zoomed drag from above the fitted photo: its own click is ignored.
    const t0 = performance.now();
    pointer('pointerdown', stage, 'mouse', 200, 50, t0);
    pointer('pointermove', stage, 'mouse', 180, 50, t0 + 16);
    pointer('pointerup', stage, 'mouse', 180, 50, t0 + 32);
    fireEvent.click(stage, {clientX: 180, clientY: 50, detail: 1});
    fireEvent.keyDown(dialog, {key: '-'});
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 400));
    });
    // Each caption click reads its own press, not the drag's.
    const caption = screen.getByText('A caption');
    for (const at of [t0 + 1000, t0 + 2000]) {
      pointer('pointerdown', caption, 'mouse', 200, 300, at);
      pointer('pointerup', caption, 'mouse', 200, 300, at + 40);
      fireEvent.click(caption, {clientX: 200, clientY: 300, detail: 1});
    }
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('starts no pan for a mouse drag on a fitted photo, so its click above the photo closes', () => {
    const onOpenChange = vi.fn();
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={onOpenChange}
        media={{src: '/photo.jpg', alt: 'Photo'}}
        hasZoom
      />,
    );
    const stage = screen.getByRole('button', {name: 'Zoom'});
    // From the photo's middle to above it, far past a finger's threshold.
    const t0 = performance.now();
    pointer('pointerdown', stage, 'mouse', 200, 300, t0);
    pointer('pointermove', stage, 'mouse', 200, 250, t0 + 16);
    pointer('pointermove', stage, 'mouse', 200, 50, t0 + 32);
    pointer('pointerup', stage, 'mouse', 200, 50, t0 + 48);
    fireEvent.click(stage, {clientX: 200, clientY: 50, detail: 1});
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('leaves the viewer open on a mouse click on the zoomed photo above its fitted box', async () => {
    const onOpenChange = vi.fn();
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={onOpenChange}
        media={{src: '/photo.jpg', alt: 'Photo'}}
        hasZoom
      />,
    );
    const dialog = document.querySelector('dialog')!;
    const stage = screen.getByRole('button', {name: 'Zoom'});
    fireEvent.keyDown(dialog, {key: '+'});
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 400));
    });
    // The zoomed photo spreads over the stage, past its fitted box.
    const img = screen.getByAltText('Photo');
    img.getBoundingClientRect = () => ({
      x: -200,
      y: -100,
      left: -200,
      top: -100,
      right: 600,
      bottom: 300,
      width: 800,
      height: 400,
      toJSON: () => ({}),
    });
    const t0 = performance.now();
    pointer('pointerdown', stage, 'mouse', 200, 50, t0);
    pointer('pointerup', stage, 'mouse', 200, 50, t0 + 40);
    fireEvent.click(stage, {clientX: 200, clientY: 50, detail: 1});
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes on the first click above the photo after a zoomed drag, as main does', async () => {
    const onOpenChange = vi.fn();
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={onOpenChange}
        media={{src: '/photo.jpg', alt: 'Photo', caption: 'A caption'}}
        hasZoom
      />,
    );
    const dialog = document.querySelector('dialog')!;
    const stage = screen.getByRole('button', {name: 'Zoom'});
    fireEvent.keyDown(dialog, {key: '+'});
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 400));
    });
    // A zoomed drag, whose own click the stage keeps.
    const t0 = performance.now();
    pointer('pointerdown', stage, 'mouse', 200, 300, t0);
    pointer('pointermove', stage, 'mouse', 180, 300, t0 + 16);
    pointer('pointerup', stage, 'mouse', 180, 300, t0 + 32);
    fireEvent.click(stage, {clientX: 180, clientY: 300, detail: 1});
    expect(onOpenChange).not.toHaveBeenCalled();
    // A new press on the dark area above starts a new click, which closes.
    const container =
      screen.getByText('A caption').parentElement!.parentElement!;
    pointer('pointerdown', container, 'mouse', 200, 10, t0 + 1000);
    pointer('pointerup', container, 'mouse', 200, 10, t0 + 1040);
    fireEvent.click(container, {clientX: 200, clientY: 10, detail: 1});
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Lightbox double-click under the touch layer', () => {
  let restoreLayout: () => void = () => {};
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => {
    restoreLayout = stubStageLayout();
    window.matchMedia = (query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  });
  afterEach(() => {
    restoreLayout();
    window.matchMedia = originalMatchMedia;
  });

  it("leaves a finger's double-click to the touch layer's recognizers", () => {
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'Photo'}}
        hasZoom
      />,
    );
    const stage = screen.getByRole('button', {name: 'Zoom'});
    const down = new Event('pointerdown', {bubbles: true, cancelable: true});
    Object.defineProperty(down, 'pointerType', {value: 'touch'});
    Object.defineProperty(down, 'button', {value: 0});
    act(() => {
      stage.dispatchEvent(down);
      stage.dispatchEvent(
        new MouseEvent('dblclick', {bubbles: true, clientX: 200, clientY: 300}),
      );
    });
    expect(stage).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Lightbox recognizers attach for every pointer (spec:AST-094 FR43)', () => {
  /** Names of the Lightbox recognizers attached while `body` runs. */
  function lightboxRecognizersAttached(body: () => void): string[] {
    const attach = vi.spyOn(getGestureHost(document), 'attach');
    try {
      body();
      return attach.mock.calls
        .map(([, recognizer]) => recognizer.name)
        .filter(name => /lightbox/i.test(name));
    } finally {
      attach.mockRestore();
    }
  }

  it('attaches no drag to dismiss where the primary pointer is fine', () => {
    expect(
      lightboxRecognizersAttached(() => {
        render(
          <Lightbox
            isOpen={true}
            onOpenChange={() => {}}
            media={{src: '/photo.jpg', alt: 'Photo'}}
          />,
        );
      }),
    ).toEqual([]);
  });

  it('attaches the drag to dismiss under the touch layer', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
    try {
      expect(
        lightboxRecognizersAttached(() => {
          render(
            <Lightbox
              isOpen={true}
              onOpenChange={() => {}}
              media={{src: '/photo.jpg', alt: 'Photo'}}
            />,
          );
        }),
      ).toContain('Lightbox.dismissPan');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});

describe('Lightbox touch zoom (synthetic touches)', () => {
  let restoreLayout: () => void = () => {};
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => {
    restoreLayout = stubStageLayout();
    // A phone: the primary pointer is coarse, so the touch layer is on.
    window.matchMedia = (query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  });
  afterEach(() => {
    restoreLayout();
    window.matchMedia = originalMatchMedia;
  });

  interface Contact {
    id: number;
    x: number;
    y: number;
  }

  /** A touch event as a browser sends it: who is down, and who changed. */
  function touch(
    type: 'touchstart' | 'touchmove' | 'touchend',
    target: Element,
    down: Contact[],
    changed: Contact[],
    time: number,
  ): void {
    const event = new Event(type, {bubbles: true, cancelable: true});
    const entry = (contact: Contact) => ({
      identifier: contact.id,
      clientX: contact.x,
      clientY: contact.y,
      target,
    });
    Object.defineProperty(event, 'touches', {value: down.map(entry)});
    Object.defineProperty(event, 'changedTouches', {value: changed.map(entry)});
    Object.defineProperty(event, 'timeStamp', {value: time});
    act(() => {
      target.dispatchEvent(event);
    });
  }

  /** A finger's pointerdown, which a browser sends before its touchstart. */
  function fingerDown(target: Element, x: number, y: number): void {
    const event = new Event('pointerdown', {bubbles: true, cancelable: true});
    const fields = {pointerType: 'touch', pointerId: 2, isPrimary: true};
    for (const [key, value] of Object.entries({
      ...fields,
      button: 0,
      buttons: 1,
      clientX: x,
      clientY: y,
    })) {
      Object.defineProperty(event, key, {value});
    }
    act(() => {
      target.dispatchEvent(event);
    });
  }

  it('reports a tap beside the photo to the newest onOpenChange', async () => {
    // The stage's gestures read the props of the latest render, so a parent's
    // new callback is the one a tap beside the photo reaches.
    const first = vi.fn();
    const second = vi.fn();
    const photo = {src: '/photo.jpg', alt: 'Photo'};
    const view = render(
      <Lightbox isOpen={true} onOpenChange={first} media={photo} hasZoom />,
    );
    view.rerender(
      <Lightbox isOpen={true} onOpenChange={second} media={photo} hasZoom />,
    );
    const stage = screen.getByRole('button', {name: 'Zoom'});
    // Above the photo, which the stage centres at its fitted size.
    const finger: Contact = {id: 6, x: 200, y: 50};
    const t0 = performance.now();
    touch('touchstart', stage, [finger], [finger], t0);
    touch('touchend', stage, [], [finger], t0 + 40);
    // A single tap waits out a double tap's interval.
    await waitFor(() => expect(second).toHaveBeenCalledWith(false));
    expect(first).not.toHaveBeenCalled();
  });

  it.each([
    ['a fitted photo', false],
    ['a zoomed photo', true],
  ])(
    'closes on a finger’s tap on the strip after a finger drag on %s, once the drag’s flag is clear',
    async (_, isZoomedFirst) => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox
          isOpen={true}
          onOpenChange={onOpenChange}
          media={{src: '/photo.jpg', alt: 'Photo', caption: 'A caption'}}
          hasZoom
        />,
      );
      const stage = screen.getByRole('button', {name: 'Zoom'});
      if (isZoomedFirst) {
        fireEvent.keyDown(document.querySelector('dialog')!, {key: '+'});
        await act(async () => {
          await new Promise(resolve => setTimeout(resolve, 400));
        });
      }
      // A finger drag on the photo, which fires no click.
      let finger: Contact = {id: 5, x: 200, y: 300};
      touch('touchstart', stage, [finger], [finger], 1000);
      for (let i = 1; i <= 6; i++) {
        finger = {...finger, x: finger.x - 10};
        touch('touchmove', stage, [finger], [finger], 1000 + i * 16);
      }
      touch('touchend', stage, [], [finger], 1000 + 7 * 16);
      const group = screen.getByText('A caption').parentElement!;
      const tapStrip = () => {
        fingerDown(group, 200, 590);
        fireEvent.click(group, {clientX: 200, clientY: 590, detail: 1});
      };
      // A zoomed drag's flag takes the first tap. A fitted photo's drag starts
      // no zoom pan, since paging owns it, so it leaves no flag.
      tapStrip();
      expect(onOpenChange).toHaveBeenCalledTimes(isZoomedFirst ? 0 : 1);
      tapStrip();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    },
  );

  it('keeps panning with the finger left down after a pinch, without a jump', () => {
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'Photo'}}
        hasZoom
      />,
    );
    const stage = screen.getByRole('button', {name: 'Zoom'});
    const img = screen.getByAltText('Photo');
    const x = () => parseFloat(photoTransform(img).translate || '0');
    // Two fingers land on the photo, spread (100 → 140 px) and drift left
    // together (the midpoint 200 → 180).
    let a: Contact = {id: 1, x: 150, y: 300};
    let b: Contact = {id: 2, x: 250, y: 300};
    touch('touchstart', stage, [a], [a], 0);
    touch('touchstart', stage, [a, b], [b], 0);
    for (let i = 1; i <= 10; i++) {
      a = {...a, x: 150 - 4 * i};
      b = {...b, x: 250};
      touch('touchmove', stage, [a, b], [a, b], i * 16);
    }
    const scaled = parseFloat(photoTransform(img).scale);
    expect(scaled).toBeGreaterThan(1.2);
    // The right finger lifts: nothing moves.
    const beforeLift = x();
    touch('touchend', stage, [a], [b], 11 * 16);
    expect(x()).toBeCloseTo(beforeLift, 6);
    // The left finger drags on 40 px: the photo follows it 1:1, zoom kept.
    for (let i = 1; i <= 8; i++) {
      a = {...a, x: a.x - 5};
      touch('touchmove', stage, [a], [a], (11 + i) * 16);
    }
    expect(x()).toBeCloseTo(beforeLift - 40, 6);
    expect(parseFloat(photoTransform(img).scale)).toBeCloseTo(scaled, 6);
    touch('touchend', stage, [], [a], 20 * 16);
  });

  it("takes a caption off the photo from a pinch's first move", () => {
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'Photo', caption: 'A caption'}}
        hasZoom
      />,
    );
    const stage = screen.getByRole('button', {name: 'Zoom'});
    const caption = screen.getByText('A caption');
    // Fitted, the caption is raised by the stage's free space below the
    // photo: (600 - 200) / 2.
    expect(caption.style.translate).toBe('0 -200px');
    let a: Contact = {id: 1, x: 150, y: 300};
    let b: Contact = {id: 2, x: 250, y: 300};
    touch('touchstart', stage, [a], [a], 0);
    touch('touchstart', stage, [a, b], [b], 0);
    for (let i = 1; i <= 4; i++) {
      a = {...a, x: 150 - 6 * i};
      b = {...b, x: 250 + 6 * i};
      touch('touchmove', stage, [a, b], [a, b], i * 16);
    }
    // Both fingers are still down, and the photo spreads over the stage.
    expect(
      parseFloat(photoTransform(screen.getByAltText('Photo')).scale),
    ).toBeGreaterThan(1);
    expect(caption.style.translate).toBe('');
    touch('touchend', stage, [a], [b], 5 * 16);
    touch('touchend', stage, [], [a], 6 * 16);
  });

  it('frees the pan once a pinch that outlived its photo ends', async () => {
    const lightbox = (src: string) => (
      <Lightbox
        isOpen={true}
        onOpenChange={() => {}}
        media={{src, alt: 'Photo'}}
        hasZoom
      />
    );
    const view = render(lightbox('/first.jpg'));
    const stage = screen.getByRole('button', {name: 'Zoom'});
    // Two fingers pinch the first photo, and another photo arrives while
    // they are down. Then they lift.
    let a: Contact = {id: 1, x: 150, y: 300};
    const b: Contact = {id: 2, x: 250, y: 300};
    touch('touchstart', stage, [a], [a], 0);
    touch('touchstart', stage, [a, b], [b], 0);
    for (let i = 1; i <= 6; i++) {
      a = {...a, x: 150 - 4 * i};
      touch('touchmove', stage, [a, b], [a, b], i * 16);
    }
    view.rerender(lightbox('/second.jpg'));
    touch('touchend', stage, [a], [b], 7 * 16);
    touch('touchend', stage, [], [a], 8 * 16);
    // A double tap zooms the new photo, and a drag then pans it 1:1.
    const tapAt = {id: 3, x: 200, y: 300};
    touch('touchstart', stage, [tapAt], [tapAt], 400);
    touch('touchend', stage, [], [tapAt], 440);
    touch('touchstart', stage, [tapAt], [tapAt], 520);
    touch('touchend', stage, [], [tapAt], 560);
    const img = screen.getByAltText('Photo');
    expect(parseFloat(photoTransform(img).scale)).toBeGreaterThan(1.5);
    // The drag reads where the photo shows: let the zoom's spring land.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 900));
    });
    const x = () => parseFloat(photoTransform(img).translate || '0');
    const before = x();
    let finger: Contact = {id: 4, x: 200, y: 300};
    touch('touchstart', stage, [finger], [finger], 900);
    for (let i = 1; i <= 8; i++) {
      finger = {...finger, x: finger.x - 5};
      touch('touchmove', stage, [finger], [finger], 900 + i * 16);
    }
    expect(x()).toBeLessThan(before - 20);
    touch('touchend', stage, [], [finger], 900 + 9 * 16);
  });

  // Times on the arena's clock: velocities read the gap since the last sample.
  let clock = 0;

  /** A one-finger drag down by `dy` in 10 px steps. */
  function dragDown(
    stage: Element,
    dy: number,
  ): {x: number; y: number; id: number} {
    clock = performance.now();
    let finger = {id: 1, x: 200, y: 300};
    touch('touchstart', stage, [finger], [finger], clock);
    for (let i = 1; i <= dy / 10; i++) {
      finger = {...finger, y: 300 + 10 * i};
      touch('touchmove', stage, [finger], [finger], clock + i * 16);
    }
    clock += (dy / 10) * 16;
    return finger;
  }

  it('carries a photo dragged down, shrinking it, and the release dismisses', async () => {
    const onOpenChange = vi.fn();
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={onOpenChange}
        media={{src: '/photo.jpg', alt: 'Photo'}}
      />,
    );
    const img = screen.getByAltText('Photo');
    const stage = img.parentElement!;
    const finger = dragDown(stage, 100);
    // The travel past the pan's 10 px threshold is 90 px: the photo's centre
    // moved 90 px down, and it shrank to 1 − 4.91e-6 × 90².
    const scale = 1 - 4.91e-6 * 90 * 90;
    expect(parseFloat(photoTransform(img).scale)).toBeCloseTo(scale, 4);
    const [tx, ty] = photoTransform(img).translate.split(' ').map(parseFloat);
    expect(tx).toBeCloseTo(((1 - scale) * 400) / 2, 2);
    expect(ty).toBeCloseTo(90 + ((1 - scale) * 200) / 2, 2);
    expect(onOpenChange).not.toHaveBeenCalled();
    touch('touchend', stage, [], [finger], clock + 16);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('springs back when the finger lifts moving up', async () => {
    const onOpenChange = vi.fn();
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={onOpenChange}
        media={{src: '/photo.jpg', alt: 'Photo'}}
        hasZoom
      />,
    );
    const img = screen.getByAltText('Photo');
    const stage = img.parentElement!;
    let finger = dragDown(stage, 100);
    for (let i = 1; i <= 6; i++) {
      finger = {...finger, y: finger.y - 10};
      touch('touchmove', stage, [finger], [finger], clock + i * 16);
    }
    touch('touchend', stage, [], [finger], clock + 7 * 16);
    // The return's end state is in place at once (it springs there on the
    // compositor); at rest the photo keeps no inline transform.
    expect(photoTransform(img)).toEqual({translate: '', scale: ''});
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('ignores the first tap on the strip after a drag to close springs back, as before', async () => {
    const onOpenChange = vi.fn();
    render(
      <Lightbox
        isOpen={true}
        onOpenChange={onOpenChange}
        media={{src: '/photo.jpg', alt: 'Photo', caption: 'A caption'}}
        hasZoom
      />,
    );
    const img = screen.getByAltText('Photo');
    const stage = img.parentElement!;
    let finger = dragDown(stage, 100);
    for (let i = 1; i <= 6; i++) {
      finger = {...finger, y: finger.y - 10};
      touch('touchmove', stage, [finger], [finger], clock + i * 16);
    }
    touch('touchend', stage, [], [finger], clock + 7 * 16);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(onOpenChange).not.toHaveBeenCalled();
    const group = screen.getByText('A caption').parentElement!;
    const tapStrip = () => {
      fingerDown(group, 200, 590);
      fireEvent.click(group, {clientX: 200, clientY: 590, detail: 1});
    };
    // The first tap on the strip below the stage only clears the drag's flag.
    tapStrip();
    expect(onOpenChange).not.toHaveBeenCalled();
    tapStrip();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Lightbox zoom reset timing', () => {
  let restoreLayout: () => void = () => {};
  beforeEach(() => {
    restoreLayout = stubStageLayout();
  });
  afterEach(() => {
    restoreLayout();
  });

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
    // The photo element is reused for the next image, and it is back at the
    // fitted size before that image paints. An animator at rest at the
    // identity leaves the element's own style.
    expect(photoTransform(screen.getByAltText('Image B'))).toEqual({
      translate: '',
      scale: '',
    });
  });
});

describe('Lightbox restore after a dismissal', () => {
  const media = [
    {src: '/a.jpg', alt: 'Image A'},
    {src: '/b.jpg', alt: 'Image B'},
  ];
  // The backdrop's blur is off while the backdrop moves, as during a
  // cancelled drag's return, and the restore brings it back.
  const BLUR_OFF = '--_lightbox-backdrop-filter';

  it('brings the backdrop back to rest as the viewer opens', () => {
    const {rerender} = render(
      <Lightbox isOpen={false} onOpenChange={() => {}} media={media} hasZoom />,
    );
    const dialog = document.querySelector('dialog');
    expect(dialog).not.toBeNull();
    dialog?.style.setProperty(BLUR_OFF, 'none');
    rerender(
      <Lightbox isOpen={true} onOpenChange={() => {}} media={media} hasZoom />,
    );
    expect(dialog?.style.getPropertyValue(BLUR_OFF)).toBe('');
  });

  it('leaves a moving backdrop alone on a page change while the viewer is open', () => {
    render(
      <Lightbox isOpen={true} onOpenChange={() => {}} media={media} hasZoom />,
    );
    const dialog = screen.getByRole('dialog');
    dialog.style.setProperty(BLUR_OFF, 'none');
    fireEvent.click(screen.getByRole('button', {name: /next/i}));
    expect(dialog).toHaveTextContent('2 / 2');
    expect(dialog.style.getPropertyValue(BLUR_OFF)).toBe('none');
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

// AR3: a viewer that unmounts while open (rendered only while open, or removed
// with its view) returns focus to the element that opened it, as a close does.
describe('Lightbox unmounting while open', () => {
  const items = [
    {src: 'a.jpg', alt: 'Sunrise'},
    {src: 'b.jpg', alt: 'Sunset'},
  ];
  function Gallery() {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setIsOpen(true)}>
          View photos
        </button>
        {isOpen ? (
          <Lightbox isOpen onOpenChange={setIsOpen} media={items} index={0} />
        ) : null}
        <button type="button" onClick={() => setIsOpen(false)}>
          Remove viewer
        </button>
      </>
    );
  }

  it('returns focus to the opener when the viewer unmounts', async () => {
    render(<Gallery />);
    const opener = screen.getByRole('button', {name: 'View photos'});
    opener.focus();
    fireEvent.click(opener);
    const next = screen.getByLabelText('Next');
    next.focus();

    fireEvent.click(
      screen.getByRole('button', {name: 'Remove viewer', hidden: true}),
    );
    await Promise.resolve();

    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('leaves focus on a page control the user pressed to remove the viewer', async () => {
    render(<Gallery />);
    const opener = screen.getByRole('button', {name: 'View photos'});
    opener.focus();
    fireEvent.click(opener);
    const remove = screen.getByRole('button', {
      name: 'Remove viewer',
      hidden: true,
    });
    remove.focus();

    fireEvent.click(remove);
    await Promise.resolve();

    expect(document.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(remove);
  });

  it('keeps focus inside through StrictMode effects, then returns it on unmount', async () => {
    render(
      <StrictMode>
        <Gallery />
      </StrictMode>,
    );
    const opener = screen.getByRole('button', {name: 'View photos'});
    opener.focus();
    fireEvent.click(opener);
    const next = screen.getByLabelText('Next');
    next.focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(next);

    fireEvent.click(
      screen.getByRole('button', {name: 'Remove viewer', hidden: true}),
    );
    await Promise.resolve();

    expect(document.activeElement).toBe(opener);
  });
});

// Tab from the last tabbable control wraps to the first and Shift+Tab from the
// first wraps to the last, so focus never leaves the modal for the browser's
// own UI.
function expectTabWrapsInside(modal: HTMLElement) {
  const tabbables = getFocusableElements(modal);
  expect(tabbables.length).toBeGreaterThan(0);
  const first = tabbables[0];
  const last = tabbables[tabbables.length - 1];

  last.focus();
  expect(last).toHaveFocus();
  expect(fireEvent.keyDown(last, {key: 'Tab'})).toBe(false);
  expect(first).toHaveFocus();

  expect(fireEvent.keyDown(first, {key: 'Tab', shiftKey: true})).toBe(false);
  expect(last).toHaveFocus();
}

describe('Lightbox focus region (Dialog DEC-2)', () => {
  it('wraps Tab and Shift+Tab inside the open viewer', () => {
    render(
      <Lightbox
        isOpen
        onOpenChange={() => {}}
        media={[
          {src: '/one.jpg', alt: 'One'},
          {src: '/two.jpg', alt: 'Two'},
        ]}
      />,
    );
    expectTabWrapsInside(document.querySelector('dialog') as HTMLElement);
  });
});
