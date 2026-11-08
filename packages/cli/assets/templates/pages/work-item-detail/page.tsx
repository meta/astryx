// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {type ReactNode, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {colorVars, radiusVars} from '@astryxdesign/core/theme/tokens.stylex';
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutPanel,
  VStack,
  HStack,
  StackItem,
  Section,
} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Badge, type BadgeVariant} from '@astryxdesign/core/Badge';
import {Token} from '@astryxdesign/core/Token';
import {Tokenizer} from '@astryxdesign/core/Tokenizer';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import {Avatar} from '@astryxdesign/core/Avatar';
import {AvatarGroup} from '@astryxdesign/core/AvatarGroup';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import type {DropdownMenuOption} from '@astryxdesign/core/DropdownMenu';
import {Link} from '@astryxdesign/core/Link';
import {Icon} from '@astryxdesign/core/Icon';
import {rtlStyles} from '@astryxdesign/core/utils';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Divider} from '@astryxdesign/core/Divider';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Card} from '@astryxdesign/core/Card';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {List, ListItem} from '@astryxdesign/core/List';
import {CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Selector} from '@astryxdesign/core/Selector';
import {TextArea} from '@astryxdesign/core/TextArea';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {
  ArrowLeftIcon,
  LinkIcon,
  DocumentTextIcon,
  PencilIcon,
  TrashIcon,
  PhotoIcon,
  ViewColumnsIcon,
  InformationCircleIcon,
  BellIcon,
  ShareIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

const styles = stylex.create({
  // A vertical rule has no intrinsic height and the breadcrumb row centers its
  // children rather than stretching them, so the separator needs its own.
  breadcrumbRule: {
    height: 12,
  },
  // Fixed square tile the attachment icon centers in. AspectRatio keeps it
  // square; the width is what stops it growing with the row.
  attachmentTile: {
    width: 40,
    backgroundColor: colorVars['--color-background-muted'],
    borderRadius: radiusVars['--radius-element'],
  },
});

// ─── Editable fields ────────────────────────────────────────────────────────
/** Shape shared by every Selector option list on this page. */
type Option = {value: string; label: string; icon?: ReactNode};

const STATUS_OPTIONS: Option[] = [
  {
    value: 'todo',
    label: 'To Do',
    icon: <StatusDot variant="neutral" label="To Do" />,
  },
  {
    value: 'in_progress',
    label: 'In Progress',
    icon: <StatusDot variant="accent" label="In Progress" />,
  },
  {
    value: 'in_review',
    label: 'In Review',
    icon: <StatusDot variant="warning" label="In Review" />,
  },
  {
    value: 'done',
    label: 'Done',
    icon: <StatusDot variant="success" label="Done" />,
  },
];

const ASSIGNEE_OPTIONS: Option[] = [
  {
    value: 'priya-shah',
    label: 'Priya Shah',
    icon: <Avatar name="Priya Shah" size="xsm" />,
  },
  {
    value: 'marcus-chen',
    label: 'Marcus Chen',
    icon: <Avatar name="Marcus Chen" size="xsm" />,
  },
  {
    value: 'sofia-alvarez',
    label: 'Sofia Alvarez',
    icon: <Avatar name="Sofia Alvarez" size="xsm" />,
  },
];

// The badge colour rides along with the option so the list stays the single
// source of truth; a separate switch would have to be kept in step by hand.
const PRIORITY_OPTIONS: (Option & {badge: BadgeVariant})[] = [
  {value: 'high', label: 'High', badge: 'red'},
  {value: 'mid', label: 'Mid', badge: 'orange'},
  {value: 'low', label: 'Low', badge: 'yellow'},
  {value: 'none', label: 'None', badge: 'neutral'},
];

type LabelOption = SearchableItem & {color: 'blue' | 'green' | 'purple'};

const LABEL_OPTIONS: LabelOption[] = [
  {id: 'onboarding', label: 'Onboarding', color: 'purple'},
  {id: 'q1-goal', label: 'Q1 goal', color: 'blue'},
  {id: 'growth', label: 'Growth', color: 'green'},
];

const LABEL_SEARCH_SOURCE: SearchSource<LabelOption> = {
  search: query =>
    LABEL_OPTIONS.filter(option =>
      option.label.toLowerCase().includes(query.toLowerCase()),
    ),
  bootstrap: () => LABEL_OPTIONS,
};

/** Every editable field on the work item, held as one unit of page state. */
type WorkItemFields = {
  status: string;
  assignee: string;
  priority: string;
  labels: LabelOption[];
};

/**
 * The options list defines the valid values, so an unrecognised one falls back
 * to the first entry rather than leaving the slot empty.
 */
function optionFor<T extends Option>(options: T[], value: string): T {
  return options.find(option => option.value === value) ?? options[0];
}

function PriorityBadge({value}: {value: string}) {
  const {label, badge} = optionFor(PRIORITY_OPTIONS, value);
  return <Badge variant={badge} label={label} />;
}

// ─── Work item data ─────────────────────────────────────────────────────────
type Subtask = {
  id: number;
  title: string;
  isDone: boolean;
  assignee: string;
  due: string;
};

const SUBTASKS: Subtask[] = [
  {
    id: 1,
    title: 'Audit current onboarding flow and note friction points',
    isDone: true,
    assignee: 'Priya Shah',
    due: '2026-03-04',
  },
  {
    id: 2,
    title: 'Interview five recent sign-ups about their first-run experience',
    isDone: true,
    assignee: 'Marcus Chen',
    due: '2026-03-06',
  },
  {
    id: 3,
    title: 'Draft revised welcome sequence with three variants',
    isDone: false,
    assignee: 'Priya Shah',
    due: '2026-03-11',
  },
  {
    id: 4,
    title: 'Review copy with content design and legal',
    isDone: false,
    assignee: 'Sofia Alvarez',
    due: '2026-03-13',
  },
  {
    id: 5,
    title: 'Ship variant A to 10% of new accounts and measure activation',
    isDone: false,
    assignee: 'Marcus Chen',
    due: '2026-03-18',
  },
];

type Attachment = {
  id: string;
  kind: 'link' | 'image' | 'file';
  title: string;
  subtitle: string;
  href: string;
};

const ATTACHMENTS: Attachment[] = [
  {
    id: 'audit-notes',
    kind: 'link',
    title: 'Onboarding audit notes',
    subtitle: 'docs.example.com',
    href: '#',
  },
  {
    id: 'funnel-dashboard',
    kind: 'link',
    title: 'Sign-up funnel dashboard',
    subtitle: 'analytics.example.com',
    href: '#',
  },
  {
    id: 'welcome-screen',
    kind: 'image',
    title: 'welcome-screen-v3.png',
    subtitle: '1.4 MB · Added 2 days ago',
    href: '#',
  },
  {
    id: 'transcripts',
    kind: 'file',
    title: 'Interview transcripts.pdf',
    subtitle: '820 KB · Added 3 days ago',
    href: '#',
  },
];

const ATTACHMENT_ICONS = {
  link: LinkIcon,
  image: PhotoIcon,
  file: DocumentTextIcon,
};

// Identical for every row, so it is built once rather than per render.
const ATTACHMENT_ACTIONS: DropdownMenuOption[] = [
  {label: 'Edit', icon: PencilIcon},
  {label: 'Delete', icon: TrashIcon, variant: 'destructive'},
];

const HEADER_ACTIONS = [
  {label: 'Watch', icon: EyeIcon},
  {label: 'Share', icon: ShareIcon},
  {label: 'Notify', icon: BellIcon},
];

const WATCHERS = [
  'Priya Shah',
  'Marcus Chen',
  'Sofia Alvarez',
  'Jordan Blake',
  'Lin Wei',
  'Aisha Okafor',
];

const LINKED_ITEMS = [
  {id: 'PLT-238', title: 'Track activation rate by acquisition channel'},
  {id: 'PLT-241', title: 'Welcome email A/B test — copy variants'},
];

type ActivityEntry = {
  id: number;
  kind: 'comment' | 'event';
  author: string;
  time: string;
  body: string;
};

const ACTIVITY: ActivityEntry[] = [
  {
    id: 1,
    kind: 'event',
    author: 'Sofia Alvarez',
    time: '2026-03-02T14:12:00Z',
    body: 'created this task',
  },
  {
    id: 2,
    kind: 'comment',
    author: 'Priya Shah',
    time: '2026-03-03T09:41:00Z',
    body: 'Finished the audit — three biggest friction points are the account form length, the empty first-run dashboard, and the tour tooltip cluster on step two. Full notes in the linked doc.',
  },
  {
    id: 3,
    kind: 'event',
    author: 'Marcus Chen',
    time: '2026-03-03T15:20:00Z',
    body: 'changed status from To Do to In Progress',
  },
  {
    id: 4,
    kind: 'comment',
    author: 'Marcus Chen',
    time: '2026-03-04T10:05:00Z',
    body: 'Interviews wrapped. A consistent theme: people expect a personalized starting workspace and get an empty one. Suggest we scope a template step into variant A.',
  },
  {
    id: 5,
    kind: 'event',
    author: 'Sofia Alvarez',
    time: '2026-03-04T16:48:00Z',
    body: 'assigned this task to Priya Shah',
  },
];

// ─── Shared pieces ──────────────────────────────────────────────────────────
// A Section escapes its container's padding by design — it cancels
// --container-padding-* with negative margins so fills can run edge to edge.
// LayoutContent's own padding is therefore invisible in the main column; this
// is the value that actually sets its inset.
const SECTION_PADDING = 6;

function SectionHeader({
  title,
  level = 2,
  action,
}: {
  title: string;
  level?: 2 | 3;
  action?: ReactNode;
}) {
  return (
    <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
      <Heading level={level}>{title}</Heading>
      {action}
    </HStack>
  );
}

function PersonRow({name}: {name: string}) {
  return (
    <HStack gap={2} vAlign="center">
      <Avatar name={name} size="xsm" />
      <Text type="body">{name}</Text>
    </HStack>
  );
}

// ─── Page header ────────────────────────────────────────────────────────────
function PageHeader({
  fields,
  onFieldsChange,
  isDetailsOpen,
  onToggleDetails,
  isNarrow,
}: {
  fields: WorkItemFields;
  onFieldsChange: (patch: Partial<WorkItemFields>) => void;
  isDetailsOpen: boolean;
  onToggleDetails: () => void;
  isNarrow: boolean;
}) {
  return (
    <LayoutHeader padding={6} hasDivider>
      <VStack gap={4}>
        <HStack gap={4} vAlign="start" hAlign="between">
          <VStack gap={2}>
            <HStack gap={4} vAlign="center" wrap="wrap">
              <Link href="#" type="supporting" color="secondary">
                <HStack as="span" gap={1} vAlign="center">
                  <Icon
                    icon={ArrowLeftIcon}
                    size="sm"
                    xstyle={rtlStyles.mirror}
                  />
                  All Tasks
                </HStack>
              </Link>
              <Divider orientation="vertical" xstyle={styles.breadcrumbRule} />
              <Text type="supporting" color="secondary">
                PLT-247
              </Text>
              <Divider orientation="vertical" xstyle={styles.breadcrumbRule} />
              <Text type="supporting" color="secondary">
                Platform / Onboarding
              </Text>
            </HStack>
            <Heading level={1} maxLines={2}>
              Refresh onboarding flow for workspaces
            </Heading>
          </VStack>
          {isNarrow ? (
            <IconButton
              label="Show details"
              variant="secondary"
              icon={<Icon icon={InformationCircleIcon} size="sm" />}
              onClick={onToggleDetails}
            />
          ) : (
            <HStack gap={1}>
              {HEADER_ACTIONS.map(action => (
                <IconButton
                  key={action.label}
                  label={action.label}
                  variant="secondary"
                  icon={<Icon icon={action.icon} size="sm" />}
                />
              ))}
              <Button
                label={isDetailsOpen ? 'Hide details' : 'Show details'}
                variant="secondary"
                icon={<Icon icon={ViewColumnsIcon} size="sm" />}
                onClick={onToggleDetails}
              />
            </HStack>
          )}
        </HStack>
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Selector
            label="Status"
            isLabelHidden
            value={fields.status}
            onChange={status => onFieldsChange({status})}
            options={STATUS_OPTIONS}
          />
          <Selector
            label="Priority"
            isLabelHidden
            value={fields.priority}
            onChange={priority => onFieldsChange({priority})}
            options={PRIORITY_OPTIONS}
            renderValue={option => <PriorityBadge value={option.value} />}
            renderOption={option => <PriorityBadge value={option.value} />}
          />
          <Selector
            label="Assignee"
            isLabelHidden
            hasSearch
            searchPlaceholder="Search assignees..."
            value={fields.assignee}
            onChange={assignee => onFieldsChange({assignee})}
            options={ASSIGNEE_OPTIONS}
          />
          <Tokenizer
            label="Labels"
            isLabelHidden
            searchSource={LABEL_SEARCH_SOURCE}
            value={fields.labels}
            onChange={labels => onFieldsChange({labels})}
            renderToken={(label, onRemove) => (
              <Token
                label={label.label}
                color={label.color}
                onRemove={onRemove}
              />
            )}
          />
        </HStack>
      </VStack>
    </LayoutHeader>
  );
}

// ─── Description ────────────────────────────────────────────────────────────
function DescriptionSection() {
  return (
    <Section padding={SECTION_PADDING}>
      <VStack gap={4}>
        <SectionHeader title="Description" />
        <VStack gap={2}>
          <Text type="body">
            Reduce the drop-off between account creation and first meaningful
            action in a new workspace. Recent cohorts activate at 42 percent by
            day seven, and interview evidence points to an empty starting state
            and a long welcome sequence as the two largest contributors.
          </Text>
          <Text type="body">
            Ship a revised flow that shortens the sequence, seeds every new
            workspace with a sample project, and measures activation as the
            percentage of workspaces that reach three completed actions in the
            first three days.
          </Text>
        </VStack>
        <VStack gap={2}>
          {/* Sized as a level 4 but announced as a level 3, so the visual scale
              stays small without skipping a step in the document outline. */}
          <Heading level={4} accessibilityLevel={3}>
            Success criteria
          </Heading>
          <List listStyle="disc" density="compact">
            <ListItem label="Day-seven activation rises from 42 to 55 percent for new workspaces in the variant." />
            <ListItem label="Median time to first completed action drops below eight minutes." />
            <ListItem label="No regression in day-thirty retention." />
          </List>
        </VStack>
      </VStack>
    </Section>
  );
}

// ─── Subtasks ───────────────────────────────────────────────────────────────
function SubtasksSection({
  subtasks,
  onSetDone,
}: {
  subtasks: Subtask[];
  onSetDone: (id: number, isDone: boolean) => void;
}) {
  const doneCount = subtasks.filter(task => task.isDone).length;

  return (
    <Section padding={SECTION_PADDING}>
      <VStack gap={4}>
        <SectionHeader
          title="Subtasks"
          action={<Button label="Add subtask" />}
        />
        <HStack gap={3} vAlign="center">
          <Text type="supporting" color="secondary">
            {doneCount} of {subtasks.length} complete
          </Text>
          <StackItem size="fill">
            <ProgressBar
              label="Subtask progress"
              isLabelHidden
              value={subtasks.length ? (doneCount / subtasks.length) * 100 : 0}
              variant="success"
            />
          </StackItem>
        </HStack>
        <List>
          {subtasks.map(task => (
            <CheckboxListItem
              key={task.id}
              label={task.title}
              isChecked={task.isDone}
              onCheck={isDone => onSetDone(task.id, isDone)}
              endContent={
                <HStack gap={2} vAlign="center">
                  <Timestamp
                    value={task.due}
                    format="date"
                    type="supporting"
                    color="secondary"
                  />
                  <Avatar name={task.assignee} size="sm" />
                </HStack>
              }
            />
          ))}
        </List>
      </VStack>
    </Section>
  );
}

// ─── Attachments ────────────────────────────────────────────────────────────
function AttachmentsSection() {
  return (
    <Section padding={SECTION_PADDING}>
      <VStack gap={4}>
        <SectionHeader
          title="Attachments"
          action={<Button label="Add attachment" />}
        />
        <VStack gap={1}>
          {ATTACHMENTS.map(attachment => (
            <ClickableCard
              key={attachment.id}
              label={`Open ${attachment.title}`}
              href={attachment.href}
              padding={3}>
              <HStack gap={4} vAlign="center">
                <AspectRatio
                  ratio={1}
                  fit="center"
                  xstyle={styles.attachmentTile}>
                  <Icon
                    icon={ATTACHMENT_ICONS[attachment.kind]}
                    size="lg"
                    color="secondary"
                  />
                </AspectRatio>
                <StackItem size="fill">
                  <VStack gap={0}>
                    <Text type="body" weight="semibold">
                      {attachment.title}
                    </Text>
                    <Text type="supporting" color="secondary">
                      {attachment.subtitle}
                    </Text>
                  </VStack>
                </StackItem>
                <MoreMenu
                  presentation="adaptive"
                  label={`Actions for ${attachment.title}`}
                  items={ATTACHMENT_ACTIONS}
                />
              </HStack>
            </ClickableCard>
          ))}
        </VStack>
      </VStack>
    </Section>
  );
}

// ─── Activity ───────────────────────────────────────────────────────────────
function ActivitySection({
  comment,
  onCommentChange,
}: {
  comment: string;
  onCommentChange: (value: string) => void;
}) {
  const commentFieldRef = useRef<HTMLTextAreaElement>(null);

  const focusCommentField = () => {
    const field = commentFieldRef.current;
    if (!field) {
      return;
    }
    // Scroll first, then take focus without a second jump competing with it.
    field.scrollIntoView({behavior: 'smooth', block: 'center'});
    field.focus({preventScroll: true});
  };

  return (
    <Section padding={SECTION_PADDING}>
      <VStack gap={10}>
        <SectionHeader
          title="Comments and activity"
          action={<Button label="Add comment" onClick={focusCommentField} />}
        />
        <VStack gap={6}>
          {ACTIVITY.map(entry => {
            const isComment = entry.kind === 'comment';
            return (
              <HStack key={entry.id} gap={3} vAlign="start">
                <Avatar name={entry.author} size="sm" />
                <StackItem size="fill">
                  <VStack gap={1}>
                    <HStack gap={2} vAlign="center">
                      <Text type="body" weight="semibold">
                        {entry.author}
                      </Text>
                      {/* An event is one line, so its body sits on the byline
                          instead of getting a bubble of its own. */}
                      {!isComment && (
                        <Text type="supporting" color="secondary">
                          {entry.body}
                        </Text>
                      )}
                      <StackItem size="fill" />
                      <Timestamp
                        value={entry.time}
                        format="relative"
                        type="supporting"
                        color="secondary"
                      />
                    </HStack>
                    {isComment && (
                      <>
                        <Card variant="muted" padding={3}>
                          <Text type="body">{entry.body}</Text>
                        </Card>
                        <Link href="#" color="secondary">
                          Reply
                        </Link>
                      </>
                    )}
                  </VStack>
                </StackItem>
              </HStack>
            );
          })}
        </VStack>
        <VStack gap={2} hAlign="stretch">
          <TextArea
            ref={commentFieldRef}
            width="100%"
            label="Add a comment"
            isLabelHidden
            placeholder="Write a comment…"
            value={comment}
            onChange={onCommentChange}
            rows={5}
          />
          <HStack gap={2} hAlign="end">
            <Button label="Cancel" variant="ghost" />
            <Button
              label="Comment"
              variant="primary"
              isDisabled={comment.trim().length === 0}
            />
          </HStack>
        </VStack>
      </VStack>
    </Section>
  );
}

// ─── Details rail ───────────────────────────────────────────────────────────
function DetailsPanel({fields}: {fields: WorkItemFields}) {
  const status = optionFor(STATUS_OPTIONS, fields.status);
  const assignee = optionFor(ASSIGNEE_OPTIONS, fields.assignee);

  return (
    <VStack gap={10}>
      <VStack gap={4}>
        <SectionHeader title="Details" level={3} />
        <MetadataList>
          <MetadataListItem label="Status">
            <HStack gap={2} vAlign="center">
              {status.icon}
              <Text type="body">{status.label}</Text>
            </HStack>
          </MetadataListItem>
          <MetadataListItem label="Priority">
            <PriorityBadge value={fields.priority} />
          </MetadataListItem>
          <MetadataListItem label="Assignee">
            <PersonRow name={assignee.label} />
          </MetadataListItem>
          <MetadataListItem label="Reporter">
            <PersonRow name="Sofia Alvarez" />
          </MetadataListItem>
          <MetadataListItem label="Start date">
            <Timestamp
              value="2026-03-02"
              format="date"
              type="body"
              color="primary"
            />
          </MetadataListItem>
          <MetadataListItem label="Due date">
            <Timestamp
              value="2026-03-18"
              format="date"
              type="body"
              color="primary"
            />
          </MetadataListItem>
          <MetadataListItem label="Sprint">
            <Text type="body">Sprint 24 · Mar 2 – Mar 15</Text>
          </MetadataListItem>
          <MetadataListItem label="Parent">
            <Link href="#">PLT-192 · Activation initiative</Link>
          </MetadataListItem>
          <MetadataListItem label="Labels">
            <HStack gap={1} wrap="wrap">
              {fields.labels.map(label => (
                <Token
                  key={label.id}
                  color={label.color}
                  label={label.label}
                  size="sm"
                />
              ))}
            </HStack>
          </MetadataListItem>
          <MetadataListItem label="Team">
            <Text type="body">Platform · Growth pod</Text>
          </MetadataListItem>
        </MetadataList>
      </VStack>

      <VStack gap={4}>
        <SectionHeader title="Watchers" level={3} />
        <AvatarGroup size="md">
          {WATCHERS.map(name => (
            <Avatar key={name} name={name} />
          ))}
        </AvatarGroup>
      </VStack>

      <VStack gap={4}>
        <SectionHeader title="Linked items" level={3} />
        <VStack gap={1}>
          {LINKED_ITEMS.map(item => (
            <ClickableCard
              key={item.id}
              label={`Open ${item.id}: ${item.title}`}
              href="#"
              padding={3}>
              <VStack gap={0}>
                <Text type="supporting" color="secondary">
                  {item.id}
                </Text>
                <Text type="body" weight="semibold">
                  {item.title}
                </Text>
              </VStack>
            </ClickableCard>
          ))}
        </VStack>
      </VStack>
    </VStack>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function WorkItemDetailTemplate() {
  const [fields, setFields] = useState<WorkItemFields>({
    status: 'in_progress',
    assignee: 'priya-shah',
    priority: 'high',
    labels: LABEL_OPTIONS,
  });
  const [subtasks, setSubtasks] = useState(SUBTASKS);
  const [comment, setComment] = useState('');

  const isNarrow = useMediaQuery('(max-width: 1024px)');
  // The details live in a rail on wide screens and a dialog on narrow ones.
  // Each keeps its own flag: the rail is open by default, while the dialog must
  // stay shut until asked for, so one shared initial value cannot serve both.
  const [isRailOpen, setRailOpen] = useState(true);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const isDetailsOpen = isNarrow ? isDialogOpen : isRailOpen;
  const setDetailsOpen = isNarrow ? setDialogOpen : setRailOpen;
  const toggleDetails = () => setDetailsOpen(isOpen => !isOpen);

  const updateFields = (patch: Partial<WorkItemFields>) =>
    setFields(prev => ({...prev, ...patch}));

  const setSubtaskDone = (id: number, isDone: boolean) =>
    setSubtasks(prev =>
      prev.map(task => (task.id === id ? {...task, isDone} : task)),
    );

  return (
    <>
      <Layout
        height="fill"
        contentWidth={1260}
        header={
          <PageHeader
            fields={fields}
            onFieldsChange={updateFields}
            isDetailsOpen={isDetailsOpen}
            onToggleDetails={toggleDetails}
            isNarrow={isNarrow}
          />
        }
        content={
          <LayoutContent padding={6} role="main">
            <VStack gap={6}>
              <DescriptionSection />
              <Divider />
              <SubtasksSection subtasks={subtasks} onSetDone={setSubtaskDone} />
              <Divider />
              <AttachmentsSection />
              <Divider />
              <ActivitySection comment={comment} onCommentChange={setComment} />
            </VStack>
          </LayoutContent>
        }
        end={
          !isNarrow && isDetailsOpen ? (
            <LayoutPanel
              width={340}
              padding={6}
              role="complementary"
              hasDivider>
              <DetailsPanel fields={fields} />
            </LayoutPanel>
          ) : undefined
        }
      />
      <Dialog
        variant="fullscreen"
        isOpen={isNarrow && isDetailsOpen}
        onOpenChange={setDialogOpen}>
        <Layout
          header={
            <DialogHeader title="Task details" onOpenChange={setDialogOpen} />
          }
          content={
            <LayoutContent padding={4}>
              <DetailsPanel fields={fields} />
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
