// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import type {ReactElement} from 'react';
import {render, screen} from '@testing-library/react';
import {TextInput} from '../TextInput/TextInput';
import {TextArea} from '../TextArea/TextArea';
import {NumberInput} from '../NumberInput/NumberInput';
import {DateInput} from '../DateInput/DateInput';
import {DateRangeInput} from '../DateRangeInput/DateRangeInput';
import {TimeInput} from '../TimeInput/TimeInput';
import {FileInput} from '../FileInput/FileInput';
import type {FieldStatusVariant} from '../FieldStatus/FieldStatus';
import {getTooltipDescription} from '../__tests__/tooltipDescription';

// Every id referenced by an aria-describedby must resolve to an element in the
// document (WCAG 1.3.1) — a described-by pointing at a non-rendered node is a
// dangling reference. The tooltip variant is the interesting case: it swaps the
// message box for a tooltip layer, so the referenced ids change per variant.
function expectNoDanglingDescribedBy(root: HTMLElement) {
  for (const el of Array.from(root.querySelectorAll('[aria-describedby]'))) {
    const value = el.getAttribute('aria-describedby') ?? '';
    for (const id of value.split(/\s+/).filter(Boolean)) {
      expect(
        document.getElementById(id),
        `dangling aria-describedby id "${id}" on <${el.tagName.toLowerCase()}>`,
      ).not.toBeNull();
    }
  }
}

const VARIANTS: FieldStatusVariant[] = ['attached', 'detached', 'tooltip'];

const INPUTS: [string, (variant: FieldStatusVariant) => ReactElement][] = [
  [
    'TextInput',
    v => (
      <TextInput
        label="Field"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Message'}}
        statusVariant={v}
      />
    ),
  ],
  [
    'TextArea',
    v => (
      <TextArea
        label="Field"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Message'}}
        statusVariant={v}
      />
    ),
  ],
  [
    'NumberInput',
    v => (
      <NumberInput
        label="Field"
        value={undefined}
        onChange={() => {}}
        status={{type: 'error', message: 'Message'}}
        statusVariant={v}
      />
    ),
  ],
  [
    'DateInput',
    v => (
      <DateInput
        label="Field"
        value={undefined}
        onChange={() => {}}
        status={{type: 'error', message: 'Message'}}
        statusVariant={v}
      />
    ),
  ],
  [
    'DateRangeInput',
    v => (
      <DateRangeInput
        label="Field"
        value={null}
        onChange={() => {}}
        status={{type: 'error', message: 'Message'}}
        statusVariant={v}
      />
    ),
  ],
  [
    'TimeInput',
    v => (
      <TimeInput
        label="Field"
        value={undefined}
        onChange={() => {}}
        status={{type: 'error', message: 'Message'}}
        statusVariant={v}
      />
    ),
  ],
  [
    'FileInput',
    v => (
      <FileInput
        label="Field"
        value={null}
        onChange={() => {}}
        status={{type: 'error', message: 'Message'}}
        statusVariant={v}
      />
    ),
  ],
];

describe('useInputStatusIcon — no dangling aria-describedby (WCAG 1.3.1)', () => {
  for (const [name, make] of INPUTS) {
    for (const variant of VARIANTS) {
      it(`${name} / statusVariant="${variant}"`, () => {
        const {container} = render(make(variant));
        expectNoDanglingDescribedBy(container);
      });
    }
  }

  it('tooltip variant links the input to the rendered tooltip element', () => {
    render(
      <TextInput
        label="Field"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Message'}}
        statusVariant="tooltip"
      />,
    );
    const input = screen.getByRole('textbox');
    const tooltip = getTooltipDescription();
    expect(input.getAttribute('aria-describedby')).toContain(tooltip.id);
  });

  it('does not render a tooltip (or reference one) when there is no message', () => {
    // No message → the tooltip variant renders no tooltip layer and no
    // described-by should point at a non-existent status element.
    const {container} = render(
      <TextInput
        label="Field"
        value=""
        onChange={() => {}}
        status={{type: 'error'}}
        statusVariant="tooltip"
      />,
    );
    expect(
      screen.queryByRole('tooltip', {hidden: true}),
    ).not.toBeInTheDocument();
    expectNoDanglingDescribedBy(container);
  });

  it('keeps the tooltip status button interactive inside a non-interactive trailing slot', () => {
    // TextArea positions its trailing slot as an absolute overlay with
    // `pointer-events: none` (correct for the decorative spinner/icon it was
    // built for). The focusable status button owns its own interactivity so
    // hover still opens the tooltip there — keyboard focus always worked, the
    // pointer path did not until the button set `pointer-events: auto`.
    render(
      <TextArea
        label="Field"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Message'}}
        statusVariant="tooltip"
      />,
    );
    const statusButton = screen.getByRole('button', {name: 'Error details'});
    expect(statusButton).toHaveStyle({pointerEvents: 'auto'});
  });
});

describe('useInputStatusIcon — input-status-icon theme target', () => {
  // The stable theme target lands on the on-field status glyph itself, so a
  // theme can restyle (e.g. resize) just this icon via `defineTheme`. It is
  // rendered by the attached and tooltip variants; detached suppresses the
  // on-field icon in favour of the detached message box's leading glyph.
  const getStatusIcon = (root: HTMLElement): HTMLElement => {
    const icon = root.querySelector('.astryx-input-status-icon');
    if (icon == null) {
      throw new Error('status icon not found');
    }
    return icon as HTMLElement;
  };

  for (const variant of ['attached', 'tooltip'] as const) {
    it(`renders the target on the on-field icon (statusVariant="${variant}")`, () => {
      const {container} = render(
        <TextInput
          label="Field"
          value=""
          onChange={() => {}}
          status={{type: 'warning', message: 'Message'}}
          statusVariant={variant}
        />,
      );
      const icon = getStatusIcon(container);
      expect(icon).toHaveClass('astryx-input-status-icon');
      expect(icon).toHaveClass('astryx-icon');
      expect(icon).toHaveAttribute('data-size', 'md');
      expect(icon).toHaveAttribute('data-status', 'warning');
    });
  }

  it('reflects the status type per status', () => {
    const {container} = render(
      <TextInput
        label="Field"
        value=""
        onChange={() => {}}
        status={{type: 'success', message: 'Message'}}
        statusVariant="attached"
      />,
    );
    expect(getStatusIcon(container)).toHaveAttribute('data-status', 'success');
  });

  it('does not render the on-field target for the detached variant', () => {
    const {container} = render(
      <TextInput
        label="Field"
        value=""
        onChange={() => {}}
        status={{type: 'error', message: 'Message'}}
        statusVariant="detached"
      />,
    );
    expect(container.querySelector('.astryx-input-status-icon')).toBeNull();
  });
});
