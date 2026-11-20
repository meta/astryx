// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FileInput.cutPrompt.test.tsx
 * @input Uses vitest, @testing-library/react, FileInput
 * @output Unit tests for the tooltip that shows an input-mode FileInput's
 *   prompt when the prompt is cut
 * @position Testing; validates that a cut prompt shows in full on keyboard
 *   focus on the trigger only, adds no description, closes when focus moves
 *   to the status button or a file is chosen, yields to the disabled reason,
 *   and that a prompt that fits shows no tooltip
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {FileInput} from './FileInput';
// Loaded up front, so the tooltip renders at once.
import '../Tooltip/Tooltip';

const PROMPT = 'Choose file';

/** Makes the prompt report text wider than its box, as a cut prompt is. */
function withCutPrompt(isCut: boolean) {
  const proto = window.HTMLElement.prototype;
  const original = {
    scrollWidth: Object.getOwnPropertyDescriptor(proto, 'scrollWidth'),
    offsetWidth: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'),
  };
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return isCut && this.textContent === PROMPT ? 400 : 100;
    },
  });
  Object.defineProperty(proto, 'offsetWidth', {
    configurable: true,
    get: () => 100,
  });
  return () => {
    if (original.scrollWidth) {
      Object.defineProperty(proto, 'scrollWidth', original.scrollWidth);
    }
    if (original.offsetWidth) {
      Object.defineProperty(proto, 'offsetWidth', original.offsetWidth);
    }
  };
}

let restore: (() => void) | null = null;

// Focus counts as keyboard focus only after a key press.
beforeEach(() => {
  fireEvent.keyDown(document.body, {key: 'Tab'});
});

afterEach(() => {
  restore?.();
  restore = null;
  vi.restoreAllMocks();
});

/** Focuses the trigger as a keyboard user does, with :focus-visible on. */
function focusByKeyboard(trigger: HTMLElement) {
  const realMatches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':focus-visible'
      ? true
      : realMatches.call(this, selector);
  });
  act(() => {
    trigger.focus();
  });
}

/** The tooltips that show the prompt; the field's status button keeps its own. */
function promptTooltips() {
  return screen
    .queryAllByRole('tooltip', {hidden: true})
    .filter(tooltip => tooltip.textContent?.includes(PROMPT));
}

async function expectNoTooltip() {
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
}

describe('FileInput cut prompt tooltip', () => {
  it('shows the full prompt on keyboard focus, with no description', async () => {
    restore = withCutPrompt(true);
    render(<FileInput label="Resume" value={null} onChange={() => {}} />);
    const trigger = screen.getByRole('button', {name: 'Resume'});
    const describedBy = trigger.getAttribute('aria-describedby');
    focusByKeyboard(trigger);
    await waitFor(() => {
      expect(screen.getByRole('tooltip', {hidden: true})).toHaveTextContent(
        PROMPT,
      );
    });
    expect(trigger.getAttribute('aria-describedby')).toBe(describedBy);
    expect(trigger).toHaveAccessibleName('Resume');
  });

  it('closes when focus leaves', async () => {
    restore = withCutPrompt(true);
    render(<FileInput label="Resume" value={null} onChange={() => {}} />);
    const trigger = screen.getByRole('button', {name: 'Resume'});
    focusByKeyboard(trigger);
    await waitFor(() => {
      expect(screen.queryByRole('tooltip', {hidden: true})).not.toBeNull();
    });
    act(() => {
      trigger.blur();
    });
    await waitFor(() => {
      expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    });
  });

  it('shows nothing on a mouse hover', async () => {
    restore = withCutPrompt(true);
    const {container} = render(
      <FileInput label="Resume" value={null} onChange={() => {}} />,
    );
    const field = container.querySelector<HTMLElement>('.astryx-file-input')!;
    act(() => {
      fireEvent.pointerEnter(field, {pointerType: 'mouse'});
      fireEvent.mouseEnter(field);
    });
    await expectNoTooltip();
  });

  it('shows nothing when the prompt fits', async () => {
    restore = withCutPrompt(false);
    render(<FileInput label="Resume" value={null} onChange={() => {}} />);
    focusByKeyboard(screen.getByRole('button', {name: 'Resume'}));
    await expectNoTooltip();
  });

  it('closes when focus moves to the status button', async () => {
    restore = withCutPrompt(true);
    render(
      <FileInput
        label="Resume"
        value={null}
        onChange={() => {}}
        status={{type: 'error', message: 'File must be under 10MB'}}
        statusVariant="tooltip"
      />,
    );
    focusByKeyboard(screen.getByRole('button', {name: 'Resume'}));
    await waitFor(() => {
      expect(promptTooltips()).toHaveLength(1);
    });
    act(() => {
      screen.getByRole('button', {name: 'Error details'}).focus();
    });
    await waitFor(() => {
      expect(promptTooltips()).toHaveLength(0);
    });
  });

  it('closes when a file is chosen while the field has focus', async () => {
    restore = withCutPrompt(true);
    const {rerender} = render(
      <FileInput label="Resume" value={null} onChange={() => {}} />,
    );
    focusByKeyboard(screen.getByRole('button', {name: 'Resume'}));
    await waitFor(() => {
      expect(screen.getByRole('tooltip', {hidden: true})).toHaveTextContent(
        PROMPT,
      );
    });
    const file = new File(['cv'], 'resume.pdf', {type: 'application/pdf'});
    rerender(<FileInput label="Resume" value={file} onChange={() => {}} />);
    await waitFor(() => {
      expect(promptTooltips()).toHaveLength(0);
    });
  });

  it('shows only the disabled reason when the field has one', async () => {
    restore = withCutPrompt(true);
    render(
      <FileInput
        label="Resume"
        value={null}
        onChange={() => {}}
        isDisabled
        disabledMessage="Uploads are closed"
      />,
    );
    focusByKeyboard(screen.getByRole('button', {name: 'Resume'}));
    await waitFor(() => {
      expect(screen.queryByRole('tooltip', {hidden: true})).not.toBeNull();
    });
    const tooltips = screen.getAllByRole('tooltip', {hidden: true});
    expect(tooltips).toHaveLength(1);
    expect(tooltips[0]).toHaveTextContent('Uploads are closed');
  });
});
