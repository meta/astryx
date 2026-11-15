// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerClickBoundary.test.tsx
 * @input Uses React Testing Library, every layer root (Popover, Dialog, Drawer,
 *   Lightbox, MobileNav, BottomSheet, ToastViewport), ClickableCard,
 *   ContextMenu, BaseTypeahead, SelectableCard, Tooltip and
 *   useKeepLayerOpenProps
 * @output A press inside a layer stops at the layer root in the React tree,
 *   and the native press still reaches document listeners (ContextMenu's
 *   outside mousedown, Typeahead's deferred click, the keep-open pointerup);
 *   SelectableCard's compatibility path until the next minor.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useEffect, type ReactNode} from 'react';
import {Popover} from '../Popover/Popover';
import {Dialog} from '../Dialog/Dialog';
import {Drawer} from '../Drawer/Drawer';
import {Lightbox} from '../Lightbox/Lightbox';
import {MobileNav} from '../MobileNav/MobileNav';
import {BottomSheet} from '../BottomSheet/BottomSheet';
import {BottomSheetSwitcher} from '../BottomSheet/BottomSheetSwitcher';
import {ToastViewport} from '../Toast/ToastViewport';
import {useToast} from '../Toast/useToast';
import {ClickableCard} from '../ClickableCard/ClickableCard';
import {ContextMenu} from '../ContextMenu/ContextMenu';
import {BaseTypeahead} from '../Typeahead/BaseTypeahead';
import {SelectableCard} from '../SelectableCard/SelectableCard';
import {Tooltip} from '../Tooltip/Tooltip';
import {Button} from '../Button/Button';
import {useKeepLayerOpenProps} from './useLayer';
import type {SearchSource, SearchableItem} from '../Typeahead/types';

function press(target: Element) {
  fireEvent.pointerDown(target);
  fireEvent.mouseDown(target);
  fireEvent.pointerUp(target);
  fireEvent.mouseUp(target);
  fireEvent.click(target);
}

describe('layer click boundary (layer-runtime INV17)', () => {
  it('stops a press inside a popover at its root, after the handlers inside ran', () => {
    const inner = vi.fn();
    const ancestor = {
      click: vi.fn(),
      pointerDown: vi.fn(),
      mouseDown: vi.fn(),
      clickCapture: vi.fn(),
    };
    const documentClick = vi.fn();
    document.addEventListener('click', documentClick);
    try {
      render(
        <div
          onClick={ancestor.click}
          onPointerDown={ancestor.pointerDown}
          onMouseDown={ancestor.mouseDown}
          onClickCapture={ancestor.clickCapture}>
          <Popover
            isOpen
            label="Details"
            content={
              <button type="button" onClick={inner}>
                Inside
              </button>
            }>
            <button type="button">Trigger</button>
          </Popover>
        </div>,
      );
      press(screen.getByRole('button', {name: 'Inside', hidden: true}));

      expect(inner).toHaveBeenCalledTimes(1);
      expect(ancestor.click).not.toHaveBeenCalled();
      expect(ancestor.pointerDown).not.toHaveBeenCalled();
      expect(ancestor.mouseDown).not.toHaveBeenCalled();
      // Capture-phase ancestors run before the stop.
      expect(ancestor.clickCapture).toHaveBeenCalledTimes(1);
      // The native press is not stopped.
      expect(documentClick).toHaveBeenCalledTimes(1);

      // Positive control: a press outside the layer still reaches the
      // ancestor.
      press(screen.getByRole('button', {name: 'Trigger'}));
      expect(ancestor.click).toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', documentClick);
    }
  });

  it('stops a press inside a nested layer at its own root', () => {
    const outerContent = vi.fn();
    render(
      <Popover
        isOpen
        label="Outer"
        content={
          <div onClick={outerContent}>
            <Popover isOpen label="Inner" content={<span>Inner text</span>}>
              <button type="button">Inner trigger</button>
            </Popover>
          </div>
        }>
        <button type="button">Outer trigger</button>
      </Popover>,
    );
    press(screen.getByText('Inner text'));
    expect(outerContent).not.toHaveBeenCalled();
  });

  describe('every kind of layer root', () => {
    const {showModal, close} = HTMLDialogElement.prototype;
    beforeEach(() => {
      HTMLDialogElement.prototype.showModal = function (
        this: HTMLDialogElement,
      ) {
        this.setAttribute('open', '');
      };
      HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };
    });
    afterEach(() => {
      // Unmount while the stubs still exist: closing calls dialog.close().
      cleanup();
      HTMLDialogElement.prototype.showModal = showModal;
      HTMLDialogElement.prototype.close = close;
    });

    function ShowToast() {
      const toast = useToast();
      useEffect(() => {
        toast({body: 'Root text', isAutoHide: false});
      }, [toast]);
      return null;
    }

    const roots: [string, () => ReactNode][] = [
      [
        'an inline useLayer layer',
        () => (
          <Popover isOpen label="Details" content={<span>Root text</span>}>
            <button type="button">Trigger</button>
          </Popover>
        ),
      ],
      [
        'a portaled useLayer layer',
        () => (
          <ul>
            <li>
              <Popover isOpen label="Details" content={<span>Root text</span>}>
                <button type="button">Trigger</button>
              </Popover>
            </li>
          </ul>
        ),
      ],
      [
        'Dialog',
        () => (
          <Dialog isOpen onOpenChange={() => {}}>
            <p>Root text</p>
          </Dialog>
        ),
      ],
      [
        'Drawer',
        () => (
          <Drawer isOpen onOpenChange={() => {}} label="Details">
            Root text
          </Drawer>
        ),
      ],
      [
        'Lightbox',
        () => (
          <Lightbox
            isOpen
            onOpenChange={() => {}}
            media={[{src: '/photo.jpg', alt: 'Root text'}]}
          />
        ),
      ],
      [
        'MobileNav',
        () => (
          <MobileNav isOpen onOpenChange={() => {}}>
            <span>Root text</span>
          </MobileNav>
        ),
      ],
      [
        'BottomSheetPanel',
        () => (
          <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
            Root text
          </BottomSheet>
        ),
      ],
      [
        'ToastViewport',
        () => (
          <ToastViewport isTopLayer={false}>
            <ShowToast />
          </ToastViewport>
        ),
      ],
    ];

    const target = () =>
      screen.queryByText('Root text') ?? screen.getByAltText('Root text');

    it.each(roots)(
      'a press inside %s reaches no plain wrapper bubble handler',
      async (_name, renderRoot) => {
        const wrapper = {
          click: vi.fn(),
          pointerDown: vi.fn(),
          gotCapture: vi.fn(),
          lostCapture: vi.fn(),
        };
        render(
          <div
            onClick={wrapper.click}
            onPointerDown={wrapper.pointerDown}
            onGotPointerCapture={wrapper.gotCapture}
            onLostPointerCapture={wrapper.lostCapture}>
            {renderRoot()}
          </div>,
        );
        await waitFor(() => expect(target()).toBeInTheDocument());
        press(target());
        // A drag handle or slider inside the layer taking and releasing
        // pointer capture.
        fireEvent(target(), new Event('gotpointercapture', {bubbles: true}));
        fireEvent(target(), new Event('lostpointercapture', {bubbles: true}));
        expect(wrapper.click).not.toHaveBeenCalled();
        expect(wrapper.pointerDown).not.toHaveBeenCalled();
        expect(wrapper.gotCapture).not.toHaveBeenCalled();
        expect(wrapper.lostCapture).not.toHaveBeenCalled();
      },
    );

    it.each(roots)(
      'a press inside %s does not activate a ClickableCard around it',
      async (_name, renderRoot) => {
        const onClick = vi.fn();
        render(
          <ClickableCard label="Card" onClick={onClick}>
            {renderRoot()}
          </ClickableCard>,
        );
        await waitFor(() => expect(target()).toBeInTheDocument());
        press(target());
        expect(onClick).not.toHaveBeenCalled();
      },
    );

    it("a BottomSheetSwitcher's forwarded handlers still receive presses on sheet content", () => {
      const switcher = {click: vi.fn(), pointerDown: vi.fn()};
      const wrapperClick = vi.fn();
      render(
        <div onClick={wrapperClick}>
          <BottomSheetSwitcher
            activeSheet="details"
            onActiveSheetChange={() => {}}
            onClick={switcher.click}
            onPointerDown={switcher.pointerDown}>
            <BottomSheet sheetId="details" label="Details">
              Step text
            </BottomSheet>
          </BottomSheetSwitcher>
        </div>,
      );
      press(screen.getByText('Step text'));
      // The switcher forwards these to the step's dialog.
      expect(switcher.click).toHaveBeenCalledTimes(1);
      expect(switcher.pointerDown).toHaveBeenCalledTimes(1);
      expect(wrapperClick).not.toHaveBeenCalled();
    });

    it("runs the root's own onClick before the stop (Dialog)", () => {
      const ancestorClick = vi.fn();
      const dialogClick = vi.fn();
      render(
        <div onClick={ancestorClick}>
          <Dialog isOpen onOpenChange={() => {}} onClick={dialogClick}>
            <p>Dialog text</p>
          </Dialog>
        </div>,
      );
      press(screen.getByText('Dialog text'));
      expect(dialogClick).toHaveBeenCalledTimes(1);
      expect(ancestorClick).not.toHaveBeenCalled();
    });
  });
});

describe('document listeners still receive presses inside a layer', () => {
  it("ContextMenu's outside mousedown closes it for a press inside an open popover", () => {
    const onOpenChange = vi.fn<(isOpen: boolean) => void>();
    render(
      <>
        <ContextMenu items={[{label: 'Cut'}]} onOpenChange={onOpenChange}>
          <div>Right-click me</div>
        </ContextMenu>
        <Popover isOpen label="Details" content={<span>Popover text</span>}>
          <button type="button">Trigger</button>
        </Popover>
      </>,
    );
    fireEvent.contextMenu(screen.getByText('Right-click me'));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.pointerDown(screen.getByText('Popover text'), {
      pointerType: 'mouse',
      pointerId: 7,
    });
    fireEvent.mouseDown(screen.getByText('Popover text'));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('a Typeahead inside a popover opens its list on the deferred document click', async () => {
    const fruits: SearchableItem[] = [
      {id: 'apple', label: 'Apple'},
      {id: 'banana', label: 'Banana'},
    ];
    const source: SearchSource = {
      bootstrap: () => fruits,
      search: query =>
        fruits.filter(item => item.label.toLowerCase().includes(query)),
    };
    render(
      <Popover
        isOpen
        label="Filters"
        content={
          <BaseTypeahead
            searchSource={source}
            value={null}
            onChange={() => {}}
            hasEntriesOnFocus
            debounceMs={0}
          />
        }>
        <button type="button">Trigger</button>
      </Popover>,
    );
    const input = screen.getByRole('combobox', {hidden: true});
    // The press focuses the input; the list's show waits for the press's
    // click on the document, then a frame.
    fireEvent.pointerDown(input);
    act(() => {
      input.focus();
    });
    fireEvent.pointerUp(input);
    fireEvent.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('a keep-open control inside a popover releases its invoker on the document pointerup', async () => {
    function KeepOpen() {
      const props = useKeepLayerOpenProps('some-layer', true);
      return (
        <button type="button" {...props}>
          Keep open
        </button>
      );
    }
    render(
      <Popover isOpen label="Details" content={<KeepOpen />}>
        <button type="button">Trigger</button>
      </Popover>,
    );
    const control = screen.getByRole('button', {
      name: 'Keep open',
      hidden: true,
    });
    fireEvent.pointerDown(control);
    expect(control).toHaveAttribute('popovertarget', 'some-layer');
    fireEvent.pointerUp(control);
    await waitFor(() => {
      expect(control).not.toHaveAttribute('popovertarget');
    });
  });
});

// Until the next minor, the caller's onClick still runs for a click inside an
// open layer within the card, during capture, and the card does not toggle.
describe('SelectableCard compatibility until the next minor', () => {
  it("still calls the caller's onClick for a click inside an open tooltip, without toggling", () => {
    const onClick = vi.fn();
    const onChange = vi.fn();
    render(
      <SelectableCard
        label="Plan"
        isSelected={false}
        onChange={onChange}
        onClick={onClick}>
        <Tooltip content="Tooltip text" isOpen>
          <span tabIndex={0}>Info</span>
        </Tooltip>
        <span>Card body</span>
      </SelectableCard>,
    );
    fireEvent.click(screen.getByText('Tooltip text'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Card body'));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('a caller onClick that stops propagation does not block a control inside the layer', () => {
    const inside = vi.fn();
    const onClick = vi.fn((event: {stopPropagation: () => void}) => {
      event.stopPropagation();
    });
    render(
      <SelectableCard
        label="Plan"
        isSelected={false}
        onChange={() => {}}
        onClick={onClick}>
        <Popover
          isOpen
          label="Details"
          content={
            <button type="button" onClick={inside}>
              Inside
            </button>
          }>
          <button type="button">Trigger</button>
        </Popover>
      </SelectableCard>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Inside', hidden: true}));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(inside).toHaveBeenCalledTimes(1);
  });

  it("a caller onClick that prevents default does not cancel a Button's clickAction inside the layer, and the default stays cancelled", () => {
    const clickAction = vi.fn();
    render(
      <SelectableCard
        label="Plan"
        isSelected={false}
        onChange={() => {}}
        onClick={event => event.preventDefault()}>
        <Popover
          isOpen
          label="Details"
          content={<Button label="Apply" clickAction={clickAction} />}>
          <button type="button">Trigger</button>
        </Popover>
      </SelectableCard>,
    );
    const isNotCancelled = fireEvent.click(
      screen.getByRole('button', {name: 'Apply', hidden: true}),
    );
    expect(clickAction).toHaveBeenCalledTimes(1);
    expect(isNotCancelled).toBe(false);
  });

  it('calls onClick once for a click inside a caller-written popover, which is not a layer root', () => {
    const onClick = vi.fn();
    render(
      <SelectableCard
        label="Plan"
        isSelected={false}
        onChange={() => {}}
        onClick={onClick}>
        <div popover="manual">Own popover text</div>
      </SelectableCard>,
    );
    fireEvent.click(screen.getByText('Own popover text'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
