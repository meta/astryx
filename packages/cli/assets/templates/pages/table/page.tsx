// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  Layout,
  LayoutContent,
  LayoutHeader,
  VStack,
  HStack,
  StackItem,
} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Avatar} from '@astryxdesign/core/Avatar';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Icon} from '@astryxdesign/core/Icon';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {useToast} from '@astryxdesign/core/Toast';
import {useClipboard} from '@astryxdesign/core/hooks';
import {
  Table,
  TableSelectionToolbar,
  useTableSelection,
  useTableSelectionState,
  useTableSortable,
  useTableSortableState,
  proportional,
  pixel,
} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {
  ArrowDownTrayIcon,
  DocumentDuplicateIcon,
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  NoSymbolIcon,
  PencilIcon,
  TrashIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';

// Types
type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer';
type MemberStatus = 'active' | 'invited' | 'suspended';

interface MemberRow extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  team: string;
  status: MemberStatus;
  lastActive: string;
  lastActiveISO: string;
}

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

// Roles sort by how much access they grant, not alphabetically.
const ROLE_RANK: Record<MemberRole, number> = {
  owner: 0,
  admin: 1,
  editor: 2,
  viewer: 3,
};

const ROLE_ORDER: MemberRole[] = ['owner', 'admin', 'editor', 'viewer'];

const STATUS_LABEL: Record<MemberStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  suspended: 'Suspended',
};

const STATUS_DOT_VARIANT: Record<
  MemberStatus,
  'success' | 'warning' | 'neutral'
> = {
  active: 'success',
  invited: 'warning',
  suspended: 'neutral',
};

const STATUS_RANK: Record<MemberStatus, number> = {
  active: 0,
  invited: 1,
  suspended: 2,
};

// Mock data matching a workspace member roster
const initialMembers: MemberRow[] = [
  {
    id: '1',
    name: 'Olivia Martin',
    email: 'olivia.martin@example.com',
    role: 'owner',
    team: 'Leadership',
    status: 'active',
    lastActive: 'Today',
    lastActiveISO: '2025-07-08',
  },
  {
    id: '2',
    name: 'Jackson Lee',
    email: 'jackson.lee@example.com',
    role: 'admin',
    team: 'Platform',
    status: 'active',
    lastActive: 'Today',
    lastActiveISO: '2025-07-08',
  },
  {
    id: '3',
    name: 'Isabella Nguyen',
    email: 'isabella.nguyen@example.com',
    role: 'editor',
    team: 'Design',
    status: 'active',
    lastActive: 'Yesterday',
    lastActiveISO: '2025-07-07',
  },
  {
    id: '4',
    name: 'William Kim',
    email: 'william.kim@example.com',
    role: 'editor',
    team: 'Platform',
    status: 'active',
    lastActive: 'Jul 5',
    lastActiveISO: '2025-07-05',
  },
  {
    id: '5',
    name: 'Sofia Davis',
    email: 'sofia.davis@example.com',
    role: 'viewer',
    team: 'Marketing',
    status: 'invited',
    lastActive: 'Never',
    lastActiveISO: '',
  },
  {
    id: '6',
    name: 'Mia Wilson',
    email: 'mia.wilson@example.com',
    role: 'admin',
    team: 'Design',
    status: 'active',
    lastActive: 'Jul 6',
    lastActiveISO: '2025-07-06',
  },
  {
    id: '7',
    name: 'Lucas Brown',
    email: 'lucas.brown@example.com',
    role: 'editor',
    team: 'Mobile',
    status: 'suspended',
    lastActive: 'Jun 2',
    lastActiveISO: '2025-06-02',
  },
  {
    id: '8',
    name: 'Ethan Jones',
    email: 'ethan.jones@example.com',
    role: 'editor',
    team: 'Mobile',
    status: 'active',
    lastActive: 'Jul 3',
    lastActiveISO: '2025-07-03',
  },
  {
    id: '9',
    name: 'Ava Taylor',
    email: 'ava.taylor@example.com',
    role: 'viewer',
    team: 'Finance',
    status: 'active',
    lastActive: 'Jun 28',
    lastActiveISO: '2025-06-28',
  },
  {
    id: '10',
    name: 'Noah Garcia',
    email: 'noah.garcia@example.com',
    role: 'editor',
    team: 'Platform',
    status: 'active',
    lastActive: 'Today',
    lastActiveISO: '2025-07-08',
  },
  {
    id: '11',
    name: 'Emma Rodriguez',
    email: 'emma.rodriguez@example.com',
    role: 'viewer',
    team: 'Support',
    status: 'invited',
    lastActive: 'Never',
    lastActiveISO: '',
  },
  {
    id: '12',
    name: 'Liam Patel',
    email: 'liam.patel@example.com',
    role: 'admin',
    team: 'Security',
    status: 'active',
    lastActive: 'Yesterday',
    lastActiveISO: '2025-07-07',
  },
  {
    id: '13',
    name: 'Charlotte Chen',
    email: 'charlotte.chen@example.com',
    role: 'editor',
    team: 'Marketing',
    status: 'active',
    lastActive: 'Jul 1',
    lastActiveISO: '2025-07-01',
  },
  {
    id: '14',
    name: 'James Okafor',
    email: 'james.okafor@example.com',
    role: 'viewer',
    team: 'Finance',
    status: 'suspended',
    lastActive: 'May 19',
    lastActiveISO: '2025-05-19',
  },
  {
    id: '15',
    name: 'Amelia Novak',
    email: 'amelia.novak@example.com',
    role: 'editor',
    team: 'Support',
    status: 'active',
    lastActive: 'Jul 4',
    lastActiveISO: '2025-07-04',
  },
  {
    id: '16',
    name: 'Henry Silva',
    email: 'henry.silva@example.com',
    role: 'viewer',
    team: 'Security',
    status: 'active',
    lastActive: 'Jun 30',
    lastActiveISO: '2025-06-30',
  },
];

// Comparators for the columns whose display value does not sort correctly as
// text. Every comparator sorts ascending; the table flips it for descending.
const comparators = {
  role: (a: MemberRow, b: MemberRow) => ROLE_RANK[a.role] - ROLE_RANK[b.role],
  status: (a: MemberRow, b: MemberRow) =>
    STATUS_RANK[a.status] - STATUS_RANK[b.status],
  lastActive: (a: MemberRow, b: MemberRow) =>
    a.lastActiveISO.localeCompare(b.lastActiveISO),
};

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count !== 1 ? 's' : ''}`;
}

export default function SimpleTableTemplate() {
  const [members, setMembers] = useState<MemberRow[]>(initialMembers);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );
  // Ids waiting on the remove confirmation; null while the dialog is closed.
  const [pendingRemoval, setPendingRemoval] = useState<string[] | null>(null);
  // Set when the dialog opens and kept while it closes, so its heading stays
  // through the closing animation.
  const [removalTitle, setRemovalTitle] = useState('');
  const showToast = useToast();
  const {copy} = useClipboard();

  const {sortedData, sortConfig} = useTableSortableState<MemberRow>({
    data: members,
    defaultSort: [{sortKey: 'name', direction: 'ascending'}],
    comparators,
  });
  const sortablePlugin = useTableSortable<MemberRow>(sortConfig);

  const {selectionConfig, selectionState} = useTableSelectionState<MemberRow>({
    data: members,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });
  const selectionPlugin = useTableSelection<MemberRow>({
    ...selectionConfig,
    getRowLabel: member => member.name,
  });

  const updateMembers = (
    ids: ReadonlySet<string>,
    patch: Partial<MemberRow>,
  ) => {
    setMembers(prev =>
      prev.map(member => (ids.has(member.id) ? {...member, ...patch} : member)),
    );
  };

  const confirmRemoval = () => {
    if (!pendingRemoval) {
      return;
    }
    const removed = new Set(pendingRemoval);
    setMembers(prev => prev.filter(member => !removed.has(member.id)));
    setSelectedKeys(prev => {
      const next = new Set(prev);
      for (const id of removed) {
        next.delete(id);
      }
      return next;
    });
    setPendingRemoval(null);
  };

  const askRemoval = (ids: string[]) => {
    const member =
      ids.length === 1 ? members.find(m => m.id === ids[0]) : undefined;
    setRemovalTitle(
      ids.length === 1
        ? `Remove ${member?.name ?? 'member'}?`
        : `Remove ${pluralize(ids.length, 'member')}?`,
    );
    setPendingRemoval(ids);
  };

  const columns: TableColumn<MemberRow>[] = [
    {
      key: 'name',
      header: 'Name',
      width: proportional(1),
      sortable: true,
      renderCell: member => (
        <HStack gap={3} vAlign="center">
          <Avatar name={member.name} size="sm" />
          <Text type="body" maxLines={1}>
            {member.name}
          </Text>
        </HStack>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      width: proportional(1),
      sortable: true,
      renderCell: member => (
        <Text type="body" color="secondary" maxLines={1}>
          {member.email}
        </Text>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: pixel(112),
      sortable: true,
      renderCell: member => <Text type="body">{ROLE_LABEL[member.role]}</Text>,
    },
    {
      key: 'team',
      header: 'Team',
      width: pixel(128),
      sortable: true,
      renderCell: member => (
        <Text type="body" maxLines={1}>
          {member.team}
        </Text>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: pixel(128),
      sortable: true,
      renderCell: member => (
        <HStack gap={2} vAlign="center">
          <StatusDot
            variant={STATUS_DOT_VARIANT[member.status]}
            label={STATUS_LABEL[member.status]}
          />
          <Text type="body">{STATUS_LABEL[member.status]}</Text>
        </HStack>
      ),
    },
    {
      key: 'lastActive',
      header: 'Last active',
      width: pixel(112),
      sortable: true,
      renderCell: member => (
        <Text type="supporting" color="secondary">
          {member.lastActive}
        </Text>
      ),
    },
    {
      key: 'actions',
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      width: pixel(56),
      renderCell: member => (
        <DropdownMenu
          button={{
            label: `Actions for ${member.name}`,
            variant: 'ghost',
            size: 'sm',
            icon: <Icon icon={EllipsisHorizontalIcon} size="sm" />,
            isIconOnly: true,
          }}
          hasChevron={false}
          alignment="end"
          items={[
            {
              label: 'Edit member',
              icon: PencilIcon,
              onClick: () =>
                // Demo only: replace this toast with the call that performs the action.
                showToast({
                  body: `Demo: editing ${member.name} would open here`,
                  uniqueID: `edit-${member.id}`,
                }),
            },
            {
              label: 'Copy email',
              icon: DocumentDuplicateIcon,
              onClick: () =>
                void copy(member.email).then(copied =>
                  showToast({
                    body: copied
                      ? `Copied ${member.email}`
                      : `Could not copy ${member.email}`,
                    uniqueID: `copy-${member.id}`,
                  }),
                ),
            },
            {
              label: 'Resend invite',
              icon: EnvelopeIcon,
              isDisabled: member.status !== 'invited',
              onClick: () =>
                // Demo only: replace this toast with the call that sends the invite.
                showToast({
                  body: `Demo: the invite would be resent to ${member.email} here`,
                  uniqueID: `resend-${member.id}`,
                }),
            },
            {
              label:
                member.status === 'suspended'
                  ? 'Reactivate member'
                  : 'Suspend member',
              icon: NoSymbolIcon,
              isDisabled: member.status === 'invited',
              onClick: () =>
                updateMembers(new Set([member.id]), {
                  status:
                    member.status === 'suspended' ? 'active' : 'suspended',
                }),
            },
            {type: 'divider' as const},
            {
              label: 'Remove member',
              icon: TrashIcon,
              variant: 'destructive' as const,
              onClick: () => askRemoval([member.id]),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={4}>
              <HStack wrap="wrap" gap={3} vAlign="center">
                <StackItem size="fill">
                  <Heading level={1}>Members</Heading>
                </StackItem>
                <Button
                  label="Invite member"
                  variant="primary"
                  size="lg"
                  icon={<Icon icon={UserPlusIcon} />}
                  onClick={() =>
                    // Demo only: replace this toast with the invite flow.
                    showToast({
                      body: 'Demo: the invite form would open here',
                      uniqueID: 'invite-member',
                    })
                  }
                />
              </HStack>
              {selectionState.hasSelection ? (
                <TableSelectionToolbar
                  selection={selectionState}
                  startContent={
                    <>
                      <Button
                        label="Remove"
                        variant="ghost"
                        icon={<Icon icon={TrashIcon} />}
                        onClick={() =>
                          askRemoval(Array.from(selectionState.selectedKeys))
                        }
                      />
                      {/* Secondary bulk actions stay in an overflow menu so
                          the toolbar fits a phone-width screen. */}
                      <MoreMenu
                        label="More bulk actions"
                        items={[
                          {
                            label: 'Change role',
                            items: ROLE_ORDER.map(role => ({
                              label: ROLE_LABEL[role],
                              onClick: () =>
                                updateMembers(selectionState.selectedKeys, {
                                  role,
                                }),
                            })),
                          },
                          {
                            label: 'Export',
                            icon: ArrowDownTrayIcon,
                            onClick: () =>
                              // Demo only: replace this toast with the export call.
                              showToast({
                                body: `Demo: ${pluralize(selectionState.selectedKeys.size, 'member')} would be exported here`,
                                uniqueID: 'export-members',
                              }),
                          },
                        ]}
                      />
                    </>
                  }
                />
              ) : (
                <Text type="supporting" color="secondary">
                  {pluralize(members.length, 'member')}
                </Text>
              )}
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent role="main" padding={0}>
            <Table<MemberRow>
              data={sortedData}
              columns={columns}
              idKey="id"
              density="balanced"
              dividers="rows"
              textOverflow="truncate"
              hasHover
              plugins={{
                selection: selectionPlugin,
                sortable: sortablePlugin,
              }}
            />
          </LayoutContent>
        }
      />
      <AlertDialog
        isOpen={pendingRemoval !== null}
        onOpenChange={isOpen => {
          if (!isOpen) {
            setPendingRemoval(null);
          }
        }}
        title={removalTitle}
        description="They lose access to this workspace right away. You can invite them again later."
        actionLabel="Remove"
        onAction={confirmRemoval}
      />
    </>
  );
}
