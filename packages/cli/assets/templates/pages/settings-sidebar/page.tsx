// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState, type CSSProperties} from 'react';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  VStack,
  HStack,
  StackItem,
  Layout,
  LayoutContent,
  LayoutPanel,
} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Link} from '@astryxdesign/core/Link';
import {Button} from '@astryxdesign/core/Button';
import {Selector} from '@astryxdesign/core/Selector';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Card} from '@astryxdesign/core/Card';
import {Switch} from '@astryxdesign/core/Switch';
import {Divider} from '@astryxdesign/core/Divider';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {Badge} from '@astryxdesign/core/Badge';
import {Icon} from '@astryxdesign/core/Icon';
import {Center} from '@astryxdesign/core/Center';
import {useToast} from '@astryxdesign/core/Toast';
import {rtlStyles} from '@astryxdesign/core/utils';
import {
  UserIcon,
  LockIcon,
  ShieldIcon,
  NotificationIcon,
  DocumentIcon,
  CreditCardIcon,
  GlobeIcon,
  WorkIcon,
  WrenchIcon,
  DesktopIcon,
  ComposeIcon,
  ShareIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
} from '@astryxdesign/template-icons';

// Anchor the page to the viewport height so the sidebar + content fill the
// screen. Layout height="fill" is min-height:100% which collapses when the
// host container is content-sized; Layout has no viewport-height prop.
const fillViewport: CSSProperties = {
  minHeight: '100dvh',
};
const iconBox: CSSProperties = {
  borderRadius: 'var(--radius-container)',
  backgroundColor: 'var(--color-background-surface)',
  flexShrink: 0,
};
const rowPadding: CSSProperties = {
  paddingBlock: 'var(--spacing-4)',
};
const sideNavPadding: CSSProperties = {
  paddingBlock: 'var(--spacing-4)',
  paddingInline: 'var(--spacing-3)',
};
const sideNavHeading: CSSProperties = {
  marginInline: 'var(--spacing-4)',
};

const NAV_ITEMS = [
  {label: 'Personal information', icon: UserIcon},
  {label: 'Login & security', icon: LockIcon},
  {label: 'Privacy', icon: ShieldIcon},
  {label: 'Notifications', icon: NotificationIcon},
  {label: 'Taxes', icon: DocumentIcon},
  {label: 'Payments', icon: CreditCardIcon},
  {label: 'Languages & currency', icon: GlobeIcon},
  {label: 'Travel for work', icon: WorkIcon},
];

// Section title shown beside the mobile back button (matches each section's
// in-content heading, which is hidden on mobile to avoid a duplicate).
const SECTION_TITLES: Record<string, string> = {
  'Personal information': 'Personal info',
  'Login & security': 'Login & security',
  Privacy: 'Privacy',
  'Languages & currency': 'Languages & currency',
};

interface InfoRow {
  label: string;
  value: string;
  action: string;
}

const LOGIN_ROWS: InfoRow[] = [
  {label: 'Password', value: 'Not created', action: 'Create'},
];

const SOCIAL_ROWS: InfoRow[] = [
  {label: 'Google', value: 'Connected', action: 'Disconnect'},
];

const DEVICE_ROWS: {
  label: string;
  badge?: string;
  location: string;
  action?: string;
}[] = [
  {
    label: 'OS X 10.15.7 · Chrome',
    badge: 'CURRENT SESSION',
    location: 'McKinney, Texas · March 30, 2026 at 19:31',
  },
  {label: 'Session', location: 'August 9, 2023 at 04:19', action: 'Log out'},
  {
    label: 'OS X 10.15.7 · unknown',
    location: 'Sunnyvale, California · April 14, 2023 at 17:47',
    action: 'Log out',
  },
];

function InfoRowItem({label, value, action}: InfoRow) {
  return (
    <>
      <HStack hAlign="between" vAlign="start" style={rowPadding}>
        <VStack gap={0}>
          <Text type="body" weight="semibold" display="block">
            {label}
          </Text>
          <Text type="supporting" color="secondary" display="block">
            {value}
          </Text>
        </VStack>
        {action && <Link href="#">{action}</Link>}
      </HStack>
      <Divider />
    </>
  );
}

interface ExpandableRowProps {
  label: string;
  value: string;
  children: React.ReactNode;
  isExpanded: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}

function ExpandableRow({
  label,
  value,
  children,
  isExpanded,
  onEdit,
  onCancel,
  onSave,
}: ExpandableRowProps) {
  return (
    <>
      {isExpanded ? (
        <VStack gap={4} style={rowPadding}>
          <Text type="body" weight="semibold" display="block">
            {label}
          </Text>
          {children}
          <HStack gap={2}>
            <Button label="Save" variant="primary" onClick={onSave} />
            <Button label="Cancel" variant="ghost" onClick={onCancel} />
          </HStack>
        </VStack>
      ) : (
        <HStack hAlign="between" vAlign="start" style={rowPadding}>
          <VStack gap={0}>
            <Text type="body" weight="semibold" display="block">
              {label}
            </Text>
            <Text type="supporting" color="secondary" display="block">
              {value}
            </Text>
          </VStack>
          <Link
            href="#"
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              onEdit();
            }}>
            Edit
          </Link>
        </HStack>
      )}
      <Divider />
    </>
  );
}

const LANGUAGES = [
  {label: 'English (Canada)', value: 'en-CA'},
  {label: 'English (US)', value: 'en-US'},
  {label: 'French', value: 'fr'},
  {label: 'Spanish', value: 'es'},
  {label: 'German', value: 'de'},
  {label: 'Japanese', value: 'ja'},
];

const CURRENCIES = [
  {label: 'Canadian dollar (CAD)', value: 'CAD'},
  {label: 'US dollar (USD)', value: 'USD'},
  {label: 'Euro (EUR)', value: 'EUR'},
  {label: 'British pound (GBP)', value: 'GBP'},
  {label: 'Japanese yen (JPY)', value: 'JPY'},
];

const TIMEZONES = [
  {label: '(GMT-05:00) Eastern Time (US & Canada)', value: 'ET'},
  {label: '(GMT-06:00) Central Time (US & Canada)', value: 'CT'},
  {label: '(GMT-07:00) Mountain Time (US & Canada)', value: 'MT'},
  {label: '(GMT-08:00) Pacific Time (US & Canada)', value: 'PT'},
  {label: '(GMT+00:00) UTC', value: 'UTC'},
  {label: '(GMT+01:00) London', value: 'GMT+1'},
];

export default function SettingsSecurityTemplate() {
  const showToast = useToast();
  const isNarrow = useMediaQuery('(max-width: 768px)');
  // Mobile is a master→detail drill-down: 'nav' shows the menu, 'detail' shows
  // the selected section with a back button. Desktop shows both side-by-side.
  const [mobileView, setMobileView] = useState<'nav' | 'detail'>('nav');
  const [activeNav, setActiveNav] = useState('Personal information');
  const [activeTab, setActiveTab] = useState('login');
  const [readReceipts, setReadReceipts] = useState(true);
  const [searchEngines, setSearchEngines] = useState(true);
  const [showCity, setShowCity] = useState(true);
  const [showTripType, setShowTripType] = useState(true);
  const [showStayLength, setShowStayLength] = useState(true);
  const [showServices, setShowServices] = useState(true);
  const [aiFeatures, setAiFeatures] = useState(true);

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [language, setLanguage] = useState('en-CA');
  const [currency, setCurrency] = useState('CAD');
  const [timezone, setTimezone] = useState('ET');

  const [legalName, setLegalName] = useState('Alex Johnson');
  const [preferredName, setPreferredName] = useState('');
  const [email, setEmail] = useState('a***n@example.com');
  const [phone, setPhone] = useState('+1 ***-***-0123');
  const [address, setAddress] = useState('');
  const [mailingAddress, setMailingAddress] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('Provided');

  // Selecting a nav item also drills into the detail view on mobile. An item
  // with no section here demos instead of opening an empty page.
  const selectNav = (label: string) => {
    if (!(label in SECTION_TITLES)) {
      // Demo only: replace this toast with navigation to the section.
      showToast({
        body: `Demo: ${label} settings would open here`,
        uniqueID: `nav-${label}`,
      });
      return;
    }
    setActiveNav(label);
    setMobileView('detail');
  };

  const navList = (
    <VStack gap={4} style={sideNavPadding}>
      <Heading level={2} accessibilityLevel={1} style={sideNavHeading}>
        Account settings
      </Heading>
      <List density="spacious">
        {NAV_ITEMS.map(item => (
          <ListItem
            key={item.label}
            label={item.label}
            startContent={<Icon icon={item.icon} />}
            endContent={
              isNarrow ? (
                <Icon
                  icon={ChevronRightIcon}
                  size="sm"
                  color="secondary"
                  xstyle={rtlStyles.mirror}
                />
              ) : undefined
            }
            isSelected={!isNarrow && activeNav === item.label}
            aria-current={
              !isNarrow && activeNav === item.label ? 'page' : undefined
            }
            onClick={() => selectNav(item.label)}
          />
        ))}
      </List>
      <Divider />
      <List density="spacious">
        <ListItem
          label="Professional hosting tools"
          startContent={<Icon icon={WrenchIcon} />}
          onClick={() =>
            // Demo only: replace this toast with the call that performs the action.
            showToast({
              body: 'Demo: professional hosting tools would open here',
              uniqueID: 'hosting-tools',
            })
          }
        />
      </List>
    </VStack>
  );

  // Mobile, nav view: show only the menu (full width, no sidebar slot).
  if (isNarrow && mobileView === 'nav') {
    return (
      <Layout
        height="fill"
        style={fillViewport}
        content={
          <LayoutContent role="main" padding={2}>
            {navList}
          </LayoutContent>
        }
      />
    );
  }

  return (
    <Layout
      height="fill"
      contentWidth={1200}
      style={fillViewport}
      start={
        isNarrow ? undefined : (
          <LayoutPanel hasDivider padding={0}>
            {navList}
          </LayoutPanel>
        )
      }
      content={
        <LayoutContent role="main" padding={4}>
          <VStack gap={0}>
            {/* Mobile detail view: a back button sits beside the section title
                (the per-section headings below are hidden on mobile). Toolbar's
                start slot edge-compensates the ghost button so its icon aligns
                flush with the content edge. */}
            {isNarrow && (
              <Toolbar
                label={`Back to Account settings — ${SECTION_TITLES[activeNav]}`}
                gap={2}
                startContent={
                  <>
                    <Button
                      label="Back to Account settings"
                      variant="ghost"
                      size="sm"
                      isIconOnly
                      icon={
                        <Icon
                          icon={ArrowLeftIcon}
                          size="sm"
                          xstyle={rtlStyles.mirror}
                        />
                      }
                      onClick={() => setMobileView('nav')}
                    />
                    {/* The phone detail view's title is its level-1 heading:
                        the nav that carries the page title is not shown. */}
                    <Heading level={2} accessibilityLevel={1}>
                      {SECTION_TITLES[activeNav]}
                    </Heading>
                  </>
                }
              />
            )}
            {activeNav === 'Login & security' && (
              <VStack gap={6}>
                {!isNarrow && <Heading level={2}>Login &amp; security</Heading>}

                <TabList value={activeTab} onChange={setActiveTab} hasDivider>
                  <Tab value="login" label="Login" />
                  <Tab value="shared" label="Shared access" />
                </TabList>

                {activeTab === 'login' && (
                  <VStack gap={8}>
                    <VStack gap={0}>
                      <Heading level={3} accessibilityLevel={isNarrow ? 2 : 3}>
                        Login
                      </Heading>
                      <Divider />
                      {LOGIN_ROWS.map(row => (
                        <InfoRowItem key={row.label} {...row} />
                      ))}
                    </VStack>

                    <VStack gap={0}>
                      <Heading level={3} accessibilityLevel={isNarrow ? 2 : 3}>
                        Social accounts
                      </Heading>
                      <Divider />
                      {SOCIAL_ROWS.map(row => (
                        <InfoRowItem key={row.label} {...row} />
                      ))}
                    </VStack>

                    <VStack gap={0}>
                      <Heading level={3} accessibilityLevel={isNarrow ? 2 : 3}>
                        Device history
                      </Heading>
                      <Divider />
                      {DEVICE_ROWS.map((device, i) => (
                        <HStack
                          key={i}
                          gap={3}
                          vAlign="start"
                          style={rowPadding}>
                          <Icon icon={DesktopIcon} />
                          <StackItem size="fill">
                            <VStack gap={0}>
                              <HStack gap={2} vAlign="center">
                                <Text type="body" weight="semibold">
                                  {device.label}
                                </Text>
                                {device.badge && <Badge label={device.badge} />}
                              </HStack>
                              <Text
                                type="supporting"
                                color="secondary"
                                display="block">
                                {device.location}
                              </Text>
                            </VStack>
                          </StackItem>
                          {device.action && (
                            <Link href="#">{device.action}</Link>
                          )}
                        </HStack>
                      ))}
                      <Divider />
                    </VStack>

                    <VStack gap={0}>
                      <Heading level={3} accessibilityLevel={isNarrow ? 2 : 3}>
                        Account
                      </Heading>
                      <Divider />
                      <HStack
                        hAlign="between"
                        vAlign="start"
                        style={rowPadding}>
                        <VStack gap={0}>
                          <Text type="body" weight="semibold" display="block">
                            Deactivate your account
                          </Text>
                          <Text
                            type="supporting"
                            color="secondary"
                            display="block">
                            This action cannot be undone
                          </Text>
                        </VStack>
                        <Link href="#">Deactivate</Link>
                      </HStack>
                      <Divider />
                    </VStack>
                  </VStack>
                )}

                {activeTab === 'shared' && (
                  <VStack gap={8}>
                    <VStack gap={2}>
                      <Heading level={3} accessibilityLevel={isNarrow ? 2 : 3}>
                        Shared access
                      </Heading>
                      <Divider />
                      <Text type="body" color="secondary">
                        Review each request carefully before approving access.
                        We&apos;ll email your employee or co-worker a 4-digit
                        code that lets them log into your account with their
                        trusted device.
                      </Text>
                    </VStack>

                    <Card variant="muted">
                      <HStack gap={4} vAlign="start">
                        <Center width={48} height={48} style={iconBox}>
                          <Icon icon={LockIcon} />
                        </Center>
                        <VStack gap={1}>
                          <Text type="body" weight="bold">
                            Adding devices from people you trust
                          </Text>
                          <Text type="body" color="secondary">
                            When you approve a request, you grant someone full
                            access to your account. They&apos;ll be able to
                            change reservations and send messages on your
                            behalf.
                          </Text>
                        </VStack>
                      </HStack>
                    </Card>
                  </VStack>
                )}
              </VStack>
            )}

            {activeNav === 'Languages & currency' && (
              <VStack gap={6}>
                {!isNarrow && (
                  <Heading level={2}>Languages &amp; currency</Heading>
                )}
                <VStack gap={0}>
                  <ExpandableRow
                    label="Preferred language"
                    value={
                      LANGUAGES.find(l => l.value === language)?.label ??
                      language
                    }
                    isExpanded={expandedRow === 'language'}
                    onEdit={() => setExpandedRow('language')}
                    onCancel={() => setExpandedRow(null)}
                    onSave={() => setExpandedRow(null)}>
                    <Selector
                      label="Language"
                      isLabelHidden
                      size="lg"
                      value={language}
                      onChange={setLanguage}
                      options={LANGUAGES}
                    />
                  </ExpandableRow>
                  <ExpandableRow
                    label="Preferred currency"
                    value={
                      CURRENCIES.find(c => c.value === currency)?.label ??
                      currency
                    }
                    isExpanded={expandedRow === 'currency'}
                    onEdit={() => setExpandedRow('currency')}
                    onCancel={() => setExpandedRow(null)}
                    onSave={() => setExpandedRow(null)}>
                    <Selector
                      label="Currency"
                      isLabelHidden
                      size="lg"
                      value={currency}
                      onChange={setCurrency}
                      options={CURRENCIES}
                    />
                  </ExpandableRow>
                  <ExpandableRow
                    label="Time zone"
                    value={
                      TIMEZONES.find(t => t.value === timezone)?.label ??
                      timezone
                    }
                    isExpanded={expandedRow === 'timezone'}
                    onEdit={() => setExpandedRow('timezone')}
                    onCancel={() => setExpandedRow(null)}
                    onSave={() => setExpandedRow(null)}>
                    <Selector
                      label="Time zone"
                      isLabelHidden
                      size="lg"
                      value={timezone}
                      onChange={setTimezone}
                      options={TIMEZONES}
                    />
                  </ExpandableRow>
                </VStack>
              </VStack>
            )}

            {activeNav === 'Personal information' && (
              <VStack gap={6}>
                {!isNarrow && <Heading level={2}>Personal info</Heading>}
                <VStack gap={0}>
                  <ExpandableRow
                    label="Legal name"
                    value={legalName}
                    isExpanded={expandedRow === 'legalName'}
                    onEdit={() => setExpandedRow('legalName')}
                    onCancel={() => setExpandedRow(null)}
                    onSave={() => setExpandedRow(null)}>
                    <TextInput
                      label="Legal name"
                      isLabelHidden
                      value={legalName}
                      onChange={setLegalName}
                    />
                  </ExpandableRow>
                  <ExpandableRow
                    label="Preferred first name"
                    value={preferredName || 'Not provided'}
                    isExpanded={expandedRow === 'preferredName'}
                    onEdit={() => setExpandedRow('preferredName')}
                    onCancel={() => setExpandedRow(null)}
                    onSave={() => setExpandedRow(null)}>
                    <TextInput
                      label="Preferred first name"
                      isLabelHidden
                      value={preferredName}
                      onChange={setPreferredName}
                    />
                  </ExpandableRow>
                  <ExpandableRow
                    label="Email address"
                    value={email}
                    isExpanded={expandedRow === 'email'}
                    onEdit={() => setExpandedRow('email')}
                    onCancel={() => setExpandedRow(null)}
                    onSave={() => setExpandedRow(null)}>
                    <TextInput
                      label="Email address"
                      isLabelHidden
                      value={email}
                      onChange={setEmail}
                    />
                  </ExpandableRow>
                  <ExpandableRow
                    label="Phone number"
                    value={phone}
                    isExpanded={expandedRow === 'phone'}
                    onEdit={() => setExpandedRow('phone')}
                    onCancel={() => setExpandedRow(null)}
                    onSave={() => setExpandedRow(null)}>
                    <TextInput
                      label="Phone number"
                      isLabelHidden
                      value={phone}
                      onChange={setPhone}
                    />
                  </ExpandableRow>
                  <InfoRowItem
                    label="Identity verification"
                    value="Verified"
                    action=""
                  />
                  <ExpandableRow
                    label="Residential address"
                    value={address || 'Not provided'}
                    isExpanded={expandedRow === 'address'}
                    onEdit={() => setExpandedRow('address')}
                    onCancel={() => setExpandedRow(null)}
                    onSave={() => setExpandedRow(null)}>
                    <TextInput
                      label="Residential address"
                      isLabelHidden
                      value={address}
                      onChange={setAddress}
                    />
                  </ExpandableRow>
                  <ExpandableRow
                    label="Mailing address"
                    value={mailingAddress || 'Not provided'}
                    isExpanded={expandedRow === 'mailingAddress'}
                    onEdit={() => setExpandedRow('mailingAddress')}
                    onCancel={() => setExpandedRow(null)}
                    onSave={() => setExpandedRow(null)}>
                    <TextInput
                      label="Mailing address"
                      isLabelHidden
                      value={mailingAddress}
                      onChange={setMailingAddress}
                    />
                  </ExpandableRow>
                  <ExpandableRow
                    label="Emergency contact"
                    value={emergencyContact}
                    isExpanded={expandedRow === 'emergencyContact'}
                    onEdit={() => setExpandedRow('emergencyContact')}
                    onCancel={() => setExpandedRow(null)}
                    onSave={() => setExpandedRow(null)}>
                    <TextInput
                      label="Emergency contact"
                      isLabelHidden
                      value={emergencyContact}
                      onChange={setEmergencyContact}
                    />
                  </ExpandableRow>
                </VStack>

                <Card padding={4}>
                  <VStack gap={4}>
                    <HStack gap={3} vAlign="start">
                      <Center width={48} height={48} style={iconBox}>
                        <Icon icon={LockIcon} />
                      </Center>
                      <VStack gap={0}>
                        <Text type="body" weight="semibold" display="block">
                          Why isn&apos;t my info shown here?
                        </Text>
                        <Text
                          type="supporting"
                          color="secondary"
                          display="block">
                          We&apos;re hiding some account details to protect your
                          identity.
                        </Text>
                      </VStack>
                    </HStack>
                    <Divider />
                    <HStack gap={3} vAlign="start">
                      <Center width={48} height={48} style={iconBox}>
                        <Icon icon={ComposeIcon} />
                      </Center>
                      <VStack gap={0}>
                        <Text type="body" weight="semibold" display="block">
                          Which details can be edited?
                        </Text>
                        <Text
                          type="supporting"
                          color="secondary"
                          display="block">
                          Contact info and personal details can be edited. If
                          this info was used to verify your identity,
                          you&apos;ll need to get verified again the next time
                          you book—or to continue hosting.
                        </Text>
                      </VStack>
                    </HStack>
                    <Divider />
                    <HStack gap={3} vAlign="start">
                      <Center width={48} height={48} style={iconBox}>
                        <Icon icon={ShareIcon} />
                      </Center>
                      <VStack gap={0}>
                        <Text type="body" weight="semibold" display="block">
                          What info is shared with others?
                        </Text>
                        <Text
                          type="supporting"
                          color="secondary"
                          display="block">
                          We only release contact information after a
                          reservation is confirmed.
                        </Text>
                      </VStack>
                    </HStack>
                  </VStack>
                </Card>
              </VStack>
            )}

            {activeNav === 'Privacy' && (
              <VStack gap={6}>
                {!isNarrow && <Heading level={2}>Privacy</Heading>}

                <VStack gap={8}>
                  <VStack gap={0}>
                    <Heading level={3} accessibilityLevel={isNarrow ? 2 : 3}>
                      Messages
                    </Heading>
                    <VStack style={rowPadding}>
                      <Switch
                        label="Show people when I've read their messages."
                        value={readReceipts}
                        onChange={setReadReceipts}
                        labelPosition="start"
                        labelSpacing="spread"
                      />
                    </VStack>
                    <HStack hAlign="between" vAlign="center" style={rowPadding}>
                      <Text type="body" weight="semibold">
                        Blocked people
                      </Text>
                      <Link href="#">View</Link>
                    </HStack>
                    <Divider />
                  </VStack>

                  <VStack gap={0}>
                    <Heading level={3} accessibilityLevel={isNarrow ? 2 : 3}>
                      Listings
                    </Heading>
                    <VStack style={rowPadding}>
                      <Switch
                        label="Include my listing(s) in search engines"
                        description="Turning this on means search engines, like Google, will display your listing page(s) in search results."
                        value={searchEngines}
                        onChange={setSearchEngines}
                        labelPosition="start"
                        labelSpacing="spread"
                      />
                    </VStack>
                    <Divider />
                  </VStack>

                  <VStack gap={4}>
                    <Heading level={3} accessibilityLevel={isNarrow ? 2 : 3}>
                      Reviews
                    </Heading>
                    <Text type="supporting" color="secondary">
                      Choose what&apos;s shared when you write a review.{' '}
                      <Link href="#" type="supporting">
                        Learn more
                      </Link>
                    </Text>
                    <VStack gap={4}>
                      <Switch
                        label="Show my home city and country"
                        description="Ex: City and country"
                        value={showCity}
                        onChange={setShowCity}
                        labelPosition="start"
                        labelSpacing="spread"
                      />
                      <Switch
                        label="Show my trip type"
                        description="Ex: Stayed with kids or pets"
                        value={showTripType}
                        onChange={setShowTripType}
                        labelPosition="start"
                        labelSpacing="spread"
                      />
                      <Switch
                        label="Show my length of stay"
                        description="Ex: A few nights, about a week, etc."
                        value={showStayLength}
                        onChange={setShowStayLength}
                        labelPosition="start"
                        labelSpacing="spread"
                      />
                      <Switch
                        label="Show my booked services"
                        description="Ex: Gourmet brunch or tasting menu"
                        value={showServices}
                        onChange={setShowServices}
                        labelPosition="start"
                        labelSpacing="spread"
                      />
                    </VStack>
                    <Divider />
                  </VStack>

                  <VStack gap={4}>
                    <Heading level={3} accessibilityLevel={isNarrow ? 2 : 3}>
                      Data privacy
                    </Heading>
                    <Card>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body">Request my personal data</Text>
                        <Link href="#">Request</Link>
                      </HStack>
                    </Card>
                    <Switch
                      label="Help improve AI-powered features"
                      description="When this is on, we use your data to develop and improve AI models."
                      value={aiFeatures}
                      onChange={setAiFeatures}
                      labelPosition="start"
                      labelSpacing="spread"
                    />
                    <Card>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body">Delete my account</Text>
                        <Link href="#">Delete</Link>
                      </HStack>
                    </Card>
                    <Card variant="muted">
                      <HStack gap={4} vAlign="start">
                        <Center width={48} height={48} style={iconBox}>
                          <Icon icon={ShieldIcon} />
                        </Center>
                        <VStack gap={1}>
                          <Text type="body" weight="bold">
                            Committed to privacy
                          </Text>
                          <Text type="supporting" color="secondary">
                            We&apos;re committed to keeping your data protected.
                            See details in our{' '}
                            <Link href="#" type="supporting">
                              Privacy Policy
                            </Link>
                            .
                          </Text>
                        </VStack>
                      </HStack>
                    </Card>
                  </VStack>
                </VStack>
              </VStack>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
