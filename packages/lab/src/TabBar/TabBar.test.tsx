// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TabBar.test.tsx
 * @input vitest, @testing-library/react, TabBar and TabBarItem
 * @output jsdom checks of the tab bar's semantics and state: the tablist and
 *   its keys, choosing and reselecting, badges, the lens at rest and theme
 *   classes. Also minimizing on scroll and the bottom accessory's placement.
 * @position Testing; __tests__/TabBar.interaction.browser.spec.ts proves the
 *   motion in real engines
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {useRef, useState} from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {InternationalizationProvider} from '@astryxdesign/core/i18n';
import {TOUCH_QUERY} from '@astryxdesign/core/internal/touch';
import {TabBar, TabBarItem, TabBarSearchTab, type TabBarProps} from './TabBar';
import {TabBarMoreList} from './TabBarMoreList';
import {focusChosenTab} from './useTabBarLens';

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
    expect(
      screen
        .getByRole('tablist')
        .querySelectorAll('[role="tab"] [data-testid^="icon-"]'),
    ).toHaveLength(4);
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

  it('with minimizing off the tab list stands alone: no bar box, platter or tab layer (INV7)', () => {
    const {container} = render(<Bar />);
    const root = container.querySelector('.astryx-tab-bar');
    const list = screen.getByRole('tablist');
    expect(list.parentElement).toBe(root);
    expect(container.querySelector('[data-tab-bar-platter]')).toBeNull();
    expect(container.querySelector('[data-tab-bar-items]')).toBeNull();
    expect(
      [...list.children].filter(child => child.getAttribute('role') === 'tab'),
    ).toHaveLength(4);
  });

  it('mounts the circle and the split glass only when minimizing is on', () => {
    restorePointer.push(coarsePrimaryPointer());
    const {unmount} = render(<Bar />);
    expect(document.querySelector('[data-tab-bar-circle]')).toBeNull();
    // The tab list draws its own glass: no platter.
    expect(document.querySelector('[data-tab-bar-platter]')).toBeNull();
    unmount();
    render(<Bar minimizeBehavior="onScrollDown" />);
    expect(document.querySelector('[data-tab-bar-circle]')).not.toBeNull();
    expect(
      document.querySelector('[data-tab-bar-platter]')?.children,
    ).toHaveLength(3);
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

describe('TabBar minimize on scroll', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'scrollY', {value: 0, configurable: true});
  });

  function scrollTo(y: number) {
    Object.defineProperty(window, 'scrollY', {value: y, configurable: true});
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
  }

  /** One finger on the page, as the gesture host reads a touch. */
  function touch(type: 'touchstart' | 'touchmove' | 'touchend', y: number) {
    const event = new Event(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    const point = {
      identifier: 1,
      clientX: 200,
      clientY: y,
      target: document.body,
    };
    Object.defineProperty(event, 'changedTouches', {value: [point]});
    Object.defineProperty(event, 'touches', {
      value: type === 'touchend' ? [] : [point],
    });
    Object.defineProperty(event, 'timeStamp', {value: performance.now()});
    document.body.dispatchEvent(event);
  }

  /** A finger dragging the page through `ys`. */
  function dragPage(ys: number[]) {
    act(() => {
      touch('touchstart', 600);
      // Past the pan's 10 px: the person is scrolling the page.
      touch('touchmove', 580);
    });
    for (const y of ys) {
      scrollTo(y);
    }
    act(() => {
      touch('touchend', 580);
      // The page comes to rest, as the browser reports it.
      window.dispatchEvent(new Event('scrollend'));
    });
  }

  const isMinimized = () =>
    screen
      .getByRole('tablist', {hidden: true})
      .hasAttribute('data-tab-bar-minimized');

  it('never minimizes by default', () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Bar />);
    dragPage([40, 80, 160]);
    expect(isMinimized()).toBe(false);
  });

  it('minimizes 66 px into a downward scroll, not before', () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Bar minimizeBehavior="onScrollDown" />);
    // The page restored to 300 by a script: not the person's scroll.
    scrollTo(300);
    dragPage([320, 365]);
    expect(isMinimized()).toBe(false);
    dragPage([366]);
    expect(isMinimized()).toBe(true);
  });

  it('stays minimized while scrolling back up mid-page, and expands at the top', () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Bar minimizeBehavior="onScrollDown" />);
    dragPage([100]);
    expect(isMinimized()).toBe(true);
    dragPage([60, 20]);
    expect(isMinimized()).toBe(true);
    dragPage([0]);
    expect(isMinimized()).toBe(false);
  });

  it('stays minimized when a script scrolls the page to the top', () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Bar minimizeBehavior="onScrollDown" />);
    dragPage([200]);
    expect(isMinimized()).toBe(true);
    // Long after the finger: not the person's scroll.
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 10_000);
    scrollTo(0);
    expect(isMinimized()).toBe(true);
  });

  it('minimized, exposes only the circle: the selected tab, collapsed', () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Bar minimizeBehavior="onScrollDown" initial="library" />);
    const circle = document.querySelector('[data-tab-bar-circle]');
    expect(circle).toHaveAttribute('aria-hidden', 'true');
    dragPage([200]);
    // The tabs are out of reach until the bar expands, as on iOS.
    for (const tab of screen.getAllByRole('tab', {hidden: true})) {
      expect(tab).toHaveAttribute('inert');
    }
    const button = screen.getByRole('button', {name: 'Library'});
    expect(button).toBe(circle);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('tabindex', '0');
  });

  it('minimized with no tab selected, the circle takes the bar’s name and the keys expand onto the first tab', () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Bar minimizeBehavior="onScrollDown" initial="none" />);
    dragPage([200]);
    const button = screen.getByRole('button', {name: 'Sections'});
    button.focus();
    fireEvent.click(button);
    expect(isMinimized()).toBe(false);
    expect(screen.getByRole('tab', {name: 'Home'})).toHaveFocus();
  });

  it('activating the circle from the keys expands the bar and focuses the selected tab', () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Bar minimizeBehavior="onScrollDown" initial="library" />);
    dragPage([200]);
    const button = screen.getByRole('button', {name: 'Library'});
    button.focus();
    fireEvent.click(button);
    expect(isMinimized()).toBe(false);
    const library = screen.getByRole('tab', {name: 'Library'});
    expect(library).not.toHaveAttribute('inert');
    expect(library).toHaveFocus();
  });

  it('expands on a tap on the circle, keeping the selection', () => {
    restorePointer.push(coarsePrimaryPointer());
    const onChange = vi.fn();
    render(
      <Bar
        minimizeBehavior="onScrollDown"
        initial="browse"
        onChange={onChange}
      />,
    );
    dragPage([200]);
    const circle = document.querySelector('[data-tab-bar-circle]');
    expect(circle?.querySelector('[data-testid="icon-browse"]')).not.toBeNull();
    fireEvent.click(circle as Element);
    expect(isMinimized()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', {name: 'Browse'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('expands when a tab receives focus', () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Bar minimizeBehavior="onScrollDown" />);
    dragPage([200]);
    act(() => {
      screen.getByRole('tab', {name: 'Home'}).focus();
    });
    expect(isMinimized()).toBe(false);
  });

  it('moves the bottom accessory inline while minimized, telling its content where it is', () => {
    restorePointer.push(coarsePrimaryPointer());
    const placements: string[] = [];
    render(
      <Bar
        minimizeBehavior="onScrollDown"
        bottomAccessory={placement => {
          placements.push(placement);
          return <button type="button">Now playing</button>;
        }}
      />,
    );
    const accessory = () => document.querySelector('[data-tab-bar-accessory]');
    expect(accessory()).toHaveAttribute('data-tab-bar-accessory', 'expanded');
    dragPage([200]);
    expect(accessory()).toHaveAttribute('data-tab-bar-accessory', 'inline');
    expect(placements.at(-1)).toBe('inline');
    // The accessory stays usable while the bar is minimized.
    expect(screen.getByRole('button', {name: 'Now playing'})).toBeVisible();
    dragPage([0]);
    expect(accessory()).toHaveAttribute('data-tab-bar-accessory', 'expanded');
  });

  it('stays expanded under a mouse', () => {
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    render(<Bar minimizeBehavior="onScrollDown" />);
    dragPage([200]);
    expect(isMinimized()).toBe(false);
  });

  it('minimizes under any finger, Android included (one touch model)', () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Bar minimizeBehavior="onScrollDown" />);
    dragPage([200]);
    expect(isMinimized()).toBe(true);
  });
});

describe('TabBar bottom accessory', () => {
  it('draws no accessory when its content renders nothing', () => {
    for (const bottomAccessory of [false, '', () => null]) {
      const {container, unmount} = render(
        <Bar bottomAccessory={bottomAccessory} />,
      );
      expect(container.querySelector('[data-tab-bar-accessory]')).toBeNull();
      unmount();
    }
  });

  it('renders its content above the bar, outside the tablist', () => {
    render(<Bar bottomAccessory={<span>Mini player</span>} />);
    const content = screen.getByText('Mini player');
    expect(
      content.closest('[data-tab-bar-accessory="expanded"]'),
    ).not.toBeNull();
    expect(content.closest('[role="tablist"]')).toBeNull();
  });

  it('renders nothing without one', () => {
    render(<Bar />);
    expect(document.querySelector('[data-tab-bar-accessory]')).toBeNull();
  });
});

describe('TabBar search tab', () => {
  function SearchBar({onChange}: {onChange?: (value: string) => void}) {
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
        />
        <TabBarSearchTab
          value="search"
          label="Search"
          icon={<Glyph name="search" />}
        />
      </TabBar>
    );
  }

  it('is the last tab of the tablist, named by its label', () => {
    render(<SearchBar />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.at(-1)).toHaveAccessibleName('Search');
    expect(tabs.at(-1)).toHaveAttribute('aria-selected', 'false');
    expect(tabs.at(-1)).toHaveAttribute('tabindex', '-1');
  });

  it('selects the search tab like any other, taking the tab stop', () => {
    const onChange = vi.fn();
    render(<SearchBar onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    expect(onChange).toHaveBeenCalledWith('search');
    const search = screen.getByRole('tab', {name: 'Search'});
    expect(search).toHaveAttribute('aria-selected', 'true');
    expect(search).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', {name: 'Home'})).toHaveAttribute(
      'tabindex',
      '-1',
    );
  });

  it('reaches the search tab with the arrow keys', () => {
    render(<SearchBar />);
    const home = screen.getByRole('tab', {name: 'Home'});
    home.focus();
    fireEvent.keyDown(home, {key: 'End'});
    expect(screen.getByRole('tab', {name: 'Search'})).toHaveFocus();
  });
});

describe('TabBar search tab, selected', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function Searching({
    automaticallyActivates,
    onActiveChange,
    bottomAccessory,
    initial = 'browse',
  }: {
    automaticallyActivates?: boolean;
    onActiveChange?: (isActive: boolean) => void;
    bottomAccessory?: React.ReactNode;
    initial?: string;
  }) {
    const [value, setValue] = useState(initial);
    const [isActive, setIsActive] = useState(false);
    const fieldRef = useRef<HTMLInputElement | null>(null);
    return (
      <TabBar
        value={value}
        onChange={setValue}
        label="Sections"
        bottomAccessory={bottomAccessory}>
        <TabBarItem value="home" label="Home" icon={<Glyph name="home" />} />
        <TabBarItem
          value="browse"
          label="Browse"
          icon={<Glyph name="browse" />}
          selectedIcon={<Glyph name="browse-filled" />}
        />
        <TabBarSearchTab
          value="search"
          label="Search"
          icon={<Glyph name="search" />}
          isActive={isActive}
          onActiveChange={next => {
            setIsActive(next);
            onActiveChange?.(next);
          }}
          fieldRef={fieldRef}
          automaticallyActivates={automaticallyActivates}>
          <input ref={fieldRef} aria-label="Search query" />
        </TabBarSearchTab>
      </TabBar>
    );
  }

  it('mounted on its search tab, the leading circle returns to the tab it shows', () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Searching initial="search" />);
    const circle = document.querySelector('[data-tab-bar-circle]');
    // No tab was chosen before: the circle shows, and is named after, the
    // first tab, and returns there.
    expect(circle).toHaveAccessibleName('Home');
    fireEvent.click(circle as Element);
    expect(screen.getByRole('tab', {name: 'Home'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('leaving search from the circle reports the field inactive', () => {
    restorePointer.push(coarsePrimaryPointer());
    const onActiveChange = vi.fn();
    // The field waits inline, so the circle is in reach (an active field
    // covers it, and Cancel leaves search then).
    render(
      <Searching
        automaticallyActivates={false}
        onActiveChange={onActiveChange}
      />,
    );
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    expect(onActiveChange).not.toHaveBeenCalled();
    const circle = document.querySelector('[data-tab-bar-circle]') as Element;
    expect(circle.closest('[inert]')).toBeNull();
    fireEvent.click(circle);
    // The field goes with the tab. The app's `isActive` stays in step, so the
    // next visit to the search tab opens with no stale active field.
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
    expect(onActiveChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('tab', {name: 'Browse'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('choosing another tab while searching reports the field inactive once', () => {
    // Under a mouse the search tab is selected in place and the other tabs
    // stay in reach.
    const onActiveChange = vi.fn();
    render(<Searching onActiveChange={onActiveChange} />);
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    expect(onActiveChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('tab', {name: 'Home'}));
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
    expect(onActiveChange).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('tab', {name: 'Home'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('leaving search from the circle with the keys moves focus on to the tab it returns to', () => {
    restorePointer.push(coarsePrimaryPointer());
    // The field waits inline, so the circle is in reach.
    render(<Searching automaticallyActivates={false} />);
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    const circle = document.querySelector(
      '[data-tab-bar-circle]',
    ) as HTMLElement;
    expect(circle.closest('[inert]')).toBeNull();
    act(() => {
      circle.focus();
    });
    fireEvent.click(circle);
    // Expanded, the circle is hidden and holds no tab stop: focus cannot
    // stay on it (WCAG 2.4.3).
    const browse = screen.getByRole('tab', {name: 'Browse'});
    expect(browse).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(browse);
  });

  it('keeps the field mounted but inert until the search tab is chosen', () => {
    render(<Searching />);
    const field = screen.getByLabelText('Search query', {selector: 'input'});
    expect(field.closest('[data-tab-bar-search-field]')).toHaveAttribute(
      'inert',
    );
  });

  it('activates and focuses the field in the tap that chooses the search tab', () => {
    restorePointer.push(coarsePrimaryPointer());
    const onActiveChange = vi.fn();
    render(<Searching onActiveChange={onActiveChange} />);
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    expect(onActiveChange).toHaveBeenCalledWith(true);
    const field = screen.getByLabelText('Search query', {selector: 'input'});
    expect(field).toHaveFocus();
    const host = field.closest('[data-tab-bar-search-field]');
    expect(host).not.toHaveAttribute('inert');
    expect(host).toHaveAttribute('data-tab-bar-search-field', 'active');
  });

  it('with automaticallyActivates={false}, the field waits inline', () => {
    restorePointer.push(coarsePrimaryPointer());
    const onActiveChange = vi.fn();
    render(
      <Searching
        automaticallyActivates={false}
        onActiveChange={onActiveChange}
      />,
    );
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    expect(onActiveChange).not.toHaveBeenCalled();
    const field = screen.getByLabelText('Search query', {selector: 'input'});
    expect(field).not.toHaveFocus();
    expect(field.closest('[data-tab-bar-search-field]')).toHaveAttribute(
      'data-tab-bar-search-field',
      'inline',
    );
  });

  it('collapses the bar to a circle holding the tab it came from, which returns to it', () => {
    restorePointer.push(coarsePrimaryPointer());
    const {container} = render(<Searching automaticallyActivates={false} />);
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    expect(screen.getByRole('tablist')).toHaveAttribute(
      'data-tab-bar-minimized',
    );
    const circle = container.querySelector('[data-tab-bar-circle]');
    expect(
      circle?.querySelector('[data-testid="icon-browse-filled"]'),
    ).not.toBeNull();
    fireEvent.click(circle as Element);
    expect(screen.getByRole('tab', {name: 'Browse'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tablist')).not.toHaveAttribute(
      'data-tab-bar-minimized',
    );
  });

  it('under a finger the active field gets a Cancel button outside the tab list: without a cancel on the handle it blurs the field and reports inactive', () => {
    restorePointer.push(coarsePrimaryPointer());
    const onActiveChange = vi.fn();
    render(<Searching onActiveChange={onActiveChange} />);
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    const field = screen.getByLabelText('Search query', {selector: 'input'});
    expect(field).toHaveFocus();
    const cancel = screen.getByRole('button', {name: 'Cancel'});
    expect(cancel).toHaveAttribute('data-tab-bar-search-cancel');
    // Not inside the tab list, whose tabs (the search tab's circle included)
    // stay inert while searching.
    expect(cancel.closest('[role="tablist"]')).toBeNull();
    expect(
      document.querySelector('[data-tab-bar-search]')?.closest('[inert]'),
    ).not.toBeNull();
    fireEvent.click(cancel);
    // The field moves back into the bar: it gives up its focus, so the
    // keyboard goes with it (spec:AST-099 FR5).
    expect(field).not.toHaveFocus();
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
  });

  it('the focus Cancel hands on never pans the page', () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Searching />);
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    const cancel = screen.getByRole('button', {name: 'Cancel'});
    act(() => {
      cancel.focus();
    });
    const circle = document.querySelector(
      '[data-tab-bar-circle]',
    ) as HTMLElement;
    const focus = vi.spyOn(circle, 'focus');
    fireEvent.click(cancel);
    // The bar is fixed over the page: a focus move inside it never scrolls.
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
  });

  it('activated from the keys, Cancel hands its focus on to the collapsed bar’s circle when the search tab stays selected', () => {
    restorePointer.push(coarsePrimaryPointer());
    render(<Searching />);
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    const cancel = screen.getByRole('button', {name: 'Cancel'});
    act(() => {
      cancel.focus();
    });
    fireEvent.click(cancel);
    // Cancel is gone; focus did not fall to the page (WCAG 2.4.3).
    expect(screen.queryByRole('button', {name: 'Cancel'})).toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector('[data-tab-bar-circle]'),
    );
  });

  it("the cancel button cancels through the field's handle", () => {
    restorePointer.push(coarsePrimaryPointer());
    const cancel = vi.fn();
    function WithHandle() {
      const [value, setValue] = useState('home');
      const [isActive, setIsActive] = useState(false);
      const handle = useRef({focus: () => {}, blur: () => {}, cancel});
      return (
        <TabBar value={value} onChange={setValue} label="Sections">
          <TabBarItem value="home" label="Home" icon={<Glyph name="home" />} />
          <TabBarSearchTab
            value="search"
            label="Search"
            icon={<Glyph name="search" />}
            isActive={isActive}
            onActiveChange={setIsActive}
            fieldRef={handle}
          />
        </TabBar>
      );
    }
    render(<WithHandle />);
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('under a mouse the search circle stays a tab while its field is active', () => {
    render(<Searching />);
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    expect(screen.getByRole('tab', {name: 'Search'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('button', {name: 'Cancel'})).toBeNull();
  });

  it('sets the bottom accessory aside while searching', () => {
    restorePointer.push(coarsePrimaryPointer());
    const {container} = render(
      <Searching
        automaticallyActivates={false}
        bottomAccessory={<button type="button">Play</button>}
      />,
    );
    const accessory = container.querySelector('[data-tab-bar-accessory]');
    expect(accessory).not.toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    expect(accessory).toHaveAttribute('inert');
  });

  it('under a mouse selects in place: the bar stays expanded and the field takes the accessory’s place, focused', () => {
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    render(<Searching bottomAccessory={<span>Mini player</span>} />);
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    const field = screen.getByLabelText('Search query', {selector: 'input'});
    expect(field).toHaveFocus();
    expect(field.closest('[data-tab-bar-search-field]')).toHaveAttribute(
      'data-tab-bar-search-field',
      'above',
    );
    expect(screen.getByRole('tablist')).not.toHaveAttribute(
      'data-tab-bar-minimized',
    );
    expect(
      screen.getByText('Mini player').closest('[data-tab-bar-accessory]'),
    ).toHaveAttribute('inert');
  });

  it('under a mouse Escape returns to the tab search was chosen from, and the accessory with it', () => {
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    render(<Searching bottomAccessory={<span>Mini player</span>} />);
    fireEvent.click(screen.getByRole('tab', {name: 'Search'}));
    fireEvent.keyDown(
      screen.getByLabelText('Search query', {selector: 'input'}),
      {key: 'Escape'},
    );
    const browse = screen.getByRole('tab', {name: 'Browse'});
    expect(browse).toHaveAttribute('aria-selected', 'true');
    expect(browse).toHaveFocus();
    expect(
      screen.getByText('Mini player').closest('[data-tab-bar-accessory]'),
    ).not.toHaveAttribute('inert');
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
          isDisabled
        />
        <TabBarItem
          value="profile"
          label="Profile"
          icon={<Glyph name="profile" />}
        />
      </TabBar>
    );
  }

  it('is marked disabled and ignores a tap', () => {
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
});

describe('TabBar More tab', () => {
  const SIX = ['home', 'library', 'browse', 'profile', 'settings', 'help'];
  const tabs = SIX.map(value => (
    <TabBarItem
      key={value}
      value={value}
      label={value[0].toUpperCase() + value.slice(1)}
      icon={<Glyph name={value} />}
    />
  ));

  it('shows the first four tabs and More when there are more than five', () => {
    render(
      <TabBar value="home" onChange={() => {}} label="Sections">
        {tabs}
      </TabBar>,
    );
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Home',
      'Library',
      'Browse',
      'Profile',
      'More',
    ]);
  });

  it('selects More for a tab it holds, and chooses More with its value', () => {
    const onChange = vi.fn();
    const {rerender} = render(
      <TabBar value="settings" onChange={onChange} label="Sections">
        {tabs}
      </TabBar>,
    );
    expect(screen.getByRole('tab', {name: 'More'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    rerender(
      <TabBar value="home" onChange={onChange} label="Sections">
        {tabs}
      </TabBar>,
    );
    fireEvent.click(screen.getByRole('tab', {name: 'More'}));
    expect(onChange).toHaveBeenCalledWith('more');
  });

  it('More again while it holds a tab is a reselect, back to its list', () => {
    const onChange = vi.fn();
    const onReselect = vi.fn();
    render(
      <TabBar
        value="help"
        onChange={onChange}
        onReselect={onReselect}
        label="Sections">
        {tabs}
      </TabBar>,
    );
    fireEvent.click(screen.getByRole('tab', {name: 'More'}));
    expect(onReselect).toHaveBeenCalledWith('more');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows a tab’s badge in its More row, spoken with the row', () => {
    render(
      <TabBarMoreList onChoose={() => {}}>
        {[
          ...tabs.slice(0, 4),
          <TabBarItem
            key="settings"
            value="settings"
            label="Settings"
            icon={<Glyph name="settings" />}
          />,
          <TabBarItem
            key="help"
            value="help"
            label="Help"
            icon={<Glyph name="help" />}
            badge={2}
          />,
        ]}
      </TabBarMoreList>,
    );
    expect(screen.getByRole('button', {name: /Help, 2/})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Help/})).toHaveTextContent('2');
  });

  it('lists the tabs past the fourth, and a row chooses its tab', () => {
    const onChoose = vi.fn();
    render(
      <TabBarMoreList value="help" onChoose={onChoose}>
        {tabs}
      </TabBarMoreList>,
    );
    const list = screen.getByRole('list', {name: 'More'});
    expect(list).toHaveTextContent('Settings');
    expect(list).toHaveTextContent('Help');
    expect(list).not.toHaveTextContent('Profile');
    fireEvent.click(screen.getByRole('button', {name: /Settings/}));
    expect(onChoose).toHaveBeenCalledWith('settings');
  });
});

describe('focusChosenTab, in another document', () => {
  it('moves focus to the chosen tab through the bar’s own document, inside an iframe', () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const doc = iframe.contentDocument;
    if (doc == null) {
      throw new Error('no iframe document');
    }
    const capsule = doc.createElement('div');
    const tabs = ['Home', 'Library', 'Profile'].map(name => {
      const tab = doc.createElement('button');
      tab.setAttribute('role', 'tab');
      tab.textContent = name;
      capsule.append(tab);
      return tab;
    });
    doc.body.append(capsule);
    tabs[0].focus();
    expect(doc.activeElement).toBe(tabs[0]);
    focusChosenTab(capsule, tabs[2]);
    expect(doc.activeElement).toBe(tabs[2]);
    iframe.remove();
  });
});
