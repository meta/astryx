// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BusyOwnerAnnouncement.test.tsx
 * @input Uses vitest, @testing-library/react, and the busy controls under test
 * @output Pins spec:AST-086 FR8 and FR6 for controls that show a busy Spinner
 * @position Shared contract test: the composed Spinner is silent and the
 *   owning control announces each busy start once through the shared channel
 */

import {
  StrictMode,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {TextInput} from '../TextInput';
import {TextArea} from '../TextArea';
import {Selector} from '../Selector';
import {MultiSelector} from '../MultiSelector';
import {ComplexSelector} from '../ComplexSelector';
import {DateInput} from '../DateInput';
import {DateRangeInput} from '../DateRangeInput';
import {DateTimeInput} from '../DateTimeInput';
import {TimeInput} from '../TimeInput';
import {CheckboxInput} from '../CheckboxInput';
import {FileInput} from '../FileInput';
import {CommandPalette} from '../CommandPalette';
import {Thumbnail} from '../Thumbnail';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSubMenu,
} from '../DropdownMenu';
import {ChatMessageList} from '../Chat';
import {BaseTypeahead, Typeahead} from '../Typeahead';
import type {SearchableItem, SearchSource} from '../Typeahead';
import type {ISOTimeString} from '../utils';
import {Tokenizer} from '../Tokenizer';

const announce = vi.fn();
vi.mock('../hooks/useAnnounce', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAnnounce: () => announce,
}));

const OPTIONS = [
  {label: 'Apple', value: 'apple'},
  {label: 'Banana', value: 'banana'},
];

const OWNERS: ReadonlyArray<
  readonly [string, (isLoading: boolean) => ReactElement]
> = [
  [
    'TextInput',
    isLoading => (
      <TextInput
        label="Email"
        value=""
        onChange={() => {}}
        isLoading={isLoading}
      />
    ),
  ],
  [
    'TextArea',
    isLoading => (
      <TextArea
        label="Notes"
        value=""
        onChange={() => {}}
        isLoading={isLoading}
      />
    ),
  ],
  [
    'Selector',
    isLoading => (
      <Selector
        label="Fruit"
        options={OPTIONS}
        onChange={() => {}}
        isLoading={isLoading}
      />
    ),
  ],
  [
    'MultiSelector',
    isLoading => (
      <MultiSelector
        label="Fruits"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        isLoading={isLoading}
      />
    ),
  ],
  ...(['popover', 'native', 'bottom-sheet'] as const).map(
    presentation =>
      [
        `DateInput (${presentation})`,
        (isLoading: boolean) => (
          <DateInput
            label="Date"
            presentation={presentation}
            onChange={() => {}}
            isLoading={isLoading}
          />
        ),
      ] as const,
  ),
  ...(['popover', 'native', 'bottom-sheet'] as const).flatMap(presentation => [
    [
      `DateTimeInput (${presentation})`,
      (isLoading: boolean) => (
        <DateTimeInput
          label="When"
          presentation={presentation}
          onChange={() => {}}
          isLoading={isLoading}
        />
      ),
    ] as const,
    [
      `TimeInput (${presentation})`,
      (isLoading: boolean) => (
        <TimeInput
          label="Time"
          presentation={presentation}
          onChange={() => {}}
          isLoading={isLoading}
        />
      ),
    ] as const,
  ]),
  [
    'CheckboxInput',
    isLoading => (
      <CheckboxInput
        label="Subscribe"
        value={false}
        onChange={() => {}}
        isLoading={isLoading}
      />
    ),
  ],
  [
    'Thumbnail (uploading)',
    isLoading => (
      <Thumbnail src="/local.jpg" alt="Upload" isLoading={isLoading} />
    ),
  ],
  ...(['dropzone', 'input'] as const).map(
    mode =>
      [
        `FileInput (${mode})`,
        (isLoading: boolean) => (
          <FileInput
            label="Attachment"
            mode={mode}
            value={null}
            onChange={() => {}}
            isLoading={isLoading}
          />
        ),
      ] as const,
  ),
  [
    'DateRangeInput',
    isLoading => (
      <DateRangeInput
        label="Dates"
        value={null}
        onChange={() => {}}
        isLoading={isLoading}
      />
    ),
  ],
  [
    'ComplexSelector',
    isLoading => (
      <ComplexSelector label="Fruit blend" value="Apple" isLoading={isLoading}>
        {() => <div>Options</div>}
      </ComplexSelector>
    ),
  ],
];

/** A search source whose searches stay in flight until the test settles them. */
function pendingSource(): SearchSource<SearchableItem> {
  return {
    search: async () => new Promise<SearchableItem[]>(() => {}),
    bootstrap: () => [],
  };
}

/** Owners whose busy state is a search in flight, started by typing. */
const SEARCH_OWNERS: ReadonlyArray<
  readonly [string, (source: SearchSource<SearchableItem>) => ReactElement]
> = [
  [
    'Typeahead',
    source => (
      <Typeahead
        label="User"
        searchSource={source}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />
    ),
  ],
  [
    'Tokenizer',
    source => (
      <Tokenizer
        label="Users"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        debounceMs={0}
      />
    ),
  ],
  [
    'BaseTypeahead',
    source => (
      <BaseTypeahead
        searchSource={source}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />
    ),
  ],
];

// The bottom-sheet DateInput measures its sheet; jsdom has no ResizeObserver.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

/** Calls that announced the busy start, ignoring each control's other messages. */
function busyAnnouncements() {
  return announce.mock.calls.filter(([message]) => message === 'Loading');
}

/** The hook picks its route a frame after the busy start; wait for it. */
async function nextFrame() {
  await act(
    async () =>
      void (await new Promise(resolve => requestAnimationFrame(resolve))),
  );
}

function strict(element: ReactElement) {
  return <StrictMode>{element}</StrictMode>;
}

beforeEach(() => {
  announce.mockClear();
});

describe.each(OWNERS)('%s busy state (spec:AST-086)', (_name, renderOwner) => {
  it('keeps its Spinner silent: hidden from assistive technology, no live role exposed (FR8)', () => {
    const {container} = render(renderOwner(true));
    const spinner = container.querySelector('.astryx-spinner');
    expect(spinner).not.toBeNull();
    // Hidden itself, or inside a decorative hidden indicator (CheckboxInput).
    expect(spinner!.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('status', {name: 'Loading'})).toBeNull();
  });

  it('announces its busy start once through the polite channel, even under StrictMode (FR6, FR8)', async () => {
    const {rerender} = render(strict(renderOwner(true)));
    await nextFrame();
    rerender(strict(renderOwner(true)));
    await nextFrame();
    expect(busyAnnouncements()).toEqual([['Loading', 'polite']]);
  });

  it('announces nothing while idle, and again for each new busy start (FR6)', async () => {
    const {rerender} = render(renderOwner(false));
    await nextFrame();
    expect(busyAnnouncements()).toEqual([]);
    rerender(renderOwner(true));
    await nextFrame();
    rerender(renderOwner(false));
    rerender(renderOwner(true));
    await nextFrame();
    expect(busyAnnouncements()).toEqual([
      ['Loading', 'polite'],
      ['Loading', 'polite'],
    ]);
  });
});

describe.each(OWNERS)(
  '%s busy inside an open native modal (spec:AST-086 Platform support)',
  (_name, renderOwner) => {
    // jsdom has no showModal(), so an open dialog never matches `:modal`;
    // stand in for a dialog opened modally.
    beforeEach(() => {
      const matches = Element.prototype.matches;
      vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
        this: Element,
        selector: string,
      ) {
        return selector === ':modal'
          ? this instanceof HTMLDialogElement && this.open
          : matches.call(this, selector);
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('announces its busy start through a persistent region inside the dialog, not the body-level channel', async () => {
      const {rerender} = render(<dialog open>{renderOwner(false)}</dialog>);
      const dialog = document.querySelector('dialog') as HTMLDialogElement;
      rerender(<dialog open>{renderOwner(true)}</dialog>);
      await nextFrame();
      const region = dialog.querySelector('[data-astryx-modal-busy-region]');
      expect(region).not.toBeNull();
      expect(region).toHaveAttribute('role', 'status');
      expect(region).toHaveAttribute('aria-live', 'polite');
      // Inserted empty, then filled on the next frame (FR3).
      expect(region).toHaveTextContent('');
      await nextFrame();
      expect(region).toHaveTextContent('Loading');
      expect(busyAnnouncements()).toEqual([]);
    });

    it('announces inside the dialog when it is already busy as its dialog opens', async () => {
      // The dialog opens in its own Effect, after the field's Effect has run,
      // the way Dialog calls showModal().
      function OpeningDialog() {
        const ref = useRef<HTMLDialogElement>(null);
        useEffect(() => {
          ref.current?.setAttribute('open', '');
        }, []);
        return <dialog ref={ref}>{renderOwner(true)}</dialog>;
      }
      render(<OpeningDialog />);
      await nextFrame();
      await nextFrame();
      const dialog = document.querySelector('dialog') as HTMLDialogElement;
      expect(
        dialog.querySelector('[data-astryx-modal-busy-region]'),
      ).toHaveTextContent('Loading');
      expect(busyAnnouncements()).toEqual([]);
    });
  },
);

describe.each(SEARCH_OWNERS)(
  '%s search busy state (spec:AST-086)',
  (_name, renderOwner) => {
    it('keeps its search Spinner named but not live, and announces the search start once (FR6, FR8)', async () => {
      const {container} = render(strict(renderOwner(pendingSource())));
      await nextFrame();
      expect(busyAnnouncements()).toEqual([]);
      act(() => {
        fireEvent.change(screen.getByRole('combobox'), {target: {value: 'Al'}});
      });
      await nextFrame();
      // Named but not live (family:input-fields FR7, FR8).
      const spinner = container.querySelector('.astryx-spinner');
      expect(spinner).toHaveAttribute('role', 'img');
      expect(screen.getByRole('img', {name: 'Loading'})).toBe(spinner);
      expect(screen.queryByRole('status', {name: 'Loading'})).toBeNull();
      expect(busyAnnouncements()).toEqual([['Loading', 'polite']]);
    });

    it('announces each new search start again (FR6)', async () => {
      render(renderOwner(pendingSource()));
      const input = screen.getByRole('combobox');
      act(() => {
        fireEvent.change(input, {target: {value: 'Al'}});
      });
      await nextFrame();
      // Clearing the query ends the search; typing again starts a new one.
      act(() => {
        fireEvent.change(input, {target: {value: ''}});
      });
      await nextFrame();
      act(() => {
        fireEvent.change(input, {target: {value: 'Be'}});
      });
      await nextFrame();
      expect(busyAnnouncements()).toEqual([
        ['Loading', 'polite'],
        ['Loading', 'polite'],
      ]);
    });

    it('announces the search start inside an open modal dialog, not the body channel', async () => {
      const matches = Element.prototype.matches;
      vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
        this: Element,
        selector: string,
      ) {
        return selector === ':modal'
          ? this instanceof HTMLDialogElement && this.open
          : matches.call(this, selector);
      });
      render(<dialog open>{renderOwner(pendingSource())}</dialog>);
      act(() => {
        fireEvent.change(screen.getByRole('combobox'), {target: {value: 'Al'}});
      });
      await nextFrame();
      await nextFrame();
      const dialog = document.querySelector('dialog') as HTMLDialogElement;
      expect(
        dialog.querySelector('[data-astryx-modal-busy-region]'),
      ).toHaveTextContent('Loading');
      expect(busyAnnouncements()).toEqual([]);
      vi.restoreAllMocks();
    });
  },
);

/**
 * Bottom-sheet fields whose sheet stays open while a changeAction is pending:
 * the sheet is a modal dialog, so the busy start must be announced inside it.
 */
const SHEET_OWNERS: ReadonlyArray<
  readonly [
    string,
    (changeAction: () => Promise<void>) => ReactElement,
    () => void,
  ]
> = [
  [
    'TimeInput',
    changeAction => (
      <TimeInput
        label="Time"
        presentation="bottom-sheet"
        value={'09:00' as ISOTimeString}
        onChange={() => {}}
        changeAction={changeAction}
      />
    ),
    () => {
      fireEvent.click(screen.getByRole('button', {name: /Time/}));
    },
  ],
];

/** A source whose searches settle in a frame callback that runs before the
 * busy start's frame, as a fast or cached search can. */
function frameSettledSource(): SearchSource<SearchableItem> {
  return {
    search: async () =>
      new Promise<SearchableItem[]>(resolve =>
        requestAnimationFrame(() => resolve([{id: 'alex', label: 'Alex'}])),
      ),
    bootstrap: () => [],
  };
}

describe.each([
  ...SEARCH_OWNERS.filter(([name]) => name !== 'Tokenizer'),
  [
    'CommandPalette',
    (source: SearchSource<SearchableItem>) => (
      <CommandPalette
        isOpen
        isInline
        onOpenChange={() => {}}
        searchSource={source}
      />
    ),
  ] as const,
])(
  '%s search that settles before its busy start is announced (spec:AST-086 FR8)',
  (_name, renderOwner) => {
    // Browsers run microtasks after each frame callback, while jsdom runs a
    // frame's callbacks back to back. One task per callback lets a search that
    // settles in one callback announce its outcome before the next one runs.
    const jsdomRequestFrame = window.requestAnimationFrame;
    const jsdomCancelFrame = window.cancelAnimationFrame;
    beforeEach(() => {
      window.requestAnimationFrame = callback =>
        window.setTimeout(() => callback(performance.now()), 16);
      window.cancelAnimationFrame = frame => window.clearTimeout(frame);
    });
    afterEach(() => {
      window.requestAnimationFrame = jsdomRequestFrame;
      window.cancelAnimationFrame = jsdomCancelFrame;
    });

    it('announces the outcome and never the overtaken busy start', async () => {
      render(renderOwner(frameSettledSource()));
      await nextFrame();
      announce.mockClear();
      act(() => {
        fireEvent.change(screen.getByRole('combobox'), {target: {value: 'Al'}});
      });
      await nextFrame();
      await nextFrame();
      await nextFrame();
      expect(announce).toHaveBeenCalledWith('1 result');
      expect(busyAnnouncements()).toEqual([]);
    });
  },
);

describe.each(SHEET_OWNERS)(
  '%s busy start from inside its open sheet (spec:AST-086 Platform support)',
  (_name, renderOwner, openSheet) => {
    beforeEach(() => {
      HTMLDialogElement.prototype.showModal = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.setAttribute('open', '');
      });
      HTMLDialogElement.prototype.close = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.removeAttribute('open');
      });
      const matches = Element.prototype.matches;
      vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
        this: Element,
        selector: string,
      ) {
        return selector === ':modal'
          ? this instanceof HTMLDialogElement && this.open
          : matches.call(this, selector);
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('announces the busy start in a region inside the open sheet, not behind it', async () => {
      render(renderOwner(async () => new Promise<void>(() => {})));
      openSheet();
      const sheet = document.querySelector('dialog[open]');
      expect(sheet).not.toBeNull();
      act(() => {
        fireEvent.click(within(sheet as HTMLElement).getAllByRole('option')[1]);
      });
      await nextFrame();
      await nextFrame();
      expect(
        sheet!.querySelector('[data-astryx-modal-busy-region]'),
      ).toHaveTextContent('Loading');
      expect(busyAnnouncements()).toEqual([]);
    });
  },
);

describe('DropdownMenuSubMenu loading state (spec:AST-086 FR8)', () => {
  function Menu({isLoading}: {isLoading: boolean}) {
    return (
      <DropdownMenu button={{label: 'Actions'}}>
        <DropdownMenuSubMenu label="Move to" hasSpinner={isLoading}>
          <DropdownMenuItem label="Inbox" onClick={() => {}} />
        </DropdownMenuSubMenu>
      </DropdownMenu>
    );
  }

  it('announces nothing while its menu is closed', async () => {
    render(strict(<Menu isLoading />));
    await nextFrame();
    expect(busyAnnouncements()).toEqual([]);
  });

  it('announces the busy start when its menu opens while loading', async () => {
    render(strict(<Menu isLoading />));
    fireEvent.click(screen.getByRole('button', {name: /Actions/}));
    await nextFrame();
    expect(busyAnnouncements()).toEqual([['Loading', 'polite']]);
  });

  it('keeps the trigger Spinner silent and announces each busy start once', async () => {
    const {rerender} = render(strict(<Menu isLoading={false} />));
    fireEvent.click(screen.getByRole('button', {name: /Actions/}));
    await nextFrame();
    expect(busyAnnouncements()).toEqual([]);
    rerender(strict(<Menu isLoading />));
    await nextFrame();
    const spinner = document.querySelector('.astryx-spinner');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
    expect(busyAnnouncements()).toEqual([['Loading', 'polite']]);
    rerender(strict(<Menu isLoading={false} />));
    rerender(strict(<Menu isLoading />));
    await nextFrame();
    expect(busyAnnouncements()).toEqual([
      ['Loading', 'polite'],
      ['Loading', 'polite'],
    ]);
  });
});

describe('ChatMessageList top loader (spec:AST-086 FR4, FR8)', () => {
  it('keeps the loader inside the log silent and announces loading once through the channel', async () => {
    let notify!: IntersectionObserverCallback;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    render(
      strict(
        <ChatMessageList
          scrollToTopAction={async () => new Promise<void>(() => {})}>
          <div>Earlier message</div>
        </ChatMessageList>,
      ),
    );
    act(() => {
      notify(
        [{isIntersecting: true} as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    await nextFrame();
    expect(document.querySelector('.astryx-spinner')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(busyAnnouncements()).toEqual([['Loading', 'polite']]);
  });
});

describe('FileInput busy start from a pick or a clear (spec:AST-086 FR6, FR8)', () => {
  const file = new File(['x'], 'report.pdf', {type: 'application/pdf'});

  it('keeps a pick under a pending changeAction to its one "selected" message', async () => {
    const {container} = render(
      strict(
        <FileInput
          label="Attachment"
          value={null}
          onChange={() => {}}
          changeAction={async () => new Promise<void>(() => {})}
        />,
      ),
    );
    act(() => {
      fireEvent.change(
        container.querySelector('input[type="file"]') as HTMLInputElement,
        {target: {files: [file]}},
      );
    });
    await nextFrame();
    expect(container.querySelector('.astryx-spinner')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(announce).toHaveBeenCalledWith('1 file selected: report.pdf');
    expect(busyAnnouncements()).toEqual([]);
  });

  it('keeps a pick whose onChange starts an upload (isLoading) to its one "selected" message', async () => {
    function Uploader() {
      const [value, setValue] = useState<File | null>(null);
      const [isLoading, setIsLoading] = useState(false);
      return (
        <FileInput
          label="Attachment"
          value={value}
          isLoading={isLoading}
          onChange={next => {
            setValue(next as File | null);
            setIsLoading(true);
          }}
        />
      );
    }
    const {container} = render(strict(<Uploader />));
    act(() => {
      fireEvent.change(
        container.querySelector('input[type="file"]') as HTMLInputElement,
        {target: {files: [file]}},
      );
    });
    await nextFrame();
    await nextFrame();
    expect(announce).toHaveBeenCalledWith('1 file selected: report.pdf');
    expect(busyAnnouncements()).toEqual([]);
  });

  it('announces nothing more when an earlier pick settles while a later one is still pending', async () => {
    const settles: (() => void)[] = [];
    const {container} = render(
      strict(
        <FileInput
          label="Attachment"
          value={null}
          onChange={() => {}}
          changeAction={async () =>
            new Promise<void>(resolve => {
              settles.push(resolve);
            })
          }
        />,
      ),
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    act(() => {
      fireEvent.change(input, {target: {files: [file]}});
    });
    await nextFrame();
    act(() => {
      fireEvent.change(input, {
        target: {files: [new File(['y'], 'notes.txt', {type: 'text/plain'})]},
      });
    });
    await nextFrame();
    await act(async () => {
      settles[0]();
    });
    await nextFrame();
    await nextFrame();
    expect(busyAnnouncements()).toEqual([]);
  });

  it('announces the busy start of a clear under a pending changeAction', async () => {
    render(
      strict(
        <FileInput
          label="Attachment"
          value={file}
          onChange={() => {}}
          changeAction={async () => new Promise<void>(() => {})}
        />,
      ),
    );
    act(() => {
      fireEvent.click(screen.getByRole('button', {name: /Clear/}));
    });
    await nextFrame();
    expect(busyAnnouncements()).toEqual([['Loading', 'polite']]);
  });
});

describe('CommandPalette busy start inside its modal (spec:AST-086 FR8, FR3)', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.removeAttribute('open');
    });
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':modal'
        ? this instanceof HTMLDialogElement && this.open
        : matches.call(this, selector);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function regionOf(): Element | null {
    return (
      document
        .querySelector('dialog[open]')
        ?.querySelector('[data-astryx-modal-busy-region]') ?? null
    );
  }

  it('announces the load on opening from a region inside its dialog, with a silent Spinner', async () => {
    render(
      strict(
        <CommandPalette
          isOpen
          onOpenChange={() => {}}
          searchSource={{
            bootstrap: async () => new Promise<SearchableItem[]>(() => {}),
            search: async () => new Promise<SearchableItem[]>(() => {}),
          }}
        />,
      ),
    );
    await nextFrame();
    await nextFrame();
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    expect(dialog.querySelector('.astryx-spinner')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(regionOf()).toHaveTextContent('Loading');
    expect(busyAnnouncements()).toEqual([]);
  });

  it('announces a search start once from inside its dialog, not on the hidden page channel', async () => {
    render(
      strict(
        <CommandPalette
          isOpen
          onOpenChange={() => {}}
          searchSource={pendingSource()}
        />,
      ),
    );
    await nextFrame();
    act(() => {
      fireEvent.change(screen.getByRole('combobox'), {target: {value: 'se'}});
    });
    await nextFrame();
    await nextFrame();
    expect(regionOf()).toHaveTextContent('Loading');
    expect(busyAnnouncements()).toEqual([]);
  });
});
