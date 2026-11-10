// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import * as React from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  VStack,
  HStack,
  Stack,
  StackItem,
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
} from '@astryxdesign/core/Layout';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Divider} from '@astryxdesign/core/Divider';
import {Switch} from '@astryxdesign/core/Switch';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Slider} from '@astryxdesign/core/Slider';
import {Selector} from '@astryxdesign/core/Selector';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {Popover} from '@astryxdesign/core/Popover';
import {HoverCard} from '@astryxdesign/core/HoverCard';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {Dialog} from '@astryxdesign/core/Dialog';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {List, ListItem} from '@astryxdesign/core/List';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Skeleton} from '@astryxdesign/core/Skeleton';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {
  colorVars,
  spacingVars,
  radiusVars,
  durationVars,
  easeVars,
} from '@astryxdesign/core/theme/tokens.stylex';

// =============================================================================
// Styles — width constraints + reduced motion demo primitive
// =============================================================================

const styles = stylex.create({
  pageContainer: {
    maxWidth: 960,
    paddingInline: spacingVars['--spacing-6'],
    paddingBlock: spacingVars['--spacing-6'],
  },
  maxW300: {
    maxWidth: 300,
  },
  maxW220: {
    maxWidth: 220,
  },
  textInputItem: {
    maxWidth: 300,
  },
  ballLane: {
    position: 'relative',
    height: 48,
    paddingBlock: spacingVars['--spacing-2'],
  },
  ball: {
    width: 32,
    height: 32,
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-accent'],
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-medium'],
    transitionTimingFunction: easeVars['--ease-standard'],
    transform: 'translateX(0)',
  },
  ballEnd: {
    transform: 'translateX(280px)',
  },
  ballReduced: {
    transitionDuration: '0ms',
  },
});

// =============================================================================
// Navigation & Overlays
// =============================================================================

function NavigationOverlaysCard() {
  const [modalOpen, setModalOpen] = React.useState(false);

  return (
    <>
      <Card>
        <VStack gap={4}>
          <Text type="label" display="block">
            Navigation & Overlays
          </Text>
          <VStack gap={2}>
            <Text type="supporting" color="secondary" display="block">
              Modal — backdrop fade and content entry · duration-medium-max
            </Text>
            <HStack gap={2}>
              <Button label="Open modal" onClick={() => setModalOpen(true)} />
            </HStack>
          </VStack>
        </VStack>
      </Card>
      <Dialog isOpen={modalOpen} onOpenChange={setModalOpen} width={420}>
        <Layout
          header={
            <LayoutHeader hasDivider padding={4}>
              <Heading level={3}>Confirm action</Heading>
            </LayoutHeader>
          }
          content={
            <LayoutContent padding={4}>
              <Text type="body" color="secondary">
                The dialog uses the active theme&apos;s motion tokens for entry
                and dismiss. Backdrop and content animate together.
              </Text>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider padding={4}>
              <HStack gap={2}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onClick={() => setModalOpen(false)}
                />
                <Button
                  label="Confirm"
                  variant="primary"
                  onClick={() => setModalOpen(false)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}

// =============================================================================
// Micro-Interactions
// =============================================================================

function PopoverDemoContent() {
  return (
    <Card variant="transparent" padding={3} maxWidth={220}>
      <VStack gap={1}>
        <Text type="label">Popover</Text>
        <Text type="supporting" color="secondary">
          Uses duration-fast-max. Fades and translates toward the trigger.
        </Text>
      </VStack>
    </Card>
  );
}

function HoverCardDemoContent() {
  return (
    <Card variant="transparent" padding={3} maxWidth={220}>
      <VStack gap={1}>
        <Text type="label">HoverCard</Text>
        <Text type="supporting" color="secondary">
          Hover to trigger · duration-fast-max
        </Text>
      </VStack>
    </Card>
  );
}

function MicroInteractionsCard() {
  const [switch1, setSwitch1] = React.useState(false);
  const [switch2, setSwitch2] = React.useState(true);
  const [check1, setCheck1] = React.useState(false);
  const [check2, setCheck2] = React.useState(true);
  const [check3, setCheck3] = React.useState(false);
  const [sliderValue, setSliderValue] = React.useState(50);
  const [selectorValue, setSelectorValue] = React.useState('Apple');
  const [emailValue, setEmailValue] = React.useState('ted@example.com');
  const [showStatus, setShowStatus] = React.useState(false);

  return (
    <Card>
      <VStack gap={4}>
        <Text type="label" display="block">
          Micro-Interactions
        </Text>

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Buttons — hover, press, focus · duration-fast · Dropdown ·
            duration-fast-max
          </Text>
          <HStack gap={2} wrap="wrap">
            <Button label="Primary" variant="primary" onClick={() => {}} />
            <Button label="Secondary" variant="secondary" onClick={() => {}} />
            <Button label="Ghost" variant="ghost" onClick={() => {}} />
            <Button
              label="Destructive"
              variant="destructive"
              onClick={() => {}}
            />
            <DropdownMenu
              button={{label: 'Dropdown', variant: 'secondary'}}
              items={[
                {label: 'Edit', onClick: () => {}},
                {label: 'Duplicate', onClick: () => {}},
                {type: 'divider'},
                {label: 'Delete', onClick: () => {}},
              ]}
            />
          </HStack>
        </VStack>

        <Divider />

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Popover · HoverCard · Tooltip — fade + translate · duration-fast-max
            · direction-aware
          </Text>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Popover
              content={<PopoverDemoContent />}
              placement="below"
              hasCloseButton={false}>
              <Button label="Below" variant="secondary" size="sm" />
            </Popover>
            <Popover
              content={<PopoverDemoContent />}
              placement="above"
              hasCloseButton={false}>
              <Button label="Above" variant="secondary" size="sm" />
            </Popover>
            <Popover
              content={<PopoverDemoContent />}
              placement="end"
              hasCloseButton={false}>
              <Button label="End" variant="secondary" size="sm" />
            </Popover>
            <Popover
              content={<PopoverDemoContent />}
              placement="start"
              hasCloseButton={false}>
              <Button label="Start" variant="secondary" size="sm" />
            </Popover>
            <HoverCard content={<HoverCardDemoContent />} placement="below">
              <Button label="HoverCard" variant="secondary" size="sm" />
            </HoverCard>
            <Tooltip content="Tooltip · duration-fast-max">
              <Button label="Tooltip" variant="secondary" size="sm" />
            </Tooltip>
          </HStack>
        </VStack>

        <Divider />

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Switches — thumb slide, track color · duration-fast
          </Text>
          <HStack gap={4}>
            <Switch
              label="Notifications"
              value={switch1}
              onChange={setSwitch1}
            />
            <Switch label="Sync" value={switch2} onChange={setSwitch2} />
          </HStack>
        </VStack>

        <Divider />

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Checkboxes — check transition · duration-fast
          </Text>
          <HStack gap={6}>
            <CheckboxInput
              label="Option A"
              value={check1}
              onChange={setCheck1}
            />
            <CheckboxInput
              label="Option B"
              value={check2}
              onChange={setCheck2}
            />
            <CheckboxInput
              label="Option C"
              value={check3}
              onChange={setCheck3}
            />
          </HStack>
        </VStack>

        <Divider />

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Slider — thumb travel · duration-fast · value tooltip ·
            duration-fast-min
          </Text>
          <Slider
            label="Volume"
            value={sliderValue}
            onChange={setSliderValue}
            min={0}
            max={100}
            containerXstyle={styles.maxW300}
          />
        </VStack>

        <Divider />

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Input validation — status message entry · duration-fast-max
          </Text>
          <HStack gap={3} vAlign="end">
            <StackItem size="fill" xstyle={styles.textInputItem}>
              <TextInput
                label="Email"
                value={emailValue}
                onChange={setEmailValue}
                placeholder="Enter email..."
                status={
                  showStatus
                    ? {type: 'success', message: 'Email verified'}
                    : undefined
                }
              />
            </StackItem>
            <Button
              label={showStatus ? 'Clear' : 'Validate'}
              variant={showStatus ? 'ghost' : 'secondary'}
              onClick={() => setShowStatus(v => !v)}
            />
          </HStack>
        </VStack>

        <Divider />

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Selector — open/close, chevron rotation · duration-fast-max
          </Text>
          <Selector
            label="Fruit"
            options={['Apple', 'Banana', 'Orange', 'Mango']}
            value={selectorValue}
            onChange={setSelectorValue}
            controlXstyle={styles.maxW220}
          />
        </VStack>
      </VStack>
    </Card>
  );
}

// =============================================================================
// Loading & Status
// =============================================================================

function LoadingStatusCard() {
  const [progressValue, setProgressValue] = React.useState(65);

  return (
    <Card>
      <VStack gap={4}>
        <Text type="label" display="block">
          Loading & Status
        </Text>

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Spinners — continuous rotation · duration-medium-max
          </Text>
          <HStack gap={4} vAlign="center">
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
          </HStack>
        </VStack>

        <Divider />

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Skeletons — pulsing opacity with stagger · duration-medium-max
          </Text>
          <VStack gap={2}>
            <HStack gap={3} vAlign="center">
              <Skeleton width={40} height={40} radius="rounded" index={0} />
              <StackItem size="fill">
                <VStack gap={1}>
                  <Skeleton width={160} height={14} index={1} />
                  <Skeleton width={100} height={10} index={2} />
                </VStack>
              </StackItem>
            </HStack>
            <Skeleton width="100%" height={12} index={3} />
            <Skeleton width="80%" height={12} index={4} />
            <Skeleton width="60%" height={12} index={5} />
          </VStack>
        </VStack>

        <Divider />

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Progress — determinate: duration-medium · indeterminate: continuous
          </Text>
          <VStack gap={3}>
            <ProgressBar value={progressValue} label={`${progressValue}%`} />
            <HStack gap={2}>
              {[0, 25, 50, 75, 100].map(v => (
                <Button
                  key={v}
                  label={`${v}%`}
                  variant="ghost"
                  size="sm"
                  onClick={() => setProgressValue(v)}
                />
              ))}
            </HStack>
          </VStack>
        </VStack>

        <Divider />

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Status dots — continuous pulse · 2s loop
          </Text>
          <HStack gap={4} vAlign="center">
            <HStack gap={2} vAlign="center">
              <StatusDot variant="success" label="Online" isPulsing />
              <Text type="body">Online</Text>
            </HStack>
            <HStack gap={2} vAlign="center">
              <StatusDot variant="warning" label="Away" isPulsing />
              <Text type="body">Away</Text>
            </HStack>
            <HStack gap={2} vAlign="center">
              <StatusDot variant="error" label="Busy" isPulsing />
              <Text type="body">Busy</Text>
            </HStack>
          </HStack>
        </VStack>
      </VStack>
    </Card>
  );
}

// =============================================================================
// Surface Interactions
// =============================================================================

function SurfaceInteractionsCard() {
  const [activeTab, setActiveTab] = React.useState('overview');

  return (
    <Card>
      <VStack gap={4}>
        <Text type="label" display="block">
          Surface Interactions
        </Text>

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Tabs — color, active indicator · duration-fast
          </Text>
          <TabList value={activeTab} onChange={setActiveTab}>
            <Tab value="overview" label="Overview" />
            <Tab value="analytics" label="Analytics" />
            <Tab value="reports" label="Reports" />
            <Tab value="settings" label="Settings" />
          </TabList>
        </VStack>

        <Divider />

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            List items — background hover · duration-fast-min
          </Text>
          <List density="balanced" hasDividers>
            <ListItem
              label="Dashboard"
              description="View your metrics"
              onClick={() => {}}
            />
            <ListItem
              label="Projects"
              description="Manage active projects"
              onClick={() => {}}
            />
            <ListItem
              label="Settings"
              description="Configure preferences"
              onClick={() => {}}
            />
          </List>
        </VStack>
      </VStack>
    </Card>
  );
}

// =============================================================================
// Reduced Motion
// =============================================================================

function ReducedMotionCard() {
  const [simulateReduced, setSimulateReduced] = React.useState(false);
  const [moved, setMoved] = React.useState(false);

  return (
    <Card>
      <VStack gap={4}>
        <Text type="label" display="block">
          Reduced Motion
        </Text>

        <VStack gap={2}>
          <Text type="supporting" color="secondary" display="block">
            Honor the OS-level prefers-reduced-motion setting; replace movement
            with instant state changes. Toggle the switch to simulate.
          </Text>
          <VStack gap={3}>
            <Stack xstyle={styles.ballLane}>
              <Stack
                xstyle={[
                  styles.ball,
                  moved && styles.ballEnd,
                  simulateReduced && styles.ballReduced,
                ]}
              />
            </Stack>
            <HStack gap={3} vAlign="center">
              <Button
                label={moved ? 'Reset' : 'Move'}
                variant="primary"
                size="sm"
                onClick={() => setMoved(m => !m)}
              />
              <Switch
                label="Simulate reduced motion"
                value={simulateReduced}
                onChange={setSimulateReduced}
              />
            </HStack>
          </VStack>
        </VStack>
      </VStack>
    </Card>
  );
}

// =============================================================================
// Page
// =============================================================================

export default function MotionExamplesPage() {
  return (
    <VStack gap={6} xstyle={styles.pageContainer}>
      <VStack gap={2}>
        <Heading level={1}>Motion Examples</Heading>
        <Text type="body" color="secondary">
          How Astryx components apply duration and easing tokens. Each section
          calls out which tokens drive the motion so you can see the scale in
          action.
        </Text>
      </VStack>

      <VStack gap={4}>
        <NavigationOverlaysCard />
        <MicroInteractionsCard />
        <LoadingStatusCard />
        <SurfaceInteractionsCard />
        <ReducedMotionCard />
      </VStack>
    </VStack>
  );
}
