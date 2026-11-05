// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RichTextEditorAutoLinkPlugin.tsx
 * @input Uses `@lexical/react/LexicalAutoLinkPlugin` (`AutoLinkPlugin`,
 *   `createLinkMatcherWithRegExp`) and the shared URL/email matchers from
 *   `linkUtils`.
 * @output Exports `RichTextEditorAutoLinkPlugin` and its props type, plus the
 *   default `DEFAULT_LINK_MATCHERS`.
 * @position @astryxdesign/richtext. Drop into RichTextEditor's `plugins` slot to
 *   auto-linkify URLs and emails as they are typed or pasted. Requires
 *   `AutoLinkNode` to be registered (it is, by default).
 *
 * SYNC: When modified, update:
 * - /packages/richtext/src/index.ts (exports / barrel)
 * - /packages/richtext/src/RichTextEditor.doc.mjs (usage notes)
 * - /packages/richtext/src/RichTextEditor.test.tsx (tests)
 * - /apps/storybook/stories/RichTextEditor.stories.tsx (story)
 *
 * NOTE: `lexical` and `@lexical/*` are OPTIONAL peer dependencies — install them
 * to use this.
 *
 * COMPATIBILITY: the plugin is deliberately a thin pass-through so an
 * application with its own link conventions can adopt it without forking. It
 * uses the stock matcher shape (`createLinkMatcherWithRegExp` + `attributes`)
 * and new-tab defaults, so a consumer supplies a richer matcher set — an
 * application-specific identifier or ticket syntax, say — through the
 * `matchers` prop without changing the contract. An application needing a
 * hardened transform (expanded separators, code-block exclusion) substitutes
 * its own plugin in the same slot; astryx stays on the upstream
 * `AutoLinkPlugin`.
 */

import {
  AutoLinkPlugin,
  createLinkMatcherWithRegExp,
  type LinkMatcher,
} from '@lexical/react/LexicalAutoLinkPlugin';
import {URL_MATCHER, EMAIL_MATCHER, sanitizeUrl} from './linkUtils';

/**
 * Attributes written onto every auto-created link so it opens in a new tab.
 * `rel="noopener noreferrer"` is required whenever `target="_blank"` is set, to
 * prevent reverse-tabnabbing.
 */
export const NEW_TAB_LINK_ATTRIBUTES = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;

/**
 * Default matchers: bare URLs (defaulting to `https://` when scheme-less) and
 * email addresses (as `mailto:` links). Both carry {@link NEW_TAB_LINK_ATTRIBUTES}.
 * URLs are passed through {@link sanitizeUrl} so only http/https/mailto/tel
 * schemes are ever written.
 */
export const DEFAULT_LINK_MATCHERS: LinkMatcher[] = [
  text => {
    const match = createLinkMatcherWithRegExp(URL_MATCHER, url =>
      sanitizeUrl(url),
    )(text);
    return match ? {...match, attributes: NEW_TAB_LINK_ATTRIBUTES} : null;
  },
  text => {
    const match = createLinkMatcherWithRegExp(
      EMAIL_MATCHER,
      email => `mailto:${email}`,
    )(text);
    return match ? {...match, attributes: NEW_TAB_LINK_ATTRIBUTES} : null;
  },
];

export interface RichTextEditorAutoLinkPluginProps {
  /**
   * Link matchers to use. Defaults to {@link DEFAULT_LINK_MATCHERS} (URLs +
   * emails, opening in a new tab). Provide a custom array to recognize
   * additional patterns (e.g. product-specific shortform references) — build
   * each with `createLinkMatcherWithRegExp` from
   * `@lexical/react/LexicalAutoLinkPlugin`.
   */
  matchers?: LinkMatcher[];
  /**
   * Called when a link is created, updated, or removed by auto-linking.
   * Receives the new URL (or `null` when removed) and the previous URL.
   */
  onChange?: (url: string | null, prevUrl: string | null) => void;
}

/**
 * Automatically converts typed/pasted URLs and email addresses into links.
 * Render it inside the editor's `plugins` slot — it reaches the editor via
 * `useLexicalComposerContext()`, so it must live within the editor's
 * `LexicalComposer`. Requires `AutoLinkNode` (registered by default).
 *
 * @example
 * ```
 * import {RichTextEditor, RichTextEditorAutoLinkPlugin} from '@astryxdesign/richtext';
 *
 * <RichTextEditor
 *   label="Notes"
 *   plugins={<RichTextEditorAutoLinkPlugin />}
 * />
 * ```
 */
export function RichTextEditorAutoLinkPlugin({
  matchers = DEFAULT_LINK_MATCHERS,
  onChange,
}: RichTextEditorAutoLinkPluginProps) {
  return <AutoLinkPlugin matchers={matchers} onChange={onChange} />;
}

RichTextEditorAutoLinkPlugin.displayName = 'RichTextEditorAutoLinkPlugin';
