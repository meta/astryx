// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useMemo, useRef, useState, type CSSProperties} from 'react';
import {Layout, LayoutContent, LayoutPanel} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {Divider} from '@astryxdesign/core/Divider';
import {Grid} from '@astryxdesign/core/Grid';
import {Icon} from '@astryxdesign/core/Icon';
import {List, ListItem} from '@astryxdesign/core/List';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {HStack, VStack, StackItem} from '@astryxdesign/core/Stack';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {Token} from '@astryxdesign/core/Token';
import {useToast} from '@astryxdesign/core/Toast';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  BanknotesIcon,
  BookOpenIcon,
  BuildingOfficeIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  ClipboardDocumentCheckIcon,
  ComputerDesktopIcon,
  LightBulbIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  StarIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import {StarIcon as StarIconSolid} from '@heroicons/react/24/solid';

type Destination = {
  id: string;
  section: string;
  title: string;
  summary: string;
  icon: typeof StarIcon;
};

const DESTINATIONS: Destination[] = [
  {
    id: 'helpdesk',
    section: 'Tools',
    title: 'IT help desk',
    summary: 'Request a laptop, access or a fix.',
    icon: ComputerDesktopIcon,
  },
  {
    id: 'expenses',
    section: 'Tools',
    title: 'Expenses',
    summary: 'Submit receipts and track repayments.',
    icon: BanknotesIcon,
  },
  {
    id: 'rooms',
    section: 'Tools',
    title: 'Room booking',
    summary: 'Find and reserve a meeting room.',
    icon: CalendarDaysIcon,
  },
  {
    id: 'directory',
    section: 'Teams',
    title: 'People directory',
    summary: 'Look up a colleague, team or office.',
    icon: UserGroupIcon,
  },
  {
    id: 'offices',
    section: 'Teams',
    title: 'Offices',
    summary: 'Addresses, hours and visitor rules.',
    icon: BuildingOfficeIcon,
  },
  {
    id: 'courses',
    section: 'Learning',
    title: 'Courses',
    summary: 'Required training and optional classes.',
    icon: LightBulbIcon,
  },
  {
    id: 'handbook',
    section: 'Learning',
    title: 'Handbook',
    summary: 'How we work, in one place.',
    icon: BookOpenIcon,
  },
  {
    id: 'security',
    section: 'Policies',
    title: 'Security basics',
    summary: 'Passwords, devices and data handling.',
    icon: ShieldCheckIcon,
  },
  {
    id: 'benefits',
    section: 'Policies',
    title: 'Benefits',
    summary: 'Health, leave and retirement plans.',
    icon: ClipboardDocumentCheckIcon,
  },
];

const SECTIONS = ['Tools', 'Teams', 'Learning', 'Policies'];

type Step = {id: string; label: string; description: string};

const STEPS: Step[] = [
  {
    id: 'profile',
    label: 'Complete your profile',
    description: 'Add a photo, your team and your office.',
  },
  {
    id: 'laptop',
    label: 'Set up your laptop',
    description: 'Sign in, turn on disk encryption and install updates.',
  },
  {
    id: 'security',
    label: 'Finish security training',
    description: 'A 20-minute course with a short quiz.',
  },
  {
    id: 'buddy',
    label: 'Meet your onboarding buddy',
    description: 'Book a 30-minute intro call.',
  },
  {
    id: 'benefits',
    label: 'Choose your benefits',
    description: 'Enroll within your first 30 days.',
  },
  {
    id: 'team',
    label: 'Join your team channels',
    description: 'Say hello and find your first project.',
  },
];

const RECENT = [
  {id: 'r1', title: 'Expenses', at: '2026-03-30T15:10:00Z'},
  {id: 'r2', title: 'Handbook', at: '2026-03-30T09:42:00Z'},
  {id: 'r3', title: 'Room booking', at: '2026-03-29T17:05:00Z'},
];

const ANNOUNCEMENTS = [
  {
    id: 'a1',
    title: 'New hire orientation moves to Tuesdays',
    date: '2026-03-28',
    tag: 'Events',
  },
  {
    id: 'a2',
    title: 'Benefits enrollment closes April 30',
    date: '2026-03-25',
    tag: 'Benefits',
  },
  {
    id: 'a3',
    title: 'Updated travel policy is live',
    date: '2026-03-20',
    tag: 'Policy',
  },
];

const railPanel: CSSProperties = {
  position: 'sticky',
  top: 24,
  alignSelf: 'start',
};

export default function WelcomePortalPage() {
  const showToast = useToast();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [query, setQuery] = useState('');
  const [done, setDone] = useState<Set<string>>(
    () => new Set(['profile', 'laptop', 'security']),
  );
  const [pinned, setPinned] = useState<Set<string>>(
    () => new Set(['expenses', 'handbook']),
  );
  const stepRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Demo only: replace these toasts with the calls that perform each action.
  const demo = (body: string, uniqueID: string) => showToast({body, uniqueID});

  const toggleStep = (id: string, isDone: boolean) =>
    setDone(prev => {
      const next = new Set(prev);
      if (isDone) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

  const togglePin = (id: string) =>
    setPinned(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const nextStep = STEPS.find(step => !done.has(step.id));

  const continueSetup = () => {
    if (!nextStep) {
      return;
    }
    const target = stepRefs.current[nextStep.id];
    target?.scrollIntoView({behavior: 'smooth', block: 'center'});
    target?.focus({preventScroll: true});
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return DESTINATIONS;
    }
    return DESTINATIONS.filter(d =>
      `${d.title} ${d.summary} ${d.section}`.toLowerCase().includes(q),
    );
  }, [query]);

  const openDestination = (d: Destination) =>
    demo(`Demo: ${d.title} would open here.`, `open-${d.id}`);

  const favorites = DESTINATIONS.filter(d => pinned.has(d.id));

  const header = (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={1} type="display-2">
          Welcome back, Alex
        </Heading>
        <Text type="body" color="secondary">
          Tools, teams and guides for your work, in one place.
        </Text>
      </VStack>
      <TextInput
        label="Search tools, teams and guides"
        isLabelHidden
        placeholder="Search tools, teams and guides"
        startIcon={MagnifyingGlassIcon}
        value={query}
        onChange={setQuery}
        hasClear
        width="100%"
      />
    </VStack>
  );

  const startHere = (
    <Card>
      <VStack gap={4}>
        <HStack gap={3} vAlign="center" wrap="wrap">
          <StackItem size="fill">
            <Heading level={2}>Start here</Heading>
          </StackItem>
          <Button
            label={nextStep ? 'Continue' : 'All done'}
            variant="primary"
            isDisabled={!nextStep}
            onClick={continueSetup}
          />
        </HStack>
        <ProgressBar
          label="Onboarding progress"
          value={done.size}
          max={STEPS.length}
          hasValueLabel
          formatValueLabel={(value, max) => `${value} of ${max} done`}
        />
        <VStack gap={3}>
          {STEPS.map(step => (
            <CheckboxInput
              key={step.id}
              ref={el => {
                stepRefs.current[step.id] = el;
              }}
              label={step.label}
              description={step.description}
              value={done.has(step.id)}
              onChange={checked => toggleStep(step.id, checked)}
            />
          ))}
        </VStack>
      </VStack>
    </Card>
  );

  const destinationCard = (d: Destination) => {
    const isPinned = pinned.has(d.id);
    return (
      <ClickableCard
        key={d.id}
        label={`Open ${d.title}`}
        onClick={() => openDestination(d)}>
        <HStack gap={3} vAlign="start">
          <Icon icon={d.icon} size="md" />
          <StackItem size="fill">
            <VStack gap={1}>
              <Text type="body" weight="semibold">
                {d.title}
              </Text>
              <Text type="supporting" color="secondary">
                {d.summary}
              </Text>
            </VStack>
          </StackItem>
          <IconButton
            label={isPinned ? `Unpin ${d.title}` : `Pin ${d.title}`}
            variant="ghost"
            size="sm"
            icon={<Icon icon={isPinned ? StarIconSolid : StarIcon} />}
            onClick={() => togglePin(d.id)}
          />
        </HStack>
      </ClickableCard>
    );
  };

  const destinations = (
    <VStack gap={6}>
      {matches.length === 0 ? (
        <Card variant="gray">
          <VStack gap={1}>
            <Text type="body" weight="semibold">
              No matches for “{query}”
            </Text>
            <Text type="supporting" color="secondary">
              Try another word, or ask the help desk.
            </Text>
          </VStack>
        </Card>
      ) : (
        SECTIONS.map(section => {
          const items = matches.filter(d => d.section === section);
          if (items.length === 0) {
            return null;
          }
          const grid = (
            <Grid columns={{minWidth: 240, max: 3}} gap={3}>
              {items.map(destinationCard)}
            </Grid>
          );
          return isMobile ? (
            <Collapsible
              key={section}
              trigger={<Heading level={2}>{section}</Heading>}>
              {grid}
            </Collapsible>
          ) : (
            <VStack key={section} gap={3}>
              <Heading level={2}>{section}</Heading>
              {grid}
            </VStack>
          );
        })
      )}
    </VStack>
  );

  const favoritesBlock = (
    <VStack gap={2}>
      <Text type="label">Favorites</Text>
      {favorites.length === 0 ? (
        <Text type="supporting" color="secondary">
          Pin a destination to keep it here.
        </Text>
      ) : isMobile ? (
        <HStack gap={2} wrap="wrap">
          {favorites.map(d => (
            <Token
              key={d.id}
              label={d.title}
              onClick={() => openDestination(d)}
            />
          ))}
        </HStack>
      ) : (
        <List density="compact">
          {favorites.map(d => (
            <ListItem
              key={d.id}
              label={d.title}
              startContent={<Icon icon={d.icon} size="sm" />}
              onClick={() => openDestination(d)}
            />
          ))}
        </List>
      )}
    </VStack>
  );

  const recentBlock = (
    <VStack gap={2}>
      <Text type="label">Recently visited</Text>
      <List density="compact">
        {RECENT.map(item => (
          <ListItem
            key={item.id}
            label={item.title}
            endContent={
              <Text type="supporting" color="secondary">
                <Timestamp value={item.at} format="date_time" />
              </Text>
            }
            onClick={() =>
              demo(`Demo: ${item.title} would open here.`, `recent-${item.id}`)
            }
          />
        ))}
      </List>
    </VStack>
  );

  const announcementsBlock = (
    <VStack gap={2}>
      <Text type="label">Announcements</Text>
      <List density="compact">
        {ANNOUNCEMENTS.map(item => (
          <ListItem
            key={item.id}
            label={item.title}
            description={
              <Timestamp value={`${item.date}T12:00:00Z`} format="date" />
            }
            endContent={<Badge label={item.tag} variant="blue" />}
            onClick={() =>
              demo(
                `Demo: the “${item.title}” post would open here.`,
                `news-${item.id}`,
              )
            }
          />
        ))}
      </List>
    </VStack>
  );

  const helpBlock = (
    <Card variant="gray">
      <VStack gap={3}>
        <HStack gap={2} vAlign="center">
          <Icon icon={InformationCircleIcon} size="md" />
          <Text type="body" weight="semibold">
            Need help?
          </Text>
        </HStack>
        <Text type="supporting" color="secondary">
          Can't find something? Ask and someone will point you to it.
        </Text>
        <HStack gap={2} wrap="wrap">
          <Button
            label="Ask a question"
            variant="secondary"
            icon={<Icon icon={ChatBubbleLeftRightIcon} />}
            onClick={() =>
              demo('Demo: a question form would open here.', 'ask')
            }
          />
          <Button
            label="Report a problem"
            variant="ghost"
            icon={<Icon icon={WrenchScrewdriverIcon} />}
            onClick={() =>
              demo('Demo: a help desk ticket would start here.', 'ticket')
            }
          />
        </HStack>
      </VStack>
    </Card>
  );

  return (
    <Layout
      height="auto"
      contentWidth={1200}
      end={
        isMobile ? undefined : (
          <LayoutPanel
            isScrollable={false}
            label="Your shortcuts"
            role="complementary"
            style={railPanel}>
            <VStack gap={6}>
              {favoritesBlock}
              <Divider />
              {recentBlock}
              <Divider />
              {announcementsBlock}
              {helpBlock}
            </VStack>
          </LayoutPanel>
        )
      }
      content={
        <LayoutContent isScrollable={false} padding={isMobile ? 4 : 8}>
          <VStack gap={8}>
            {header}
            {isMobile && favoritesBlock}
            {startHere}
            {destinations}
            {isMobile && (
              <VStack gap={6}>
                {recentBlock}
                {announcementsBlock}
                {helpBlock}
              </VStack>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
