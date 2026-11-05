// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState, type CSSProperties} from 'react';

import {
  HStack,
  VStack,
  StackItem,
  Layout,
  LayoutContent,
} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {
  ChatComposer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatMessageMetadata,
  ChatSystemMessage,
  ChatTokenizedText,
  ChatToolCalls,
} from '@astryxdesign/core/Chat';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Card} from '@astryxdesign/core/Card';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Section} from '@astryxdesign/core/Section';
import {Markdown} from '@astryxdesign/core/Markdown';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {Token} from '@astryxdesign/core/Token';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {useResizable, ResizeHandle} from '@astryxdesign/core/Resizable';

import {
  DocumentTextIcon,
  ClipboardDocumentIcon,
  ShareIcon,
  AtSymbolIcon,
  PaperClipIcon,
  XMarkIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

// Below this width the split-pane collapses to a single chat column. Shared by
// the CSS container query and the JS check in openArtifact so they can't drift.
const MOBILE_MAX_WIDTH = 767;

const root: CSSProperties = {
  height: '100dvh',
  width: '100%',
  containerType: 'inline-size',
  containerName: 'artifact',
};
const chatColumn: CSSProperties = {
  flex: 1,
  width: '100%',
  minWidth: 0,
  height: '100%',
};
const chatLayout: CSSProperties = {
  flex: 1,
  minHeight: 0,
};
const artifactScroll: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
};
const articleBody: CSSProperties = {
  maxWidth: 720,
  marginInline: 'auto',
};

// Runtime width for the artifact panel, passed in via the --artifact-panel-width
// custom property so the MOBILE container query can still override it to 100%
// (an inline `width` would beat the class rule). The container query lives in a
// plain <style> tag below so it needs NO CSS compiler.
const artifactPanelWidthVar = (size: number | string): CSSProperties =>
  ({
    '--artifact-panel-width': typeof size === 'number' ? `${size}px` : size,
  }) as CSSProperties;

const AI_CHAT_CSS = `
.ai-chat-resize-handle {
  display: flex;
}
.ai-chat-artifact-panel {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  width: var(--artifact-panel-width);
  flex-shrink: 0;
}
@container artifact (max-width: ${MOBILE_MAX_WIDTH}px) {
  .ai-chat-resize-handle {
    display: none;
  }
  .ai-chat-artifact-panel {
    display: none;
    width: 100%;
    flex-shrink: 1;
  }
}
`;

// Artifact content

const MENTION_TOKENS = [
  {value: '@agent', label: '@Agent', variant: 'blue' as const},
];

const ARTIFACT_TITLE = 'JWT Token Refresh: Design & Rollout';

const ARTIFACT_SUBTITLE = 'Document · Updated just now';

const ARTIFACT_CONTENT = `## Overview

Our API gateway authenticates every request with a short-lived JWT access token. Until now, an expired token meant an immediate \`401\` — even when the user still held a valid refresh token. This document describes the silent-refresh flow we just shipped and how we're rolling it out.

## The Problem

Token validation ran **before** any refresh logic, so the middleware rejected expired tokens outright:

1. A request arrives with an expired access token
2. \`validateToken()\` throws \`TokenExpiredError\`
3. The catch block returns \`401\` — \`refreshToken()\` is never reached

The result was users getting logged out whenever an access token lapsed mid-session.

## The Fix

The middleware now catches \`TokenExpiredError\` specifically and attempts a silent refresh before rejecting. On success it reissues an access token and continues the request; on failure it falls back to \`401\`.

- **Transparent** — valid sessions never see an interruption
- **Safe** — a missing or invalid refresh token still returns \`401\`
- **Cheap** — refresh only runs on the expiry path, not on every request

## Testing

The refresh path is covered end to end:

| Scenario | Expected |
|----------|----------|
| Valid token passes through | \`200\` |
| Expired token, valid refresh | \`200\` + new access token |
| Expired token, invalid refresh | \`401\` |
| Malformed token | \`401\` |

## Rollout & Monitoring

1. Ship behind the \`silent_refresh\` flag at 5% of traffic
2. Watch the \`auth.refresh.success\` and \`auth.refresh.failure\` counters
3. Alert if the failure rate exceeds **2%** over any 5-minute window
4. Ramp to 100% once metrics hold steady for 24 hours`;

// Artifact subviews

// Header actions: version menu, copy, share. Pass `onClose` for the desktop
// close button. A fragment so each control is a direct child of the toolbar.
function ArtifactActions({onClose}: {onClose?: () => void}) {
  return (
    <>
      <DropdownMenu
        button={{
          label: 'v2',
          variant: 'ghost',
          size: 'sm',
        }}
        items={[{label: 'v2 (current)'}, {label: 'v1'}]}
      />
      <Button
        label="Copy"
        variant="ghost"
        size="sm"
        icon={<Icon icon={ClipboardDocumentIcon} size="sm" />}
        isIconOnly
      />
      <Button
        label="Share"
        variant="ghost"
        size="sm"
        icon={<Icon icon={ShareIcon} size="sm" />}
        isIconOnly
      />
      {onClose != null && (
        <Button
          label="Close document"
          variant="ghost"
          size="sm"
          icon={<Icon icon={XMarkIcon} size="sm" />}
          isIconOnly
          onClick={onClose}
        />
      )}
    </>
  );
}

// Mobile variant: the actions collapse into an overflow menu.
function MobileArtifactActions() {
  return (
    <MoreMenu
      label="Document actions"
      size="sm"
      items={[
        {
          type: 'section',
          title: 'Version',
          items: [
            {label: 'v2 (current)', onClick: () => {}},
            {label: 'v1', onClick: () => {}},
          ],
        },
        {type: 'divider'},
        {label: 'Copy', icon: ClipboardDocumentIcon},
        {label: 'Share', icon: ShareIcon},
      ]}
    />
  );
}

// Scrollable artifact body — the formatted document.
function ArtifactBody() {
  return (
    <Section variant="transparent" style={artifactScroll}>
      <VStack gap={2} style={articleBody}>
        <Heading level={1}>{ARTIFACT_TITLE}</Heading>
        <Markdown>{ARTIFACT_CONTENT}</Markdown>
      </VStack>
    </Section>
  );
}

// In-message card that opens the artifact panel/dialog.
function ArtifactCard({onOpen}: {onOpen: () => void}) {
  return (
    <ClickableCard
      label={`Open ${ARTIFACT_TITLE}`}
      onClick={onOpen}
      variant="muted"
      padding={3}
      maxWidth={360}>
      <HStack gap={3} vAlign="center" width="100%">
        <Icon icon={DocumentTextIcon} size="md" color="secondary" />
        <StackItem size="fill">
          <VStack gap={0}>
            <Text type="label" weight="semibold">
              {ARTIFACT_TITLE}
            </Text>
            <Text type="supporting" color="secondary">
              Document
            </Text>
          </VStack>
        </StackItem>
        <Icon icon={ChevronRightIcon} size="sm" color="secondary" />
      </HStack>
    </ClickableCard>
  );
}

// Main component

export default function AIChatConversationTemplate() {
  const [composerMode, setComposerMode] = useState('ask');
  // Mobile shows the artifact as a full-screen dialog; desktop as a side panel.
  const [isArtifactDialogOpen, setIsArtifactDialogOpen] = useState(false);
  const [isArtifactOpen, setIsArtifactOpen] = useState(true);
  const rootRef = useRef<HTMLElement>(null);
  const artifactResize = useResizable({
    defaultSize: 640,
    minSize: 480,
    maxSize: 960,
    autoSaveId: 'ai-chat-artifact-panel',
  });

  // Match the container-query breakpoint by measuring the root, not the viewport.
  const openArtifact = () => {
    const width = rootRef.current?.offsetWidth ?? Infinity;
    if (width <= MOBILE_MAX_WIDTH) {
      setIsArtifactDialogOpen(true);
    } else {
      setIsArtifactOpen(true);
    }
  };

  return (
    <VStack ref={rootRef} style={root}>
      <style>{AI_CHAT_CSS}</style>
      <Layout
        height="fill"
        content={
          <LayoutContent padding={0}>
            <HStack height="100%">
              {/* Chat column — flexes to fill the space the artifact leaves */}
              <VStack style={chatColumn}>
                <ChatLayout
                  density="spacious"
                  style={chatLayout}
                  composer={
                    <ChatComposer
                      onSubmit={() => {}}
                      placeholder={
                        composerMode === 'ask'
                          ? 'Ask anything...'
                          : 'Describe your edit...'
                      }
                      input={<ChatComposerInput />}
                      headerActions={
                        <>
                          <Button
                            label="Mention"
                            variant="ghost"
                            size="sm"
                            icon={<Icon icon={AtSymbolIcon} size="sm" />}
                            isIconOnly
                          />
                          <Button
                            label="Attach"
                            variant="ghost"
                            size="sm"
                            icon={<Icon icon={PaperClipIcon} size="sm" />}
                            isIconOnly
                          />
                        </>
                      }
                      footerActions={
                        <DropdownMenu
                          button={{
                            label: composerMode === 'ask' ? 'Ask' : 'Edit',
                            variant: 'ghost',
                            size: 'sm',
                          }}
                          items={[
                            {
                              label: 'Ask',
                              onClick: () => setComposerMode('ask'),
                            },
                            {
                              label: 'Edit',
                              onClick: () => setComposerMode('edit'),
                            },
                          ]}
                        />
                      }
                    />
                  }>
                  <ChatMessageList>
                    {/* Date divider */}
                    <ChatSystemMessage variant="divider">
                      Today
                    </ChatSystemMessage>

                    {/* User message: mention + file attachments */}
                    <ChatMessage sender="user">
                      <HStack gap={1} wrap="wrap">
                        <Token label="auth-service.ts" />
                        <Token label="middleware.ts" />
                      </HStack>
                      <ChatMessageBubble
                        metadata={
                          <ChatMessageMetadata
                            timestamp={
                              <Timestamp
                                value="2026-04-29T10:15:00"
                                format="time"
                              />
                            }
                          />
                        }>
                        <ChatTokenizedText tokens={MENTION_TOKENS}>
                          @agent Can you review these auth files? The JWT
                          refresh logic seems broken — tokens expire but the
                          middleware doesn't catch it.
                        </ChatTokenizedText>
                      </ChatMessageBubble>
                    </ChatMessage>

                    {/* Assistant message: tool calls, markdown, code block */}
                    <ChatMessage
                      sender="assistant"
                      avatar={<Avatar name="Agent" size="md" />}>
                      <ChatMessageBubble variant="ghost">
                        Looking into the auth files now. Let me read through the
                        code and trace the token refresh flow.
                      </ChatMessageBubble>
                      <ChatToolCalls
                        defaultIsExpanded
                        calls={[
                          {
                            name: 'read',
                            target: 'auth-service.ts',
                            status: 'complete',
                            duration: '45ms',
                          },
                          {
                            name: 'read',
                            target: 'middleware.ts',
                            status: 'complete',
                            duration: '38ms',
                          },
                          {
                            name: 'bash',
                            target: 'grep -rn "refreshToken" src/',
                            status: 'complete',
                            duration: '120ms',
                            node: 'cli:remote-server',
                          },
                        ]}
                      />

                      <ChatMessageBubble variant="ghost">
                        <Markdown density="compact">{`Found the issue. In \`middleware.ts\`, the token validation runs **before** the refresh check. When a token expires, the middleware rejects the request immediately instead of attempting a refresh.

Here's the problematic sequence:

1. Request arrives with an expired access token
2. \`validateToken()\` throws \`TokenExpiredError\`
3. The catch block returns \`401\` — never reaching \`refreshToken()\`

The fix is to catch \`TokenExpiredError\` specifically and attempt a refresh before rejecting:`}</Markdown>
                      </ChatMessageBubble>

                      <ChatMessageBubble variant="ghost">
                        <CodeBlock
                          title="middleware.ts"
                          language="typescript"
                          code={`async function authMiddleware(req: Request) {
  try {
    const decoded = validateToken(req.headers.authorization);
    req.user = decoded;
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      // Attempt silent refresh before rejecting
      const refreshed = await refreshToken(req.cookies.refreshToken);
      if (refreshed) {
        req.user = refreshed.user;
        req.newAccessToken = refreshed.accessToken;
        return next(req);
      }
    }
    return new Response('Unauthorized', { status: 401 });
  }
  return next(req);
}`}
                        />
                      </ChatMessageBubble>

                      <ChatToolCalls
                        calls={[
                          {
                            name: 'edit',
                            target: 'middleware.ts',
                            status: 'complete',
                            duration: '85ms',
                            additions: 8,
                            deletions: 2,
                          },
                        ]}
                      />

                      <ChatMessageMetadata
                        timestamp={
                          <Timestamp
                            value="2026-04-29T10:15:30"
                            format="time"
                          />
                        }
                        footer={
                          <Text type="supporting" color="secondary">
                            Agent
                          </Text>
                        }
                      />
                    </ChatMessage>

                    {/* User message: multi-bubble grouping */}
                    <ChatMessage sender="user">
                      <ChatMessageBubble group="first">
                        Nice catch, that makes sense
                      </ChatMessageBubble>
                      <ChatMessageBubble
                        group="last"
                        metadata={
                          <ChatMessageMetadata
                            timestamp={
                              <Timestamp
                                value="2026-04-29T10:16:00"
                                format="time"
                              />
                            }
                            status="delivered"
                          />
                        }>
                        Can you also add a test for the refresh path?
                      </ChatMessageBubble>
                    </ChatMessage>

                    {/* Assistant message: test results table + code block */}
                    <ChatMessage
                      sender="assistant"
                      avatar={<Avatar name="Agent" size="md" />}>
                      <ChatToolCalls
                        defaultIsExpanded
                        calls={[
                          {
                            name: 'read',
                            target: 'middleware.test.ts',
                            status: 'complete',
                            duration: '32ms',
                          },
                          {
                            name: 'edit',
                            target: 'middleware.test.ts',
                            status: 'complete',
                            duration: '110ms',
                            additions: 24,
                            deletions: 0,
                          },
                          {
                            name: 'bash',
                            target: 'yarn test middleware',
                            status: 'complete',
                            duration: '3.2s',
                            node: 'cli:remote-server',
                          },
                        ]}
                      />
                      <ChatMessageBubble variant="ghost">
                        <Markdown density="compact">{`Added a test for the refresh flow. All **4 tests** pass:

| Test | Status |
|------|--------|
| Valid token passes through | ✅ |
| Expired token triggers refresh | ✅ |
| Expired token with invalid refresh returns 401 | ✅ |
| Malformed token returns 401 immediately | ✅ |`}</Markdown>
                      </ChatMessageBubble>

                      <ChatMessageBubble variant="ghost">
                        <CodeBlock
                          title="middleware.test.ts"
                          language="typescript"
                          code={`describe('authMiddleware', () => {
  it('refreshes an expired token silently', async () => {
    const expiredToken = createExpiredJWT(mockUser);
    const validRefresh = createRefreshToken(mockUser);

    const req = mockRequest({
      authorization: \`Bearer \${expiredToken}\`,
      cookies: { refreshToken: validRefresh },
    });

    const res = await authMiddleware(req);

    expect(res.status).toBe(200);
    expect(req.user.id).toBe(mockUser.id);
    expect(req.newAccessToken).toBeDefined();
  });
});`}
                        />
                      </ChatMessageBubble>
                      <ChatMessageMetadata
                        timestamp={
                          <Timestamp
                            value="2026-04-29T10:16:45"
                            format="time"
                          />
                        }
                      />
                    </ChatMessage>

                    {/* Status message */}
                    <ChatSystemMessage>
                      Changes saved to workspace
                    </ChatSystemMessage>

                    {/* User message: requests a document artifact */}
                    <ChatMessage sender="user">
                      <ChatMessageBubble
                        metadata={
                          <ChatMessageMetadata
                            timestamp={
                              <Timestamp
                                value="2026-04-29T10:18:00"
                                format="time"
                              />
                            }
                          />
                        }>
                        Looks solid. Before I open the PR, can you write up a
                        short design doc explaining the token-refresh flow for
                        the team?
                      </ChatMessageBubble>
                    </ChatMessage>

                    {/* Assistant message: artifact card */}
                    <ChatMessage
                      sender="assistant"
                      avatar={<Avatar name="Agent" size="md" />}>
                      <ChatMessageBubble variant="ghost">
                        <Markdown density="compact">
                          {`I've drafted a design doc covering the problem, the fix, and the test matrix — pulling straight from the changes we just made.\n\nOpen the document below to review it. Want me to expand any section?`}
                        </Markdown>
                      </ChatMessageBubble>
                      {/* Ghost + width="100%" aligns the card with the
                          bubble text column and spans the full message
                          column; metadata rides the bubble slot. */}
                      <ChatMessageBubble
                        variant="ghost"
                        width="100%"
                        metadata={
                          <ChatMessageMetadata
                            timestamp={
                              <Timestamp
                                value="2026-04-29T10:18:40"
                                format="time"
                              />
                            }
                          />
                        }>
                        <ArtifactCard onOpen={openArtifact} />
                      </ChatMessageBubble>
                    </ChatMessage>

                    {/* User follow-up */}
                    <ChatMessage sender="user">
                      <ChatMessageBubble
                        metadata={
                          <ChatMessageMetadata
                            timestamp={
                              <Timestamp
                                value="2026-04-29T10:20:00"
                                format="time"
                              />
                            }
                            status="delivered"
                          />
                        }>
                        This is great. Can you add a section on rollout and
                        monitoring at the end?
                      </ChatMessageBubble>
                    </ChatMessage>

                    {/* Assistant message: in-progress tool call */}
                    <ChatMessage
                      sender="assistant"
                      avatar={<Avatar name="Agent" size="md" />}>
                      <ChatMessageBubble variant="ghost">
                        <Markdown density="compact">
                          {`On it — adding a **Rollout & Monitoring** section with a staged flag ramp and the alert thresholds. Updating the document now.`}
                        </Markdown>
                      </ChatMessageBubble>
                      <ChatToolCalls
                        calls={[
                          {
                            name: 'edit',
                            target: 'docs/token-refresh.md',
                            status: 'running',
                            node: 'cli:remote-server',
                          },
                        ]}
                      />
                      <ChatMessageMetadata
                        timestamp={
                          <Timestamp
                            value="2026-04-29T10:20:30"
                            format="time"
                          />
                        }
                      />
                    </ChatMessage>
                  </ChatMessageList>
                </ChatLayout>
              </VStack>

              {/* Desktop split-pane: resize handle + artifact panel */}
              {isArtifactOpen && (
                <>
                  <ResizeHandle
                    direction="horizontal"
                    resizable={artifactResize.props}
                    isReversed
                    pillPlacement="start"
                    hasDivider
                    label="Resize artifact panel"
                    className="ai-chat-resize-handle"
                  />

                  {/* Toolbar as the card header, body below */}
                  <Card
                    variant="transparent"
                    height="100%"
                    className="ai-chat-artifact-panel"
                    style={artifactPanelWidthVar(artifactResize.size)}>
                    <Toolbar
                      label="Artifact actions"
                      dividers={['bottom']}
                      startContent={
                        <HStack gap={3} vAlign="center">
                          <Icon
                            icon={DocumentTextIcon}
                            size="sm"
                            color="secondary"
                          />
                          <VStack gap={0}>
                            <Text type="label" weight="semibold">
                              {ARTIFACT_TITLE}
                            </Text>
                            <Text type="supporting" color="secondary">
                              {ARTIFACT_SUBTITLE}
                            </Text>
                          </VStack>
                        </HStack>
                      }
                      endContent={
                        <ArtifactActions
                          onClose={() => setIsArtifactOpen(false)}
                        />
                      }
                    />

                    <ArtifactBody />
                  </Card>
                </>
              )}
            </HStack>
          </LayoutContent>
        }
      />
      {/* Mobile artifact view — full-screen Dialog */}
      <Dialog
        isOpen={isArtifactDialogOpen}
        onOpenChange={setIsArtifactDialogOpen}
        purpose="info"
        variant="fullscreen">
        <Layout
          header={
            <DialogHeader
              title={ARTIFACT_TITLE}
              subtitle={ARTIFACT_SUBTITLE}
              hasDivider
              onOpenChange={setIsArtifactDialogOpen}
              endContent={<MobileArtifactActions />}
            />
          }
          content={
            <LayoutContent padding={0}>
              <ArtifactBody />
            </LayoutContent>
          }
        />
      </Dialog>
    </VStack>
  );
}
