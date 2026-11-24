// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CommentMarkdown.tsx
 * @input Uses React, StyleX, Markdown, Lightbox, ChatTokenizedText, Avatar
 * @output Exports CommentMarkdown (a comment body's Markdown, with images that
 *   open in a Lightbox and agent commands shown as chips) and agentToken
 * @position Internal body renderer shared by comment rows and the edit
 *   history dialog
 */

import {createContext, use, useMemo, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Avatar} from '../Avatar/Avatar';
import {ChatTokenizedText} from '../Chat/ChatTokenizedText';
import type {ChatComposerToken} from '../Chat/ChatComposerInput';
import {Lightbox, type LightboxMedia} from '../Lightbox/Lightbox';
import {Markdown, type MarkdownInlinePlugin} from '../Markdown/Markdown';
import type {MarkdownPluginEntry} from '../Markdown/plugins/protocol';
import {spacingVars} from '../theme/tokens.stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import type {CommentAgentCommand} from './CommentsTypes';

const styles = stylex.create({
  image: {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    marginBlock: spacingVars['--spacing-2'],
    cursor: {
      default: 'zoom-in',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
});

/** An agent's chip: what the composer's `/` menu inserts, and what a posted
 *  comment shows in place of the command. */
export function agentToken(agent: CommentAgentCommand): ChatComposerToken {
  return {
    value: `/${agent.command}`,
    label: agent.name,
    variant: 'info',
    icon: (
      <Avatar
        name={agent.name}
        src={agent.logoUrl}
        size="xsm"
        shape="rounded"
        tooltip={false}
      />
    ),
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Shows `/<command>` in a posted comment as the agent's chip. */
function agentCommandPlugin(
  agents: ReadonlyArray<CommentAgentCommand>,
): MarkdownInlinePlugin {
  const byCommand = new Map(agents.map(agent => [agent.command, agent]));
  return {
    pattern: new RegExp(
      `(^|\\s)/(${agents.map(agent => escapeRegExp(agent.command)).join('|')})(?=\\s|$)`,
      'g',
    ),
    render: (match, key) => {
      const agent = byCommand.get(match[2] ?? '');
      if (agent == null) {
        return match[0];
      }
      const token = agentToken(agent);
      // Set in the line as the composer sets it: centered on the text.
      return (
        <span key={key}>
          {match[1]}
          <ChatTokenizedText
            tokens={[token]}
            data-agent-command={agent.command}>
            {token.value}
          </ChatTokenizedText>
        </span>
      );
    },
  };
}

/* One Lightbox per body, opened at whichever of its images is pressed. */
const CommentImageContext = createContext<
  ((media: LightboxMedia) => void) | null
>(null);
CommentImageContext.displayName = 'CommentImageContext';

function CommentImage({src, alt}: {src: string; alt: string}) {
  const openImage = use(CommentImageContext);
  const open = () => openImage?.({src, alt});
  return (
    <img
      src={src}
      alt={alt}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      data-comment-image="lightbox"
      {...stylex.props(styles.image, focusOutlineStyles.focusVisible)}
      onClick={event => {
        // An image is its own control, not a press on the thread.
        event.stopPropagation();
        open();
      }}
      onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        open();
      }}
    />
  );
}

const COMMENT_MARKDOWN_COMPONENTS = {image: CommentImage};

const NO_INLINE_PLUGINS: ReadonlyArray<MarkdownInlinePlugin> = [];
const NO_PLUGINS: ReadonlyArray<MarkdownPluginEntry> = [];

/** A comment body: compact Markdown whose images open in a Lightbox. */
export function CommentMarkdown({
  body,
  agentCommands,
  plugins = NO_PLUGINS,
  inlinePlugins = NO_INLINE_PLUGINS,
}: {
  body: string;
  agentCommands: ReadonlyArray<CommentAgentCommand>;
  plugins?: ReadonlyArray<MarkdownPluginEntry>;
  inlinePlugins?: ReadonlyArray<MarkdownInlinePlugin>;
}) {
  const allInlinePlugins = useMemo(
    () =>
      agentCommands.length === 0
        ? [...inlinePlugins]
        : [...inlinePlugins, agentCommandPlugin(agentCommands)],
    [agentCommands, inlinePlugins],
  );
  const [openedImage, setOpenedImage] = useState<LightboxMedia | null>(null);
  return (
    <CommentImageContext value={setOpenedImage}>
      <Markdown
        density="compact"
        plugins={plugins}
        inlinePlugins={allInlinePlugins}
        autolink="gfm"
        components={COMMENT_MARKDOWN_COMPONENTS}>
        {body}
      </Markdown>
      {openedImage != null && (
        <Lightbox
          isOpen
          media={openedImage}
          hasZoom
          onOpenChange={isOpen => {
            if (!isOpen) {
              setOpenedImage(null);
            }
          }}
        />
      )}
    </CommentImageContext>
  );
}
