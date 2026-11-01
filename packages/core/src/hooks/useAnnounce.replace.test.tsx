// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAnnounce.replace.test.tsx
 * @input Uses vitest, Testing Library, useAnnounce, and an Astryx Dialog and
 *   BottomSheet
 * @output Proof of spec:AST-086 FR9 and FR14 for `useAnnounce({hasReplace})`:
 *   each message such an instance writes withdraws its previous one while it
 *   is not yet exposed, whatever their urgencies, on the shared channel,
 *   inside an open modal and in the commit that presents one; messages from
 *   other instances, and from instances without `hasReplace`, still join; a
 *   share another instance holds stays; an exposed message is left alone, and
 *   taking it back later touches no other announcer's words, in a modal's
 *   container or held for its close; the instance's hold on its message
 *   follows the words when a modal hands them on (it leaves the
 *   accessibility tree, exits, closes, or a step is left) or its write frame
 *   finds it unexposed; an empty message clears
 * @position Core a11y tests beside the hook
 */

import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import {useEffect, useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {BottomSheet} from '../BottomSheet/BottomSheet';
import {Dialog} from '../Dialog/Dialog';
import {__resetLiveRegionsForTest, useAnnounce} from './useAnnounce';

const shared = (politeness = 'polite') =>
  document.querySelector(`[data-astryx-live-region="${politeness}"]`);
const regionIn = (dialog: Element, politeness = 'polite') =>
  dialog.querySelector(
    `:scope > [data-astryx-modal-live-region="${politeness}"]`,
  );

async function nextFrame() {
  await act(
    async () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
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

const REPLACE = {hasReplace: true} as const;

beforeEach(() => {
  __resetLiveRegionsForTest();
});
afterEach(() => {
  vi.restoreAllMocks();
  __resetLiveRegionsForTest();
});

describe('useAnnounce({hasReplace}) on the shared channel (spec:AST-086 FR9)', () => {
  it('says only the latest of its messages written in one frame', async () => {
    const {result} = renderHook(() => useAnnounce(REPLACE));
    result.current('1 result');
    result.current('Create "Urg"');
    result.current('Create "Urgent"');
    await nextFrame();
    expect(shared()?.textContent).toBe('Create "Urgent"');
  });

  it('still joins another instance’s message written in the same frame', async () => {
    const {result} = renderHook(() => ({
      count: useAnnounce(REPLACE),
      other: useAnnounce(),
    }));
    result.current.other('Filter applied');
    result.current.count('3 results');
    result.current.count('2 results');
    await nextFrame();
    expect(shared()?.textContent).toBe('Filter applied 2 results');
  });

  it('keeps joining the messages of an instance without hasReplace', async () => {
    const {result} = renderHook(() => useAnnounce());
    result.current('Added Design');
    result.current('Removed Eng');
    await nextFrame();
    expect(shared()?.textContent).toBe('Added Design Removed Eng');
  });

  it('withdraws only its own share of words another instance also wrote', async () => {
    const {result} = renderHook(() => ({
      first: useAnnounce(REPLACE),
      second: useAnnounce(REPLACE),
    }));
    result.current.first('1 result');
    result.current.second('1 result');
    result.current.first('2 results');
    await nextFrame();
    // The second instance still holds "1 result".
    expect(shared()?.textContent).toBe('1 result 2 results');
  });

  it('leaves a message that was already exposed: the next one starts fresh', async () => {
    const {result} = renderHook(() => useAnnounce(REPLACE));
    result.current('1 result');
    await nextFrame();
    expect(shared()?.textContent).toBe('1 result');
    result.current('2 results');
    await nextFrame();
    expect(shared()?.textContent).toBe('2 results');
  });

  it('leaves another announcer’s equal words written after its own message was exposed', async () => {
    const {result} = renderHook(() => ({
      count: useAnnounce(REPLACE),
      other: useAnnounce(),
    }));
    result.current.count('1 result');
    await nextFrame();
    result.current.other('1 result');
    result.current.count('2 results');
    await nextFrame();
    expect(shared()?.textContent).toBe('1 result 2 results');
  });

  it('withdraws its polite message for an assertive one, which is spoken in the assertive region', async () => {
    const {result} = renderHook(() => useAnnounce(REPLACE));
    result.current('3 results');
    result.current('Search failed', 'assertive');
    await nextFrame();
    expect(shared('polite')?.textContent ?? '').toBe('');
    expect(shared('assertive')?.textContent).toBe('Search failed');
  });

  it('clears the region on an empty message', async () => {
    const {result} = renderHook(() => useAnnounce(REPLACE));
    result.current('1 result');
    await nextFrame();
    result.current('');
    await nextFrame();
    expect(shared()?.textContent ?? '').toBe('');
  });
});

describe('useAnnounce({hasReplace}) inside an Astryx modal (spec:AST-086 FR14)', () => {
  beforeEach(() => {
    stubDialogs();
  });

  function Typist({
    messages,
  }: {
    messages: ReadonlyArray<readonly [string, 'polite' | 'assertive']>;
  }) {
    const announce = useAnnounce(REPLACE);
    return (
      <button
        type="button"
        onClick={() => {
          for (const [message, politeness] of messages) {
            announce(message, politeness);
          }
        }}>
        Type
      </button>
    );
  }

  it('withdraws its unexposed message in the modal’s container', async () => {
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
        <Typist
          messages={[
            ['1 result', 'polite'],
            ['Create "Urgent"', 'polite'],
          ]}
        />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {name: 'Modal'});
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Type'}));
    await nextFrame();
    expect(regionIn(dialog)?.textContent).toBe('Create "Urgent"');
    expect(shared()?.textContent ?? '').toBe('');
  });

  it('withdraws across the modal’s two containers', async () => {
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
        <Typist
          messages={[
            ['3 results', 'polite'],
            ['Search failed', 'assertive'],
          ]}
        />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {name: 'Modal'});
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Type'}));
    await nextFrame();
    expect(regionIn(dialog, 'polite')?.textContent ?? '').toBe('');
    expect(regionIn(dialog, 'assertive')?.textContent).toBe('Search failed');
  });

  // A `hasReplace` count and a plain announcer that may say the same words.
  function CountAndOther() {
    const count = useAnnounce(REPLACE);
    const other = useAnnounce();
    return (
      <>
        <button type="button" onClick={() => count('1 result')}>
          Count
        </button>
        <button type="button" onClick={() => count('2 results')}>
          Recount
        </button>
        <button
          type="button"
          onClick={() => {
            other('1 result');
            count('1 result');
          }}>
          Both
        </button>
        <button
          type="button"
          onClick={() => {
            other('1 result');
            count('2 results');
          }}>
          Next
        </button>
      </>
    );
  }

  it('leaves another announcer’s equal words in the container after its own message was exposed', async () => {
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
        <CountAndOther />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {name: 'Modal'});
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Count'}));
    // Written, then taken by assistive technology a frame later.
    await nextFrame();
    await nextFrame();
    expect(regionIn(dialog)?.textContent).toBe('1 result');
    // The plain announcer's "1 result" is not the count's spoken one.
    fireEvent.click(screen.getByRole('button', {name: 'Next'}));
    await nextFrame();
    expect(regionIn(dialog)?.textContent).toBe('1 result 2 results');
  });

  /** A sheet that runs its exit with the announcers inside it. */
  function ExitingSheet() {
    const [isOpen, setIsOpen] = useState(true);
    return (
      <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Sheet">
        <CountAndOther />
        <button type="button" onClick={() => setIsOpen(false)}>
          Done
        </button>
      </BottomSheet>
    );
  }

  it('takes back only its own share of words held while its sheet exits', async () => {
    render(<ExitingSheet />);
    const sheet = document.querySelector<HTMLDialogElement>('dialog')!;
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    // Open but inert and aria-hidden through its exit: the words are held
    // for the real close (reach the controls by element).
    expect(sheet).toHaveAttribute('inert');
    fireEvent.click(screen.getByText('Both'));
    fireEvent.click(screen.getByText('Next'));
    act(() => {
      sheet.close();
    });
    await nextFrame();
    await nextFrame();
    // The plain announcer still holds "1 result"; the count's was taken back.
    expect(shared()?.textContent).toBe('1 result 2 results');
  });

  it('leaves words held later when its own held words were already delivered', async () => {
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
        <CountAndOther />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {name: 'Modal'});
    await nextFrame();
    // Out of the accessibility tree, as through an exit, and back.
    const setHidden = async (hidden: boolean) => {
      await act(async () => {
        if (hidden) {
          dialog.setAttribute('aria-hidden', 'true');
        } else {
          dialog.removeAttribute('aria-hidden');
        }
      });
    };
    await setHidden(true);
    fireEvent.click(screen.getByText('Count'));
    // Exposed again: the held words are delivered and spoken.
    await setHidden(false);
    await nextFrame();
    await nextFrame();
    expect(regionIn(dialog)?.textContent).toBe('1 result');
    // Hidden again: the plain announcer's "1 result" is held now, and the
    // count's delivered one is not among the held words.
    await setHidden(true);
    fireEvent.click(screen.getByText('Next'));
    await setHidden(false);
    await nextFrame();
    expect(regionIn(dialog)?.textContent).toBe('1 result 2 results');
  });

  it('withdraws its message handed off as its Dialog leaves the accessibility tree, once the Dialog is back', async () => {
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
        <CountAndOther />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {name: 'Modal'});
    await nextFrame();
    // Written, then the Dialog leaves the tree before the words are exposed:
    // they are handed off, and held while the Dialog still covers the page.
    fireEvent.click(screen.getByRole('button', {name: 'Count'}));
    await act(async () => {
      dialog.setAttribute('aria-hidden', 'true');
    });
    fireEvent.click(screen.getByText('Recount'));
    await act(async () => {
      dialog.removeAttribute('aria-hidden');
    });
    await nextFrame();
    await nextFrame();
    expect(regionIn(dialog)?.textContent).toBe('2 results');
  });

  it('withdraws its message handed off as its sheet exits, once the sheet has closed', async () => {
    render(<ExitingSheet />);
    const sheet = document.querySelector<HTMLDialogElement>('dialog')!;
    await nextFrame();
    // Written, and the sheet starts its exit before the words are exposed.
    fireEvent.click(screen.getByRole('button', {name: 'Count'}));
    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    expect(sheet).toHaveAttribute('inert');
    // The sheet's provider sees the exit and hands the words off.
    await act(async () => {});
    fireEvent.click(screen.getByText('Recount'));
    act(() => {
      sheet.close();
    });
    await nextFrame();
    await nextFrame();
    expect(shared()?.textContent).toBe('2 results');
  });

  it('withdraws its message handed to the entering step when its step is left before the words are exposed', async () => {
    function Flow() {
      const [step, setStep] = useState(1);
      return (
        <>
          <Dialog isOpen={step === 1} onOpenChange={() => {}} aria-label="One">
            <CountAndOther />
            <button type="button" onClick={() => setStep(2)}>
              Continue
            </button>
          </Dialog>
          <Dialog isOpen={step === 2} onOpenChange={() => {}} aria-label="Two">
            <span>Step two</span>
          </Dialog>
        </>
      );
    }
    render(<Flow />);
    await nextFrame();
    // The count is written from step one, which closes in the same update
    // that opens step two, before the words are exposed.
    fireEvent.click(screen.getByRole('button', {name: 'Count'}));
    fireEvent.click(screen.getByRole('button', {name: 'Continue'}));
    // Step one's provider sees the close and hands the words to step two.
    await act(async () => {});
    const two = screen.getByRole('dialog', {name: 'Two'});
    // The count's next message (step one's content stays mounted, closed)
    // takes back its words from step two, and is heard on the page.
    fireEvent.click(screen.getByText('Recount'));
    await nextFrame();
    await nextFrame();
    expect(regionIn(two)?.textContent ?? '').toBe('');
    expect(shared()?.textContent).toBe('2 results');
  });

  it('withdraws its message handed to the page as its Dialog closes before the words are exposed', async () => {
    function Host() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <Dialog isOpen={isOpen} onOpenChange={setIsOpen} aria-label="Modal">
          <CountAndOther />
          <button type="button" onClick={() => setIsOpen(false)}>
            Close
          </button>
        </Dialog>
      );
    }
    render(<Host />);
    await nextFrame();
    fireEvent.click(screen.getByRole('button', {name: 'Count'}));
    fireEvent.click(screen.getByRole('button', {name: 'Close'}));
    // The provider sees the close and hands the words to the page.
    await act(async () => {});
    // The count's next message (the closed Dialog's content stays mounted)
    // takes back its words from the page channel.
    fireEvent.click(screen.getByText('Recount'));
    await nextFrame();
    expect(shared()?.textContent).toBe('2 results');
  });

  it('withdraws its message redirected in the write frame when its Dialog stopped being exposed unseen', async () => {
    render(
      <Dialog isOpen onOpenChange={() => {}} aria-label="Modal">
        <CountAndOther />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', {name: 'Modal'});
    await nextFrame();
    const exposed: string[] = [];
    const record = new MutationObserver(() => {
      const text = shared()?.textContent ?? '';
      if (text !== '' && text !== exposed.at(-1)) {
        exposed.push(text);
      }
    });
    record.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    fireEvent.click(screen.getByRole('button', {name: 'Count'}));
    // No longer a modal, through no attribute its provider watches: the
    // write frame finds it unexposed and sends the words to the page.
    delete dialog.dataset.modal;
    await nextFrame();
    fireEvent.click(screen.getByText('Recount'));
    await nextFrame();
    await nextFrame();
    await nextFrame();
    record.disconnect();
    expect(exposed).toEqual(['2 results']);
  });

  it('withdraws a message deferred in the commit that presents the Dialog', async () => {
    function OpeningCount() {
      const announce = useAnnounce(REPLACE);
      useEffect(() => {
        // Both before the Dialog's own Effect has presented it.
        announce('1 result');
        announce('2 results');
      }, [announce]);
      return <span>Results</span>;
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
              <OpeningCount />
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
    expect(regionIn(dialog)?.textContent).toBe('2 results');
    expect(shared()?.textContent ?? '').toBe('');
  });
});
