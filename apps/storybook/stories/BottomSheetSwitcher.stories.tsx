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
import {TextInput} from '@astryxdesign/core/TextInput';
import {useToast} from '@astryxdesign/core/Toast';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';

/**
 * Deprecated. A `BottomSheetSwitcher` flow used on its own behaves as
 * released, and when it is stacked with other sheets it is one level of the
 * bottom-sheet stack; a future minor release removes it. These stories stay
 * as its documentation. New
 * flows write each step as a standalone `BottomSheet` driven by one state
 * value — see the `Core/BottomSheetReplace` stories, which mirror these one
 * to one with the replacement.
 */
const meta: Meta<typeof BottomSheetSwitcher> = {
  title: 'Core/BottomSheetSwitcher (deprecated)',
  // The title carries the lifecycle; the ids stay what the browser specs,
  // the docs, and existing links use.
  id: 'core-bottomsheetswitcher',
  component: BottomSheetSwitcher,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '560px'},
      description: {
        component:
          'Deprecated: write each step as its own BottomSheet with isOpen, controlled by one state value that names the open step; the same replace handoff runs between steps. A switcher flow used on its own behaves as released (with two fixes: a toast raised from a step renders above the flow and can be pressed, and under reduced motion its steps follow the reduced-motion rule); stacked with other sheets, it is one level of the stack (it recedes and is blocked when covered and shares the one scrim). A future minor release removes it. The Core/BottomSheetReplace stories show each of these flows rebuilt with the replacement.',
      },
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

/**
 * The deprecated switcher stacked with standalone sheets: one level of the
 * stack, by `component:BottomSheet` FR12. "Over" opens the flow from a
 * control inside a standalone sheet, so the sheet recedes beneath the flow
 * and keeps the one scrim; "under" opens a standalone Help sheet from a step,
 * so the whole flow recedes beneath it and its step backdrops stay clear.
 */
function StackedSwitcherExample({flowIsOver}: {flowIsOver: boolean}) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const toast = useToast();
  const flow = (
    <BottomSheetSwitcher
      activeSheet={activeSheet}
      onActiveSheetChange={setActiveSheet}>
      <BottomSheet sheetId="overview" label="Set up notifications" height="hug">
        <Section padding={4}>
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={3}>Set up notifications</Heading>
              <Text type="supporting" color="secondary">
                Step 1 of 2
              </Text>
            </VStack>
            <HStack gap={2} hAlign="end">
              <Button
                label="Toast from step"
                variant="ghost"
                onClick={() =>
                  toast({body: 'Toast from the step', isAutoHide: false})
                }
              />
              {!flowIsOver && (
                <Button
                  label="Help"
                  variant="secondary"
                  onClick={() => setIsHelpOpen(true)}
                />
              )}
              <Button
                label="Cancel"
                variant="secondary"
                onClick={() => setActiveSheet(null)}
              />
              <Button
                label="Continue"
                onClick={() => setActiveSheet('frequency')}
              />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet sheetId="frequency" label="Frequency" height="hug">
        <Section padding={4}>
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={3}>Frequency</Heading>
              <Text type="supporting" color="secondary">
                Step 2 of 2
              </Text>
            </VStack>
            <HStack gap={2} hAlign="end">
              <Button
                label="Back"
                variant="secondary"
                onClick={() => setActiveSheet('overview')}
              />
              <Button label="Done" onClick={() => setActiveSheet(null)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </BottomSheetSwitcher>
  );
  if (flowIsOver) {
    return (
      <>
        <Button label="Open settings" onClick={() => setIsSheetOpen(true)} />
        <BottomSheet
          isOpen={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          label="Settings"
          height="capped">
          <Section padding={4}>
            <VStack gap={4}>
              <Heading level={3}>Settings</Heading>
              <Text>
                A standalone sheet. The deprecated flow opened from here stacks
                on top of it; this sheet recedes and keeps the one scrim.
              </Text>
              <HStack gap={2}>
                <Button
                  label="Set up notifications"
                  onClick={() => setActiveSheet('overview')}
                />
                {/* Closes the host. While the flow is open above it, the
                    browser's modal blocking keeps this control out of reach
                    (the flow's dialog is modal), so that scenario — the
                    host closed from code, as a route change would — is
                    driven by the real-browser check; a person reaches it
                    before the flow opens and after a step closes it. */}
                <Button
                  label="Close settings"
                  variant="secondary"
                  onClick={() => setIsSheetOpen(false)}
                />
              </HStack>
            </VStack>
          </Section>
          {flow}
        </BottomSheet>
      </>
    );
  }
  return (
    <>
      <Button
        label="Set up notifications"
        onClick={() => setActiveSheet('overview')}
      />
      {flow}
      <BottomSheet
        isOpen={isHelpOpen}
        onOpenChange={setIsHelpOpen}
        label="Help"
        height="hug">
        <Section padding={4}>
          <VStack gap={4}>
            <Heading level={3}>Help</Heading>
            <Text>
              A standalone sheet opened from a step. The whole deprecated flow
              recedes beneath it as one level; this sheet's backdrop stays clear
              because the flow owns the stack's scrim.
            </Text>
            <HStack gap={2} hAlign="end">
              <Button label="Got it" onClick={() => setIsHelpOpen(false)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </>
  );
}

/**
 * A note sheet with a text field sits over a deprecated flow whose step
 * advances from code — a timer here, a background completion in an app.
 * The flow's level becomes a new dialog beneath the note sheet, so the
 * registry puts the note sheet back on top; the field being typed in keeps
 * focus through that, and every keystroke lands in it.
 */
function TypingOverAdvancingFlowExample() {
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [isArmed, setIsArmed] = useState(false);
  const toast = useToast();
  return (
    <>
      <Button
        label="Set up notifications"
        onClick={() => setActiveSheet('overview')}
      />
      <BottomSheetSwitcher
        activeSheet={activeSheet}
        onActiveSheetChange={setActiveSheet}>
        <BottomSheet
          sheetId="overview"
          label="Set up notifications"
          height="hug">
          <Section padding={4}>
            <VStack gap={4}>
              <Heading level={3}>Set up notifications</Heading>
              <Text type="supporting" color="secondary">
                Step 1 of 2. Add a note, then type: the flow moves to step 2 on
                its own two seconds after the note opens.
              </Text>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Add a note"
                  onClick={() => {
                    setIsNoteOpen(true);
                    if (!isArmed) {
                      setIsArmed(true);
                      setTimeout(() => setActiveSheet('frequency'), 2000);
                    }
                  }}
                />
                <Button
                  label="Continue"
                  variant="primary"
                  onClick={() => setActiveSheet('frequency')}
                />
              </HStack>
            </VStack>
          </Section>
        </BottomSheet>
        <BottomSheet
          sheetId="frequency"
          label="Notification frequency"
          height="hug">
          <Section padding={4}>
            <VStack gap={4}>
              <Heading level={3}>Notification frequency</Heading>
              <Text type="supporting" color="secondary">
                Step 2 of 2
              </Text>
              <HStack gap={2} hAlign="end">
                <Button label="Done" onClick={() => setActiveSheet(null)} />
              </HStack>
            </VStack>
          </Section>
        </BottomSheet>
      </BottomSheetSwitcher>
      <BottomSheet
        isOpen={isNoteOpen}
        onOpenChange={setIsNoteOpen}
        label="Note"
        height="hug">
        <Section padding={4}>
          <VStack gap={4}>
            <Heading level={3}>Note</Heading>
            <TextInput
              label="Note"
              value={note}
              onChange={setNote}
              hasAutoFocus
            />
            <HStack gap={2} hAlign="end">
              <Button
                label="Toast from note"
                variant="secondary"
                onClick={() => toast({body: 'Note toast', isAutoHide: false})}
              />
              <Button label="Save" onClick={() => setIsNoteOpen(false)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
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

export const StackedOverASheet: Story = {
  name: 'Stacked over a standalone sheet',
  render: () => <StackedSwitcherExample flowIsOver />,
};

export const StackedUnderASheet: Story = {
  name: 'Stacked under a standalone sheet',
  render: () => <StackedSwitcherExample flowIsOver={false} />,
};

export const TypingOverAdvancingFlow: Story = {
  name: 'Typing in a sheet over a flow that advances from code',
  render: () => <TypingOverAdvancingFlowExample />,
};
