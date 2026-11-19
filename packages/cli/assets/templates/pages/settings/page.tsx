// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  VStack,
  HStack,
  StackItem,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {List, ListItem} from '@astryxdesign/core/List';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Typeahead} from '@astryxdesign/core/Typeahead';
import {MagnifyingGlassIcon} from '@heroicons/react/24/outline';
import type {SearchableItem, SearchSource} from '@astryxdesign/core/Typeahead';
import {useToast} from '@astryxdesign/core/Toast';

// This page is the Profile section; the other items stand for sections an app
// adds, so they demo instead of selecting an empty page.
const CURRENT_NAV = 'Profile';

const NAV_ITEMS = [
  'Profile',
  'Account',
  'Members',
  'Billing',
  'Invoices',
  'API',
];

const SETTINGS_ITEMS: SearchableItem[] = [
  {id: '1', label: 'Username'},
  {id: '2', label: 'First name'},
  {id: '3', label: 'Last name'},
  {id: '4', label: 'Email address'},
  {id: '5', label: 'Change password'},
  {id: '6', label: 'Data Export Access'},
  {id: '7', label: 'Allow Admin to Add Members'},
  {id: '8', label: 'Two-Factor Authentication'},
];

const settingsSearchSource: SearchSource<SearchableItem> = {
  search: (query: string) =>
    SETTINGS_ITEMS.filter(item =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    ),
  bootstrap: () => SETTINGS_ITEMS,
};

export default function SettingsTemplate() {
  const showToast = useToast();
  const isNarrow = useMediaQuery('(max-width: 768px)');
  const openNav = (item: string) => {
    if (item === CURRENT_NAV) {
      return;
    }
    // Demo only: replace this toast with navigation to the section's page.
    showToast({
      body: `Demo: ${item} settings would open here`,
      uniqueID: `nav-${item}`,
    });
  };
  const [username, setUsername] = useState('nicol43');
  const [firstName, setFirstName] = useState('Stephanie');
  const [lastName, setLastName] = useState('Nicol');
  const [email, setEmail] = useState('stephanie_nicol@mail.com');
  const [currentPw, setCurrentPw] = useState('password123');
  const [newPw, setNewPw] = useState('password123');
  const [confirmPw, setConfirmPw] = useState('password123');
  const [dataExport, setDataExport] = useState(false);
  const [adminMembers, setAdminMembers] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [searchValue, setSearchValue] = useState<SearchableItem | null>(null);

  return (
    <Layout
      height="fill"
      contentWidth={1440}
      header={
        <LayoutHeader hasDivider>
          {/* On a narrow screen the search moves under the title instead of squeezing it. */}
          <HStack vAlign="center" wrap="wrap" gap={2}>
            <StackItem size="fill">
              <Heading level={1}>Settings</Heading>
            </StackItem>
            <Typeahead
              label="Search"
              isLabelHidden
              placeholder="Search settings..."
              searchSource={settingsSearchSource}
              value={searchValue}
              onChange={setSearchValue}
              hasEntriesOnFocus
              startIcon={MagnifyingGlassIcon}
            />
          </HStack>
        </LayoutHeader>
      }
      start={
        isNarrow ? undefined : (
          <LayoutPanel hasDivider={false} width={260} padding={2}>
            <List density="balanced">
              {NAV_ITEMS.map(item => (
                <ListItem
                  key={item}
                  label={item}
                  isSelected={item === CURRENT_NAV}
                  aria-current={item === CURRENT_NAV ? 'page' : undefined}
                  onClick={() => openNav(item)}
                />
              ))}
            </List>
          </LayoutPanel>
        )
      }
      content={
        <LayoutContent role="main" padding={4}>
          <VStack gap={4}>
            {/* Mobile: the sidebar nav collapses to a horizontal, centered
                tab bar above the content. */}
            {isNarrow && (
              <VStack hAlign="center">
                <TabList value={CURRENT_NAV} onChange={openNav}>
                  {NAV_ITEMS.map(item => (
                    <Tab key={item} value={item} label={item} />
                  ))}
                </TabList>
              </VStack>
            )}
            <Grid columns={{minWidth: 320, max: 3}} gap={10}>
              <VStack gap={1}>
                <Heading level={3} accessibilityLevel={2}>
                  Basic information
                </Heading>
                <Text type="supporting" color="secondary">
                  View and update your personal details and account information.
                </Text>
              </VStack>
              <VStack gap={4}>
                <TextInput
                  label="Username"
                  value={username}
                  onChange={setUsername}
                />
                <TextInput
                  label="First name"
                  value={firstName}
                  onChange={setFirstName}
                />
                <TextInput
                  label="Last name"
                  value={lastName}
                  onChange={setLastName}
                />
                <TextInput
                  label="Email address"
                  value={email}
                  onChange={setEmail}
                />
                <HStack>
                  <Button
                    label="Save"
                    variant="primary"
                    onClick={() =>
                      // Demo only: replace this toast with the call that performs the action.
                      showToast({
                        body: 'Demo: your basic information would be saved here',
                        uniqueID: 'save-basic',
                      })
                    }
                  />
                </HStack>
              </VStack>
            </Grid>

            <Divider />

            <Grid columns={{minWidth: 320, max: 3}} gap={10}>
              <VStack gap={1}>
                <Heading level={3} accessibilityLevel={2}>
                  Change password
                </Heading>
                <Text type="supporting" color="secondary">
                  Update your password to keep your account secure.
                </Text>
              </VStack>
              <VStack gap={4}>
                <TextInput
                  label="Verify current password"
                  type="password"
                  value={currentPw}
                  onChange={setCurrentPw}
                />
                <TextInput
                  label="New password"
                  type="password"
                  value={newPw}
                  onChange={setNewPw}
                />
                <TextInput
                  label="Confirm password"
                  type="password"
                  value={confirmPw}
                  onChange={setConfirmPw}
                />
                <HStack>
                  <Button
                    label="Save"
                    variant="primary"
                    onClick={() =>
                      // Demo only: replace this toast with the call that performs the action.
                      showToast({
                        body: 'Demo: your new password would be saved here',
                        uniqueID: 'save-password',
                      })
                    }
                  />
                </HStack>
              </VStack>
            </Grid>

            <Divider />

            <Grid columns={{minWidth: 320, max: 3}} gap={10}>
              <VStack gap={1}>
                <Heading level={3} accessibilityLevel={2}>
                  Advanced settings
                </Heading>
                <Text type="supporting" color="secondary">
                  Configure detailed account preferences and security options.
                </Text>
              </VStack>
              <VStack gap={5}>
                <CheckboxInput
                  label="Data Export Access"
                  description="Allow export of personal data and backups."
                  value={dataExport}
                  onChange={setDataExport}
                />
                <CheckboxInput
                  label="Allow Admin to Add Members"
                  description="Admins can invite and manage members."
                  value={adminMembers}
                  onChange={setAdminMembers}
                />
                <CheckboxInput
                  label="Enable Two-Factor Authentication"
                  description="Require 2FA for added account security."
                  value={twoFactor}
                  onChange={setTwoFactor}
                />
                <HStack>
                  <Button
                    label="Save"
                    variant="primary"
                    onClick={() =>
                      // Demo only: replace this toast with the call that performs the action.
                      showToast({
                        body: 'Demo: your advanced settings would be saved here',
                        uniqueID: 'save-advanced',
                      })
                    }
                  />
                </HStack>
              </VStack>
            </Grid>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
