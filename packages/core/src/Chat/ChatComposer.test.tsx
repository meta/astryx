// Copyright (c) Meta Platforms, Inc. and affiliates.

import {beforeEach, describe, it, expect, vi} from 'vitest';
import {act, render, fireEvent, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {StrictMode, useEffect, useRef} from 'react';
import {ChatComposer} from './ChatComposer';
import {ChatComposerInput} from './ChatComposerInput';
import {useChatComposerContext} from './ChatContext';
import {createStaticSource} from '../Typeahead/createStaticSource';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import type * as AnnounceModule from '../hooks/useAnnounce';

const announce = vi.fn();
vi.mock('../hooks/useAnnounce', async importOriginal => ({
  ...(await importOriginal<typeof AnnounceModule>()),
  useAnnounce: () => announce,
}));

beforeEach(() => {
  __resetInteractionModalityForTest();
  announce.mockClear();
});

// The composer body — the elevated surface — is the div that wraps the input
// area (styles.body). A custom `input` slot renders inside the inputArea div,
// so the body is two ancestors up from the slot marker. Walking from a known
// marker keeps this independent of StyleX's generated class names.
function renderBodyClass(elevation?: 'none' | 'low'): string {
  const {container} = render(
    <ChatComposer
      onSubmit={() => {}}
      elevation={elevation}
      input={<div data-testid="composer-input-marker" />}
    />,
  );
  const marker = container.querySelector(
    '[data-testid="composer-input-marker"]',
  )!;
  const inputArea = marker.parentElement!;
  const body = inputArea.parentElement!;
  return body.className;
}

describe('ChatComposer elevation', () => {
  it('applies a distinct body class for each supported level', () => {
    expect(renderBodyClass('none')).not.toBe(renderBodyClass('low'));
  });

  it("defaults to 'low' (preserves the raised look)", () => {
    expect(renderBodyClass(undefined)).toBe(renderBodyClass('low'));
  });
});

describe('ChatComposer focus indication', () => {
  function renderComposer() {
    const result = render(
      <ChatComposer onSubmit={() => {}} value="Ready to send" />,
    );
    const editor = result.container.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    )!;
    const body = editor.parentElement!.parentElement!.parentElement!;
    const sendButton =
      result.container.querySelector<HTMLButtonElement>('button')!;
    return {...result, body, editor, sendButton};
  }

  it('adds the composer ring when keyboard focus enters the editor', () => {
    const {body, editor} = renderComposer();
    const restingClass = body.className;

    fireEvent.keyDown(document, {key: 'Tab'});
    fireEvent.focus(editor);

    expect(body.className).not.toBe(restingClass);
  });

  it('adds the composer ring when Tab enters a disabled trigger editor', async () => {
    const user = userEvent.setup();
    render(
      <ChatComposer
        isDisabled
        onSubmit={() => {}}
        input={
          <ChatComposerInput
            triggers={[
              {
                character: '@',
                searchSource: createStaticSource([]),
                onSelect: () => '',
              },
            ]}
          />
        }
      />,
    );
    const editor = screen.getByRole('combobox');
    const body = editor.parentElement!.parentElement!.parentElement!;
    const restingClass = body.className;
    expect(editor).toHaveAttribute('aria-disabled', 'true');

    await user.tab();

    expect(editor).toHaveFocus();
    expect(body.className).not.toBe(restingClass);
  });

  it('does not add the composer ring when pointer focus enters the editor', () => {
    const {body, editor} = renderComposer();
    const restingClass = body.className;

    fireEvent.pointerDown(editor);
    fireEvent.focus(editor);

    expect(body.className).toBe(restingClass);
  });

  it('shows the composer ring for programmatic editor focus after keyboard input', () => {
    const {body, editor} = renderComposer();
    const restingClass = body.className;

    fireEvent.keyDown(document, {key: 'Tab'});
    act(() => editor.focus());

    expect(body.className).not.toBe(restingClass);
  });

  it('hides the composer ring for programmatic editor focus after pointer input', () => {
    const {body, editor} = renderComposer();
    const restingClass = body.className;

    fireEvent.pointerDown(document.body);
    act(() => editor.focus());

    expect(body.className).toBe(restingClass);
  });

  it('removes the composer ring when the focused editor receives a pointer press', () => {
    const {body, editor} = renderComposer();
    const restingClass = body.className;

    fireEvent.keyDown(document, {key: 'Tab'});
    fireEvent.focus(editor);
    expect(body.className).not.toBe(restingClass);

    fireEvent.pointerDown(editor);
    expect(body.className).toBe(restingClass);
  });

  it('leaves focus indication on an internal button instead of the composer', () => {
    const {body, sendButton} = renderComposer();
    const restingClass = body.className;

    fireEvent.keyDown(document, {key: 'Tab'});
    fireEvent.focus(sendButton);

    expect(body.className).toBe(restingClass);
  });
});

describe('ChatComposer disabled contract', () => {
  it('exposes disabled state on the default textbox and clears it when enabled', () => {
    const {getByRole, rerender} = render(
      <ChatComposer onSubmit={() => {}} isDisabled />,
    );

    expect(getByRole('textbox')).toHaveAttribute('aria-disabled', 'true');

    rerender(<ChatComposer onSubmit={() => {}} />);
    expect(getByRole('textbox')).not.toHaveAttribute('aria-disabled');
  });

  it('keeps the Stop action pointer-operable while editing is disabled', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    const {getByRole} = render(
      <ChatComposer
        onSubmit={() => {}}
        onStop={onStop}
        isDisabled
        isStopShown
      />,
    );

    await user.click(getByRole('button', {name: 'Stop'}));

    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

// A custom input that participates in the composer's composition contract:
// reads value/submit from the exported context, and registers a focus control
// so the shell can drive body-click-to-focus without knowing its DOM shape.
function CustomContextInput({focusSpy}: {focusSpy: () => void}) {
  const ctx = useChatComposerContext();
  const ref = useRef<HTMLInputElement>(null);
  const controlRef = ctx?.inputControlRef;
  useEffect(() => {
    if (!controlRef) {
      return;
    }
    controlRef.current = {
      focus: () => {
        focusSpy();
        ref.current?.focus();
      },
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef, focusSpy]);
  return (
    <input
      ref={ref}
      data-testid="custom-input"
      value={ctx?.value ?? ''}
      placeholder={ctx?.placeholder}
      disabled={ctx?.isDisabled}
      onChange={e => ctx?.onChange(e.target.value)}
    />
  );
}

function ContextSubmitButton() {
  const ctx = useChatComposerContext();
  return (
    <button
      type="button"
      onClick={() => ctx?.onSubmit('  custom input draft  ')}>
      Submit custom input
    </button>
  );
}

describe('ChatComposer input composition contract', () => {
  it('submits the value supplied through the public context operation', () => {
    const onSubmit = vi.fn();
    const {getByRole} = render(
      <ChatComposer
        onSubmit={onSubmit}
        value="captured composer draft"
        input={<ContextSubmitButton />}
      />,
    );

    fireEvent.click(getByRole('button', {name: 'Submit custom input'}));

    expect(onSubmit).toHaveBeenCalledWith('custom input draft');
  });

  it('exposes value/onChange/placeholder/isDisabled to a custom input via context', () => {
    const {getByTestId} = render(
      <ChatComposer
        onSubmit={() => {}}
        value="hello"
        placeholder="Say something"
        isDisabled
        input={<CustomContextInput focusSpy={() => {}} />}
      />,
    );
    const input = getByTestId('custom-input') as HTMLInputElement;
    expect(input.value).toBe('hello');
    expect(input.placeholder).toBe('Say something');
    expect(input.disabled).toBe(true);
  });

  it('focuses a custom input via its registered control on body click', () => {
    const focusSpy = vi.fn();
    const {getByTestId} = render(
      <ChatComposer
        onSubmit={() => {}}
        input={<CustomContextInput focusSpy={focusSpy} />}
      />,
    );
    const marker = getByTestId('custom-input');
    const body = marker.parentElement!.parentElement!;
    fireEvent.click(body);
    expect(focusSpy).toHaveBeenCalled();
  });

  it('falls back to focusing a bare textarea when no control is registered', () => {
    const {getByTestId} = render(
      <ChatComposer
        onSubmit={() => {}}
        input={<textarea data-testid="bare-textarea" />}
      />,
    );
    const textarea = getByTestId('bare-textarea') as HTMLTextAreaElement;
    const body = textarea.parentElement!.parentElement!;
    fireEvent.click(body);
    expect(document.activeElement).toBe(textarea);
  });
});

describe('ChatComposer status announcement (spec:AST-086)', () => {
  const composer = (status?: {type: 'error' | 'warning'; message?: string}) => (
    <ChatComposer onSubmit={() => {}} input={<div />} status={status} />
  );

  it('shows the status message but carries no live role (FR2)', () => {
    render(composer({type: 'error', message: 'Send failed'}));
    const message = screen.getByText('Send failed');
    expect(
      message.closest('[role="alert"], [role="status"], [aria-live]'),
    ).toBeNull();
  });

  it('announces an error assertively and a warning politely (FR5)', () => {
    const {rerender} = render(composer());
    expect(announce).not.toHaveBeenCalled();
    rerender(composer({type: 'error', message: 'Send failed'}));
    rerender(composer({type: 'warning', message: 'Offline'}));
    expect(announce.mock.calls).toEqual([
      ['Send failed', 'assertive'],
      ['Offline', 'polite'],
    ]);
  });

  it('announces a mounted status once, even under StrictMode (FR6)', () => {
    const status = {type: 'error' as const, message: 'Send failed'};
    const {rerender} = render(<StrictMode>{composer(status)}</StrictMode>);
    rerender(<StrictMode>{composer({...status})}</StrictMode>);
    expect(announce.mock.calls).toEqual([['Send failed', 'assertive']]);
  });

  it('announces the same message again after the status clears (FR6)', () => {
    const status = {type: 'error' as const, message: 'Send failed'};
    const {rerender} = render(composer(status));
    rerender(composer());
    rerender(composer(status));
    expect(announce.mock.calls).toEqual([
      ['Send failed', 'assertive'],
      ['Send failed', 'assertive'],
    ]);
  });

  it('announces nothing for a status without a message', () => {
    render(composer({type: 'warning'}));
    expect(announce).not.toHaveBeenCalled();
  });

  it('is silent for a status shown while the page loads, then announces a later one (FR11)', () => {
    let readyState: DocumentReadyState = 'loading';
    const spy = vi
      .spyOn(document, 'readyState', 'get')
      .mockImplementation(() => readyState);
    try {
      const {rerender} = render(composer({type: 'error', message: 'Offline'}));
      expect(announce).not.toHaveBeenCalled();
      readyState = 'complete';
      rerender(composer({type: 'error', message: 'Send failed'}));
      expect(announce.mock.calls).toEqual([['Send failed', 'assertive']]);
    } finally {
      spy.mockRestore();
    }
  });

  it('announces only the message, not the decorative icon (FR12)', () => {
    const {rerender} = render(composer());
    rerender(composer({type: 'warning', message: 'Offline'}));
    expect(announce.mock.calls).toEqual([['Offline', 'polite']]);
  });
});
