// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {
  ChatLayout,
  ChatLayoutScrollButton,
  ChatMessageList,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageMetadata,
  ChatSystemMessage,
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
  ChatTokenizedText,
  ChatToolCalls,
  type ChatComposerInputHandle,
  type ChatComposerToken,
  type ChatComposerTrigger,
  type ChatToolCallItem,
} from '@astryxdesign/core/Chat';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Token} from '@astryxdesign/core/Token';
import {Button} from '@astryxdesign/core/Button';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {HandThumbUpIcon, HandThumbDownIcon} from '@heroicons/react/24/outline';
import {ClipboardDocumentIcon} from '@heroicons/react/24/outline';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {useTooltip} from '@astryxdesign/core/Tooltip';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {useState, useCallback, useRef} from 'react';

const meta: Meta<typeof ChatLayout> = {
  title: 'Core/ChatLayout',
  component: ChatLayout,
  tags: ['autodocs'],
  parameters: {layout: 'fullscreen'},
};
export default meta;

// =============================================================================
// Icons
// =============================================================================

const PaperclipIcon = (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round">
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);
const AtSignIcon = (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
  </svg>
);
const MicIcon = (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

// =============================================================================
// Data
// =============================================================================

const CONTACTS = [
  {id: 'cindy', label: 'Cindy Zhang'},
  {id: 'alex', label: 'Alex Rivera'},
  {id: 'sam', label: 'Sam Chen'},
  {id: 'navi', label: 'Navi'},
];
const COMMANDS = [
  {id: 'summarize', label: 'summarize'},
  {id: 'search', label: 'search'},
  {id: 'explain', label: 'explain'},
];

type Message =
  | {
      id: number;
      role: 'user';
      text: string;
      files?: string[];
      tokens?: ChatComposerToken[];
      isSending?: boolean;
      sentAt?: Date;
    }
  | {
      id: number;
      role: 'assistant';
      text: string;
      introText?: string;
      toolCalls?: ChatToolCallItem[];
      isStreaming?: boolean;
    }
  | {id: number; role: 'system'; text: string};

const SEED_MESSAGES: Message[] = [
  {id: 1, role: 'system', text: 'Today'},
  {
    id: 2,
    role: 'user',
    text: 'Can you review the Button component and fix the focus ring?',
    sentAt: new Date('2026-03-15T14:30:00'),
  },
  {
    id: 3,
    role: 'assistant',
    introText: "I'll read the Button component and check the focus styles.",
    text: "I'll read the Button component and check the focus styles.\n\nAdded a `:focus-visible` style with a 2px solid outline and 2px offset. All 24 Button tests pass.\n\n```css\n:focus-visible {\n  outline: 2px solid var(--color-ring-focus);\n  outline-offset: 2px;\n}\n```\n\nHere's the test breakdown:\n\n| Suite | Tests | Duration | Status |\n|-------|-------|----------|--------|\n| Button.test.tsx | 18 | 1.2s | ✓ Pass |\n| Button.a11y.test.tsx | 4 | 0.8s | ✓ Pass |\n| Button.snapshot.test.tsx | 2 | 0.3s | ✓ Pass |\n\nThe focus ring meets **WCAG 2.4.7** requirements and uses the theme's focus color token.",
    toolCalls: [
      {
        key: '1',
        name: 'read',
        target: 'Button.tsx',
        status: 'complete',
        duration: '45ms',
        node: 'astryx',
      },
      {
        key: '2',
        name: 'edit',
        target: 'Button.tsx',
        status: 'complete',
        duration: '120ms',
        node: 'astryx',
        additions: 8,
        deletions: 2,
        resultDetail: (
          <CodeBlock
            code={`:focus-visible {\n  outline: 2px solid var(--color-ring-focus);\n  outline-offset: 2px;\n}`}
            language="css"
          />
        ),
      },
      {
        key: '3',
        name: 'bash',
        target: 'yarn test',
        status: 'complete',
        duration: '6.1s',
        node: 'astryx',
        resultDetail: (
          <CodeBlock
            code={`$ yarn test\n✓ 24 tests passed (3 suites)`}
            language="bash"
          />
        ),
      },
    ],
  },
  {
    id: 4,
    role: 'user',
    text: 'Nice, can you also check the Card component?',
    sentAt: new Date('2026-03-15T14:35:00'),
  },
];

// =============================================================================
// Stories
// =============================================================================

/** Full AI chat with streaming, tool calls, triggers, attachments, and frosted glass composer dock */
export const FullAIChat: StoryObj = {
  name: 'Full AI Chat',
  render: () => {
    const [messages, setMessages] = useState<Message[]>(SEED_MESSAGES);
    const [files, setFiles] = useState<string[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const streamRef = useRef<ReturnType<typeof setInterval>>(undefined);
    const inputRef = useRef<ChatComposerInputHandle>(null);
    const contextTooltip = useTooltip({placement: 'above'});

    const mentionTokens = CONTACTS.map(c => ({
      value: `@${c.id}`,
      label: `@${c.label}`,
      variant: 'blue' as const,
    }));

    const triggers: ChatComposerTrigger[] = [
      {
        character: '@',
        searchSource: createStaticSource(CONTACTS),
        onSelect: item => ({
          value: `@${item.id}`,
          label: `@${item.label}`,
          variant: 'blue' as const,
        }),
      },
      {
        character: '/',
        searchSource: createStaticSource(COMMANDS),
        onSelect: item => `/${item.label} `,
      },
    ];

    const streamResponse = useCallback(
      (
        introText: string,
        resultText: string,
        toolCalls?: ChatToolCallItem[],
      ) => {
        const msgId = Date.now();
        setIsStreaming(true);

        setMessages(prev => [
          ...prev,
          {
            id: msgId,
            role: 'assistant',
            text: '',
            introText,
            isStreaming: true,
          },
        ]);

        let i = 0;
        streamRef.current = setInterval(() => {
          i += 2 + Math.floor(Math.random() * 4);
          if (i >= introText.length) {
            clearInterval(streamRef.current);
            setMessages(prev =>
              prev.map(m => (m.id === msgId ? {...m, text: introText} : m)),
            );

            if (toolCalls) {
              setTimeout(() => {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === msgId && m.role === 'assistant'
                      ? {
                          ...m,
                          toolCalls: toolCalls.map(tc => ({
                            ...tc,
                            status: 'running' as const,
                            duration: undefined,
                          })),
                        }
                      : m,
                  ),
                );

                setTimeout(() => {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === msgId && m.role === 'assistant'
                        ? {...m, toolCalls}
                        : m,
                    ),
                  );

                  setTimeout(() => {
                    let j = 0;
                    const fullText = introText + '\n\n' + resultText;
                    streamRef.current = setInterval(() => {
                      j += 3 + Math.floor(Math.random() * 5);
                      const end = introText.length + 2 + j;
                      if (end >= fullText.length) {
                        clearInterval(streamRef.current);
                        setMessages(prev =>
                          prev.map(m =>
                            m.id === msgId
                              ? {...m, text: fullText, isStreaming: false}
                              : m,
                          ),
                        );
                        setIsStreaming(false);
                        return;
                      }
                      setMessages(prev =>
                        prev.map(m =>
                          m.id === msgId
                            ? {...m, text: fullText.slice(0, end)}
                            : m,
                        ),
                      );
                    }, 30);
                  }, 300);
                }, 1800);
              }, 400);
            } else {
              setMessages(prev =>
                prev.map(m =>
                  m.id === msgId ? {...m, isStreaming: false} : m,
                ),
              );
              setIsStreaming(false);
            }
            return;
          }
          setMessages(prev =>
            prev.map(m =>
              m.id === msgId ? {...m, text: introText.slice(0, i)} : m,
            ),
          );
        }, 30);
      },
      [],
    );

    // Simulate backend token resolution — extract @mentions from text
    const resolveTokens = (text: string): ChatComposerToken[] =>
      CONTACTS.filter(c => text.includes(`@${c.id}`)).map(c => ({
        value: `@${c.id}`,
        label: `@${c.label}`,
        variant: 'blue' as const,
      }));

    const handleSubmit = useCallback(
      (value: string) => {
        const userMsgId = Date.now();
        setMessages(prev => [
          ...prev,
          {
            id: userMsgId,
            role: 'user',
            text: value,
            files: files.length ? [...files] : undefined,
            tokens: resolveTokens(value),
            isSending: true,
          },
        ]);
        setFiles([]);

        // After 2s, mark as sent and start streaming
        setTimeout(() => {
          setMessages(prev =>
            prev.map(m =>
              m.id === userMsgId && m.role === 'user'
                ? {...m, isSending: false, sentAt: new Date()}
                : m,
            ),
          );
          streamResponse(
            "I'll check the Card component for the same issue.",
            'The border radius was hardcoded. I replaced it with the theme token:\n\n```css\n/* before */\nborder-radius: 12px;\n\n/* after */\nborder-radius: var(--radius-element);\n```\n\nCards now adapt across themes. All tests pass.',
            [
              {
                key: 'r1',
                name: 'read',
                target: 'Card.tsx',
                status: 'complete',
                duration: '35ms',
                node: 'astryx',
              },
              {
                key: 'e1',
                name: 'edit',
                target: 'Card.tsx',
                status: 'complete',
                duration: '90ms',
                node: 'astryx',
                additions: 1,
                deletions: 1,
              },
              {
                key: 't1',
                name: 'bash',
                target: 'yarn test --filter Card',
                status: 'complete',
                duration: '3.2s',
                node: 'astryx',
              },
            ],
          );
        }, 2000);
      },
      [files, streamResponse],
    );

    const handleStop = useCallback(() => {
      clearInterval(streamRef.current);
      setIsStreaming(false);
      setMessages(prev =>
        prev.map(m =>
          m.role === 'assistant' && m.isStreaming
            ? {...m, isStreaming: false}
            : m,
        ),
      );
    }, []);

    const composerEl = (
      <ChatComposer
        onSubmit={handleSubmit}
        onStop={handleStop}
        isStopShown={isStreaming}
        drawer={
          files.length > 0 ? (
            <ChatComposerDrawer>
              {files.map(f => (
                <Token
                  key={f}
                  label={f}
                  onRemove={() => setFiles(prev => prev.filter(x => x !== f))}
                />
              ))}
            </ChatComposerDrawer>
          ) : undefined
        }
        headerActions={
          <>
            <Button
              label="Mention"
              variant="ghost"
              size="sm"
              icon={AtSignIcon}
              isIconOnly
              onClick={() => {
                inputRef.current?.focus();
                inputRef.current?.insertText('@');
              }}
            />
            <Button
              label="Attach"
              variant="ghost"
              size="sm"
              icon={PaperclipIcon}
              isIconOnly
              onClick={() =>
                setFiles(prev => [...prev, `file-${prev.length + 1}.tsx`])
              }
            />
          </>
        }
        headerContext={
          <>
            <ProgressBar
              ref={contextTooltip.ref}
              aria-describedby={contextTooltip.describedBy}
              label="Context"
              value={12}
              variant="neutral"
              isLabelHidden
              style={{marginInlineEnd: 8}}
            />
            {contextTooltip.renderTooltip('3k / 100k tokens used')}
          </>
        }
        input={
          <ChatComposerInput
            handleRef={inputRef}
            triggers={triggers}
            placeholder="Ask about the codebase..."
          />
        }
        footerActions={<Button label="Claude Opus" variant="ghost" size="md" />}
        sendActions={
          <Button
            label="Microphone"
            variant="ghost"
            size="md"
            icon={MicIcon}
            isIconOnly
          />
        }
      />
    );

    return (
      <div style={{height: '100vh', display: 'flex', flexDirection: 'column'}}>
        <ChatLayout composer={composerEl}>
          <ChatMessageList>
            {messages.map(msg => {
              if (msg.role === 'system') {
                return (
                  <ChatSystemMessage key={msg.id} variant="divider">
                    {msg.text}
                  </ChatSystemMessage>
                );
              }
              if (msg.role === 'user') {
                return (
                  <ChatMessage key={msg.id} sender="user">
                    {msg.files && (
                      <ChatComposerDrawer>
                        {msg.files.map(f => (
                          <Token key={f} label={f} />
                        ))}
                      </ChatComposerDrawer>
                    )}
                    <ChatMessageBubble
                      metadata={
                        <ChatMessageMetadata
                          timestamp={
                            <Timestamp
                              value={
                                msg.sentAt?.toISOString() ??
                                new Date(msg.id).toISOString()
                              }
                              format="time"
                            />
                          }
                          status={msg.isSending ? 'sending' : undefined}
                        />
                      }>
                      <ChatTokenizedText tokens={mentionTokens}>
                        {msg.text}
                      </ChatTokenizedText>
                    </ChatMessageBubble>
                  </ChatMessage>
                );
              }
              {
                /* Assistant: intro text → tool calls → rest of text */
              }
              const introEnd = msg.introText?.length ?? 0;
              const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;
              const introContent =
                introEnd > 0 ? msg.text.slice(0, introEnd) : null;
              const restContent =
                introEnd > 0 && msg.text.length > introEnd
                  ? msg.text.slice(introEnd).replace(/^\n+/, '')
                  : !introEnd
                    ? msg.text
                    : null;
              return (
                <ChatMessage key={msg.id} sender="assistant">
                  {introContent && (
                    <Markdown density="compact">{introContent}</Markdown>
                  )}
                  {hasToolCalls && (
                    <ChatToolCalls calls={msg.toolCalls ?? []} />
                  )}
                  {restContent && (
                    <Markdown density="compact">{restContent}</Markdown>
                  )}
                  {!msg.isStreaming && msg.text && (
                    <ChatMessageMetadata
                      timestamp={
                        <Timestamp
                          value={new Date(msg.id).toISOString()}
                          format="time"
                        />
                      }
                      footer={
                        <>
                          <span>Claude Opus 4.6</span>
                          <span>·</span>
                          <Button
                            label="Thumbs up"
                            icon={
                              <HandThumbUpIcon
                                style={{width: 14, height: 14}}
                              />
                            }
                            variant="ghost"
                            size="sm"
                            isIconOnly
                          />
                          <Button
                            label="Thumbs down"
                            icon={
                              <HandThumbDownIcon
                                style={{width: 14, height: 14}}
                              />
                            }
                            variant="ghost"
                            size="sm"
                            isIconOnly
                          />
                          <Button
                            label="Copy"
                            icon={
                              <ClipboardDocumentIcon
                                style={{width: 14, height: 14}}
                              />
                            }
                            variant="ghost"
                            size="sm"
                            isIconOnly
                          />
                        </>
                      }
                    />
                  )}
                </ChatMessage>
              );
            })}
          </ChatMessageList>
        </ChatLayout>
      </div>
    );
  },
};

/** Panel view — same full features in a narrow sidebar container */
export const PanelView: StoryObj = {
  name: 'Panel View',
  render: () => {
    const [messages, setMessages] = useState<Message[]>(SEED_MESSAGES);
    const [files, setFiles] = useState<string[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const streamRef = useRef<ReturnType<typeof setInterval>>(undefined);
    const inputRef = useRef<ChatComposerInputHandle>(null);

    const mentionTokens = CONTACTS.map(c => ({
      value: `@${c.id}`,
      label: `@${c.label}`,
      variant: 'blue' as const,
    }));

    const triggers: ChatComposerTrigger[] = [
      {
        character: '@',
        searchSource: createStaticSource(CONTACTS),
        onSelect: item => ({
          value: `@${item.id}`,
          label: `@${item.label}`,
          variant: 'blue' as const,
        }),
      },
      {
        character: '/',
        searchSource: createStaticSource(COMMANDS),
        onSelect: item => `/${item.label} `,
      },
    ];

    const streamResponse = useCallback(
      (introText: string, resultText: string) => {
        const msgId = Date.now();
        setIsStreaming(true);

        setMessages(prev => [
          ...prev,
          {id: msgId, role: 'assistant', text: '', isStreaming: true},
        ]);

        let i = 0;
        const fullText = introText + '\n\n' + resultText;
        streamRef.current = setInterval(() => {
          i += 3 + Math.floor(Math.random() * 5);
          if (i >= fullText.length) {
            clearInterval(streamRef.current);
            setMessages(prev =>
              prev.map(m =>
                m.id === msgId ? {...m, text: fullText, isStreaming: false} : m,
              ),
            );
            setIsStreaming(false);
            return;
          }
          setMessages(prev =>
            prev.map(m =>
              m.id === msgId ? {...m, text: fullText.slice(0, i)} : m,
            ),
          );
        }, 30);
      },
      [],
    );

    const handleSubmit = useCallback(
      (value: string) => {
        setMessages(prev => [
          ...prev,
          {
            id: Date.now(),
            role: 'user',
            text: value,
            files: files.length ? [...files] : undefined,
          },
        ]);
        setFiles([]);

        setTimeout(() => {
          streamResponse(
            'Checking the component now.',
            'Found the issue — the border radius was hardcoded. Replaced with the theme token.',
          );
        }, 800);
      },
      [files, streamResponse],
    );

    const handleStop = useCallback(() => {
      clearInterval(streamRef.current);
      setIsStreaming(false);
      setMessages(prev =>
        prev.map(m =>
          m.role === 'assistant' && m.isStreaming
            ? {...m, isStreaming: false}
            : m,
        ),
      );
    }, []);

    const composerEl = (
      <ChatComposer
        onSubmit={handleSubmit}
        onStop={handleStop}
        isStopShown={isStreaming}
        drawer={
          files.length > 0 ? (
            <ChatComposerDrawer>
              {files.map(f => (
                <Token
                  key={f}
                  label={f}
                  onRemove={() => setFiles(prev => prev.filter(x => x !== f))}
                />
              ))}
            </ChatComposerDrawer>
          ) : undefined
        }
        headerActions={
          <>
            <Button
              label="Mention"
              variant="ghost"
              size="sm"
              icon={AtSignIcon}
              isIconOnly
              onClick={() => {
                inputRef.current?.focus();
                inputRef.current?.insertText('@');
              }}
            />
            <Button
              label="Attach"
              variant="ghost"
              size="sm"
              icon={PaperclipIcon}
              isIconOnly
              onClick={() =>
                setFiles(prev => [...prev, `file-${prev.length + 1}.tsx`])
              }
            />
          </>
        }
        input={
          <ChatComposerInput
            handleRef={inputRef}
            triggers={triggers}
            placeholder="Ask something..."
          />
        }
      />
    );

    return (
      <div
        style={{
          width: 400,
          height: 600,
          border: '1px solid #ccc',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
        <ChatLayout composer={composerEl}>
          <ChatMessageList>
            {messages.map(msg => {
              if (msg.role === 'system') {
                return (
                  <ChatSystemMessage key={msg.id} variant="divider">
                    {msg.text}
                  </ChatSystemMessage>
                );
              }
              if (msg.role === 'user') {
                return (
                  <ChatMessage key={msg.id} sender="user">
                    {msg.files && (
                      <ChatComposerDrawer>
                        {msg.files.map(f => (
                          <Token key={f} label={f} />
                        ))}
                      </ChatComposerDrawer>
                    )}
                    <ChatMessageBubble>
                      <ChatTokenizedText tokens={mentionTokens}>
                        {msg.text}
                      </ChatTokenizedText>
                    </ChatMessageBubble>
                  </ChatMessage>
                );
              }
              return (
                <ChatMessage key={msg.id} sender="assistant">
                  {msg.text && (
                    <Markdown density="compact">{msg.text}</Markdown>
                  )}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <ChatToolCalls calls={msg.toolCalls ?? []} />
                  )}
                </ChatMessage>
              );
            })}
          </ChatMessageList>
        </ChatLayout>
      </div>
    );
  },
};

/** Empty state using EmptyState */
export const WithEmptyState: StoryObj = {
  name: 'Empty State',
  render: () => (
    <div style={{height: '100vh', display: 'flex', flexDirection: 'column'}}>
      <ChatLayout
        composer={
          <ChatComposer
            onSubmit={() => {}}
            placeholder="Start a conversation…"
          />
        }
        emptyState={
          <EmptyState
            title="No messages yet"
            description="Start a conversation by typing below."
          />
        }>
        {[]}
      </ChatLayout>
    </div>
  ),
};

const DENSITIES = ['compact', 'balanced', 'spacious'] as const;
/**
 * The three densities side by side. Density is a prop, not an automatic
 * container-width adaptation: it selects the dock's inline and block-end
 * padding, the message area's max-width and inline padding, and the height and
 * mask of the frosted glass blur layer.
 */
export const Densities: StoryObj = {
  name: 'Densities',
  render: () => (
    <div
      style={{
        display: 'flex',
        gap: 16,
        height: '100vh',
        padding: 16,
        boxSizing: 'border-box',
      }}>
      {DENSITIES.map(density => (
        <div
          key={density}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
          <strong style={{paddingBlockEnd: 8}}>{density}</strong>
          <ChatLayout
            density={density}
            composer={
              <ChatComposer onSubmit={() => {}} placeholder="Reply…" />
            }>
            <ChatMessageList density={density}>
              <ChatSystemMessage variant="divider">Today</ChatSystemMessage>
              <ChatMessage sender="user">
                <ChatMessageBubble>
                  How does density change the layout?
                </ChatMessageBubble>
              </ChatMessage>
              <ChatMessage sender="assistant">
                <ChatMessageBubble>
                  It sets the dock padding, the message column width, and the
                  height of the blur behind the composer.
                </ChatMessageBubble>
              </ChatMessage>
            </ChatMessageList>
          </ChatLayout>
        </div>
      ))}
    </div>
  ),
};

const AFFORDANCE_TURNS = [
  'What does the scroll-to-bottom button do?',
  'It appears once you scroll away from the newest message.',
  'And when I am already at the bottom?',
  'Then it is hidden, and it must not take keyboard focus.',
  'Why does that matter?',
  'Focus landing on something invisible has no visible focus indicator.',
  'So the hidden state has to leave the tab order.',
  'Exactly — opacity alone does not do that.',
  'What removes it?',
  'visibility: hidden, carried on the same transition so the fade still plays.',
  'Does the visible button stay reachable?',
  'Yes. Hiding it from the keyboard only applies while it paints nothing.',
];

/**
 * Deterministic fixture for the scroll-to-bottom affordance: a bounded,
 * self-scrolling ChatLayout with static content and a sentinel control in
 * front of it. Scrolling away from the bottom reveals the affordance and
 * scrolling back hides it, so one story reaches the hidden, visible, and
 * re-hidden states without timers, streaming, or `new Date()`.
 *
 * Drives the exact-head keyboard and theme-size evidence in
 * `ChatLayoutScrollButton.a11y.chromium.spec.ts`.
 */
export const ScrollAffordanceStates: StoryObj = {
  name: 'Scroll Affordance States',
  render: () => (
    <div style={{padding: 16}}>
      <button type="button">Before chat</button>
      <div
        style={{
          height: 420,
          marginBlockStart: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
        <ChatLayout
          composer={<ChatComposer onSubmit={() => {}} placeholder="Reply…" />}>
          <ChatMessageList>
            {AFFORDANCE_TURNS.map((text, index) => (
              <ChatMessage
                key={text}
                sender={index % 2 === 0 ? 'user' : 'assistant'}>
                <ChatMessageBubble>{text}</ChatMessageBubble>
              </ChatMessage>
            ))}
          </ChatMessageList>
        </ChatLayout>
      </div>
    </div>
  ),
};

/**
 * The scroll affordance's own rendered configurations, side by side, so the
 * hidden, collapsed, labelled, and long-label pills can be compared in one
 * frame and in one theme switch.
 *
 * `ScrollAffordanceStates` above owns the *behavioral* fixture — a real
 * scroller whose position drives the affordance. This one owns the *rendered*
 * fixture: the labelled pill is only reachable inside ChatLayout when new
 * messages arrive during a scroll, which no static story can stage, and the
 * hidden pill occupies no visible place there at all. Rendering the component
 * directly is what makes those configurations photographable and lets a theme
 * be judged against the surface it is supposed to paint.
 *
 * The long label is deliberately past the pill's expanded ceiling: text
 * expansion is a real locale outcome, and the frame records what a reader sees
 * when it happens.
 */
export const ScrollButtonStates: StoryObj = {
  name: 'Scroll Button States',
  parameters: {layout: 'centered'},
  render: () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 24,
        width: 360,
      }}>
      <div data-scroll-button-state="hidden">
        <ChatLayoutScrollButton isVisible={false} onClick={() => {}} />
      </div>
      <div data-scroll-button-state="visible-collapsed">
        <ChatLayoutScrollButton isVisible onClick={() => {}} />
      </div>
      <div data-scroll-button-state="visible-labelled">
        <ChatLayoutScrollButton
          isVisible
          label="New messages"
          onClick={() => {}}
        />
      </div>
      <div data-scroll-button-state="visible-long-label">
        <ChatLayoutScrollButton
          isVisible
          label="Neue Nachrichten unterhalb dieser Stelle"
          onClick={() => {}}
        />
      </div>
    </div>
  ),
};
