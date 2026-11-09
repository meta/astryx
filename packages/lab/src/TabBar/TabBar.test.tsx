// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TabBar.test.tsx
 * @input vitest, @testing-library/react, TabBar and TabBarItem
 * @output jsdom checks of the tab bar's semantics and state: the tablist and
 *   its keys, choosing and reselecting, badges, the lens at rest and theme
 *   classes.
 * @position Testing; __tests__/TabBar.interaction.browser.spec.ts proves the
 *   motion in real engines
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {useState} from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {TOUCH_QUERY} from '@astryxdesign/core/internal/touch';
import {TabBar, TabBarItem, type TabBarProps} from './TabBar';

function Glyph({name}: {name: string}) {
  return <svg data-testid={`icon-${name}`} />;
}

function Bar({
  initial = 'home',
  onReselect,
  onChange,
  badges = {},
  ...props
}: Partial<TabBarProps> & {
  initial?: string;
  badges?: Record<string, string | number | undefined>;
}) {
  const [value, setValue] = useState(initial);
  return (
    <TabBar
      value={value}
      onChange={next => {
        setValue(next);
        onChange?.(next);
      }}
      onReselect={onReselect}
      label="Sections"
      data-testid="bar"
      {...props}>
      <TabBarItem value="home" label="Home" icon={<Glyph name="home" />} />
      <TabBarItem
        value="library"
        label="Library"
        icon={<Glyph name="library" />}
        badge={badges.library}
      />
      <TabBarItem
        value="browse"
        label="Browse"
        icon={<Glyph name="browse" />}
        badge={badges.browse}
        badgeLabel="New items"
      />
      <TabBarItem
        value="profile"
        label="Profile"
        icon={<Glyph name="profile" />}
      />
    </TabBar>
  );
}

/**
 * The primary pointer is coarse until the restore runs: a phone, as the touch
 * presentation's gate reads it. Core's own test helper
 * (gestures/__tests__/pointerQuery.ts) is out of Lab's reach: Lab's typecheck
 * resolves Core through its dist.
 */
function coarsePrimaryPointer(): () => void {
  const matchMedia = window.matchMedia;
  const query = {
    matches: true,
    media: TOUCH_QUERY,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
  window.matchMedia = (media: string) =>
    media.trim() === TOUCH_QUERY ? query : matchMedia(media);
  return () => {
    window.matchMedia = matchMedia;
  };
}

// The pointer a test models, put back after it.
const restorePointer: Array<() => void> = [];
afterEach(() => {
  for (const restore of restorePointer.splice(0)) {
    restore();
  }
});

describe('TabBar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names its tab list "Tabs" when it is given no name', () => {
    render(<Bar label={undefined} />);
    expect(screen.getByRole('tablist', {name: 'Tabs'})).toBeInTheDocument();
  });

  it('wires a tab to the panel it controls through panelId (aria-controls)', () => {
    render(
      <TabBar value="home" onChange={() => {}}>
        <TabBarItem
          value="home"
          label="Home"
          icon={null}
          panelId="home-panel"
        />
        <TabBarItem value="library" label="Library" icon={null} />
      </TabBar>,
    );
    const [home, library] = screen.getAllByRole('tab');
    expect(home).toHaveAttribute('aria-controls', 'home-panel');
    expect(library).not.toHaveAttribute('aria-controls');
  });

  it('gives aria-label to the tab list, not the root', () => {
    render(<Bar label={undefined} aria-label="Main sections" />);
    expect(
      screen.getByRole('tablist', {name: 'Main sections'}),
    ).toBeInTheDocument();
    expect(screen.getByTestId('bar')).not.toHaveAttribute('aria-label');
  });

  it('names the tab list after the element aria-labelledby points at', () => {
    render(
      <>
        <h2 id="sections-heading">Sections heading</h2>
        <Bar label="Ignored" aria-labelledby="sections-heading" />
      </>,
    );
    expect(
      screen.getByRole('tablist', {name: 'Sections heading'}),
    ).toBeInTheDocument();
    expect(screen.getByTestId('bar')).not.toHaveAttribute('aria-labelledby');
  });

  it('is a named tablist of tabs with the selected one marked', () => {
    render(<Bar initial="library" />);
    const list = screen.getByRole('tablist', {name: 'Sections'});
    expect(list).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.textContent)).toEqual([
      'Home',
      'Library',
      'Browse',
      'Profile',
    ]);
    expect(screen.getByRole('tab', {name: 'Library'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', {name: 'Home'})).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('chooses another tab with onChange and moves the selection', () => {
    const onChange = vi.fn();
    const onReselect = vi.fn();
    render(<Bar onChange={onChange} onReselect={onReselect} />);
    fireEvent.click(screen.getByRole('tab', {name: 'Browse'}));
    expect(onChange).toHaveBeenCalledWith('browse');
    expect(onReselect).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', {name: 'Browse'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('reports choosing the selected tab again as a reselect, not a change', () => {
    const onChange = vi.fn();
    const onReselect = vi.fn();
    render(<Bar onChange={onChange} onReselect={onReselect} />);
    fireEvent.click(screen.getByRole('tab', {name: 'Home'}));
    expect(onReselect).toHaveBeenCalledWith('home');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('has one tab stop, on the selected tab, and arrow keys move between tabs', () => {
    render(<Bar initial="library" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(tab => tab.tabIndex)).toEqual([-1, 0, -1, -1]);
    tabs[1].focus();
    fireEvent.keyDown(tabs[1], {key: 'ArrowRight'});
    expect(document.activeElement).toBe(tabs[2]);
    fireEvent.keyDown(tabs[2], {key: 'End'});
    expect(document.activeElement).toBe(tabs[3]);
    fireEvent.keyDown(tabs[3], {key: 'Home'});
    expect(document.activeElement).toBe(tabs[0]);
    // Moving focus does not choose a tab: Enter or Space does.
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('names a badged tab with one catalog message, so a translation can reorder it', () => {
    render(
      <InternationalizationProvider
        locale="en"
        overrides={{en: {'@astryx.tabBar.badgedItem': '{badge} · {label}'}}}>
        <Bar badges={{library: 3}} />
      </InternationalizationProvider>,
    );
    expect(screen.getByRole('tab', {name: '3 · Library'})).toBeInTheDocument();
  });

  it('puts a badge in its tab’s name and draws it at once', () => {
    const {rerender} = render(<Bar badges={{library: 3}} />);
    expect(screen.getByRole('tab', {name: 'Library, 3'})).toBeInTheDocument();
    const badge = () =>
      document.querySelector('[data-tab-bar-badge="library"]');
    expect(badge()).toHaveTextContent('3');
    // Changing or clearing the badge updates it in the same render.
    rerender(<Bar badges={{library: '12'}} />);
    expect(badge()).toHaveTextContent('12');
    expect(screen.getByRole('tab', {name: 'Library, 12'})).toBeInTheDocument();
    rerender(<Bar badges={{library: ''}} />);
    expect(badge()).toBeNull();
    expect(screen.getByRole('tab', {name: 'Library'})).toBeInTheDocument();
  });

  it('reads a badge’s label instead of the badge when given one', () => {
    render(<Bar badges={{browse: '!'}} />);
    expect(
      screen.getByRole('tab', {name: 'Browse, New items'}),
    ).toBeInTheDocument();
  });

  it('keeps the badges and the lens out of the accessibility tree, and draws each item once at rest', () => {
    render(<Bar badges={{library: 3}} />);
    const lens = document.querySelector('[data-tab-bar-lens]');
    expect(lens).toHaveAttribute('aria-hidden', 'true');
    const badge = document.querySelector('[data-tab-bar-badge="library"]');
    expect(badge?.closest('[aria-hidden="true"]')).not.toBeNull();
    // At rest the lens carries no copy of the items: each icon is drawn once.
    expect(document.querySelector('[data-tab-bar-copy]')).toBeNull();
    expect(lens?.querySelectorAll('[data-testid^="icon-"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-testid^="icon-"]')).toHaveLength(4);
  });

  it('draws the lens only while a tab is selected', () => {
    const {rerender} = render(
      <TabBar value="none" onChange={() => {}}>
        <TabBarItem value="a" label="A" icon={null} />
        <TabBarItem value="b" label="B" icon={null} />
      </TabBar>,
    );
    expect(document.querySelector('[data-tab-bar-lens]')).toBeNull();
    // With nothing selected the first tab keeps the tab stop.
    expect(screen.getAllByRole('tab').map(tab => tab.tabIndex)).toEqual([
      0, -1,
    ]);
    rerender(
      <TabBar value="b" onChange={() => {}}>
        <TabBarItem value="a" label="A" icon={null} />
        <TabBarItem value="b" label="B" icon={null} />
      </TabBar>,
    );
    expect(document.querySelector('[data-tab-bar-lens]')).not.toBeNull();
  });

  it('draws the selected icon on the selected tab itself when one is given', () => {
    render(
      <TabBar value="a" onChange={() => {}}>
        <TabBarItem
          value="a"
          label="A"
          icon={<Glyph name="outline" />}
          selectedIcon={<Glyph name="filled" />}
        />
      </TabBar>,
    );
    const tab = screen.getByRole('tab', {name: 'A'});
    expect(tab.querySelector('[data-testid="icon-filled"]')).not.toBeNull();
    expect(tab.querySelector('[data-testid="icon-outline"]')).toBeNull();
  });

  it('under a mouse never mounts a copy', () => {
    render(<Bar />);
    fireEvent.click(screen.getByRole('tab', {name: 'Browse'}));
    expect(screen.getByRole('tab', {name: 'Browse'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(document.querySelector('[data-tab-bar-copy]')).toBeNull();
  });

  it('under a finger a slide mounts the copy only until the lens rests', async () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Bar />);
    expect(document.querySelector('[data-tab-bar-copy]')).toBeNull();
    fireEvent.click(screen.getByRole('tab', {name: 'Browse'}));
    // The slide's commit draws the selected look inside the lens…
    expect(document.querySelector('[data-tab-bar-copy]')).not.toBeNull();
    // …and once it rests the tab draws it again and the copy goes.
    await waitFor(() =>
      expect(document.querySelector('[data-tab-bar-copy]')).toBeNull(),
    );
    expect(
      screen
        .getByRole('tab', {name: 'Browse'})
        .querySelector('[data-testid="icon-browse"]'),
    ).not.toBeNull();
  });

  it('carries the stable theme classes and the selected state', () => {
    render(<Bar initial="browse" />);
    expect(screen.getByTestId('bar')).toHaveClass('astryx-tab-bar');
    const browse = screen.getByRole('tab', {name: 'Browse'});
    expect(browse).toHaveClass('astryx-tab-bar-item');
    expect(browse).toHaveAttribute('data-selected', 'selected');
    expect(screen.getByRole('tab', {name: 'Home'})).not.toHaveAttribute(
      'data-selected',
    );
  });

  it('ignores children that are not TabBarItem', () => {
    render(
      <TabBar value="a" onChange={() => {}}>
        <TabBarItem value="a" label="A" icon={null} />
        {null}
        <span>stray</span>
      </TabBar>,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.queryByText('stray')).toBeNull();
  });
});

describe('TabBar disabled tab', () => {
  function Disabled({onChange}: {onChange?: (value: string) => void}) {
    const [value, setValue] = useState('home');
    return (
      <TabBar
        value={value}
        onChange={next => {
          setValue(next);
          onChange?.(next);
        }}
        label="Sections">
        <TabBarItem value="home" label="Home" icon={<Glyph name="home" />} />
        <TabBarItem
          value="browse"
          label="Browse"
          icon={<Glyph name="browse" />}
          aria-disabled
        />
        <TabBarItem
          value="profile"
          label="Profile"
          icon={<Glyph name="profile" />}
        />
      </TabBar>
    );
  }

  it('is marked disabled and ignores a click', () => {
    const onChange = vi.fn();
    render(<Disabled onChange={onChange} />);
    const browse = screen.getByRole('tab', {name: 'Browse'});
    expect(browse).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(browse);
    expect(onChange).not.toHaveBeenCalled();
    expect(browse).toHaveAttribute('aria-selected', 'false');
  });

  it('is skipped by the arrow keys', () => {
    render(<Disabled />);
    const home = screen.getByRole('tab', {name: 'Home'});
    home.focus();
    fireEvent.keyDown(home, {key: 'ArrowRight'});
    expect(screen.getByRole('tab', {name: 'Profile'})).toHaveFocus();
  });

  it('keeps the other tabs choosable', () => {
    const onChange = vi.fn();
    render(<Disabled onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', {name: 'Profile'}));
    expect(onChange).toHaveBeenCalledWith('profile');
  });
});
