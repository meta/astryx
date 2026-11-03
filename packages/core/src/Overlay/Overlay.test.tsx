// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Overlay.test.tsx
 * @input Uses vitest, @testing-library/react, Overlay + useOverlay
 * @output Characterization tests for the Overlay component and useOverlay hook
 * @position Testing; validates the overlay/scrim rendering + touch-toggle contract
 *
 * SYNC: When Overlay.tsx / useOverlay.tsx / OverlayScrim.tsx change,
 * update tests to match new behavior
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, renderHook, fireEvent} from '@testing-library/react';
import {createRef} from 'react';
import {Overlay} from './Overlay';
import {useOverlay} from './useOverlay';

/** The scrim is the div carrying data-position (from themeProps). */
function getScrim(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-position]');
  if (!el) {
    throw new Error('scrim element not found');
  }
  return el;
}

/**
 * Force window.matchMedia('(hover: none)') to report a given value so we can
 * exercise the touch vs. pointer branches of useOverlay. Returns a restore fn.
 */
function mockHoverNone(matches: boolean): () => void {
  const original = window.matchMedia;
  window.matchMedia = (query: string) => ({
    matches: query.includes('hover: none') ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  return () => {
    window.matchMedia = original;
  };
}

describe('Overlay', () => {
  describe('rendering & structure', () => {
    it('renders the base children', () => {
      render(
        <Overlay content={<span>badge</span>}>
          <img alt="hero" src="x.jpg" />
        </Overlay>,
      );
      expect(screen.getByAltText('hero')).toBeInTheDocument();
    });

    it('renders the overlay content inside the scrim', () => {
      render(
        <Overlay content={<button type="button">Quick view</button>}>
          <div>base</div>
        </Overlay>,
      );
      expect(
        screen.getByRole('button', {name: 'Quick view'}),
      ).toBeInTheDocument();
    });

    it('renders a root div carrying the astryx-overlay class', () => {
      const {container} = render(
        <Overlay content={<span>c</span>}>
          <div>base</div>
        </Overlay>,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root.tagName).toBe('DIV');
      expect(root.className).toContain('astryx-overlay');
    });

    it('places the scrim after the base children in DOM order', () => {
      const {container} = render(
        <Overlay content={<span data-testid="ovl">c</span>}>
          <div data-testid="base">base</div>
        </Overlay>,
      );
      const root = container.firstElementChild as HTMLElement;
      const base = screen.getByTestId('base');
      const scrim = getScrim(container);
      // base comes before scrim
      expect(
        base.compareDocumentPosition(scrim) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(root).toContainElement(scrim);
    });

    it('applies the astryx-overlay-scrim class to the scrim', () => {
      const {container} = render(
        <Overlay content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      expect(getScrim(container).className).toContain('astryx-overlay-scrim');
    });
  });

  describe('position', () => {
    it('defaults data-position to "fill"', () => {
      const {container} = render(
        <Overlay content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      expect(getScrim(container).getAttribute('data-position')).toBe('fill');
    });

    it.each(['fill', 'bottom', 'top'] as const)(
      'reflects position="%s" as data-position',
      position => {
        const {container} = render(
          <Overlay position={position} content={<span>c</span>}>
            <div>b</div>
          </Overlay>,
        );
        expect(getScrim(container).getAttribute('data-position')).toBe(
          position,
        );
      },
    );
  });

  describe('scrim mode → media theme inversion', () => {
    it('dark scrim (default) wraps content in a dark MediaTheme', () => {
      const {container} = render(
        <Overlay content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      expect(
        container.querySelector('[data-astryx-media="dark"]'),
      ).toBeInTheDocument();
    });

    it('light scrim wraps content in a light MediaTheme', () => {
      const {container} = render(
        <Overlay scrim="light" content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      expect(
        container.querySelector('[data-astryx-media="light"]'),
      ).toBeInTheDocument();
      expect(
        container.querySelector('[data-astryx-media="dark"]'),
      ).not.toBeInTheDocument();
    });

    it('scrim={false} renders no MediaTheme wrapper', () => {
      const {container} = render(
        <Overlay scrim={false} content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      expect(
        container.querySelector('[data-astryx-media]'),
      ).not.toBeInTheDocument();
    });
  });

  describe('controlled visibility (isOpen)', () => {
    it('marks the scrim inert when isOpen is false', () => {
      const {container} = render(
        <Overlay isOpen={false} content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      expect(getScrim(container).hasAttribute('inert')).toBe(true);
    });

    it('does not mark the scrim inert when isOpen is true', () => {
      const {container} = render(
        <Overlay isOpen content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      expect(getScrim(container).hasAttribute('inert')).toBe(false);
    });

    it('is never inert in uncontrolled (CSS-driven) mode', () => {
      const {container} = render(
        <Overlay showOn="hover" content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      expect(getScrim(container).hasAttribute('inert')).toBe(false);
    });

    it('toggles inert when the isOpen prop flips', () => {
      const {container, rerender} = render(
        <Overlay isOpen={false} content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      expect(getScrim(container).hasAttribute('inert')).toBe(true);
      rerender(
        <Overlay isOpen content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      expect(getScrim(container).hasAttribute('inert')).toBe(false);
    });
  });

  describe('styling & ref', () => {
    it('forwards ref to the root div element', () => {
      const ref = createRef<HTMLDivElement>();
      render(
        <Overlay ref={ref} content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current?.className).toContain('astryx-overlay');
    });

    it('merges a caller className onto the root', () => {
      const {container} = render(
        <Overlay className="custom-cls" content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).toContain('custom-cls');
      expect(root.className).toContain('astryx-overlay');
    });

    it('merges a caller inline style onto the root', () => {
      const {container} = render(
        <Overlay style={{opacity: 0.5}} content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root.style.opacity).toBe('0.5');
    });
  });

  describe('host attributes', () => {
    // architecture:public-component-api INV5: host attributes reach the root
    // element that owns the ref, the theme target and the styling props.
    it('forwards data, ARIA and id attributes to the root div', () => {
      const ref = createRef<HTMLDivElement>();
      render(
        <Overlay
          ref={ref}
          content={<span>c</span>}
          id="hero-overlay"
          data-testid="hero"
          data-analytics-id="hero-card"
          aria-describedby="hero-caption">
          <div>b</div>
        </Overlay>,
      );
      const root = screen.getByTestId('hero');
      expect(root).toBe(ref.current);
      expect(root).toHaveAttribute('data-analytics-id', 'hero-card');
      expect(root).toHaveAttribute('id', 'hero-overlay');
      expect(root).toHaveAttribute('aria-describedby', 'hero-caption');
      expect(root).toHaveClass('astryx-overlay');
    });

    describe('on a touch device', () => {
      let restore: () => void;
      beforeEach(() => {
        restore = mockHoverNone(true);
      });
      afterEach(() => restore());

      it('runs a caller onClick and still toggles the hover overlay on tap', () => {
        const onClick = vi.fn((event: {preventDefault: () => void}) => {
          event.preventDefault();
        });
        const {container} = render(
          <Overlay
            showOn="hover"
            content={<span>c</span>}
            data-testid="hero"
            onClick={onClick}>
            <div>b</div>
          </Overlay>,
        );
        expect(getScrim(container).hasAttribute('inert')).toBe(true);
        fireEvent.click(screen.getByTestId('hero'));
        expect(onClick).toHaveBeenCalledTimes(1);
        // A caller preventDefault() does not cancel the built-in toggle.
        expect(getScrim(container).hasAttribute('inert')).toBe(false);
      });

      it('runs a caller onMouseUp alongside the built-in handler', () => {
        const onMouseUp = vi.fn();
        render(
          <Overlay
            showOn="hover"
            content={<span>c</span>}
            data-testid="hero"
            onMouseUp={onMouseUp}>
            <div>b</div>
          </Overlay>,
        );
        fireEvent.mouseUp(screen.getByTestId('hero'));
        expect(onMouseUp).toHaveBeenCalledTimes(1);
      });
    });
  });
});

describe('useOverlay', () => {
  describe('return shape', () => {
    it('exposes containerRef, containerProps, element and renderOverlay', () => {
      const {result} = renderHook(() => useOverlay());
      expect(result.current.containerRef).toHaveProperty('current');
      expect(result.current.containerProps).toBeDefined();
      expect(typeof result.current.renderOverlay).toBe('function');
    });

    it('containerProps.className is a non-empty marker string', () => {
      const {result} = renderHook(() => useOverlay());
      expect(typeof result.current.containerProps.className).toBe('string');
      expect(result.current.containerProps.className?.length).toBeGreaterThan(
        0,
      );
    });

    it('returns element=null when no content is provided', () => {
      const {result} = renderHook(() => useOverlay({showOn: 'hover'}));
      expect(result.current.element).toBeNull();
    });

    it('returns a scrim element when content is provided', () => {
      const {result} = renderHook(() => useOverlay({content: <span>c</span>}));
      expect(result.current.element).not.toBeNull();
    });

    it('renderOverlay(children) produces a renderable scrim', () => {
      const {result} = renderHook(() => useOverlay({showOn: 'hover'}));
      const el = result.current.renderOverlay(<span>on demand</span>);
      const {container} = render(el);
      expect(screen.getByText('on demand')).toBeInTheDocument();
      expect(getScrim(container)).toBeInTheDocument();
    });
  });

  describe('pointer (non-touch) device', () => {
    let restore: () => void;
    beforeEach(() => {
      restore = mockHoverNone(false);
    });
    afterEach(() => restore());

    it('does not attach touch toggle handlers in hover mode', () => {
      const {result} = renderHook(() => useOverlay({showOn: 'hover'}));
      expect(result.current.containerProps.onClick).toBeUndefined();
      expect(result.current.containerProps.onMouseUp).toBeUndefined();
    });
  });

  describe('touch device', () => {
    let restore: () => void;
    beforeEach(() => {
      restore = mockHoverNone(true);
    });
    afterEach(() => restore());

    it('attaches tap-to-toggle handlers in hover mode', () => {
      const {result} = renderHook(() => useOverlay({showOn: 'hover'}));
      expect(typeof result.current.containerProps.onClick).toBe('function');
      expect(typeof result.current.containerProps.onMouseUp).toBe('function');
    });

    it('does NOT attach toggle handlers when showOn="always" (no toggle needed)', () => {
      const {result} = renderHook(() => useOverlay({showOn: 'always'}));
      expect(result.current.containerProps.onClick).toBeUndefined();
      expect(result.current.containerProps.onMouseUp).toBeUndefined();
    });

    it('does NOT attach toggle handlers when showOn="focus"', () => {
      const {result} = renderHook(() => useOverlay({showOn: 'focus'}));
      expect(result.current.containerProps.onClick).toBeUndefined();
    });

    it('a consumer prop isOpen overrides the touch toggle (scrim reflects it)', () => {
      // With isOpen provided, the scrim is controlled regardless of touch.
      const {container} = render(
        <Overlay showOn="hover" isOpen={false} content={<span>c</span>}>
          <div>b</div>
        </Overlay>,
      );
      expect(getScrim(container).hasAttribute('inert')).toBe(true);
    });
  });

  describe('memoization', () => {
    it('returns a stable renderOverlay across re-renders with same options', () => {
      const {result, rerender} = renderHook(
        (props: {showOn: 'hover' | 'always'}) => useOverlay(props),
        {initialProps: {showOn: 'hover'}},
      );
      const first = result.current.renderOverlay;
      rerender({showOn: 'hover'});
      expect(result.current.renderOverlay).toBe(first);
    });

    it('returns a new renderOverlay when options change', () => {
      const {result, rerender} = renderHook(
        (props: {showOn: 'hover' | 'always'}) => useOverlay(props),
        {initialProps: {showOn: 'hover'}},
      );
      const first = result.current.renderOverlay;
      rerender({showOn: 'always'});
      expect(result.current.renderOverlay).not.toBe(first);
    });
  });
});
