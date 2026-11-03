// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Switch.test.tsx
 * @input Uses vitest, @testing-library/react, Switch component
 * @output Unit tests for Switch's own contract: callbacks, form participation,
 *   composition, and styling
 * @position Testing; validates Switch.tsx implementation
 *
 * The shared switch-pattern outcomes — role, accessible name, exposed on/off
 * state, description, disabled exposure and inoperability, and keyboard and
 * pointer activation — are owned by the reusable accessibility contract in
 * __tests__/Switch.a11y.test.tsx (jsdom) and
 * __tests__/Switch.a11y.chromium.spec.ts (real Chromium, where the computed
 * accessibility tree and real focus can actually be observed). Assertions that
 * this file used to duplicate now live there and are not repeated here.
 *
 * What stays here is Switch's own contract: callback payloads, form data,
 * disabled-reason tooltip composition, the label theme target, forced-colors
 * CSS, RTL thumb travel, and rest forwarding.
 *
 * SYNC: When Switch.tsx changes, update tests to match new behavior
 */

import {StrictMode} from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Switch} from './Switch';
import {
  getAllInjectedCss,
  getForcedColorsRules,
} from '../__tests__/forcedColors';
import {
  hasPressedArm,
  hasReleaseFade,
  readsPressStrength,
} from '../__tests__/pressState';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {InternationalizationProvider} from '../i18n';

afterEach(() => {
  __resetLiveRegionsForTest();
});

// Mock showPopover/hidePopover (not implemented in jsdom) so the tooltip layer
// reflects its open state via a `popover-open` attribute the tests can assert.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  const originalMatches = HTMLElement.prototype.matches;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return this.hasAttribute('popover-open');
    }
    return originalMatches.call(this, selector);
  };
});

describe('Switch', () => {
  it('renders with custom size prop (sm / md)', () => {
    const {rerender} = render(
      <Switch
        label="Small switch"
        value={false}
        size="sm"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('switch')).toBeInTheDocument();

    rerender(
      <Switch
        label="Medium switch"
        value={false}
        size="md"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('calls onChange with new checked state when clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={handleChange}
      />,
    );

    const switchEl = screen.getByRole('switch');
    await user.click(switchEl);
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(true, expect.any(Object));
  });

  it('calls onChange with false when turning off', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <Switch
        label="Enable notifications"
        value={true}
        onChange={handleChange}
      />,
    );

    const switchEl = screen.getByRole('switch');
    await user.click(switchEl);
    expect(handleChange).toHaveBeenCalledWith(false, expect.any(Object));
  });

  it('works when clicking on the label', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={handleChange}
      />,
    );

    const label = screen.getByText('Enable notifications');
    await user.click(label);
    expect(handleChange).toHaveBeenCalledWith(true, expect.any(Object));
  });

  it('renders description when provided', () => {
    render(
      <Switch
        label="Dark mode"
        description="Switch to a darker color scheme"
        value={false}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByText('Switch to a darker color scheme'),
    ).toBeInTheDocument();
  });

  it('toggles when clicking on the description', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <Switch
        label="Dark mode"
        description="Switch to a darker color scheme"
        value={false}
        onChange={handleChange}
      />,
    );
    await user.click(screen.getByText('Switch to a darker color scheme'));
    expect(handleChange).toHaveBeenCalledWith(true, expect.any(Object));
  });

  it('does not fold the description into the switch accessible name', () => {
    // Description stays a sibling of the <label>, so it must not become part
    // of the switch's accessible name — it belongs in the accessible
    // description (aria-describedby) only, to avoid double announcement.
    render(
      <Switch
        label="Dark mode"
        description="Switch to a darker color scheme"
        value={false}
        onChange={() => {}}
      />,
    );
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAccessibleName('Dark mode');
    expect(switchEl).toHaveAccessibleDescription(
      'Switch to a darker color scheme',
    );
  });

  it('does not call onChange when isDisabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={handleChange}
        isDisabled
      />,
    );

    const switchEl = screen.getByRole('switch');
    await user.click(switchEl);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(
      <Switch
        ref={ref}
        label="Enable notifications"
        value={false}
        onChange={() => {}}
      />,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement));
  });

  it('visually hides label when isLabelHidden is true', () => {
    render(
      <Switch
        label="Toggle row"
        isLabelHidden
        value={false}
        onChange={() => {}}
      />,
    );
    const label = screen.getByText('Toggle row');
    expect(label).toBeInTheDocument();
    // Label should still be accessible
    expect(screen.getByLabelText('Toggle row')).toBeInTheDocument();
  });

  it('drops the label gap when isLabelHidden so the row is only as wide as the track', () => {
    const {rerender} = render(
      <Switch
        label="Toggle row"
        isLabelHidden
        value={false}
        onChange={() => {}}
      />,
    );
    const row = screen.getByRole('switch').parentElement!.parentElement!;
    expect(getComputedStyle(row).gap).toMatch(/^0(px)?$/);

    rerender(<Switch label="Toggle row" value={false} onChange={() => {}} />);
    expect(getComputedStyle(row).gap).not.toMatch(/^0(px)?$/);
  });

  // Retained: the shared contract binds a hidden-label state and a described
  // state, but not a hidden label WITH a description, which is the combination
  // that used to drop the link.
  it('keeps description linked via aria-describedby when isLabelHidden', () => {
    render(
      <Switch
        label="Toggle row"
        isLabelHidden
        description="Enables sync for this row"
        value={false}
        onChange={() => {}}
      />,
    );
    const switchEl = screen.getByRole('switch');
    const description = screen.getByText('Enables sync for this row');
    expect(description.id).not.toBe('');
    expect(switchEl.getAttribute('aria-describedby')).toContain(description.id);
  });

  it('shows label visually by default', () => {
    render(
      <Switch label="Enable notifications" value={false} onChange={() => {}} />,
    );
    const label = screen.getByText('Enable notifications');
    expect(label).toBeVisible();
  });

  it('renders with labelPosition start (label before switch)', () => {
    const {container} = render(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={() => {}}
        labelPosition="start"
      />,
    );
    // The outer div wraps the container div which has the label and switch
    const outerDiv = container.firstChild as HTMLElement;
    const containerDiv = outerDiv.firstChild as HTMLElement;
    const children = Array.from(containerDiv.children);
    // First child should be label wrapper, second should be switch wrapper
    expect(children.length).toBe(2);
  });

  it('renders with labelPosition end (switch before label)', () => {
    const {container} = render(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={() => {}}
        labelPosition="end"
      />,
    );
    // The outer div wraps the container div which has the switch and label
    const outerDiv = container.firstChild as HTMLElement;
    const containerDiv = outerDiv.firstChild as HTMLElement;
    const children = Array.from(containerDiv.children);
    // First child should be switch wrapper, second should be label wrapper
    expect(children.length).toBe(2);
  });

  // Retained on purpose: the shared switch contract encodes no busy expectation
  // — no current record adopts one — so this is the only thing gating it.
  it('sets aria-busy on input when loading', () => {
    render(
      <Switch
        label="Enable notifications"
        value={false}
        isLoading
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders status message when status prop is provided', () => {
    render(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={() => {}}
        status={{type: 'error', message: 'Failed to save setting'}}
      />,
    );
    expect(screen.getByText('Failed to save setting')).toBeInTheDocument();
  });

  // Retained after review, not by oversight. The shared contract's
  // switch.invalid.exposed proves that a switch in error is REPORTED in error,
  // but the bound state is also `isRequired` and off, and Chromium derives an
  // invalid state from constraint validation alone — so that expectation would
  // still pass with this mapping deleted. Switch's own error-status-to-
  // aria-invalid mapping is gated here, together with its negative below.
  it('sets aria-invalid when status type is error', () => {
    render(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={() => {}}
        status={{type: 'error', message: 'Error message'}}
      />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not set aria-invalid when status type is not error', () => {
    render(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={() => {}}
        status={{type: 'warning', message: 'Warning message'}}
      />,
    );
    expect(screen.getByRole('switch')).not.toHaveAttribute('aria-invalid');
  });

  // Regression: the status is conditionally mounted, so it must be announced
  // through the persistent useAnnounce live region — a live region born
  // together with its content is not reliably announced.
  it('announces a status message that appears after mount', async () => {
    const {rerender} = render(
      <Switch label="Enable notifications" value={false} onChange={() => {}} />,
    );
    expect(
      document.querySelector('[data-astryx-live-region="assertive"]'),
    ).toBeNull();

    rerender(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={() => {}}
        status={{type: 'error', message: 'Failed to save setting'}}
      />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-astryx-live-region="assertive"]'),
      ).toHaveTextContent('Failed to save setting');
    });
  });

  it('announces loading state through useAnnounce when busy', async () => {
    const {container, rerender} = render(
      <Switch label="Enable notifications" value={false} onChange={() => {}} />,
    );
    // Does not introduce a permanent live region DOM element per switch
    expect(
      container.querySelector('[role="status"][aria-live="polite"]'),
    ).toBeNull();

    rerender(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={() => {}}
        isLoading
      />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-astryx-live-region="polite"]'),
      ).toHaveTextContent('Loading');
    });
  });

  it('announces one busy start once under StrictMode, from the switch alone', async () => {
    // Count every message the shared polite region is given. Each announce
    // writes its text in a later frame, so two announces add it twice.
    const written: string[] = [];
    const observer = new MutationObserver(records => {
      for (const record of records) {
        const target = record.target as Element;
        if (target.getAttribute?.('data-astryx-live-region') !== 'polite') {
          continue;
        }
        for (const node of record.addedNodes) {
          if (node.textContent) {
            written.push(node.textContent);
          }
        }
      }
    });
    observer.observe(document.body, {childList: true, subtree: true});

    const {container} = render(
      <StrictMode>
        <Switch
          label="Sync photos"
          value={false}
          onChange={() => {}}
          isLoading
        />
      </StrictMode>,
    );
    await waitFor(() => {
      expect(written).toContain('Loading');
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    observer.disconnect();

    expect(written.filter(text => text === 'Loading')).toHaveLength(1);
    // The thumb's spinner is a silent indicator: no live role reaches
    // assistive technology from inside the switch.
    for (const status of container.querySelectorAll('[role="status"]')) {
      expect(status.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it('announces again when the switch becomes busy again after settling', async () => {
    const polite = () =>
      document.querySelector('[data-astryx-live-region="polite"]');
    const props = {label: 'Sync photos', value: false, onChange: () => {}};
    const {rerender} = render(<Switch {...props} isLoading />);
    await waitFor(() => expect(polite()).toHaveTextContent('Loading'));

    rerender(<Switch {...props} />);
    polite()!.textContent = '';
    rerender(<Switch {...props} isLoading />);
    await waitFor(() => expect(polite()).toHaveTextContent('Loading'));
  });

  it('localizes the loading announcement through the i18n catalog', async () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{fr: {'@astryx.switch.loading': 'Chargement'}}}>
        <Switch
          label="Enable notifications"
          value={false}
          onChange={() => {}}
          isLoading
        />
      </InternationalizationProvider>,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-astryx-live-region="polite"]'),
      ).toHaveTextContent('Chargement');
    });
  });

  it('announces loading state while async changeAction is pending', async () => {
    let resolveAction!: () => void;
    const changeAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          resolveAction = resolve;
        }),
    );

    render(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={() => {}}
        changeAction={changeAction}
      />,
    );

    const switchEl = screen.getByRole('switch');
    fireEvent.click(switchEl);

    expect(changeAction).toHaveBeenCalled();
    await waitFor(() => {
      expect(
        document.querySelector('[data-astryx-live-region="polite"]'),
      ).toHaveTextContent('Loading');
    });

    resolveAction();
  });

  it('calls onFocus and onBlur callbacks', async () => {
    const user = userEvent.setup();
    const handleFocus = vi.fn();
    const handleBlur = vi.fn();
    render(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={() => {}}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />,
    );

    const switchEl = screen.getByRole('switch');
    await user.click(switchEl);
    expect(handleFocus).toHaveBeenCalled();

    await user.tab();
    expect(handleBlur).toHaveBeenCalled();
  });

  // Retained after review. The shared contract's switch.required.declared
  // accepts either the native attribute or aria-required, because a non-native
  // switch can only offer the latter — and Switch sets aria-required from a
  // form-level default too. Only this test pins `isRequired` to the NATIVE
  // attribute, which is what makes the browser block submission.
  it('sets required attribute when isRequired is true', () => {
    render(
      <Switch
        label="Enable notifications"
        value={false}
        onChange={() => {}}
        isRequired
      />,
    );
    expect(screen.getByRole('switch')).toBeRequired();
  });

  it('keeps a required switch valid until status shows an error', () => {
    const {rerender} = render(
      <Switch label="Accept" value={false} onChange={() => {}} isRequired />,
    );
    // Native required alone makes Chromium report the switch invalid.
    expect(screen.getByRole('switch')).toHaveAttribute('aria-invalid', 'false');
    rerender(
      <Switch
        label="Accept"
        value={false}
        onChange={() => {}}
        isRequired
        status={{type: 'error', message: 'Required'}}
      />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-invalid', 'true');
  });

  describe('disabledMessage', () => {
    const h = {hidden: true} as const;

    function getRow(): HTMLElement {
      return screen.getByRole('switch', h).closest('div')!.parentElement!;
    }

    it('shows the reason tooltip on hover when disabled with a reason', async () => {
      render(
        <Switch
          label="Enable notifications"
          value={false}
          onChange={() => {}}
          isDisabled
          disabledMessage="Notifications are turned off org-wide"
        />,
      );
      const tooltip = screen.getByRole('tooltip', h);
      expect(tooltip).toHaveTextContent(
        'Notifications are turned off org-wide',
      );
      fireEvent.mouseEnter(getRow());
      await waitFor(() => expect(tooltip).toHaveAttribute('popover-open'));
      fireEvent.mouseLeave(getRow());
      await waitFor(() => expect(tooltip).not.toHaveAttribute('popover-open'));
    });

    it('shows the reason tooltip on keyboard focus', async () => {
      const user = userEvent.setup();
      render(
        <Switch
          label="Enable notifications"
          value={false}
          onChange={() => {}}
          isDisabled
          disabledMessage="Notifications are turned off org-wide"
        />,
      );
      const tooltip = screen.getByRole('tooltip', h);
      await user.tab();
      expect(screen.getByRole('switch', h)).toHaveFocus();
      await waitFor(() => expect(tooltip).toHaveAttribute('popover-open'));
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <Switch
          label="Enable notifications"
          value={false}
          onChange={() => {}}
          disabledMessage="Notifications are turned off org-wide"
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(
        <Switch
          label="Enable notifications"
          value={false}
          onChange={() => {}}
          isDisabled
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the switch focusable via aria-disabled when a reason is provided', () => {
      render(
        <Switch
          label="Enable notifications"
          value={false}
          onChange={() => {}}
          isDisabled
          disabledMessage="Notifications are turned off org-wide"
        />,
      );
      const control = screen.getByRole('switch', h);
      expect(control).not.toBeDisabled();
      expect(control).toHaveAttribute('aria-disabled', 'true');
    });

    it('links the reason tooltip via aria-describedby', () => {
      render(
        <Switch
          label="Enable notifications"
          value={false}
          onChange={() => {}}
          isDisabled
          disabledMessage="Notifications are turned off org-wide"
        />,
      );
      const control = screen.getByRole('switch', h);
      const tooltip = screen.getByRole('tooltip', h);
      expect(control.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    // The shared switch contract owns whether a switch reported as unavailable
    // actually stays unchanged; what stays here is Switch's own promise that it
    // never calls back while blocked.
    it('does not call onChange while focusable-disabled', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <Switch
          label="Enable notifications"
          value={false}
          onChange={onChange}
          isDisabled
          disabledMessage="Notifications are turned off org-wide"
        />,
      );
      await user.click(screen.getByRole('switch', h));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not run caller key handlers while disabled', async () => {
      const user = userEvent.setup();
      const onKeyDown = vi.fn();
      const onKeyUp = vi.fn();
      render(
        <Switch
          label="Enable notifications"
          value={false}
          onChange={() => {}}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          isDisabled
        />,
      );
      await user.tab();
      expect(screen.getByRole('switch')).toHaveFocus();
      await user.keyboard('{Enter}');
      await user.keyboard(' ');
      expect(onKeyDown).not.toHaveBeenCalled();
      expect(onKeyUp).not.toHaveBeenCalled();
    });

    it('still runs caller key handlers on an enabled switch', async () => {
      const user = userEvent.setup();
      const onKeyDown = vi.fn();
      const onKeyUp = vi.fn();
      render(
        <Switch
          label="Enable notifications"
          value={false}
          onChange={() => {}}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
        />,
      );
      await user.tab();
      // Releasing Tab lands a keyup on the newly focused switch; count only
      // the key pressed after it.
      onKeyDown.mockClear();
      onKeyUp.mockClear();
      await user.keyboard('{Enter}');
      expect(onKeyDown).toHaveBeenCalledTimes(1);
      expect(onKeyUp).toHaveBeenCalledTimes(1);
    });

    it('stays focusable via aria-disabled when disabled without a reason', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const onClick = vi.fn();
      render(
        <form>
          <Switch
            label="Enable notifications"
            value={false}
            onChange={onChange}
            onClick={onClick}
            htmlName="notifications"
            isRequired
            isDisabled
          />
        </form>,
      );
      const control = screen.getByRole('switch');
      expect(control).not.toHaveAttribute('disabled');
      expect(control).toHaveAttribute('aria-disabled', 'true');
      await user.tab();
      expect(control).toHaveFocus();
      await user.keyboard(' ');
      await user.click(control);
      await user.click(screen.getByText('Enable notifications'));
      expect(onChange).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
      expect(control).not.toBeChecked();
      const form = control.closest('form')!;
      expect(form.checkValidity()).toBe(true);
      expect([...new FormData(form).keys()]).toEqual([]);
    });
  });
  describe('labelSpacing', () => {
    const getField = (container: HTMLElement) =>
      container.querySelector<HTMLElement>('.astryx-switch-field')!;

    it('omits the data attribute for the default hug spacing', () => {
      const {container} = render(
        <Switch label="Notify" value={false} onChange={() => {}} />,
      );
      expect(getField(container)).not.toHaveAttribute('data-label-spacing');
    });

    it('reflects spread spacing as a data attribute and variant class', () => {
      const {container} = render(
        <Switch
          label="Notify"
          value={false}
          onChange={() => {}}
          labelSpacing="spread"
        />,
      );
      expect(getField(container)).toHaveAttribute(
        'data-label-spacing',
        'spread',
      );
      expect(getField(container)).toHaveAttribute(
        'data-label-spacing',
        'spread',
      );
    });

    it('renders explicit hug the same as the default', () => {
      const {container: implicit} = render(
        <Switch label="Notify" value={false} onChange={() => {}} />,
      );
      const {container: explicit} = render(
        <Switch
          label="Notify"
          value={false}
          onChange={() => {}}
          labelSpacing="hug"
        />,
      );
      expect(getField(explicit)).not.toHaveAttribute('data-label-spacing');
      expect(getField(explicit).className).toBe(getField(implicit).className);
    });
  });
  describe('form participation', () => {
    it('submits under htmlName when on', () => {
      const {container} = render(
        <form>
          <Switch
            label="Notify"
            htmlName="notify"
            value={true}
            onChange={() => {}}
          />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect(data.get('notify')).toBe('on');
    });

    it('does not block form submission when required and disabled with a disabledMessage', () => {
      const {container} = render(
        <form>
          <Switch
            label="Notify"
            htmlName="notify"
            value={false}
            onChange={() => {}}
            isRequired
            isDisabled
            disabledMessage="Notifications are turned off org-wide"
          />
        </form>,
      );
      expect(container.querySelector('form')!.checkValidity()).toBe(true);
    });

    it('still blocks submission when required and off but enabled', () => {
      const {container} = render(
        <form>
          <Switch
            label="Notify"
            htmlName="notify"
            value={false}
            onChange={() => {}}
            isRequired
          />
        </form>,
      );
      expect(container.querySelector('form')!.checkValidity()).toBe(false);
    });

    it('is excluded from form data when disabled, even with a disabledMessage', () => {
      const {container} = render(
        <form>
          <Switch
            label="Notify"
            htmlName="notify"
            value={true}
            onChange={() => {}}
            isDisabled
            disabledMessage="Locked"
          />
        </form>,
      );
      expect([
        ...new FormData(container.querySelector('form')!).keys(),
      ]).toEqual([]);
    });

    it('submits nothing when off or when htmlName is omitted', () => {
      const {container} = render(
        <form>
          <Switch
            label="Off"
            htmlName="off"
            value={false}
            onChange={() => {}}
          />
          <Switch label="Unnamed" value={true} onChange={() => {}} />
        </form>,
      );
      const data = new FormData(container.querySelector('form')!);
      expect([...data.keys()]).toEqual([]);
    });
  });

  describe('RTL thumb travel direction', () => {
    // StyleX injects atomic rules into the document; scan them so we can assert
    // the direction-aware transform without relying on jsdom to resolve the
    // `:is([dir="rtl"] *)` descendant selector against computed style.
    function injectedCss(): string {
      let out = '';
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            out += rule.cssText + '\n';
          }
        } catch {
          // ignore cross-origin sheets
        }
      }
      out += Array.from(document.querySelectorAll('style'))
        .map(s => s.textContent || '')
        .join('\n');
      return out;
    }

    it('applies a distinct thumb style when on vs off (on-travel is wired)', () => {
      const on = render(<Switch label="On" value={true} onChange={() => {}} />);
      const off = render(
        <Switch label="Off" value={false} onChange={() => {}} />,
      );
      const onThumb = on.container.querySelector(
        '[class*="thumbOnSizeStyles"]',
      );
      const offThumb = off.container.querySelector(
        '[class*="thumbOffSizeStyles"]',
      );
      expect(onThumb).not.toBeNull();
      expect(offThumb).not.toBeNull();
      expect(onThumb!.getAttribute('class')).not.toBe(
        offThumb!.getAttribute('class'),
      );
    });

    it('mirrors the on-state thumb travel under RTL (negative translateX)', () => {
      render(<Switch label="Toggle" value={true} onChange={() => {}} />);
      const css = injectedCss();
      // LTR on-travel moves the thumb toward the physical right (positive px).
      expect(css).toMatch(/transform:\s*translateX\(1[24]px\)/);
      // RTL mirrors it: the on-thumb lands on the inline-end (physical left)
      // side, so the travel flips sign, scoped to `[dir="rtl"]`.
      expect(css).toMatch(
        /:is\(\[dir="rtl"\][^)]*\)[^{]*\{\s*transform:\s*translateX\(-1[24]px\)/,
      );
    });
  });

  describe('rest forwarding', () => {
    it('forwards data-testid, id, and aria-* to the root element', () => {
      const {container} = render(
        <Switch
          label="Notifications"
          value={false}
          onChange={() => {}}
          data-testid="my-switch"
          id="switch-1"
          aria-label="Toggle notifications"
        />,
      );
      const root = container.querySelector('[data-testid="my-switch"]');
      expect(root).not.toBeNull();
      expect(root).toHaveAttribute('id', 'switch-1');
      expect(root).toHaveAttribute('aria-label', 'Toggle notifications');
    });

    it('composes a caller aria-describedby onto the switch control', () => {
      const {container} = render(
        <>
          <p id="external-hint">Applies to every repository</p>
          <Switch
            label="Notifications"
            description="Sends a daily digest"
            value={false}
            onChange={() => {}}
            data-testid="my-switch"
            aria-describedby="external-hint"
          />
        </>,
      );
      const control = screen.getByRole('switch');
      const description = screen.getByText('Sends a daily digest');
      expect(control.getAttribute('aria-describedby')?.split(' ')).toEqual([
        'external-hint',
        description.id,
      ]);
      expect(control).toHaveAccessibleDescription(
        'Applies to every repository Sends a daily digest',
      );
      // The id reference lives on the control only, not on the field wrapper.
      const root = container.querySelector('[data-testid="my-switch"]');
      expect(root).not.toHaveAttribute('aria-describedby');
    });

    it('names the switch control from a caller aria-labelledby', () => {
      const {container} = render(
        <>
          <span id="row-title">Release notes</span>
          <Switch
            label="Pin Release notes"
            isLabelHidden
            value={false}
            onChange={() => {}}
            data-testid="my-switch"
            aria-labelledby="row-title"
          />
        </>,
      );
      const control = screen.getByRole('switch', {name: 'Release notes'});
      expect(control).toHaveAttribute('aria-labelledby', 'row-title');
      // The id reference lives on the control only, not on the field wrapper.
      const root = container.querySelector('[data-testid="my-switch"]');
      expect(root).not.toHaveAttribute('aria-labelledby');
    });
  });

  describe('pressed state', () => {
    it('paints the pressed overlay on the track and the thumb while the row is pressed', () => {
      const {container} = render(
        <Switch label="Notifications" value={false} onChange={() => {}} />,
      );
      const track = container.querySelector('.astryx-switch');
      const thumb = container.querySelector('.astryx-switch-thumb');
      if (track == null || thumb == null) {
        throw new Error('the switch has no track or thumb to press');
      }
      expect(hasPressedArm(track)).toBe(true);
      expect(hasPressedArm(thumb)).toBe(true);
    });

    it('fades the touch press out from the row, with the track and thumb reading its strength', () => {
      const {container} = render(
        <Switch label="Notifications" value={false} onChange={() => {}} />,
      );
      const track = container.querySelector('.astryx-switch');
      const thumb = container.querySelector('.astryx-switch-thumb');
      const row = track?.closest('[data-astryx-pressable]');
      if (track == null || thumb == null || row == null) {
        throw new Error('the switch has no pressable row, track or thumb');
      }
      // The controller writes the row; the row owns the strength and its
      // release, and the two parts paint the pressed token at that strength
      // on both touch arms, so they fade together.
      expect(hasReleaseFade(row)).toBe(true);
      for (const part of [track, thumb]) {
        expect(readsPressStrength(part, '[data-astryx-press="on"]')).toBe(true);
        expect(readsPressStrength(part)).toBe(true);
      }
    });
  });

  describe('coarse pointer and RTL hit-target positioning', () => {
    it.each([
      ['sm', 'ltr'],
      ['sm', 'rtl'],
      ['md', 'ltr'],
      ['md', 'rtl'],
    ] as const)(
      'applies centerInline styling to native input (size: %s, dir: %s)',
      (size, dir) => {
        const {container} = render(
          <div dir={dir}>
            <Switch
              label="Dark mode"
              size={size}
              value={false}
              onChange={() => {}}
            />
          </div>,
        );

        const input = container.querySelector(
          'input[type="checkbox"]',
        ) as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.className).toContain('centerInline');
      },
    );
  });
});

// jsdom cannot emulate forced-colors rendering, so these assert that the
// compiled output includes the forced-colors rules; visual behavior needs
// manual verification under Windows High Contrast.
describe('forced colors (WCAG 1.4.11)', () => {
  it('compiles forced-colors overrides so on/off state survives Windows High Contrast', () => {
    render(<Switch label="Notifications" value={true} onChange={() => {}} />);
    const css = getForcedColorsRules();
    // Track outline (backgrounds are stripped; the border keeps the bounds).
    expect(css).toContain('border-color: canvastext;');
    // Off track stays empty; on track uses the selection color.
    expect(css).toContain('background-color: canvas;');
    expect(css).toContain('background-color: highlight;');
    // Thumb fill per state.
    expect(css).toContain('background-color: canvastext;');
    expect(css).toContain('background-color: highlighttext;');
    // Disabled affordance (opacity dimming does not survive forcing).
    expect(css).toContain('border-color: graytext;');
  });

  it('gates the hover tint out of forced colors so the thumb stays visible on hover', () => {
    render(<Switch label="Notifications" value={true} onChange={() => {}} />);
    // The ancestor-hover tint is a non-system color-mix whose rule outranks the
    // plain forced-colors track rule. It is gated behind `forced-colors: none`
    // so it cannot reassert on hover and flatten the Highlight track to white
    // under the HighlightText thumb (white-on-white).
    expect(getAllInjectedCss()).toContain(
      '(hover: hover) and (forced-colors: none)',
    );
    // And the tint never leaks into the forced-colors output.
    expect(getForcedColorsRules()).not.toContain('color-mix');
  });
});

describe('label theme target', () => {
  it('names its own label so a theme can style it apart from a field label', () => {
    // See CheckboxInput: the control names the label it owns.
    render(<Switch label="Wi-Fi" value={false} onChange={() => {}} />);
    const label = screen.getByText('Wi-Fi').closest('label');
    expect(label).toHaveClass('astryx-field-label');
    expect(label).toHaveClass('astryx-switch-label');
  });
});
