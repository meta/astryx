// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, useMemo} from 'react';
import {useResizable, ResizeHandle} from '@astryxdesign/core/Resizable';
import type {ResizableProps} from '@astryxdesign/core/Resizable';
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutPanel,
  VStack,
  HStack,
  StackItem,
} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Selector} from '@astryxdesign/core/Selector';
import {PowerSearch} from '@astryxdesign/core/PowerSearch';
import type {
  PowerSearchConfig,
  PowerSearchFilter,
} from '@astryxdesign/core/PowerSearch';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Popover} from '@astryxdesign/core/Popover';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {Center} from '@astryxdesign/core/Center';
import {Icon} from '@astryxdesign/core/Icon';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Divider} from '@astryxdesign/core/Divider';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {
  Table,
  proportional,
  pixel,
  useTableGroupedRows,
} from '@astryxdesign/core/Table';
import type {TableColumn, TablePlugin} from '@astryxdesign/core/Table';
import {rtlStyles} from '@astryxdesign/core/utils';
import {
  PencilIcon,
  DocumentDuplicateIcon,
  ArrowRightIcon,
  TagIcon,
  UserIcon,
  TrashIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline';
import {XMarkIcon} from '@heroicons/react/24/outline';
import {ChartBarIcon} from '@heroicons/react/24/solid';

// Types
type TaskStatus = 'in_progress' | 'todo' | 'backlog' | 'done';
type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

interface TaskRow extends Record<string, unknown> {
  id: string;
  taskId: string;
  title: string;
  subtitle: string;
  status: TaskStatus;
  priority: TaskPriority;
  project: string;
  tags: string[];
  created: string;
  createdISO: string;
  updated: string;
  updatedISO: string;
  assignee: string;
}

const STATUS_DOT_VARIANT: Record<
  TaskStatus,
  'success' | 'accent' | 'neutral' | 'warning'
> = {
  in_progress: 'accent',
  todo: 'warning',
  backlog: 'neutral',
  done: 'success',
};

const PRIORITY_COLOR: Record<
  TaskPriority,
  'primary' | 'secondary' | 'disabled'
> = {
  urgent: 'primary',
  high: 'primary',
  medium: 'secondary',
  low: 'disabled',
  none: 'disabled',
};

// Mock data matching a task tracker
const allTasks: TaskRow[] = [
  {
    id: '1',
    taskId: 'TASK-1001',
    title: 'Update user interface',
    subtitle: 'Update payment gateway integration',
    status: 'in_progress',
    priority: 'medium',
    project: 'Payment gateway integration 2.0',
    tags: [],
    created: 'Jul 3',
    createdISO: '2025-07-03',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Olivia Martin',
  },
  {
    id: '2',
    taskId: 'TASK-1002',
    title: 'Use Projects to organize work for features or releases',
    subtitle: '',
    status: 'in_progress',
    priority: 'medium',
    project: '',
    tags: [],
    created: 'Jul 1',
    createdISO: '2025-07-01',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Jackson Lee',
  },
  {
    id: '3',
    taskId: 'TASK-1003',
    title: 'Use Cycles to focus work over n-weeks',
    subtitle: '',
    status: 'in_progress',
    priority: 'medium',
    project: '',
    tags: [],
    created: 'Jul 1',
    createdISO: '2025-07-01',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Isabella Nguyen',
  },
  {
    id: '4',
    taskId: 'TASK-1004',
    title: 'Testing code',
    subtitle: 'Update payment gateway integration',
    status: 'todo',
    priority: 'medium',
    project: 'Payment gateway integration 2.0',
    tags: [],
    created: 'Jul 3',
    createdISO: '2025-07-03',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'William Kim',
  },
  {
    id: '5',
    taskId: 'TASK-1005',
    title: 'Update backend code',
    subtitle: 'Update payment gateway integration',
    status: 'todo',
    priority: 'medium',
    project: 'Payment gateway integration 2.0',
    tags: [],
    created: 'Jul 3',
    createdISO: '2025-07-03',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Sofia Davis',
  },
  {
    id: '6',
    taskId: 'TASK-1006',
    title: 'Update front end code',
    subtitle: 'Update payment gateway integration',
    status: 'todo',
    priority: 'medium',
    project: 'Payment gateway integration 2.0',
    tags: [],
    created: 'Jul 3',
    createdISO: '2025-07-03',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Mia Wilson',
  },
  {
    id: '7',
    taskId: 'TASK-1007',
    title: 'Update payment gateway integration',
    subtitle: '',
    status: 'todo',
    priority: 'high',
    project: 'Payment gateway integration 2.0',
    tags: ['Improvement', '3rd Party'],
    created: 'Jul 3',
    createdISO: '2025-07-03',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Lucas Brown',
  },
  {
    id: '8',
    taskId: 'TASK-1008',
    title: 'Update payment gateway backend code',
    subtitle: '',
    status: 'todo',
    priority: 'medium',
    project: '',
    tags: [],
    created: 'Jul 3',
    createdISO: '2025-07-03',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Ethan Jones',
  },
  {
    id: '9',
    taskId: 'TASK-1009',
    title: 'Invite your teammates',
    subtitle: '',
    status: 'todo',
    priority: 'low',
    project: '',
    tags: [],
    created: 'Jul 1',
    createdISO: '2025-07-01',
    updated: 'Jul 1',
    updatedISO: '2025-07-01',
    assignee: 'Ava Taylor',
  },
  {
    id: '10',
    taskId: 'TASK-1010',
    title: 'Next steps',
    subtitle: '',
    status: 'todo',
    priority: 'none',
    project: '',
    tags: [],
    created: 'Jul 1',
    createdISO: '2025-07-01',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Noah Garcia',
  },
  {
    id: '11',
    taskId: 'TASK-1011',
    title: 'Welcome to Linear',
    subtitle: '',
    status: 'backlog',
    priority: 'none',
    project: '',
    tags: [],
    created: 'Jul 1',
    createdISO: '2025-07-01',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Olivia Martin',
  },
  {
    id: '12',
    taskId: 'TASK-1012',
    title: 'Connect GitHub or GitLab',
    subtitle: '',
    status: 'backlog',
    priority: 'none',
    project: '',
    tags: [],
    created: 'Jul 1',
    createdISO: '2025-07-01',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Jackson Lee',
  },
  {
    id: '13',
    taskId: 'TASK-1013',
    title: 'Customize settings',
    subtitle: '',
    status: 'backlog',
    priority: 'none',
    project: '',
    tags: [],
    created: 'Jul 1',
    createdISO: '2025-07-01',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Isabella Nguyen',
  },
  {
    id: '14',
    taskId: 'TASK-1014',
    title: 'Try 3 ways to navigate: Command menu, keyboard or mouse',
    subtitle: '',
    status: 'done',
    priority: 'none',
    project: '',
    tags: [],
    created: 'Jul 1',
    createdISO: '2025-07-01',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'William Kim',
  },
  {
    id: '15',
    taskId: 'TASK-1015',
    title: 'Connect to Slack',
    subtitle: '',
    status: 'done',
    priority: 'none',
    project: '',
    tags: [],
    created: 'Jul 1',
    createdISO: '2025-07-01',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Sofia Davis',
  },
  {
    id: '16',
    taskId: 'TASK-1016',
    title: 'Migrate database schema to v2',
    subtitle: 'Payment gateway integration',
    status: 'in_progress',
    priority: 'high',
    project: 'Payment gateway integration 2.0',
    tags: [],
    created: 'Jul 4',
    createdISO: '2025-07-04',
    updated: 'Jul 5',
    updatedISO: '2025-07-05',
    assignee: 'Lucas Brown',
  },
  {
    id: '17',
    taskId: 'TASK-1017',
    title: 'Write integration tests for checkout flow',
    subtitle: '',
    status: 'in_progress',
    priority: 'medium',
    project: 'Payment gateway integration 2.0',
    tags: [],
    created: 'Jul 4',
    createdISO: '2025-07-04',
    updated: 'Jul 5',
    updatedISO: '2025-07-05',
    assignee: 'Ethan Jones',
  },
  {
    id: '18',
    taskId: 'TASK-1018',
    title: 'Set up CI/CD pipeline for staging',
    subtitle: '',
    status: 'in_progress',
    priority: 'high',
    project: '',
    tags: [],
    created: 'Jul 2',
    createdISO: '2025-07-02',
    updated: 'Jul 5',
    updatedISO: '2025-07-05',
    assignee: 'Ava Taylor',
  },
  {
    id: '19',
    taskId: 'TASK-1019',
    title: 'Add rate limiting to public API endpoints',
    subtitle: '',
    status: 'todo',
    priority: 'urgent',
    project: '',
    tags: [],
    created: 'Jul 5',
    createdISO: '2025-07-05',
    updated: 'Jul 5',
    updatedISO: '2025-07-05',
    assignee: 'Noah Garcia',
  },
  {
    id: '20',
    taskId: 'TASK-1020',
    title: 'Refactor auth middleware to support OAuth2',
    subtitle: '',
    status: 'todo',
    priority: 'high',
    project: '',
    tags: [],
    created: 'Jul 4',
    createdISO: '2025-07-04',
    updated: 'Jul 5',
    updatedISO: '2025-07-05',
    assignee: 'Olivia Martin',
  },
  {
    id: '21',
    taskId: 'TASK-1021',
    title: 'Design error pages for 404 and 500',
    subtitle: '',
    status: 'todo',
    priority: 'low',
    project: '',
    tags: [],
    created: 'Jul 3',
    createdISO: '2025-07-03',
    updated: 'Jul 4',
    updatedISO: '2025-07-04',
    assignee: 'Mia Wilson',
  },
  {
    id: '22',
    taskId: 'TASK-1022',
    title: 'Audit third-party dependencies for vulnerabilities',
    subtitle: '',
    status: 'todo',
    priority: 'medium',
    project: '',
    tags: [],
    created: 'Jul 5',
    createdISO: '2025-07-05',
    updated: 'Jul 5',
    updatedISO: '2025-07-05',
    assignee: 'Jackson Lee',
  },
  {
    id: '23',
    taskId: 'TASK-1023',
    title: 'Implement webhook retry logic with exponential backoff',
    subtitle: 'Payment gateway integration',
    status: 'todo',
    priority: 'medium',
    project: 'Payment gateway integration 2.0',
    tags: [],
    created: 'Jul 4',
    createdISO: '2025-07-04',
    updated: 'Jul 5',
    updatedISO: '2025-07-05',
    assignee: 'William Kim',
  },
  {
    id: '24',
    taskId: 'TASK-1024',
    title: 'Add dark mode support to dashboard',
    subtitle: '',
    status: 'backlog',
    priority: 'low',
    project: '',
    tags: [],
    created: 'Jul 2',
    createdISO: '2025-07-02',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Sofia Davis',
  },
  {
    id: '25',
    taskId: 'TASK-1025',
    title: 'Create onboarding flow for new team members',
    subtitle: '',
    status: 'backlog',
    priority: 'none',
    project: '',
    tags: [],
    created: 'Jul 1',
    createdISO: '2025-07-01',
    updated: 'Jul 2',
    updatedISO: '2025-07-02',
    assignee: 'Isabella Nguyen',
  },
  {
    id: '26',
    taskId: 'TASK-1026',
    title: 'Set up error tracking with Sentry',
    subtitle: '',
    status: 'backlog',
    priority: 'medium',
    project: '',
    tags: [],
    created: 'Jul 3',
    createdISO: '2025-07-03',
    updated: 'Jul 4',
    updatedISO: '2025-07-04',
    assignee: 'Ethan Jones',
  },
  {
    id: '27',
    taskId: 'TASK-1027',
    title: 'Improve search performance with indexing',
    subtitle: '',
    status: 'backlog',
    priority: 'low',
    project: '',
    tags: [],
    created: 'Jul 2',
    createdISO: '2025-07-02',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Ava Taylor',
  },
  {
    id: '28',
    taskId: 'TASK-1028',
    title: 'Write API documentation for v2 endpoints',
    subtitle: '',
    status: 'done',
    priority: 'medium',
    project: '',
    tags: [],
    created: 'Jun 28',
    createdISO: '2025-06-28',
    updated: 'Jul 3',
    updatedISO: '2025-07-03',
    assignee: 'Noah Garcia',
  },
  {
    id: '29',
    taskId: 'TASK-1029',
    title: 'Set up staging environment',
    subtitle: '',
    status: 'done',
    priority: 'high',
    project: '',
    tags: [],
    created: 'Jun 25',
    createdISO: '2025-06-25',
    updated: 'Jul 1',
    updatedISO: '2025-07-01',
    assignee: 'Lucas Brown',
  },
  {
    id: '30',
    taskId: 'TASK-1030',
    title: 'Fix flaky end-to-end tests in CI',
    subtitle: '',
    status: 'done',
    priority: 'medium',
    project: '',
    tags: [],
    created: 'Jun 30',
    createdISO: '2025-06-30',
    updated: 'Jul 2',
    updatedISO: '2025-07-02',
    assignee: 'Mia Wilson',
  },
];

const STATUS_LABEL: Record<TaskStatus, string> = {
  in_progress: 'In Progress',
  todo: 'Todo',
  backlog: 'Backlog',
  done: 'Done',
};

type GroupByField = 'status' | 'priority' | 'project' | 'assignee' | 'none';

const GROUP_BY_OPTIONS: {value: GroupByField; label: string}[] = [
  {value: 'none', label: 'None'},
  {value: 'status', label: 'Status'},
  {value: 'priority', label: 'Priority'},
  {value: 'project', label: 'Project'},
  {value: 'assignee', label: 'Assignee'},
];

function getGroupLabel(groupBy: GroupByField, key: string): string {
  if (groupBy === 'status') {
    return STATUS_LABEL[key as TaskStatus] ?? key;
  }
  if (groupBy === 'priority') {
    const labels: Record<string, string> = {
      urgent: 'Urgent',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      none: 'No priority',
    };
    return labels[key] ?? key;
  }
  return key;
}

const columns: TableColumn<TaskRow>[] = [
  {
    key: 'status',
    header: '',
    width: pixel(44),
    renderCell: task => (
      <Center axis="horizontal">
        <StatusDot
          variant={STATUS_DOT_VARIANT[task.status]}
          label={STATUS_LABEL[task.status]}
        />
      </Center>
    ),
  },
  {
    key: 'title',
    header: 'Issue',
    width: proportional(1),
    renderCell: task => (
      <HStack gap={3} vAlign="center">
        <Icon
          icon={ChartBarIcon}
          size="sm"
          color={PRIORITY_COLOR[task.priority]}
        />
        <Text type="supporting" color="secondary">
          {task.taskId}
        </Text>
        <Text type="body" maxLines={1}>
          {task.title}
        </Text>
        {task.subtitle && (
          <Text type="body" color="secondary" maxLines={1}>
            › {task.subtitle}
          </Text>
        )}
      </HStack>
    ),
  },
  {
    key: 'project',
    header: 'Project',
    width: pixel(180),
    renderCell: task =>
      task.project ? (
        <Text type="body" maxLines={1}>
          {task.project}
        </Text>
      ) : (
        <Text type="supporting" color="secondary">
          —
        </Text>
      ),
  },
  {
    key: 'created',
    header: 'Created',
    width: pixel(88),
    renderCell: task => (
      <Text type="supporting" color="secondary">
        {task.created}
      </Text>
    ),
  },
  {
    key: 'updated',
    header: 'Updated',
    width: pixel(88),
    renderCell: task => (
      <Text type="supporting" color="secondary">
        {task.updated}
      </Text>
    ),
  },
  {
    key: 'assignee',
    header: 'Assignee',
    width: pixel(88),
    renderCell: task => <Avatar name={task.assignee} size="sm" />,
  },
  {
    key: 'actions',
    header: '',
    width: pixel(56),
    renderCell: () => (
      <DropdownMenu
        button={{
          label: 'Actions',
          variant: 'ghost',
          size: 'sm',
          icon: <Icon icon={EllipsisHorizontalIcon} size="sm" />,
          isIconOnly: true,
        }}
        hasChevron={false}
        items={[
          {
            label: 'Edit issue',
            icon: PencilIcon,
            onClick: () => {},
          },
          {
            label: 'Assign to...',
            icon: UserIcon,
            onClick: () => {},
          },
          {
            label: 'Add label',
            icon: TagIcon,
            onClick: () => {},
          },
          {
            label: 'Duplicate',
            icon: DocumentDuplicateIcon,
            onClick: () => {},
          },
          {
            label: 'Move to project',
            icon: (
              <Icon
                icon={ArrowRightIcon}
                size="sm"
                color="secondary"
                xstyle={rtlStyles.mirror}
              />
            ),
            onClick: () => {},
          },
          {type: 'divider' as const},
          {
            label: 'Delete issue',
            icon: TrashIcon,
            onClick: () => {},
          },
        ]}
      />
    ),
  },
];

const powerSearchConfig: PowerSearchConfig = {
  name: 'IssueSearch',
  fields: [
    {
      key: 'status',
      label: 'Status',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {
            type: 'enum',
            values: [
              {value: 'in_progress', label: 'In Progress'},
              {value: 'todo', label: 'Todo'},
              {value: 'backlog', label: 'Backlog'},
              {value: 'done', label: 'Done'},
            ],
          },
        },
      ],
    },
    {
      key: 'priority',
      label: 'Priority',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {
            type: 'enum',
            values: [
              {value: 'urgent', label: 'Urgent'},
              {value: 'high', label: 'High'},
              {value: 'medium', label: 'Medium'},
              {value: 'low', label: 'Low'},
              {value: 'none', label: 'None'},
            ],
          },
        },
      ],
    },
    {
      key: 'title',
      label: 'Title',
      operators: [
        {key: 'contains', label: 'contains', value: {type: 'string'}},
      ],
    },
    {
      key: 'assignee',
      label: 'Assignee',
      operators: [
        {key: 'contains', label: 'contains', value: {type: 'string'}},
      ],
    },
    {
      key: 'project',
      label: 'Project',
      operators: [
        {key: 'contains', label: 'contains', value: {type: 'string'}},
      ],
    },
  ],
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
};

function TaskDetailPanel({
  task,
  onClose,
  resizable,
}: {
  task: TaskRow | null;
  onClose: () => void;
  resizable: ResizableProps;
}) {
  if (!task) {
    return null;
  }
  return (
    // Panel owns the separator (its full-height left border). The adjacent
    // ResizeHandle is kept divider-less + isAlwaysVisible={false} so its
    // always-on pill doesn't float above the panel as a stray stub.
    <LayoutPanel
      hasDivider
      resizable={resizable}
      padding={4}
      role="complementary"
      label="Task details">
      <VStack gap={4}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Text type="supporting" color="secondary">
              {task.taskId}
            </Text>
          </StackItem>
          <Button
            label="Close panel"
            variant="ghost"
            size="sm"
            icon={<Icon icon={XMarkIcon} size="sm" />}
            isIconOnly
            onClick={onClose}
          />
        </HStack>

        <VStack gap={1}>
          <Heading level={3}>{task.title}</Heading>
          {task.subtitle && (
            <Text type="body" color="secondary">
              {task.subtitle}
            </Text>
          )}
        </VStack>

        <MetadataList label={{position: 'start'}}>
          <MetadataListItem label="Status">
            <HStack gap={2} vAlign="center">
              <StatusDot
                variant={STATUS_DOT_VARIANT[task.status]}
                label={STATUS_LABEL[task.status]}
              />
              <Text type="body">{STATUS_LABEL[task.status]}</Text>
            </HStack>
          </MetadataListItem>
          <MetadataListItem label="Priority">
            <HStack gap={2} vAlign="center">
              <Icon
                icon={ChartBarIcon}
                size="sm"
                color={PRIORITY_COLOR[task.priority]}
              />
              <Text type="body">{PRIORITY_LABEL[task.priority]}</Text>
            </HStack>
          </MetadataListItem>
          <MetadataListItem label="Assignee">
            <HStack gap={2} vAlign="center">
              <Avatar name={task.assignee} size="sm" />
              <Text type="body">{task.assignee}</Text>
            </HStack>
          </MetadataListItem>
          <MetadataListItem label="Project">
            {task.project || '\u2014'}
          </MetadataListItem>
          <MetadataListItem label="Created">{task.created}</MetadataListItem>
          <MetadataListItem label="Updated">{task.updated}</MetadataListItem>
        </MetadataList>

        {task.tags.length > 0 && (
          <>
            <Divider />
            <VStack gap={2}>
              <Text type="label">Labels</Text>
              <HStack gap={2}>
                {task.tags.map(tag => (
                  <Badge key={tag} variant="neutral" label={tag} />
                ))}
              </HStack>
            </VStack>
          </>
        )}
      </VStack>
    </LayoutPanel>
  );
}

export default function DataTableTemplate() {
  const [search, _setSearch] = useState('');
  const [priorityFilter, _setPriorityFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [powerSearchFilters, setPowerSearchFilters] = useState<
    ReadonlyArray<PowerSearchFilter>
  >([]);
  const [groupBy, setGroupBy] = useState<GroupByField>('status');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  const filtered = useMemo(() => {
    let data = allTasks;
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter(
        t =>
          t.title.toLowerCase().includes(q) ||
          t.taskId.toLowerCase().includes(q) ||
          t.subtitle.toLowerCase().includes(q),
      );
    }
    if (priorityFilter !== 'all') {
      data = data.filter(t => t.priority === priorityFilter);
    }
    return data;
  }, [search, priorityFilter]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Grouping by "None" shows the rows as one plain list, with no headers.
  const grouped = useTableGroupedRows<TaskRow>({
    data: filtered,
    // Groups are keyed by their visible label, which also names each
    // group's toggle button.
    groupBy: task =>
      groupBy === 'none'
        ? ''
        : getGroupLabel(groupBy, String(task[groupBy]) || '—'),
    collapsedGroups,
    onToggleGroup: toggleGroup,
    getRowKey: task => task.id,
    renderGroupHeader: (key, count) => (
      <HStack gap={2} vAlign="center">
        <Text type="body" weight="bold">
          {key}
        </Text>
        <Badge variant="neutral" label={String(count)} />
      </HStack>
    ),
  });

  // Clicking an issue row opens its details. Group header rows keep their
  // own toggle.
  const openTaskPlugin: TablePlugin<TaskRow> = {
    transformBodyRow(props, task) {
      if (task.id === '') {
        return props;
      }
      return {
        ...props,
        htmlProps: {...props.htmlProps, onClick: () => setSelectedTask(task)},
      };
    },
  };

  const detailPanel = useResizable({
    defaultSize: 360,
    minSize: 280,
    maxSize: 500,
  });

  return (
    <>
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={4}>
              <HStack gap={3} vAlign="center">
                <StackItem size="fill">
                  <Heading level={1}>All Issues</Heading>
                </StackItem>
                <Button
                  label="Create issue"
                  variant="primary"
                  size="lg"
                  onClick={() => setDialogOpen(true)}
                />
              </HStack>
              <HStack gap={2} vAlign="center">
                <StackItem size="fill">
                  <PowerSearch
                    config={powerSearchConfig}
                    filters={powerSearchFilters}
                    onChange={newFilters => setPowerSearchFilters(newFilters)}
                    placeholder="Filter issues..."
                    resultCount={`${filtered.length} issue${filtered.length !== 1 ? 's' : ''}`}
                  />
                </StackItem>
                <Popover
                  placement="below"
                  alignment="end"
                  width={320}
                  label="Grouping options"
                  content={
                    <VStack gap={4}>
                      <RadioList
                        label="Group by"
                        value={groupBy}
                        onChange={v => {
                          setGroupBy(v as GroupByField);
                          setCollapsedGroups(new Set());
                        }}>
                        {GROUP_BY_OPTIONS.map(opt => (
                          <RadioListItem
                            key={opt.value}
                            value={opt.value}
                            label={opt.label}
                          />
                        ))}
                      </RadioList>
                    </VStack>
                  }>
                  <Button label="View Options" variant="secondary" size="md" />
                </Popover>
              </HStack>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent role="main" padding={0}>
            <Table
              data={groupBy === 'none' ? filtered : grouped.data}
              columns={columns}
              idKey={groupBy === 'none' ? 'id' : grouped.idKey}
              density="balanced"
              dividers="rows"
              textOverflow="truncate"
              hasHover
              plugins={
                groupBy === 'none'
                  ? {openTask: openTaskPlugin}
                  : {grouped: grouped.plugin, openTask: openTaskPlugin}
              }
            />
          </LayoutContent>
        }
        end={
          selectedTask && (
            <>
              <ResizeHandle
                resizable={detailPanel.props}
                isReversed
                isAlwaysVisible={false}
              />
              <TaskDetailPanel
                task={selectedTask}
                onClose={() => setSelectedTask(null)}
                resizable={detailPanel.props}
              />
            </>
          )
        }
      />
      <Dialog isOpen={dialogOpen} onOpenChange={open => setDialogOpen(open)}>
        <Layout
          header={
            <DialogHeader
              title="Create Issue"
              onOpenChange={open => setDialogOpen(open)}
            />
          }
          content={
            <LayoutContent padding={4}>
              <VStack gap={4}>
                <TextInput
                  label="Title"
                  placeholder="Issue title"
                  value=""
                  onChange={() => {}}
                />
                <Selector
                  label="Status"
                  value="todo"
                  options={[
                    {value: 'in_progress', label: 'In Progress'},
                    {value: 'todo', label: 'Todo'},
                    {value: 'backlog', label: 'Backlog'},
                  ]}
                  onChange={() => {}}
                />
                <Selector
                  label="Priority"
                  value="none"
                  options={[
                    {value: 'urgent', label: 'Urgent'},
                    {value: 'high', label: 'High'},
                    {value: 'medium', label: 'Medium'},
                    {value: 'low', label: 'Low'},
                    {value: 'none', label: 'No priority'},
                  ]}
                  onChange={() => {}}
                />
                <TextInput
                  label="Project"
                  placeholder="Project name"
                  value=""
                  onChange={() => {}}
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Cancel"
                  variant="secondary"
                  size="md"
                  onClick={() => setDialogOpen(false)}
                />
                <Button
                  label="Create"
                  variant="primary"
                  size="md"
                  onClick={() => setDialogOpen(false)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
