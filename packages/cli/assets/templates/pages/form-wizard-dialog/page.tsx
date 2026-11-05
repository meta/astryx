// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * A three-step wizard inside a Dialog: scheduling a recurring report without
 * leaving the page that lists them.
 *
 * A modal wizard is the right call when the flow is short, its result belongs
 * to the page behind it, and losing the page's context would cost more than the
 * modal's constraints. Scheduling a report from a list of reports is exactly
 * that: three steps, and the answer to "do I already have one like this?" is
 * the table the modal is covering.
 *
 * The constraints are real, though, and they set the ceiling on this pattern:
 *
 * - **Fixed height, no page scroll.** The dialog scrolls its own body against
 *   `maxHeight`, so a step that outgrows roughly 60% of a laptop screen starts
 *   hiding its own fields. Three short steps is the budget.
 * - **`density="compact"` on the stepper**, and no step descriptions. There is
 *   no room for them, and the title above already names the flow.
 * - **`purpose="form"`** so a stray backdrop click cannot discard a
 *   half-finished flow. The Escape key and the close button remain, because a
 *   modal with no exit is worse than one with an easy exit.
 *
 * When a flow outgrows any of these, promote it to a page — the same step
 * content moves into `form-wizard` with almost no change.
 *
 * ## Making this a real modal
 *
 * This page renders the dialog with `isInline`, which draws the same content
 * without the `<dialog>` element, the backdrop, or the modal behaviour. That is
 * a preview accommodation, not the pattern: a real modal is promoted to the
 * browser's top layer, where no ancestor `transform` or `overflow: hidden` can
 * clip it, so an open one inside a scaled gallery tile paints over the whole
 * gallery rather than inside its tile. The docsite's own template preview is
 * itself a Dialog, and Astryx forbids nesting dialogs.
 *
 * Everything else here is the composition you want. To make it a modal: drop
 * `isInline`, drive `isOpen` from state, and update `handleOpenChange` to set
 * that state after it resets a closing draft. Keep that handler on both the
 * Dialog and DialogHeader — replacing it with the raw setter would silently
 * preserve an abandoned draft. Put the flow behind a trigger on the page it
 * belongs to — for this one, a "Schedule a report" button above the table of
 * reports it adds to. Never mount that page with the dialog already open; a
 * page that greets you with a modal you did not ask for is a page you have to
 * dismiss before you can read it.
 *
 * ## Extending this template
 *
 * **Never open a dialog from this dialog.** Nested focus traps and two
 * overlapping dismiss paths are not progressive disclosure. Detail that needs
 * more room goes in a Collapsible inside the step, or the flow becomes a page.
 *
 * **Reset state on close, deliberately.** A `false` open-change request resets
 * the draft, and successful scheduling uses the same reset path, so the next
 * run starts clean rather than resuming a flow the user abandoned or already
 * finished. If resuming is what you want, say so with a "Continue where you
 * left off" affordance — silent resumption reads as a bug.
 *
 * **Stepper stays non-interactive here.** `onStepClick` is deliberately absent:
 * in a space this tight the stepper is a position indicator, and the two footer
 * buttons are the whole navigation model. Adding click-to-jump gives three ways
 * to move through three steps.
 */

import {useId, useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Center} from '@astryxdesign/core/Center';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import type {ISODateString} from '@astryxdesign/core/Calendar';
import {DateInput} from '@astryxdesign/core/DateInput';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Divider} from '@astryxdesign/core/Divider';
import {Field} from '@astryxdesign/core/Field';
import {FieldStatus} from '@astryxdesign/core/FieldStatus';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
} from '@astryxdesign/core/Layout';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {MultiSelector} from '@astryxdesign/core/MultiSelector';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Stack';
import {Step, Stepper} from '@astryxdesign/core/Stepper';
import {Switch} from '@astryxdesign/core/Switch';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import type {ISOTimeString} from '@astryxdesign/core/TimeInput';
import {TimeInput} from '@astryxdesign/core/TimeInput';
import {useToast} from '@astryxdesign/core/Toast';

// ── Data ──────────────────────────────────────────────────────────────────────

const STEPS = ['Report', 'Schedule', 'Delivery'];

const DATASETS = [
  {value: 'pipeline', label: 'Sales pipeline'},
  {value: 'revenue', label: 'Revenue and bookings'},
  {value: 'churn', label: 'Churn and retention'},
  {value: 'support', label: 'Support tickets'},
  {value: 'usage', label: 'Product usage'},
];

const SECTIONS = [
  {
    value: 'summary',
    label: 'Executive summary',
    description: 'Headline numbers and week-over-week change.',
  },
  {
    value: 'charts',
    label: 'Trend charts',
    description: 'Twelve-week series for each headline metric.',
  },
  {
    value: 'breakdown',
    label: 'Segment breakdown',
    description: 'Split by region, plan, and account size.',
  },
  {
    value: 'anomalies',
    label: 'Anomaly callouts',
    description: 'Metrics more than two standard deviations off trend.',
  },
];

const RECIPIENTS = [
  {value: 'exec', label: 'exec-staff@northwind.dev'},
  {value: 'sales', label: 'Sales leadership (9 people)'},
  {value: 'finance', label: 'finance@northwind.dev'},
  {value: 'amara', label: 'Amara Diallo'},
  {value: 'felix', label: 'Felix Tran'},
];

const TIMEZONES = [
  {value: 'pt', label: 'Pacific Time (PT)'},
  {value: 'et', label: 'Eastern Time (ET)'},
  {value: 'gmt', label: 'Greenwich Mean Time (GMT)'},
  {value: 'cet', label: 'Central European Time (CET)'},
];

const WEEKDAYS = [
  {value: 'mon', label: 'Monday'},
  {value: 'tue', label: 'Tuesday'},
  {value: 'wed', label: 'Wednesday'},
  {value: 'thu', label: 'Thursday'},
  {value: 'fri', label: 'Friday'},
];

// ── Helpers ───────────────────────────────────────────────────────────────────

// The footer summarises rather than quoting a field's message, so a blocked
// step never shows the same sentence in two places.

const blockedMessage = (count: number) =>
  count === 1
    ? 'One problem above needs fixing first.'
    : `${count} problems above need fixing first.`;

export default function FormWizardDialogPage() {
  const showToast = useToast();

  // The cadence control is a radiogroup, so its Field needs both: `inputID`
  // because Field requires one, and `labelID` because that is the id the group
  // points back at to take the visible label as its name.
  const cadenceInputID = useId();
  const cadenceLabelID = useId();

  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState<ReadonlySet<number>>(new Set());

  const [name, setName] = useState('');
  const [dataset, setDataset] = useState('pipeline');
  const [sections, setSections] = useState<string[]>(['summary', 'charts']);
  const [note, setNote] = useState('');

  const [cadence, setCadence] = useState('weekly');
  const [weekday, setWeekday] = useState('mon');
  const [time, setTime] = useState<ISOTimeString | undefined>(
    '08:00' as ISOTimeString,
  );
  const [timezone, setTimezone] = useState('pt');
  const [startDate, setStartDate] = useState<ISODateString | undefined>();

  const [recipients, setRecipients] = useState<string[]>(['exec']);
  const [format, setFormat] = useState('pdf');
  const [skipEmpty, setSkipEmpty] = useState(true);

  const resetDraft = () => {
    setStep(0);
    setAttempted(new Set());
    setName('');
    setDataset('pipeline');
    setSections(['summary', 'charts']);
    setNote('');
    setCadence('weekly');
    setWeekday('mon');
    setTime('08:00' as ISOTimeString);
    setTimezone('pt');
    setStartDate(undefined);
    setRecipients(['exec']);
    setFormat('pdf');
    setSkipEmpty(true);
  };

  // The inline preview cannot actually disappear, but it still exercises the
  // same close request a real modal receives from Escape or its close button.
  // When promoted to a modal, update this handler to set the owning `isOpen`
  // state after the reset rather than replacing it with the raw setter.
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetDraft();
    }
  };

  const errorsByStep: Array<Record<string, string>> = [
    {
      ...(name.trim() ? {} : {name: 'Give the report a name.'}),
      ...(sections.length === 0
        ? {sections: 'Include at least one section.'}
        : {}),
    },
    {
      ...(time ? {} : {time: 'Pick a send time.'}),
      ...(startDate ? {} : {startDate: 'Pick a start date.'}),
    },
    {
      ...(recipients.length === 0
        ? {recipients: 'Add at least one recipient.'}
        : {}),
    },
  ];

  const shownErrors = (index: number) =>
    attempted.has(index) ? errorsByStep[index] : {};
  const currentErrors = shownErrors(step);
  const isLastStep = step === STEPS.length - 1;

  const cadenceSummary =
    cadence === 'daily'
      ? `Every weekday at ${time ?? '—'}`
      : cadence === 'weekly'
        ? `${WEEKDAYS.find(d => d.value === weekday)?.label ?? weekday}s at ${time ?? '—'}`
        : `1st of the month at ${time ?? '—'}`;

  const goNext = () => {
    setAttempted(prev => new Set(prev).add(step));
    if (Object.keys(errorsByStep[step]).length !== 0) {
      return;
    }
    if (!isLastStep) {
      setStep(s => s + 1);
      return;
    }
    // A modal would close here, and closing is most of the confirmation: the
    // list behind it gains a row. With nothing to close, the toast carries
    // that news on its own, and the draft resets so the next run starts clean
    // rather than resuming a flow that already finished.
    showToast({
      body: `${name.trim()} is scheduled · ${cadenceSummary}`,
      uniqueID: 'report-scheduled',
    });
    resetDraft();
  };

  return (
    // Center is the page root, so the dialog stands in the middle of the space
    // its backdrop would have covered.
    <Center height="100dvh">
      <Dialog
        isOpen
        // See the module header: inline so this page can be a gallery tile and
        // a docs preview. Drop it, and drive isOpen from the trigger page, to
        // make this a modal.
        isInline
        onOpenChange={handleOpenChange}
        width={620}
        // form: a stray backdrop click cannot throw away a part-finished
        // flow. Escape and the close button still work.
        purpose="form">
        <Layout
          // fill, not auto: the shell is already bounded by the dialog's
          // maxHeight, and an auto Layout sizes to its content and lets the
          // overflow be clipped by the dialog rather than scrolled — on the
          // longest step that quietly cut the footer buttons off.
          height="fill"
          // The dialog is its own shell with its own inset owner, tighter
          // than the page behind it — a modal has less width to spend. It
          // is still declared once, so the title, the stepper, the fields
          // and the two footer buttons share a line.
          padding={4}
          defaultHasDividers
          header={
            // Two header rows, both pinned: the title, then the stepper.
            // The dialog body scrolls against maxHeight, so a stepper
            // placed in the body would slide out of view on the longest
            // step — the one where knowing your position matters most.
            // Neither row draws a rule, so the two read as one header
            // block rather than a stack of bars in a 620px-wide dialog.
            <>
              <DialogHeader
                title="Schedule a report"
                onOpenChange={handleOpenChange}
                hasDivider={false}
              />
              <LayoutHeader hasDivider={false}>
                {/* Compact, no descriptions, no click-to-jump: at this
                        width the stepper is a position indicator, and the two
                        footer buttons are the whole navigation model. */}
                <Stepper
                  activeStep={step}
                  orientation="horizontal"
                  density="compact"
                  label="Report setup progress">
                  {STEPS.map((label, i) => (
                    <Step
                      key={label}
                      step={i}
                      label={label}
                      status={
                        Object.keys(shownErrors(i)).length > 0
                          ? 'error'
                          : undefined
                      }
                    />
                  ))}
                </Stepper>
              </LayoutHeader>
            </>
          }
          content={
            <LayoutContent>
              <VStack gap={5}>
                {step === 0 && (
                  // One optionality convention across all three steps:
                  // unmarked means optional, so only the fields that
                  // block the next button carry an indicator. In a dialog
                  // this matters more than on a page — there is no room
                  // for a legend explaining what the badges mean.
                  <FormLayout defaultOptionality="optional">
                    <TextInput
                      label="Report name"
                      isRequired
                      value={name}
                      onChange={setName}
                      placeholder="Weekly pipeline review"
                      description="Used as the email subject line."
                      status={
                        currentErrors.name
                          ? {type: 'error', message: currentErrors.name}
                          : undefined
                      }
                    />
                    <Selector
                      label="Dataset"
                      options={DATASETS}
                      value={dataset}
                      onChange={setDataset}
                    />
                    <CheckboxList
                      label="Sections to include"
                      value={sections}
                      onChange={setSections}
                      density="compact"
                      status={
                        currentErrors.sections
                          ? {type: 'error', message: currentErrors.sections}
                          : undefined
                      }>
                      {SECTIONS.map(section => (
                        <CheckboxListItem
                          key={section.value}
                          value={section.value}
                          label={section.label}
                          description={section.description}
                        />
                      ))}
                    </CheckboxList>
                  </FormLayout>
                )}

                {step === 1 && (
                  <FormLayout defaultOptionality="optional">
                    {/* SegmentedControl's own label never renders — it is
                        the aria-label. Field gives it a visible one that
                        starts on the same line as the fields below.

                        A radiogroup is named by `labelID` + `aria-labelledby`,
                        not by `htmlFor`: `isGroupLabel` renders the label as a
                        span, and a span has no control to point at. That makes
                        the group's name the label the user can actually see,
                        rather than a second string that happens to match. */}
                    <Field
                      label="How often"
                      inputID={cadenceInputID}
                      labelID={cadenceLabelID}
                      isGroupLabel>
                      <SegmentedControl
                        label="How often"
                        aria-labelledby={cadenceLabelID}
                        value={cadence}
                        onChange={setCadence}
                        layout="fill">
                        <SegmentedControlItem value="daily" label="Weekdays" />
                        <SegmentedControlItem value="weekly" label="Weekly" />
                        <SegmentedControlItem value="monthly" label="Monthly" />
                      </SegmentedControl>
                    </Field>
                    {cadence === 'weekly' && (
                      <Selector
                        label="Day of the week"
                        options={WEEKDAYS}
                        value={weekday}
                        onChange={setWeekday}
                      />
                    )}
                    {/* Always horizontal: a dialog sets its own width, so
                            unlike the full-page wizards this pair has no
                            narrow case to fall back from. */}
                    <FormLayout
                      direction="horizontal"
                      defaultOptionality="optional">
                      <TimeInput
                        label="Send at"
                        isRequired
                        value={time}
                        onChange={setTime}
                        status={
                          currentErrors.time
                            ? {type: 'error', message: currentErrors.time}
                            : undefined
                        }
                      />
                      <Selector
                        label="Time zone"
                        options={TIMEZONES}
                        value={timezone}
                        onChange={setTimezone}
                      />
                    </FormLayout>
                    <DateInput
                      label="First run"
                      isRequired
                      value={startDate}
                      onChange={setStartDate}
                      status={
                        currentErrors.startDate
                          ? {
                              type: 'error',
                              message: currentErrors.startDate,
                            }
                          : undefined
                      }
                    />
                    <Banner
                      status="info"
                      title={cadenceSummary}
                      description="Data is cut at the send time, so a report at 08:00 covers everything up to 08:00."
                    />
                  </FormLayout>
                )}

                {step === 2 && (
                  <FormLayout defaultOptionality="optional">
                    <MultiSelector
                      label="Recipients"
                      isRequired
                      options={RECIPIENTS}
                      value={recipients}
                      onChange={setRecipients}
                      hasSearch
                      triggerDisplay="badges"
                      description="Groups resolve at send time, so new members are included automatically."
                      status={
                        currentErrors.recipients
                          ? {
                              type: 'error',
                              message: currentErrors.recipients,
                            }
                          : undefined
                      }
                    />
                    <RadioList
                      label="Attachment format"
                      value={format}
                      onChange={setFormat}
                      size="sm">
                      <RadioListItem
                        value="pdf"
                        label="PDF"
                        description="Best for reading. Charts render as images."
                      />
                      <RadioListItem
                        value="csv"
                        label="CSV"
                        description="Raw rows, no charts or summary."
                      />
                      <RadioListItem
                        value="both"
                        label="Both"
                        description="PDF in the body, CSV attached."
                      />
                    </RadioList>
                    <Switch
                      label="Skip the send when there is no new data"
                      value={skipEmpty}
                      onChange={setSkipEmpty}
                      labelPosition="start"
                      labelSpacing="spread"
                    />
                    <TextArea
                      label="Note in the email"
                      rows={2}
                      maxLength={200}
                      value={note}
                      onChange={setNote}
                      placeholder="Numbers are provisional until finance closes the month."
                    />
                    <Divider />
                    <MetadataList columns="single">
                      <MetadataListItem label="Report">
                        {name.trim() || 'Untitled'}
                      </MetadataListItem>
                      <MetadataListItem label="Runs">
                        {cadenceSummary}{' '}
                        {TIMEZONES.find(t => t.value === timezone)?.label.match(
                          /\(([^)]+)\)/,
                        )?.[1] ?? ''}
                      </MetadataListItem>
                      <MetadataListItem label="Sent to">
                        {recipients.length === 0
                          ? '—'
                          : `${recipients.length} ${
                              recipients.length === 1
                                ? 'recipient'
                                : 'recipients'
                            }`}
                      </MetadataListItem>
                    </MetadataList>
                  </FormLayout>
                )}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} vAlign="center">
                <Button
                  label="Back"
                  variant="secondary"
                  isDisabled={step === 0}
                  onClick={() => setStep(s => Math.max(0, s - 1))}
                />
                {/* Empty spacer, and the message hugs its text beside
                        the button it explains. Inside the fill it would
                        stretch across a footer this narrow can't spare. */}
                <StackItem size="fill" />
                {Object.keys(currentErrors).length > 0 && (
                  <FieldStatus
                    type="error"
                    variant="detached"
                    message={blockedMessage(Object.keys(currentErrors).length)}
                  />
                )}
                <Button
                  label={isLastStep ? 'Schedule report' : 'Continue'}
                  variant="primary"
                  onClick={goNext}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </Center>
  );
}
