// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FieldStatus.test.tsx
 * @input Uses vitest, @testing-library/react, FieldStatus component
 * @output Characterization coverage for FieldStatus behavior
 * @position Testing; validates FieldStatus.tsx implementation
 *
 * SYNC: When FieldStatus.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {FieldStatus} from './FieldStatus';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {getForcedColorsRules} from '../__tests__/forcedColors';

const testStyles = stylex.create({
  custom: {color: 'rebeccapurple'},
});

function politeRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="polite"]');
}
function assertiveRegion(): HTMLElement | null {
  return document.querySelector('[data-astryx-live-region="assertive"]');
}

afterEach(() => {
  __resetLiveRegionsForTest();
});

describe('FieldStatus', () => {
  it('renders the message text', () => {
    render(<FieldStatus type="error" message="This field is required" />);
    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('renders the message inside a <div>', () => {
    render(<FieldStatus type="error" message="Boom" data-testid="fs" />);
    expect(screen.getByTestId('fs').tagName).toBe('DIV');
  });

  describe('screen-reader announcements', () => {
    // The rendered element is NOT itself a live region: FieldStatus is
    // conditionally mounted by every caller, and live regions born together
    // with their content are not reliably announced. Announcements go through
    // the persistent useAnnounce singletons instead.
    it('does not carry role or aria-live on the rendered element', () => {
      render(<FieldStatus type="error" message="msg" data-testid="fs" />);
      const el = screen.getByTestId('fs');
      expect(el).not.toHaveAttribute('role');
      expect(el).not.toHaveAttribute('aria-live');
    });

    // These remain local because they exercise FieldStatus's first-use hook
    // routing. The shared binding starts from an already established channel.
    it('announces error messages assertively, including on first mount', async () => {
      render(<FieldStatus type="error" message="This field is required" />);
      await waitFor(() => {
        expect(assertiveRegion()).toHaveTextContent('This field is required');
      });
      expect(politeRegion()).toHaveTextContent('');
    });

    it('announces warning messages politely on first mount', async () => {
      render(<FieldStatus type="warning" message="Check this value" />);
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Check this value');
      });
      expect(assertiveRegion()).toHaveTextContent('');
    });

    it('announces success messages politely on first mount', async () => {
      render(<FieldStatus type="success" message="Looks good" />);
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Looks good');
      });
    });

    it('announces message changes through the component hook', async () => {
      const {rerender} = render(<FieldStatus type="error" message="First" />);
      await waitFor(() => {
        expect(assertiveRegion()).toHaveTextContent('First');
      });
      rerender(<FieldStatus type="error" message="Second" />);
      await waitFor(() => {
        expect(assertiveRegion()).toHaveTextContent('Second');
      });
    });

    // The generic contract checks each fixed urgency. This local test protects
    // the component-specific same-instance type reroute.
    it('re-routes to the polite channel when type changes from error', async () => {
      const {rerender} = render(<FieldStatus type="error" message="msg" />);
      await waitFor(() => {
        expect(assertiveRegion()).toHaveTextContent('msg');
      });
      rerender(<FieldStatus type="success" message="msg" />);
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('msg');
      });
    });

    it('does not announce an empty message', () => {
      render(<FieldStatus type="error" message="" />);
      // The live regions are created lazily on first announce; an empty
      // message must not trigger one.
      expect(assertiveRegion()).toBeNull();
      expect(politeRegion()).toBeNull();
    });

    // The visible message stays perceivable by assistive tech (it is the
    // aria-describedby target for the input).
    it('does not mark itself aria-hidden', () => {
      render(<FieldStatus type="error" message="msg" data-testid="fs" />);
      expect(screen.getByTestId('fs')).not.toHaveAttribute('aria-hidden');
    });
  });

  describe('theme target and data-attribute reflection', () => {
    it('renders the stable astryx-field-status class', () => {
      render(<FieldStatus type="error" message="msg" data-testid="fs" />);
      expect(screen.getByTestId('fs')).toHaveClass('astryx-field-status');
    });

    it('reflects the type as a data-type attribute', () => {
      render(<FieldStatus type="warning" message="msg" data-testid="fs" />);
      expect(screen.getByTestId('fs')).toHaveAttribute('data-type', 'warning');
    });

    it('reflects the variant as a data-variant attribute', () => {
      render(
        <FieldStatus
          type="error"
          message="msg"
          variant="detached"
          data-testid="fs"
        />,
      );
      const el = screen.getByTestId('fs');
      expect(el).toHaveAttribute('data-variant', 'detached');
    });

    it('defaults data-variant to "attached"', () => {
      render(<FieldStatus type="error" message="msg" data-testid="fs" />);
      expect(screen.getByTestId('fs')).toHaveAttribute(
        'data-variant',
        'attached',
      );
    });

    it('extends the attached background by the field-provided overlap', () => {
      render(<FieldStatus type="warning" message="msg" data-testid="fs" />);
      const styles = getComputedStyle(screen.getByTestId('fs'));

      expect(styles.marginTop).toBe(
        'calc(-1 * var(--_field-status-overlap,var(--spacing-1-5)))',
      );
    });

    it('does not intercept pointer input over the attached control', () => {
      render(<FieldStatus type="warning" message="msg" data-testid="fs" />);

      expect(getComputedStyle(screen.getByTestId('fs')).pointerEvents).toBe(
        'none',
      );
    });
  });

  describe('color styling per status type', () => {
    // Each status type maps to a distinct color treatment. The rendered class
    // list must therefore differ between types — a regression that collapsed
    // them onto one color would be caught here.
    it('applies distinct StyleX classes for each type', () => {
      const {rerender} = render(
        <FieldStatus type="error" message="msg" data-testid="fs" />,
      );
      const errorClass = screen.getByTestId('fs').getAttribute('class');

      rerender(<FieldStatus type="warning" message="msg" data-testid="fs" />);
      const warningClass = screen.getByTestId('fs').getAttribute('class');

      rerender(<FieldStatus type="success" message="msg" data-testid="fs" />);
      const successClass = screen.getByTestId('fs').getAttribute('class');

      expect(errorClass).not.toEqual(warningClass);
      expect(warningClass).not.toEqual(successClass);
      expect(errorClass).not.toEqual(successClass);
    });

    it('applies distinct StyleX classes for each variant', () => {
      const {rerender} = render(
        <FieldStatus
          type="error"
          message="msg"
          variant="attached"
          data-testid="fs"
        />,
      );
      const attachedClass = screen.getByTestId('fs').getAttribute('class');

      rerender(
        <FieldStatus
          type="error"
          message="msg"
          variant="detached"
          data-testid="fs"
        />,
      );
      const detachedClass = screen.getByTestId('fs').getAttribute('class');

      expect(attachedClass).not.toEqual(detachedClass);
    });
  });

  describe('prop forwarding', () => {
    it('forwards a ref to the root element', () => {
      const ref = vi.fn();
      render(<FieldStatus ref={ref} type="error" message="msg" />);
      expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
    });

    it('applies the id attribute', () => {
      render(
        <FieldStatus
          type="error"
          message="msg"
          id="email-error"
          data-testid="fs"
        />,
      );
      expect(screen.getByTestId('fs')).toHaveAttribute('id', 'email-error');
    });

    it('passes through arbitrary DOM props', () => {
      render(
        <FieldStatus
          type="error"
          message="msg"
          data-testid="fs"
          data-custom="xyz"
        />,
      );
      expect(screen.getByTestId('fs')).toHaveAttribute('data-custom', 'xyz');
    });

    it('merges a consumer className with the stable class', () => {
      render(
        <FieldStatus
          type="error"
          message="msg"
          className="my-status"
          data-testid="fs"
        />,
      );
      const el = screen.getByTestId('fs');
      expect(el).toHaveClass('my-status');
      expect(el).toHaveClass('astryx-field-status');
    });

    it('merges a consumer inline style', () => {
      render(
        <FieldStatus
          type="error"
          message="msg"
          style={{marginTop: '10px'}}
          data-testid="fs"
        />,
      );
      expect(screen.getByTestId('fs')).toHaveStyle({marginTop: '10px'});
    });

    it('applies an xstyle as an extra class', () => {
      const {rerender} = render(
        <FieldStatus type="error" message="msg" data-testid="fs" />,
      );
      const withoutXstyle = screen.getByTestId('fs').getAttribute('class');

      // xstyle values are compiled StyleX styles; passing one adds classes.
      rerender(
        <FieldStatus
          type="error"
          message="msg"
          data-testid="fs"
          xstyle={testStyles.custom}
        />,
      );
      const withXstyle = screen.getByTestId('fs').getAttribute('class');
      expect(withXstyle).not.toEqual(withoutXstyle);
    });
  });

  describe('dynamic updates', () => {
    it('updates the rendered message on rerender', () => {
      const {rerender} = render(
        <FieldStatus type="error" message="First" data-testid="fs" />,
      );
      expect(screen.getByTestId('fs')).toHaveTextContent('First');

      rerender(<FieldStatus type="error" message="Second" data-testid="fs" />);
      expect(screen.getByTestId('fs')).toHaveTextContent('Second');
    });

    // The element must never regain live-region semantics when the type
    // changes — announcements always flow through the persistent regions.
    it('keeps the element role-free when type changes from error', () => {
      const {rerender} = render(
        <FieldStatus type="error" message="msg" data-testid="fs" />,
      );
      expect(screen.getByTestId('fs')).not.toHaveAttribute('role');

      rerender(<FieldStatus type="success" message="msg" data-testid="fs" />);
      const el = screen.getByTestId('fs');
      expect(el).not.toHaveAttribute('role');
      expect(el).not.toHaveAttribute('aria-live');
    });
  });

  // The detached message must convey status by more than color/position:
  // a leading status glyph precedes the message text (WCAG 1.4.1). The glyph
  // is decorative for AT (aria-hidden) because the message text already names
  // the status in words and it is announced via the live region.
  describe('detached leading status icon (use-of-color a11y)', () => {
    it('renders a leading status icon before the message for the detached variant', () => {
      render(
        <FieldStatus
          type="error"
          message="Something went wrong"
          variant="detached"
          data-testid="fs"
        />,
      );
      const el = screen.getByTestId('fs');
      const icon = el.querySelector('[aria-hidden="true"]');
      const text = screen.getByText('Something went wrong');
      expect(icon).toBeInTheDocument();
      // Icon comes before the message text in document order.
      expect(
        icon!.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('marks the status icon aria-hidden (visual redundancy, not a second announcement)', () => {
      render(
        <FieldStatus
          type="warning"
          message="Heads up"
          variant="detached"
          data-testid="fs"
        />,
      );
      const icon = screen
        .getByTestId('fs')
        .querySelector('[aria-hidden="true"]');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('renders a status icon for each status type in the detached variant', () => {
      for (const type of ['error', 'warning', 'success'] as const) {
        const {unmount} = render(
          <FieldStatus
            type={type}
            message="msg"
            variant="detached"
            data-testid="fs"
          />,
        );
        expect(
          screen.getByTestId('fs').querySelector('[aria-hidden="true"]'),
        ).toBeInTheDocument();
        unmount();
      }
    });

    it('does not render a leading status icon for the attached variant', () => {
      render(
        <FieldStatus
          type="error"
          message="msg"
          variant="attached"
          data-testid="fs"
        />,
      );
      expect(
        screen.getByTestId('fs').querySelector('[aria-hidden="true"]'),
      ).toBeNull();
    });
  });

  describe('field-status-icon theme target', () => {
    // The stable theme target lands on the detached message box's leading glyph
    // itself, so a theme can restyle (e.g. resize) just this icon via
    // `defineTheme`. It reflects the status type as a data attribute so themes
    // can target per status, mirroring the parent astryx-field-status.
    const getStatusIcon = (root: HTMLElement): HTMLElement => {
      const icon = root.querySelector('.astryx-field-status-icon');
      if (icon == null) {
        throw new Error('status icon not found');
      }
      return icon as HTMLElement;
    };

    it('renders the target on the detached leading icon', () => {
      render(
        <FieldStatus
          type="error"
          message="msg"
          variant="detached"
          data-testid="fs"
        />,
      );
      const icon = getStatusIcon(screen.getByTestId('fs'));
      expect(icon).toHaveClass('astryx-field-status-icon');
      expect(icon).toHaveClass('astryx-icon');
      expect(icon).toHaveAttribute('data-type', 'error');
    });

    it('reflects the status type per status', () => {
      for (const type of ['error', 'warning', 'success'] as const) {
        const {unmount} = render(
          <FieldStatus
            type={type}
            message="msg"
            variant="detached"
            data-testid="fs"
          />,
        );
        expect(getStatusIcon(screen.getByTestId('fs'))).toHaveAttribute(
          'data-type',
          type,
        );
        unmount();
      }
    });

    it('does not render the target for the attached variant', () => {
      render(
        <FieldStatus
          type="error"
          message="msg"
          variant="attached"
          data-testid="fs"
        />,
      );
      expect(
        screen.getByTestId('fs').querySelector('.astryx-field-status-icon'),
      ).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('renders an empty message without crashing', () => {
      render(<FieldStatus type="error" message="" data-testid="fs" />);
      const el = screen.getByTestId('fs');
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent('');
    });

    it('renders message content verbatim, including whitespace-only strings', () => {
      render(<FieldStatus type="warning" message="   " data-testid="fs" />);
      expect(screen.getByTestId('fs').textContent).toBe('   ');
    });
  });

  it('exposes a displayName for devtools', () => {
    expect(FieldStatus.displayName).toBe('FieldStatus');
  });
});

// jsdom cannot emulate forced colors, so this asserts the compiled rule the
// status fill relies on (architecture:theme-tokens INV11).
describe('FieldStatus forced colors', () => {
  it('keeps a visible boundary on the status fill', () => {
    render(<FieldStatus type="error" message="Required" />);
    const css = getForcedColorsRules();
    expect(css).toContain('outline-style: solid;');
    expect(css).toContain('outline-color: canvastext;');
  });
});
