// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file HoverCard.test.tsx
 * @input Uses vitest, @testing-library/react, HoverCard component
 * @output Unit tests for HoverCard component behavior
 * @position Testing; validates HoverCard.tsx implementation
 *
 * SYNC: When HoverCard.tsx changes, update tests to match new behavior
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
} from 'vitest';
import {
  render,
  renderHook,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {hydrateRoot} from 'react-dom/client';
import {StrictMode} from 'react';
import {Button} from '../Button/Button';
import {Theme, defineTheme} from '../theme';
import {HoverCard} from './HoverCard';
import {useHoverCard} from './useHoverCard';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';

// Store original matches to restore later
const originalMatches = HTMLElement.prototype.matches;

// Track popover open state per element
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

// Mock Popover API for jsdom
beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
  });

  // Only intercept :popover-open, delegate everything else to original
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    return originalMatches.call(this, selector);
  };
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = originalMatches;
});

beforeEach(() => {
  vi.mocked(HTMLElement.prototype.showPopover).mockClear();
  vi.mocked(HTMLElement.prototype.hidePopover).mockClear();
});

describe('useHoverCard identity', () => {
  it('keeps callback refs stable across unchanged rerenders', () => {
    const {result, rerender} = renderHook(() => useHoverCard());
    const firstRef = result.current.ref;
    const firstInteractionRef = result.current.interactionRef;

    rerender();

    expect(result.current.ref).toBe(firstRef);
    expect(result.current.interactionRef).toBe(firstInteractionRef);
  });

  it('does not rebind trigger listeners on rerender', () => {
    function Harness() {
      const card = useHoverCard();
      return (
        <div>
          <span ref={card.ref}>Trigger</span>
          {card.renderHoverCard(<div>Card</div>)}
        </div>
      );
    }
    const {getByText, rerender} = render(<Harness />);
    const trigger = getByText('Trigger');
    const added: string[] = [];
    const add = trigger.addEventListener.bind(trigger);
    trigger.addEventListener = ((type: string, ...rest: unknown[]) => {
      added.push(type);
      return (add as (...args: unknown[]) => void)(type, ...rest);
    }) as typeof trigger.addEventListener;

    rerender(<Harness />);

    expect(added).toEqual([]);
  });
});

// A card closed while the pointer rests on it unmounts without a mouseleave,
// so the hook must not keep believing the pointer is over the card: if it
// does, the next open of the same trigger never closes on leave.
describe('useHoverCard closing while the pointer is on the card', () => {
  function Harness() {
    const card = useHoverCard({delay: 0, hideDelay: 0});
    return (
      <div>
        <span ref={card.ref}>Trigger</span>
        <output data-testid="state">{card.isOpen ? 'open' : 'closed'}</output>
        {card.renderHoverCard(
          <button type="button" onClick={card.hide}>
            Pick
          </button>,
        )}
      </div>
    );
  }

  async function openThenRestOnCard() {
    const state = screen.getByTestId('state');
    fireEvent.mouseEnter(screen.getByText('Trigger'));
    await waitFor(() => expect(state).toHaveTextContent('open'));
    const pick = screen.getByRole('button', {name: 'Pick', hidden: true});
    fireEvent.mouseLeave(screen.getByText('Trigger'));
    fireEvent.mouseEnter(pick.parentElement!);
    return {state, pick};
  }

  async function expectNextOpenClosesOnLeave(state: HTMLElement) {
    const trigger = screen.getByText('Trigger');
    fireEvent.mouseEnter(trigger);
    await waitFor(() => expect(state).toHaveTextContent('open'));
    fireEvent.mouseLeave(trigger);
    await waitFor(() => expect(state).toHaveTextContent('closed'));
  }

  it('closes the next open on leave after hide() from inside the card', async () => {
    render(<Harness />);
    const {state, pick} = await openThenRestOnCard();

    fireEvent.click(pick);
    await waitFor(() => expect(state).toHaveTextContent('closed'));

    await expectNextOpenClosesOnLeave(state);
  });

  it('closes the next open on leave after Escape dismisses the card', async () => {
    render(<Harness />);
    const {state} = await openThenRestOnCard();

    fireEvent.keyDown(document.body, {key: 'Escape'});
    await waitFor(() => expect(state).toHaveTextContent('closed'));

    await expectNextOpenClosesOnLeave(state);
  });
});

describe('HoverCard', () => {
  it('renders trigger element', () => {
    render(
      <HoverCard content={<span>Card content</span>}>
        <button type="button">Trigger</button>
      </HoverCard>,
    );
    expect(screen.getByRole('button', {name: 'Trigger'})).toBeInTheDocument();
  });

  it('exposes the floating layer as role="group" when no label is provided', async () => {
    render(
      <HoverCard content={<span>Card content</span>} delay={0}>
        <button type="button">Trigger</button>
      </HoverCard>,
    );
    // A group may validly be unnamed; an unnamed dialog may not. Without a
    // label the layer must not claim the dialog role.
    expect(screen.queryByRole('group', {hidden: true})).toBeNull();
    expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('button', {name: 'Trigger'}));

    await waitFor(() => {
      expect(screen.getByRole('group', {hidden: true})).toHaveTextContent(
        'Card content',
      );
    });
  });

  it('exposes the floating layer as a named dialog when label is provided', async () => {
    render(
      <HoverCard
        content={<span>Card content</span>}
        label="Profile preview"
        delay={0}>
        <button type="button">Trigger</button>
      </HoverCard>,
    );
    expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('button', {name: 'Trigger'}));

    const dialog = await screen.findByRole('dialog', {hidden: true});
    expect(dialog).toHaveAttribute('aria-label', 'Profile preview');
    expect(dialog).toHaveTextContent('Card content');
    expect(screen.queryByRole('group', {hidden: true})).toBeNull();
  });

  it('wraps element children in an inline-safe span', () => {
    const {container} = render(
      <p>
        Before{' '}
        <HoverCard content={<span>Card content</span>}>
          <a href="#trigger">Trigger</a>
        </HoverCard>{' '}
        after
      </p>,
    );

    const trigger = screen.getByRole('link', {name: 'Trigger'});
    const paragraph = container.querySelector('p');

    expect(trigger.parentElement?.tagName).toBe('SPAN');
    expect(paragraph?.querySelector('div')).toBeNull();
    expect(paragraph?.querySelector('template')).not.toBeNull();
  });

  it('portals block content before showing and restores the marker after hiding', async () => {
    let contentWasPresentAtShow = false;
    vi.mocked(HTMLElement.prototype.showPopover).mockImplementationOnce(
      function (this: HTMLElement) {
        contentWasPresentAtShow =
          this.textContent?.includes('Block card content') ?? false;
        popoverOpenState.set(this, true);
      },
    );
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const {container} = render(
      <p>
        Before{' '}
        <HoverCard
          content={<div>Block card content</div>}
          delay={0}
          hideDelay={0}>
          Trigger
        </HoverCard>{' '}
        after
      </p>,
    );

    const paragraph = container.querySelector('p');
    const trigger = screen.getByText('Trigger');

    expect(screen.queryByText('Block card content')).toBeNull();
    expect(paragraph?.querySelector('template')).not.toBeNull();
    expect(paragraph?.querySelector('div')).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    fireEvent.mouseEnter(trigger);

    await waitFor(() => {
      const content = screen.getByText('Block card content');
      const layer = content.closest('[popover]');

      expect(layer?.tagName).toBe('DIV');
      expect(layer?.parentElement).toBe(container);
      expect(paragraph?.contains(content)).toBe(false);
      expect(contentWasPresentAtShow).toBe(true);
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    fireEvent.mouseLeave(trigger);

    await waitFor(() => {
      expect(screen.queryByText('Block card content')).toBeNull();
      expect(paragraph?.querySelector('template')).not.toBeNull();
    });

    consoleErrorSpy.mockRestore();
  });

  it('hosts the floating layer outside a wrapping link', async () => {
    // Interactive ancestors capture the layer's own interactions: a card left
    // inside an <a> puts its links and buttons inside that link, so clicking
    // one navigates.
    render(
      <a href="#profile">
        <HoverCard
          content={
            <span>
              <a href="#inner">Inner link</a>
            </span>
          }
          delay={0}>
          Trigger
        </HoverCard>
      </a>,
    );

    const link = screen.getByRole('link', {name: /Trigger/});
    expect(screen.queryByText('Inner link')).toBeNull();
    fireEvent.mouseEnter(screen.getByText('Trigger'));

    const layer = (await screen.findByText('Inner link')).closest('[popover]');

    expect(layer).not.toBeNull();
    expect(link.contains(layer as Node)).toBe(false);
  });

  it('keeps a safe layer inline at its JSX position', async () => {
    const {container} = render(
      <>
        <HoverCard content={<div>Block card content</div>} delay={0}>
          <button type="button">Trigger</button>
        </HoverCard>
        <button type="button">Following control</button>
      </>,
    );

    expect(screen.queryByText('Block card content')).toBeNull();
    fireEvent.mouseEnter(screen.getByRole('button', {name: 'Trigger'}));

    await waitFor(() => {
      const layer = screen.getByText('Block card content').closest('[popover]');
      const following = screen.getByRole('button', {name: 'Following control'});

      expect(layer?.parentElement).toBe(container);
      expect(layer?.nextElementSibling).toBe(following);
    });
  });

  it('does not render content initially', () => {
    const {container} = render(
      <HoverCard content={<span>Card content</span>}>
        <button type="button">Trigger</button>
      </HoverCard>,
    );
    expect(screen.queryByText('Card content')).toBeNull();
    expect(container.querySelector('[popover]')).toBeNull();
    expect(container.querySelector('template')).not.toBeNull();
  });

  it('keeps a paragraph portal inside the nearest nested theme scope', async () => {
    const outerTheme = defineTheme({name: 'hovercard-outer-test'});
    const innerTheme = defineTheme({
      name: 'hovercard-inner-test',
      components: {
        'hover-card': {base: {borderWidth: '7px'}},
        button: {base: {fontWeight: '700'}},
      },
    });

    const {container} = render(
      <Theme theme={outerTheme}>
        <Theme theme={innerTheme}>
          <p>
            <HoverCard
              content={<Button label="View profile">View profile</Button>}
              delay={0}>
              Trigger
            </HoverCard>
          </p>
        </Theme>
      </Theme>,
    );

    fireEvent.mouseEnter(screen.getByText('Trigger'));

    await waitFor(() => {
      const button = screen.getByText('View profile').closest('button');
      const layer = button?.closest('[popover]') ?? null;
      const innerThemeScope = container.querySelector(
        '[data-astryx-theme="hovercard-inner-test"]',
      );

      expect(innerThemeScope).not.toBeNull();
      expect(button).not.toBeNull();
      expect(layer?.parentElement).toBe(innerThemeScope);
      expect(innerThemeScope?.contains(layer)).toBe(true);
      expect(container.querySelector('p')?.contains(layer)).toBe(false);
    });
  });

  it('does not freeze computed CSS variables on a paragraph portal', async () => {
    const variables = new Map([
      ['--color-neutral', 'rgb(1, 2, 3)'],
      ['--color-text-primary', 'rgb(250, 251, 252)'],
    ]);
    const getComputedStyleSpy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation(
        element =>
          ({
            length: variables.size,
            item: (index: number) => Array.from(variables.keys())[index] ?? '',
            getPropertyValue: (property: string) =>
              variables.get(property) ?? '',
            direction:
              element.tagName.toLowerCase() === 'template' ? 'rtl' : 'ltr',
            writingMode:
              element.tagName.toLowerCase() === 'template'
                ? 'vertical-rl'
                : 'horizontal-tb',
          }) as CSSStyleDeclaration,
      );

    const {container} = render(
      <p>
        <HoverCard
          content={<Button label="View profile">View profile</Button>}
          delay={0}>
          Trigger
        </HoverCard>
      </p>,
    );

    expect(screen.queryByRole('button', {name: 'View profile'})).toBeNull();
    fireEvent.mouseEnter(screen.getByText('Trigger'));

    await waitFor(() => {
      const button = screen.getByRole('button', {name: 'View profile'});
      const layer = button.closest('[popover]');

      expect(layer?.parentElement).toBe(container);
      expect(container.querySelector('p')?.contains(button)).toBe(false);
      expect(layer).not.toBeNull();
      expect(
        (layer as HTMLElement).style.getPropertyValue('--color-neutral'),
      ).toBe('');
      expect(
        (layer as HTMLElement).style.getPropertyValue('--color-text-primary'),
      ).toBe('');
      expect((layer as HTMLElement).style.direction).toBe('rtl');
      expect((layer as HTMLElement).style.writingMode).toBe('vertical-rl');
    });

    getComputedStyleSpy.mockRestore();
  });

  it('applies the theme body font to the floating layer', async () => {
    render(
      <HoverCard content={<span>Card content</span>} delay={0}>
        <button type="button">Trigger</button>
      </HoverCard>,
    );

    fireEvent.mouseEnter(screen.getByRole('button', {name: 'Trigger'}));
    const layer = (await screen.findByText('Card content')).closest(
      '[popover]',
    );
    expect(layer).not.toBeNull();
    expect(getComputedStyle(layer as Element).fontFamily).toBe(
      'var(--font-family-body)',
    );
  });

  it('advertises a dialog popup on the trigger when labelled', () => {
    render(
      <HoverCard content={<span>Card content</span>} label="Profile actions">
        <button type="button">Trigger</button>
      </HoverCard>,
    );
    const trigger = screen.getByRole('button', {name: 'Trigger'});
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    // While closed, the layer is not in the DOM, so aria-controls must not
    // point at a missing id (see DateInput). It is set once the card opens.
    expect(trigger).not.toHaveAttribute('aria-controls');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });

  it('merges existing popup attributes on the trigger when labelled', () => {
    render(
      <HoverCard content={<span>Card content</span>} label="Profile actions">
        <button
          type="button"
          aria-haspopup="menu"
          aria-controls="menu-id"
          aria-expanded="true">
          Trigger
        </button>
      </HoverCard>,
    );
    const trigger = screen.getByRole('button', {name: 'Trigger'});
    // The hover card's dialog popup is advertised, but the trigger's own
    // popup semantics are preserved rather than overwritten.
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger.getAttribute('aria-controls')).toContain('menu-id');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('omits aria-expanded on a trigger whose role does not support it', () => {
    render(
      <HoverCard content={<span>Card content</span>} label="Timestamp details">
        <time dateTime="2026-08-25" tabIndex={0}>
          2 hours ago
        </time>
      </HoverCard>,
    );
    const trigger = screen.getByText('2 hours ago');
    expect(trigger.tagName).toBe('TIME');
    // Global attributes are valid on any element, so the popup relationship is
    // still advertised.
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    // aria-expanded is not: <time> has no role that supports it, and emitting
    // it is a critical axe aria-allowed-attr violation.
    expect(trigger).not.toHaveAttribute('aria-expanded');
  });

  it('keeps aria-expanded on a role-less trigger that declares a supporting role', () => {
    render(
      <HoverCard content={<span>Card content</span>} label="Profile actions">
        <span role="button" tabIndex={0}>
          Trigger
        </span>
      </HoverCard>,
    );
    const trigger = screen.getByRole('button', {name: 'Trigger'});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('leaves a role-less trigger own aria-expanded untouched', () => {
    render(
      <HoverCard content={<span>Card content</span>} label="Profile actions">
        <span aria-expanded="true">Trigger</span>
      </HoverCard>,
    );
    const trigger = screen.getByText('Trigger');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps aria-expanded on triggers whose implicit role supports it', () => {
    render(
      <HoverCard content={<span>Card content</span>} label="Profile actions">
        <input type="button" value="Trigger" />
      </HoverCard>,
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('keeps aria-describedby on the trigger when no label is provided', () => {
    render(
      <HoverCard content={<span>Card content</span>}>
        <button type="button">Trigger</button>
      </HoverCard>,
    );
    const trigger = screen.getByRole('button', {name: 'Trigger'});
    expect(trigger).toHaveAttribute('aria-describedby');
    expect(trigger).not.toHaveAttribute('aria-haspopup');
  });

  it('preserves existing aria-describedby when no label is provided', () => {
    render(
      <HoverCard content={<span>Card content</span>}>
        <button type="button" aria-describedby="existing-id">
          Trigger
        </button>
      </HoverCard>,
    );
    const trigger = screen.getByRole('button', {name: 'Trigger'});
    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).toContain('existing-id');
  });

  it('updates aria-expanded when the labelled hover card opens and closes', async () => {
    render(
      <HoverCard
        content={<span>Card content</span>}
        label="Profile actions"
        delay={0}>
        <button type="button">Trigger</button>
      </HoverCard>,
    );
    const trigger = screen.getByRole('button', {name: 'Trigger'});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');

    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      // The layer is in the DOM now, so aria-controls points at it.
      expect(trigger).toHaveAttribute('aria-controls');
    });

    fireEvent.mouseLeave(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      // The layer is gone from the DOM, so aria-controls is cleared.
      expect(trigger).not.toHaveAttribute('aria-controls');
    });
  });

  it('calls onOpenChange(true) when shown', async () => {
    const onOpenChange = vi.fn();
    render(
      <HoverCard
        content={<span>Card content</span>}
        onOpenChange={onOpenChange}
        delay={0}>
        <button type="button">Trigger</button>
      </HoverCard>,
    );

    const trigger = screen.getByRole('button', {name: 'Trigger'});
    fireEvent.mouseEnter(trigger);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  it('respects isEnabled prop', async () => {
    const onOpenChange = vi.fn();
    render(
      <HoverCard
        content={<span>Card content</span>}
        onOpenChange={onOpenChange}
        isEnabled={false}
        delay={0}>
        <button type="button">Trigger</button>
      </HoverCard>,
    );

    const trigger = screen.getByRole('button', {name: 'Trigger'});
    fireEvent.mouseEnter(trigger);

    // Wait a bit and verify onOpenChange was not called
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('supports text-only children with inline wrapper', () => {
    render(
      <HoverCard content={<span>Card content</span>} label="Profile actions">
        Just text, no element
      </HoverCard>,
    );
    // Text should be rendered
    expect(screen.getByText('Just text, no element')).toBeInTheDocument();
    // When labelled, the wrapper advertises a dialog popup.
    const wrapper = screen.getByText('Just text, no element');
    expect(wrapper.tagName).toBe('SPAN');
    expect(wrapper).toHaveAttribute('aria-haspopup', 'dialog');
    // The wrapper is a role-less <span>; aria-expanded is invalid there.
    expect(wrapper).not.toHaveAttribute('aria-expanded');
    // While closed, the layer is not in the DOM, so aria-controls is unset.
    expect(wrapper).not.toHaveAttribute('aria-controls');
    expect(wrapper).not.toHaveAttribute('aria-describedby');
  });

  it('keeps aria-describedby on text-only children when no label is provided', () => {
    render(
      <HoverCard content={<span>Card content</span>}>
        Just text, no element
      </HoverCard>,
    );
    const wrapper = screen.getByText('Just text, no element');
    expect(wrapper.tagName).toBe('SPAN');
    expect(wrapper).toHaveAttribute('aria-describedby');
    expect(wrapper).not.toHaveAttribute('aria-haspopup');
  });

  describe('isDefaultOpen', () => {
    it('shows hover card on mount when isDefaultOpen is true', async () => {
      vi.mocked(HTMLElement.prototype.showPopover).mockClear();
      render(
        <HoverCard content={<span>Default open card</span>} isDefaultOpen>
          <button type="button">Trigger</button>
        </HoverCard>,
      );

      await waitFor(() => {
        expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
      });
    });

    it('calls onOpenChange(true) on mount when isDefaultOpen is true', async () => {
      const onOpenChange = vi.fn();
      render(
        <HoverCard
          content={<span>Default open card</span>}
          isDefaultOpen
          onOpenChange={onOpenChange}>
          <button type="button">Trigger</button>
        </HoverCard>,
      );

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('does not show hover card on mount when isDefaultOpen is not set', async () => {
      vi.mocked(HTMLElement.prototype.showPopover).mockClear();
      render(
        <HoverCard content={<span>Not default open</span>}>
          <button type="button">Trigger</button>
        </HoverCard>,
      );

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    });

    it('hover card is still dismissible after isDefaultOpen', async () => {
      const onOpenChange = vi.fn();
      render(
        <HoverCard
          content={<span>Dismissible card</span>}
          isDefaultOpen
          onOpenChange={onOpenChange}
          hideDelay={0}>
          <button type="button">Trigger</button>
        </HoverCard>,
      );

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });

      const trigger = screen.getByRole('button', {name: 'Trigger'});
      fireEvent.mouseLeave(trigger);

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('Escape key behavior', () => {
    it('hides hover card when Escape is pressed on trigger', async () => {
      const onOpenChange = vi.fn();
      // Reset the mock before this test
      vi.mocked(HTMLElement.prototype.hidePopover).mockClear();

      render(
        <HoverCard
          content={<span>Card content</span>}
          onOpenChange={onOpenChange}
          delay={0}
          hideDelay={0}>
          <button type="button">Trigger</button>
        </HoverCard>,
      );

      const trigger = screen.getByRole('button', {name: 'Trigger'});

      // Show the hover card
      fireEvent.mouseEnter(trigger);
      await waitFor(() => {
        expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
      });

      // Press Escape on trigger
      fireEvent.keyDown(trigger, {key: 'Escape'});

      // hidePopover should be called
      await waitFor(() => {
        expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
      });
    });

    it('hides hover card when Escape is pressed inside content', async () => {
      vi.mocked(HTMLElement.prototype.hidePopover).mockClear();

      render(
        <HoverCard
          content={<button type="button">Interactive button</button>}
          delay={0}
          hideDelay={0}>
          <button type="button">Trigger</button>
        </HoverCard>,
      );

      const trigger = screen.getByRole('button', {name: 'Trigger'});

      // Show the hover card
      fireEvent.mouseEnter(trigger);
      await waitFor(() => {
        expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
      });

      // Find the interactive content using getByText (works inside popovers)
      const contentButton = screen.getByText('Interactive button');
      fireEvent.keyDown(contentButton, {key: 'Escape'});

      // hidePopover should be called
      await waitFor(() => {
        expect(HTMLElement.prototype.hidePopover).toHaveBeenCalled();
      });
    });

    it('refocuses trigger after Escape from content', async () => {
      render(
        <HoverCard
          content={<button type="button">Interactive button</button>}
          delay={0}
          hideDelay={0}>
          <button type="button">Trigger</button>
        </HoverCard>,
      );

      const trigger = screen.getByRole('button', {name: 'Trigger'});

      // Show the hover card via focus
      fireEvent.focus(trigger);
      await waitFor(() => {
        expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
      });

      // Focus the content button
      const contentButton = screen.getByText('Interactive button');
      contentButton.focus();

      // Press Escape - should refocus trigger
      fireEvent.keyDown(contentButton, {key: 'Escape'});

      await waitFor(() => {
        expect(document.activeElement).toBe(trigger);
      });
    });

    it('does not re-show hover card after Escape dismiss and refocus', async () => {
      const onOpenChange = vi.fn();
      render(
        <HoverCard
          content={<button type="button">Interactive button</button>}
          onOpenChange={onOpenChange}
          delay={0}
          hideDelay={0}>
          <button type="button">Trigger</button>
        </HoverCard>,
      );

      const trigger = screen.getByRole('button', {name: 'Trigger'});

      // Show the hover card via focus
      fireEvent.focus(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledTimes(1);
      });

      // Focus the content button
      const contentButton = screen.getByText('Interactive button');
      contentButton.focus();

      // Clear the mock to track new calls
      onOpenChange.mockClear();

      // Press Escape - this refocuses trigger but shouldn't re-show
      fireEvent.keyDown(contentButton, {key: 'Escape'});

      // Wait a bit and verify onOpenChange was not called with true (re-show)
      // It may be called with false (dismiss), which is expected
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(true);
    });
  });

  describe('SSR / hydration', () => {
    // Regression coverage for the hydration mismatch (#3107). The floating
    // layer used to be portaled into document.body behind a
    // `typeof document !== 'undefined'` gate: the server rendered nothing while
    // the first client render emitted the portal, so the two trees disagreed.
    //
    // Context layers now render the same inert <template> marker on the server
    // and the first client render. Arbitrary content mounts only when the card
    // is requested and its final inline/portal position is known.

    it('renders only the inert marker before and after hydration', async () => {
      const tree = (
        <HoverCard content={<span>Card content</span>}>
          <button type="button">Trigger</button>
        </HoverCard>
      );

      const serverHTML = renderToString(tree);
      expect(serverHTML).not.toContain('popover=');
      expect(serverHTML).not.toContain('Card content');
      expect(serverHTML).toContain('<template');

      const container = document.createElement('div');
      container.innerHTML = serverHTML;
      document.body.appendChild(container);

      let root: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, tree);
      });

      expect(container.querySelector('[popover]')).toBeNull();
      expect(container.querySelector('template')).not.toBeNull();

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });

    it('emits only a valid marker inside a paragraph', () => {
      const html = renderToString(
        <p>
          Before{' '}
          <HoverCard content={<div>Block card content</div>}>
            <a href="#trigger">Trigger</a>
          </HoverCard>{' '}
          after
        </p>,
      );

      // <template> is inert phrasing/script-supporting content, so the parser
      // has no block layer or consumer content to reparent out of the <p>.
      expect(html).not.toContain('<div');
      expect(html).not.toContain('popover=');
      expect(html).not.toContain('Block card content');
      expect(html).toContain('<template');
    });

    it('server markup matches the first client render (no hydration mismatch)', async () => {
      const tree = (
        <StrictMode>
          <p>
            Glossary:{' '}
            <HoverCard content={<div>Definition</div>}>
              <a href="#term">term</a>
            </HoverCard>
            .
          </p>
        </StrictMode>
      );

      const serverHTML = renderToString(tree);

      const container = document.createElement('div');
      container.innerHTML = serverHTML;
      document.body.appendChild(container);

      // Capture any hydration diagnostics. React reports hydration mismatches
      // both through console.error and through onRecoverableError.
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const recoverableErrors: unknown[] = [];

      let root: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, tree, {
          onRecoverableError: error => {
            recoverableErrors.push(error);
          },
        });
      });

      const hydrationErrors = consoleErrorSpy.mock.calls.filter(call =>
        String(call[0] ?? '')
          .toLowerCase()
          .includes('hydrat'),
      );

      expect(hydrationErrors).toEqual([]);
      expect(recoverableErrors).toEqual([]);
      expect(container.querySelector('[popover]')).toBeNull();
      expect(container.querySelector('template')).not.toBeNull();

      await act(async () => {
        root.unmount();
      });
      consoleErrorSpy.mockRestore();
      container.remove();
    });

    it('hydrates a default-open hover card without a mismatch', async () => {
      vi.mocked(HTMLElement.prototype.showPopover).mockClear();

      const tree = (
        <HoverCard content={<span>Default open</span>} isDefaultOpen>
          <button type="button">Trigger</button>
        </HoverCard>
      );

      const serverHTML = renderToString(tree);
      // isDefaultOpen must not leak the final layer into SSR markup. The marker
      // hydrates first; the effect then requests and opens the real popover.
      expect(serverHTML).not.toContain('popover=');
      expect(serverHTML).toContain('<template');

      const container = document.createElement('div');
      container.innerHTML = serverHTML;
      document.body.appendChild(container);

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const recoverableErrors: unknown[] = [];

      let root: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, tree, {
          onRecoverableError: error => {
            recoverableErrors.push(error);
          },
        });
      });

      const hydrationErrors = consoleErrorSpy.mock.calls.filter(call =>
        String(call[0] ?? '')
          .toLowerCase()
          .includes('hydrat'),
      );
      expect(hydrationErrors).toEqual([]);
      expect(recoverableErrors).toEqual([]);

      // The card opens after hydration via the mount effect.
      await waitFor(() => {
        expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
      });
      expect(container.querySelector('[popover]')).not.toBeNull();
      expect(container).toHaveTextContent('Default open');

      await act(async () => {
        root.unmount();
      });
      consoleErrorSpy.mockRestore();
      container.remove();
    });
  });

  describe('touch', () => {
    // The modality is document-global; a tap in one case must not decide the
    // next one's answer.
    beforeEach(() => {
      __resetInteractionModalityForTest();
    });

    /**
     * A tap, in the order a browser dispatches it: the finger's pointer events,
     * then the hover it synthesizes, then the `click` that says the touch was a
     * tap and not the start of a scroll.
     */
    const tap = (element: HTMLElement) => {
      // A finger's arrival fires pointerenter too, and that is the path a pen
      // must not take — cover it here rather than starting at pointerdown.
      fireEvent.pointerEnter(element, {pointerType: 'touch'});
      fireEvent.pointerDown(element, {pointerType: 'touch'});
      fireEvent.pointerUp(element, {pointerType: 'touch'});
      // Touch synthesizes hover after the press; the card must not act on it.
      fireEvent.mouseEnter(element);
      fireEvent.click(element);
    };

    it('opens on a tap when the trigger performs no action', async () => {
      const onOpenChange = vi.fn();
      render(
        <HoverCard
          content={<span>Card content</span>}
          onOpenChange={onOpenChange}
          delay={300}>
          Ruby Cheung
        </HoverCard>,
      );

      tap(screen.getByText('Ruby Cheung'));

      // Immediately: a tap is a decision, not hover intent, so no delay applies.
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('stays shut on a tap when the trigger performs an action', async () => {
      const onOpenChange = vi.fn();
      render(
        <HoverCard
          content={<span>Card content</span>}
          onOpenChange={onOpenChange}
          delay={0}>
          <button type="button">Save</button>
        </HoverCard>,
      );

      const trigger = screen.getByRole('button', {name: 'Save'});
      tap(trigger);
      // A tap focuses what it activates; that focus must not reopen the card.
      fireEvent.focusIn(trigger);

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(true);
    });

    it('opens on a tap of an action trigger when touchTrigger is "tap"', async () => {
      const onOpenChange = vi.fn();
      render(
        <HoverCard
          content={<span>Card content</span>}
          onOpenChange={onOpenChange}
          touchTrigger="tap"
          delay={0}>
          <button type="button">Details</button>
        </HoverCard>,
      );

      tap(screen.getByRole('button', {name: 'Details'}));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('survives a tap on its own content', async () => {
      const onOpenChange = vi.fn();
      render(
        <HoverCard
          content={<button type="button">Follow</button>}
          onOpenChange={onOpenChange}
          delay={0}
          hideDelay={0}>
          Ruby Cheung
        </HoverCard>,
      );

      tap(screen.getByText('Ruby Cheung'));
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
      onOpenChange.mockClear();

      const action = await screen.findByRole('button', {
        name: 'Follow',
        hidden: true,
      });
      fireEvent.pointerDown(action, {pointerType: 'touch'});
      fireEvent.pointerUp(action, {pointerType: 'touch'});
      fireEvent.click(action);

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('closes on a tap outside', async () => {
      const onOpenChange = vi.fn();
      render(
        <>
          <HoverCard
            content={<span>Card content</span>}
            onOpenChange={onOpenChange}
            delay={0}
            hideDelay={0}>
            Ruby Cheung
          </HoverCard>
          <button type="button">Elsewhere</button>
        </>,
      );

      tap(screen.getByText('Ruby Cheung'));
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });

      const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
      fireEvent.pointerDown(elsewhere, {pointerType: 'touch'});
      // Not yet: a popover closes when the outside tap lifts.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(false);

      fireEvent.pointerUp(elsewhere, {pointerType: 'touch'});
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('opens when the finger lifts, not when it lands', async () => {
      const onOpenChange = vi.fn();
      render(
        <HoverCard
          content={<span>Card content</span>}
          onOpenChange={onOpenChange}
          delay={0}>
          Ruby Cheung
        </HoverCard>,
      );

      const trigger = screen.getByText('Ruby Cheung');
      fireEvent.pointerEnter(trigger, {pointerType: 'touch'});
      fireEvent.pointerDown(trigger, {pointerType: 'touch'});
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalled();

      fireEvent.pointerUp(trigger, {pointerType: 'touch'});
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('never opens for a touch that turns into a scroll', async () => {
      const onOpenChange = vi.fn();
      render(
        <HoverCard
          content={<span>Card content</span>}
          onOpenChange={onOpenChange}
          delay={0}>
          Ruby Cheung
        </HoverCard>,
      );

      const trigger = screen.getByText('Ruby Cheung');
      fireEvent.pointerEnter(trigger, {pointerType: 'touch'});
      fireEvent.pointerDown(trigger, {pointerType: 'touch'});
      fireEvent.pointerCancel(trigger, {pointerType: 'touch'});

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('closes when a scroll starts outside, but not for one inside the card', async () => {
      const onOpenChange = vi.fn();
      render(
        <>
          <HoverCard
            content={<p>Card content</p>}
            onOpenChange={onOpenChange}
            delay={0}
            hideDelay={0}>
            Ruby Cheung
          </HoverCard>
          <p>Page content</p>
        </>,
      );

      tap(screen.getByText('Ruby Cheung'));
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
      onOpenChange.mockClear();

      // Scrolling the card's own content keeps it.
      const inside = await screen.findByText('Card content');
      fireEvent.pointerDown(inside, {pointerType: 'touch'});
      fireEvent.pointerCancel(inside, {pointerType: 'touch'});
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(false);

      const page = screen.getByText('Page content');
      fireEvent.pointerDown(page, {pointerType: 'touch'});
      fireEvent.pointerCancel(page, {pointerType: 'touch'});
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('closes on a second tap of the trigger', async () => {
      const onOpenChange = vi.fn();
      render(
        <HoverCard
          content={<span>Card content</span>}
          onOpenChange={onOpenChange}
          delay={0}
          hideDelay={0}>
          Ruby Cheung
        </HoverCard>,
      );

      const trigger = screen.getByText('Ruby Cheung');
      tap(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });

      tap(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('ignores the focus a tap leaves behind, but not keyboard focus', async () => {
      const onOpenChange = vi.fn();
      render(
        <HoverCard
          content={<span>Card content</span>}
          onOpenChange={onOpenChange}
          delay={0}>
          <button type="button">Save</button>
        </HoverCard>,
      );

      const trigger = screen.getByRole('button', {name: 'Save'});
      // The tap goes to the button, as `auto` decides for an action trigger —
      // and the focus it leaves behind must not put the card over the control
      // the user just pressed.
      tap(trigger);
      fireEvent.focusIn(trigger);
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(true);

      // Reaching for the keyboard ends the touch interaction: the same trigger,
      // focused by Tab, still opens.
      fireEvent.keyDown(document, {key: 'Tab'});
      fireEvent.focusIn(trigger);

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });
  });
});

describe('HoverCard theme target names', () => {
  it('renders only the canonical target class on the card surface', async () => {
    render(
      <HoverCard content={<span>Card content</span>} delay={0}>
        <button type="button">Trigger</button>
      </HoverCard>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', {name: 'Trigger'}));

    await waitFor(() => {
      const layer = screen.getByText('Card content').closest('[popover]');
      expect(layer).toHaveClass('astryx-hover-card');
      expect(layer).not.toHaveClass('astryx-hovercard');
    });
  });
});
