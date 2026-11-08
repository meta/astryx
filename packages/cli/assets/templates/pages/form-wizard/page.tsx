// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * A create-workspace flow: four steps, a horizontal Stepper, per-step
 * validation, and a review step that summarises every answer before anything
 * is written.
 *
 * The horizontal orientation is the right default when a wizard owns the whole
 * page and the steps are short nouns. It reads as a progress bar with names,
 * costs one row of vertical space, and leaves the full content column for the
 * form. Reach for the vertical orientation instead when step labels need
 * descriptions to be understood, or when the wizard shares its width with
 * something else.
 *
 * Three pieces of state drive the whole flow: `step` (which panel is showing),
 * the field values, and `attempted` (which steps the user has tried to leave).
 * Validation is a pure function of the field values, so the same `errors`
 * object gates the Next button, colors the Stepper, and fills the review
 * step's issue list — there is no second copy of the rules to drift.
 *
 * ## Extending this template
 *
 * **Validate on leave, not on keystroke.** `attempted` exists so a field that
 * has never been filled in is not already red. A step joins the set when the
 * user presses Next on it, which is the first moment they have asserted it is
 * done. Everything downstream reads `attempted`, so a new field inherits the
 * behavior by being added to `validate` — do not add a per-field touched flag.
 *
 * **Let people move backward freely.** `onStepClick` is passed unconditionally,
 * so every step is reachable at any time. A wizard that locks you out of step 1
 * because step 3 is invalid turns a typo into a restart. Forward movement is
 * still gated by the footer button; the stepper is an escape hatch, not the
 * primary path.
 *
 * **`status` is color, not progress.** A Step derives completed/current/upcoming
 * from its index against `activeStep`; `status="error"` only tints it. That is
 * why a step can read as completed and still show an error — which is exactly
 * what you want when someone skips ahead and leaves something broken behind.
 *
 * **Keep the review step derived.** Every row in the summary reads the same
 * state the inputs write. Never copy answers into a separate summary object on
 * Next: the copy is what goes stale when someone jumps back and edits.
 *
 * **One panel, one step.** The content region swaps its contents rather than
 * stacking every step in a scrolling page. If a step grows past roughly a
 * screen, that is the signal it is two steps, not the signal to scroll harder.
 *
 * **The step is not in a Card.** The pinned header and footer already fence
 * this region; a card inside them is a second border and, worse, a second
 * inset — its padding would push every field off the line the title and the
 * stepper sit on. Cards go around things inside a step (the cost estimate
 * below), never around the step itself.
 */

import {useId, useMemo, useRef, useState, type CSSProperties} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {Divider} from '@astryxdesign/core/Divider';
import {Field} from '@astryxdesign/core/Field';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Grid} from '@astryxdesign/core/Grid';
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
} from '@astryxdesign/core/Layout';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Selector} from '@astryxdesign/core/Selector';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Stack';
import {Step, Stepper} from '@astryxdesign/core/Stepper';
import {Switch} from '@astryxdesign/core/Switch';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useMediaQuery} from '@astryxdesign/core/hooks';

// ── Data ──────────────────────────────────────────────────────────────────────

// `isOptional` is read twice — by the Stepper to mark the step and by the
// footer to decide whether Skip exists — so it lives on the step rather than
// as an index check in two places that could disagree.
const STEPS = [
  {label: 'Workspace'},
  {label: 'Team', isOptional: true},
  {label: 'Plan'},
  {label: 'Review'},
];

const REGIONS = [
  {value: 'us-east', label: 'US East (N. Virginia)'},
  {value: 'us-west', label: 'US West (Oregon)'},
  {value: 'eu-central', label: 'EU Central (Frankfurt)'},
  {value: 'ap-southeast', label: 'Asia Pacific (Singapore)'},
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
};

const PLANS = [
  {
    id: 'starter',
    label: 'Starter',
    pricePerSeat: 0,
    seatLimit: 5,
    description: 'Up to 5 members, 3 projects, community support.',
  },
  {
    id: 'growth',
    label: 'Growth',
    pricePerSeat: 24,
    seatLimit: 250,
    description: 'Unlimited projects, integrations, and standard support.',
  },
  {
    id: 'scale',
    label: 'Scale',
    pricePerSeat: 48,
    seatLimit: 2000,
    description: 'Advanced controls, a 99.9% SLA, and a dedicated CSM.',
  },
];

const ADDONS = [
  {
    id: 'sso',
    label: 'SSO / SAML',
    price: 3,
    description: 'Single sign-on through Okta, Entra ID, or Google.',
  },
  {
    id: 'audit',
    label: 'Audit log export',
    price: 2,
    description: 'Stream workspace audit events to your SIEM.',
  },
  {
    id: 'support',
    label: 'Priority support',
    price: 6,
    description: 'Four-hour response target, 24/5.',
  },
];

// Reserved slugs the backend would reject; checked client-side so the user
// finds out while typing rather than after pressing Create.
const TAKEN_SLUGS = ['admin', 'app', 'api', 'northwind', 'support'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// ── Styles ────────────────────────────────────────────────────────────────────
// Plain inline styles over Astryx token CSS variables, so the template compiles
// in a project with no StyleX pipeline.

// The footer's two end zones divide the leftover space equally rather than
// sizing to their own contents, which is what keeps the step counter on the
// page's centre line. Without the zero basis the counter drifts by half the
// difference between the zones — most visibly on the last step, where the
// primary button's label grows from "Next" to "Create workspace".
const footerZone: CSSProperties = {flexBasis: 0};

// ── Helpers ───────────────────────────────────────────────────────────────────

const money = (n: number) => (n === 0 ? '$0' : `$${n.toLocaleString()}`);

/** Split a textarea of addresses on newlines and commas, dropping blanks. */
function parseEmails(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map(line => line.trim())
    .filter(Boolean);
}

export default function FormWizardPage() {
  const isNarrow = useMediaQuery('(max-width: 640px)');

  // Field wraps controls that have no label of their own; it needs an id to
  // point its label at. useId, not a hand-written string, so two of these
  // templates on one page cannot collide.
  const planID = useId();

  // Focus targets for every field `validate` can complain about, keyed by the
  // same names it uses. Pressing Next on a blocked step sends focus to the
  // first of these that has a problem, which scrolls it into view and lets the
  // field's own error announce itself — so the footer needs no summary line,
  // and there is no second copy of the message to keep in sync.
  const fieldRefs = {
    name: useRef<HTMLInputElement>(null),
    slug: useRef<HTMLInputElement>(null),
    invites: useRef<HTMLTextAreaElement>(null),
    seats: useRef<HTMLInputElement>(null),
    terms: useRef<HTMLInputElement>(null),
  };

  const [step, setStep] = useState(0);
  // Steps the user has tried to advance past. Errors stay silent until a step
  // is in this set, so an untouched field is never pre-flagged red.
  const [attempted, setAttempted] = useState<ReadonlySet<number>>(new Set());

  // Step 1 — workspace
  const [name, setName] = useState('Northwind Robotics');
  const [slug, setSlug] = useState('northwind-robotics');
  const [region, setRegion] = useState('us-east');
  const [visibility, setVisibility] = useState('invite');

  // Step 2 — team
  const [invites, setInvites] = useState(
    'amara.diallo@northwind.dev\nfelix.tran@northwind.dev\nrosa.marchetti@northwind.dev',
  );
  const [role, setRole] = useState('member');
  const [sendNow, setSendNow] = useState(true);
  const [inviteNote, setInviteNote] = useState('');

  // Step 3 — plan
  const [planId, setPlanId] = useState('growth');
  const [seats, setSeats] = useState(8);
  const [addons, setAddons] = useState<string[]>(['audit']);
  const [digest, setDigest] = useState(true);

  // Step 4 — review
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const emails = useMemo(() => parseEmails(invites), [invites]);
  const invalidEmails = useMemo(
    () => emails.filter(email => !EMAIL_PATTERN.test(email)),
    [emails],
  );
  const plan = PLANS.find(p => p.id === planId) ?? PLANS[0];
  const addonCostPerSeat = ADDONS.filter(a => addons.includes(a.id)).reduce(
    (sum, a) => sum + a.price,
    0,
  );
  const monthlyTotal = (plan.pricePerSeat + addonCostPerSeat) * seats;

  // One rule set, read by the Next button, the Stepper tint, and the review
  // step's issue list. Keyed by step index so a step's validity is a lookup.
  const errorsByStep = useMemo<Array<Record<string, string>>>(() => {
    const workspace: Record<string, string> = {};
    if (!name.trim()) {
      workspace.name = 'Enter a name for the workspace.';
    }
    if (!slug.trim()) {
      workspace.slug = 'Enter a URL for the workspace.';
    } else if (!SLUG_PATTERN.test(slug)) {
      workspace.slug =
        'Use lowercase letters, numbers, and hyphens, starting and ending with a letter or number.';
    } else if (TAKEN_SLUGS.includes(slug)) {
      workspace.slug = `terrace.app/${slug} is already taken.`;
    }

    const team: Record<string, string> = {};
    if (invalidEmails.length > 0) {
      team.invites = `Not a valid email address: ${invalidEmails.join(', ')}`;
    }

    const planStep: Record<string, string> = {};
    if (seats < 1) {
      planStep.seats = 'A workspace needs at least one seat.';
    } else if (seats > plan.seatLimit) {
      planStep.seats = `${plan.label} tops out at ${plan.seatLimit} seats. Choose a larger plan or reduce the seat count.`;
    } else if (seats < emails.length + 1) {
      planStep.seats = `You are inviting ${emails.length} ${
        emails.length === 1 ? 'person' : 'people'
      } plus yourself, so you need at least ${emails.length + 1} seats.`;
    }

    const review: Record<string, string> = {};
    if (!acceptedTerms) {
      review.terms = 'Accept the terms to create the workspace.';
    }

    return [workspace, team, planStep, review];
  }, [
    name,
    slug,
    invalidEmails,
    seats,
    plan.seatLimit,
    plan.label,
    emails.length,
    acceptedTerms,
  ]);

  /** Errors to render for a step: only once the user has tried to leave it. */
  const shownErrors = (index: number) =>
    attempted.has(index) ? errorsByStep[index] : {};

  const currentErrors = shownErrors(step);
  const isLastStep = step === STEPS.length - 1;

  // Steps before the current one that the user has already tried and left
  // broken — surfaced on the review step so nothing hides behind a panel.
  const outstanding = STEPS.map((s, i) => ({
    ...s,
    index: i,
    issues: Object.values(shownErrors(i)),
  })).filter(s => s.index !== step && s.issues.length > 0);

  const markAttempted = (index: number) =>
    setAttempted(prev => new Set(prev).add(index));

  const goNext = () => {
    markAttempted(step);

    // `validate` records each step's problems in the order the fields appear,
    // so the first key is the first thing on the page that needs attention.
    // Sending focus there is the whole response to a blocked Next: it scrolls
    // the field into view, and the error the field is already showing becomes
    // its accessible description, so a screen reader hears exactly which field
    // and why rather than a count of how many.
    const [firstProblem] = Object.keys(errorsByStep[step]);
    if (firstProblem) {
      fieldRefs[firstProblem as keyof typeof fieldRefs]?.current?.focus();
      return;
    }

    if (!isLastStep) {
      setStep(s => s + 1);
    }
  };

  // Skip is not Next with a different label. Next asserts the step is done and
  // validates it; Skip declines the step outright, so it clears what the step
  // collects and moves on without validating. Clearing is the point: a
  // half-filled optional step that rides along invisibly is the bug this
  // button exists to prevent, and a malformed address left behind by someone
  // who chose not to invite anyone would never be shown again.
  const goSkip = () => {
    setInvites('');
    setInviteNote('');
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  };

  const goTo = (index: number) => {
    // Leaving a step forward is an assertion that it is done; leaving it
    // backward is not, so only mark it when moving on.
    if (index > step) {
      markAttempted(step);
    }
    setStep(index);
  };

  return (
    <Layout
      height="fill"
      contentWidth={720}
      // One inset owner for the whole page. Padding set here reaches the
      // header, the body and the footer, so the title, the stepper, every
      // field label and the Back button all start on the same vertical line —
      // and changing the page's breathing room is one number, not three.
      padding={5}
      // Same idea for the fences: the footer's divider comes from one
      // declaration rather than the slot opting in. The header is the one
      // exception, so it is the one place that says so.
      defaultHasDividers
      header={
        // The stepper lives in the header, not the body. It is the one thing
        // on the page that must never scroll away: it answers "where am I and
        // how much is left" at the exact moment a long step makes you ask.
        // The header slot also inherits the Layout's contentWidth, so the
        // stepper and the fields below it share one content line.
        <LayoutHeader hasDivider={false}>
          <VStack gap={isNarrow ? 3 : 5}>
            <HStack gap={3} vAlign="center">
              <StackItem size="fill">
                <Heading level={1}>Create workspace</Heading>
              </StackItem>
              <Button label="Cancel" variant="ghost" onClick={() => {}} />
            </HStack>
            {/* Indicators sit on the track, and the steps carry a label
                only. A pinned header pays for every line it keeps, and a
                description under each step buys nothing the panel below does
                not already say in full. One stepper at every width: it
                collapses itself once the header is too narrow to label four
                steps, keeping the nodes on the rail tappable. */}
            <Stepper
              activeStep={step}
              orientation="horizontal"
              onStepClick={goTo}
              label="Create workspace progress"
              density="balanced"
              indicatorPosition="on-track">
              {STEPS.map((s, i) => (
                <Step
                  key={s.label}
                  step={i}
                  label={s.label}
                  isOptional={s.isOptional}
                  status={
                    Object.keys(shownErrors(i)).length > 0 ? 'error' : undefined
                  }
                />
              ))}
            </Stepper>
          </VStack>
        </LayoutHeader>
      }
      content={
        // No Card around the step. The pinned header and footer already fence
        // this region, so a card here would be a border inside a border — and
        // its own padding would push every field off the content line the
        // title and stepper sit on.
        <LayoutContent>
          {step === 0 && (
            <VStack gap={5}>
              <VStack gap={1}>
                <Heading level={2}>Workspace details</Heading>
                <Text type="supporting" color="secondary">
                  Name your workspace and pick where its data lives. The region
                  is permanent — moving data later means a migration.
                </Text>
              </VStack>
              {/* FormLayout, not a VStack: form fields are the one case where
                  the container owns spacing outright, and it also carries
                  `defaultOptionality` so the whole wizard marks optionality
                  one way. Everything here is optional unless it says
                  otherwise, so only the two required fields get an
                  indicator — no field wears both kinds of badge. */}
              <FormLayout defaultOptionality="optional">
                <TextInput
                  label="Workspace name"
                  ref={fieldRefs.name}
                  isRequired
                  value={name}
                  onChange={setName}
                  placeholder="Acme Inc."
                  status={
                    currentErrors.name
                      ? {type: 'error', message: currentErrors.name}
                      : undefined
                  }
                />
                <TextInput
                  label="Workspace URL"
                  ref={fieldRefs.slug}
                  isRequired
                  value={slug}
                  onChange={setSlug}
                  placeholder="acme"
                  description={`terrace.app/${slug.trim() || 'your-workspace'}`}
                  status={
                    currentErrors.slug
                      ? {type: 'error', message: currentErrors.slug}
                      : undefined
                  }
                />
                <Selector
                  label="Data region"
                  options={REGIONS}
                  value={region}
                  onChange={setRegion}
                  description="Where projects, files, and audit logs are stored at rest."
                />
                {/* A RadioList, not a SegmentedControl. These three options
                    differ in who they let through, and that only lands if
                    each one can say so next to itself — a segmented control
                    has room for a label and nothing else, so the consequence
                    has to move to a single description that rewrites itself
                    as you click, showing one option's meaning while offering
                    three. Radios give every option its own line and let all
                    three be compared before choosing, which is the decision
                    being made here. Segmented controls are for switching a
                    view, where the labels are self-evident and the choice is
                    reversible on sight. */}
                <RadioList
                  label="Who can join"
                  value={visibility}
                  onChange={setVisibility}>
                  <RadioListItem
                    value="invite"
                    label="Invite only"
                    description="People join only when an admin invites them."
                  />
                  <RadioListItem
                    value="domain"
                    label="Same domain"
                    description="Anyone with a verified @northwind.dev address can join without an invite."
                  />
                  <RadioListItem
                    value="open"
                    label="Anyone"
                    description="Anyone with the workspace link can request to join."
                  />
                </RadioList>
              </FormLayout>
            </VStack>
          )}

          {step === 1 && (
            <VStack gap={5}>
              <VStack gap={1}>
                <Heading level={2}>Invite your team</Heading>
                <Text type="supporting" color="secondary">
                  Teammates get an email when the workspace is created. You can
                  skip this and invite people later from settings.
                </Text>
              </VStack>
              {/* Nothing on this step is required, and under
                  `defaultOptionality="optional"` that is exactly what it
                  looks like: no indicators at all. Marking each field
                  "Optional" would say the same thing four times. */}
              <FormLayout defaultOptionality="optional">
                <TextArea
                  label="Email addresses"
                  ref={fieldRefs.invites}
                  rows={4}
                  value={invites}
                  onChange={setInvites}
                  placeholder={'jordan@acme.com\npriya@acme.com'}
                  description="One address per line, or separate them with commas."
                  status={
                    currentErrors.invites
                      ? {type: 'error', message: currentErrors.invites}
                      : emails.length > 0
                        ? {
                            type: 'success',
                            message: `${emails.length} ${
                              emails.length === 1 ? 'address' : 'addresses'
                            } ready to invite.`,
                          }
                        : undefined
                  }
                />
                <RadioList
                  label="Default role for invitees"
                  value={role}
                  onChange={setRole}
                  description="Each person's role can be changed individually after they join.">
                  <RadioListItem
                    value="admin"
                    label="Admin"
                    description="Manage billing, members, and workspace settings."
                  />
                  <RadioListItem
                    value="member"
                    label="Member"
                    description="Create and edit projects. No access to admin settings."
                  />
                  <RadioListItem
                    value="guest"
                    label="Guest"
                    description="View and comment on projects they are added to."
                  />
                </RadioList>
                <Divider />
                <Switch
                  label="Send invites as soon as the workspace is created"
                  description="Turn this off to create the workspace now and send invites yourself later."
                  value={sendNow}
                  onChange={setSendNow}
                  labelPosition="start"
                  labelSpacing="spread"
                />
                {sendNow && (
                  <TextArea
                    label="Add a note to the invite"
                    rows={2}
                    maxLength={280}
                    value={inviteNote}
                    onChange={setInviteNote}
                    placeholder="We're moving planning off email — join us here."
                  />
                )}
              </FormLayout>
            </VStack>
          )}

          {step === 2 && (
            <VStack gap={5}>
              <VStack gap={1}>
                <Heading level={2}>Choose a plan</Heading>
                <Text type="supporting" color="secondary">
                  Billed monthly per seat. Change plans or add capabilities at
                  any time from workspace settings.
                </Text>
              </VStack>
              <FormLayout defaultOptionality="optional">
                {/* A plan picker is the case SelectableCard is for: people
                    decide by comparing the options side by side, not by
                    reading a list of labels. Wrapped in a Field so the group
                    gets a visible label on the same line as every other
                    field's, rather than floating unlabelled above them. */}
                <Field label="Plan" inputID={planID} isGroupLabel>
                  <Grid columns={{minWidth: 200}} gap={3}>
                    {PLANS.map(p => (
                      <SelectableCard
                        key={p.id}
                        label={`${p.label} plan`}
                        isSelected={planId === p.id}
                        onChange={() => setPlanId(p.id)}
                        padding={4}>
                        <VStack gap={2}>
                          <HStack gap={2} vAlign="center" hAlign="between">
                            <Text type="label">{p.label}</Text>
                            {p.id === 'growth' && (
                              <Badge variant="success" label="Recommended" />
                            )}
                          </HStack>
                          <Text type="large" weight="bold">
                            {p.pricePerSeat === 0
                              ? 'Free'
                              : `${money(p.pricePerSeat)}/seat`}
                          </Text>
                          <Text type="supporting" color="secondary">
                            {p.description}
                          </Text>
                        </VStack>
                      </SelectableCard>
                    ))}
                  </Grid>
                </Field>
                <NumberInput
                  label="Seats"
                  ref={fieldRefs.seats}
                  value={seats}
                  onChange={setSeats}
                  min={1}
                  max={plan.seatLimit}
                  isIntegerOnly
                  description={`Includes you. ${plan.label} allows up to ${plan.seatLimit}.`}
                  status={
                    currentErrors.seats
                      ? {type: 'error', message: currentErrors.seats}
                      : undefined
                  }
                />
                <CheckboxList
                  label="Add-ons"
                  description="Billed per seat alongside the plan."
                  value={addons}
                  onChange={setAddons}>
                  {ADDONS.map(a => (
                    <CheckboxListItem
                      key={a.id}
                      value={a.id}
                      label={`${a.label} — ${money(a.price)}/seat`}
                      description={a.description}
                    />
                  ))}
                </CheckboxList>
                <Divider />
                <Switch
                  label="Weekly usage digest"
                  description="Email admins a summary of seats and activity every Monday."
                  value={digest}
                  onChange={setDigest}
                  labelPosition="start"
                  labelSpacing="spread"
                />
              </FormLayout>
              {/* Outside the FormLayout, because it is a readout and not a
                  field — putting it inside would make the form's last row
                  something you cannot fill in. A muted Card: the total is the
                  consequence of every control above it, so it wants to read as
                  its own object rather than as one more tinted band in the
                  step. `muted` keeps it quiet enough that it does not compete
                  with the plan cards for the eye. */}
              <Card variant="muted" padding={5}>
                <HStack gap={3} vAlign="center" hAlign="between">
                  <VStack gap={0.5}>
                    <Text type="label">Estimated monthly cost</Text>
                    <Text type="supporting" color="secondary">
                      {seats} {seats === 1 ? 'seat' : 'seats'} ×{' '}
                      {money(plan.pricePerSeat + addonCostPerSeat)}
                      {addonCostPerSeat > 0
                        ? ` (${money(plan.pricePerSeat)} plan + ${money(addonCostPerSeat)} add-ons)`
                        : ''}
                    </Text>
                  </VStack>
                  <Text type="display-3">{money(monthlyTotal)}</Text>
                </HStack>
              </Card>
            </VStack>
          )}

          {step === 3 && (
            <VStack gap={5}>
              <VStack gap={1}>
                <Heading level={2}>Review and create</Heading>
                <Text type="supporting" color="secondary">
                  Nothing is saved until you create the workspace. Use the steps
                  above to go back and edit.
                </Text>
              </VStack>

              {outstanding.length > 0 && (
                <Banner
                  status="error"
                  title={`${outstanding.length} ${
                    outstanding.length === 1 ? 'step needs' : 'steps need'
                  } attention`}
                  // Banner collapses children by default. An error summary
                  // is the one case where that is wrong: what is broken has
                  // to be readable without a second click.
                  collapsible={false}>
                  <VStack gap={2}>
                    {outstanding.map(s => (
                      <VStack key={s.label} gap={1}>
                        <Text type="supporting">
                          <Text type="inherit" weight="bold">
                            {s.label}
                          </Text>
                          : {s.issues.join(' ')}
                        </Text>
                      </VStack>
                    ))}
                    <HStack gap={2}>
                      <Button
                        label={`Go to ${outstanding[0].label}`}
                        variant="secondary"
                        size="sm"
                        onClick={() => setStep(outstanding[0].index)}
                      />
                    </HStack>
                  </VStack>
                </Banner>
              )}

              {/* One column, label beside value. A review step is read top to
                  bottom against the steps that produced it, and a two-column
                  grid breaks that into a reading order nobody follows — it
                  also strands the long values (a URL, a sentence about who can
                  join) in half the width they need. */}
              <MetadataList orientation="vertical">
                <MetadataListItem label="Workspace name">
                  {name.trim() || '—'}
                </MetadataListItem>
                <MetadataListItem label="Workspace URL">
                  terrace.app/{slug.trim() || '—'}
                </MetadataListItem>
                <MetadataListItem label="Data region">
                  {REGIONS.find(r => r.value === region)?.label ?? region}
                </MetadataListItem>
                <MetadataListItem label="Who can join">
                  {visibility === 'invite'
                    ? 'Invite only'
                    : visibility === 'domain'
                      ? 'Anyone at northwind.dev'
                      : 'Anyone with the link'}
                </MetadataListItem>
                <MetadataListItem label="Invitations">
                  {emails.length === 0
                    ? 'None'
                    : `${emails.length} ${
                        emails.length === 1 ? 'person' : 'people'
                      } as ${ROLE_LABELS[role]}${sendNow ? '' : ', sent later'}`}
                </MetadataListItem>
                <MetadataListItem label="Plan">
                  {plan.pricePerSeat === 0
                    ? `${plan.label} (Free)`
                    : `${plan.label} · ${money(plan.pricePerSeat)}/seat`}
                </MetadataListItem>
                <MetadataListItem label="Add-ons">
                  {addons.length === 0
                    ? 'None'
                    : ADDONS.filter(a => addons.includes(a.id))
                        .map(a => a.label)
                        .join(', ')}
                </MetadataListItem>
                <MetadataListItem label="Estimated monthly cost">
                  {money(monthlyTotal)} · {seats}{' '}
                  {seats === 1 ? 'seat' : 'seats'}
                </MetadataListItem>
              </MetadataList>

              <Divider />

              <CheckboxInput
                label="I agree to the Terms of Service and the Data Processing Addendum"
                ref={fieldRefs.terms}
                value={acceptedTerms}
                onChange={setAcceptedTerms}
                status={
                  currentErrors.terms
                    ? {type: 'error', message: currentErrors.terms}
                    : undefined
                }
              />
            </VStack>
          )}
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <HStack gap={3} vAlign="center">
            {/* Skip belongs at the far end from the button it competes with.
                Sitting next to Next it reads as a second way forward and
                collects mis-clicks; alone on the opposite edge it reads as
                what it is — the exit from a step you were never required to
                fill in. The zone stays mounted on steps that cannot be
                skipped so the counter does not jump when it appears. */}
            <StackItem size="fill" style={footerZone}>
              {STEPS[step].isOptional && (
                <Button label="Skip" variant="ghost" onClick={goSkip} />
              )}
            </StackItem>
            {/* Just the position, at every moment. A blocked step used to put
                a summary here, which was a second copy of a message the field
                was already showing and told you a count rather than which
                field. Now Next moves focus to the offending field instead, so
                the answer arrives where the fix has to happen. */}
            <Text type="supporting" color="secondary">
              {step + 1} of {STEPS.length}
            </Text>
            <StackItem size="fill" style={footerZone}>
              <HStack gap={3} hAlign="end">
                <Button
                  label="Back"
                  variant="secondary"
                  isDisabled={step === 0}
                  onClick={() => setStep(s => Math.max(0, s - 1))}
                />
                <Button
                  label={isLastStep ? 'Create workspace' : 'Next'}
                  variant="primary"
                  // Never disabled: pressing it is how a step reveals what is
                  // wrong. A dead button with no explanation is a dead end.
                  onClick={goNext}
                />
              </HStack>
            </StackItem>
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
