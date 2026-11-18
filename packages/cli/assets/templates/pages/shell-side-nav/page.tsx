// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Divider} from '@astryxdesign/core/Divider';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {Icon} from '@astryxdesign/core/Icon';
import type {IconType} from '@astryxdesign/core/Icon';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {useToast} from '@astryxdesign/core/Toast';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import type {StatusDotVariant} from '@astryxdesign/core/StatusDot';
import {Card} from '@astryxdesign/core/Card';
import {Stack, VStack, HStack} from '@astryxdesign/core/Stack';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {
  SparklesIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  BookOpenIcon,
  Cog6ToothIcon,
  UserCircleIcon,
  UserIcon,
  BuildingOffice2Icon,
  CodeBracketIcon,
} from '@heroicons/react/24/outline';

type Conversation = {
  label: string;
  status: StatusDotVariant;
  statusLabel: string;
};

type Workspace = {
  name: string;
  icon: IconType;
  chats: Conversation[];
};

const WORKSPACES: Workspace[] = [
  {
    name: 'Personal',
    icon: UserIcon,
    chats: [
      {
        label: 'Weekend trip planning',
        status: 'success',
        statusLabel: 'Active',
      },
      {
        label: 'Recipe ideas for the week',
        status: 'neutral',
        statusLabel: 'Idle',
      },
      {
        label: 'Book recommendations',
        status: 'warning',
        statusLabel: 'Needs review',
      },
      {label: 'Home workout plan', status: 'neutral', statusLabel: 'Idle'},
    ],
  },
  {
    name: 'Acme Corp',
    icon: BuildingOffice2Icon,
    chats: [
      {label: 'Q3 roadmap draft', status: 'accent', statusLabel: 'In progress'},
      {
        label: 'Customer onboarding flow',
        status: 'success',
        statusLabel: 'Active',
      },
      {
        label: 'Pricing strategy review',
        status: 'warning',
        statusLabel: 'Needs review',
      },
      {label: 'Standup summary', status: 'neutral', statusLabel: 'Idle'},
    ],
  },
  {
    name: 'Open Source',
    icon: CodeBracketIcon,
    chats: [
      {
        label: 'StyleX migration notes',
        status: 'accent',
        statusLabel: 'In progress',
      },
      {
        label: 'Skeleton loading states',
        status: 'success',
        statusLabel: 'Active',
      },
      {label: 'Accessibility audit', status: 'error', statusLabel: 'Blocked'},
      {label: 'Release notes v4.0', status: 'neutral', statusLabel: 'Idle'},
    ],
  },
];

const SELECTED_CHAT = 'StyleX migration notes';

const MESSAGES = [
  {role: 'assistant', width: '78%', height: 104},
  {role: 'user', width: '48%', height: 48},
  {role: 'assistant', width: '64%', height: 132},
  {role: 'user', width: '38%', height: 40},
];

function ConversationItem({
  label,
  status,
  statusLabel,
  isSelected,
}: {
  label: string;
  status: StatusDotVariant;
  statusLabel: string;
  isSelected?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const showMenu = isHovered || isMenuOpen;
  const showToast = useToast();
  const confirm = useImperativeAlertDialog();
  // Demo only: replace these toasts with the calls that act on the conversation.
  const demoAction = (verb: string) =>
    showToast({
      body: `Demo: ${label} would be ${verb} here`,
      uniqueID: `${verb}-${label}`,
    });

  return (
    <Stack
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}>
      <SideNavItem
        label={label}
        href="#"
        isSelected={isSelected}
        endContent={
          showMenu ? (
            <MoreMenu
              size="sm"
              label="Conversation options"
              onOpenChange={setIsMenuOpen}
              items={[
                {label: 'Pin', onClick: () => demoAction('pinned')},
                {label: 'Rename', onClick: () => demoAction('renamed')},
                {label: 'Archive', onClick: () => demoAction('archived')},
                {
                  label: 'Delete',
                  onClick: () =>
                    confirm.show({
                      title: `Delete ${label}?`,
                      description: "This demo won't delete anything.",
                      actionLabel: 'Delete',
                      onAction: () => {
                        confirm.hide();
                        demoAction('deleted');
                      },
                    }),
                },
              ]}
            />
          ) : (
            <StatusDot variant={status} label={statusLabel} />
          )
        }
      />
      {confirm.element}
    </Stack>
  );
}

export default function ShellSideNav() {
  return (
    <AppShell
      contentPadding={0}
      sideNav={
        <SideNav
          collapsible
          resizable={{defaultWidth: 300, minWidth: 220, maxWidth: 420}}
          header={
            <SideNavHeading
              heading="AI Assistant"
              icon={<NavIcon icon={<Icon icon={SparklesIcon} size="sm" />} />}
              headingHref="#"
            />
          }
          footer={
            <SideNavSection title="Account" isHeaderHidden>
              <SideNavItem label="Settings" icon={Cog6ToothIcon} href="#" />
              <SideNavItem label="Sarah Chen" icon={UserCircleIcon} href="#" />
            </SideNavSection>
          }>
          <SideNavSection title="Menu" isHeaderHidden>
            <SideNavItem label="New chat" icon={PlusIcon} href="#" />
            <SideNavItem label="Search" icon={MagnifyingGlassIcon} href="#" />
            <SideNavItem label="Library" icon={BookOpenIcon} href="#" />
          </SideNavSection>
          <Divider />
          <SideNavSection title="Workspaces" isHeaderHidden>
            {WORKSPACES.map(workspace => (
              <SideNavItem
                key={workspace.name}
                label={workspace.name}
                icon={workspace.icon}
                collapsible={{defaultIsCollapsed: false}}>
                <VStack gap={0.5}>
                  {workspace.chats.map(chat => (
                    <ConversationItem
                      key={chat.label}
                      label={chat.label}
                      status={chat.status}
                      statusLabel={chat.statusLabel}
                      isSelected={chat.label === SELECTED_CHAT}
                    />
                  ))}
                </VStack>
              </SideNavItem>
            ))}
          </SideNavSection>
        </SideNav>
      }>
      <Layout
        height="fill"
        contentWidth={768}
        content={
          <LayoutContent padding={6}>
            <VStack gap={5}>
              {MESSAGES.map((message, mi) => (
                <HStack
                  key={mi}
                  hAlign={message.role === 'assistant' ? 'start' : 'end'}>
                  <Card
                    variant="muted"
                    padding={0}
                    width={message.width}
                    height={message.height}
                  />
                </HStack>
              ))}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <Card variant="muted" padding={0} width="100%" height={56} />
          </LayoutFooter>
        }
      />
    </AppShell>
  );
}
