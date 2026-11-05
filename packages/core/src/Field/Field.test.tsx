// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Field.test.tsx
 * @input Uses Vitest, Testing Library, StyleX, Field, FormLayoutContext
 * @output Unit tests for Field component behavior
 * @position Testing; validates Field.tsx implementation
 *
 * SYNC: When Field.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen, waitFor, fireEvent} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {Field} from './Field';
import {FormLayoutContext} from '../FormLayout/FormLayoutContext';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';

const testStyles = stylex.create({
  root: {
    minWidth: '123px',
  },
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

describe('Field', () => {
  it.each(['sm', 'md', 'lg'] as const)(
    'provides a half-height overlap for an attached %s control',
    size => {
      render(
        <Field
          label="Username"
          inputID="username"
          status={{type: 'warning', message: 'This username may be taken'}}>
          <div data-size={size}>Control</div>
        </Field>,
      );

      const status = screen.getByText('This username may be taken');
      expect(
        getComputedStyle(status.parentElement!).getPropertyValue(
          '--_field-status-overlap',
        ),
      ).toBe(`calc(var(--size-element-${size}) / 2)`);
    },
  );

  it('layers an attached status behind a custom control', () => {
    render(
      <Field
        label="Username"
        inputID="username"
        status={{type: 'warning', message: 'This username may be taken'}}>
        <input id="username" />
      </Field>,
    );

    const status = screen.getByText('This username may be taken');
    const wrapper = status.parentElement!;

    expect(getComputedStyle(wrapper).isolation).toBe('isolate');
    expect(getComputedStyle(status).position).toBe('relative');
    expect(getComputedStyle(status).zIndex).toBe('-1');
  });

  it('renders with label', () => {
    render(
      <Field label="Email" inputID="email-input">
        <input id="email-input" />
      </Field>,
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(
      <Field
        label="Email"
        inputID="email-input"
        description="We'll never share your email"
        descriptionID="email-desc">
        <input id="email-input" aria-describedby="email-desc" />
      </Field>,
    );
    expect(
      screen.getByText("We'll never share your email"),
    ).toBeInTheDocument();
  });

  it('associates description with correct ID', () => {
    render(
      <Field
        label="Email"
        inputID="email-input"
        description="Description text"
        descriptionID="email-desc">
        <input id="email-input" aria-describedby="email-desc" />
      </Field>,
    );
    const description = screen.getByText('Description text');
    expect(description).toHaveAttribute('id', 'email-desc');
  });

  it('visually hides label when isLabelHidden is true', () => {
    render(
      <Field label="Search" isLabelHidden inputID="search-input">
        <input id="search-input" />
      </Field>,
    );
    const label = screen.getByText('Search');
    expect(label).toBeInTheDocument();
    // Label should still be accessible
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });

  it('visually hides description when isLabelHidden is true', () => {
    render(
      <Field
        label="Search"
        isLabelHidden
        description="Search for items"
        inputID="search-input"
        descriptionID="search-desc">
        <input id="search-input" />
      </Field>,
    );
    // Description should still be in the DOM for screen readers
    const description = screen.getByText('Search for items');
    expect(description).toBeInTheDocument();
    // But should have the visually-hidden styles applied
    expect(description.className).toContain('srOnly');
  });

  it('shows label visually by default', () => {
    render(
      <Field label="Email" inputID="email-input">
        <input id="email-input" />
      </Field>,
    );
    const label = screen.getByText('Email');
    expect(label).toBeVisible();
  });

  it('renders a single-control label as a <label> with htmlFor', () => {
    render(
      <Field label="Email" inputID="email-input">
        <input id="email-input" />
      </Field>,
    );
    const labelEl = screen.getByText('Email');
    expect(labelEl.tagName).toBe('LABEL');
    expect(labelEl).toHaveAttribute('for', 'email-input');
  });

  it('renders a group label as a <span> (not <label>) with no htmlFor', () => {
    render(
      <Field
        label="Plan"
        inputID="plan-group"
        labelID="plan-label"
        isGroupLabel>
        <div role="radiogroup" aria-labelledby="plan-label" />
      </Field>,
    );
    const labelEl = screen.getByText('Plan');
    // A group's accessible-name element must not be a literal <label>.
    expect(labelEl.tagName).toBe('SPAN');
    expect(labelEl.closest('label')).toBeNull();
    expect(labelEl).not.toHaveAttribute('for');
    // labelID is applied to the label element and referenced by the group.
    expect(labelEl).toHaveAttribute('id', 'plan-label');
    const group = screen.getByRole('radiogroup', {name: 'Plan'});
    expect(group.getAttribute('aria-labelledby')).toBe(labelEl.id);
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(
      <Field ref={ref} label="Name" inputID="name-input">
        <input id="name-input" />
      </Field>,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
  });

  it('renders description without ID attribute when descriptionID is not provided', () => {
    render(
      <Field label="Email" inputID="email-input" description="Description text">
        <input id="email-input" />
      </Field>,
    );
    const description = screen.getByText('Description text');
    expect(description).toBeInTheDocument();
    expect(description).toHaveAttribute('id', 'email-input-desc');
  });

  it('renders Optional text when isOptional is set', () => {
    render(
      <Field label="Name" inputID="name-input" isOptional>
        <input id="name-input" />
      </Field>,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
  });

  it('renders Required text when isRequired is set', () => {
    render(
      <Field label="Name" inputID="name-input" isRequired>
        <input id="name-input" />
      </Field>,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText(/Required/)).toBeInTheDocument();
  });

  it('renders description and Optional text when both are set', () => {
    render(
      <Field
        label="Name"
        inputID="name-input"
        description="Enter your name"
        descriptionID="name-desc"
        isOptional>
        <input id="name-input" aria-describedby="name-desc" />
      </Field>,
    );
    expect(screen.getByText('Enter your name')).toBeInTheDocument();
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
  });

  it('renders description and Required text when both are set', () => {
    render(
      <Field
        label="Name"
        inputID="name-input"
        description="This field is mandatory"
        descriptionID="name-desc"
        isRequired>
        <input id="name-input" aria-describedby="name-desc" />
      </Field>,
    );
    expect(screen.getByText('This field is mandatory')).toBeInTheDocument();
    expect(screen.getByText(/Required/)).toBeInTheDocument();
  });

  it('renders Optional text with bullet separator', () => {
    render(
      <Field label="Name" inputID="name-input" isOptional>
        <input id="name-input" />
      </Field>,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(
      screen.getByText('∙', {selector: '[aria-hidden="true"]'}),
    ).toBeInTheDocument();
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
  });

  it('renders tooltip info icon when labelTooltip is provided', () => {
    render(
      <Field label="Help" inputID="help-input" labelTooltip="Helpful info">
        <input id="help-input" />
      </Field>,
    );
    // Info icon should be present
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('does not render tooltip icon when labelTooltip is not provided', () => {
    render(
      <Field label="Name" inputID="name-input">
        <input id="name-input" />
      </Field>,
    );
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  // The status message is announced through the persistent useAnnounce live
  // regions rather than role/aria-live on the (conditionally mounted)
  // FieldStatus element itself — regions born with their content are not
  // reliably announced by assistive technology.
  it('announces error status assertively via the persistent live region', async () => {
    render(
      <Field
        label="Email"
        inputID="email-input"
        status={{type: 'error', message: 'Invalid email'}}>
        <input id="email-input" />
      </Field>,
    );
    expect(screen.getByText('Invalid email')).not.toHaveAttribute('role');
    await waitFor(() => {
      expect(assertiveRegion()).toHaveTextContent('Invalid email');
    });
  });

  it('announces warning status politely via the persistent live region', async () => {
    render(
      <Field
        label="Email"
        inputID="email-input"
        status={{type: 'warning', message: 'Check this'}}>
        <input id="email-input" />
      </Field>,
    );
    expect(screen.getByText('Check this')).not.toHaveAttribute('aria-live');
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('Check this');
    });
  });

  // Regression: the status live region must NOT be born together with its
  // content. A message that appears after mount (the common validation flow)
  // has to land in the persistent announce region.
  it('announces a status message that appears after mount', async () => {
    const {rerender} = render(
      <Field label="Email" inputID="email-input">
        <input id="email-input" />
      </Field>,
    );
    expect(assertiveRegion()).toBeNull();

    rerender(
      <Field
        label="Email"
        inputID="email-input"
        status={{type: 'error', message: 'Email is required'}}>
        <input id="email-input" />
      </Field>,
    );
    await waitFor(() => {
      expect(assertiveRegion()).toHaveTextContent('Email is required');
    });
  });

  // The tooltip placement renders no FieldStatus, so Field itself must speak
  // the message; otherwise a screen-reader user is never told it appeared.
  describe('tooltip status placement', () => {
    /** Every non-empty text written into a live region, in order. */
    function recordAnnouncements(): string[] {
      const spoken: string[] = [];
      const observer = new MutationObserver(records => {
        for (const record of records) {
          const target =
            record.target instanceof HTMLElement
              ? record.target
              : record.target.parentElement;
          const text = target
            ?.closest('[data-astryx-live-region]')
            ?.textContent?.trim();
          if (text) {
            spoken.push(text);
          }
        }
      });
      observer.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      return spoken;
    }

    it('announces a warning that appears after mount, politely', async () => {
      const {rerender} = render(
        <Field label="Email" inputID="email-input" statusVariant="tooltip">
          <input id="email-input" />
        </Field>,
      );
      expect(politeRegion()).toBeNull();

      rerender(
        <Field
          label="Email"
          inputID="email-input"
          statusVariant="tooltip"
          status={{type: 'warning', message: 'Check this'}}>
          <input id="email-input" />
        </Field>,
      );
      // No message box renders for this placement; the text lives only in
      // the live region (and in the member's tooltip, which Field does not own).
      expect(screen.queryByText('Check this')).toBeNull();
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Check this');
      });
      expect(assertiveRegion()).toHaveTextContent('');
    });

    it('announces an error assertively, matching the message box placements', async () => {
      render(
        <Field
          label="Email"
          inputID="email-input"
          statusVariant="tooltip"
          status={{type: 'error', message: 'Email is required'}}>
          <input id="email-input" />
        </Field>,
      );
      await waitFor(() => {
        expect(assertiveRegion()).toHaveTextContent('Email is required');
      });
    });

    it('speaks a message once, and again only when it changes', async () => {
      const spoken = recordAnnouncements();
      const field = (message: string) => (
        <Field
          label="Email"
          inputID="email-input"
          statusVariant="tooltip"
          status={{type: 'warning', message}}>
          <input id="email-input" />
        </Field>
      );
      const {rerender} = render(field('First'));
      await waitFor(() => expect(spoken).toEqual(['First']));

      rerender(field('First'));
      rerender(field('Second'));
      await waitFor(() => expect(spoken).toEqual(['First', 'Second']));
    });

    it.each(['attached', 'detached'] as const)(
      'does not add a second announcement to the %s message box',
      async statusVariant => {
        const spoken = recordAnnouncements();
        render(
          <Field
            label="Email"
            inputID="email-input"
            statusVariant={statusVariant}
            status={{type: 'warning', message: 'Check this'}}>
            <input id="email-input" />
          </Field>,
        );
        await waitFor(() => expect(spoken).toEqual(['Check this']));
        // Give a duplicate announcement's animation frame time to land.
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(spoken).toEqual(['Check this']);
      },
    );

    it('does not announce a status without a message', () => {
      render(
        <Field
          label="Email"
          inputID="email-input"
          statusVariant="tooltip"
          status={{type: 'error'}}>
          <input id="email-input" />
        </Field>,
      );
      expect(assertiveRegion()).toBeNull();
      expect(politeRegion()).toBeNull();
    });
  });

  it('auto-generates description ID as {inputID}-desc when descriptionID is not provided', () => {
    render(
      <Field label="Email" inputID="my-input" description="Help text">
        <input id="my-input" />
      </Field>,
    );
    expect(screen.getByText('Help text')).toHaveAttribute(
      'id',
      'my-input-desc',
    );
  });

  it('auto-generates status message ID as {inputID}-status when messageID is not provided', () => {
    render(
      <Field
        label="Email"
        inputID="my-input"
        status={{type: 'error', message: 'Required'}}>
        <input id="my-input" />
      </Field>,
    );
    expect(screen.getByText('Required')).toHaveAttribute(
      'id',
      'my-input-status',
    );
  });

  it('warns when isOptional and isRequired are both set', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Field label="Name" inputID="name-input" isOptional isRequired>
        <input id="name-input" />
      </Field>,
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Field: isOptional and isRequired are mutually exclusive. isOptional takes precedence.',
    );
    warnSpy.mockRestore();
  });

  // ─── width prop (#2755) ───────────────────────────────────────────────

  describe('width prop', () => {
    it('applies a string width to the outer field root', () => {
      render(
        <Field
          label="Name"
          inputID="name-input"
          width="100%"
          data-testid="field">
          <input id="name-input" data-testid="control" />
        </Field>,
      );
      const field = screen.getByTestId('field');
      // StyleX compiles the dynamic width to an inline CSS custom property.
      expect(field.getAttribute('style')).toContain('100%');
      expect(field.className).toContain('dynamicStyles.width');
    });

    it('applies a numeric width (treated as pixels)', () => {
      render(
        <Field
          label="Name"
          inputID="name-input"
          width={240}
          data-testid="field">
          <input id="name-input" />
        </Field>,
      );
      const field = screen.getByTestId('field');
      expect(field.getAttribute('style')).toContain('240');
    });

    it('does not size the inner control element', () => {
      render(
        <Field
          label="Name"
          inputID="name-input"
          width="100%"
          data-testid="field">
          <input id="name-input" data-testid="control" />
        </Field>,
      );
      const control = screen.getByTestId('control');
      // The width var lives on the field root, not the control itself.
      expect(control.getAttribute('style') ?? '').not.toContain('100%');
    });

    it('omits width styling when the prop is not provided', () => {
      render(
        <Field label="Name" inputID="name-input" data-testid="field">
          <input id="name-input" />
        </Field>,
      );
      const field = screen.getByTestId('field');
      expect(field.className).not.toContain('dynamicStyles.width');
    });
  });

  // ─── Horizontal-labels context ────────────────────────────────────────

  describe('horizontal-labels layout', () => {
    const horizontalLabelsWrapper = ({
      children,
    }: {
      children: React.ReactNode;
    }) => (
      <FormLayoutContext value={{direction: 'horizontal-labels'}}>
        {children}
      </FormLayoutContext>
    );

    it('composes root props without letting callers replace layout semantics', () => {
      const onClick = vi.fn();
      const expectedXstyleClass = stylex.props(testStyles.root).className;
      if (expectedXstyleClass == null) {
        throw new Error('Expected the test xstyle to produce a class name.');
      }

      render(
        <Field
          label="Name"
          inputID="name-input"
          data-testid="field"
          data-layout="consumer"
          data-owner="consumer"
          className="consumer-class"
          style={{width: '321px'}}
          xstyle={testStyles.root}
          onClick={onClick}>
          <input id="name-input" />
        </Field>,
        {wrapper: horizontalLabelsWrapper},
      );

      const field = screen.getByTestId('field');
      expect(field).toHaveClass('astryx-field', 'consumer-class');
      expect(field).toHaveClass(expectedXstyleClass);
      expect(field).toHaveAttribute('data-layout', 'horizontal-labels');
      expect(field).toHaveAttribute('data-owner', 'consumer');
      expect(field).toHaveStyle({width: '321px'});
      fireEvent.click(field);
      expect(onClick).toHaveBeenCalledOnce();
    });

    it('visually hides the description in horizontal-label mode when the label is hidden', () => {
      render(
        <Field
          label="Search"
          inputID="search-input"
          isLabelHidden
          description="Search for items"
          descriptionID="search-desc">
          <input id="search-input" aria-describedby="search-desc" />
        </Field>,
        {wrapper: horizontalLabelsWrapper},
      );

      const description = screen.getByText('Search for items');
      expect(description.className).toContain('visuallyHidden');
      expect(description).toHaveAttribute('id', 'search-desc');
    });

    it('applies display:contents when in horizontal-labels context', () => {
      const {container} = render(
        <Field label="Name" inputID="name-input">
          <input id="name-input" />
        </Field>,
        {wrapper: horizontalLabelsWrapper},
      );
      const field = container.firstChild as HTMLElement;
      expect(field.className).toContain('horizontalLabels');
    });

    it('renders label and input as direct grid children via display:contents', () => {
      render(
        <Field label="Name" inputID="name-input" data-testid="field">
          <input id="name-input" data-testid="name" />
        </Field>,
        {wrapper: horizontalLabelsWrapper},
      );
      const field = screen.getByTestId('field');
      // With display:contents, the field's children participate in the parent grid.
      // The field should contain: label alignment wrapper + input wrapper div
      const label = screen.getByText('Name');
      expect(label.tagName).toBe('LABEL');
      expect(field.contains(label)).toBe(true);
      expect(field.contains(screen.getByTestId('name'))).toBe(true);
    });

    it('groups description with input in column 2', () => {
      render(
        <Field
          label="Email"
          inputID="email-input"
          description="We won't share it"
          descriptionID="email-desc"
          data-testid="field">
          <input id="email-input" data-testid="email" />
        </Field>,
        {wrapper: horizontalLabelsWrapper},
      );
      const descEl = screen.getByText("We won't share it");
      const inputEl = screen.getByTestId('email');
      // Both description and input should be inside the same wrapper div (column 2)
      expect(descEl.parentElement).toBe(inputEl.parentElement);
    });

    it('groups status message with input in column 2', () => {
      render(
        <Field
          label="Email"
          inputID="email-input"
          status={{type: 'error', message: 'Required'}}
          data-testid="field">
          <input id="email-input" data-testid="email" />
        </Field>,
        {wrapper: horizontalLabelsWrapper},
      );
      const statusEl = screen.getByText('Required');
      const inputEl = screen.getByTestId('email');
      // Both status and input should be inside the same wrapper div (column 2)
      expect(statusEl.parentElement).toBe(inputEl.parentElement);
    });

    it('does not apply display:contents in vertical context', () => {
      const {container} = render(
        <Field label="Name" inputID="name-input">
          <input id="name-input" />
        </Field>,
      );
      const field = container.firstChild as HTMLElement;
      expect(field.className).not.toContain('horizontalLabels');
      expect(field.className).toContain('container');
    });

    it('wraps label in alignment div with top padding', () => {
      render(
        <Field label="Name" inputID="name-input" data-testid="field">
          <input id="name-input" />
        </Field>,
        {wrapper: horizontalLabelsWrapper},
      );
      const field = screen.getByTestId('field');
      // First child should be the label alignment wrapper
      const labelWrapper = field.children[0] as HTMLElement;
      expect(labelWrapper.tagName).toBe('DIV');
      expect(labelWrapper.className).toContain('horizontalLabelAlign');
      // Label should be inside
      expect(labelWrapper.querySelector('label')).not.toBeNull();
    });
  });

  describe('local stacking ownership', () => {
    // Input wrappers paint their surface above the attached status message
    // box through a local z-index, so that layer must be contained by a
    // Field-owned isolation boundary. Otherwise a detached or tooltip field
    // — whose input wrapper renders outside the attached-status wrapper —
    // competes with page-level stacking (AppShell sticky header, later
    // siblings) and can paint over unrelated chrome (#5689).
    it.each(['attached', 'detached', 'tooltip'] as const)(
      'isolates the field surface for the %s status variant',
      variant => {
        render(
          <Field
            label="Name"
            inputID="name-input"
            status={{type: 'error', message: 'Required'}}
            statusVariant={variant}
            data-testid="field">
            <input id="name-input" data-testid="control" />
          </Field>,
        );
        const field = screen.getByTestId('field');
        // The Field root is the isolation owner: it stays at its normal
        // parent paint level (it carries no positioning or z-index of its
        // own) while containing every local layer — the input wrapper's 1
        // and the attached status -1.
        expect(getComputedStyle(field).isolation).toBe('isolate');
        // Unpositioned and unranked — the owner never competes itself.
        expect(getComputedStyle(field).zIndex).toBe('');
      },
    );

    it('keeps a custom control without status isolated too', () => {
      render(
        <Field label="Name" inputID="name-input" data-testid="field">
          <input id="name-input" data-testid="control" />
        </Field>,
      );
      const field = screen.getByTestId('field');
      expect(getComputedStyle(field).isolation).toBe('isolate');
    });
  });
});

describe('Field in a narrow row', () => {
  it('lets a row shrink the field below its control width', () => {
    const {container} = render(
      <Field label="Search" inputID="search">
        <input id="search" />
      </Field>,
    );
    const root = container.querySelector('.astryx-field')!;
    expect(getComputedStyle(root).minWidth).toBe('0');
  });

  it('keeps an explicit width, which a row may still shrink', () => {
    const {container} = render(
      <Field label="Search" inputID="search" width={240}>
        <input id="search" />
      </Field>,
    );
    const root = container.querySelector('.astryx-field')!;
    expect(root.getAttribute('style')).toContain('240');
    expect(getComputedStyle(root).minWidth).toBe('0');
  });

  it('leaves horizontal-labels mode (display: contents) untouched', () => {
    const {container} = render(
      <FormLayoutContext value={{direction: 'horizontal-labels'}}>
        <Field label="Name" inputID="name">
          <input id="name" />
        </Field>
      </FormLayoutContext>,
    );
    const root = container.firstChild as HTMLElement;
    expect(getComputedStyle(root).display).toBe('contents');
    expect(getComputedStyle(root).minWidth).not.toBe('0');
  });
});
