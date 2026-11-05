// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  ChatMessageList,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageMetadata,
  ChatSystemMessage,
} from '@astryxdesign/core/Chat';
import {Avatar} from '@astryxdesign/core/Avatar';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Text} from '@astryxdesign/core/Text';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Token} from '@astryxdesign/core/Token';
import {HStack} from '@astryxdesign/core/Stack';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Button} from '@astryxdesign/core/Button';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {HandThumbUpIcon, HandThumbDownIcon} from '@heroicons/react/24/outline';
import {ClipboardDocumentIcon} from '@heroicons/react/24/outline';

const meta: Meta<typeof ChatMessageList> = {
  title: 'Core/Chat',
  component: ChatMessageList,
  tags: ['autodocs'],
};
export default meta;

export const Default: StoryObj = {
  name: 'Default',
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column'}}>
      <ChatMessageList>
        <ChatMessage sender="user">
          <ChatMessageBubble
            metadata={
              <ChatMessageMetadata
                timestamp={
                  <Timestamp value="2026-03-15T14:30:00" format="time" />
                }
                status="read"
              />
            }>
            How should I handle state management in a React app?
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="assistant">
          <Markdown density="compact">{`For most cases, **React's built-in state** is sufficient:

- \`useState\` for local component state
- \`useReducer\` for complex state logic
- \`useContext\` for shared state across a subtree

For **server state**, use a library like **TanStack Query** or **SWR** — they handle caching, revalidation, and loading states out of the box.

Avoid global state managers unless you have a genuine need for cross-cutting state. Most apps are over-engineered in this area.`}</Markdown>
          <ChatMessageMetadata
            timestamp={<Timestamp value="2026-03-15T14:30:30" format="time" />}
            footer={
              <>
                <span>Claude Opus 4.6</span>
                <span>·</span>
                <Button
                  label="Thumbs up"
                  icon={<HandThumbUpIcon style={{width: 14, height: 14}} />}
                  variant="ghost"
                  size="sm"
                  isIconOnly
                />
                <Button
                  label="Thumbs down"
                  icon={<HandThumbDownIcon style={{width: 14, height: 14}} />}
                  variant="ghost"
                  size="sm"
                  isIconOnly
                />
                <Button
                  label="Copy"
                  icon={
                    <ClipboardDocumentIcon style={{width: 14, height: 14}} />
                  }
                  variant="ghost"
                  size="sm"
                  isIconOnly
                />
              </>
            }
          />
        </ChatMessage>
        <ChatMessage sender="user">
          <ChatMessageBubble
            metadata={
              <ChatMessageMetadata
                timestamp={
                  <Timestamp value="2026-03-15T14:31:00" format="time" />
                }
                status="read"
              />
            }>
            Can you show me a useReducer example?
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="assistant">
          <Markdown density="compact">
            Here's a common pattern for form state:
          </Markdown>
          <CodeBlock
            code={`const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
};

const [state, dispatch] = useReducer(reducer, initialState);`}
            language="tsx"
          />
          <Markdown density="compact">{`This keeps all your form logic in one place. The reducer is pure and easy to test — just pass in state and action, assert on the output.

| Hook | Use case | Re-renders | Complexity | Best for |
|------|----------|------------|------------|----------|
| \`useState\` | Simple values | On every set | Low | Toggles, inputs, counters |
| \`useReducer\` | Complex state logic | On dispatch | Medium | Forms, multi-field state |
| \`useContext\` | Shared subtree state | All consumers | Low | Theme, auth, locale |
| \`useSyncExternalStore\` | External stores | On snapshot change | High | Redux, Zustand, signals |
| \`useRef\` | Mutable values | Never | Low | DOM refs, timers, previous values |`}</Markdown>
          <ChatMessageMetadata
            timestamp={<Timestamp value="2026-03-15T14:31:30" format="time" />}
            footer={
              <>
                <span>Claude Opus 4.6</span>
                <span>·</span>
                <Button
                  label="Thumbs up"
                  icon={<HandThumbUpIcon style={{width: 14, height: 14}} />}
                  variant="ghost"
                  size="sm"
                  isIconOnly
                />
                <Button
                  label="Thumbs down"
                  icon={<HandThumbDownIcon style={{width: 14, height: 14}} />}
                  variant="ghost"
                  size="sm"
                  isIconOnly
                />
                <Button
                  label="Copy"
                  icon={
                    <ClipboardDocumentIcon style={{width: 14, height: 14}} />
                  }
                  variant="ghost"
                  size="sm"
                  isIconOnly
                />
              </>
            }
          />
        </ChatMessage>
      </ChatMessageList>
    </div>
  ),
};

export const MixedContent: StoryObj = {
  name: 'Mixed Content',
  render: () => (
    <div style={{height: 600, display: 'flex', flexDirection: 'column'}}>
      <ChatMessageList>
        <ChatMessage sender="user">
          <ChatMessageBubble>
            Show me the component files and explain the architecture
          </ChatMessageBubble>
        </ChatMessage>

        <ChatMessage sender="assistant">
          <ChatMessageBubble>
            Sure! Here's an overview of the component architecture.
          </ChatMessageBubble>
          <ChatMessageBubble variant="ghost">
            <Markdown density="compact">{`The system uses a **compound component** pattern with three layers:

1. **MessageList** — scrollable container with auto-scroll
2. **Message** — layout wrapper with sender context
3. **Bubble** — styled content container`}</Markdown>
          </ChatMessageBubble>
          <ChatMessageBubble variant="ghost">
            <Markdown density="compact">Here are the files:</Markdown>
            <HStack gap={2} wrap="wrap">
              <Token label="Button.tsx" />
              <Token label="Card.tsx" />
              <Token label="Dialog.tsx" />
            </HStack>
            <CodeBlock
              code={
                "export * from './Button';\nexport * from './Card';\nexport * from './Dialog';"
              }
              language="typescript"
            />
          </ChatMessageBubble>
          <ChatMessageBubble>
            Let me know which one to open — I can walk through the
            implementation.
          </ChatMessageBubble>
        </ChatMessage>

        <ChatMessage sender="user">
          <ChatMessageBubble>Open Button.tsx</ChatMessageBubble>
        </ChatMessage>

        <ChatSystemMessage>Navi opened Button.tsx</ChatSystemMessage>

        <ChatMessage sender="assistant">
          <ChatMessageBubble variant="ghost">
            <CodeBlock
              code={`import * as stylex from '@stylexjs/stylex';

export function Button({ label, variant = 'primary' }) {
  return (
    <button {...stylex.props(styles.base, styles[variant])}>
      {label}
    </button>
  );
}`}
              language="tsx"
            />
            <Markdown density="compact">{`The Button uses StyleX for styles and reads variant from props.`}</Markdown>
          </ChatMessageBubble>
        </ChatMessage>
      </ChatMessageList>
    </div>
  ),
};

export const CustomContent: StoryObj = {
  name: 'Custom Content',
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column'}}>
      <ChatMessageList style={{maxWidth: 520}}>
        <ChatMessage sender="user">
          <ChatMessageBubble>Can you pull up the Q3 report?</ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="assistant">
          <ChatMessageBubble name="Navi">
            Sure, here is the artifact from last quarter.
          </ChatMessageBubble>
          {/* A ghost bubble insets custom content to the bubble's text
              column; width="100%" spans the full message column instead
              of the default bubble width cap (#2574). */}
          <ChatMessageBubble
            variant="ghost"
            width="100%"
            metadata={
              <ChatMessageMetadata
                timestamp={
                  <Timestamp value="2026-03-15T14:32:00" format="time" />
                }
                footer={<span>Claude Opus 4.6</span>}
              />
            }>
            <ClickableCard
              label="Open Q3 performance report"
              onClick={() => {}}>
              <Text type="body" weight="semibold" display="block">
                Q3 Performance Report
              </Text>
              <Text type="supporting" color="secondary" display="block">
                12 pages · updated 2 days ago
              </Text>
            </ClickableCard>
          </ChatMessageBubble>
        </ChatMessage>
      </ChatMessageList>
    </div>
  ),
};

export const ChatConversation: StoryObj = {
  name: 'Chat Conversation',
  render: () => {
    const nameStyle = {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--color-text-secondary)',
      lineHeight: '16px',
    };
    return (
      <div style={{height: 500, display: 'flex', flexDirection: 'column'}}>
        <ChatMessageList>
          <ChatSystemMessage variant="divider">Today</ChatSystemMessage>
          <ChatMessage
            sender="assistant"
            avatar={<Avatar name="Navi" size="md" />}>
            <ChatMessageBubble
              name={<span style={nameStyle}>Navi</span>}
              metadata={
                <ChatMessageMetadata
                  timestamp={
                    <Timestamp value="2026-03-15T14:30:00" format="time" />
                  }
                />
              }>
              Hey! I looked at the PR and left a few comments on the density
              styles.
            </ChatMessageBubble>
          </ChatMessage>

          <ChatMessage sender="user" avatar={<Avatar name="Cindy" size="md" />}>
            <ChatMessageBubble
              group="first"
              name={<span style={nameStyle}>Cindy</span>}>
              Thanks! I'll take a look.
            </ChatMessageBubble>
            <ChatMessageBubble
              group="last"
              metadata={
                <ChatMessageMetadata
                  timestamp={
                    <Timestamp value="2026-03-15T14:31:00" format="time" />
                  }
                  status="read"
                />
              }>
              Should be quick to fix.
            </ChatMessageBubble>
          </ChatMessage>

          <ChatMessage
            sender="assistant"
            avatar={<Avatar name="Navi" size="md" />}>
            <ChatMessageBubble
              name={<span style={nameStyle}>Navi</span>}
              metadata={
                <ChatMessageMetadata
                  timestamp={
                    <Timestamp value="2026-03-15T14:32:00" format="time" />
                  }
                />
              }>
              Sounds good. The main thing is the compact radius — it should use
              the container token, not the page token.
            </ChatMessageBubble>
          </ChatMessage>

          <ChatMessage sender="user" avatar={<Avatar name="Cindy" size="md" />}>
            <ChatMessageBubble
              name={<span style={nameStyle}>Cindy</span>}
              metadata={
                <ChatMessageMetadata
                  timestamp={
                    <Timestamp value="2026-03-15T14:33:00" format="time" />
                  }
                  status="delivered"
                />
              }>
              Good catch, fixed and pushed.
            </ChatMessageBubble>
          </ChatMessage>

          <ChatSystemMessage>Cindy liked a message</ChatSystemMessage>
        </ChatMessageList>
      </div>
    );
  },
};

export const DensityComparison: StoryObj = {
  name: 'Density Comparison',
  render: () => {
    const avatarSize = {
      compact: 'sm' as const,
      balanced: 'md' as const,
      spacious: 'md' as const,
    };
    const messages = (density: 'compact' | 'balanced' | 'spacious') => (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          border: '1px solid var(--color-border-primary)',
          borderRadius: 8,
        }}>
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--color-border-primary)',
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
          {density}
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}>
          <ChatMessageList density={density}>
            <ChatMessage sender="user">
              <ChatMessageBubble>
                How does the density system work?
              </ChatMessageBubble>
            </ChatMessage>
            <ChatMessage
              sender="assistant"
              avatar={<Avatar name="Navi" size={avatarSize[density]} />}>
              <Markdown density="compact">{`Density controls **spacing** at every level:

- **Default gap** between messages
- **Padding** inside bubbles
- **Gap** between child elements

Use gap when top-level rows need different spacing from density.

This is the **${density}** density. ${density === 'compact' ? 'Great for sidebars and panels where space is limited.' : density === 'spacious' ? 'Ideal for long-form reading where breathing room helps comprehension.' : 'The default — works well for most full-page chat interfaces.'}`}</Markdown>
            </ChatMessage>
            <ChatMessage sender="user">
              <ChatMessageBubble>Makes sense, thanks!</ChatMessageBubble>
            </ChatMessage>
          </ChatMessageList>
        </div>
      </div>
    );

    return (
      <div style={{display: 'flex', gap: 16, height: 500}}>
        {messages('compact')}
        {messages('balanced')}
        {messages('spacious')}
      </div>
    );
  },
};
export const GapOverride: StoryObj = {
  name: 'Message Gap Override',
  render: () => (
    <div style={{height: 420, display: 'flex', flexDirection: 'column'}}>
      <ChatMessageList density="compact" gap={5}>
        <ChatMessage sender="assistant">
          <ChatMessageBubble name="Clio">
            Starting the requested change.
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="assistant">
          <ChatMessageBubble variant="ghost">
            Reading repository context and relevant files...
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="assistant">
          <ChatMessageBubble variant="ghost">
            Running tests for the updated package.
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="assistant">
          <ChatMessageBubble metadata={<ChatMessageMetadata footer="Done" />}>
            The patch is ready for review.
          </ChatMessageBubble>
        </ChatMessage>
      </ChatMessageList>
    </div>
  ),
};
export const SystemMessages: StoryObj = {
  name: 'System Messages',
  render: () => (
    <div style={{height: 400, display: 'flex', flexDirection: 'column'}}>
      <ChatMessageList>
        <ChatSystemMessage variant="divider">March 15, 2026</ChatSystemMessage>
        <ChatMessage
          sender="assistant"
          avatar={<Avatar name="Navi" size="md" />}>
          <Markdown density="compact">Good morning!</Markdown>
        </ChatMessage>
        <ChatSystemMessage>Conversation started</ChatSystemMessage>
        <ChatMessage sender="user">
          <ChatMessageBubble>Hey Navi</ChatMessageBubble>
        </ChatMessage>
        <ChatSystemMessage variant="divider">Today</ChatSystemMessage>
        <ChatSystemMessage>Cindy shared a file</ChatSystemMessage>
      </ChatMessageList>
    </div>
  ),
};
export const MessageStatus: StoryObj = {
  name: 'Message Status',
  render: () => (
    <div style={{height: 400, display: 'flex', flexDirection: 'column'}}>
      <ChatMessageList>
        <ChatMessage sender="user">
          <ChatMessageBubble
            metadata={<ChatMessageMetadata status="sending" />}>
            Sending...
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="user">
          <ChatMessageBubble metadata={<ChatMessageMetadata status="sent" />}>
            Sent
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="user">
          <ChatMessageBubble
            metadata={<ChatMessageMetadata status="delivered" />}>
            Delivered
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="user">
          <ChatMessageBubble metadata={<ChatMessageMetadata status="read" />}>
            Read
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="user">
          <ChatMessageBubble metadata={<ChatMessageMetadata status="error" />}>
            Failed to send
          </ChatMessageBubble>
        </ChatMessage>
      </ChatMessageList>
    </div>
  ),
};
export const MultiBubble: StoryObj = {
  name: 'Multi-Bubble Grouping',
  render: () => (
    <div style={{height: 500, display: 'flex', flexDirection: 'column'}}>
      <ChatMessageList>
        <ChatMessage sender="user">
          <ChatMessageBubble group="first">
            Hey, can you review my PR?
          </ChatMessageBubble>
          <ChatMessageBubble group="middle">
            It's the one for the chat components
          </ChatMessageBubble>
          <ChatMessageBubble
            group="last"
            metadata={
              <ChatMessageMetadata
                timestamp={
                  <Timestamp value="2026-03-15T14:31:00" format="time" />
                }
                status="delivered"
              />
            }>
            Link: github.com/meta/astryx/pull/1180
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage
          sender="assistant"
          avatar={<Avatar name="Navi" size="md" />}>
          <ChatMessageBubble group="first">
            Sure, looking at it now!
          </ChatMessageBubble>
          <ChatMessageBubble group="middle">
            The compound pattern looks solid. A few minor comments on the
            density styles.
          </ChatMessageBubble>
          <ChatMessageBubble
            group="last"
            metadata={
              <ChatMessageMetadata
                timestamp={
                  <Timestamp value="2026-03-15T14:33:00" format="time" />
                }
              />
            }>
            I'll leave them as review comments.
          </ChatMessageBubble>
        </ChatMessage>
        <ChatMessage sender="user">
          <ChatMessageBubble
            metadata={
              <ChatMessageMetadata
                timestamp={
                  <Timestamp value="2026-03-15T14:34:00" format="time" />
                }
                status="sending"
              />
            }>
            Thanks, will address those
          </ChatMessageBubble>
        </ChatMessage>
      </ChatMessageList>
    </div>
  ),
};
export const Alignment: StoryObj = {
  name: 'Alignment',
  render: () => {
    const shortConversation = (align: 'top' | 'bottom') => (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--color-border-primary)',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--color-border-primary)',
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
          align=&quot;{align}&quot;
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}>
          <ChatMessageList align={align}>
            <ChatMessage sender="user">
              <ChatMessageBubble>Just one short message.</ChatMessageBubble>
            </ChatMessage>
            <ChatMessage
              sender="assistant"
              avatar={<Avatar name="Navi" size="sm" />}>
              <ChatMessageBubble>
                {align === 'top'
                  ? 'Top alignment keeps messages at the top — good for logs and document-style lists.'
                  : 'Bottom alignment keeps a short thread just above the composer — the familiar messaging layout.'}
              </ChatMessageBubble>
            </ChatMessage>
          </ChatMessageList>
        </div>
      </div>
    );

    return (
      <div style={{display: 'flex', gap: 16, height: 420}}>
        {shortConversation('bottom')}
        {shortConversation('top')}
      </div>
    );
  },
};
