// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandPalette.test.tsx
 * @input Uses vitest, @testing-library/react, CommandPalette
 * @output Unit tests for CommandPalette dialog shell
 * @position Testing; validates CommandPalette.tsx implementation
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, waitFor, fireEvent, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {CommandPalette} from './CommandPalette';
import {CommandPaletteInput} from './CommandPaletteInput';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import type {SearchSource, SearchableItem} from '@astryxdesign/core/Typeahead';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';

const simpleSource = createStaticSource([
  {id: 'home', label: 'Home'},
  {id: 'settings', label: 'Settings'},
]);

const groupedSource = createStaticSource([
  {id: 'home', label: 'Home', auxiliaryData: {group: 'Navigation'}},
  {id: 'save', label: 'Save', auxiliaryData: {group: 'Actions'}},
]);

const emptySource = createStaticSource([]);

function NestedDismissible({onDismiss}: {onDismiss: () => void}) {
  useLayerDismissal({isActive: true, onDismiss});
  return null;
}

// Mock showModal and close since jsdom doesn't implement them
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  // The live regions are module-level singletons; reset them so
  // announcements from one test don't leak into the next.
  __resetLiveRegionsForTest();
});

describe('CommandPalette', () => {
  it('renders when isOpen is true', () => {
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={simpleSource}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not show content when isOpen is false', () => {
    render(
      <CommandPalette
        isOpen={false}
        onOpenChange={() => {}}
        searchSource={simpleSource}
      />,
    );
    const dialog = screen.getByRole('dialog', {hidden: true});
    expect(dialog).not.toHaveAttribute('open');
  });

  it('has correct aria-label', () => {
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={simpleSource}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-label',
      'Command palette',
    );
  });

  it('supports custom label', () => {
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={simpleSource}
        label="Quick search"
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-label',
      'Quick search',
    );
  });

  it('renders default input and footer when not provided', () => {
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={simpleSource}
      />,
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText(/Navigate/)).toBeInTheDocument();
  });

  it('renders custom input and footer slots', () => {
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={simpleSource}
        input={<div data-testid="input-slot">Custom Input</div>}
        footer={<div data-testid="footer-slot">Custom Footer</div>}
      />,
    );
    expect(screen.getByTestId('input-slot')).toBeInTheDocument();
    expect(screen.getByTestId('footer-slot')).toBeInTheDocument();
  });

  it('default renders items from searchSource bootstrap', async () => {
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={simpleSource}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  it('auto-groups items by auxiliaryData.group', async () => {
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={groupedSource}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Navigation')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  it('uses renderItem for custom item content', async () => {
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={simpleSource}
        renderItem={item => <span>{item.label.toUpperCase()}</span>}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('HOME')).toBeInTheDocument();
      expect(screen.getByText('SETTINGS')).toBeInTheDocument();
    });
  });

  it('passes isSelected=true to renderItem for the selected value', async () => {
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={simpleSource}
        value="home"
        renderItem={(item, isSelected) => (
          <span>{isSelected ? `checked-${item.label}` : item.label}</span>
        )}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('checked-Home')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  it('shows emptyBootstrapText when bootstrap returns nothing', async () => {
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={emptySource}
        emptyBootstrapText="Nothing to show"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Nothing to show')).toBeInTheDocument();
    });
  });

  it('keeps actionable empty content outside listbox semantics', async () => {
    const {container} = render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={emptySource}
        emptyBootstrapText={<a href="/commands/new">Create a command</a>}
      />,
    );

    expect(
      await screen.findByRole('link', {name: 'Create a command'}),
    ).toHaveAttribute('href', '/commands/new');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('.astryx-command-palette-empty'),
    ).toHaveLength(1);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-controls');
  });

  it('shows default emptyBootstrapText when not provided', async () => {
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={emptySource}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Type to search')).toBeInTheDocument();
    });
  });

  it('clears a stale highlight across empty and repopulated results', async () => {
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={simpleSource}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText('Settings')).toBeInTheDocument(),
    );

    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-item-1$/);

    fireEvent.change(input, {target: {value: 'zzz'}});
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(input).not.toHaveAttribute('aria-activedescendant');

    fireEvent.change(input, {target: {value: 'hom'}});
    await waitFor(() =>
      expect(screen.getByRole('option', {name: 'Home'})).toBeInTheDocument(),
    );
    expect(input).not.toHaveAttribute('aria-activedescendant');

    fireEvent.keyDown(input, {key: 'ArrowDown'});
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', {name: 'Home'}).id,
    );
  });

  it('calls onOpenChange(false) when Escape is pressed', () => {
    const handleOpenChange = vi.fn();
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={handleOpenChange}
        searchSource={simpleSource}
      />,
    );
    const dialog = screen.getByRole('dialog');
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(escapeEvent);
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('lets the topmost nested layer handle Escape before the palette', () => {
    const handleOpenChange = vi.fn();
    const handleNestedDismiss = vi.fn();
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={handleOpenChange}
        searchSource={simpleSource}
        input={
          <>
            <CommandPaletteInput />
            <NestedDismissible onDismiss={handleNestedDismiss} />
          </>
        }
      />,
    );

    fireEvent.keyDown(screen.getByRole('combobox'), {key: 'Escape'});

    expect(handleNestedDismiss).toHaveBeenCalledOnce();
    expect(handleOpenChange).not.toHaveBeenCalled();
  });

  it('preserves local Escape closing for inline previews', () => {
    const handleOpenChange = vi.fn();
    render(
      <CommandPalette
        isOpen={true}
        isInline
        onOpenChange={handleOpenChange}
        searchSource={simpleSource}
      />,
    );

    fireEvent.keyDown(screen.getByRole('combobox'), {key: 'Escape'});

    expect(handleOpenChange).toHaveBeenCalledOnce();
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the empty state mounted while a no-result search is pending', async () => {
    // A source whose searches resolve only when we release them, so we can
    // observe the render output while a search transition is in flight.
    const resolvers: ((items: SearchableItem[]) => void)[] = [];
    const source: SearchSource = {
      bootstrap: () => [],
      async search(): Promise<SearchableItem[]> {
        return new Promise<SearchableItem[]>(resolve => {
          resolvers.push(resolve);
        });
      },
    };

    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={source}
        emptyBootstrapText="Type to search"
        emptySearchText="No results"
      />,
    );

    const input = screen.getByRole('combobox');

    // First search: commits an empty result for query "z".
    fireEvent.change(input, {target: {value: 'z'}});
    await waitFor(() => expect(resolvers).toHaveLength(1));
    resolvers[0]([]);
    await waitFor(() =>
      expect(screen.getByText('No results')).toBeInTheDocument(),
    );

    // Second keystroke while already empty: the empty state must remain in the
    // DOM for the whole pending window — no unmount/remount flash.
    fireEvent.change(input, {target: {value: 'zz'}});
    expect(screen.getByText('No results')).toBeInTheDocument();
    await waitFor(() => expect(resolvers).toHaveLength(2));
    expect(screen.getByText('No results')).toBeInTheDocument();
    resolvers[1]([]);
    await waitFor(() =>
      expect(screen.getByText('No results')).toBeInTheDocument(),
    );
  });

  it('discards a search response that resolves after the palette closed', async () => {
    // A source whose search resolves only when released, and no cancel()
    // implementation — closing the palette must invalidate the request itself.
    const resolvers: ((items: SearchableItem[]) => void)[] = [];
    const source: SearchSource = {
      bootstrap: () => [],
      async search(): Promise<SearchableItem[]> {
        return new Promise<SearchableItem[]>(resolve => {
          resolvers.push(resolve);
        });
      },
    };

    function Harness() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <CommandPalette
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          searchSource={source}
        />
      );
    }
    render(<Harness />);

    const input = screen.getByRole('combobox');
    fireEvent.change(input, {target: {value: 'a'}});
    await waitFor(() => expect(resolvers).toHaveLength(1));

    // Close while the search is still in flight.
    const dialog = screen.getByRole('dialog');
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(escapeEvent);
    await waitFor(() =>
      expect(screen.getByRole('dialog', {hidden: true})).not.toHaveAttribute(
        'open',
      ),
    );

    // The stale response arrives after close — it must not re-commit the
    // abandoned query/results into the closed palette.
    await act(async () => {
      resolvers[0]([{id: 'stale', label: 'Stale item'}]);
    });

    expect(screen.getByRole('combobox', {hidden: true})).toHaveValue('');
    expect(screen.queryByText('Stale item')).not.toBeInTheDocument();
  });

  it('does not move the highlight while typing in the search input', async () => {
    // The palette's input already filters; letting the shared combobox
    // typeahead also chase prefixes would drag the highlight — and Enter —
    // onto a command the user never picked.
    const gitSource = createStaticSource([
      {id: 'git-add', label: 'git add'},
      {id: 'git-commit', label: 'git commit'},
      {id: 'git-push', label: 'git push'},
    ]);
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={() => {}}
        searchSource={gitSource}
      />,
    );

    const input = screen.getByRole('combobox');
    await waitFor(() =>
      expect(screen.getByText('git add')).toBeInTheDocument(),
    );

    fireEvent.keyDown(input, {key: 'g'});
    fireEvent.keyDown(input, {key: 'i'});
    fireEvent.keyDown(input, {key: 't'});

    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  it('keeps Home and End on the query field and uses Page keys for results', async () => {
    const user = userEvent.setup();
    const handleOpenChange = vi.fn();
    const handleValueChange = vi.fn();
    render(
      <CommandPalette
        isOpen={true}
        onOpenChange={handleOpenChange}
        onValueChange={handleValueChange}
        searchSource={simpleSource}
      />,
    );

    const input = screen.getByRole<HTMLInputElement>('combobox');
    await waitFor(() =>
      expect(screen.getByText('Settings')).toBeInTheDocument(),
    );
    await user.click(input);
    await user.type(input, 'e');
    await waitFor(() =>
      expect(screen.getByText('Settings')).toBeInTheDocument(),
    );
    const homeOption = screen.getByText('Home').closest('[role="option"]');
    const settingsOption = screen
      .getByText('Settings')
      .closest('[role="option"]');

    expect(input).toHaveValue('e');
    expect(input.selectionStart).toBe(1);
    await user.keyboard('{Home}');
    expect(input.selectionStart).toBe(0);
    await user.keyboard('{End}');
    expect(input.selectionStart).toBe(1);
    expect(input).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{PageDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(
      settingsOption?.id,
    );
    await user.keyboard('{PageUp}');
    expect(input.getAttribute('aria-activedescendant')).toBe(homeOption?.id);
    await user.keyboard('{Enter}');
    expect(handleValueChange).toHaveBeenCalledWith('home');
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('highlights on hover without scrolling and scrolls once per key (#6077)', async () => {
    // Hover must be handled by the root's delegated list handler (routed to
    // useCombobox's hover-aware path), and the shared useHighlightedOptionScroll effect
    // must be the single keyboard scroll owner. Calling the raw setter on
    // hover kept the stationary-pointer runaway path alive, and the item's
    // own scrollIntoView effect doubled every scroll call.
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      render(
        <CommandPalette
          isOpen={true}
          onOpenChange={() => {}}
          searchSource={simpleSource}
        />,
      );
      const input = screen.getByRole('combobox');
      await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());
      const home = screen.getByText('Home');
      const settings = screen.getByText('Settings');

      fireEvent.mouseOver(home);
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(input.getAttribute('aria-activedescendant')).toBe(
        home.closest('[role="option"]')?.id,
      );

      // Moving between siblings does not re-enter the list container. Include
      // relatedTarget so the test exercises actual within-list transitions.
      fireEvent.mouseOut(home, {relatedTarget: settings});
      fireEvent.mouseOver(settings, {relatedTarget: home});
      expect(input.getAttribute('aria-activedescendant')).toBe(
        settings.closest('[role="option"]')?.id,
      );
      expect(scrollIntoView).not.toHaveBeenCalled();

      fireEvent.mouseOut(settings, {relatedTarget: home});
      fireEvent.mouseOver(home, {relatedTarget: settings});
      expect(input.getAttribute('aria-activedescendant')).toBe(
        home.closest('[role="option"]')?.id,
      );
      expect(scrollIntoView).not.toHaveBeenCalled();

      fireEvent.keyDown(input, {key: 'ArrowDown'});
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(input.getAttribute('aria-activedescendant')).toBe(
        settings.closest('[role="option"]')?.id,
      );

      fireEvent.keyDown(input, {key: 'ArrowUp'});
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
    } finally {
      delete (HTMLElement.prototype as unknown as {scrollIntoView?: unknown})
        .scrollIntoView;
    }
  });

  describe('screen reader announcements', () => {
    const politeRegion = () =>
      document.querySelector('[data-astryx-live-region="polite"]');

    it('announces the result count politely after typing a query', async () => {
      render(
        <CommandPalette
          isOpen={true}
          onOpenChange={() => {}}
          searchSource={simpleSource}
        />,
      );
      await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());
      // "e" matches both Home and Settings.
      fireEvent.change(screen.getByRole('combobox'), {target: {value: 'e'}});
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('2 results');
      });
    });

    it('announces the singular form when one item matches', async () => {
      render(
        <CommandPalette
          isOpen={true}
          onOpenChange={() => {}}
          searchSource={simpleSource}
        />,
      );
      await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());
      // "set" matches only Settings. Anchored so it cannot pass on "1 results".
      fireEvent.change(screen.getByRole('combobox'), {target: {value: 'set'}});
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent(/^1 result$/);
      });
    });

    it('announces the rendered default empty state when nothing matches', async () => {
      render(
        <CommandPalette
          isOpen={true}
          onOpenChange={() => {}}
          searchSource={simpleSource}
        />,
      );
      await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());
      fireEvent.change(screen.getByRole('combobox'), {target: {value: 'zzz'}});
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent(/^No results$/);
      });
    });

    it('announces rich emptySearchText exactly as rendered', async () => {
      render(
        <CommandPalette
          isOpen={true}
          onOpenChange={() => {}}
          searchSource={simpleSource}
          emptySearchText={
            <span>
              Nothing like that here. <a href="/commands/new">Add a command</a>
            </span>
          }
        />,
      );
      await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());
      fireEvent.change(screen.getByRole('combobox'), {target: {value: 'zzz'}});

      expect(
        await screen.findByRole('link', {name: 'Add a command'}),
      ).toHaveAttribute('href', '/commands/new');
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent(
          /^Nothing like that here\. Add a command$/,
        );
      });
    });

    it('waits for a narrowed search to settle before announcing no results', async () => {
      const resolvers: ((items: SearchableItem[]) => void)[] = [];
      const source: SearchSource = {
        bootstrap: () => [
          {id: 'home', label: 'Home'},
          {id: 'settings', label: 'Settings'},
        ],
        async search(): Promise<SearchableItem[]> {
          return new Promise<SearchableItem[]>(resolve => {
            resolvers.push(resolve);
          });
        },
      };
      const spoken: string[] = [];
      const observer = new MutationObserver(() => {
        const text = politeRegion()?.textContent ?? '';
        if (text !== '' && spoken.at(-1) !== text) {
          spoken.push(text);
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      try {
        render(
          <CommandPalette
            isOpen={true}
            onOpenChange={() => {}}
            searchSource={source}
          />,
        );
        await waitFor(() =>
          expect(screen.getByText('Home')).toBeInTheDocument(),
        );
        const input = screen.getByRole('combobox');

        fireEvent.change(input, {target: {value: 'e'}});
        await act(async () =>
          resolvers.shift()?.(source.bootstrap() as SearchableItem[]),
        );
        await waitFor(() => expect(spoken.at(-1)).toBe('2 results'));

        // Optimistic narrowing empties the list while the source is still
        // answering; the source then finds one match.
        fireEvent.change(input, {target: {value: 'ez'}});
        await act(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
        });
        await act(async () =>
          resolvers.shift()?.([{id: 'settings', label: 'Settings'}]),
        );
        await waitFor(() => expect(spoken.at(-1)).toBe('1 result'));
        expect(spoken).not.toContain('No results');
      } finally {
        observer.disconnect();
      }
    });

    it('announces loading politely while a search is in flight', async () => {
      // A source whose searches never resolve, so the palette stays busy and
      // only the loading announcement can reach the live region.
      const source: SearchSource = {
        bootstrap: () => [],
        async search(): Promise<SearchableItem[]> {
          return new Promise<SearchableItem[]>(() => {});
        },
      };
      render(
        <CommandPalette
          isOpen={true}
          onOpenChange={() => {}}
          searchSource={source}
        />,
      );
      fireEvent.change(screen.getByRole('combobox'), {target: {value: 'z'}});
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Loading');
      });
    });

    it('announces no result count on initial open (bootstrap)', async () => {
      render(
        <CommandPalette
          isOpen={true}
          onOpenChange={() => {}}
          searchSource={simpleSource}
        />,
      );
      await waitFor(() => expect(screen.getByText('Home')).toBeInTheDocument());
      // Flush effects and any pending live-region rAF writes.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      // The bootstrap's busy start may say "Loading" (spec:AST-086 FR3, FR8);
      // its results are never counted aloud.
      expect(['', 'Loading']).toContain(politeRegion()?.textContent ?? '');
    });
  });
});
