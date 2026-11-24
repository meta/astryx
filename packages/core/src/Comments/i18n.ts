// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file i18n.ts
 * @input Uses the TranslatorFn type and the module's English fallback
 * @output Exports reactionDescription
 * @position Localized names for the Comments family's default reactions
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Comments/CommentsTypes.ts (DEFAULT_COMMENT_REACTIONS)
 * - /packages/core/locales/en.json (@astryx.comments.reaction*)
 */

import {registerEnglishFallback} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Comments/i18n.generated';
import type {TranslatorFn} from '../i18n/useTranslator';
import type {CommentReactionOption} from './CommentsTypes';

registerEnglishFallback(english);

/* Catalog keys for the names of DEFAULT_COMMENT_REACTIONS, by reaction key. */
const DEFAULT_REACTION_NAME_KEYS: Readonly<Record<string, string>> = {
  like: '@astryx.comments.reactionLike',
  love: '@astryx.comments.reactionLove',
  laugh: '@astryx.comments.reactionLaugh',
  wow: '@astryx.comments.reactionWow',
  sad: '@astryx.comments.reactionSad',
  celebrate: '@astryx.comments.reactionCelebrate',
};

/**
 * A reaction's human-readable name: the host's `label`, else the localized
 * name of a default reaction, else its emoji.
 */
export function reactionDescription(
  t: TranslatorFn,
  reaction: Pick<CommentReactionOption, 'key' | 'emoji' | 'label'>,
): string {
  if (reaction.label != null && reaction.label !== '') {
    return reaction.label;
  }
  const key = DEFAULT_REACTION_NAME_KEYS[reaction.key];
  return key != null ? t(key) : reaction.emoji;
}
