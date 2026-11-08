// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * A publishing flow with a vertical Stepper in a persistent side rail: five
 * steps, each named and explained, with the form for the current step filling
 * the content column beside it.
 *
 * The vertical orientation earns its keep when step labels are not
 * self-explanatory. "Payouts and agreements" needs a sentence to distinguish it
 * from "Distribution"; a horizontal stepper has no room for that sentence, so
 * it either truncates or drops it. Here the rail is the flow's table of
 * contents — visible the whole time, so someone five steps deep can still see
 * what is left without leaving the step they are on.
 *
 * The rail lives in the Layout's `start` slot, so it scrolls independently of
 * the form and stays put while a long step scrolls. Actions sit in the Layout
 * `footer`, which spans the full width beneath both columns: they are the
 * flow's controls rather than the form's, and pinning them means Continue is
 * reachable without scrolling to the bottom of a long step.
 *
 * ## Extending this template
 *
 * **The rail is a summary, not a menu.** Step descriptions say what the step is
 * for, in one sentence, in the user's terms. If a description needs two
 * sentences the step is doing two things. Resist adding per-step badges or
 * counts — the rail competes with the form for attention as it is.
 *
 * **Match the step count to the rail.** Five steps with descriptions is about
 * the ceiling for a rail that stays readable without scrolling on a laptop.
 * Past seven, the pattern to reach for is grouped sections with their own
 * sub-flow, not a longer rail.
 *
 * **The panels drop in order of what the form can least afford to lose.**
 * Guidance goes first — it is supplementary, and each tip restates a field's
 * own description. The rail goes second, and it is not dropped but rotated:
 * below its breakpoint the same steps render horizontally in the header, where
 * they stay put while the form scrolls. Do not shrink the rail in place
 * instead; a vertical stepper squeezed to 120px truncates exactly the
 * descriptions that justified choosing it.
 *
 * **Completed steps keep their status.** A step that was filled in and later
 * broken by an edit elsewhere shows `status="error"` while still reading as
 * completed, because progress and status are separate axes. That combination
 * is the point: it is how the rail reports a problem the user has scrolled past.
 *
 * **Uploads belong to a field, not a step.** The cover art sits in a FileInput
 * with its own constraints and status, inside a card that previews the current
 * value. Adding a second asset means a second field, not a second step.
 */

import {useId, useMemo, useRef, useState, type CSSProperties} from 'react';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import type {ISODateString} from '@astryxdesign/core/Calendar';
import {DateInput} from '@astryxdesign/core/DateInput';
import {Divider} from '@astryxdesign/core/Divider';
import {Field} from '@astryxdesign/core/Field';
import {FieldStatus} from '@astryxdesign/core/FieldStatus';
import {FileInput} from '@astryxdesign/core/FileInput';
import {FormLayout} from '@astryxdesign/core/FormLayout';
import {Icon} from '@astryxdesign/core/Icon';
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutPanel,
} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {MetadataList, MetadataListItem} from '@astryxdesign/core/MetadataList';
import {MultiSelector} from '@astryxdesign/core/MultiSelector';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Selector} from '@astryxdesign/core/Selector';
import {HStack, StackItem, VStack} from '@astryxdesign/core/Stack';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Step, Stepper} from '@astryxdesign/core/Stepper';
import {Switch} from '@astryxdesign/core/Switch';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  BookOpenIcon,
  BuildingLibraryIcon,
  CalendarIcon,
  CheckBadgeIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  LanguageIcon,
  RectangleStackIcon,
  TagIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

// ── Data ──────────────────────────────────────────────────────────────────────

// `help` is what the side panel falls back to when no field holds focus, so it
// describes the step as a whole rather than repeating any one field's hint.
// Bullets rather than prose: the panel is glanced at sideways while the user is
// typing somewhere else, so each line has to survive being read on its own.
const STEPS = [
  {
    label: 'Author profile',
    description: 'Create the profile readers see on your books.',
    help: [
      'Shared across every book you publish.',
      'Edits here reach titles already on sale.',
      'Readers see this before they see the book.',
    ],
  },
  {
    label: 'Book details',
    description: 'Add the metadata that helps readers discover the book.',
    help: [
      'Everything here feeds search and the store page.',
      'The cover and title are judged first.',
      'All of it stays editable after publishing.',
    ],
  },
  {
    label: 'Distribution',
    description: 'Choose where, when, and at what price the book goes on sale.',
    help: [
      'Territory and price take effect at release.',
      'Moving a date earlier needs a fresh review.',
      'Pre-orders open once the book clears review.',
    ],
  },
  {
    label: 'Payouts and agreements',
    description: 'Link a payout account and accept the publishing terms.',
    help: [
      'Royalties accrue from the release date.',
      'They pay out only once an account is linked.',
      'Linking late delays the money, never loses it.',
    ],
  },
  {
    label: 'Finalize and submit',
    description: 'Confirm the audio is ready and send the book for review.',
    help: [
      'Nothing is final until you submit.',
      'Metadata stays editable during review.',
      'Replacing the audio restarts the queue.',
    ],
  },
];

// Help for the field that currently holds focus, keyed to match `fieldRefs` so
// the panel and the validator name the same things. These say what the field
// affects downstream — the field's own description already says what to type,
// and repeating it here would waste the panel.
//
// The cover and the two MultiSelectors are missing on purpose: neither can
// report its own focus today. MultiSelector forwards no ref and drops DOM
// props, and FileInput puts both on its hidden file input rather than the
// button that actually takes focus. Those fields fall back to the step
// summary, which is at least true, rather than leaving a neighbour's text up.
const FIELD_HELP: Record<string, string[]> = {
  authorName: [
    'Shown on the book page and in search results.',
    'Use the name readers already know you by.',
  ],
  penName: [
    'Replaces your display name everywhere readers look.',
    'Your legal name stays on the payout account.',
  ],
  bio: [
    'The first sentence shows in search before readers expand it.',
    'Lead with what you write, not where you studied.',
  ],
  title: [
    'Matched against reader searches exactly as typed.',
    'Leave series and volume out — they have their own fields.',
  ],
  subtitle: [
    'Optional, and set in smaller type beneath the title.',
    'Good for a hook, poor for a second title.',
  ],
  edition: [
    'Only needed if an earlier edition is already in the store.',
    'Editions are listed together rather than competing.',
  ],
  language: [
    'The language of the audio, not of this form.',
    'Decides which regional stores list the book.',
  ],
  series: [
    'Books sharing a name are grouped and recommended in order.',
    'The name has to match earlier books exactly.',
  ],
  blurb: [
    'Readers see the first two lines before a "more" link.',
    'The hook has to land early.',
  ],
  seriesNumber: [
    'Sets the reading order within the series.',
    'Readers of an earlier book are offered the next number.',
  ],
  releaseDate: [
    'Review takes up to five business days, so leave room.',
    'Pre-orders open as soon as the book clears review.',
  ],
  price: [
    'Set before local tax and store adjustments.',
    'Some territories will show a slightly different number.',
  ],
  stripe: [
    'Payouts run monthly, about 60 days after the month of sale.',
    'You can link the account after submitting.',
  ],
  confirm: [
    'Confirming locks the audio for review.',
    'Metadata stays editable; new audio restarts the queue.',
  ],
};

const LANGUAGES = [
  {value: 'en', label: 'English'},
  {value: 'es', label: 'Spanish'},
  {value: 'fr', label: 'French'},
  {value: 'de', label: 'German'},
  {value: 'pt', label: 'Portuguese'},
  {value: 'ja', label: 'Japanese'},
];

const CATEGORIES = [
  {value: 'mystery', label: 'Mystery & Thriller'},
  {value: 'literary', label: 'Literary Fiction'},
  {value: 'scifi', label: 'Science Fiction'},
  {value: 'romance', label: 'Romance'},
  {value: 'history', label: 'History'},
  {value: 'biography', label: 'Biography & Memoir'},
  {value: 'business', label: 'Business'},
  {value: 'selfhelp', label: 'Self-help'},
];

const TERRITORIES = [
  {value: 'us', label: 'United States'},
  {value: 'ca', label: 'Canada'},
  {value: 'uk', label: 'United Kingdom'},
  {value: 'eu', label: 'European Union'},
  {value: 'au', label: 'Australia & New Zealand'},
  {value: 'jp', label: 'Japan'},
];

const CURRENCIES = [
  {value: 'usd', label: 'USD — US Dollar'},
  {value: 'eur', label: 'EUR — Euro'},
  {value: 'gbp', label: 'GBP — British Pound'},
];

const AGREEMENTS = [
  {
    value: 'distribution',
    label: 'Distribution Agreement',
    description:
      'Grants non-exclusive rights to distribute in the territories you selected.',
  },
  {
    value: 'content',
    label: 'Content Policy',
    description:
      'Confirms the recording is yours to publish and meets the content guidelines.',
  },
  {
    value: 'tax',
    label: 'Tax certification (W-9 / W-8BEN)',
    description: 'Required before the first payout can be released.',
  },
];

// Cover art from the committed template-assets set; the CLI swaps it for an
// inline placeholder when the template is scaffolded into a project.
const COVER_SRC = '/template-assets/illustrative-vertical-1.png';

const CHAPTERS = [
  {title: 'Prologue — The Last Train', duration: '11:04'},
  {title: '1. What Margot Knew', duration: '38:22'},
  {title: '2. The Second Letter', duration: '41:15'},
  {title: '3. Aldergate', duration: '35:48'},
  {title: '4. A Very Ordinary Tuesday', duration: '44:03'},
  {title: 'Epilogue', duration: '09:37'},
];

const TOTAL_RUNTIME = '3 h 20 m';
const MIN_DESCRIPTION = 120;
const MAX_CATEGORIES = 3;

// ── Styles ────────────────────────────────────────────────────────────────────
// Plain inline styles over Astryx token CSS variables, so the template compiles
// in a project with no StyleX pipeline.

// The cover row's geometry, declared once because both columns are measured
// against it: the thumbnail sets the row's height and the dropzone has to be
// told to match.
const COVER_WIDTH = 140;
const COVER_HEIGHT = COVER_WIDTH * 1.5; // the 2:3 portrait below
const CONTROL_ROW = 28; // one row of size="sm" buttons
const COLUMN_GAP = 12; // the column's gap={3}

// The dropzone column next to the thumbnail. flexBasis:0 lets it shrink below
// its intrinsic width instead of pushing the row wider than the form measure.
// StackItem already resets min-width, so that half of the job is done for us.
const coverColumn: CSSProperties = {flexBasis: 0};
// Fills what the buttons beneath it leave, so the column ends level with the
// cover. A definite height rather than `height: 100%` or a flex-grow, because
// Field sizes its control to content: there is no resolved height above the
// dropzone for either to measure against, and both silently no-op.
const dropzoneFill: CSSProperties = {
  height: COVER_HEIGHT - CONTROL_ROW - COLUMN_GAP,
};
// The form and the footer buttons share one measure, each centred by its own
// Center, so the buttons sit under the fields they submit. Both side panels are
// the same width, so centring on the page centres inside the content column
// too — which lets the header and footer dividers run the full width of the
// page while their contents still line up with the fields.
const MEASURE = 640;
const PANEL_WIDTH = 300;
const LAYOUT_INSET = 16; // the Layout's padding={4}, which every slot applies
// The footer spans the page, but its buttons belong under the fields they
// submit. With both panels up — or both down — the content column is already
// centred on the page and nothing is needed. The middle tier is the odd one:
// the rail is up without the guidance panel, so the column sits to the right of
// centre and the footer has to lean the same way to stay under it. The lean is
// a rail short of its own width because the footer adds the layout inset back
// on its own, while the rail's box already contains it.
const footerLean: CSSProperties = {
  marginInlineStart: PANEL_WIDTH - LAYOUT_INSET,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const usd = (n: number) => `$${n.toFixed(2)}`;

export default function FormWizardVerticalPage() {
  // The rail needs ~280px plus a readable form beside it. Below that it costs
  // more than it explains, so the header takes over as the progress indicator.
  // Three tiers, and the panels go in order of what the form can least afford
  // to lose. Guidance is the first to go: it is genuinely supplementary, and
  // every tip in it repeats a field's own description. The rail goes second,
  // because losing it costs the user their place in the flow — so it is not
  // dropped, it changes orientation and moves into the header, where it stays
  // put while the form scrolls.
  //
  // The widths are the columns added up rather than device sizes: 300 + 640 +
  // 300 plus the shell's insets is a little over 1300, and one panel plus the
  // form is a little over 1000.
  const hasGuidance = useMediaQuery('(min-width: 1320px)');
  const hasRail = useMediaQuery('(min-width: 1000px)');
  // Both panels gone. Everything reading this is about the single-column form,
  // not about the guidance panel, which is why it tracks the rail.
  const isNarrow = !hasRail;

  // Field needs an id to aim its label at, for the two controls that have no
  // visible label of their own.
  const coverID = useId();
  const salesModelID = useId();

  // Opens on the second step, with the first already attempted and passing:
  // a long flow is easier to read mid-stride, where the rail shows a done
  // step, the current one, and what is still ahead.
  const [step, setStep] = useState(1);
  const [attempted, setAttempted] = useState<ReadonlySet<number>>(
    () => new Set([0]),
  );

  // Step 1 — author profile
  const [authorName, setAuthorName] = useState('Imogen Hale');
  const [penName, setPenName] = useState('');
  const [bio, setBio] = useState(
    'Imogen Hale writes quiet thrillers about people who notice too much. She lives in Bristol with a badly behaved lurcher.',
  );
  const [authorSite, setAuthorSite] = useState('imogenhale.co.uk');

  // Step 2 — book details
  const [title, setTitle] = useState('Words She Never Said');
  const [subtitle, setSubtitle] = useState('');
  const [edition, setEdition] = useState('');
  const [series, setSeries] = useState('The Aldergate Files');
  const [seriesNumber, setSeriesNumber] = useState<number>(2);
  // The draft already has cover art, so the step models "replace or remove"
  // rather than "upload". `hasCover` is what the required rule reads; the
  // FileInput only carries a *replacement*.
  const [hasCover, setHasCover] = useState(true);
  const [coverFile, setCoverFile] = useState<File | File[] | null>(null);
  const [blurb, setBlurb] = useState(
    'When a retired stenographer starts receiving transcripts of conversations she never had, the only person who believes her is the detective who put her husband away.',
  );
  const [language, setLanguage] = useState('en');
  const [categories, setCategories] = useState<string[]>([
    'mystery',
    'literary',
  ]);

  // Step 3 — distribution
  const [scope, setScope] = useState('worldwide');
  const [territories, setTerritories] = useState<string[]>(['us', 'uk', 'eu']);
  const [releaseDate, setReleaseDate] = useState<ISODateString | undefined>(
    '2026-10-06',
  );
  const [price, setPrice] = useState(18.99);
  const [salesModel, setSalesModel] = useState('both');
  const [isExplicit, setIsExplicit] = useState(false);
  const [allowsLending, setAllowsLending] = useState(true);

  // Step 4 — payouts and agreements
  const [isStripeLinked, setIsStripeLinked] = useState(false);
  const [currency, setCurrency] = useState('usd');
  const [accepted, setAccepted] = useState<string[]>([]);

  // Step 5 — finalize
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Validation is one pure derivation from the field values. The Continue
  // button, the rail's error tint, and the submit summary all read this, so the
  // rules exist in exactly one place.
  const errorsByStep = useMemo<Array<Record<string, string>>>(() => {
    const profile: Record<string, string> = {};
    if (!authorName.trim()) {
      profile.authorName = 'Enter the name readers should see.';
    }
    if (bio.trim().length < 40) {
      profile.bio = 'Write at least a sentence or two — 40 characters minimum.';
    }

    const details: Record<string, string> = {};
    if (!title.trim()) {
      details.title = 'Enter the title as it should appear in the store.';
    }
    if (!hasCover && coverFile == null) {
      details.cover = 'A book cannot go on sale without cover art.';
    }
    if (blurb.trim().length < MIN_DESCRIPTION) {
      details.blurb = `Descriptions need at least ${MIN_DESCRIPTION} characters. ${
        MIN_DESCRIPTION - blurb.trim().length
      } to go.`;
    }
    if (categories.length === 0) {
      details.categories = 'Pick at least one category.';
    } else if (categories.length > MAX_CATEGORIES) {
      details.categories = `Pick at most ${MAX_CATEGORIES} categories.`;
    }
    if (series.trim() && seriesNumber < 1) {
      details.seriesNumber = 'Books in a series are numbered from 1.';
    }

    const distribution: Record<string, string> = {};
    if (scope === 'selected' && territories.length === 0) {
      distribution.territories = 'Choose at least one territory.';
    }
    if (!releaseDate) {
      distribution.releaseDate = 'Pick a release date.';
    }
    if (price < 0.99 || price > 99) {
      distribution.price = 'List price must be between $0.99 and $99.00.';
    }

    const payouts: Record<string, string> = {};
    if (!isStripeLinked) {
      payouts.stripe = 'Link a Stripe account to receive payouts.';
    }
    const missing = AGREEMENTS.filter(a => !accepted.includes(a.value));
    if (missing.length > 0) {
      payouts.agreements = `Accept the ${missing
        .map(a => a.label)
        .join(', ')} to continue.`;
    }

    const finalize: Record<string, string> = {};
    if (!isConfirmed) {
      finalize.confirm = 'Confirm the audio is final before submitting.';
    }

    return [profile, details, distribution, payouts, finalize];
  }, [
    authorName,
    bio,
    title,
    hasCover,
    coverFile,
    blurb,
    categories,
    series,
    seriesNumber,
    scope,
    territories,
    releaseDate,
    price,
    isStripeLinked,
    accepted,
    isConfirmed,
  ]);

  // One registry of fields, doing two jobs: a blocked Continue focuses the
  // first entry it can, and the side panel matches focus back to a help key.
  // Names match `errorsByStep` and `FIELD_HELP` so the three stay aligned.
  // MultiSelector and CheckboxList expose no focus handle, so `categories`,
  // `territories` and `agreements` are absent here — a blocked Continue falls
  // through to the next problem rather than stalling, and those two selectors
  // report their own focus to the panel directly. All three ship populated, so
  // reaching them as an error means emptying a filled field.
  const fieldRefs = {
    authorName: useRef<HTMLInputElement>(null),
    penName: useRef<HTMLInputElement>(null),
    bio: useRef<HTMLTextAreaElement>(null),
    title: useRef<HTMLInputElement>(null),
    subtitle: useRef<HTMLInputElement>(null),
    edition: useRef<HTMLInputElement>(null),
    series: useRef<HTMLInputElement>(null),
    cover: useRef<HTMLInputElement>(null),
    blurb: useRef<HTMLTextAreaElement>(null),
    seriesNumber: useRef<HTMLInputElement>(null),
    releaseDate: useRef<HTMLInputElement>(null),
    price: useRef<HTMLInputElement>(null),
    stripe: useRef<HTMLButtonElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };

  // Which field the side panel is currently explaining. Null falls back to the
  // step's own summary.
  const [helpKey, setHelpKey] = useState<string | null>(null);

  // One capture handler on the form column, rather than an onFocus on every
  // control: focus events bubble, so this sees each field as it is reached and
  // matches it against the refs the wizard already keeps for validation. That
  // leaves one registry of fields instead of two drifting apart.
  // Landing on something with no help of its own clears back to the step
  // summary rather than leaving the previous field's text up. Holding it would
  // let the panel claim to describe a field the user has already tabbed past —
  // the cover's Crop and Remove buttons sit right after the cover input, so
  // that goes wrong immediately.
  const onFormFocus = (e: React.FocusEvent<HTMLElement>) => {
    const hit = (Object.keys(fieldRefs) as Array<keyof typeof fieldRefs>).find(
      key => fieldRefs[key].current === e.target,
    );
    setHelpKey(hit && FIELD_HELP[hit] ? hit : null);
  };

  // Clear only when focus leaves the column entirely. Clearing on every blur
  // would flash the panel back to the step summary between each pair of
  // fields, because blur lands before the next field's focus.
  const onFormBlur = (e: React.FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setHelpKey(null);
    }
  };

  const shownErrors = (index: number) =>
    attempted.has(index) ? errorsByStep[index] : {};
  const currentErrors = shownErrors(step);
  const isLastStep = step === STEPS.length - 1;

  const markAttempted = (index: number) =>
    setAttempted(prev => new Set(prev).add(index));

  const goNext = () => {
    markAttempted(step);

    // `errorsByStep` records each step's problems in the order the fields
    // appear, so the first entry with a focus handle is the first thing on the
    // page to fix. Focusing it scrolls it into view and makes the error the
    // field is already rendering its accessible description, so the answer to
    // a blocked Continue arrives where the fix has to happen — which is why
    // the footer carries no summary of its own.
    const target = Object.keys(errorsByStep[step])
      .map(key => fieldRefs[key as keyof typeof fieldRefs]?.current)
      .find(Boolean);
    if (target) {
      target.focus();
      return;
    }

    if (Object.keys(errorsByStep[step]).length === 0 && !isLastStep) {
      setStep(s => s + 1);
    }
  };

  const goTo = (index: number) => {
    if (index > step) {
      markAttempted(step);
    }
    setStep(index);
  };

  // Shared by both orientations. Descriptions are the one difference: the rail
  // has a 300px column to spend on them, while a horizontal row of five would
  // have to wrap or truncate them into uselessness.
  const stepNodes = (hasDescriptions: boolean) =>
    STEPS.map((s, i) => {
      const hasError = Object.keys(shownErrors(i)).length > 0;
      return (
        <Step
          key={s.label}
          step={i}
          label={s.label}
          description={hasDescriptions ? s.description : undefined}
          status={hasError ? 'error' : undefined}
          // Numbered throughout rather than 'auto', so a completed step keeps
          // the number the rail is read and referred to by instead of trading
          // it for a check. An errored step is the exception: `status` only
          // tints, so keeping the number there would leave colour as the only
          // thing marking the problem.
          indicator={
            hasError ? (
              <Icon icon={ExclamationTriangleIcon} size="sm" />
            ) : (
              'number'
            )
          }
        />
      );
    });

  const rail = (
    <Stepper
      activeStep={step}
      orientation="vertical"
      onStepClick={goTo}
      label="Publishing progress">
      {stepNodes(true)}
    </Stepper>
  );

  // Takes the rail's place in the header once the panel is gone. It sits in the
  // header rather than above the fields so it stays visible while the form
  // scrolls — the rail it replaces never scrolled away either.
  const headerStepper = (
    <Stepper
      activeStep={step}
      orientation="horizontal"
      onStepClick={goTo}
      label="Publishing progress">
      {stepNodes(false)}
    </Stepper>
  );

  // The panel is its own layout cell and the form scrolls inside its own, so
  // the guidance stays put while a long step scrolls past it without needing to
  // be stuck there.
  //
  // Deliberately not a live region. The panel changes on every focus move, and
  // announcing it each time would talk over the field's own label and
  // description on every tab stop. It is a labelled landmark instead, so a
  // screen reader user can reach it on demand rather than having it read at
  // them — which is also why the text below says what a field affects rather
  // than repeating the hint already attached to the field.
  const helpPanel = (
    <VStack gap={3}>
      {/* Sized down to a label, but kept at level 2 for the outline: the panel
          sits beside the step, not under it. */}
      <Heading level={5} accessibilityLevel={2}>
        Helpful tips
      </Heading>
      <List listStyle="disc" density="compact">
        {((helpKey && FIELD_HELP[helpKey]) || STEPS[step].help).map(tip => (
          // The label is a node rather than a string on purpose: Item
          // single-line ellipsizes string labels, and a tip that ends in "…"
          // helps nobody.
          <ListItem
            key={tip}
            label={
              <Text type="body" color="secondary">
                {tip}
              </Text>
            }
          />
        ))}
      </List>
    </VStack>
  );

  return (
    <Layout
      height="fill"
      // Every slot draws its own inset from this one value, and each keeps the
      // padding on an inner wrapper — so the header and footer dividers stay
      // full-bleed while their contents line up with the rail and the form.
      //
      // 4, not 5, because `padding` only drives the outer edges: the seams
      // between slots (a header's underside, a footer's top) read
      // `--layout-padding-inner-y`, which has no prop and defaults to
      // spacing-4. Matching it is what keeps each bar even top and bottom.
      padding={4}
      header={
        <LayoutHeader hasDivider>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center">
              <StackItem size="fill">
                {/* The flow, not the book. The book's own title is a field on
                    step 2 and is echoed back on the review step, so repeating
                    it here would leave the bar renaming itself as the user
                    types. */}
                <Text type="label">Publish audiobook</Text>
              </StackItem>
              <Button label="Cancel" variant="ghost" onClick={() => {}} />
              <Button
                label="Save & exit"
                variant="secondary"
                onClick={() => {}}
              />
            </HStack>
            {!hasRail && headerStepper}
          </VStack>
        </LayoutHeader>
      }
      start={
        hasRail ? (
          <LayoutPanel width={PANEL_WIDTH}>{rail}</LayoutPanel>
        ) : undefined
      }
      end={
        !hasGuidance ? undefined : (
          <LayoutPanel
            width={PANEL_WIDTH}
            // complementary, not just a label: the role is what makes this a
            // landmark a screen reader can jump to, which is the whole reason
            // the panel does not announce itself on every focus move.
            role="complementary"
            label="Field guidance">
            {helpPanel}
          </LayoutPanel>
        )
      }
      content={
        <LayoutContent>
          <Center axis="horizontal">
            <VStack
              gap={6}
              width="100%"
              maxWidth={MEASURE}
              onFocusCapture={onFormFocus}
              onBlurCapture={onFormBlur}>
              <VStack gap={1}>
                <Heading level={1}>{STEPS[step].label}</Heading>
                <Text type="body" color="secondary">
                  {STEPS[step].description}
                </Text>
                <Text type="supporting" color="secondary">
                  Fields marked required must be filled before you can continue.
                </Text>
              </VStack>

              {step === 0 && (
                // Every step is a FormLayout under the same
                // `defaultOptionality`, which is what makes the note above
                // ("fields marked required…") true. Mark some fields Required
                // and others Optional and a reader has to work out what an
                // unmarked field means; here, unmarked means optional, on
                // all five steps.
                <FormLayout defaultOptionality="optional">
                  <TextInput
                    ref={fieldRefs.authorName}
                    label="Display name"
                    isRequired
                    value={authorName}
                    onChange={setAuthorName}
                    description="The name shown on the book page and in search results."
                    status={
                      currentErrors.authorName
                        ? {type: 'error', message: currentErrors.authorName}
                        : undefined
                    }
                  />
                  <TextInput
                    ref={fieldRefs.penName}
                    label="Pen name"
                    value={penName}
                    onChange={setPenName}
                    placeholder="Used instead of your display name on this book"
                  />
                  <TextArea
                    ref={fieldRefs.bio}
                    label="Author bio"
                    isRequired
                    rows={4}
                    maxLength={600}
                    value={bio}
                    onChange={setBio}
                    description="Shown on your author page. Two or three sentences is plenty."
                    status={
                      currentErrors.bio
                        ? {type: 'error', message: currentErrors.bio}
                        : undefined
                    }
                  />
                  <TextInput
                    label="Website"
                    value={authorSite}
                    onChange={setAuthorSite}
                    placeholder="example.com"
                  />
                </FormLayout>
              )}

              {step === 1 && (
                <FormLayout defaultOptionality="optional">
                  <TextInput
                    ref={fieldRefs.title}
                    label="Book title"
                    isRequired
                    value={title}
                    onChange={setTitle}
                    description="Enter the title exactly as it should appear in the store."
                    status={
                      currentErrors.title
                        ? {type: 'error', message: currentErrors.title}
                        : undefined
                    }
                  />

                  {/* The preview sits beside the input rather than replacing
                      it, so the current cover and the control that changes it
                      are never in different places.

                      One Field around the pair, rather than a Card around it:
                      the label, description and error then start on the same
                      line as every other field on the step, instead of being
                      pushed right by the thumbnail's width and boxed off in a
                      panel no other field has.

                      The draft ships with art, so the required rule reads
                      `hasCover`, not the FileInput. Validating the input alone
                      would demand a fresh upload from someone whose cover is
                      right there on screen. Removing it is what makes the rule
                      bite. */}
                  <Field
                    label="Cover image"
                    inputID={coverID}
                    // A group label, because the Field wraps a thumbnail, a
                    // dropzone and three buttons rather than one control —
                    // there is nothing for a `for` to point at. The dropzone
                    // keeps its own hidden label for screen readers.
                    isGroupLabel
                    isRequired
                    description="1200 × 1800 px or larger, JPG or PNG, under 5 MB."
                    statusVariant="detached"
                    status={
                      currentErrors.cover
                        ? {type: 'error', message: currentErrors.cover}
                        : undefined
                    }>
                    <HStack gap={4} vAlign="start" wrap="wrap">
                      {hasCover && (
                        <Card width={COVER_WIDTH} padding={0}>
                          <AspectRatio ratio={2 / 3} fit="cover">
                            <img
                              src={COVER_SRC}
                              alt={`Current cover art for ${title.trim() || 'this book'}`}
                            />
                          </AspectRatio>
                        </Card>
                      )}
                      <StackItem size="fill" style={coverColumn}>
                        <VStack gap={3}>
                          <FileInput
                            ref={fieldRefs.cover}
                            label="Cover image"
                            isLabelHidden
                            controlStyle={hasCover ? dropzoneFill : undefined}
                            mode="dropzone"
                            accept="image/png,image/jpeg"
                            maxSize={5 * 1024 * 1024}
                            value={coverFile}
                            onChange={file => {
                              setCoverFile(file);
                              if (file != null) {
                                setHasCover(true);
                              }
                            }}
                            placeholder={
                              hasCover
                                ? 'Drop a new cover, or click to browse'
                                : 'Drop a cover here, or click to browse'
                            }
                          />
                          <HStack gap={2} wrap="wrap">
                            <Button
                              label="Crop image"
                              variant="secondary"
                              size="sm"
                              isDisabled={!hasCover}
                              onClick={() => {}}
                            />
                            <Button
                              label="Preview on device"
                              variant="ghost"
                              size="sm"
                              isDisabled={!hasCover}
                              onClick={() => {}}
                            />
                            {hasCover && (
                              <Button
                                label="Remove cover"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setHasCover(false);
                                  setCoverFile(null);
                                }}
                              />
                            )}
                          </HStack>
                        </VStack>
                      </StackItem>
                    </HStack>
                  </Field>

                  <TextInput
                    ref={fieldRefs.subtitle}
                    label="Subtitle"
                    value={subtitle}
                    onChange={setSubtitle}
                    description="A short line that complements the title."
                  />
                  {/* A horizontal FormLayout, not a Grid: these are paired
                      fields, and nesting is the shape the form system already
                      has for them. `defaultOptionality` is repeated because a
                      nested FormLayout shadows the outer one rather than
                      inheriting from it. */}
                  <FormLayout
                    direction={isNarrow ? 'vertical' : 'horizontal'}
                    defaultOptionality="optional">
                    <TextInput
                      ref={fieldRefs.edition}
                      label="Edition"
                      value={edition}
                      onChange={setEdition}
                      placeholder="Second edition"
                    />
                    <Selector
                      // No ref to match on, so it reports itself.
                      onFocusCapture={() => setHelpKey('language')}
                      label="Language"
                      options={LANGUAGES}
                      value={language}
                      onChange={setLanguage}
                    />
                  </FormLayout>
                  {/* Both cells carry a description, so the two inputs share a
                      baseline. A description on one side of a pair and not the
                      other leaves the controls visibly staggered. */}
                  <FormLayout
                    direction={isNarrow ? 'vertical' : 'horizontal'}
                    defaultOptionality="optional">
                    <TextInput
                      ref={fieldRefs.series}
                      label="Series"
                      value={series}
                      onChange={setSeries}
                      description="We create the series if it does not exist yet."
                    />
                    <NumberInput
                      ref={fieldRefs.seriesNumber}
                      label="Number in series"
                      value={seriesNumber}
                      onChange={setSeriesNumber}
                      min={1}
                      max={99}
                      isIntegerOnly
                      isDisabled={!series.trim()}
                      description="Where this book falls in the reading order."
                      disabledMessage="Name a series first."
                      status={
                        currentErrors.seriesNumber
                          ? {
                              type: 'error',
                              message: currentErrors.seriesNumber,
                            }
                          : undefined
                      }
                    />
                  </FormLayout>
                  <TextArea
                    ref={fieldRefs.blurb}
                    label="Description"
                    isRequired
                    rows={5}
                    maxLength={2000}
                    value={blurb}
                    onChange={setBlurb}
                    description="The blurb readers see. Lead with the hook, not the genre."
                    status={
                      currentErrors.blurb
                        ? {type: 'error', message: currentErrors.blurb}
                        : undefined
                    }
                  />
                  <MultiSelector
                    label="Categories"
                    isRequired
                    options={CATEGORIES}
                    value={categories}
                    onChange={setCategories}
                    hasSearch
                    triggerDisplay="badges"
                    description={`Choose up to ${MAX_CATEGORIES}. The first one decides which charts the book appears in.`}
                    status={
                      currentErrors.categories
                        ? {type: 'error', message: currentErrors.categories}
                        : undefined
                    }
                  />
                </FormLayout>
              )}

              {step === 2 && (
                <FormLayout defaultOptionality="optional">
                  <RadioList
                    label="Where the book is sold"
                    value={scope}
                    onChange={setScope}>
                    <RadioListItem
                      value="worldwide"
                      label="Worldwide"
                      description="Available everywhere the store operates."
                    />
                    <RadioListItem
                      value="selected"
                      label="Selected territories"
                      description="Useful when print or audio rights are already licensed elsewhere."
                    />
                    <RadioListItem
                      value="exclusive"
                      label="Exclusive to this store"
                      description="Higher revenue share, but the book cannot be sold elsewhere for 12 months."
                    />
                  </RadioList>
                  {scope === 'selected' && (
                    <MultiSelector
                      label="Territories"
                      options={TERRITORIES}
                      value={territories}
                      onChange={setTerritories}
                      hasSelectAll
                      triggerDisplay="badges"
                      status={
                        currentErrors.territories
                          ? {
                              type: 'error',
                              message: currentErrors.territories,
                            }
                          : undefined
                      }
                    />
                  )}
                  <FormLayout
                    direction={isNarrow ? 'vertical' : 'horizontal'}
                    defaultOptionality="optional">
                    <DateInput
                      ref={fieldRefs.releaseDate}
                      label="Release date"
                      isRequired
                      value={releaseDate}
                      onChange={setReleaseDate}
                      min="2026-09-01"
                      description="Review takes up to 5 business days."
                      status={
                        currentErrors.releaseDate
                          ? {
                              type: 'error',
                              message: currentErrors.releaseDate,
                            }
                          : undefined
                      }
                    />
                    <NumberInput
                      ref={fieldRefs.price}
                      label="List price"
                      value={price}
                      onChange={setPrice}
                      min={0.99}
                      max={99}
                      step={1}
                      formatValue={usd}
                      description="Before local tax and store adjustments."
                      status={
                        currentErrors.price
                          ? {type: 'error', message: currentErrors.price}
                          : undefined
                      }
                    />
                  </FormLayout>
                  {/* SegmentedControl's own label is aria-only. Field gives it
                      a visible one on the content line, and `isGroupLabel`
                      renders that label as a span — a radiogroup cannot be the
                      target of a `for`. */}
                  <Field
                    label="Sales model"
                    inputID={salesModelID}
                    isGroupLabel
                    description={
                      salesModel === 'purchase'
                        ? 'Readers buy the book outright at your list price.'
                        : salesModel === 'subscription'
                          ? 'Included in the subscription catalog; you earn per minute listened.'
                          : 'Available to buy and included in the subscription catalog.'
                    }>
                    <SegmentedControl
                      label="Sales model"
                      value={salesModel}
                      onChange={setSalesModel}
                      layout="fill">
                      <SegmentedControlItem value="purchase" label="Purchase" />
                      <SegmentedControlItem
                        value="subscription"
                        label="Subscription"
                      />
                      <SegmentedControlItem value="both" label="Both" />
                    </SegmentedControl>
                  </Field>
                  <Divider />
                  <Switch
                    label="Contains explicit content"
                    description="Adds an advisory label and excludes the book from all-ages recommendations."
                    value={isExplicit}
                    onChange={setIsExplicit}
                    labelPosition="start"
                    labelSpacing="spread"
                  />
                  <Switch
                    label="Allow library lending"
                    description="Libraries can license the audiobook for time-limited loans."
                    value={allowsLending}
                    onChange={setAllowsLending}
                    labelPosition="start"
                    labelSpacing="spread"
                  />
                </FormLayout>
              )}

              {step === 3 && (
                <FormLayout defaultOptionality="optional">
                  {/* The one Card in the flow, and it earns it: a linked
                      external account is a self-contained object with its own
                      action, not a field on this form. */}
                  <Card padding={4}>
                    <HStack gap={3} vAlign="center" wrap="wrap">
                      <StackItem size="fill">
                        <VStack gap={1}>
                          <HStack gap={2} vAlign="center">
                            <Text type="label">Stripe account</Text>
                            <StatusDot
                              variant={isStripeLinked ? 'success' : 'warning'}
                              label={isStripeLinked ? 'Linked' : 'Not linked'}
                            />
                          </HStack>
                          <Text type="supporting" color="secondary">
                            {isStripeLinked
                              ? 'Payouts go to Imogen Hale · **** 4417, on the 15th of each month.'
                              : 'Royalties are held until an account is linked. Linking takes about two minutes.'}
                          </Text>
                        </VStack>
                      </StackItem>
                      <Button
                        ref={fieldRefs.stripe}
                        label={isStripeLinked ? 'Manage' : 'Connect Stripe'}
                        variant={isStripeLinked ? 'secondary' : 'primary'}
                        onClick={() => setIsStripeLinked(v => !v)}
                      />
                    </HStack>
                  </Card>
                  {currentErrors.stripe && (
                    <FieldStatus
                      type="error"
                      variant="detached"
                      message={currentErrors.stripe}
                    />
                  )}
                  <Selector
                    label="Payout currency"
                    options={CURRENCIES}
                    value={currency}
                    onChange={setCurrency}
                    description="Conversion happens at the rate on the payout date."
                  />
                  <Divider />
                  <CheckboxList
                    label="Agreements"
                    description="All three are required before a book can be submitted."
                    value={accepted}
                    onChange={setAccepted}
                    status={
                      currentErrors.agreements
                        ? {type: 'error', message: currentErrors.agreements}
                        : undefined
                    }>
                    {AGREEMENTS.map(a => (
                      <CheckboxListItem
                        key={a.value}
                        value={a.value}
                        label={a.label}
                        description={a.description}
                      />
                    ))}
                  </CheckboxList>
                </FormLayout>
              )}

              {step === 4 && (
                <VStack gap={5}>
                  <Banner
                    status="info"
                    title="Review takes up to 5 business days"
                    icon={<Icon icon={CheckBadgeIcon} size="sm" />}
                    description="You can keep editing metadata while the book is in review. Replacing the audio restarts it."
                  />

                  {/* No container: the weakest thing that reads as a group
                      wins, and a label, a bar and a divider already do it.
                      A Card would fence off work that belongs to this step,
                      and a Section bleeds to the edges of the content
                      region — which here means past the right edge of a form
                      column capped at 640 and flush against the rail. */}
                  <VStack gap={3}>
                    <HStack gap={3} vAlign="center" hAlign="between">
                      <Text type="label">Audio processing</Text>
                      <Text type="supporting" color="secondary">
                        {CHAPTERS.length} chapters · {TOTAL_RUNTIME}
                      </Text>
                    </HStack>
                    <ProgressBar
                      label="Audio processing"
                      isLabelHidden
                      value={100}
                      variant="success"
                      hasValueLabel
                    />
                    <Divider />
                    <VStack gap={2}>
                      {CHAPTERS.map(chapter => (
                        <HStack
                          key={chapter.title}
                          gap={3}
                          vAlign="center"
                          hAlign="between">
                          <Text type="body">{chapter.title}</Text>
                          <Text type="supporting" color="secondary">
                            {chapter.duration}
                          </Text>
                        </HStack>
                      ))}
                    </VStack>
                  </VStack>

                  {/* Two run-on lists of label/value rows read as one long
                      list without something between them. */}
                  <Divider />

                  <MetadataList columns="multi">
                    <MetadataListItem
                      label="Title"
                      icon={<Icon icon={BookOpenIcon} size="sm" />}>
                      {title.trim() || '—'}
                    </MetadataListItem>
                    <MetadataListItem
                      label="Author"
                      icon={<Icon icon={UserIcon} size="sm" />}>
                      {penName.trim() || authorName.trim() || '—'}
                    </MetadataListItem>
                    <MetadataListItem
                      label="Series"
                      icon={<Icon icon={RectangleStackIcon} size="sm" />}>
                      {series.trim()
                        ? `${series.trim()}, book ${seriesNumber}`
                        : 'Standalone'}
                    </MetadataListItem>
                    <MetadataListItem
                      label="Language"
                      icon={<Icon icon={LanguageIcon} size="sm" />}>
                      {LANGUAGES.find(l => l.value === language)?.label ??
                        language}
                    </MetadataListItem>
                    <MetadataListItem
                      label="Categories"
                      icon={<Icon icon={TagIcon} size="sm" />}>
                      {categories.length === 0
                        ? '—'
                        : CATEGORIES.filter(c => categories.includes(c.value))
                            .map(c => c.label)
                            .join(', ')}
                    </MetadataListItem>
                    <MetadataListItem
                      label="Availability"
                      icon={<Icon icon={GlobeAltIcon} size="sm" />}>
                      {scope === 'worldwide'
                        ? 'Worldwide'
                        : scope === 'exclusive'
                          ? 'Exclusive, 12 months'
                          : `${territories.length} territories`}
                    </MetadataListItem>
                    <MetadataListItem
                      label="Release date"
                      icon={<Icon icon={CalendarIcon} size="sm" />}>
                      {releaseDate ?? '—'}
                    </MetadataListItem>
                    <MetadataListItem
                      label="List price"
                      icon={<Icon icon={CurrencyDollarIcon} size="sm" />}>
                      {usd(price)}{' '}
                      {CURRENCIES.find(c => c.value === currency)
                        ?.label.split(' — ')[0]
                        .toLowerCase() ?? ''}
                    </MetadataListItem>
                    <MetadataListItem
                      label="Advisory"
                      icon={<Icon icon={ExclamationTriangleIcon} size="sm" />}>
                      {isExplicit ? 'Explicit content' : 'None'}
                    </MetadataListItem>
                    <MetadataListItem
                      label="Library lending"
                      icon={<Icon icon={BuildingLibraryIcon} size="sm" />}>
                      {allowsLending ? 'Allowed' : 'Not allowed'}
                    </MetadataListItem>
                  </MetadataList>

                  <Divider />

                  <CheckboxInput
                    ref={fieldRefs.confirm}
                    label="This is the final audio. I understand replacing it restarts review."
                    value={isConfirmed}
                    onChange={setIsConfirmed}
                    status={
                      currentErrors.confirm
                        ? {type: 'error', message: currentErrors.confirm}
                        : undefined
                    }
                  />
                </VStack>
              )}
            </VStack>
          </Center>
        </LayoutContent>
      }
      footer={
        // `measure` holds the buttons to the form's own column so they sit
        // under the fields they submit. LayoutFooter pads from outside this
        // row, so the inset never eats into the 640.
        <LayoutFooter hasDivider>
          {/* No step counter here. The rail states the position at wide sizes
              and the header stepper states it at narrow ones, so a third
              reading of it in the footer would only be one more thing to keep
              in sync. */}
          <Center
            axis="horizontal"
            style={hasRail && !hasGuidance ? footerLean : undefined}>
            <HStack gap={3} vAlign="center" width="100%" maxWidth={MEASURE}>
              <Button
                label="Back"
                variant="secondary"
                isDisabled={step === 0}
                onClick={() => setStep(s => Math.max(0, s - 1))}
              />
              <StackItem size="fill" />
              <Button
                label={isLastStep ? 'Submit for review' : 'Continue'}
                variant="primary"
                onClick={goNext}
              />
            </HStack>
          </Center>
        </LayoutFooter>
      }
    />
  );
}
