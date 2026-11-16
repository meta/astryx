// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NavigationStack.keep.test.tsx
 * @input Uses vitest, @testing-library/react, NavigationStack and its hooks
 * @output jsdom coverage of the options NavigationStack's draft record
 *   proposes: a cut change, retained screens and their eviction, a prepared
 *   screen and the press that prepares it, a screen whose content owns its
 *   scroller, and the screen state each screen reads
 * @position Testing. Real engines prove that hidden screens take no input in
 *   __tests__/NavigationStackHidden.interaction.browser.spec.ts
 */

import {beforeEach, describe, expect, it} from 'vitest';
import {useEffect, useState} from 'react';
import {flushSync} from 'react-dom';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {
  NavigationScreen,
  NavigationStack,
  useNavigationScreen,
  useNavigationScroller,
  useNavigationStack,
} from './NavigationStack';
import {useNavigationLink} from './useNavigationLink';

let mounts: Record<string, number> = {};

beforeEach(() => {
  mounts = {};
});

function Detail({entry}: {entry: string}) {
  const nav = useNavigationStack<string>();
  const {state} = useNavigationScreen();
  const [draft, setDraft] = useState('');
  useEffect(() => {
    mounts[entry] = (mounts[entry] ?? 0) + 1;
  }, [entry]);
  return (
    <>
      <input
        aria-label={`${entry} draft`}
        value={draft}
        onChange={event => setDraft(event.target.value)}
      />
      <span data-testid={`state-${entry}`}>{state}</span>
      <button type="button" onClick={() => nav.pop()}>
        Pop {entry}
      </button>
      <button type="button" onClick={() => nav.pop({transition: 'cut'})}>
        Cut pop {entry}
      </button>
    </>
  );
}

function OwnScroller() {
  const scroller = useNavigationScroller();
  return (
    <div ref={scroller.ref} data-testid="own-scroller">
      Inset {scroller.barInset}
    </div>
  );
}

function Root() {
  const nav = useNavigationStack<string>();
  const link = useNavigationLink('B');
  return (
    <>
      <button type="button" onClick={() => nav.push('A')}>
        Open A
      </button>
      <button
        type="button"
        onClick={() => {
          flushSync(() => nav.push('Compose', {transition: 'cut'}));
          document
            .querySelector<HTMLTextAreaElement>('[data-compose]')
            ?.focus();
        }}>
        New
      </button>
      <button type="button" {...link}>
        Open B
      </button>
      <button type="button" onClick={() => nav.push('C')}>
        Open C
      </button>
      <button type="button" onClick={() => nav.prepare('C')}>
        Prepare C
      </button>
      <button type="button" onClick={() => nav.drop()}>
        Drop
      </button>
      <button type="button" onClick={() => nav.evict('A')}>
        Evict A
      </button>
      <button type="button" onClick={() => nav.push('Own')}>
        Open Own
      </button>
    </>
  );
}

function Harness({
  retainPopped = 0,
  isRootBarHidden = false,
}: {
  retainPopped?: number;
  isRootBarHidden?: boolean;
}) {
  const [path, setPath] = useState<string[]>([]);
  return (
    <NavigationStack
      label="Chats"
      retainPopped={retainPopped}
      root={
        <NavigationScreen title="Chats" isBarHidden={isRootBarHidden}>
          <Root />
        </NavigationScreen>
      }
      path={path}
      onPathChange={setPath}
      getKey={entry => entry}
      renderScreen={entry =>
        entry === 'Compose' ? (
          <NavigationScreen title="Compose">
            <textarea data-compose aria-label="Message" />
          </NavigationScreen>
        ) : entry === 'Own' ? (
          <NavigationScreen title="Own" scroll="content">
            <OwnScroller />
          </NavigationScreen>
        ) : (
          <NavigationScreen title={entry}>
            <Detail entry={entry} />
          </NavigationScreen>
        )
      }
    />
  );
}

const card = (entry: string) =>
  document.querySelector<HTMLElement>(
    `[data-navigation-screen="${entry === 'Chats' ? 'root' : `screen-${entry}`}"]`,
  );

/** Pushes `entry` from the root and waits for it to come to rest on top. */
async function open(name: string, entry: string) {
  fireEvent.click(screen.getByRole('button', {name}));
  await waitFor(() =>
    expect(card(entry)?.hasAttribute('data-navigation-top')).toBe(true),
  );
}

/** Pops the top screen and waits for its pop to end. */
async function popAndSettle(entry: string) {
  fireEvent.click(screen.getByRole('button', {name: `Pop ${entry}`}));
  await waitFor(() =>
    expect(card('Chats')?.hasAttribute('data-navigation-top')).toBe(true),
  );
}

describe('NavigationStack: a cut change', () => {
  it('lands a cut push in the commit that makes it, and the tap that made it keeps the focus it gives', () => {
    render(<Harness />);
    act(() => {
      fireEvent.click(screen.getByRole('button', {name: 'New'}));
    });
    expect(card('Compose')?.hasAttribute('data-navigation-top')).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', {name: 'Message'}),
    );
  });

  it('drops a cut pop’s screen in the commit that pops it', async () => {
    render(<Harness />);
    await open('Open A', 'A');
    fireEvent.click(screen.getByRole('button', {name: 'Cut pop A'}));
    expect(card('A')).toBeNull();
    expect(card('Chats')?.hasAttribute('data-navigation-top')).toBe(true);
  });
});

describe('NavigationStack: retained screens', () => {
  it('keeps a popped screen mounted, hidden and inert, and pushes it again with no remount', async () => {
    render(<Harness retainPopped={2} />);
    await open('Open A', 'A');
    fireEvent.change(screen.getByRole('textbox', {name: 'A draft'}), {
      target: {value: 'hello'},
    });
    await popAndSettle('A');
    await waitFor(() =>
      expect(card('A')?.getAttribute('data-navigation-screen-state')).toBe(
        'hidden',
      ),
    );
    expect(card('A')?.hasAttribute('inert')).toBe(true);
    expect(screen.getByTestId('state-A').textContent).toBe('hidden');
    await open('Open A', 'A');
    expect(screen.getByTestId('state-A').textContent).toBe('top');
    expect(
      (screen.getByRole('textbox', {name: 'A draft'}) as HTMLInputElement)
        .value,
    ).toBe('hello');
    expect(mounts.A).toBe(1);
  });

  it('sends the least recently popped screen away first', async () => {
    render(<Harness retainPopped={1} />);
    await open('Open A', 'A');
    await popAndSettle('A');
    await open('Open C', 'C');
    await popAndSettle('C');
    await waitFor(() => expect(card('A')).toBeNull());
    expect(card('C')?.getAttribute('data-navigation-screen-state')).toBe(
      'hidden',
    );
  });

  it('unmounts a retained screen that evict() names', async () => {
    render(<Harness retainPopped={2} />);
    await open('Open A', 'A');
    await popAndSettle('A');
    await waitFor(() => expect(card('A')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', {name: 'Evict A'}));
    expect(card('A')).toBeNull();
  });

  it('retains nothing by default', async () => {
    render(<Harness />);
    await open('Open A', 'A');
    await popAndSettle('A');
    await waitFor(() => expect(card('A')).toBeNull());
  });
});

describe('NavigationStack: a prepared screen', () => {
  it('renders a prepared screen hidden, and pushes it with no remount', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', {name: 'Prepare C'}));
    await waitFor(() =>
      expect(card('C')?.getAttribute('data-navigation-screen-state')).toBe(
        'prepared',
      ),
    );
    expect(card('C')?.hasAttribute('inert')).toBe(true);
    expect(mounts.C).toBe(1);
    await open('Open C', 'C');
    expect(screen.getByTestId('state-C').textContent).toBe('top');
    expect(mounts.C).toBe(1);
  });

  it('unmounts the prepared screen on drop()', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', {name: 'Prepare C'}));
    await waitFor(() => expect(card('C')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', {name: 'Drop'}));
    expect(card('C')).toBeNull();
  });

  it('prepares at a press, drops when a scroll cancels it, and pushes the prepared screen on the activation', async () => {
    render(<Harness />);
    const row = screen.getByRole('button', {name: 'Open B'});
    fireEvent.pointerDown(row);
    await waitFor(() =>
      expect(card('B')?.getAttribute('data-navigation-screen-state')).toBe(
        'prepared',
      ),
    );
    fireEvent.pointerCancel(row);
    expect(card('B')).toBeNull();
    fireEvent.pointerDown(row);
    await waitFor(() => expect(card('B')).not.toBeNull());
    expect(mounts.B).toBe(2);
    await open('Open B', 'B');
    expect(mounts.B).toBe(2);
  });
});

describe('NavigationStack: a screen whose content owns its scroller', () => {
  it('gives the content the card’s box, with no scroller of the stack’s, and the bar’s inset', async () => {
    render(<Harness />);
    await open('Open Own', 'Own');
    const own = card('Own');
    expect(own?.querySelector('[data-navigation-content-box]')).not.toBeNull();
    expect(screen.getByTestId('own-scroller').textContent).toBe('Inset 44');
  });
});

describe('NavigationStack: a screen with no bar', () => {
  it('draws no bar on a bar-hidden root, keeps its title as a hidden heading, and brings the bar in with a push', async () => {
    render(<Harness isRootBarHidden />);
    expect(document.querySelector('[data-navigation-bar="root"]')).toBeNull();
    expect(
      screen.getByRole('heading', {name: 'Chats', hidden: false}),
    ).toBeTruthy();
    await open('Open A', 'A');
    expect(
      document.querySelector('[data-navigation-bar="screen-A"]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-navigation-bar="root"]')).toBeNull();
  });
});
