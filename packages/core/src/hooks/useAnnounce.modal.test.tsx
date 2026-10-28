// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file useAnnounce.modal.test.tsx
 * @input Uses vitest, Testing Library, useAnnounce, and the Astryx modals
 * @output Proof of spec:AST-086 FR14: a message follows the nearest open
 *   native modal enclosing its caller — inside an Astryx Dialog, modal
 *   BottomSheet, modal Drawer or Lightbox it reaches that dialog's own
 *   persistent containers; a caller outside, or inside a non-modal sheet
 *   with no modal above it, keeps the shared channel; a non-modal sheet
 *   nested in a modal routes to the modal; a modal over a modal routes to
 *   the top one; a message unexposed when its modal closes is handed to the
 *   channel exposed after the close; join, identical-repeat and empty-message
 *   rules hold inside the dialog
 * @position Core a11y tests beside the hook
 */
import {act, fireEvent, render, screen} from '@testing-library/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {BottomSheet} from '../BottomSheet/BottomSheet';
import {Dialog} from '../Dialog/Dialog';
import {Drawer} from '../Drawer/Drawer';
import {BottomSheetSwitcher} from '../BottomSheet/BottomSheetSwitcher';
import {Lightbox} from '../Lightbox/Lightbox';
import {MobileNav} from '../MobileNav/MobileNav';
import {Popover} from '../Popover/Popover';
import {DropdownMenu} from '../DropdownMenu/DropdownMenu';
import {useBusyAnnouncement} from './useBusyAnnouncement';
import {ModalAnnounceProvider} from './ModalAnnounceProvider';
import {__resetLiveRegionsForTest, useAnnounce} from './useAnnounce';

function Owner({
  message = 'Added Design',
  urgency,
  label = 'Say',
}: {
  message?: string;
  urgency?: 'assertive';
  label?: string;
}) {
  const announce = useAnnounce();
  return (
    <button type="button" onClick={() => announce(message, urgency)}>
      {label}
    </button>
  );
}

function TwoMessageOwner() {
  const announce = useAnnounce();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          announce('Added Design');
          announce('Removed Eng');
        }}>
        Both
      </button>
      <button type="button" onClick={() => announce('Loading')}>
        Busy
      </button>
      <button type="button" onClick={() => announce('')}>
        Withdraw
      </button>
    </>
  );
}

/** jsdom has no showModal(); stand in for a dialog opened modally. */
function stubDialogs() {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
    this.dataset.modal = 'true';
  });
  HTMLDialogElement.prototype.show = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    delete this.dataset.modal;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    delete this.dataset.modal;
    this.dispatchEvent(new Event('close'));
  });
  const matches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':modal'
      ? this instanceof HTMLDialogElement &&
          this.open &&
          this.dataset.modal === 'true'
      : matches.call(this, selector);
  });
}

async function nextFrame() {
  await act(
    async () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
  );
}

const shared = (politeness = 'polite') =>
  document.querySelector(`[data-astryx-live-region="${politeness}"]`);
const regionIn = (dialog: Element, politeness = 'polite') =>
  dialog.querySelector(
    `:scope > [data-astryx-modal-live-region="${politeness}"]`,
  );

beforeEach(() => {
  __resetLiveRegionsForTest();
  stubDialogs();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAnnounce inside Astryx modals (spec:AST-086 FR14)', () => {
  it('uses the shared channel outside any modal', async () => {
    render(<Owner />);
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    await nextFrame();
    expect(shared()).toHaveTextContent('Added Design');
    expect(
      document.querySelector('[data-astryx-modal-live-region]'),
    ).toBeNull();
  });

  it.each([
    [
      'Dialog',
      (children: ReactNode) => (
        <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
          {children}
        </Dialog>
      ),
    ],
    [
      'modal BottomSheet',
      (children: ReactNode) => (
        <BottomSheet isOpen onOpenChange={() => {}} label="Modal">
          {children}
        </BottomSheet>
      ),
    ],
    [
      'modal Drawer',
      (children: ReactNode) => (
        <Drawer isOpen onOpenChange={() => {}} label="Modal">
          {children}
        </Drawer>
      ),
    ],
  ] as const)(
    'routes a caller inside an open %s into that dialog, not the shared channel',
    async (_name, wrap) => {
      render(wrap(<Owner />));
      const dialog = screen.getByRole('dialog', {name: 'Modal'});
      expect(dialog.matches(':modal')).toBe(true);
      fireEvent.click(screen.getByRole('button', {name: 'Say'}));
      // Inserted empty (FR3), filled on the next frame.
      const region = regionIn(dialog);
      expect(region).not.toBeNull();
      expect(region).toHaveAttribute('role', 'status');
      expect(region).toHaveAttribute('aria-live', 'polite');
      expect(region).toHaveTextContent('');
      await nextFrame();
      expect(region).toHaveTextContent('Added Design');
      expect(shared()?.textContent ?? '').toBe('');
    },
  );

  it("routes a caller inside a Popover's bottom-sheet presentation into that sheet", async () => {
    // Popover's `presentation="bottom-sheet"` lazily renders the shared
    // BottomSheet, so the provider BottomSheet renders covers it.
    render(
      <Popover label="Filters" presentation="bottom-sheet" content={<Owner />}>
        <button type="button">Filter</button>
      </Popover>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Filter'}));
    const dialog = await screen.findByRole('dialog', {name: 'Filters'});
    await screen.findByRole('button', {name: 'Say'});
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    await nextFrame();
    expect(regionIn(dialog)).toHaveTextContent('Added Design');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it("routes a caller inside a DropdownMenu's bottom-sheet presentation into that sheet", async () => {
    render(
      <DropdownMenu
        button={{label: 'Project actions'}}
        presentation="bottom-sheet"
        items={[{label: 'Edit project', onClick: () => {}}]}
        footer={<Owner />}
      />,
    );
    fireEvent.click(screen.getByRole('button', {name: /Project actions/}));
    const dialog = await screen.findByRole('dialog', {name: 'Project actions'});
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    await nextFrame();
    expect(regionIn(dialog)).toHaveTextContent('Added Design');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('holds no MutationObserver for a dialog closed at rest; observes from the open intent until the real close (runtime INV5)', async () => {
    // The provider's watch is the one filtering on open/inert/aria-hidden.
    const isPresentationWatch = (options?: MutationObserverInit) =>
      options?.attributeFilter?.join() === 'open,inert,aria-hidden';
    const observed: Node[] = [];
    const disconnected: number[] = [];
    const Original = globalThis.MutationObserver;
    class Counting extends Original {
      #isWatch = false;
      observe(target: Node, options?: MutationObserverInit) {
        if (isPresentationWatch(options)) {
          this.#isWatch = true;
          observed.push(target);
        }
        super.observe(target, options);
      }
      disconnect() {
        if (this.#isWatch) {
          disconnected.push(1);
        }
        super.disconnect();
      }
    }
    vi.stubGlobal('MutationObserver', Counting);
    try {
      function Closed({isOpen}: {isOpen: boolean}) {
        return (
          <BottomSheet isOpen={isOpen} onOpenChange={() => {}} label="Rest">
            <Owner />
          </BottomSheet>
        );
      }
      const {rerender} = render(<Closed isOpen={false} />);
      expect(observed).toHaveLength(0);
      rerender(<Closed isOpen />);
      await nextFrame();
      expect(observed).toHaveLength(1);
      expect(observed[0]).toBe(screen.getByRole('dialog', {name: 'Rest'}));
      const before = disconnected.length;
      rerender(<Closed isOpen={false} />);
      // The sheet runs its exit, then closes the dialog for real.
      fireEvent.transitionEnd(document.querySelector('.astryx-bottom-sheet')!, {
        propertyName: 'transform',
      });
      await nextFrame();
      await nextFrame();
      expect(disconnected.length).toBeGreaterThan(before);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('routes a caller inside an open Lightbox into its dialog', async () => {
    // Lightbox renders no children; a caption is content inside its dialog.
    render(
      <Lightbox
        isOpen
        onOpenChange={() => {}}
        media={{src: '/photo.jpg', alt: 'Photo', caption: <Owner />}}
      />,
    );
    const dialog = screen.getByRole('dialog', {name: 'Photo'});
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    await nextFrame();
    expect(regionIn(dialog)).toHaveTextContent('Added Design');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('keeps the shared channel inside a non-modal sheet with no modal above it', async () => {
    render(
      <BottomSheet
        isOpen
        onOpenChange={() => {}}
        hasScrim={false}
        label="Sheet">
        <Owner />
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog', {name: 'Sheet'});
    expect(dialog.matches(':modal')).toBe(false);
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    await nextFrame();
    expect(shared()).toHaveTextContent('Added Design');
    expect(regionIn(dialog)).toBeNull();
  });

  it('routes a caller inside a non-modal sheet nested in a Dialog to the Dialog', async () => {
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
        <BottomSheet
          isOpen
          onOpenChange={() => {}}
          hasScrim={false}
          label="Sheet">
          <Owner />
        </BottomSheet>
      </Dialog>,
    );
    const modal = screen.getByRole('dialog', {name: 'Modal'});
    const sheet = screen.getByRole('dialog', {name: 'Sheet'});
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    await nextFrame();
    expect(regionIn(modal)).toHaveTextContent('Added Design');
    expect(regionIn(sheet)).toBeNull();
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('routes a caller inside a modal over a modal to the top one', async () => {
    function Host() {
      const [isUpperOpen, setIsUpperOpen] = useState(false);
      return (
        <Dialog isOpen onOpenChange={() => {}} aria-label="Lower">
          <Owner label="Lower say" message="Lower words" />
          <button type="button" onClick={() => setIsUpperOpen(true)}>
            Open upper
          </button>
          <Dialog
            isOpen={isUpperOpen}
            onOpenChange={setIsUpperOpen}
            aria-label="Upper">
            <Owner label="Upper say" message="Upper words" />
          </Dialog>
        </Dialog>
      );
    }
    render(<Host />);
    const lower = screen.getByRole('dialog', {name: 'Lower'});
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Open upper'}));
    const upper = screen.getByRole('dialog', {name: 'Upper'});
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Upper say'}));
    fireEvent.click(screen.getByRole('button', {name: 'Lower say'}));
    await nextFrame();
    expect(regionIn(upper)).toHaveTextContent('Upper words');
    // The lower modal is covered: its owner is not operable until the upper
    // one closes, and a message it announces meanwhile is not heard — its
    // container is clear before it is on top again (FR14).
    expect(regionIn(lower)?.textContent ?? '').toBe('');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('clears words a modal received while covered before it is on top again (FR14)', async () => {
    function Host() {
      const [isUpperOpen, setIsUpperOpen] = useState(false);
      return (
        <Dialog isOpen onOpenChange={() => {}} aria-label="Lower">
          <Owner label="Lower say" message="Lower words" />
          <button type="button" onClick={() => setIsUpperOpen(true)}>
            Cover
          </button>
          <Dialog
            isOpen={isUpperOpen}
            onOpenChange={setIsUpperOpen}
            aria-label="Upper">
            <button type="button" onClick={() => setIsUpperOpen(false)}>
              Uncover
            </button>
          </Dialog>
        </Dialog>
      );
    }
    render(<Host />);
    const lower = screen.getByRole('dialog', {name: 'Lower'});
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Cover'}));
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Lower say'}));
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Uncover'}));
    await nextFrame();
    await nextFrame();
    // On top again within the clear delay, holding nothing from the time it
    // was covered.
    expect(lower.matches(':modal')).toBe(true);
    expect(regionIn(lower)?.textContent ?? '').toBe('');
    expect(shared()?.textContent ?? '').toBe('');
    // Heard again now that it is on top.
    fireEvent.click(screen.getByRole('button', {name: 'Lower say'}));
    await nextFrame();
    expect(regionIn(lower)).toHaveTextContent('Lower words');
  });

  it('routes a message announced in the commit that opens its Dialog into the Dialog (the field error a mounting form announces)', async () => {
    function FieldError() {
      const announce = useAnnounce();
      useEffect(() => {
        // The Dialog presents from its own Effect, which runs after this one.
        announce('Name is required', 'assertive');
      }, [announce]);
      return <span>Name is required</span>;
    }
    function Host() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open
          </button>
          {isOpen && (
            <Dialog isOpen onOpenChange={setIsOpen} aria-label="Edit">
              <FieldError />
            </Dialog>
          )}
        </>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', {name: 'Open'}));
    const dialog = screen.getByRole('dialog', {name: 'Edit'});
    expect(dialog.matches(':modal')).toBe(true);
    await nextFrame();
    await nextFrame();
    expect(regionIn(dialog, 'assertive')).toHaveTextContent('Name is required');
    expect(shared('assertive')?.textContent ?? '').toBe('');
  });

  it('lets an empty message in the commit that opens the Dialog withdraw a message deferred in that commit (FR9)', async () => {
    function FieldError() {
      const announce = useAnnounce();
      useEffect(() => {
        announce('Name is required', 'assertive');
        // Taken back in the same commit, before the Dialog has presented.
        announce('', 'assertive');
      }, [announce]);
      return <span>Name</span>;
    }
    function Host() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>
            Open
          </button>
          {isOpen && (
            <Dialog isOpen onOpenChange={setIsOpen} aria-label="Edit">
              <FieldError />
            </Dialog>
          )}
        </>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', {name: 'Open'}));
    const dialog = screen.getByRole('dialog', {name: 'Edit'});
    await nextFrame();
    await nextFrame();
    expect(regionIn(dialog, 'assertive')?.textContent ?? '').toBe('');
    expect(shared('assertive')?.textContent ?? '').toBe('');
  });

  it('lets an empty message withdraw a message announced in the same commit inside an already-open Dialog (FR9)', async () => {
    function Pair() {
      const announce = useAnnounce();
      return (
        <button
          type="button"
          onClick={() => {
            announce('3 results');
            announce('');
          }}>
          Pair
        </button>
      );
    }
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
        <Pair />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {name: 'Modal'});
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Pair'}));
    await nextFrame();
    await nextFrame();
    expect(regionIn(dialog)?.textContent ?? '').toBe('');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it("routes a caller inside a closed Dialog (content still mounted) to the shared channel at once, joined with the frame's other messages (FR9)", async () => {
    function Announcer({message}: {message: string}) {
      const announce = useAnnounce();
      useEffect(() => {
        announce(message);
      }, [announce, message]);
      return null;
    }
    render(
      <>
        <Announcer message="Page loaded" />
        <Dialog isOpen={false} onOpenChange={() => {}} aria-label="Closed">
          <Announcer message="Inside closed" />
        </Dialog>
      </>,
    );
    await nextFrame();
    await nextFrame();
    // Both written in one commit, both exposed, in order: neither dropped.
    expect(shared()?.textContent).toBe('Page loaded Inside closed');
    expect(
      document.querySelector('[data-astryx-modal-live-region]'),
    ).toBeNull();
  });

  it.each([
    [
      'Dialog',
      (children: ReactNode) => (
        <Dialog isOpen onOpenChange={() => {}} aria-label="Inner">
          {children}
        </Dialog>
      ),
    ],
    [
      'modal BottomSheet',
      (children: ReactNode) => (
        <BottomSheet isOpen onOpenChange={() => {}} label="Inner">
          {children}
        </BottomSheet>
      ),
    ],
  ] as const)(
    'routes a message announced in the commit that opens a %s inside an already-open Dialog into the inner modal, not the outer one',
    async (_name, wrapInner) => {
      function FieldError() {
        const announce = useAnnounce();
        useEffect(() => {
          announce('Name is required', 'assertive');
        }, [announce]);
        return <span>Name</span>;
      }
      function Host() {
        const [isInnerOpen, setIsInnerOpen] = useState(false);
        return (
          <Dialog isOpen onOpenChange={() => {}} aria-label="Outer">
            <button type="button" onClick={() => setIsInnerOpen(true)}>
              Open inner
            </button>
            {isInnerOpen && wrapInner(<FieldError />)}
          </Dialog>
        );
      }
      render(<Host />);
      const outer = screen.getByRole('dialog', {name: 'Outer'});
      await nextFrame();
      fireEvent.click(screen.getByRole('button', {name: 'Open inner'}));
      const inner = screen.getByRole('dialog', {name: 'Inner'});
      expect(inner.matches(':modal')).toBe(true);
      await nextFrame();
      await nextFrame();
      expect(regionIn(inner, 'assertive')).toHaveTextContent(
        'Name is required',
      );
      expect(regionIn(outer, 'assertive')).toBeNull();
      expect(shared('assertive')?.textContent ?? '').toBe('');
    },
  );

  it('is heard from app code rendered inside a Dialog', async () => {
    function AppForm() {
      const announce = useAnnounce();
      return (
        <form
          onSubmit={event => {
            event.preventDefault();
            announce('Saved');
          }}>
          <button type="submit">Save</button>
        </form>
      );
    }
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Edit">
        <AppForm />
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));
    await nextFrame();
    expect(
      regionIn(screen.getByRole('dialog', {name: 'Edit'})),
    ).toHaveTextContent('Saved');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('joins different messages written before the previous is exposed, says an identical repeat once, and clears on an empty message (FR9, FR5)', async () => {
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
        <TwoMessageOwner />
        <Owner urgency="assertive" message="Failed" label="Fail" />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {name: 'Modal'});
    fireEvent.click(screen.getByRole('button', {name: 'Both'}));
    fireEvent.click(screen.getByRole('button', {name: 'Both'}));
    await nextFrame();
    expect(regionIn(dialog)?.textContent).toBe('Added Design Removed Eng');
    // A message in the frame the words were written still joins.
    fireEvent.click(screen.getByRole('button', {name: 'Busy'}));
    await nextFrame();
    expect(regionIn(dialog)?.textContent).toBe(
      'Added Design Removed Eng Loading',
    );
    // A frame later the words count as exposed: a new message starts fresh.
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Busy'}));
    await nextFrame();
    expect(regionIn(dialog)?.textContent).toBe('Loading');
    // Assertive has its own container.
    fireEvent.click(screen.getByRole('button', {name: 'Fail'}));
    await nextFrame();
    expect(regionIn(dialog, 'assertive')).toHaveAttribute('role', 'alert');
    expect(regionIn(dialog, 'assertive')).toHaveTextContent('Failed');
    expect(regionIn(dialog)?.textContent).toBe('Loading');
    // An empty message withdraws the pending and shown polite text at once.
    fireEvent.click(screen.getByRole('button', {name: 'Both'}));
    fireEvent.click(screen.getByRole('button', {name: 'Withdraw'}));
    await nextFrame();
    expect(regionIn(dialog)?.textContent).toBe('');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('hands a message unexposed when its Dialog closes to the shared channel', async () => {
    function SaveAndClose({onDone}: {onDone: () => void}) {
      const announce = useAnnounce();
      return (
        <button
          type="button"
          onClick={() => {
            announce('Saved');
            onDone();
          }}>
          Save and close
        </button>
      );
    }
    function Host() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <Dialog isOpen={isOpen} onOpenChange={setIsOpen} aria-label="Edit">
          <SaveAndClose onDone={() => setIsOpen(false)} />
        </Dialog>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', {name: 'Save and close'}));
    await nextFrame();
    await nextFrame();
    // Not lost in the closed dialog: the page-body channel has it.
    expect(shared()).toHaveTextContent('Saved');
  });

  it('hands a message unexposed when an upper modal closes to the modal then on top', async () => {
    function Palette({onDone}: {onDone: () => void}) {
      const announce = useAnnounce();
      return (
        <button
          type="button"
          onClick={() => {
            announce('3 results');
            onDone();
          }}>
          Pick
        </button>
      );
    }
    function Host() {
      const [isUpperOpen, setIsUpperOpen] = useState(true);
      return (
        <Dialog isOpen onOpenChange={() => {}} aria-label="Lower">
          <Dialog
            isOpen={isUpperOpen}
            onOpenChange={setIsUpperOpen}
            aria-label="Upper">
            <Palette onDone={() => setIsUpperOpen(false)} />
          </Dialog>
        </Dialog>
      );
    }
    render(<Host />);
    const lower = screen.getByRole('dialog', {name: 'Lower'});
    fireEvent.click(screen.getByRole('button', {name: 'Pick'}));
    await nextFrame();
    await nextFrame();
    expect(regionIn(lower)).toHaveTextContent('3 results');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('keeps a waiting message in a dialog that is closed and shown again in one task (a hand-over, not a close)', async () => {
    // A switcher moves one shared dialog between steps: close() then
    // showModal() in the same task. The native close event must not hand the
    // step's words to the page body the person cannot hear.
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
        <Owner message="80 results" />
      </Dialog>,
    );
    const dialog = document.querySelector<HTMLDialogElement>('dialog')!;
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    act(() => {
      dialog.close();
      dialog.showModal();
    });
    await nextFrame();
    await nextFrame();
    expect(regionIn(dialog)).toHaveTextContent('80 results');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('keeps a waiting message when the dialog is re-presented from a later layout effect', async () => {
    // The entering step is presented in a layout effect of a later commit,
    // not in the task that closed the leaving step.
    function Steps() {
      const [step, setStep] = useState(1);
      const dialogRef = useRef<HTMLDialogElement>(null);
      useLayoutEffect(() => {
        const dialog = dialogRef.current;
        if (dialog != null && !dialog.open) {
          dialog.showModal();
        }
      }, [step]);
      return (
        <Dialog
          ref={dialogRef}
          isOpen
          onOpenChange={() => {}}
          aria-label="Modal">
          <Owner message={`Step ${step} words`} />
          <button
            type="button"
            onClick={() => {
              // Close the dialog as the leaving step would, and move on; the
              // next commit's layout effect presents the entering step.
              dialogRef.current?.close();
              setStep(2);
            }}>
            Next
          </button>
        </Dialog>
      );
    }
    render(<Steps />);
    const dialog = document.querySelector<HTMLDialogElement>('dialog')!;
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    fireEvent.click(screen.getByRole('button', {name: 'Next'}));
    expect(dialog.open).toBe(true);
    await nextFrame();
    await nextFrame();
    expect(regionIn(dialog)).toHaveTextContent('Step 1 words');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('hands a message unexposed when a step closes to the sibling step opened in its place (the modal then on top)', async () => {
    // A flow of sibling modals, as a switcher presents its steps: the leaving
    // step announces and closes in the same update that opens the entering
    // step. The entering step is not an ancestor of the leaving one; it is
    // the modal on top after the close, so the words are delivered there.
    function Flow() {
      const [step, setStep] = useState(1);
      return (
        <>
          <Dialog isOpen={step === 1} onOpenChange={() => {}} aria-label="One">
            <Owner message="Step one saved" label="Say" />
            <button type="button" onClick={() => setStep(2)}>
              Next
            </button>
          </Dialog>
          <Dialog isOpen={step === 2} onOpenChange={() => {}} aria-label="Two">
            <span>Step two</span>
          </Dialog>
        </>
      );
    }
    render(<Flow />);
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    fireEvent.click(screen.getByRole('button', {name: 'Next'}));
    const two = screen.getByRole('dialog', {name: 'Two'});
    await nextFrame();
    await nextFrame();
    expect(regionIn(two)).toHaveTextContent('Step one saved');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('holds words sent as a modal BottomSheet closes — open but inert and aria-hidden through its exit — and delivers them to the page body at the real close', async () => {
    function Host() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Sheet">
          <Owner message="Saved" />
          <button type="button" onClick={() => setIsOpen(false)}>
            Done
          </button>
        </BottomSheet>
      );
    }
    render(<Host />);
    const sheet = document.querySelector<HTMLDialogElement>('dialog')!;
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    // The sheet keeps its dialog open and modal while it leaves, but takes
    // it out of the accessibility tree; the page body is behind an active
    // modal until the dialog closes, so nothing is exposed yet and the
    // words wait.
    expect(sheet.open).toBe(true);
    expect(sheet).toHaveAttribute('aria-hidden', 'true');
    expect(sheet).toHaveAttribute('inert');
    await nextFrame();
    await nextFrame();
    expect(regionIn(sheet)?.textContent ?? '').toBe('');
    expect(shared()?.textContent ?? '').toBe('');
    // The exit motion ends: the dialog closes and the page body is exposed.
    act(() => {
      sheet.close();
    });
    await nextFrame();
    await nextFrame();
    expect(shared()).toHaveTextContent('Saved');
  });
  it('drops held words when an empty message withdraws them while the sheet exits, so nothing is delivered after the close', async () => {
    function Host() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Sheet">
          <TwoMessageOwner />
          <button type="button" onClick={() => setIsOpen(false)}>
            Done
          </button>
        </BottomSheet>
      );
    }
    render(<Host />);
    const sheet = document.querySelector<HTMLDialogElement>('dialog')!;
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Busy'}));
    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    // Held for the real close, as the sheet-exit test shows...
    expect(sheet).toHaveAttribute('inert');
    await nextFrame();
    // ...until the owner takes the words back with an empty message (the
    // exiting sheet is aria-hidden, so reach its control by element).
    fireEvent.click(screen.getByText('Withdraw'));
    act(() => {
      sheet.close();
    });
    await nextFrame();
    await nextFrame();
    expect(shared()?.textContent ?? '').toBe('');
    expect(regionIn(sheet)?.textContent ?? '').toBe('');
  });

  it('hands words sent as a switcher step hands over to the entering step', async () => {
    window.scrollTo = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );
    function Flow() {
      const [activeSheet, setActiveSheet] = useState<string | null>('one');
      return (
        <BottomSheetSwitcher
          activeSheet={activeSheet}
          onActiveSheetChange={setActiveSheet}>
          <BottomSheet sheetId="one" label="One">
            <Owner message="Overview saved" />
            <button type="button" onClick={() => setActiveSheet('two')}>
              Continue
            </button>
          </BottomSheet>
          <BottomSheet sheetId="two" label="Two">
            <span>Step two</span>
          </BottomSheet>
        </BottomSheetSwitcher>
      );
    }
    render(<Flow />);
    const one = screen.getByRole('dialog', {name: 'One'});
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    fireEvent.click(screen.getByRole('button', {name: 'Continue'}));
    const two = screen.getByRole('dialog', {name: 'Two'});
    // The leaving step stays open but inert through its exit; the entering
    // step is the exposed modal.
    expect(one).toHaveAttribute('open');
    expect(one).toHaveAttribute('inert');
    expect(two.matches(':modal')).toBe(true);
    await nextFrame();
    await nextFrame();
    expect(regionIn(two)).toHaveTextContent('Overview saved');
    expect(regionIn(one)?.textContent ?? '').toBe('');
    expect(shared()?.textContent ?? '').toBe('');
    vi.unstubAllGlobals();
  });

  it('hands words sent just before an open Dialog is unmounted to the shared channel', async () => {
    function Host() {
      const [isOpen, setIsOpen] = useState(true);
      return isOpen ? (
        <Dialog isOpen onOpenChange={() => {}} aria-label="Edit">
          <Owner message="Saved" />
          <button type="button" onClick={() => setIsOpen(false)}>
            Remove
          </button>
        </Dialog>
      ) : null;
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    fireEvent.click(screen.getByRole('button', {name: 'Remove'}));
    expect(screen.queryByRole('dialog')).toBeNull();
    await nextFrame();
    await nextFrame();
    expect(shared()).toHaveTextContent('Saved');
  });

  it('announces a busy start inside a native modal an app renders without Astryx, opened inside a Dialog, in the app modal (FR14)', async () => {
    function BusyThing({isBusy}: {isBusy: boolean}) {
      const ref = useRef<HTMLDivElement>(null);
      useBusyAnnouncement(isBusy, 'Loading', ref);
      return <div ref={ref}>thing</div>;
    }
    function Host() {
      const appDialogRef = useRef<HTMLDialogElement>(null);
      const [isBusy, setIsBusy] = useState(false);
      useLayoutEffect(() => {
        appDialogRef.current?.showModal();
      }, []);
      return (
        <Dialog isOpen onOpenChange={() => {}} aria-label="Outer">
          <dialog ref={appDialogRef} aria-label="App">
            <BusyThing isBusy={isBusy} />
            <button type="button" onClick={() => setIsBusy(true)}>
              Start
            </button>
          </dialog>
        </Dialog>
      );
    }
    render(<Host />);
    const outer = screen.getByRole('dialog', {name: 'Outer'});
    const app = screen.getByRole('dialog', {name: 'App'});
    expect(app.matches(':modal')).toBe(true);
    fireEvent.click(screen.getByRole('button', {name: 'Start'}));
    // The busy hook chooses its route a frame later and the region fills a
    // frame after that.
    await nextFrame();
    await nextFrame();
    expect(regionIn(app)).toHaveTextContent('Loading');
    expect(regionIn(outer)).toBeNull();
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('routes a caller inside an open MobileNav into its dialog', async () => {
    render(
      <MobileNav isOpen onOpenChange={() => {}} label="Menu">
        <Owner />
      </MobileNav>,
    );
    const nav = screen.getByRole('dialog', {name: 'Menu'});
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    await nextFrame();
    expect(regionIn(nav)).toHaveTextContent('Added Design');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('keeps the step the person went back to on top while the leaving step exits, so its messages are heard', async () => {
    window.scrollTo = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );
    function Flow() {
      const [activeSheet, setActiveSheet] = useState<string | null>('one');
      return (
        <BottomSheetSwitcher
          activeSheet={activeSheet}
          onActiveSheetChange={setActiveSheet}>
          <BottomSheet sheetId="one" label="One">
            <Owner message="Back on one" />
            <button type="button" onClick={() => setActiveSheet('two')}>
              Continue
            </button>
          </BottomSheet>
          <BottomSheet sheetId="two" label="Two">
            <button type="button" onClick={() => setActiveSheet('one')}>
              Back
            </button>
          </BottomSheet>
        </BottomSheetSwitcher>
      );
    }
    render(<Flow />);
    const one = screen.getByRole('dialog', {name: 'One'});
    // Hidden steps are out of the accessibility tree; reach it by element.
    const two = document.querySelector<HTMLDialogElement>(
      'dialog[aria-label="Two"]',
    )!;
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Continue'}));
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Back'}));
    await nextFrame();
    // Two is leaving: still open, inert; one is the exposed step again.
    expect(two).toHaveAttribute('open');
    expect(two).toHaveAttribute('inert');
    expect(one.matches(':modal')).toBe(true);
    expect(one).not.toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    await nextFrame();
    expect(regionIn(one)).toHaveTextContent('Back on one');
    expect(shared()?.textContent ?? '').toBe('');
    vi.unstubAllGlobals();
  });

  it('holds words sent as a modal BottomSheet over a Dialog closes and delivers them to the Dialog at the real close', async () => {
    function Host() {
      const [isSheetOpen, setIsSheetOpen] = useState(false);
      return (
        <Dialog isOpen onOpenChange={() => {}} aria-label="Edit">
          <button type="button" onClick={() => setIsSheetOpen(true)}>
            Open sheet
          </button>
          <BottomSheet
            isOpen={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            label="Sheet">
            <Owner message="Saved" />
            <button type="button" onClick={() => setIsSheetOpen(false)}>
              Done
            </button>
          </BottomSheet>
        </Dialog>
      );
    }
    render(<Host />);
    const edit = screen.getByRole('dialog', {name: 'Edit'});
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Open sheet'}));
    const sheet = screen.getByRole('dialog', {name: 'Sheet'});
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    // The sheet, still an open modal through its exit, covers the Dialog:
    // nothing is exposed yet, so the words wait rather than being written
    // to the covered Dialog (which would clear them).
    expect(sheet).toHaveAttribute('inert');
    await nextFrame();
    await nextFrame();
    expect(regionIn(sheet)?.textContent ?? '').toBe('');
    expect(regionIn(edit)?.textContent ?? '').toBe('');
    expect(shared()?.textContent ?? '').toBe('');
    act(() => {
      (sheet as HTMLDialogElement).close();
    });
    await nextFrame();
    await nextFrame();
    expect(regionIn(edit)).toHaveTextContent('Saved');
    expect(shared()?.textContent ?? '').toBe('');
  });
  it('withdraws a busy start written inside a modal but not yet exposed when its owner settles with its outcome (AST-086 FR8)', async () => {
    function Search() {
      const ref = useRef<HTMLDivElement>(null);
      const announce = useAnnounce();
      const [isBusy, setIsBusy] = useState(false);
      const settle = useBusyAnnouncement(isBusy, 'Loading', ref);
      return (
        <div ref={ref}>
          <button type="button" onClick={() => setIsBusy(true)}>
            Start
          </button>
          <button
            type="button"
            onClick={() => {
              settle();
              setIsBusy(false);
              announce('3 results');
            }}>
            Outcome
          </button>
        </div>
      );
    }
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
        <Search />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {name: 'Modal'});
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Start'}));
    // The busy hook chooses its route a frame later and writes "Loading" to
    // the dialog's container, to be exposed a frame after that...
    await nextFrame();
    // ...but the outcome arrives first and the owner settles.
    fireEvent.click(screen.getByRole('button', {name: 'Outcome'}));
    await nextFrame();
    await nextFrame();
    expect(regionIn(dialog)?.textContent).toBe('3 results');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('withdraws only its own busy start inside a modal when another owner wrote the same words (AST-086 FR8, FR9)', async () => {
    function Busy({label}: {label: string}) {
      const ref = useRef<HTMLDivElement>(null);
      const [isBusy, setIsBusy] = useState(false);
      const settle = useBusyAnnouncement(isBusy, 'Loading', ref);
      return (
        <div ref={ref}>
          <button type="button" onClick={() => setIsBusy(true)}>
            Start {label}
          </button>
          <button type="button" onClick={() => settle()}>
            Settle {label}
          </button>
        </div>
      );
    }
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
        <Busy label="one" />
        <Busy label="two" />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {name: 'Modal'});
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Start one'}));
    fireEvent.click(screen.getByRole('button', {name: 'Start two'}));
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Settle one'}));
    await nextFrame();
    await nextFrame();
    expect(regionIn(dialog)?.textContent).toBe('Loading');
  });

  describe('a non-modal Drawer (hasScrim={false}, shown with showPopover(), never `open`)', () => {
    beforeEach(() => {
      // The real showPopover() leaves the dialog's `open` attribute unset.
      HTMLElement.prototype.showPopover = vi.fn();
      HTMLElement.prototype.hidePopover = vi.fn();
    });

    it('routes a caller inside it to the shared channel at once, joined with a page message from the same task (FR9)', async () => {
      function Announcer({message}: {message: string}) {
        const announce = useAnnounce();
        useEffect(() => {
          announce(message);
        }, [announce, message]);
        return null;
      }
      render(
        <>
          <Announcer message="Page loaded" />
          <Drawer isOpen onOpenChange={() => {}} hasScrim={false} label="Side">
            <Announcer message="Inside drawer" />
          </Drawer>
        </>,
      );
      const drawer = document.querySelector<HTMLDialogElement>('dialog')!;
      expect(drawer.open).toBe(false);
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
      await nextFrame();
      await nextFrame();
      expect(shared()?.textContent).toBe('Page loaded Inside drawer');
      expect(regionIn(drawer)).toBeNull();
    });

    it('lets a busy start inside it be withdrawn by its outcome (FR8)', async () => {
      function Search() {
        const ref = useRef<HTMLDivElement>(null);
        const announce = useAnnounce();
        const [isBusy, setIsBusy] = useState(false);
        const settle = useBusyAnnouncement(isBusy, 'Loading', ref);
        return (
          <div ref={ref}>
            <button type="button" onClick={() => setIsBusy(true)}>
              Start
            </button>
            <button
              type="button"
              onClick={() => {
                settle();
                setIsBusy(false);
                announce('3 results');
              }}>
              Outcome
            </button>
          </div>
        );
      }
      render(
        <Drawer isOpen onOpenChange={() => {}} hasScrim={false} label="Side">
          <Search />
        </Drawer>,
      );
      await nextFrame();
      fireEvent.click(screen.getByRole('button', {name: 'Start'}));
      await nextFrame();
      fireEvent.click(screen.getByRole('button', {name: 'Outcome'}));
      await nextFrame();
      await nextFrame();
      expect(shared()?.textContent).toBe('3 results');
    });
  });

  it('takes the route of where the call is: a component that renders a Dialog but announces from above it uses the shared channel', async () => {
    function Opener() {
      const announce = useAnnounce();
      const dialogRef = useRef<HTMLDialogElement>(null);
      return (
        <>
          <button type="button" onClick={() => announce('From above')}>
            Above
          </button>
          <Dialog
            ref={dialogRef}
            isOpen
            onOpenChange={() => {}}
            aria-label="Modal">
            <Owner message="From inside" label="Inside" />
          </Dialog>
        </>
      );
    }
    render(<Opener />);
    const dialog = screen.getByRole('dialog', {name: 'Modal'});
    fireEvent.click(screen.getByRole('button', {name: 'Above'}));
    fireEvent.click(screen.getByRole('button', {name: 'Inside'}));
    await nextFrame();
    expect(shared()).toHaveTextContent('From above');
    expect(regionIn(dialog)).toHaveTextContent('From inside');
  });

  it('lets a component that owns a modal route its own messages into it through the provider it renders', async () => {
    // The FR14 route for CommandPalette's counts and Lightbox's position:
    // the owner renders the provider around the part of itself that
    // announces about the modal's content.
    function OwnerOfModal() {
      const dialogRef = useRef<HTMLDialogElement>(null);
      return (
        <Dialog
          ref={dialogRef}
          isOpen
          onOpenChange={() => {}}
          aria-label="Modal">
          <ModalAnnounceProvider dialogRef={dialogRef} isOpen>
            <Owner message="Routed in" />
          </ModalAnnounceProvider>
        </Dialog>
      );
    }
    render(<OwnerOfModal />);
    fireEvent.click(screen.getByRole('button', {name: 'Say'}));
    await nextFrame();
    expect(
      regionIn(screen.getByRole('dialog', {name: 'Modal'})),
    ).toHaveTextContent('Routed in');
  });
});
