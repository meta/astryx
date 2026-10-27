// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import {BottomSheet, BottomSheetSwitcher} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {useAnnounce} from '@astryxdesign/core/hooks';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {Heading} from '@astryxdesign/core/Heading';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';

const meta: Meta<typeof BottomSheetSwitcher> = {
  title: 'Core/BottomSheetSwitcher',
  component: BottomSheetSwitcher,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '560px'},
    },
  },
  argTypes: {
    ref: {control: false},
    onCancel: {control: false},
  },
  decorators: [
    Story => (
      <div style={{minHeight: 480, padding: 32}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BottomSheetSwitcher>;
type NotificationSheetHeight = 'hug' | 'capped';

interface NotificationOverviewSheetProps {
  height: NotificationSheetHeight;
  onCancel: () => void;
  onContinue: () => void;
}

/**
 * A status message sent as the step hands over. Rendered inside the step's
 * sheet, so `useAnnounce` follows that sheet's dialog (spec:AST-086 FR14): the
 * words are delivered inside the open modal rather than to the page body the
 * modal hides, and a close that is really a hand-over keeps them there.
 */
function ContinueWithStatus({onContinue}: {onContinue: () => void}) {
  const announce = useAnnounce();
  return (
    <Button
      label="Continue"
      onClick={() => {
        announce('Overview saved');
        onContinue();
      }}
    />
  );
}

/**
 * A status message that leaves the person on this step: after going back to
 * it while the next step still fades out, this step is the modal on top and
 * the words are heard inside it (spec:AST-086 FR14).
 */
function SaveDraft() {
  const announce = useAnnounce();
  return (
    <Button
      label="Save draft"
      variant="ghost"
      onClick={() => announce('Draft saved')}
    />
  );
}

function NotificationOverviewSheet({
  height,
  onCancel,
  onContinue,
}: NotificationOverviewSheetProps) {
  return (
    <BottomSheet
      sheetId="overview"
      label="Set up notifications"
      height={height}>
      <Section padding={4}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={3}>Set up notifications</Heading>
            <Text type="supporting" color="secondary">
              Step 1 of 3
            </Text>
          </VStack>
          <Divider />
          <Text type="supporting" color="secondary">
            Stay informed about activity that matters without checking back
            throughout the day.
          </Text>
          <VStack gap={3}>
            <VStack gap={1}>
              <Text type="label">Important activity</Text>
              <Text type="supporting" color="secondary">
                Know when someone mentions you or needs your attention.
              </Text>
            </VStack>
            <VStack gap={1}>
              <Text type="label">Timely reminders</Text>
              <Text type="supporting" color="secondary">
                Get a reminder before work reaches its due date.
              </Text>
            </VStack>
            <VStack gap={1}>
              <Text type="label">Useful summaries</Text>
              <Text type="supporting" color="secondary">
                Catch up on anything you may have missed.
              </Text>
            </VStack>
          </VStack>
          <HStack gap={2} hAlign="end">
            <SaveDraft />
            <Button label="Cancel" variant="secondary" onClick={onCancel} />
            <ContinueWithStatus onContinue={onContinue} />
          </HStack>
        </VStack>
      </Section>
    </BottomSheet>
  );
}

interface NotificationFrequencySheetProps {
  height: NotificationSheetHeight;
  onBack: () => void;
  onContinue: () => void;
  /** Offer a Reset control that confirms through a Core Dialog above the step. */
  hasResetDialog?: boolean;
}

function NotificationFrequencySheet({
  height,
  onBack,
  onContinue,
  hasResetDialog = false,
}: NotificationFrequencySheetProps) {
  const [frequency, setFrequency] = useState('daily');
  const [isResetOpen, setIsResetOpen] = useState(false);

  return (
    <>
      <BottomSheet
        sheetId="frequency"
        label="Notification frequency"
        height={height}>
        <Section padding={4}>
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={3}>How often?</Heading>
              <Text type="supporting" color="secondary">
                Step 2 of 3
              </Text>
            </VStack>
            <Divider />
            <RadioList
              label="Notification frequency"
              isLabelHidden
              value={frequency}
              onChange={setFrequency}>
              <RadioListItem label="Immediately" value="immediately" />
              <RadioListItem label="Daily" value="daily" />
              <RadioListItem label="Weekly" value="weekly" />
            </RadioList>
            <HStack gap={2} hAlign="end">
              {hasResetDialog ? (
                <Button
                  label="Reset"
                  variant="secondary"
                  onClick={() => setIsResetOpen(true)}
                />
              ) : null}
              <Button label="Back" variant="secondary" onClick={onBack} />
              <Button label="Continue" onClick={onContinue} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      {/* A sibling of the sheet, not sheet content: the Dialog is a Core
          overlay opened from the step, and the sheet keeps its lone-Section
          content geometry. */}
      {hasResetDialog ? (
        <Dialog
          isOpen={isResetOpen}
          onOpenChange={setIsResetOpen}
          purpose="form">
          <Layout
            header={
              <DialogHeader
                title="Reset frequency?"
                onOpenChange={setIsResetOpen}
              />
            }
            content={
              <LayoutContent>
                <Text>
                  Notifications go back to daily. You can choose again later.
                </Text>
              </LayoutContent>
            }
            footer={
              <LayoutFooter>
                <HStack gap={2} hAlign="end">
                  <Button
                    label="Keep"
                    variant="secondary"
                    onClick={() => setIsResetOpen(false)}
                  />
                  <Button
                    label="Reset to daily"
                    onClick={() => {
                      setFrequency('daily');
                      setIsResetOpen(false);
                    }}
                  />
                </HStack>
              </LayoutFooter>
            }
          />
        </Dialog>
      ) : null}
    </>
  );
}

interface NotificationChannelsSheetProps {
  height: NotificationSheetHeight;
  onBack: () => void;
  onFinish: () => void;
}

function NotificationChannelsSheet({
  height,
  onBack,
  onFinish,
}: NotificationChannelsSheetProps) {
  const [email, setEmail] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [textMessages, setTextMessages] = useState(false);

  return (
    <BottomSheet
      sheetId="channels"
      label="Notification channels"
      height={height}>
      <Section padding={4}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={3}>Where should we notify you?</Heading>
            <Text type="supporting" color="secondary">
              Step 3 of 3
            </Text>
          </VStack>
          <Divider />
          <Text type="supporting" color="secondary">
            Choose any combination. You can change these preferences later.
          </Text>
          <VStack gap={2}>
            <CheckboxInput label="Email" value={email} onChange={setEmail} />
            <CheckboxInput
              label="Push notifications"
              value={pushNotifications}
              onChange={setPushNotifications}
            />
            <CheckboxInput
              label="Text messages"
              value={textMessages}
              onChange={setTextMessages}
            />
          </VStack>
          <HStack gap={2} hAlign="end">
            <Button label="Back" variant="secondary" onClick={onBack} />
            <Button label="Finish" onClick={onFinish} />
          </HStack>
        </VStack>
      </Section>
    </BottomSheet>
  );
}

interface MultiStepSwitcherExampleProps {
  height: NotificationSheetHeight;
  hasScrim?: boolean;
  hasResetDialog?: boolean;
}

function MultiStepSwitcherExample({
  height,
  hasScrim = true,
  hasResetDialog = false,
}: MultiStepSwitcherExampleProps) {
  const [activeSheet, setActiveSheet] = useState<string | null>(null);

  return (
    <>
      <Button
        label="Set up notifications"
        onClick={() => setActiveSheet('overview')}
      />
      <BottomSheetSwitcher
        activeSheet={activeSheet}
        onActiveSheetChange={setActiveSheet}
        hasScrim={hasScrim}>
        <NotificationOverviewSheet
          height={height}
          onCancel={() => setActiveSheet(null)}
          onContinue={() => setActiveSheet('frequency')}
        />
        <NotificationFrequencySheet
          height={height}
          hasResetDialog={hasResetDialog}
          onBack={() => setActiveSheet('overview')}
          onContinue={() => setActiveSheet('channels')}
        />
        <NotificationChannelsSheet
          height={height}
          onBack={() => setActiveSheet('frequency')}
          onFinish={() => setActiveSheet(null)}
        />
      </BottomSheetSwitcher>
    </>
  );
}

const openFlow: NonNullable<Story['play']> = async ({canvasElement}) => {
  const trigger = canvasElement.querySelector('button');
  if (trigger instanceof HTMLElement) {
    trigger.click();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
};

export const HugContent: Story = {
  name: 'Hug content',
  render: () => <MultiStepSwitcherExample height="hug" />,
  play: openFlow,
};

export const Capped: Story = {
  render: () => <MultiStepSwitcherExample height="capped" />,
  play: openFlow,
};

export const NoScrim: Story = {
  name: 'No scrim',
  render: () => <MultiStepSwitcherExample height="hug" hasScrim={false} />,
  play: openFlow,
};

export const DialogFromStep: Story = {
  name: 'Dialog from a step',
  render: () => <MultiStepSwitcherExample height="hug" hasResetDialog />,
  play: openFlow,
};

export const NarrowViewport: Story = {
  name: 'Narrow viewport',
  parameters: {viewport: {defaultViewport: 'mobile1'}},
  render: () => <MultiStepSwitcherExample height="hug" />,
  play: openFlow,
};
