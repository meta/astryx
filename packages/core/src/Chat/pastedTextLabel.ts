// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pastedTextLabel.ts
 * @input Pasted text and the provider-bound translator
 * @output formatPastedTextLabel, the line and character count label
 * @position Chat-internal helper shared by ChatPastedTextToken and the default
 *   token of useChatPasteAsToken, so the chip and the token read the same.
 */

import {registerEnglishFallback} from '../i18n/englishFallback';
import english from '../i18n/generated-english/Chat/pastedTextLabel.generated';
import type {TranslatorFn} from '../i18n/useTranslator';

registerEnglishFallback(english);

/** The count label for pasted text: "240 chars", or "3 lines, 302 chars". */
export function formatPastedTextLabel(text: string, t: TranslatorFn): string {
  return t('@astryx.chat.pastedText.label', {
    lines: text.split('\n').length,
    chars: text.length,
  });
}
