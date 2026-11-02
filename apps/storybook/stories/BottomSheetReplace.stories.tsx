// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useEffect, useState} from 'react';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {Divider} from '@astryxdesign/core/Divider';
import {Heading} from '@astryxdesign/core/Heading';
import {Section} from '@astryxdesign/core/Section';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {Popover} from '@astryxdesign/core/Popover';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {useToast} from '@astryxdesign/core/Toast';

/**
 * The BottomSheetSwitcher stories rebuilt with standalone sheets only: one
 * `isOpen` per step, no `BottomSheetSwitcher` and no `sheetId`. Each story
 * mirrors the switcher story of the same name (content, labels, heights,
 * steps) so the two can be compared one to one. Moving from one step to the
 * next closes one sheet and opens the next in the same update, which the
 * sheets run as a replace handoff.
 */
const meta: Meta<typeof BottomSheet> = {
  title: 'Core/BottomSheetReplace',
  component: BottomSheet,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      story: {inline: false, height: '560px'},
    },
  },
  argTypes: {
    ref: {control: false},
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
type Story = StoryObj<typeof BottomSheet>;
type NotificationSheetHeight = 'hug' | 'capped';
type NotificationStep = 'overview' | 'frequency' | 'channels';

interface NotificationStepSheetProps {
  isOpen: boolean;
  /** Called with false when the step requests dismissal (Escape, scrim, swipe). */
  onOpenChange: (isOpen: boolean) => void;
  hasScrim: boolean;
}

interface NotificationOverviewSheetProps extends NotificationStepSheetProps {
  height: NotificationSheetHeight;
  onCancel: () => void;
  onContinue: () => void;
}

function NotificationOverviewSheet({
  isOpen,
  onOpenChange,
  hasScrim,
  height,
  onCancel,
  onContinue,
}: NotificationOverviewSheetProps) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      hasScrim={hasScrim}
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
            <Button label="Cancel" variant="secondary" onClick={onCancel} />
            <Button label="Continue" onClick={onContinue} />
          </HStack>
        </VStack>
      </Section>
    </BottomSheet>
  );
}

interface NotificationFrequencySheetProps extends NotificationStepSheetProps {
  height: NotificationSheetHeight;
  onBack: () => void;
  onContinue: () => void;
}

function NotificationFrequencySheet({
  isOpen,
  onOpenChange,
  hasScrim,
  height,
  onBack,
  onContinue,
}: NotificationFrequencySheetProps) {
  const [frequency, setFrequency] = useState('daily');

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      hasScrim={hasScrim}
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
            <Button label="Back" variant="secondary" onClick={onBack} />
            <Button label="Continue" onClick={onContinue} />
          </HStack>
        </VStack>
      </Section>
    </BottomSheet>
  );
}

interface NotificationChannelsSheetProps extends NotificationStepSheetProps {
  height: NotificationSheetHeight;
  onBack: () => void;
  onFinish: () => void;
}

function NotificationChannelsSheet({
  isOpen,
  onOpenChange,
  hasScrim,
  height,
  onBack,
  onFinish,
}: NotificationChannelsSheetProps) {
  const [email, setEmail] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [textMessages, setTextMessages] = useState(false);

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      hasScrim={hasScrim}
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

interface MultiStepReplaceExampleProps {
  height: NotificationSheetHeight;
  hasScrim?: boolean;
}

function MultiStepReplaceExample({
  height,
  hasScrim = true,
}: MultiStepReplaceExampleProps) {
  // One value names the open step, so moving on closes one sheet and opens
  // the next in the same update. A step that is dismissed closes the flow.
  const [step, setStep] = useState<NotificationStep | null>(null);
  const stepProps = (own: NotificationStep): NotificationStepSheetProps => ({
    isOpen: step === own,
    onOpenChange: isOpen => {
      if (!isOpen) {
        setStep(current => (current === own ? null : current));
      }
    },
    hasScrim,
  });

  return (
    <>
      <Button
        label="Set up notifications"
        onClick={() => setStep('overview')}
      />
      <NotificationOverviewSheet
        {...stepProps('overview')}
        height={height}
        onCancel={() => setStep(null)}
        onContinue={() => setStep('frequency')}
      />
      <NotificationFrequencySheet
        {...stepProps('frequency')}
        height={height}
        onBack={() => setStep('overview')}
        onContinue={() => setStep('channels')}
      />
      <NotificationChannelsSheet
        {...stepProps('channels')}
        height={height}
        onBack={() => setStep('frequency')}
        onFinish={() => setStep(null)}
      />
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
  render: () => <MultiStepReplaceExample height="hug" />,
  play: openFlow,
};

export const Capped: Story = {
  render: () => <MultiStepReplaceExample height="capped" />,
  play: openFlow,
};

export const NoScrim: Story = {
  name: 'No scrim',
  render: () => <MultiStepReplaceExample height="hug" hasScrim={false} />,
  play: openFlow,
};

export const NarrowViewport: Story = {
  name: 'Narrow viewport',
  parameters: {viewport: {defaultViewport: 'mobile1'}},
  render: () => <MultiStepReplaceExample height="hug" />,
  play: openFlow,
};

// ---------------------------------------------------------------------------
// Non-modal sheet over a live page: toasts, tooltips and popovers stay above
// ---------------------------------------------------------------------------

function NonModalOverPage() {
  const [step, setStep] = useState<'one' | 'two' | null>(null);
  const toast = useToast();
  const raise = (where: string) =>
    toast({body: `Toast from the ${where}`, isAutoHide: false});
  const stepProps = (id: 'one' | 'two') => ({
    isOpen: step === id,
    onOpenChange: (isOpen: boolean) => {
      if (!isOpen) {
        setStep(current => (current === id ? null : current));
      }
    },
    hasScrim: false as const,
  });
  return (
    <VStack gap={3}>
      <Heading level={2}>Non-modal sheet over a live page</Heading>
      <Text type="supporting" color="secondary">
        The page stays interactive under a no-scrim sheet. A toast raised from
        the page or from the sheet paints above the sheet; a tooltip or popover
        opened from the sheet paints above it too.
      </Text>
      <HStack gap={2}>
        <Button label="Open sheet" onClick={() => setStep('one')} />
        <Button
          label="Toast from page"
          variant="secondary"
          onClick={() => raise('page')}
        />
      </HStack>
      <BottomSheet {...stepProps('one')} label="Step one" height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Step one</Heading>
            <HStack gap={2}>
              <Button
                label="Toast from sheet"
                variant="secondary"
                onClick={() => raise('sheet')}
              />
              <Tooltip content="A tip above the sheet">
                <Button label="Hover me" variant="secondary" />
              </Tooltip>
              <Popover
                label="Options"
                content={<Text type="body">A popover above the sheet</Text>}>
                <Button label="Options" variant="secondary" />
              </Popover>
            </HStack>
            <HStack gap={2} hAlign="end">
              <Button label="Continue" onClick={() => setStep('two')} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet {...stepProps('two')} label="Step two" height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Step two</Heading>
            <HStack gap={2} hAlign="end">
              <Button
                label="Back"
                variant="secondary"
                onClick={() => setStep('one')}
              />
              <Button label="Done" onClick={() => setStep(null)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </VStack>
  );
}

export const NonModalOverLivePage: Story = {
  name: 'Non-modal over a live page',
  render: () => <NonModalOverPage />,
};

// ---------------------------------------------------------------------------
// Several sheets changing in one update: not a replace
// ---------------------------------------------------------------------------

/**
 * A list sheet opens a detail sheet; "Finish" in the detail closes both and
 * opens a confirmation in the same update. Two closes and one open is not a
 * step flow's handoff: the two sheets pop with their own motion and the
 * confirmation is a fresh push, whichever order the sheets are written in.
 * The sheets here are written confirmation first, so a registry that paired
 * on the first two flips it heard would wrongly replace the detail.
 */
function FinishToConfirmation() {
  const [isListOpen, setIsListOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDoneOpen, setIsDoneOpen] = useState(false);
  return (
    <>
      <Button label="Open list" onClick={() => setIsListOpen(true)} />
      <BottomSheet
        isOpen={isDoneOpen}
        onOpenChange={setIsDoneOpen}
        label="Saved"
        height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Saved</Heading>
            <Text>The list and the detail closed together; this is new.</Text>
            <HStack gap={2} hAlign="end">
              <Button label="Close" onClick={() => setIsDoneOpen(false)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        label="Detail"
        height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Detail</Heading>
            <HStack gap={2} hAlign="end">
              <Button
                label="Back"
                variant="secondary"
                onClick={() => setIsDetailOpen(false)}
              />
              <Button
                label="Finish"
                onClick={() => {
                  setIsListOpen(false);
                  setIsDetailOpen(false);
                  setIsDoneOpen(true);
                }}
              />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={isListOpen}
        onOpenChange={setIsListOpen}
        label="List"
        height="capped">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>List</Heading>
            <Button label="Open detail" onClick={() => setIsDetailOpen(true)} />
          </VStack>
        </Section>
      </BottomSheet>
    </>
  );
}

/**
 * A modal two-step flow whose steps can raise a toast. A reversal (Back
 * pressed during the Continue handoff) re-shows the first step's dialog; the
 * toast raised from it afterwards must still land in it and stay pressable.
 */
function ModalFlowWithToasts() {
  const [step, setStep] = useState<'one' | 'two' | null>(null);
  const toast = useToast();
  const close = (own: 'one' | 'two') => (isOpen: boolean) => {
    if (!isOpen) {
      setStep(current => (current === own ? null : current));
    }
  };
  return (
    <>
      <Button label="Open flow" onClick={() => setStep('one')} />
      <BottomSheet
        isOpen={step === 'one'}
        onOpenChange={close('one')}
        label="Step one"
        height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Step one</Heading>
            <HStack gap={2} hAlign="end">
              <Button
                label="Toast from step one"
                variant="secondary"
                onClick={() =>
                  toast({body: 'Toast from step one', isAutoHide: false})
                }
              />
              <Button label="Continue" onClick={() => setStep('two')} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={step === 'two'}
        onOpenChange={close('two')}
        label="Step two"
        height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Step two</Heading>
            <HStack gap={2} hAlign="end">
              <Button
                label="Back"
                variant="secondary"
                onClick={() => setStep('one')}
              />
              <Button label="Done" onClick={() => setStep(null)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </>
  );
}

export const ModalFlowToasts: Story = {
  name: 'Modal flow with toasts (reversal keeps the outlet)',
  render: () => <ModalFlowWithToasts />,
};

/**
 * A two-step flow whose second step carries an autofocused field. Entering
 * by a replace focuses that field (AR4); a lone open would focus the panel.
 */
function AutofocusReplaceFlow({hasScrim}: {hasScrim: boolean}) {
  const [step, setStep] = useState<'one' | 'two' | null>(null);
  const [name, setName] = useState('');
  const close = (own: 'one' | 'two') => (isOpen: boolean) => {
    if (!isOpen) {
      setStep(current => (current === own ? null : current));
    }
  };
  return (
    <>
      <Button label="Open flow" onClick={() => setStep('one')} />
      <BottomSheet
        isOpen={step === 'one'}
        onOpenChange={close('one')}
        label="Step one"
        hasScrim={hasScrim}
        height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Step one</Heading>
            <HStack gap={2} hAlign="end">
              <Button label="Continue" onClick={() => setStep('two')} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={step === 'two'}
        onOpenChange={close('two')}
        label="Step two"
        hasScrim={hasScrim}
        height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Your name</Heading>
            <TextInput
              label="Name"
              value={name}
              onChange={setName}
              hasAutoFocus
            />
            <HStack gap={2} hAlign="end">
              <Button label="Done" onClick={() => setStep(null)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </>
  );
}

export const AutofocusReplace: Story = {
  name: 'Replace entry focuses the autofocus field',
  render: () => <AutofocusReplaceFlow hasScrim />,
};

export const AutofocusReplaceNoScrim: Story = {
  name: 'Replace entry focuses the autofocus field (no scrim)',
  render: () => <AutofocusReplaceFlow hasScrim={false} />,
};

/**
 * A three-step flow whose middle step is an interstitial advanced by code:
 * Submit opens Processing by press; Processing moves on to Done 300 ms later
 * on its own. Both moves are handoffs, and closing Done returns focus to the
 * control that opened the flow.
 */
function InterstitialFlow() {
  const [step, setStep] = useState<'form' | 'processing' | 'done' | null>(null);
  useEffect(() => {
    if (step !== 'processing') {
      return;
    }
    const id = setTimeout(() => setStep('done'), 300);
    return () => clearTimeout(id);
  }, [step]);
  const close = (own: 'form' | 'processing' | 'done') => (isOpen: boolean) => {
    if (!isOpen) {
      setStep(current => (current === own ? null : current));
    }
  };
  return (
    <>
      <Button label="Open form" onClick={() => setStep('form')} />
      <BottomSheet
        isOpen={step === 'form'}
        onOpenChange={close('form')}
        label="Form"
        height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Form</Heading>
            <HStack gap={2} hAlign="end">
              <Button label="Submit" onClick={() => setStep('processing')} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={step === 'processing'}
        onOpenChange={close('processing')}
        label="Processing"
        height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Processing…</Heading>
            <Text>Saving your changes.</Text>
          </VStack>
        </Section>
      </BottomSheet>
      <BottomSheet
        isOpen={step === 'done'}
        onOpenChange={close('done')}
        label="Done"
        height="hug">
        <Section padding={4}>
          <VStack gap={3}>
            <Heading level={3}>Done</Heading>
            <HStack gap={2} hAlign="end">
              <Button label="Close" onClick={() => setStep(null)} />
            </HStack>
          </VStack>
        </Section>
      </BottomSheet>
    </>
  );
}

export const Interstitial: Story = {
  name: 'Interstitial step advanced by code',
  render: () => <InterstitialFlow />,
};

export const FinishClosesTwo: Story = {
  name: 'Finish closes two sheets and opens one',
  render: () => <FinishToConfirmation />,
};
