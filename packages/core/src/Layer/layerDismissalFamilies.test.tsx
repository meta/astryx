// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerDismissalFamilies.test.tsx
 * @input Uses vitest, @testing-library/react, BottomSheet, Dialog, Lightbox,
 *   MobileNav, HoverCard, Tooltip (also pinned by `pressTrigger="toggle"`)
 * @output Tests that every overlay family shares the one dismissal stack
 * @position Colocated with layerStack; the families' own behavior is tested in
 *   their own files, this one only asks who takes the press
 *
 * The stack routes an Escape press to the top-most REGISTERED layer and
 * preventDefault()s it, so a family that is not on the stack cannot be reached
 * once anything else is. Lightbox and MobileNav were that gap: both closed via
 * the native `cancel` event alone, and a `required` Dialog underneath swallowed
 * every press before it got there. Standalone BottomSheet was the same gap from
 * the other side: its own keydown handler closed the sheet before a layer
 * opened inside it could take the press.
 *
 * SYNC: When a new overlay family joins the stack, add it here.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {useState} from 'react';

import {BottomSheet} from '../BottomSheet/BottomSheet';
import {Dialog} from '../Dialog/Dialog';
import {HoverCard} from '../HoverCard/HoverCard';
import {Lightbox} from '../Lightbox/Lightbox';
import {MobileNav} from '../MobileNav/MobileNav';
import {Tooltip} from '../Tooltip/Tooltip';
import {resetLayerStackForTests} from './layerStack';

const originalMatches = HTMLElement.prototype.matches;
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

// jsdom implements no Popover API, and the hover layers answer `isPresent`
// from `:popover-open`.
beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    return originalMatches.call(this, selector);
  };
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = originalMatches;
});

// jsdom does not implement showModal/close.
beforeEach(() => {
  vi.mocked(HTMLElement.prototype.showPopover).mockClear();
  vi.mocked(HTMLElement.prototype.hidePopover).mockClear();
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

afterEach(() => {
  resetLayerStackForTests();
});

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

function fireCancel(dialog: Element): Event {
  const event = new Event('cancel', {bubbles: false, cancelable: true});
  dialog.dispatchEvent(event);
  return event;
}

const getDialog = (label: string) =>
  screen
    .getAllByRole('dialog', {hidden: true})
    .find(d => d.getAttribute('aria-label') === label)!;

const MEDIA = {src: '/photo.jpg', alt: 'A photo'};

describe('overlay families on the shared dismissal stack', () => {
  describe('Lightbox', () => {
    it('takes the Escape when it is open over a required Dialog', () => {
      const onLightboxChange = vi.fn();
      const onDialogChange = vi.fn();

      render(
        <Dialog
          isOpen={true}
          onOpenChange={onDialogChange}
          purpose="required"
          aria-label="Required">
          Choose one
          <Lightbox
            isOpen={true}
            onOpenChange={onLightboxChange}
            media={MEDIA}
          />
        </Dialog>,
      );

      const event = pressEscape();

      expect(onLightboxChange).toHaveBeenCalledWith(false);
      expect(onDialogChange).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('closes on a browser-initiated cancel when it is top-most', () => {
      const onOpenChange = vi.fn();
      render(
        <Lightbox isOpen={true} onOpenChange={onOpenChange} media={MEDIA} />,
      );

      const event = fireCancel(screen.getByRole('dialog', {hidden: true}));

      expect(event.defaultPrevented).toBe(true);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('stays open on a browser-initiated cancel when it is not top-most', () => {
      const onLightboxChange = vi.fn();

      render(
        <>
          <Lightbox
            isOpen={true}
            onOpenChange={onLightboxChange}
            media={MEDIA}
          />
          <Dialog isOpen={true} onOpenChange={() => {}} aria-label="Above">
            Above
          </Dialog>
        </>,
      );

      const event = fireCancel(getDialog('A photo'));

      expect(event.defaultPrevented).toBe(true);
      expect(onLightboxChange).not.toHaveBeenCalled();
    });
  });

  describe('MobileNav', () => {
    it('takes the Escape when it opens over a required Dialog', () => {
      const onNavChange = vi.fn();
      const onDialogChange = vi.fn();

      render(
        <>
          <Dialog
            isOpen={true}
            onOpenChange={onDialogChange}
            purpose="required"
            aria-label="Required">
            Choose one
          </Dialog>
          <MobileNav isOpen={true} onOpenChange={onNavChange} label="Drawer">
            <span>Nav content</span>
          </MobileNav>
        </>,
      );

      const event = pressEscape();

      expect(onNavChange).toHaveBeenCalledWith(false);
      expect(onDialogChange).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('closes on a browser-initiated cancel when it is top-most', () => {
      const onOpenChange = vi.fn();
      render(
        <MobileNav isOpen={true} onOpenChange={onOpenChange} label="Drawer">
          <span>Nav content</span>
        </MobileNav>,
      );

      const event = fireCancel(getDialog('Drawer'));

      expect(event.defaultPrevented).toBe(true);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('stays open on a browser-initiated cancel when it is not top-most', () => {
      const onNavChange = vi.fn();

      render(
        <MobileNav isOpen={true} onOpenChange={onNavChange} label="Drawer">
          <span>Nav content</span>
          <Dialog isOpen={true} onOpenChange={() => {}} aria-label="Above">
            Above
          </Dialog>
        </MobileNav>,
      );

      const event = fireCancel(getDialog('Drawer'));

      expect(event.defaultPrevented).toBe(true);
      expect(onNavChange).not.toHaveBeenCalled();
    });
  });

  describe('BottomSheet', () => {
    function SheetWithDialog({onSheetChange}: {onSheetChange: () => void}) {
      const [isDialogOpen, setIsDialogOpen] = useState(true);
      return (
        <BottomSheet
          isOpen={true}
          onOpenChange={onSheetChange}
          hasScrim={false}
          label="Sheet">
          <Dialog
            isOpen={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            aria-label="Nested">
            Nested
          </Dialog>
        </BottomSheet>
      );
    }

    it('lets a layer opened inside it take the first Escape', () => {
      const onSheetChange = vi.fn();
      render(<SheetWithDialog onSheetChange={onSheetChange} />);

      let first: KeyboardEvent | undefined;
      act(() => {
        first = pressEscape();
      });

      expect(getDialog('Nested')).not.toHaveAttribute('open');
      expect(onSheetChange).not.toHaveBeenCalled();
      expect(first?.defaultPrevented).toBe(true);

      act(() => {
        pressEscape();
      });

      expect(onSheetChange).toHaveBeenCalledTimes(1);
      expect(onSheetChange).toHaveBeenCalledWith(false);
    });

    it('swallows the press when required, so nothing behind it closes', () => {
      const onSheetChange = vi.fn();
      const onDialogChange = vi.fn();

      render(
        <Dialog isOpen={true} onOpenChange={onDialogChange} aria-label="Host">
          <BottomSheet
            isOpen={true}
            onOpenChange={onSheetChange}
            purpose="required"
            label="Required sheet">
            Choose one
          </BottomSheet>
        </Dialog>,
      );

      const event = pressEscape();

      expect(onSheetChange).not.toHaveBeenCalled();
      expect(onDialogChange).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('stays open on a browser-initiated cancel when it is not top-most', () => {
      const onSheetChange = vi.fn();
      render(<SheetWithDialog onSheetChange={onSheetChange} />);

      const event = fireCancel(getDialog('Sheet'));

      expect(event.defaultPrevented).toBe(true);
      expect(onSheetChange).not.toHaveBeenCalled();
    });

    it('closes on a browser-initiated cancel when it is top-most', () => {
      const onSheetChange = vi.fn();
      render(
        <BottomSheet isOpen={true} onOpenChange={onSheetChange} label="Sheet">
          Content
        </BottomSheet>,
      );

      const event = fireCancel(getDialog('Sheet'));

      expect(event.defaultPrevented).toBe(true);
      expect(onSheetChange).toHaveBeenCalledWith(false);
    });

    it('keeps the press while it animates out, then hands it to the layer below', () => {
      const onDialogChange = vi.fn();
      function ClosingSheet() {
        const [isOpen, setIsOpen] = useState(true);
        return (
          <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Sheet">
            <button type="button" onClick={() => setIsOpen(false)}>
              Close sheet
            </button>
          </BottomSheet>
        );
      }

      render(
        <Dialog isOpen={true} onOpenChange={onDialogChange} aria-label="Host">
          <ClosingSheet />
        </Dialog>,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Close sheet'}));
      expect(getDialog('Sheet')).toHaveAttribute('open');

      pressEscape();
      expect(onDialogChange).not.toHaveBeenCalled();

      fireEvent.transitionEnd(document.querySelector('.astryx-bottom-sheet')!, {
        propertyName: 'transform',
      });
      expect(getDialog('Sheet')).not.toHaveAttribute('open');

      pressEscape();
      expect(onDialogChange).toHaveBeenCalledWith(false);
    });
  });

  describe('required Dialog', () => {
    it('still swallows an Escape when it is alone', () => {
      const onDialogChange = vi.fn();

      render(
        <Dialog
          isOpen={true}
          onOpenChange={onDialogChange}
          purpose="required"
          aria-label="Required">
          Choose one
        </Dialog>,
      );

      const event = pressEscape();

      expect(onDialogChange).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('still swallows an Escape with a Lightbox open UNDER it', () => {
      const onLightboxChange = vi.fn();
      const onDialogChange = vi.fn();

      render(
        <>
          <Lightbox
            isOpen={true}
            onOpenChange={onLightboxChange}
            media={MEDIA}
          />
          <Dialog
            isOpen={true}
            onOpenChange={onDialogChange}
            purpose="required"
            aria-label="Required">
            Choose one
          </Dialog>
        </>,
      );

      pressEscape();

      expect(onDialogChange).not.toHaveBeenCalled();
      expect(onLightboxChange).not.toHaveBeenCalled();
    });
  });

  // Controlled follows control state for `isOpen`: Escape still attempts the
  // close, but only the caller's update function may perform it. Dialog has
  // always worked this way; these two now do too.
  describe('controlled hover layers', () => {
    it('a controlled HoverCard takes the press and reports instead of hiding', () => {
      const onCardChange = vi.fn();
      const onDialogChange = vi.fn();

      render(
        <Dialog isOpen={true} onOpenChange={onDialogChange} aria-label="Host">
          <HoverCard
            isOpen={true}
            onOpenChange={onCardChange}
            content={<span>Pinned card</span>}>
            <button type="button">Trigger</button>
          </HoverCard>
        </Dialog>,
      );
      onCardChange.mockClear();
      vi.mocked(HTMLElement.prototype.hidePopover).mockClear();

      const event = pressEscape();

      expect(onCardChange).toHaveBeenCalledWith(false);
      expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
      expect(onDialogChange).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('a Tooltip a press pinned takes the Escape first, and the Dialog stays open (spec:AST-003 FR4)', () => {
      const onDialogChange = vi.fn();

      render(
        <Dialog isOpen={true} onOpenChange={onDialogChange} aria-label="Host">
          <Tooltip content="Pinned tip" pressTrigger="toggle">
            <button type="button">Info</button>
          </Tooltip>
        </Dialog>,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Info'}));
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
      expect(screen.getByRole('button', {name: 'Info'})).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      vi.mocked(HTMLElement.prototype.hidePopover).mockClear();

      let event = new KeyboardEvent('keydown');
      act(() => {
        event = pressEscape();
      });

      expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
      expect(screen.getByRole('button', {name: 'Info'})).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      expect(onDialogChange).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('a HoverCard a press pinned takes the Escape first, and the Dialog stays open (spec:AST-003 FR4)', () => {
      const onDialogChange = vi.fn();

      render(
        <Dialog isOpen={true} onOpenChange={onDialogChange} aria-label="Host">
          <HoverCard
            content={<p>Pinned card</p>}
            label="Profile"
            pressTrigger="toggle">
            <button type="button">Ada</button>
          </HoverCard>
        </Dialog>,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Ada'}));
      expect(screen.getByRole('button', {name: 'Ada'})).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      vi.mocked(HTMLElement.prototype.hidePopover).mockClear();

      const event = pressEscape();

      expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
      expect(onDialogChange).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('a controlled HoverCard a press pinned takes the Escape first and reports it, and the Dialog stays open (spec:AST-003 FR4)', () => {
      const onDialogChange = vi.fn();
      const onCardChange = vi.fn();
      function ControlledCard() {
        const [isOpen, setIsOpen] = useState(false);
        return (
          <HoverCard
            content={<p>Pinned card</p>}
            label="Profile"
            pressTrigger="toggle"
            isOpen={isOpen}
            onOpenChange={next => {
              onCardChange(next);
              setIsOpen(next);
            }}>
            <button type="button">Ada</button>
          </HoverCard>
        );
      }

      render(
        <Dialog isOpen={true} onOpenChange={onDialogChange} aria-label="Host">
          <ControlledCard />
        </Dialog>,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Ada'}));
      expect(onCardChange).toHaveBeenLastCalledWith(true);
      expect(screen.getByRole('button', {name: 'Ada'})).toHaveAttribute(
        'aria-expanded',
        'true',
      );

      let event = new KeyboardEvent('keydown');
      act(() => {
        event = pressEscape();
      });

      expect(onCardChange).toHaveBeenLastCalledWith(false);
      expect(onDialogChange).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('a controlled Tooltip takes the press and reports instead of hiding', () => {
      const onTipChange = vi.fn();
      const onDialogChange = vi.fn();

      render(
        <Dialog isOpen={true} onOpenChange={onDialogChange} aria-label="Host">
          <Tooltip
            isOpen={true}
            onOpenChange={onTipChange}
            content="Pinned tip">
            <button type="button">Trigger</button>
          </Tooltip>
        </Dialog>,
      );
      onTipChange.mockClear();
      vi.mocked(HTMLElement.prototype.hidePopover).mockClear();

      const event = pressEscape();

      expect(onTipChange).toHaveBeenCalledWith(false);
      expect(HTMLElement.prototype.hidePopover).not.toHaveBeenCalled();
      expect(onDialogChange).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves the Dialog unclosable when the consumer discards the request', () => {
      // The round-6 regression, now by consumer choice rather than by ours: a
      // layer that holds itself open and ignores its own change handler keeps
      // taking the press, and nothing behind it can be reached.
      const onCardChange = vi.fn();
      const onDialogChange = vi.fn();

      render(
        <Dialog isOpen={true} onOpenChange={onDialogChange} aria-label="Host">
          <HoverCard
            isOpen={true}
            onOpenChange={onCardChange}
            content={<span>Stuck card</span>}>
            <button type="button">Trigger</button>
          </HoverCard>
        </Dialog>,
      );
      onCardChange.mockClear();

      pressEscape();
      pressEscape();

      expect(onCardChange).toHaveBeenCalledTimes(2);
      expect(onDialogChange).not.toHaveBeenCalled();
    });
  });
});
