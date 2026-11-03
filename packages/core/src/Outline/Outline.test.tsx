// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Outline.test.tsx
 * @input Uses vitest, @testing-library/react, Outline, outline hooks/utils
 * @output Unit tests for Outline rendering, scroll-spy behavior, and extraction helpers
 * @position Testing; validates Outline implementation
 *
 * SYNC: When modified, update this header
 */

import {useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Outline} from './Outline';
import {parseOutlineFromMarkdown} from './parseOutlineFromMarkdown';
import {useOutlineFromDOM} from './useOutlineFromDOM';
import type {OutlineItem} from './types';

const items: OutlineItem[] = [
  {id: 'intro', label: 'Introduction', level: 2},
  {id: 'install', label: 'Installation', level: 3},
  {id: 'api', label: 'API', level: 3},
];

describe('parseOutlineFromMarkdown', () => {
  it('extracts headings with generated ids', () => {
    expect(parseOutlineFromMarkdown('# Intro\n\n## Getting Started')).toEqual([
      {id: 'intro', label: 'Intro', level: 1},
      {id: 'getting-started', label: 'Getting Started', level: 2},
    ]);
  });

  it('uses rendered inline text and ignores fenced code headings', () => {
    expect(
      parseOutlineFromMarkdown(
        '## **Install** `@astryxdesign/core`\n\n```\n# Not a heading\n```',
      ),
    ).toEqual([
      {
        id: 'install-astryxdesign-core',
        label: 'Install @astryxdesign/core',
        level: 2,
      },
    ]);
  });

  it('deduplicates generated ids', () => {
    expect(parseOutlineFromMarkdown('## Usage\n## Usage\n## Usage')).toEqual([
      {id: 'usage', label: 'Usage', level: 2},
      {id: 'usage-1', label: 'Usage', level: 2},
      {id: 'usage-2', label: 'Usage', level: 2},
    ]);
  });
});

describe('Outline', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a labelled nav with anchor links', () => {
    render(<Outline items={items} label="On this page" />);
    expect(
      screen.getByRole('navigation', {name: 'On this page'}),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Introduction'})).toHaveAttribute(
      'href',
      '#intro',
    );
  });

  it('uses the default accessible label', () => {
    render(<Outline items={items} />);
    expect(
      screen.getByRole('navigation', {name: 'Table of contents'}),
    ).toBeInTheDocument();
  });

  it('marks the controlled active item with aria-current', () => {
    render(<Outline items={items} activeId="install" />);
    expect(screen.getByRole('link', {name: 'Installation'})).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(
      screen.getByRole('link', {name: 'Introduction'}),
    ).not.toHaveAttribute('aria-current');
  });

  it('smooth-scrolls and defers the indicator until the scroll settles when uncontrolled', async () => {
    const user = userEvent.setup();
    const target = document.createElement('h2');
    target.id = 'install';
    document.body.appendChild(target);
    const onActiveIdChange = vi.fn();

    render(<Outline items={items} onActiveIdChange={onActiveIdChange} />);
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    // Uncontrolled: the indicator is deferred during the programmatic scroll,
    // so it has not moved to the clicked item yet.
    expect(
      screen.getByRole('link', {name: 'Installation'}),
    ).not.toHaveAttribute('aria-current', 'location');

    // When the scroll settles, the indicator lands on the clicked item.
    act(() => {
      window.dispatchEvent(new Event('scrollend'));
    });
    expect(onActiveIdChange).toHaveBeenCalledWith('install');
    expect(screen.getByRole('link', {name: 'Installation'})).toHaveAttribute(
      'aria-current',
      'location',
    );

    document.body.removeChild(target);
  });

  it('reports active id on click when controlled', async () => {
    const user = userEvent.setup();
    const target = document.createElement('h2');
    target.id = 'install';
    document.body.appendChild(target);
    const onActiveIdChange = vi.fn();

    render(
      <Outline
        items={items}
        activeId="intro"
        onActiveIdChange={onActiveIdChange}
      />,
    );
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    expect(target.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    // Controlled: there is no built-in scroll-spy, so the consumer owns the
    // active state and must be notified on click.
    expect(onActiveIdChange).toHaveBeenCalledWith('install');

    document.body.removeChild(target);
  });

  it('applies stable root and item class names', () => {
    render(<Outline items={items} data-testid="outline" activeId="api" />);
    expect(screen.getByTestId('outline').className).toContain('astryx-outline');
    expect(screen.getByRole('link', {name: 'API'}).className).toContain(
      'astryx-outline-item',
    );
    expect(screen.getByRole('link', {name: 'API'}).className).toContain(
      'active',
    );
    expect(screen.getByRole('link', {name: 'API'})).toHaveAttribute(
      'data-level',
      '3',
    );
  });

  it('renders with density="compact"', () => {
    render(
      <Outline items={items} density="compact" data-testid="outline-compact" />,
    );
    expect(screen.getByTestId('outline-compact')).toHaveAttribute(
      'data-density',
      'compact',
    );
  });

  it('renders with density="default" by default', () => {
    render(<Outline items={items} data-testid="outline-default" />);
    expect(screen.getByTestId('outline-default')).toHaveAttribute(
      'data-density',
      'default',
    );
  });

  it('renders the sliding indicator track', () => {
    const {container} = render(<Outline items={items} activeId="intro" />);
    // Track is present as an aria-hidden div
    const track = container.querySelector('[aria-hidden="true"]');
    expect(track).toBeInTheDocument();
  });

  it('renders the indicator unconditionally (CSS anchor positioning handles visibility)', () => {
    const {container} = render(<Outline items={items} activeId="intro" />);
    const indicator = container.querySelector('.astryx-outline-indicator');
    expect(indicator).toBeInTheDocument();
    // No inline top/height styles — positioning is CSS-driven
    expect((indicator as HTMLElement).style.top).toBe('');
    expect((indicator as HTMLElement).style.height).toBe('');
  });

  it('renders the active anchor before the indicator for CSS anchor positioning', () => {
    const {container} = render(<Outline items={items} activeId="intro" />);
    const activeLink = screen.getByRole('link', {name: 'Introduction'});
    const indicator = container.querySelector('.astryx-outline-indicator');

    expect(indicator).toBeInTheDocument();
    expect(
      activeLink.compareDocumentPosition(indicator as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('preserves the legacy controlled API (items + activeId + onActiveIdChange)', () => {
    // Regression guard: the pre-refresh public API must keep working unchanged.
    const onActiveIdChange = vi.fn();
    const {rerender} = render(
      <Outline
        items={items}
        activeId="intro"
        onActiveIdChange={onActiveIdChange}
      />,
    );

    expect(screen.getByRole('link', {name: 'Introduction'})).toHaveAttribute(
      'aria-current',
      'location',
    );

    // Controlled active id is driven entirely by the prop.
    rerender(
      <Outline
        items={items}
        activeId="api"
        onActiveIdChange={onActiveIdChange}
      />,
    );
    expect(screen.getByRole('link', {name: 'API'})).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(
      screen.getByRole('link', {name: 'Introduction'}),
    ).not.toHaveAttribute('aria-current');
  });

  it('updates uncontrolled active id from scroll position', () => {
    const intro = document.createElement('h2');
    intro.id = 'intro';
    const install = document.createElement('h3');
    install.id = 'install';
    const api = document.createElement('h3');
    api.id = 'api';
    document.body.append(intro, install, api);

    // Not at the bottom of the page.
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 4000,
      configurable: true,
    });

    // intro + install have scrolled above the activation line (top <= 0);
    // api is still below it, so install is the last passed heading.
    vi.spyOn(intro, 'getBoundingClientRect').mockReturnValue({
      top: -200,
    } as DOMRect);
    vi.spyOn(install, 'getBoundingClientRect').mockReturnValue({
      top: -10,
    } as DOMRect);
    vi.spyOn(api, 'getBoundingClientRect').mockReturnValue({
      top: 400,
    } as DOMRect);

    const onActiveIdChange = vi.fn();
    // The hook resolves the active id from scroll position on mount.
    render(<Outline items={items} onActiveIdChange={onActiveIdChange} />);

    expect(screen.getByRole('link', {name: 'Installation'})).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(onActiveIdChange).toHaveBeenCalledWith('install');

    document.body.removeChild(intro);
    document.body.removeChild(install);
    document.body.removeChild(api);
  });
});

/**
 * Override `scroll-margin-top` for specific elements in `getComputedStyle`.
 * jsdom's cssstyle does not resolve `scroll-margin-top`, so the real value can
 * never be read back from an inline style — the property must be faked at the
 * `getComputedStyle` boundary that useScrollSpy actually reads. Every other
 * element (and every other property) falls through to the real implementation,
 * so StyleX and Testing Library are unaffected.
 */
function mockScrollMarginTop(overrides: Map<Element, string>) {
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element, pseudoElement) => {
      const style = original(element, pseudoElement ?? undefined);
      const scrollMarginTop = overrides.get(element);
      if (scrollMarginTop != null) {
        // An own property shadows the prototype's accessor, so the real
        // CSSStyleDeclaration keeps working for every other property.
        Object.defineProperty(style, 'scrollMarginTop', {
          value: scrollMarginTop,
          configurable: true,
        });
      }
      return style;
    },
  );
}

/**
 * Mount real heading elements for `items` so navigation has scroll targets.
 * Returns a cleanup that removes them.
 */
function mountHeadings(ids: string[] = items.map(item => item.id)) {
  const headings = ids.map(id => {
    const heading = document.createElement('h2');
    heading.id = id;
    document.body.appendChild(heading);
    return heading;
  });
  return () => {
    for (const heading of headings) {
      heading.remove();
    }
  };
}

describe('Outline keyboard navigation', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes a single tab stop (roving tabindex) instead of one per heading', () => {
    render(<Outline items={items} />);
    const links = screen.getAllByRole('link');

    // A 40-heading TOC must not cost 40 Tab presses: exactly one link is in
    // the page tab order, the rest are reachable with arrow keys.
    expect(links.map(link => link.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
    ]);
  });

  it('uses actual DOM focus rather than aria-activedescendant', () => {
    render(<Outline items={items} activeId="intro" />);
    const nav = screen.getByRole('navigation', {name: 'Table of contents'});
    const links = screen.getAllByRole('link');

    act(() => {
      links[2].focus();
    });

    expect(links[2]).toHaveFocus();
    expect(nav).not.toHaveAttribute('aria-activedescendant');
    expect(links[0]).toHaveAttribute('aria-current', 'location');
    expect(links[2]).not.toHaveAttribute('aria-current');
  });

  it('seats the tab stop on the active heading, not always the first', () => {
    // WAI-ARIA roving tabindex: the single tab stop belongs on the *current*
    // item. Tabbing into a TOC while reading section 3 must land on section 3,
    // not send the reader back to section 1.
    render(<Outline items={items} activeId="api" />);
    const links = screen.getAllByRole('link');

    expect(links.map(link => link.getAttribute('tabindex'))).toEqual([
      '-1',
      '-1',
      '0',
    ]);
  });

  it('moves the tab stop as the active heading changes', () => {
    const {rerender} = render(<Outline items={items} activeId="intro" />);
    expect(
      screen.getAllByRole('link').map(l => l.getAttribute('tabindex')),
    ).toEqual(['0', '-1', '-1']);

    // Scroll-spy advances the active section: the tab stop must follow it.
    rerender(<Outline items={items} activeId="install" />);
    expect(
      screen.getAllByRole('link').map(l => l.getAttribute('tabindex')),
    ).toEqual(['-1', '0', '-1']);
  });

  it('does not yank the tab stop away from the item the user arrowed to', async () => {
    const user = userEvent.setup();
    const {rerender} = render(<Outline items={items} activeId="intro" />);
    const links = screen.getAllByRole('link');

    // User arrow-keys down to `api` and keeps focus there.
    links[0].focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(links[2]).toHaveFocus();
    expect(links[2]).toHaveAttribute('tabindex', '0');

    // Scroll-spy moves the active section underneath them. Focus is still
    // inside the list, so the tab stop must stay where the user put it.
    rerender(<Outline items={items} activeId="install" />);
    expect(links[2]).toHaveAttribute('tabindex', '0');
    expect(links[1]).toHaveAttribute('tabindex', '-1');
  });

  it('moves focus with ArrowDown / ArrowUp', async () => {
    const user = userEvent.setup();
    render(<Outline items={items} />);
    const [intro, install] = screen.getAllByRole('link');

    intro.focus();
    await user.keyboard('{ArrowDown}');
    expect(install).toHaveFocus();
    expect(install).toHaveAttribute('tabindex', '0');
    expect(intro).toHaveAttribute('tabindex', '-1');

    await user.keyboard('{ArrowUp}');
    expect(intro).toHaveFocus();
  });

  it('jumps to first / last with Home / End', async () => {
    const user = userEvent.setup();
    render(<Outline items={items} />);
    const links = screen.getAllByRole('link');

    links[0].focus();
    await user.keyboard('{End}');
    expect(links[2]).toHaveFocus();

    await user.keyboard('{Home}');
    expect(links[0]).toHaveFocus();
  });

  it('activates the focused link with Space', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const onNavigateStart = vi.fn();

    render(<Outline items={items} onNavigateStart={onNavigateStart} />);
    const install = screen.getAllByRole('link')[1];
    install.focus();
    await user.keyboard('[Space]');

    expect(onNavigateStart).toHaveBeenCalledWith('install');
    expect(document.getElementById('install')?.scrollIntoView).toBeDefined();
    expect(
      (document.getElementById('install') as HTMLElement).scrollIntoView,
    ).toHaveBeenCalledWith({behavior: 'smooth', block: 'start'});

    cleanup();
  });

  it('activates the focused link with Enter', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const onNavigateStart = vi.fn();

    render(<Outline items={items} onNavigateStart={onNavigateStart} />);
    screen.getAllByRole('link')[2].focus();
    await user.keyboard('{Enter}');

    expect(onNavigateStart).toHaveBeenCalledWith('api');
    cleanup();
  });

  it('leaves modifier chords to the browser (Cmd/Ctrl + Space is not activation)', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const onNavigateStart = vi.fn();

    render(<Outline items={items} onNavigateStart={onNavigateStart} />);
    screen.getAllByRole('link')[1].focus();
    await user.keyboard('{Meta>}[Space]{/Meta}');

    expect(onNavigateStart).not.toHaveBeenCalled();
    cleanup();
  });

  it('does not treat its own Space activation as a manual scroll', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const onNavigateEnd = vi.fn();

    render(<Outline items={items} onNavigateEnd={onNavigateEnd} />);
    screen.getAllByRole('link')[1].focus();
    await user.keyboard('[Space]');

    // Space is one of the keys that normally scroll the page, and the settle
    // watcher listens on window — so the very keydown that started this
    // navigation would bubble up and cancel it. Because we preventDefault it,
    // no scroll can happen and the navigation must survive.
    expect(onNavigateEnd).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('scrollend'));
    });
    expect(onNavigateEnd).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', {name: 'Installation'})).toHaveAttribute(
      'aria-current',
      'location',
    );

    cleanup();
  });

  it('does not treat arrow-key roving focus as a manual scroll', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const onNavigateEnd = vi.fn();

    render(<Outline items={items} onNavigateEnd={onNavigateEnd} />);
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    // Following the link focuses the section; return to the outline. Arrow
    // keys inside it move focus; they are prevented, so they do not scroll
    // the page and must not cancel the in-flight navigation.
    screen.getByRole('link', {name: 'Installation'}).focus();
    await user.keyboard('{ArrowDown}');
    expect(onNavigateEnd).not.toHaveBeenCalled();

    cleanup();
  });

  it('does not steal Tab from the page', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Outline items={items} />
        <button type="button">After</button>
      </>,
    );

    screen.getAllByRole('link')[0].focus();
    await user.tab();

    // The non-tabbable links are skipped, so one Tab leaves the whole outline.
    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
  });

  it('keeps a single tab stop with one item, and none with zero items', () => {
    const {rerender} = render(
      <Outline items={[{id: 'only', label: 'Only', level: 2}]} />,
    );
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('tabindex', '0');

    rerender(<Outline items={[]} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

describe('Outline navigate callbacks', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('moves focus to the chosen section, so the next Tab continues there (WCAG 2.4.3)', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const install = document.getElementById('install')!;
    const focus = vi.spyOn(install, 'focus');
    render(<Outline items={items} />);

    await user.click(screen.getByRole('link', {name: 'Installation'}));
    expect(install).toHaveFocus();
    // Focusing must not fight Outline's own scroll.
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
    // A heading is made programmatically focusable only, never a Tab stop.
    expect(install).toHaveAttribute('tabindex', '-1');

    // A target that already sets its own tabindex keeps it.
    install.blur();
    install.setAttribute('tabindex', '0');
    await user.click(screen.getByRole('link', {name: 'Installation'}));
    expect(install).toHaveFocus();
    expect(install).toHaveAttribute('tabindex', '0');

    cleanup();
  });

  it("keeps a target's own tabindex when it cannot take focus", async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings(['intro', 'api']);
    // A target with its own tab stop that refuses focus right now, as a
    // hidden panel does in a browser. The test DOM focuses hidden elements,
    // so the refusal is simulated.
    const panel = document.createElement('div');
    panel.id = 'install';
    panel.setAttribute('tabindex', '0');
    vi.spyOn(panel, 'focus').mockImplementation(() => {});
    document.body.appendChild(panel);
    render(<Outline items={items} />);

    await user.click(screen.getByRole('link', {name: 'Installation'}));
    expect(panel).toHaveAttribute('tabindex', '0');

    panel.remove();
    cleanup();
  });

  it('focuses a target that is already focusable without taking it out of the Tab order', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings(['intro', 'api']);
    // The "install" item points at a link, which is focusable on its own.
    const link = document.createElement('a');
    link.id = 'install';
    link.href = '#install-details';
    link.textContent = 'Install details';
    document.body.appendChild(link);
    render(<Outline items={items} />);

    await user.click(screen.getByRole('link', {name: 'Installation'}));
    expect(link).toHaveFocus();
    expect(link).not.toHaveAttribute('tabindex');

    link.remove();
    cleanup();
  });

  it('fires onNavigateStart on click and onNavigateEnd when the scroll settles', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const onNavigateStart = vi.fn();
    const onNavigateEnd = vi.fn();

    render(
      <Outline
        items={items}
        onNavigateStart={onNavigateStart}
        onNavigateEnd={onNavigateEnd}
      />,
    );
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    expect(onNavigateStart).toHaveBeenCalledWith('install');
    // Still scrolling — arrival has not happened yet.
    expect(onNavigateEnd).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('scrollend'));
    });
    expect(onNavigateEnd).toHaveBeenCalledTimes(1);
    expect(onNavigateEnd).toHaveBeenCalledWith('install');

    cleanup();
  });

  it('fires the callbacks in controlled mode too', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const onNavigateStart = vi.fn();
    const onNavigateEnd = vi.fn();

    render(
      <Outline
        items={items}
        activeId="intro"
        onNavigateStart={onNavigateStart}
        onNavigateEnd={onNavigateEnd}
      />,
    );
    await user.click(screen.getByRole('link', {name: 'API'}));

    expect(onNavigateStart).toHaveBeenCalledWith('api');
    act(() => {
      window.dispatchEvent(new Event('scrollend'));
    });
    expect(onNavigateEnd).toHaveBeenCalledTimes(1);
    expect(onNavigateEnd).toHaveBeenCalledWith('api');

    cleanup();
  });

  it('falls back to a settle timeout when scrollend never fires', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const cleanup = mountHeadings();
    const onNavigateEnd = vi.fn();

    render(<Outline items={items} onNavigateEnd={onNavigateEnd} />);
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    expect(onNavigateEnd).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onNavigateEnd).toHaveBeenCalledTimes(1);
    expect(onNavigateEnd).toHaveBeenCalledWith('install');

    cleanup();
  });

  it('fires onNavigateEnd exactly once when scrollend AND the fallback both elapse', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const cleanup = mountHeadings();
    const onNavigateEnd = vi.fn();

    render(<Outline items={items} onNavigateEnd={onNavigateEnd} />);
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    // Reduced motion turns the smooth scroll into an instant jump: scrollend
    // arrives immediately. The fallback timer must not fire a second time.
    act(() => {
      window.dispatchEvent(new Event('scrollend'));
      window.dispatchEvent(new Event('scrollend'));
      vi.advanceTimersByTime(5000);
    });
    expect(onNavigateEnd).toHaveBeenCalledTimes(1);
    expect(onNavigateEnd).toHaveBeenCalledWith('install');

    cleanup();
  });

  it('still fires onNavigateEnd once when a manual scroll interrupts the jump', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const onNavigateStart = vi.fn();
    const onNavigateEnd = vi.fn();

    render(
      <Outline
        items={items}
        onNavigateStart={onNavigateStart}
        onNavigateEnd={onNavigateEnd}
      />,
    );
    await user.click(screen.getByRole('link', {name: 'Installation'}));
    expect(onNavigateStart).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('wheel'));
    });

    // Every onNavigateStart is balanced by exactly one onNavigateEnd, so a
    // consumer's "navigating" state can never leak.
    expect(onNavigateEnd).toHaveBeenCalledTimes(1);
    expect(onNavigateEnd).toHaveBeenCalledWith('install');

    cleanup();
  });

  it('does not fire callbacks when the target heading is missing', async () => {
    const user = userEvent.setup();
    const onNavigateStart = vi.fn();
    const onNavigateEnd = vi.fn();

    render(
      <Outline
        items={items}
        onNavigateStart={onNavigateStart}
        onNavigateEnd={onNavigateEnd}
      />,
    );
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    expect(onNavigateStart).not.toHaveBeenCalled();
    expect(onNavigateEnd).not.toHaveBeenCalled();
  });

  it('leaves a missing target to the browser instead of deadening the link', async () => {
    const user = userEvent.setup();
    window.location.hash = '';

    render(<Outline items={items} />);
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    // The heading is not in the DOM (lazily-rendered or virtualized content).
    // We own the scroll only when we have something to scroll to; with no
    // target we must NOT preventDefault, or the anchor becomes a total no-op.
    // The browser's native fragment navigation still updates the URL, so a
    // later render / deep link can still resolve it.
    expect(window.location.hash).toBe('#install');

    window.location.hash = '';
  });

  it('does not fire callbacks for a modified (Cmd) click', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const onNavigateStart = vi.fn();

    render(<Outline items={items} onNavigateStart={onNavigateStart} />);
    await user.keyboard('{Meta>}');
    await user.click(screen.getByRole('link', {name: 'Installation'}));
    await user.keyboard('{/Meta}');

    expect(onNavigateStart).not.toHaveBeenCalled();
    cleanup();
  });
});

describe('Outline scroll scoping', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    // jsdom implements neither; the offset path drives the scroll through them.
    Element.prototype.scrollBy = vi.fn();
    window.scrollBy = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hasScrollOnClick={false} skips the scroll but still navigates', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const onNavigateStart = vi.fn();
    const onNavigateEnd = vi.fn();

    render(
      <Outline
        items={items}
        hasScrollOnClick={false}
        onNavigateStart={onNavigateStart}
        onNavigateEnd={onNavigateEnd}
      />,
    );
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    const target = document.getElementById('install') as HTMLElement;
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    // The consumer owns scrolling; they still learn where to go.
    expect(onNavigateStart).toHaveBeenCalledWith('install');
    // There is nothing to scroll, so nothing to wait for: onNavigateEnd must
    // resolve immediately rather than waiting out the settle timeout — an
    // arrival effect paired with onNavigateEnd would otherwise land ~1.2s late
    // for no reason.
    expect(onNavigateEnd).toHaveBeenCalledWith('install');
    expect(screen.getByRole('link', {name: 'Installation'})).toHaveAttribute(
      'aria-current',
      'location',
    );

    cleanup();
  });

  it('offset shifts the activation line for a fixed header', () => {
    const cleanup = mountHeadings();
    const [intro, install, api] = items.map(
      item => document.getElementById(item.id) as HTMLElement,
    );

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 4000,
      configurable: true,
    });
    vi.spyOn(intro, 'getBoundingClientRect').mockReturnValue({
      top: -200,
    } as DOMRect);
    // `install` sits 40px below the viewport top — under a 64px fixed header,
    // so it should already be active once `offset={64}` is declared.
    vi.spyOn(install, 'getBoundingClientRect').mockReturnValue({
      top: 40,
    } as DOMRect);
    vi.spyOn(api, 'getBoundingClientRect').mockReturnValue({
      top: 400,
    } as DOMRect);

    const {rerender} = render(<Outline items={items} />);
    // Without offset the activation line is the viewport top: `install` (top:40)
    // has not reached it, so `intro` stays active.
    expect(screen.getByRole('link', {name: 'Introduction'})).toHaveAttribute(
      'aria-current',
      'location',
    );

    rerender(<Outline items={items} offset={64} />);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByRole('link', {name: 'Installation'})).toHaveAttribute(
      'aria-current',
      'location',
    );

    cleanup();
  });

  it('lands the heading below a fixed header instead of underneath it', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const install = document.getElementById('install') as HTMLElement;

    // The heading sits 400px down the page and asks for 8px of breathing room
    // below whatever is above it.
    vi.spyOn(install, 'getBoundingClientRect').mockReturnValue({
      top: 400,
    } as DOMRect);
    mockScrollMarginTop(new Map([[install, '8px']]));

    render(<Outline items={items} offset={48} />);
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    // A 48px fixed header covers the top of the scroll root, so the heading
    // must come to rest at 48 (header) + 8 (its own scroll-margin-top) = 56px
    // — NOT at 8px, which would park it underneath the header, invisible.
    // scrollIntoView cannot know about the header, so it must not be used here.
    expect(window.scrollBy).toHaveBeenCalledWith({
      top: 400 - 56,
      behavior: 'smooth',
    });
    expect(install.scrollIntoView).not.toHaveBeenCalled();

    cleanup();
  });

  it('lands the heading below a fixed header inside a scoped container', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const install = document.getElementById('install') as HTMLElement;

    const pane = document.createElement('div');
    document.body.appendChild(pane);
    pane.scrollBy = vi.fn();
    vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue({
      top: 100,
    } as DOMRect);
    vi.spyOn(install, 'getBoundingClientRect').mockReturnValue({
      top: 500,
    } as DOMRect);

    render(
      <Outline
        items={items}
        scrollContainerRef={{current: pane}}
        offset={48}
      />,
    );
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    // Measured from the pane's own top (100), not the viewport's.
    expect(pane.scrollBy).toHaveBeenCalledWith({
      top: 500 - (100 + 48),
      behavior: 'smooth',
    });
    expect(window.scrollBy).not.toHaveBeenCalled();

    cleanup();
    pane.remove();
  });

  it('keeps the CSS-native scrollIntoView path when offset is 0', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();

    render(<Outline items={items} />);
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    // No fixed header to compensate for: let the browser honor
    // scroll-margin-top itself rather than doing the math in JS.
    const install = document.getElementById('install') as HTMLElement;
    expect(install.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(window.scrollBy).not.toHaveBeenCalled();

    cleanup();
  });

  it('composes offset with the heading own scroll-margin-top for activation', () => {
    const cleanup = mountHeadings();
    const [intro, install, api] = items.map(
      item => document.getElementById(item.id) as HTMLElement,
    );

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 4000,
      configurable: true,
    });
    // Every heading declares 8px of scroll-margin-top; the header is 48px.
    // The activation line is therefore 48 + 8 = 56px (+1px tolerance).
    mockScrollMarginTop(
      new Map([
        [intro, '8px'],
        [install, '8px'],
        [api, '8px'],
      ]),
    );
    vi.spyOn(intro, 'getBoundingClientRect').mockReturnValue({
      top: -200,
    } as DOMRect);
    // 50 < 56: `install` has crossed the composed line, so it is active.
    vi.spyOn(install, 'getBoundingClientRect').mockReturnValue({
      top: 50,
    } as DOMRect);
    // 60 > 56: `api` has NOT crossed it. If offset and scroll-margin-top were
    // double-counted (96px) this would wrongly activate.
    vi.spyOn(api, 'getBoundingClientRect').mockReturnValue({
      top: 60,
    } as DOMRect);

    render(<Outline items={items} offset={48} />);

    expect(screen.getByRole('link', {name: 'Installation'})).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(screen.getByRole('link', {name: 'API'})).not.toHaveAttribute(
      'aria-current',
    );

    cleanup();
  });

  it('scrollContainerRef scopes tracking to a custom scroll container', () => {
    const cleanup = mountHeadings();
    const [intro, install, api] = items.map(
      item => document.getElementById(item.id) as HTMLElement,
    );

    // A split-pane / modal scroll container. It is deliberately NOT a
    // scrollable ancestor of the Outline, so the auto-detect heuristic would
    // fall back to the window — the exact case that leaves a TOC's highlight
    // stuck today. Scoping must use this element's box as the activation line.
    const pane = document.createElement('div');
    document.body.appendChild(pane);
    vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue({
      top: 300,
    } as DOMRect);
    Object.defineProperty(pane, 'scrollTop', {value: 0, configurable: true});
    Object.defineProperty(pane, 'clientHeight', {
      value: 500,
      configurable: true,
    });
    Object.defineProperty(pane, 'scrollHeight', {
      value: 4000,
      configurable: true,
    });

    // Relative to the pane's top (300), intro and install have passed; api not.
    // Relative to the viewport (0) all three would have passed, which would
    // make `api` active — so this asserts the pane really is the scroll root.
    vi.spyOn(intro, 'getBoundingClientRect').mockReturnValue({
      top: 100,
    } as DOMRect);
    vi.spyOn(install, 'getBoundingClientRect').mockReturnValue({
      top: 250,
    } as DOMRect);
    vi.spyOn(api, 'getBoundingClientRect').mockReturnValue({
      top: 600,
    } as DOMRect);

    render(<Outline items={items} scrollContainerRef={{current: pane}} />);

    expect(screen.getByRole('link', {name: 'Installation'})).toHaveAttribute(
      'aria-current',
      'location',
    );

    pane.remove();
    cleanup();
  });

  it('settles a scoped navigation on the container scrollend, not the window', async () => {
    const user = userEvent.setup();
    const cleanup = mountHeadings();
    const onNavigateEnd = vi.fn();

    const pane = document.createElement('div');
    document.body.appendChild(pane);

    render(
      <Outline
        items={items}
        scrollContainerRef={{current: pane}}
        onNavigateEnd={onNavigateEnd}
      />,
    );
    await user.click(screen.getByRole('link', {name: 'Installation'}));

    // A window scrollend must NOT settle a container-scoped navigation.
    act(() => {
      window.dispatchEvent(new Event('scrollend'));
    });
    expect(onNavigateEnd).not.toHaveBeenCalled();

    act(() => {
      pane.dispatchEvent(new Event('scrollend'));
    });
    expect(onNavigateEnd).toHaveBeenCalledTimes(1);
    expect(onNavigateEnd).toHaveBeenCalledWith('install');

    pane.remove();
    cleanup();
  });
});

describe('useOutlineFromDOM', () => {
  it('collects headings from DOM container', () => {
    function Demo() {
      const ref = useRef<HTMLElement | null>(null);
      const outlineItems = useOutlineFromDOM(ref);

      return (
        <>
          <article ref={ref}>
            <h2 id="intro">Intro</h2>
            <h3 id="details">Details</h3>
          </article>
          <output>
            {outlineItems
              .map(item => `${item.level}:${item.id}:${item.label}`)
              .join('|')}
          </output>
        </>
      );
    }

    render(<Demo />);
    expect(
      screen.getByText('2:intro:Intro|3:details:Details'),
    ).toBeInTheDocument();
  });
});
