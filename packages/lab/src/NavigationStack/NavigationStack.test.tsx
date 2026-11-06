// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NavigationStack.test.tsx
 * @input Uses vitest, @testing-library/react, NavigationStack,
 *   NavigationScreen and useNavigationStack
 * @output jsdom coverage of the stack's state: which screens render, the
 *   bar's title and back button, and inert covered screens. It also covers a
 *   popped screen leaving once its slide-out ends, focus after a push and
 *   after a pop, and the hook's guard.
 * @position Testing. Real engines prove the motion itself in
 *   __tests__/NavigationStack.interaction.browser.spec.ts (jsdom has no Web
 *   Animations: the animator writes end values and settles on timers)
 */

import {describe, expect, it} from 'vitest';
import {useState, type ReactNode} from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {List, ListItem} from '@astryxdesign/core/List';
import {
  NavigationScreen,
  NavigationStack,
  useNavigationStack,
} from './NavigationStack';

function Root() {
  const nav = useNavigationStack<string>();
  return (
    <>
      <button type="button" onClick={() => nav.push('General')}>
        General
      </button>
      <button type="button" onClick={() => nav.push('Privacy')}>
        Privacy
      </button>
    </>
  );
}

function Detail({entry}: {entry: string}) {
  const nav = useNavigationStack<string>();
  return (
    <>
      <p>{entry} content</p>
      <button type="button" onClick={() => nav.push(`${entry} › About`)}>
        About
      </button>
      <button type="button" onClick={() => nav.popToRoot()}>
        Done
      </button>
      <span data-testid="depth">{nav.depth}</span>
    </>
  );
}

function Harness({
  initial = [],
  backTitle,
  rootTitle = 'Settings',
  rootEndContent,
}: {
  initial?: string[];
  backTitle?: string;
  rootTitle?: string;
  rootEndContent?: ReactNode;
}) {
  const [path, setPath] = useState<string[]>(initial);
  return (
    <NavigationStack
      label="Settings"
      root={
        <NavigationScreen
          title={rootTitle}
          backTitle={backTitle}
          endContent={rootEndContent}>
          <Root />
        </NavigationScreen>
      }
      path={path}
      onPathChange={setPath}
      getKey={entry => entry}
      renderScreen={entry => (
        <NavigationScreen title={entry}>
          <Detail entry={entry} />
        </NavigationScreen>
      )}
    />
  );
}

/** A screen's card, by title (the root is "Settings"). */
const screenCard = (title: string) =>
  document.querySelector<HTMLElement>(
    `[data-navigation-screen="${title === 'Settings' ? 'root' : `screen-${title}`}"]`,
  );

/** The bar's back button (other buttons may share its name). */
const backButton = (name: string) =>
  screen
    .getAllByRole('button', {name})
    .find(button => button.hasAttribute('data-navigation-back'));

describe('NavigationStack', () => {
  it('renders the root screen with its title and no back button', () => {
    render(<Harness />);
    expect(screen.getByRole('region', {name: 'Settings'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Settings'})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /back|settings/i})).toBeNull();
    expect(screen.getByRole('button', {name: 'General'})).toBeInTheDocument();
  });

  it('pushes a screen: its title shows, Back reads the previous title, the root is covered', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', {name: 'General'}));

    expect(screen.getByText('General content')).toBeInTheDocument();
    const back = screen.getByRole('button', {name: 'Settings'});
    expect(back).toHaveAttribute('data-navigation-back');
    // The covered root screen takes no input, and assistive technology skips
    // it.
    expect(screenCard('Settings')).toHaveAttribute('inert');
    expect(screenCard('General')).not.toHaveAttribute('inert');
    expect(screen.getByTestId('depth')).toHaveTextContent('1');
  });

  it('pops with the back button; the popped screen leaves once its slide-out ends', async () => {
    render(<Harness initial={['General']} />);
    fireEvent.click(screen.getByRole('button', {name: 'Settings'}));

    // Still rendered, and inert, while it slides out...
    expect(screen.getByText('General content')).toBeInTheDocument();
    expect(screenCard('General')).toHaveAttribute('inert');
    // ...and gone once it has.
    await waitFor(
      () => expect(screen.queryByText('General content')).toBeNull(),
      {timeout: 3000},
    );
    expect(screenCard('Settings')).not.toHaveAttribute('inert');
  });

  it('moves focus to the new title after a push, and back to the pushing control after the pop', async () => {
    render(<Harness />);
    const general = screen.getByRole('button', {name: 'General'});
    general.focus();
    fireEvent.click(general);

    await waitFor(
      () =>
        expect(document.activeElement).toBe(
          screen.getByRole('heading', {name: 'General'}),
        ),
      {timeout: 3000},
    );

    fireEvent.click(screen.getByRole('button', {name: 'Settings'}));
    await waitFor(() => expect(general).toHaveFocus(), {timeout: 3000});
  });

  it('labels Back with the previous screen’s backTitle when it has one', () => {
    render(<Harness initial={['General']} backTitle="All settings" />);
    expect(screen.getByRole('button', {name: 'All settings'})).toHaveAttribute(
      'data-navigation-back',
    );
  });

  it('names Back with the catalog’s “Back” when the previous screen’s title is empty', () => {
    render(<Harness initial={['General']} rootTitle="" />);
    expect(backButton('Back')).toBeDefined();
  });

  it('pops several screens back to the root at once', async () => {
    render(<Harness initial={['General', 'General › About']} />);
    expect(backButton('General')).toBeDefined();
    act(() => {
      fireEvent.click(screen.getAllByRole('button', {name: 'Done'}).at(-1)!);
    });
    await waitFor(
      () => expect(screen.queryByText('General › About content')).toBeNull(),
      {timeout: 3000},
    );
    expect(screen.queryByText('General content')).toBeNull();
    expect(screen.getByRole('button', {name: 'Privacy'})).toBeInTheDocument();
  });

  describe('a large title', () => {
    function LargeHarness() {
      const [path, setPath] = useState<string[]>([]);
      return (
        <NavigationStack
          label="Settings"
          root={
            <NavigationScreen title="Settings" titleDisplayMode="large">
              <Root />
            </NavigationScreen>
          }
          path={path}
          onPathChange={setPath}
          getKey={entry => entry}
          renderScreen={entry => (
            <NavigationScreen title={entry} titleDisplayMode="large">
              <Detail entry={entry} />
            </NavigationScreen>
          )}
        />
      );
    }

    it('shows the title above the content and hides the bar title from assistive technology', () => {
      render(<LargeHarness />);
      const large = screen.getByRole('heading', {level: 1, name: 'Settings'});
      // First in the screen's scrolling content.
      expect(
        screenCard('Settings')?.firstElementChild?.firstElementChild
          ?.firstElementChild,
      ).toBe(large);
      // The bar's copy of the title is hidden while the large one shows.
      expect(screen.getAllByRole('heading', {name: 'Settings'})).toHaveLength(
        1,
      );
    });

    it('puts the scroll edge sentinel right after the large title', () => {
      render(<LargeHarness />);
      const scroller = screenCard('Settings')?.firstElementChild;
      const content = scroller?.firstElementChild;
      const [title, sentinel] = Array.from(content?.children ?? []);
      expect(title).toBe(
        screen.getByRole('heading', {level: 1, name: 'Settings'}),
      );
      // It ends where the large title ends, so the veil comes on as the
      // bar's title takes over. The scroller holds no other sentinel.
      expect(sentinel).toHaveAttribute('data-navigation-scroll-edge-sentinel');
      expect(sentinel).toHaveAttribute('aria-hidden', 'true');
      expect(
        scroller?.querySelectorAll('[data-navigation-scroll-edge-sentinel]'),
      ).toHaveLength(1);
    });

    it('moves focus to the pushed screen’s large title', async () => {
      render(<LargeHarness />);
      const general = screen.getByRole('button', {name: 'General'});
      general.focus();
      fireEvent.click(general);
      await waitFor(
        () =>
          expect(document.activeElement).toBe(
            screen.getByRole('heading', {level: 1, name: 'General'}),
          ),
        {timeout: 3000},
      );
    });
  });

  it('marks the top of an inline screen’s content with the scroll edge sentinel, under its veil', () => {
    render(<Harness />);
    const card = screenCard('Settings');
    const [sentinel, content] = Array.from(
      card?.firstElementChild?.children ?? [],
    );
    // The sentinel sits just above the content, at its static position in
    // the scroller. The screen's first element stays the content's first.
    expect(sentinel).toHaveAttribute('data-navigation-scroll-edge-sentinel');
    expect(
      content?.querySelector('[data-navigation-scroll-edge-sentinel]'),
    ).toBeNull();
    // The veil is the card's own child, over the scroller, hidden from
    // assistive technology.
    const veil = card?.querySelector(':scope > [data-navigation-scroll-edge]');
    expect(veil).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows a screen’s end content in its bar, out of reach once a screen covers it', async () => {
    render(<Harness rootEndContent={<button type="button">Edit</button>} />);
    const edit = screen.getByRole('button', {name: 'Edit'});
    const bar = edit.closest('[data-navigation-bar]');
    expect(bar).toHaveAttribute('data-navigation-bar', 'root');
    expect(bar).not.toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', {name: 'General'}));
    await screen.findByRole('heading', {name: 'General', level: 2});
    expect(bar).toHaveAttribute('inert');
  });

  it('keeps covered screens beyond the one underneath out of rendering', () => {
    render(<Harness initial={['General', 'General › About']} />);
    // Root, General (under the top) and About (top) are mounted; the root,
    // two below the top, keeps its state but is not rendered.
    expect(screenCard('Settings')?.className).toMatch(/cardHidden/);
    expect(screenCard('General')?.className).not.toMatch(/cardHidden/);
  });

  it('returns focus to a row’s end control that pushed', async () => {
    function EndControlRoot() {
      const nav = useNavigationStack<string>();
      return (
        <List>
          <ListItem
            label="General"
            onClick={() => nav.push('General')}
            endContent={
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation();
                  nav.push('General info');
                }}>
                Info
              </button>
            }
          />
        </List>
      );
    }
    function EndControlHarness() {
      const [path, setPath] = useState<string[]>([]);
      return (
        <NavigationStack
          label="Settings"
          root={
            <NavigationScreen title="Settings">
              <EndControlRoot />
            </NavigationScreen>
          }
          path={path}
          onPathChange={setPath}
          getKey={entry => entry}
          renderScreen={entry => (
            <NavigationScreen title={entry}>
              <p>{entry} content</p>
            </NavigationScreen>
          )}
        />
      );
    }
    render(<EndControlHarness />);
    const info = screen.getByRole('button', {name: 'Info'});
    info.focus();
    fireEvent.click(info);
    await screen.findByRole('heading', {name: 'General info', level: 2});

    fireEvent.click(backButton('Settings') as HTMLElement);
    await waitFor(
      () => expect(screen.queryByText('General info content')).toBeNull(),
      {timeout: 3000},
    );
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Info'})).toHaveFocus(),
    );
  });

  it('throws when useNavigationStack is used outside a stack', () => {
    function Orphan() {
      useNavigationStack();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/inside a NavigationStack/);
  });
});
