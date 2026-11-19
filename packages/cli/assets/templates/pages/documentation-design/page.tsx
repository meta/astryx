// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, useMemo, type CSSProperties} from 'react';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Card} from '@astryxdesign/core/Card';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {Token} from '@astryxdesign/core/Token';
import {Banner} from '@astryxdesign/core/Banner';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {HStack, VStack, StackItem} from '@astryxdesign/core/Stack';
import {Layout, LayoutContent, LayoutPanel} from '@astryxdesign/core/Layout';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {Table, pixel} from '@astryxdesign/core/Table';
import {Icon} from '@astryxdesign/core/Icon';
import {Section} from '@astryxdesign/core/Section';
import {Center} from '@astryxdesign/core/Center';
import {Outline, type OutlineItem} from '@astryxdesign/core/Outline';
import {
  ArrowTopRightOnSquareIcon,
  ArrowsPointingOutIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

const tabListFlush: CSSProperties = {marginInlineStart: '-12px'};
const outlinePanel: CSSProperties = {
  position: 'sticky',
  top: 24,
  alignSelf: 'start',
  paddingBlockStart: 120,
};

const COMPONENT_OUTLINE_ITEMS: OutlineItem[] = [
  {id: 'usage', label: 'Usage', level: 2},
  {id: 'best-practices', label: 'Best practices', level: 3},
  {id: 'examples', label: 'Examples', level: 2},
];

// ---------------------------------------------------------------------------
// DialogPreview — stateful dialog preview for component previews
// ---------------------------------------------------------------------------

function DialogPreview() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <VStack gap={3}>
      <Heading level={3}>Dialog</Heading>
      <Button
        label="Open Dialog"
        variant="primary"
        onClick={() => setIsOpen(true)}
      />
      <Dialog isOpen={isOpen} onOpenChange={setIsOpen}>
        <DialogHeader title="Example Dialog" onOpenChange={setIsOpen} />
        <Section padding={4}>
          <Text type="body">
            This is an example dialog. Dialogs are used to require user action
            or display important information that needs acknowledgment.
          </Text>
        </Section>
      </Dialog>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const COMPONENT_CATEGORIES = [
  {
    label: 'Core',
    items: [
      {
        key: 'appshell',
        name: 'AppShell',
        desc: 'AppShell provides a foundational page layout with header, sidebar, and content regions. Use it to establish consistent structure across your application.',
      },
      {
        key: 'avatar',
        name: 'Avatar',
        desc: 'Avatars represent a person or entity with an image, initials, or icon. They are commonly used in user profiles, comments, and contact lists.',
      },
      {
        key: 'badge',
        name: 'Badge',
        desc: 'Badges display small counts or status labels. They can be attached to icons, buttons, or list items to surface key information at a glance.',
      },
      {
        key: 'banner',
        name: 'Banner',
        desc: 'Banners show important, non-modal messages at the top of a page or section. They communicate status, warnings, or promotional information.',
      },
      {
        key: 'button',
        name: 'Button',
        desc: 'Buttons let people take action. They can be used in forms, dialogs, and toolbars, or as standalone links.',
      },
      {
        key: 'calendar',
        name: 'Calendar',
        desc: 'Calendar provides a date-picking grid for selecting single dates or date ranges. It integrates with form fields for date input.',
      },
      {
        key: 'dialog',
        name: 'Dialog',
        desc: 'Dialogs are modal overlays that require user attention or action before continuing. They are used for confirmations, forms, and critical decisions.',
      },
      {
        key: 'dropdownmenu',
        name: 'DropdownMenu',
        desc: 'DropdownMenu presents a list of actions or options in a floating overlay. It is triggered by a button and supports nested submenus.',
      },
      {
        key: 'empty-state',
        name: 'EmptyState',
        desc: 'EmptyState provides a placeholder when there is no content to display. It guides users with a message, illustration, and optional call-to-action.',
      },
      {
        key: 'hovercard',
        name: 'HoverCard',
        desc: 'HoverCard shows a rich preview of content when users hover over a trigger element. It is ideal for previewing profiles, links, or details.',
      },
      {
        key: 'icon',
        name: 'Icon',
        desc: 'Icons are small visual symbols that represent actions, objects, or concepts. They improve scannability and reinforce meaning alongside text.',
      },
      {
        key: 'kbd',
        name: 'Kbd',
        desc: 'Kbd renders keyboard shortcut hints in a styled inline element. Use it to show users which key combinations perform specific actions.',
      },
      {
        key: 'link',
        name: 'Link',
        desc: 'Links provide navigation between pages or to external resources. They follow accessible anchor semantics with visual affordance.',
      },
      {
        key: 'list',
        name: 'List',
        desc: 'List displays a vertical set of related items. It supports selection, icons, and metadata for building menus, nav lists, and more.',
      },
      {
        key: 'metadatalist',
        name: 'MetadataList',
        desc: 'MetadataList displays key-value pairs in a structured layout. Use it for detail panels, settings summaries, and record information.',
      },
      {
        key: 'moremenu',
        name: 'MoreMenu',
        desc: 'MoreMenu provides an overflow menu triggered by an icon button. It collects secondary actions that do not fit in the primary toolbar.',
      },
      {
        key: 'overflowlist',
        name: 'OverflowList',
        desc: 'OverflowList renders as many items as fit in the available space and collapses the rest into an overflow menu automatically.',
      },
      {
        key: 'pagination',
        name: 'Pagination',
        desc: 'Pagination lets users navigate through pages of content. It supports page numbers, previous/next controls, and page-size selection.',
      },
      {
        key: 'popover',
        name: 'Popover',
        desc: 'Popover displays rich content in a floating panel anchored to a trigger element. It is used for forms, filters, and contextual tools.',
      },
      {
        key: 'progressbar',
        name: 'ProgressBar',
        desc: 'ProgressBar shows the completion status of a task or process. It provides visual feedback for uploads, installations, and multi-step flows.',
      },
      {
        key: 'skeleton',
        name: 'Skeleton',
        desc: 'Skeleton renders placeholder shapes that mimic content layout while loading. It reduces perceived wait time and prevents layout shifts.',
      },
      {
        key: 'spinner',
        name: 'Spinner',
        desc: 'Spinner indicates that a process is in progress when the duration is unknown. It draws attention without blocking the interface.',
      },
      {
        key: 'statusdot',
        name: 'StatusDot',
        desc: 'StatusDot shows a small colored indicator for online, offline, busy, or custom statuses. It is often paired with avatars or list items.',
      },
      {
        key: 'table',
        name: 'Table',
        desc: 'Table displays structured data in rows and columns with support for sorting, selection, and custom cell rendering.',
      },
      {
        key: 'thumbnail',
        name: 'Thumbnail',
        desc: 'Thumbnail renders a small image preview with consistent sizing and optional rounded corners. It is used in media lists, cards, and galleries.',
      },
      {
        key: 'timestamp',
        name: 'Timestamp',
        desc: 'Timestamp formats and displays dates and times with relative or absolute labels. It updates automatically to stay current.',
      },
      {
        key: 'toast',
        name: 'Toast',
        desc: 'Toasts display brief, non-blocking notifications at the edge of the screen. They auto-dismiss and are used for success, error, or info messages.',
      },
      {
        key: 'togglebutton',
        name: 'ToggleButton',
        desc: 'ToggleButton is a button that switches between an on and off state. Use it for binary options like bookmarking, favoriting, or muting.',
      },
      {
        key: 'token',
        name: 'Token',
        desc: 'Tokens display compact metadata labels such as tags, categories, or filters. They can be dismissible and support selection state.',
      },
      {
        key: 'tooltip',
        name: 'Tooltip',
        desc: 'Tooltips show concise helper text when users hover over or focus an element. They clarify icons, truncated labels, and controls.',
      },
      {
        key: 'treelist',
        name: 'TreeList',
        desc: 'TreeList renders hierarchical data in an expandable tree structure. It supports multi-level nesting, selection, and lazy loading.',
      },
    ],
  },
  {
    label: 'Typography',
    items: [
      {
        key: 'heading',
        name: 'Heading',
        desc: 'Heading renders semantic section titles from h1 through h6. It establishes visual hierarchy and supports multiple weight and size options.',
      },
      {
        key: 'text',
        name: 'Text',
        desc: 'Text renders body copy, labels, and supporting content with consistent typography. It supports sizes from display down to caption.',
      },
    ],
  },
  {
    label: 'Layout',
    items: [
      {
        key: 'aspectratio',
        name: 'AspectRatio',
        desc: 'AspectRatio constrains its child to a specified width-to-height ratio. Use it for responsive images, videos, and embedded media.',
      },
      {
        key: 'card',
        name: 'Card',
        desc: 'Cards group related content and actions in a contained surface. They can include headers, media, body text, and action bars.',
      },
      {
        key: 'center',
        name: 'Center',
        desc: 'Center aligns its child horizontally and vertically within the available space. It is useful for empty states, loading screens, and hero sections.',
      },
      {
        key: 'divider',
        name: 'Divider',
        desc: 'Dividers separate content into distinct sections with a subtle or strong horizontal line. They can optionally include a label.',
      },
      {
        key: 'grid',
        name: 'Grid',
        desc: 'Grid provides a CSS grid-based layout container with configurable columns, rows, and gap. It simplifies responsive multi-column designs.',
      },
      {
        key: 'layout',
        name: 'Layout',
        desc: 'Layout provides foundational page-level primitives for header, sidebar, and content regions. It establishes consistent spacing and structure.',
      },
      {
        key: 'section',
        name: 'Section',
        desc: 'Section wraps a block of content with consistent vertical spacing and an optional heading. It structures pages into logical groups.',
      },
      {
        key: 'stack',
        name: 'Stack',
        desc: 'Stack arranges child elements in a row or column with consistent gap spacing. It is the primary tool for one-dimensional layout composition.',
      },
      {
        key: 'toolbar',
        name: 'Toolbar',
        desc: 'Toolbar arranges a row of action buttons and controls in a compact, aligned strip. It is used at the top of panels, editors, and cards.',
      },
    ],
  },
  {
    label: 'Navigation',
    items: [
      {
        key: 'breadcrumbs',
        name: 'Breadcrumbs',
        desc: "Breadcrumbs show the user's current location within a navigation hierarchy. They provide quick links back to parent pages.",
      },
      {
        key: 'mobilenav',
        name: 'MobileNav',
        desc: 'MobileNav provides a responsive navigation menu optimized for small screens. It typically slides in from the edge of the viewport.',
      },
      {
        key: 'sidenav',
        name: 'SideNav',
        desc: 'SideNav renders a vertical navigation panel with links, sections, and collapsible groups. It is used as the primary nav in dashboard layouts.',
      },
      {
        key: 'tablist',
        name: 'TabList',
        desc: 'TabList switches between content views using a horizontal row of tabs. Only one tab is active at a time, and content changes without a page reload.',
      },
      {
        key: 'topnav',
        name: 'TopNav',
        desc: 'TopNav provides an app-level navigation bar across the top of the page. It holds branding, primary links, search, and user actions.',
      },
    ],
  },
  {
    label: 'Form',
    items: [
      {
        key: 'checkboxinput',
        name: 'CheckboxInput',
        desc: 'CheckboxInput renders a single checkbox with a label. It is used for boolean opt-in choices like terms acceptance or feature toggles.',
      },
      {
        key: 'selector',
        name: 'Selector',
        desc: 'Selector lets users pick a single item from a dropdown list. It supports search, grouping, and custom option rendering.',
      },
      {
        key: 'switch',
        name: 'Switch',
        desc: 'Switch toggles a setting between on and off states with immediate effect. It is used for preferences, feature flags, and real-time controls.',
      },
      {
        key: 'textinput',
        name: 'TextInput',
        desc: 'TextInput is a single-line text field for short user input like names, emails, and search queries. It supports icons, prefixes, and validation.',
      },
      {
        key: 'typeahead',
        name: 'Typeahead',
        desc: 'Typeahead provides an autocomplete search input that suggests results as the user types. It supports async data sources and custom rendering.',
      },
    ],
  },
  {
    label: 'Components',
    items: [
      {
        key: 'codeblock',
        name: 'CodeBlock',
        desc: 'CodeBlock displays formatted, syntax-highlighted source code. It supports line numbers, copy-to-clipboard, and language detection.',
      },
      {
        key: 'collapsible',
        name: 'Collapsible',
        desc: 'Collapsible wraps content that can be expanded or collapsed with a trigger. It is used for FAQs, advanced settings, and progressive disclosure.',
      },
      {
        key: 'markdown',
        name: 'Markdown',
        desc: 'Markdown renders markdown-formatted text into styled HTML. It supports headings, lists, links, code blocks, and inline formatting.',
      },
    ],
  },
  {
    label: 'Chat',
    items: [
      {
        key: 'chat',
        name: 'Chat',
        desc: 'Chat provides a conversational message interface with message bubbles, input, and thread support. It is used for AI assistants and messaging UIs.',
      },
    ],
  },
  {
    label: 'CommandPalette',
    items: [
      {
        key: 'commandpalette',
        name: 'CommandPalette',
        desc: 'CommandPalette is a keyboard-driven command menu for quick navigation and actions. It is opened with a hotkey and supports fuzzy search.',
      },
    ],
  },
];

const COMPONENT_DOCS: Record<
  string,
  {
    usage: string;
    bestPractices: {type: 'do' | 'dont'; text: string}[];
    examples: {title: string; description: string; code: string}[];
  }
> = {
  button: {
    usage:
      'Buttons provide visual cues for actions and events. These fundamental components allow users to commit actions and navigate a page flow. Use a Button when a user needs to submit a form, start a new task or action, or trigger a new UI element to appear on the page.',
    bestPractices: [
      {
        type: 'do',
        text: 'Convey clear action hierarchy: Each surface should only have 1 primary button. A majority of buttons should be in default or flat style.',
      },
      {
        type: 'do',
        text: 'Promote clarity: Consider labels alongside icons where appropriate.',
      },
      {
        type: 'dont',
        text: 'Overuse primary or special buttons: Overusing colored buttons will result in a page with less intentionality, create visual confusion and a lack of page hierarchy.',
      },
    ],
    examples: [
      {
        title: 'Semantics',
        description:
          'We have four semantic buttons types: flat, default, primary, and destructive. Flat buttons are used to limit visual prominence, whereas primary emphasizes a single action. Use destructive for deletions that trigger dialog confirmations.',
        code: `<Button label="Flat" variant="ghost" />\n<Button label="Default" variant="secondary" />\n<Button label="Primary" variant="primary" />\n<Button label="Destructive" variant="destructive" />`,
      },
      {
        title: 'Default button with badge',
        description:
          'Buttons can include a badge to highlight new or updated actions.',
        code: `<Button\n  label="Button"\n  variant="default"\n/>`,
      },
    ],
  },
};

function getComponentName(key: string): string {
  for (const cat of COMPONENT_CATEGORIES) {
    const item = cat.items.find(i => i.key === key);
    if (item) {
      return item.name;
    }
  }
  return key;
}

function getComponentDocs(key: string) {
  if (COMPONENT_DOCS[key]) {
    return COMPONENT_DOCS[key];
  }
  const name = getComponentName(key);
  let desc = '';
  for (const cat of COMPONENT_CATEGORIES) {
    const item = cat.items.find(i => i.key === key);
    if (item) {
      desc = item.desc;
      break;
    }
  }
  return {
    usage: desc,
    bestPractices: [
      {
        type: 'do' as const,
        text: `Use ${name} in the appropriate context to provide the functionality described above.`,
      },
      {
        type: 'do' as const,
        text: `Pair ${name} with related components to create cohesive, accessible interfaces.`,
      },
      {
        type: 'dont' as const,
        text: `Use ${name} when a simpler alternative achieves the same goal with less complexity.`,
      },
    ],
    examples: [
      {
        title: `Basic ${name}`,
        description: `A simple example of the ${name} component with default settings.`,
        code: `<${name} />`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// ComponentDetailView
// ---------------------------------------------------------------------------

function ComponentDetailView({activeNav}: {activeNav: string}) {
  const [exampleTabs, setExampleTabs] = useState<Record<string, string>>({});
  // Mobile first: the server render and a shared static copy, which run no
  // script, get one column with the section links on top. That reads well at
  // every width; once script runs, wide screens move the links to the rail.
  const isMobile = useMediaQuery('(max-width: 768px)', true);

  const EXAMPLE_PREVIEWS: Record<string, React.ReactNode[]> = {
    button: [
      <HStack
        key="semantics"
        gap={3}
        vAlign="center"
        hAlign="center"
        wrap="wrap">
        <Button label="Flat" variant="ghost" />
        <Button label="Default" variant="secondary" />
        <Button label="Primary" variant="primary" />
        <Button label="Destructive" variant="destructive" />
      </HStack>,
      <Button key="badge" label="Button" variant="secondary" />,
    ],
  };

  const COMPONENT_PREVIEWS: Record<string, React.ReactNode> = {
    button: (
      <Button
        label="Button"
        variant="secondary"
        icon={<Icon icon={PlusIcon} />}
        endContent={<Badge label="New" variant="info" />}
      />
    ),
    avatar: <Avatar name="Alice" size="lg" />,
    badge: <Badge label="Success" variant="success" />,
    card: (
      <Card>
        <VStack gap={2}>
          <Heading level={4}>Card Title</Heading>
          <Text type="body" color="secondary">
            Cards group related content and actions.
          </Text>
        </VStack>
      </Card>
    ),
    banner: (
      <Banner status="info" title="Information">
        <Text type="body">This is an informational banner message.</Text>
      </Banner>
    ),
    dialog: <DialogPreview />,
    text: <Text type="body">Body text</Text>,
    divider: <Divider />,
    token: <Token label="Design" />,
    tooltip: (
      <Tooltip content="Primary action">
        <Button label="Hover me" variant="primary" />
      </Tooltip>
    ),
  };

  const docs = useMemo(() => getComponentDocs(activeNav), [activeNav]);
  const previews = EXAMPLE_PREVIEWS[activeNav] ?? [];

  return (
    <Layout
      height="auto"
      contentWidth={960}
      end={
        isMobile ? undefined : (
          <LayoutPanel
            isScrollable={false}
            label="On this page"
            role="complementary"
            style={outlinePanel}>
            <Outline items={COMPONENT_OUTLINE_ITEMS} />
          </LayoutPanel>
        )
      }
      content={
        <LayoutContent role="main" isScrollable={false} padding={8}>
          <VStack gap={8}>
            <VStack gap={2}>
              <Text as="h1" type="display-1">
                {getComponentName(activeNav)}
              </Text>
              <Text type="supporting" color="secondary">
                March 30, 2026 · Updated 5:40 p.m. PST
              </Text>
              {isMobile && <Outline items={COMPONENT_OUTLINE_ITEMS} />}
            </VStack>

            <Card variant="muted" padding={0}>
              <Center height={360}>
                {COMPONENT_PREVIEWS[activeNav] ?? (
                  <Text type="supporting" color="secondary">
                    Preview coming soon
                  </Text>
                )}
              </Center>
            </Card>

            <VStack gap={4}>
              <Heading id="usage" level={2}>
                Usage
              </Heading>
              <Text type="large" weight="normal">
                {docs.usage}
              </Text>
              <Heading id="best-practices" level={3}>
                Best practices
              </Heading>
              <Table
                data={docs.bestPractices as Record<string, unknown>[]}
                dividers="none"
                columns={[
                  {
                    key: 'type',
                    header: 'Guidance',
                    width: pixel(125),
                    renderCell: (item: Record<string, unknown>) => (
                      <Badge
                        label={item.type === 'do' ? 'Do' : 'Dont'}
                        variant={item.type === 'do' ? 'success' : 'error'}
                      />
                    ),
                  },
                  {
                    key: 'text',
                    header: 'Practices',
                    renderCell: (item: Record<string, unknown>) => (
                      <Text type="body" textWrap="wrap">
                        {item.text as string}
                      </Text>
                    ),
                  },
                ]}
                density="spacious"
              />
            </VStack>

            <Divider />

            <VStack gap={4}>
              <Heading id="examples" level={2}>
                Examples
              </Heading>
              <Text type="large" weight="normal">
                Explore common configurations, variations, and states for this
                component.
              </Text>
            </VStack>
            <VStack gap={8}>
              {docs.examples.map((example, i) => {
                const tabKey = `${activeNav}-${i}`;
                const activeTab = exampleTabs[tabKey] ?? 'description';
                return (
                  <Card key={i} padding={0}>
                    <Section padding={3} variant="transparent">
                      {/* On a narrow screen the actions move under the title
                          instead of running past the card. */}
                      <HStack gap={3} vAlign="center" wrap="wrap">
                        <StackItem size="fill">
                          <Text type="body" weight="medium">
                            {example.title}
                          </Text>
                        </StackItem>
                        <HStack gap={1} vAlign="center" wrap="wrap">
                          <Button
                            label="Open in Craft"
                            variant="ghost"
                            size="sm"
                            icon={<Icon icon={ArrowTopRightOnSquareIcon} />}
                          />
                          <Button
                            label="Send to CLI"
                            variant="ghost"
                            size="sm"
                          />
                          <IconButton
                            label="Fullscreen"
                            variant="ghost"
                            size="sm"
                            icon={<Icon icon={ArrowsPointingOutIcon} />}
                          />
                        </HStack>
                      </HStack>
                    </Section>
                    <Center height={280}>
                      {previews[i] ?? (
                        <Text type="supporting" color="secondary">
                          Preview coming soon
                        </Text>
                      )}
                    </Center>
                    <Section variant="muted" padding={3} dividers={['top']}>
                      <VStack gap={3}>
                        <TabList
                          aria-label={`${example.title} details`}
                          value={activeTab}
                          onChange={value =>
                            setExampleTabs(prev => ({
                              ...prev,
                              [tabKey]: value,
                            }))
                          }
                          size="sm"
                          style={tabListFlush}>
                          <Tab value="description" label="Description" />
                          <Tab value="code" label="Code" />
                        </TabList>
                        {activeTab === 'description' ? (
                          <Text type="body">{example.description}</Text>
                        ) : (
                          <CodeBlock
                            code={example.code}
                            language="tsx"
                            width="100%"
                          />
                        )}
                      </VStack>
                    </Section>
                  </Card>
                );
              })}
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DesignDocumentationPage() {
  return <ComponentDetailView activeNav="button" />;
}
