// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetPanel.test.tsx
 * @input Uses vitest, Testing Library, BottomSheetPanel
 * @output Tests the shared sheet surface motion, keyboard scroll, and container
 *   padding contracts
 * @position Internal presentation tests shared by standalone and switcher modes
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  BottomSheetPanel,
  type BottomSheetPanelMotion,
  type BottomSheetPanelState,
} from './BottomSheetPanel';

const panelTransitionStyle = {
  transitionProperty: 'transform, opacity',
  transitionDuration: '410ms',
  transitionDelay: '0ms',
};

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel(
  state: BottomSheetPanelState,
  callbacks: {
    onMotionStart?: (motion: BottomSheetPanelMotion) => void;
    onMotionComplete?: (motion: BottomSheetPanelMotion) => void;
  } = {},
) {
  return render(
    <BottomSheetPanel
      label="Sheet details"
      state={state}
      height="hug"
      style={panelTransitionStyle}
      onDismiss={() => {}}
      onScrimOpacity={() => {}}
      onMotionStart={callbacks.onMotionStart}
      onMotionComplete={callbacks.onMotionComplete}>
      Panel content
    </BottomSheetPanel>,
  );
}

function getPanel(): HTMLElement {
  const panel = screen
    .getByText('Panel content')
    .closest<HTMLElement>('.astryx-bottom-sheet');
  if (panel == null) {
    throw new Error('BottomSheetPanel surface not found');
  }
  return panel;
}

describe('BottomSheetPanel', () => {
  it('reports entrance completion only for the surface transform', () => {
    const onMotionStart = vi.fn();
    const onMotionComplete = vi.fn();
    renderPanel(
      {kind: 'open', entering: true},
      {onMotionStart, onMotionComplete},
    );

    expect(onMotionStart).toHaveBeenCalledWith('entering');
    fireEvent.transitionEnd(getPanel(), {propertyName: 'opacity'});
    expect(onMotionComplete).not.toHaveBeenCalled();
    fireEvent.transitionEnd(getPanel(), {propertyName: 'transform'});
    expect(onMotionComplete).toHaveBeenCalledWith('entering');
  });

  it('completes a retained-sheet reactivation without waiting for a new entrance', () => {
    const onMotionComplete = vi.fn();
    const {rerender} = render(
      <BottomSheetPanel
        label="Sheet details"
        state={{kind: 'retained', motion: 'covered', alignmentOffset: 0}}
        height="hug"
        style={panelTransitionStyle}
        onDismiss={() => {}}
        onScrimOpacity={() => {}}
        onMotionComplete={onMotionComplete}>
        Panel content
      </BottomSheetPanel>,
    );

    rerender(
      <BottomSheetPanel
        label="Sheet details"
        state={{kind: 'open', entering: true}}
        height="hug"
        style={panelTransitionStyle}
        onDismiss={() => {}}
        onScrimOpacity={() => {}}
        onMotionComplete={onMotionComplete}>
        Panel content
      </BottomSheetPanel>,
    );

    expect(onMotionComplete).toHaveBeenCalledWith('entering');
  });

  it('applies the switcher alignment offset to a retained surface', () => {
    renderPanel({
      kind: 'retained',
      motion: 'aligning',
      alignmentOffset: 120,
    });

    expect(getPanel()).toHaveStyle({transform: 'translateY(120px)'});
  });

  it('maps exit and fade completion to their respective CSS properties', () => {
    const onMotionComplete = vi.fn();
    const {rerender} = renderPanel(
      {kind: 'retained', motion: 'fading', alignmentOffset: 0},
      {onMotionComplete},
    );

    fireEvent.transitionEnd(getPanel(), {propertyName: 'opacity'});
    expect(onMotionComplete).toHaveBeenLastCalledWith('fading');

    rerender(
      <BottomSheetPanel
        label="Sheet details"
        state={{kind: 'exiting'}}
        height="hug"
        style={panelTransitionStyle}
        onDismiss={() => {}}
        onScrimOpacity={() => {}}
        onMotionComplete={onMotionComplete}>
        Panel content
      </BottomSheetPanel>,
    );
    fireEvent.transitionEnd(getPanel(), {propertyName: 'transform'});
    expect(onMotionComplete).toHaveBeenLastCalledWith('exiting');
  });

  it('completes immediately when the rendered transition is disabled', () => {
    // The stylesheet decides reduced motion (its transform transition
    // collapses under the preference); the gesture hook no longer pins an
    // inline `none` for it, so this models a rendered `transition: none`
    // directly, as a mid-drag reconcile writes.
    const nativeGetComputedStyle = window.getComputedStyle;
    const spy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((element, pseudo) => {
        const declaration = nativeGetComputedStyle(element, pseudo);
        if (
          element instanceof HTMLElement &&
          element.classList.contains('astryx-bottom-sheet')
        ) {
          Object.defineProperty(declaration, 'transition', {
            value: 'none',
            configurable: true,
          });
        }
        return declaration;
      });
    const onMotionComplete = vi.fn();
    render(
      <BottomSheetPanel
        label="Sheet details"
        state={{kind: 'open', entering: true}}
        height="hug"
        onDismiss={() => {}}
        onScrimOpacity={() => {}}
        onMotionComplete={onMotionComplete}>
        Panel content
      </BottomSheetPanel>,
    );

    expect(onMotionComplete).toHaveBeenCalledWith('entering');
    spy.mockRestore();
  });

  it('derives its transition backstop from the rendered timing', () => {
    vi.useFakeTimers();
    try {
      const onMotionComplete = vi.fn();
      render(
        <BottomSheetPanel
          label="Sheet details"
          state={{kind: 'open', entering: true}}
          height="hug"
          style={{
            transitionProperty: 'transform, opacity',
            transitionDuration: '0.5s, 200ms',
            transitionDelay: '100ms, 0ms',
          }}
          onDismiss={() => {}}
          onScrimOpacity={() => {}}
          onMotionComplete={onMotionComplete}>
          Panel content
        </BottomSheetPanel>,
      );

      void act(() => vi.advanceTimersByTime(649));
      expect(onMotionComplete).not.toHaveBeenCalled();
      void act(() => vi.advanceTimersByTime(1));
      expect(onMotionComplete).toHaveBeenCalledWith('entering');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not detach a stable public ref during an ordinary rerender', () => {
    const panelRef = vi.fn();
    const {rerender, unmount} = render(
      <BottomSheetPanel
        label="Sheet details"
        ref={panelRef}
        state={{kind: 'open', entering: false}}
        height="hug"
        onDismiss={() => {}}
        onScrimOpacity={() => {}}>
        First render
      </BottomSheetPanel>,
    );

    expect(panelRef).toHaveBeenCalledTimes(1);
    rerender(
      <BottomSheetPanel
        label="Sheet details"
        ref={panelRef}
        state={{kind: 'open', entering: false}}
        height="hug"
        onDismiss={() => {}}
        onScrimOpacity={() => {}}>
        Second render
      </BottomSheetPanel>,
    );
    expect(panelRef).toHaveBeenCalledTimes(1);

    unmount();
    expect(panelRef).toHaveBeenLastCalledWith(null);
    expect(panelRef).toHaveBeenCalledTimes(2);
  });

  it('floats the handle bar over content that starts at the sheet top edge', () => {
    renderPanel({kind: 'open', entering: false});

    const bar = getPanel().querySelector<HTMLElement>(
      'div[aria-hidden="true"]',
    );
    if (bar == null) {
      throw new Error('handle bar not found');
    }
    const body = bar.nextElementSibling as HTMLElement;

    // Out of flow: the bar costs the content no layout space. That is the
    // point of it -- the content sits closer to the sheet's top edge, and
    // scrolled content passes beneath the pill rather than stopping at a
    // hard edge.
    expect(getComputedStyle(bar).position).toBe('absolute');

    // So the body must not reserve room for it. A top padding here would
    // push the content back down and undo the change.
    expect(getComputedStyle(body).paddingTop).toBe('');
  });

  // The pill is only legible over the content riding up beneath it because
  // the bar carries a backdrop; without it, text runs straight through the
  // pill. jsdom's StyleX runtime does not inject the rule, so assert on the
  // style definition itself (same approach as AspectRatio's reset.css tests).
  it('backs the floating handle bar with a surface gradient', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, './BottomSheetPanel.tsx'),
      'utf-8',
    );

    const handleBar = source.match(/handleBar: \{([\s\S]*?)\n {2}\},/);
    expect(handleBar).not.toBeNull();
    expect(handleBar![1]).toContain("position: 'absolute'");
    expect(handleBar![1]).toContain('linear-gradient(to bottom');
    expect(handleBar![1]).toContain("colorVars['--color-background-surface']");
  });

  // In dark mode the surface fill and the scrim sit a few RGB steps apart and
  // the drop shadow is black on near-black, so the fill alone leaves the
  // sheet's left and right edges invisible against the scrim. A hairline on
  // the scrim-facing edges is what draws them. Asserted on the style
  // definition for the same reason as the test above.
  it('draws a hairline on the three edges that face the scrim', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, './BottomSheetPanel.tsx'),
      'utf-8',
    );

    const sheet = source.match(/\n {2}sheet: \{([\s\S]*?)\n {2}\},/);
    expect(sheet).not.toBeNull();
    for (const edge of [
      'borderBlockStart',
      'borderInlineStart',
      'borderInlineEnd',
    ]) {
      expect(sheet![1]).toContain(`${edge}Width: borderVars['--border-width']`);
      expect(sheet![1]).toContain(`${edge}Style: 'solid'`);
      expect(sheet![1]).toContain(`${edge}Color: colorVars['--color-border']`);
    }
    // The block-end edge sits below the viewport, under the overscroll
    // padding, so it carries no hairline to draw.
    expect(sheet![1]).not.toContain('borderBlockEndWidth');
  });

  // A theme that packs an inset ring into --shadow-high (the bundled themes all
  // add one in dark mode) draws it just inside the sheet, where an opaque
  // content wrapper such as Section paints over it -- so it showed only in the
  // gap below the content and the side edges appeared to change width partway
  // down. The scrolling body paints the surface across the whole inner box to
  // hide the ring evenly.
  it('paints the surface across the scrolling body so the edge stays uniform', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, './BottomSheetPanel.tsx'),
      'utf-8',
    );

    const body = source.match(/\n {2}body: \{([\s\S]*?)\n {2}\},/);
    expect(body).not.toBeNull();
    expect(body![1]).toContain(
      "backgroundColor: colorVars['--color-background-surface']",
    );
  });

  /**
   * The exit is not the entrance played backwards.
   *
   * `--ease-standard` is a decelerate curve: on it the sheet was half gone in
   * 59ms of a 410ms transition and 90% gone in 163ms, so the close was over
   * before it could be seen. The closing state therefore carries its own
   * accelerating curve, and only the closing state does.
   */
  it('closes on an accelerating curve of its own, not the entrance timing', () => {
    const declarationsFor = (element: HTMLElement) => {
      const classes = new Set(element.className.split(/\s+/));
      const out: string[] = [];
      for (const styleSheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = styleSheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of Array.from(rules)) {
          const selector = (rule as CSSStyleRule).selectorText;
          const owner = selector?.match(/^\.([\w-]+)/)?.[1];
          if (owner != null && classes.has(owner)) {
            out.push(rule.cssText);
          }
        }
      }
      return out.join('\n');
    };

    const {container: closing} = render(
      <BottomSheetPanel
        label="Sheet details"
        state={{kind: 'exiting'}}
        height="hug"
        onDismiss={() => {}}
        onScrimOpacity={() => {}}>
        Panel content
      </BottomSheetPanel>,
    );
    const closingRules = declarationsFor(
      closing.querySelector('.astryx-bottom-sheet') as HTMLElement,
    );
    // An accelerating curve: no vertical rise at the start (y1 = 0), so the
    // travel lands inside the duration instead of ahead of it.
    expect(closingRules).toContain(
      'transition-timing-function: cubic-bezier(.3,0,.6,.6)',
    );

    const {container: resting} = render(
      <BottomSheetPanel
        label="Sheet details"
        state={{kind: 'open', entering: false}}
        height="hug"
        onDismiss={() => {}}
        onScrimOpacity={() => {}}>
        Panel content
      </BottomSheetPanel>,
    );
    const restingRules = declarationsFor(
      resting.querySelector('.astryx-bottom-sheet') as HTMLElement,
    );
    expect(restingRules).toContain(
      'transition-timing-function: var(--ease-standard)',
    );
    expect(restingRules).not.toContain('cubic-bezier(.3,0,.6,.6)');
  });

  describe('container padding', () => {
    // StyleX lowers the block edges to their physical properties.
    const EDGES = [
      ['inline-start', 'padding-inline-start'],
      ['inline-end', 'padding-inline-end'],
      ['block-start', 'padding-top'],
      ['block-end', 'padding-bottom'],
    ] as const;

    function renderWithPadding(padding?: 0 | 2) {
      render(
        <BottomSheetPanel
          label="Sheet details"
          state={{kind: 'open', entering: false}}
          height="hug"
          padding={padding}
          onDismiss={() => {}}
          onScrimOpacity={() => {}}>
          <span data-testid="sheet-child">Panel content</span>
        </BottomSheetPanel>,
      );
      // The content box is the child's parent: the observed box inside the
      // scrolling body, not the body itself.
      return getComputedStyle(screen.getByTestId('sheet-child').parentElement!);
    }

    it("pads by Dialog's default chain and publishes the inset it applies", () => {
      const computed = renderWithPadding();
      for (const [edge, property] of EDGES) {
        const published = computed
          .getPropertyValue(`--container-padding-${edge}`)
          .replace(/\s+/g, '');
        expect(published, edge).toContain(
          `var(--astryx-bottom-sheet-padding-${edge}`,
        );
        expect(published, edge).toContain(
          'var(--astryx-bottom-sheet-padding,var(--spacing-4))',
        );
        // Applied padding reads the published value, so bleed children
        // subtract exactly the inset they sit in.
        expect(computed.getPropertyValue(property), edge).toBe(
          `var(--container-padding-${edge})`,
        );
      }
      for (const name of [
        '--layout-padding-outer-x',
        '--layout-padding-outer-y',
        '--layout-padding-inner-x',
        '--layout-padding-inner-y',
      ]) {
        expect(
          computed.getPropertyValue(name).replace(/\s+/g, ''),
          name,
        ).toContain('var(--astryx-bottom-sheet-padding,var(--spacing-4))');
      }
    });

    it.each([0, 2] as const)(
      'applies and publishes an explicit padding step (%s)',
      padding => {
        const computed = renderWithPadding(padding);
        const expected = `var(--spacing-${padding})`;
        for (const [edge, property] of EDGES) {
          expect(
            computed.getPropertyValue(`--container-padding-${edge}`),
            edge,
          ).toBe(expected);
          expect(computed.getPropertyValue(property), edge).toBe(expected);
        }
        expect(computed.getPropertyValue('--layout-padding-inner-x')).toBe(
          expected,
        );
      },
    );

    it('keeps the panel itself unpadded and free of a padding attribute', () => {
      renderWithPadding(2);
      const panel = getPanel();
      expect(panel.hasAttribute('padding')).toBe(false);
      expect(
        getComputedStyle(panel).getPropertyValue(
          '--container-padding-inline-start',
        ),
      ).toBe('0px');
    });
  });
});
