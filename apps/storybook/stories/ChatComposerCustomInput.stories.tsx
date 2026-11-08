// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useEffect, useRef, useState} from 'react';
import {ChatComposer, useChatComposerContext} from '@astryxdesign/core/Chat';

// Lexical (optional peer of the OSS rich-text work) — imported directly here to
// demonstrate that an arbitrary editor, with its own value/focus model, can be
// a first-class composer input purely through the public composition contract.
import {LexicalComposer} from '@lexical/react/LexicalComposer';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {PlainTextPlugin} from '@lexical/react/LexicalPlainTextPlugin';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';
import {LexicalErrorBoundary} from '@lexical/react/LexicalErrorBoundary';
import {OnChangePlugin} from '@lexical/react/LexicalOnChangePlugin';
import {$getRoot, type EditorState} from 'lexical';

const meta: Meta<typeof ChatComposer> = {
  title: 'Core/ChatComposer',
  component: ChatComposer,
  parameters: {
    docs: {
      description: {
        component:
          'The composer body is a shell of slots; the input is just one of them. ' +
          'Any input can be a first-class citizen by wiring to the public ' +
          'composition contract: read `value`/`onChange`/`onSubmit`/`placeholder`/' +
          '`isDisabled` from `useChatComposerContext()`, and register a focus ' +
          'control on `inputControlRef` so clicking empty space in the body focuses ' +
          'it — no matter the input’s DOM shape. `ChatSendButton` reads the same ' +
          'context, so the shell’s send button “just works”.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof ChatComposer>;

// =============================================================================
// Example 1 — a plain <textarea> as a first-class composer input
// =============================================================================

/**
 * A bare controlled `<textarea>` in the input slot. It reads state from
 * `useChatComposerContext()`, submits on Enter, and registers a focus control
 * so body-click-to-focus works. No `ChatComposerInput`, no contentEditable.
 */
function TextareaInput() {
  const ctx = useChatComposerContext();
  const ref = useRef<HTMLTextAreaElement>(null);

  // Register how the shell should focus us (body-click-to-focus).
  const controlRef = ctx?.inputControlRef;
  useEffect(() => {
    if (!controlRef) {
      return;
    }
    controlRef.current = {focus: () => ref.current?.focus()};
    return () => {
      controlRef.current = null;
    };
  }, [controlRef]);

  if (!ctx) {
    return null;
  }
  return (
    <textarea
      ref={ref}
      rows={1}
      value={ctx.value}
      placeholder={ctx.placeholder}
      disabled={ctx.isDisabled}
      onChange={e => ctx.onChange(e.target.value)}
      onKeyDown={e => {
        // Enter submits; Shift+Enter inserts a newline. IME-safe.
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (ctx.canSend) {
            ctx.onSubmit(ctx.value);
          }
        }
      }}
      style={{
        all: 'unset',
        width: '100%',
        resize: 'none',
        fontFamily: 'var(--font-family-body)',
        fontSize: 'var(--text-body-size)',
        lineHeight: 'var(--text-body-leading)',
        color: 'var(--color-text-primary)',
        caretColor: 'var(--color-accent)',
      }}
    />
  );
}

export const PlainTextarea: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <ChatComposer
        value={value}
        onChange={setValue}
        onSubmit={submitted => {
          console.log('Submit:', submitted);
          setValue('');
        }}
        placeholder="Plain textarea input…"
        input={<TextareaInput />}
      />
    );
  },
};

// =============================================================================
// Example 2 — a raw Lexical editor as a first-class composer input
// =============================================================================

/** Bridges Lexical's EditorState to the composer's string value + focus. */
function LexicalBridge() {
  const ctx = useChatComposerContext();
  const [editor] = useLexicalComposerContext();

  // Register focus with the shell (Lexical owns focus, not a raw DOM node).
  const controlRef = ctx?.inputControlRef;
  useEffect(() => {
    if (!controlRef) {
      return;
    }
    controlRef.current = {focus: () => editor.focus()};
    return () => {
      controlRef.current = null;
    };
  }, [controlRef, editor]);

  const handleChange = (state: EditorState) => {
    state.read(() => ctx?.onChange($getRoot().getTextContent()));
  };

  return <OnChangePlugin onChange={handleChange} ignoreSelectionChange />;
}

function LexicalInput() {
  const ctx = useChatComposerContext();
  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'astryx-composer-example',
        onError: (error: Error) => {
          throw error;
        },
      }}>
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            aria-label={ctx?.placeholder ?? 'Message'}
            onKeyDown={e => {
              // Enter submits; Shift+Enter newline; never mid-composition.
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                if (ctx?.canSend) {
                  ctx.onSubmit(ctx.value);
                }
              }
            }}
            style={{
              outline: 'none',
              minHeight: '1.5rem',
              fontFamily: 'var(--font-family-body)',
              fontSize: 'var(--text-body-size)',
              lineHeight: 'var(--text-body-leading)',
              color: 'var(--color-text-primary)',
              caretColor: 'var(--color-accent)',
            }}
          />
        }
        placeholder={
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-family-body)',
              fontSize: 'var(--text-body-size)',
              lineHeight: 'var(--text-body-leading)',
            }}>
            {ctx?.placeholder}
          </div>
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <LexicalBridge />
    </LexicalComposer>
  );
}

export const RawLexical: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <ChatComposer
        value={value}
        onChange={setValue}
        onSubmit={submitted => {
          console.log('Submit:', submitted);
          setValue('');
        }}
        placeholder="Raw Lexical editor input…"
        input={
          <div style={{position: 'relative', width: '100%'}}>
            <LexicalInput />
          </div>
        }
      />
    );
  },
};
