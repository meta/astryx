// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState, type CSSProperties} from 'react';

import {Layout, LayoutContent, VStack, HStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
  ChatDictationButton,
  useChatDictation,
  type ChatComposerInputHandle,
  type ChatComposerTrigger,
} from '@astryxdesign/core/Chat';
import {
  createStaticSource,
  TypeaheadItem,
  type SearchableItem,
} from '@astryxdesign/core/Typeahead';
import {ToggleButton, ToggleButtonGroup} from '@astryxdesign/core/ToggleButton';
import {Token} from '@astryxdesign/core/Token';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Grid} from '@astryxdesign/core/Grid';
import {Icon} from '@astryxdesign/core/Icon';
import {DropdownMenu, DropdownMenuItem} from '@astryxdesign/core/DropdownMenu';
import {
  Cog6ToothIcon,
  AtSymbolIcon,
  SparklesIcon,
  PencilSquareIcon,
  CodeBracketIcon,
  MagnifyingGlassIcon,
  LockClosedIcon,
  ClockIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';

// Fill the content area so the greeting and composer stay vertically centered.
const pageStyle: CSSProperties = {minHeight: '100%'};
const composerInput: CSSProperties = {minHeight: 84};
const categories: CSSProperties = {paddingInline: 'var(--spacing-3)'};

// Suggestion cards shown once a category is selected.
const CATEGORY_SUGGESTIONS: Record<
  string,
  Array<{heading: string; body: string; prompt: string}>
> = {
  writing: [
    {
      heading: 'Draft a professional email',
      body: 'Compose a clear, polished email for any audience',
      prompt: 'Help me draft a professional email',
    },
    {
      heading: 'Improve my writing',
      body: 'Enhance the clarity, tone, and flow of my text',
      prompt: 'Review and improve the following text:',
    },
    {
      heading: 'Create a project proposal',
      body: 'Write a proposal with goals, timeline, and deliverables',
      prompt: 'Help me write a project proposal for',
    },
    {
      heading: 'Summarize a document',
      body: 'Condense a long document into key takeaways',
      prompt: 'Summarize the following document into key points:',
    },
  ],
  coding: [
    {
      heading: 'Debug my code',
      body: 'Find and fix issues in a code snippet',
      prompt: 'Help me debug the following code:',
    },
    {
      heading: 'Write a function',
      body: 'Generate a well-typed function with error handling',
      prompt: 'Write a function that',
    },
    {
      heading: 'Explain this code',
      body: 'Break down complex code into understandable pieces',
      prompt: 'Explain what the following code does:',
    },
    {
      heading: 'Review my pull request',
      body: 'Check for bugs, performance, and best practices',
      prompt: 'Review this code for bugs and improvements:',
    },
  ],
  research: [
    {
      heading: 'Compare options',
      body: 'Analyze pros and cons of different approaches',
      prompt: 'Compare the pros and cons of',
    },
    {
      heading: 'Explain a concept',
      body: 'Break down a complex topic in simple terms',
      prompt: 'Explain the concept of',
    },
    {
      heading: 'Find best practices',
      body: 'Research standards and recommended approaches',
      prompt: 'What are the best practices for',
    },
    {
      heading: 'Summarize findings',
      body: 'Compile research into a structured overview',
      prompt: 'Summarize the key findings on',
    },
  ],
  creative: [
    {
      heading: 'Brainstorm ideas',
      body: 'Generate creative concepts for a project',
      prompt: 'Brainstorm ideas for',
    },
    {
      heading: 'Write a story',
      body: 'Create an engaging narrative with characters',
      prompt: 'Write a short story about',
    },
    {
      heading: 'Design a concept',
      body: 'Explore product or visual design ideas',
      prompt: 'Help me design a concept for',
    },
    {
      heading: 'Create a tagline',
      body: 'Craft a memorable phrase for a brand or product',
      prompt: 'Create a catchy tagline for',
    },
  ],
};

// Category filters, shared by the toggle group and the composer mode menu.
const CATEGORIES = [
  {key: 'writing', label: 'Writing', icon: PencilSquareIcon},
  {key: 'coding', label: 'Coding', icon: CodeBracketIcon},
  {key: 'research', label: 'Research', icon: MagnifyingGlassIcon},
  {key: 'creative', label: 'Creative', icon: LightBulbIcon},
] as const;

// Composer mode menu: categories plus special modes.
const MODE_OPTIONS = [
  {key: 'auto', label: 'Auto', icon: SparklesIcon},
  ...CATEGORIES,
  {key: 'sensitive', label: 'Sensitive', icon: LockClosedIcon},
  {key: 'deep', label: 'Deep Mode', icon: ClockIcon},
] as const;

// Modes that insert a composer token instead of switching the active category.
const TOKEN_MODES: Record<string, string> = {
  sensitive: '/sensitive',
  deep: '/deep-mode',
};

// Composer trigger data: @ mentions and / commands.
const MENTION_ITEMS: SearchableItem<{role: string}>[] = [
  {id: 'cindy', label: 'Cindy Zhang', auxiliaryData: {role: 'Design Systems'}},
  {id: 'alex', label: 'Alex Johnson', auxiliaryData: {role: 'Frontend'}},
  {id: 'sam', label: 'Sam Rivera', auxiliaryData: {role: 'Backend'}},
  {id: 'jordan', label: 'Jordan Lee', auxiliaryData: {role: 'Product'}},
  {id: 'taylor', label: 'Taylor Kim', auxiliaryData: {role: 'Design'}},
  {id: 'morgan', label: 'Morgan Chen', auxiliaryData: {role: 'Infrastructure'}},
];

const COMMAND_ITEMS: SearchableItem<{description: string}>[] = [
  {
    id: 'summarize',
    label: 'summarize',
    auxiliaryData: {description: 'Summarize the conversation'},
  },
  {
    id: 'translate',
    label: 'translate',
    auxiliaryData: {description: 'Translate text to another language'},
  },
  {
    id: 'search',
    label: 'search',
    auxiliaryData: {description: 'Search the web or documents'},
  },
  {
    id: 'code',
    label: 'code',
    auxiliaryData: {description: 'Generate or explain code'},
  },
  {
    id: 'help',
    label: 'help',
    auxiliaryData: {description: 'Show available commands'},
  },
];

const mentionTrigger: ChatComposerTrigger = {
  character: '@',
  searchSource: createStaticSource(MENTION_ITEMS),
  renderItem: item => (
    <TypeaheadItem
      item={item}
      description={(item.auxiliaryData as {role: string})?.role}
    />
  ),
  onSelect: item => ({
    value: `@${item.id}`,
    label: item.label,
    variant: 'blue',
  }),
};

const commandTrigger: ChatComposerTrigger = {
  character: '/',
  searchSource: createStaticSource(COMMAND_ITEMS),
  renderItem: item => (
    <TypeaheadItem
      item={item}
      description={(item.auxiliaryData as {description: string})?.description}
    />
  ),
  onSelect: item => ({
    value: `/${item.label}`,
    label: `/${item.label}`,
    variant: 'yellow',
  }),
};

const composerTriggers = [mentionTrigger, commandTrigger];

// Main component

export default function AIChatTemplate() {
  const [mode, setMode] = useState<string | null>('auto');
  const [category, setCategory] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([
    'project_brief.pdf',
    'wireframes_v2.fig',
    'api_spec.yaml',
    'user_research.csv',
    'brand_guidelines.pdf',
  ]);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const composerInputRef = useRef<ChatComposerInputHandle>(null);
  const shouldFocusComposerRef = useRef(false);
  const dictation = useChatDictation({inputRef: composerInputRef});

  const activeMode = MODE_OPTIONS.find(m => m.key === mode) ?? MODE_OPTIONS[0];
  const suggestions = category ? CATEGORY_SUGGESTIONS[category] : null;

  const applySuggestion = (prompt: string) => {
    const input = composerInputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    if (document.activeElement) {
      window.getSelection()?.selectAllChildren(document.activeElement);
    }
    input.insertText(prompt);
  };

  const insertMention = (item: (typeof MENTION_ITEMS)[number]) => {
    const input = composerInputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    if (document.activeElement) {
      const sel = window.getSelection();
      sel?.selectAllChildren(document.activeElement);
      sel?.collapseToEnd();
    }
    input.insertToken({
      value: `@${item.id}`,
      label: item.label,
      variant: 'blue',
    });
  };

  const insertModeToken = (label: string) => {
    composerInputRef.current?.focus();
    composerInputRef.current?.insertToken({
      value: label,
      label,
      variant: 'orange',
    });
  };

  return (
    <Layout
      height="fill"
      contentWidth={720}
      padding={6}
      content={
        <LayoutContent>
          <VStack gap={8} vAlign="center" style={pageStyle}>
            {/* Greeting */}
            <VStack gap={1}>
              <HStack gap={2} vAlign="center">
                <Icon icon={SparklesIcon} size="md" color="accent" />
                <Text type="large" as="h2">
                  Hi, Andrew
                </Text>
              </HStack>
              <Text type="display-2" as="h1">
                Where should we start?
              </Text>
            </VStack>

            {/* Composer */}
            <ChatComposer
              onSubmit={() => {}}
              placeholder="Ask anything"
              input={
                <ChatComposerInput
                  handleRef={composerInputRef}
                  triggers={composerTriggers}
                  style={composerInput}
                  onFiles={files =>
                    setAttachments(prev => [...prev, ...files.map(f => f.name)])
                  }
                />
              }
              drawer={
                attachments.length > 0 ? (
                  <ChatComposerDrawer count={attachments.length}>
                    {attachments.map(name => (
                      <Token
                        key={name}
                        label={name}
                        onRemove={() =>
                          setAttachments(prev => prev.filter(n => n !== name))
                        }
                      />
                    ))}
                  </ChatComposerDrawer>
                ) : undefined
              }
              headerActions={
                <DropdownMenu
                  button={{
                    label: 'Reference',
                    variant: 'ghost',
                    size: 'sm',
                    icon: <Icon icon={AtSymbolIcon} size="sm" />,
                    isIconOnly: true,
                  }}
                  hasChevron={false}
                  menuWidth={240}>
                  {MENTION_ITEMS.map(item => (
                    <DropdownMenuItem
                      key={item.id}
                      label={item.label}
                      description={item.auxiliaryData?.role}
                      onClick={() => insertMention(item)}
                    />
                  ))}
                </DropdownMenu>
              }
              footerActions={
                <>
                  <DropdownMenu
                    button={{
                      label: activeMode.label,
                      variant: 'ghost',
                      size: 'md',
                      icon: <Icon icon={activeMode.icon} size="sm" />,
                      children: activeMode.label,
                    }}
                    menuWidth={200}
                    isMenuOpen={isModeMenuOpen}
                    onOpenChange={isOpen => {
                      setIsModeMenuOpen(isOpen);
                      // Restore focus to the composer after inserting a mode token.
                      if (!isOpen && shouldFocusComposerRef.current) {
                        shouldFocusComposerRef.current = false;
                        setTimeout(() => composerInputRef.current?.focus(), 50);
                      }
                    }}
                    items={MODE_OPTIONS.flatMap(opt => {
                      const item = {
                        label: opt.label,
                        icon: opt.icon,
                        onClick: () => {
                          const tokenLabel = TOKEN_MODES[opt.key];
                          if (tokenLabel) {
                            insertModeToken(tokenLabel);
                            shouldFocusComposerRef.current = true;
                          } else {
                            setMode(opt.key);
                          }
                        },
                      };
                      return opt.key === 'sensitive'
                        ? [{type: 'divider' as const}, item]
                        : [item];
                    })}
                  />
                  <DropdownMenu
                    button={{
                      label: 'Settings',
                      variant: 'ghost',
                      size: 'md',
                      icon: <Icon icon={Cog6ToothIcon} size="sm" />,
                      children: 'Settings',
                    }}
                    menuWidth={200}
                    items={[
                      {label: 'Preferences', onClick: () => {}},
                      {label: 'Keyboard shortcuts', onClick: () => {}},
                      {label: 'About', onClick: () => {}},
                    ]}
                  />
                </>
              }
              sendActions={<ChatDictationButton dictation={dictation} />}
            />

            {/* Category filters + suggestion cards */}
            <VStack gap={6} style={categories}>
              <ToggleButtonGroup
                label="Category"
                value={category}
                onChange={setCategory}
                size="lg">
                {CATEGORIES.map(cat => (
                  <ToggleButton
                    key={cat.key}
                    value={cat.key}
                    label={cat.label}
                    icon={<Icon icon={cat.icon} size="sm" />}
                  />
                ))}
              </ToggleButtonGroup>

              {suggestions && (
                <Grid columns={{minWidth: 280}} gap={3}>
                  {suggestions.map(suggestion => (
                    <ClickableCard
                      key={suggestion.heading}
                      label={suggestion.heading}
                      variant="muted"
                      padding={3}
                      onClick={() => {
                        applySuggestion(suggestion.prompt);
                        setMode(category);
                      }}>
                      <VStack gap={0.5}>
                        <Heading level={4}>{suggestion.heading}</Heading>
                        <Text type="body" color="secondary" size="xsm">
                          {suggestion.body}
                        </Text>
                      </VStack>
                    </ClickableCard>
                  ))}
                </Grid>
              )}
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
