// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file linkForm.tsx
 * @input The address being entered, a refused-address message, and the
 *   caller's apply, remove, and cancel handlers
 * @output Exports LinkForm, the link URL form, and REMOVE_LINK_GLYPH
 * @position Internal to RichText. RichTextEditorToolbar's link popover and
 *   RichTextEditorLinkPopoverPlugin's Edit view both render this one form, so
 *   adding and editing a link look and work the same in both.
 */

import {useRef} from 'react';
import {IconButton} from '@astryxdesign/core/IconButton';
import {TextInput} from '@astryxdesign/core/TextInput';
import {HStack, StackItem} from '@astryxdesign/core/Layout';
import {Icon} from '@astryxdesign/core/Icon';
import {isImeKeyEvent} from '@astryxdesign/core/utils';
import {useTranslator} from '@astryxdesign/core/i18n';

/**
 * Remove's glyph. No shared icon name means "unlink", so it is fixed
 * component artwork until component icon slots exist.
 */
export const REMOVE_LINK_GLYPH = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true">
    <path
      d="M18 13l2-2a5 5 0 0 0-7-7l-2 2M6 11l-2 2a5 5 0 0 0 7 7l2-2M8 2v3M2 8h3M16 22v-3M22 16h-3"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export interface LinkFormProps {
  /** The field's value: the address being entered. */
  url: string;
  /** The message for a refused address, or empty. */
  error: string;
  /** Whether the form edits a link, which Remove then unlinks. */
  isEditing: boolean;
  /** The caller's control size, so the form's controls match it. */
  size: 'sm' | 'md' | 'lg';
  onUrlChange: (url: string) => void;
  /** Applies the field's address; false when it was refused. */
  onApply: () => boolean;
  onRemove: () => void;
  onCancel: () => void;
}

/**
 * The link form: one URL field, then Apply, Remove (only when editing a
 * link), and Cancel as icon buttons. Enter in the field
 * applies, and Escape anywhere in the form cancels. A refused address shows
 * the field's error status and keeps focus in the field.
 */
export function LinkForm({
  url,
  error,
  isEditing,
  size,
  onUrlChange,
  onApply,
  onRemove,
  onCancel,
}: LinkFormProps) {
  const t = useTranslator();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const apply = () => {
    if (!onApply()) {
      inputRef.current?.focus();
    }
  };
  const applyLabel = isEditing
    ? t('@astryx.richTextEditor.link.update')
    : t('@astryx.richTextEditor.link.add');
  const removeLabel = t('@astryx.richTextEditor.link.remove');
  const cancelLabel = t('@astryx.richTextEditor.link.cancel');
  return (
    <HStack
      gap={1}
      vAlign="start"
      onKeyDown={event => {
        // Escape that ends an IME composition is the input method's.
        if (event.key === 'Escape' && !isImeKeyEvent(event.nativeEvent)) {
          // Claimed here, so a surrounding layer's Escape handling leaves it
          // to Cancel, which also gives the editor back its selection.
          event.preventDefault();
          onCancel();
        }
      }}>
      <StackItem size="fill">
        <TextInput
          ref={inputRef}
          label={t('@astryx.richTextEditor.link.url')}
          isLabelHidden
          value={url}
          size={size}
          width="100%"
          autoComplete="url"
          // A URL keyboard on touch screens and no spelling marks under an
          // address. The field stays plain text, so a bare domain reaches
          // the link rules (sanitizeUrl), which make it an https link.
          inputMode="url"
          hasSpellCheck={false}
          placeholder={t('@astryx.richTextEditor.link.urlPlaceholder')}
          status={error ? {type: 'error', message: error} : undefined}
          statusVariant="detached"
          onChange={onUrlChange}
          onEnter={apply}
          onKeyDown={event => {
            // Applying hands focus to the editor, which must not receive the
            // rest of this Enter as a new line over the linked words.
            if (event.key === 'Enter' && !isImeKeyEvent(event.nativeEvent)) {
              event.preventDefault();
            }
          }}
        />
      </StackItem>
      <IconButton
        label={applyLabel}
        icon={<Icon icon="check" />}
        variant="ghost"
        size={size}
        tooltip={applyLabel}
        onClick={apply}
      />
      {isEditing && (
        <IconButton
          label={removeLabel}
          icon={REMOVE_LINK_GLYPH}
          variant="ghost"
          size={size}
          tooltip={removeLabel}
          onClick={onRemove}
        />
      )}
      <IconButton
        label={cancelLabel}
        icon={<Icon icon="close" />}
        variant="ghost"
        size={size}
        tooltip={cancelLabel}
        onClick={onCancel}
      />
    </HStack>
  );
}
