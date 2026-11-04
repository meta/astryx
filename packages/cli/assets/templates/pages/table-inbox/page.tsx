// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * A triage queue where the row is the control surface: hovering it swaps the
 * timestamp for four actions, clicking it opens the thread in a reading pane.
 *
 * An inbox is a table whose rows are verbs. Nobody sorts an inbox by sender or
 * compares one row against the next — they scan for the thread that matters and
 * then do something to it. So the columns are here to hold sender, subject,
 * tags, and time in the same place on every row, which is what makes the list
 * scannable at all, and everything else in the template is about acting on a
 * row without leaving the list.
 *
 * ## Extending this template
 *
 * **The hover swap is CSS, and it has to be.** Four buttons take the
 * timestamp's place while the pointer is on the row. The obvious build —
 * `onMouseEnter` writing a `hoveredId` — re-renders the table on every row the
 * cursor crosses, and gets the accessibility wrong in three separate ways.
 * `useContainerReveal` is the primitive for it: the container publishes its
 * hover state as inherited custom properties and the content reads them, so the
 * swap costs no React state and no re-render. Keyboard focus reveals the
 * actions with no dwell to wait through, coarse pointers get them permanently
 * (they are never behind a hover a touch user cannot perform), and the buttons
 * stay mounted and tabbable at rest rather than being `display: none`.
 *
 * The container is the `<tr>` and the content is inside a `<td>`, which works
 * because the scoping is inheritance rather than a selector — see
 * `useInboxRows`, where the container props are merged onto the row.
 * `hoverDelay` is the other half: without a dwell, dragging the cursor down the
 * list lights up all nine rows in sequence.
 *
 * **Read/unread is the row-status plugin, and that decided the whole file.**
 * `useTableRowStatus` renders a status gutter, and plugins that render only run
 * in data-driven mode — passing `children` replaces the entire header-and-body
 * render, so a hand-composed table gets no plugin cells at all. Data mode in
 * turn always renders a header when columns are defined. A headerless inbox and
 * a plugin-driven one are mutually exclusive today; this template takes the
 * plugins, and the header earns its place by labelling the sort affordances.
 *
 * **Two washes cannot share the row's inline style.** The selection plugin
 * writes `el.style.backgroundColor` imperatively on every notify, so an
 * open-row background set in `transformBodyRow` gets wiped the next time
 * selection changes. `hasRowHighlight: false` turns the plugin's wash off —
 * it exists for exactly this case — and the open row is painted on its
 * *cells* instead, which nothing else touches.
 *
 * **Selecting must never open the thread.** Two activation surfaces overlap on
 * every row: the row opens it, the checkbox and the four actions do not. The
 * tempting fix is `stopPropagation` on each inner control, and it fails on the
 * one that matters — the checkbox belongs to the selection plugin, so there is
 * no handler here to hang it on, and ticking a box opens the reading pane.
 * `isRowItself` guards from the row instead, which covers the plugin's markup
 * and anything added later, on click and on Space alike.
 *
 * **The reading pane is a layout slot, not an overlay.** `LayoutPanel` in
 * `Layout`'s `end` slot is a flex sibling, so opening it narrows the table
 * rather than covering it — which is why `tags` drops out of the column list
 * while the pane is open. A `Dialog` would trap focus and make triaging a queue
 * a modal act, which is the opposite of what an inbox is for.
 *
 * **Reply drafts are scoped to their thread.** Closing the composer preserves an
 * unfinished draft, and reopening Reply on the same conversation restores it.
 * Starting a reply on a different conversation clears the body, Cc, and Bcc
 * state before changing recipients, so no part of one customer's draft can be
 * sent to another.
 *
 */

import {useCallback, useLayoutEffect, useMemo, useRef, useState} from 'react';

import * as stylex from '@stylexjs/stylex';

import {
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {
  durationVars,
  easeVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {Collapsible, CollapsibleGroup} from '@astryxdesign/core/Collapsible';
import {Section} from '@astryxdesign/core/Section';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {useLightbox} from '@astryxdesign/core/Lightbox';
import {OverflowList} from '@astryxdesign/core/OverflowList';
import {ResizeHandle, useResizable} from '@astryxdesign/core/Resizable';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Thumbnail} from '@astryxdesign/core/Thumbnail';
import {Token} from '@astryxdesign/core/Token';
import {Tokenizer} from '@astryxdesign/core/Tokenizer';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import type {SearchSource, SearchableItem} from '@astryxdesign/core/Typeahead';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {useContainerReveal, useMediaQuery} from '@astryxdesign/core/hooks';
import type {UseContainerRevealReturn} from '@astryxdesign/core/hooks';
import {
  Table,
  pixel,
  proportional,
  useTableRowStatus,
  useTableSelection,
  useTableSelectionState,
} from '@astryxdesign/core/Table';
import type {TableColumn, TablePlugin} from '@astryxdesign/core/Table';
import {
  ArchiveBoxIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  FaceSmileIcon,
  FolderArrowDownIcon,
  InboxIcon,
  LinkIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  PencilSquareIcon,
  PhotoIcon,
  TrashIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// ============= DATA =============

type Priority = 'urgent' | 'high' | 'normal';

/**
 * Where a thread stands, which is also which tab it appears under.
 *
 * A standing, not a filter — that is the whole difference from the scope
 * switch this replaced. "Unread" and "Assigned to me" were adjectives, true of
 * a thread at the same time as any other; a thread has exactly one standing at
 * a time, and moving it out of one puts it in another. That is what makes tabs
 * the right control and what makes a per-tab count mean something.
 *
 * `'inbox'` is the odd one: as a stored value it means "nothing more specific
 * has happened to this yet", but as a *tab* it shows the whole queue. See
 * `inCategory`.
 */
type Category = 'inbox' | 'escalations' | 'waiting' | 'resolved';

interface Attachment {
  id: string;
  name: string;
  src: string;
}

/**
 * One message in a thread.
 *
 * The stored `replies` are all earlier messages; the newest one is assembled
 * from the conversation's own `sender` / `receivedFull` / `body` and appended
 * at read time. See `threadMessages`.
 */
interface ThreadMessage {
  id: string;
  sender: string;
  /**
   * Required, not optional.
   *
   * A thread is the one place a mailbox mixes the people writing in with the
   * people answering, and the name alone does not say which is which — an
   * address does, at a glance, before any of the prose is read. Making it
   * optional meant only the newest message carried one, which drew the
   * distinction between "newest" and "older" instead.
   */
  senderEmail: string;
  /**
   * Absolute rather than relative. A collapsed row is the only place this
   * message's date appears, so it has to stand on its own.
   */
  receivedFull: string;
  body: string[];
  attachments?: Attachment[];
}

interface Conversation extends Record<string, unknown> {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  preview: string;
  tags: string[];
  /** Short form for the row; the pane shows `receivedFull`. */
  receivedAt: string;
  receivedFull: string;
  isUnread: boolean;
  priority: Priority;
  category: Category;
  assignee: string | null;
  body: string[];
  attachments: Attachment[];
  /**
   * Earlier messages, oldest first. Optional because most of a triage queue is
   * single messages.
   */
  replies?: ThreadMessage[];
}

const PRIORITY_COLOR: Record<Priority, 'red' | 'orange' | 'default'> = {
  urgent: 'red',
  high: 'orange',
  normal: 'default',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
};

const CONVERSATIONS: Conversation[] = [
  {
    id: 'c-01',
    category: 'escalations',
    sender: 'Priya Raman',
    senderEmail: 'priya.raman@northwind.example',
    subject: 'Checkout returns 502 for EU customers',
    preview:
      'Started around 09:40 UTC. Roughly one in five card payments fails at the confirm step…',
    tags: ['Billing', 'Escalated'],
    receivedAt: '9:52 AM',
    receivedFull: 'Today at 9:52 AM',
    isUnread: true,
    priority: 'urgent',
    assignee: null,
    body: [
      'Started around 09:40 UTC. Roughly one in five card payments fails at the confirm step, and only for customers billing to an EU address — US and APAC look untouched.',
      'The response is a bare 502 with no body, so our retry logic treats it as transient and re-submits. Two customers have now been charged twice.',
      'I have paused the retry worker as a stopgap, so the double charges should stop, but the underlying failures have not.',
    ],
    attachments: [
      {
        id: 'c-01-a1',
        name: 'northwind-checkout-eu.png',
        src: '/template-assets/light-home-horizontal-1.png',
      },
    ],
    replies: [
      {
        id: 'c-01-r1',
        sender: 'Priya Raman',
        senderEmail: 'priya.raman@northwind.example',
        receivedFull: 'Today at 9:44 AM',
        body: [
          'Flagging early — our payments dashboard has just lit up. No numbers yet, but the failures all look like they are on the confirm step rather than the authorisation.',
        ],
      },
      {
        id: 'c-01-r2',
        sender: 'Lucas Meyer',
        // Support-side. Every address on the team shares this domain, which is
        // how a header says "this one is us" without a badge saying so.
        senderEmail: 'lucas.meyer@support.example',
        receivedFull: 'Today at 9:47 AM',
        body: [
          'Acknowledged, paging the payments on-call. Nothing on our status page, so if this is regional it is sitting under our alerting threshold.',
          'Is it specific to one card network, or all of them?',
        ],
      },
    ],
  },
  {
    id: 'c-02',
    category: 'inbox',
    sender: 'Marcus Feld',
    senderEmail: 'm.feld@harbourpoint.example',
    subject: 'SSO metadata rotation — need new certificate',
    preview:
      'Our IdP certificate expires Friday. Can you confirm the fingerprint before we cut over?',
    tags: ['Identity'],
    receivedAt: '9:31 AM',
    receivedFull: 'Today at 9:31 AM',
    isUnread: true,
    priority: 'high',
    assignee: null,
    body: [
      'Our IdP certificate expires Friday at 23:59 UTC. We have the replacement staged and can publish new metadata whenever you are ready.',
      'Before we cut over, can you confirm the SHA-256 fingerprint you have on file matches the one we published? Last rotation we mismatched and locked out 400 people for an hour.',
    ],
    attachments: [],
  },
  {
    id: 'c-03',
    category: 'resolved',
    sender: 'Dana Osei',
    senderEmail: 'dana@osei-consulting.example',
    subject: 'Re: Bulk export finished but the file is empty',
    preview:
      'Thanks — re-running with the date filter cleared did produce rows this time.',
    tags: ['Exports'],
    receivedAt: '8:58 AM',
    receivedFull: 'Today at 8:58 AM',
    isUnread: true,
    priority: 'normal',
    assignee: 'You',
    body: [
      'Thanks — re-running with the date filter cleared did produce rows this time, so it looks like the filter was the culprit rather than the export itself.',
      'Worth noting the empty file still came back with a 200 and a success banner, which is what sent me down the wrong path. A warning when an export matches zero records would have saved a morning.',
    ],
    attachments: [],
    replies: [
      {
        id: 'c-03-r1',
        sender: 'Dana Osei',
        senderEmail: 'dana@osei-consulting.example',
        receivedFull: 'Yesterday at 5:12 PM',
        body: [
          'Ran the full-account export this afternoon. It finished in about forty seconds and handed me a zero-byte CSV — no header row, nothing.',
        ],
      },
      {
        id: 'c-03-r2',
        sender: 'Marta Nowak',
        senderEmail: 'marta.nowak@support.example',
        receivedFull: 'Today at 8:31 AM',
        body: [
          'A zero-byte file usually means the query matched no rows rather than that the export itself failed. Could you retry with the date filter cleared and tell me whether the file comes back with content?',
        ],
      },
    ],
  },
  {
    id: 'c-04',
    category: 'inbox',
    sender: 'Tomás Ibarra',
    senderEmail: 'tomas.ibarra@meridian.example',
    subject: 'Webhook retries stopped after the 3rd attempt',
    preview:
      'We expected five retries with backoff. Logs show three and then nothing for order 88214.',
    tags: ['Webhooks', 'Bug'],
    receivedAt: '8:14 AM',
    receivedFull: 'Today at 8:14 AM',
    isUnread: false,
    priority: 'high',
    assignee: 'You',
    body: [
      'We expected five retries with exponential backoff. Logs show three attempts and then nothing for order 88214.',
      'The endpoint was returning 503 throughout, so this should have kept retrying to the documented limit. The gap in our delivery log after 08:02 is the part I cannot explain.',
    ],
    attachments: [],
  },
  {
    id: 'c-05',
    category: 'waiting',
    sender: 'Hannah Lindqvist',
    senderEmail: 'h.lindqvist@varda.example',
    subject: 'Homepage refresh — three directions for your review',
    preview:
      'Attached the three we shortlisted. We need a decision by Thursday to hold the schedule.',
    tags: ['Design', 'Review'],
    receivedAt: 'Yesterday',
    receivedFull: 'Yesterday at 4:22 PM',
    isUnread: false,
    priority: 'high',
    assignee: null,
    body: [
      'Attached the three directions we shortlisted out of the eleven we explored. They differ in mood rather than structure, so the layout work carries over whichever one you pick.',
      'Colourful is the boldest and the furthest from the current site. Light is the safest and reads closest to the product itself. Moody photographs best but needs art direction we do not have in-house yet.',
      'We need a decision by Thursday to hold the build schedule.',
    ],
    attachments: [
      {
        id: 'a-1',
        name: 'direction-1-colourful.png',
        src: '/template-assets/colorful-home-horizontal-1.png',
      },
      {
        id: 'a-2',
        name: 'direction-2-light.png',
        src: '/template-assets/light-home-horizontal-1.png',
      },
      {
        id: 'a-3',
        name: 'direction-3-moody.png',
        src: '/template-assets/moody-home-horizontal-1.png',
      },
    ],
    replies: [
      {
        id: 'c-05-r1',
        sender: 'Hannah Lindqvist',
        senderEmail: 'h.lindqvist@varda.example',
        receivedFull: 'Monday at 3:05 PM',
        body: [
          'Kicking off the homepage refresh. We have eleven explorations open; I will cut them to three before Thursday so you get something decidable rather than a mood board.',
        ],
      },
      {
        id: 'c-05-r2',
        sender: 'Elliot Nakamura',
        senderEmail: 'elliot.nakamura@support.example',
        receivedFull: 'Tuesday at 10:18 AM',
        body: [
          'Three is the right number. One request: hold the hero structure identical across all of them, so the thing we are judging is treatment and not layout. Last round nobody could tell which of the two they were reacting to.',
        ],
      },
      {
        // A second voice from the customer's side, and the only one in the
        // fixture. Every other thread is one customer and one agent, where
        // Reply and Reply all address the same person and the difference
        // between the two buttons never shows.
        id: 'c-05-r2b',
        sender: 'Ines Duarte',
        senderEmail: 'i.duarte@varda.example',
        receivedFull: 'Tuesday at 4:52 PM',
        body: [
          'Copy is written against the current hero, so holding the structure suits us — I will only need to reflow if the headline slot changes length.',
        ],
      },
      {
        id: 'c-05-r3',
        sender: 'Hannah Lindqvist',
        senderEmail: 'h.lindqvist@varda.example',
        receivedFull: 'Yesterday at 11:40 AM',
        body: [
          'Structure is fixed across all three. Sending the moody direction on its own first — it is the one most likely to split the room, and it reads differently without the other two beside it.',
        ],
        attachments: [
          {
            id: 'c-05-r3-a1',
            name: 'moody-direction-hero.png',
            src: '/template-assets/moody-home-horizontal-1.png',
          },
        ],
      },
    ],
  },
  {
    id: 'c-06',
    category: 'waiting',
    sender: 'Owen Baptiste',
    senderEmail: 'obaptiste@fieldstone.example',
    subject: 'Seat count says 145 but we only provisioned 120',
    preview:
      'Finance flagged the discrepancy on the March invoice. Can we reconcile before the 30th?',
    tags: ['Billing'],
    receivedAt: 'Yesterday',
    receivedFull: 'Yesterday at 11:07 AM',
    isUnread: false,
    priority: 'high',
    assignee: 'You',
    body: [
      'Finance flagged the discrepancy on the March invoice. Our directory shows 120 provisioned seats; the invoice bills 145.',
      'My guess is deactivated accounts are still counted until the end of the billing period, but I cannot find that stated anywhere. Can we reconcile before the 30th?',
    ],
    attachments: [],
  },
  {
    id: 'c-07',
    category: 'inbox',
    sender: 'Aiko Tanaka',
    senderEmail: 'aiko.tanaka@shorebird.example',
    subject: 'Docs: the rate-limit page contradicts the API response header',
    preview:
      'Page says 600/min, header reports 300/min on our plan. One of them is wrong.',
    tags: ['Docs'],
    receivedAt: 'Yesterday',
    receivedFull: 'Yesterday at 9:15 AM',
    isUnread: false,
    priority: 'normal',
    assignee: null,
    body: [
      'The rate-limit page says 600 requests per minute on Scale. The X-RateLimit-Limit header on our responses reports 300.',
      'One of them is wrong, and we have sized a batch job against the larger number.',
    ],
    attachments: [],
  },
  {
    id: 'c-08',
    category: 'resolved',
    sender: 'Reuben Cole',
    senderEmail: 'r.cole@atlasgrid.example',
    subject: 'Re: Scheduled maintenance window confirmation',
    preview: 'Confirmed for Sunday 02:00–04:00 UTC. Nothing further needed.',
    tags: ['Ops'],
    receivedAt: 'Mon',
    receivedFull: 'Monday at 2:40 PM',
    isUnread: false,
    priority: 'normal',
    assignee: 'You',
    body: [
      'Confirmed for Sunday 02:00–04:00 UTC. We have notified our on-call and paused the nightly sync for that window.',
      'Nothing further needed from your side.',
    ],
    attachments: [],
  },
  {
    id: 'c-09',
    category: 'inbox',
    sender: 'Sofia Marchetti',
    senderEmail: 'sofia@marchetti-legal.example',
    subject: 'Feature request: per-workspace retention policy',
    preview:
      'Our legal team needs 30-day retention on one workspace and 400 on another.',
    tags: ['Feature request'],
    receivedAt: 'Mon',
    receivedFull: 'Monday at 10:02 AM',
    isUnread: false,
    priority: 'normal',
    assignee: null,
    body: [
      'Our legal team needs 30-day retention on the client-intake workspace and 400 days on the matter-archive workspace.',
      'Today retention is an account-level setting, so we are stuck applying the longer policy everywhere, which is the opposite of what our counsel wants.',
    ],
    attachments: [],
  },
];

const CATEGORIES: {value: Category; label: string}[] = [
  {value: 'inbox', label: 'Inbox'},
  {value: 'escalations', label: 'Escalations'},
  {value: 'waiting', label: 'Waiting'},
  {value: 'resolved', label: 'Resolved'},
];

/**
 * Whether a thread belongs under a given tab.
 *
 * Inbox is the whole queue rather than a fourth bucket beside the others. A
 * mailbox whose first screen shows a quarter of its mail reads as an empty
 * mailbox, and "escalated" or "waiting on the customer" are things that are
 * true *of* a thread in the inbox, not places it went instead. So Inbox is the
 * everything view and the other three are cuts through it.
 *
 * One predicate rather than an inline filter, because the tab badges have to
 * count exactly what the tab will show. Two copies of this rule is two chances
 * for a badge to promise mail the tab does not have.
 */
function inCategory(item: Conversation, category: Category): boolean {
  return category === 'inbox' || item.category === category;
}

/** Unread per tab, which is what the badges count. */
function unreadByCategory(): Record<Category, number> {
  const counts: Record<Category, number> = {
    inbox: 0,
    escalations: 0,
    waiting: 0,
    resolved: 0,
  };
  for (const item of CONVERSATIONS) {
    if (!item.isUnread) {
      continue;
    }
    for (const {value} of CATEGORIES) {
      if (inCategory(item, value)) {
        counts[value] += 1;
      }
    }
  }
  return counts;
}

/**
 * Dwell before the row actions appear. Without it a cursor travelling down the
 * list lights up every row it crosses; keyboard focus and touch ignore it.
 *
 * Short enough to read as immediate on a row the pointer stopped on, which is
 * the ceiling worth spending here: the dwell buys quiet during a sweep, and
 * the fade that follows it costs its own frames on top, so a gate long enough
 * to notice separately reads as the row being slow rather than the list being
 * calm.
 */
const HOVER_INTENT_MS = 90;

/** Matches the wash the selection plugin paints, so both states look native. */
const OPEN_CELL_STYLE = {backgroundColor: 'var(--color-accent-muted)'};

/**
 * Below this the surface cannot hold a list and a pane side by side at all, so
 * the pane takes the whole of it and the list comes back when it closes — the
 * behaviour of every mail client on a phone.
 *
 * The surface, not the window. A page template is not always given the window:
 * dropped into a preview, a split editor or a modal it gets a box, and asking
 * `matchMedia` how wide the *window* is answers a question nobody asked. How
 * wide the table then ends up inside that box is a third question again; see
 * `STACK_ROWS_BELOW`.
 */
const SINGLE_SURFACE_BELOW = 900;

/**
 * Below this much room *for the table*, the columns stop earning their keep
 * and the rows stack.
 *
 * 560 sits just above what the tabular layout needs to avoid scrolling
 * sideways — a 28px status gutter, a 36px checkbox, 190px of sender, the
 * subject's minimum and the trailing column come to roughly 516 — so the swap
 * happens before the table starts overflowing rather than after.
 */
const STACK_ROWS_BELOW = 560;

/**
 * Below this much room for the table, tags go.
 *
 * They are a fixed 200px, and the subject is what a queue is actually scanned
 * by, so past this point the tag column is spending a quarter of the table on
 * the column people read last. Above it there is room for both.
 *
 * This is a separate threshold from `STACK_ROWS_BELOW` because losing a column
 * and abandoning columns altogether are different amounts of damage, and the
 * width at which each becomes the better trade is different. Between the two
 * the table is still tabular, just narrower by one.
 */
const TIGHTEN_COLUMNS_BELOW = 900;

/**
 * What the pane is worth on arrival: two thirds, leaving the list a third.
 *
 * A share rather than a pixel width. The list is the index and the pane is the
 * thing being read, so the ratio between them is the constant — a fixed 480px
 * list is a third of a 1440px page but well over half of the surface the
 * docsite gives a preview, where it read as a table with a pane tacked on.
 *
 * A starting position, not a constraint: the handle overrides it immediately,
 * and `LIST_MIN_WIDTH` outranks it on surfaces too narrow to give the list its
 * third.
 */
const PANE_DEFAULT_SHARE = 2 / 3;

/**
 * The narrowest the list may be dragged.
 *
 * Enforced as a ceiling on the pane rather than a floor on the list, because
 * the list is not a sized region — it is whatever `LayoutContent` has left.
 * At this width rows have long since stacked, so what it protects is a stacked
 * row that can still name a sender and a subject.
 */
const LIST_MIN_WIDTH = 300;

/**
 * The narrowest the pane may be dragged — below this the thread is a column of
 * broken lines and the reply pair stops fitting on one row.
 */
const PANE_MIN_WIDTH = 440;

/* The pane has no width ceiling of its own. `LIST_MIN_WIDTH` is the only
   thing above it, which makes the ceiling `surfaceWidth - LIST_MIN_WIDTH` —
   a figure that grows with the screen instead of freezing at one.

   It used to be a flat 1040, on the reasoning that a reading pane is a column
   of prose and stops being readable past about there. True of the prose, and
   `MESSAGE_MEASURE` is where that belongs — it caps the text and lets the pane
   around it be whatever it needs to be. Spent on the pane instead it bought
   nothing and cost the list its whole range: on a 1900px surface it pinned the
   list at 860px, so the stacked rows — which need it under 560 — could not be
   reached by dragging at all.

   A share would not fix that either, which is the thing worth noticing. Any
   constant share leaves the list a constant fraction, so its floor climbs with
   the screen and overtakes the stacking threshold again on a big enough one:
   at 80% the list bottoms out at 380px on a 1900px surface but 600px on a
   3000px one, and stacking is out of reach a second time. A pixel floor on the
   list is the scale-free version of the same intent. */

/**
 * The tab strip's height, borrowed by the bulk-selection bar that replaces it.
 *
 * The two share a slot, and the whole point of sharing it is that selecting a
 * row must not move the table. That only holds if the replacement is the same
 * height as what it replaced, and the strip's height is not something either
 * row states — it falls out of a `Tab`'s type and padding. So it is measured
 * once and named here, and the bar is pinned to it rather than left to arrive
 * at its own height and miss by a few pixels.
 *
 * The band inside is shorter than this and centred in it. The strip's height
 * includes the rule `TabList hasDivider` draws at its bottom edge; the band
 * has no rule, so the difference shows up as breathing room around it rather
 * than as a taller row.
 */
const SELECTION_BAR_HEIGHT = 37;

/**
 * How wide a message is allowed to get, regardless of the pane.
 *
 * The pane is resizable and its ceiling is over a thousand pixels, which is
 * two or three times a comfortable measure — drag it out and the prose starts
 * running the full width, where the eye loses the start of the next line on
 * the way back from the end of the last. A cap is the fix, and it applies to
 * the body block rather than the pane, so the header, the tags and the
 * thread's own structure still use the width they were given.
 */
const MESSAGE_MEASURE = 680;

/**
 * The width of the box this template was given, tracked as it changes.
 *
 * Every responsive decision below is a question about that box and none of
 * them is a question about the window. The two are the same thing only when
 * the template happens to own the page — put it in the docsite's preview, a
 * split editor or a dialog and `matchMedia` starts describing a viewport the
 * template cannot see, which is how a two-pane layout ends up drawing full-fat
 * columns into 260px of room.
 *
 * `@container` is the right question in the wrong instrument: its answer never
 * leaves CSS, and what changes here is the column *list*, which only React can
 * do. So the box is measured instead. The first read is synchronous and inside
 * `useLayoutEffect`, before paint, so the opening frame is already laid out for
 * the real width rather than snapping to it afterwards.
 *
 * Both reads have to be in the same units, which rules out
 * `getBoundingClientRect` for the first one: it reports the box as *painted*,
 * so an ancestor `transform: scale()` is baked into it, while a
 * ResizeObserver reports the box as *laid out* and ignores the same
 * transform. The template catalog draws every card through `scale(0.5)`, so
 * mixing the two there opened on half the real width and corrected to the
 * full one an instant later — and anything that read the width in between,
 * like the pane's opening position, kept the halved answer. `offsetWidth` is
 * the laid-out width, minus the padding the observer also excludes.
 */
function useSurfaceWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const {paddingInlineStart, paddingInlineEnd} = getComputedStyle(node);
    setWidth(
      node.offsetWidth -
        parseFloat(paddingInlineStart) -
        parseFloat(paddingInlineEnd),
    );

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * Controls that live inside the row but are not the row.
 *
 * The row is one big button, so everything nested in it inherits that click
 * unless something stops it. Guarding centrally rather than hanging
 * `stopPropagation` on each control is what keeps this true for the next
 * control somebody adds — and it has to cover the selection checkbox, which
 * the plugin renders and the template never touches.
 */
const INTERACTIVE_WITHIN_ROW =
  'button, input, a, label, [role="checkbox"], [role="button"], [role="menuitem"]';

function isRowItself(event: {target: EventTarget | null}): boolean {
  return !(event.target as HTMLElement | null)?.closest(INTERACTIVE_WITHIN_ROW);
}

// ============= ROW ACTIONS =============

interface RowAction {
  id: string;
  label: string;
  icon: typeof ArchiveBoxIcon;
}

const ROW_ACTIONS: RowAction[] = [
  {id: 'archive', label: 'Archive', icon: ArchiveBoxIcon},
  {id: 'move', label: 'Move to folder', icon: FolderArrowDownIcon},
  {id: 'delete', label: 'Delete', icon: TrashIcon},
  {id: 'reply', label: 'Reply', icon: ArrowUturnLeftIcon},
];

/**
 * The same actions, minus the one that is not about the thread.
 *
 * Archive, move and delete decide where a conversation goes, so they belong to
 * whichever surface names the conversation — the row on hover, and the pane's
 * header once it is open. Reply is an answer to a particular message, so it
 * lives at the end of the thread instead, under the message it answers.
 */
const THREAD_ACTIONS: RowAction[] = ROW_ACTIONS.filter(
  action => action.id !== 'reply',
);

/** The gap between a message's avatar and the name beside it. */
const THREAD_HEADER_GAP = 3;

/** Avatar's default rendered size, which `ThreadGutter` has to match. */
const AVATAR_SIZE = 36;

/**
 * Archive and delete are what a queue is actually triaged with, and two
 * buttons is all a stacked row can spend on its trailing column before the
 * subject starts paying for it. Move and reply are one click away in the
 * pane's toolbar, which renders all four either way.
 */
const NARROW_ROW_ACTIONS = ROW_ACTIONS.filter(
  action => action.id === 'archive' || action.id === 'delete',
);

/** A `size="sm"` IconButton is 28px (`--size-element-sm`); `gap={0.5}` is 2px. */
function actionsWidth(count: number): number {
  return count * 28 + (count - 1) * 2;
}

/** `density="balanced"` insets a table cell by 12px on each inline edge. */
const CELL_INSET = 24;

/**
 * Puts the unread dot on the page's content line.
 *
 * Two things have to agree for that to happen, and neither alone is enough.
 * `LayoutContent`'s padding publishes the inset, and a table's leading cell
 * takes its start padding from it — that is what a full-bleed table uses to
 * line its first column up with the prose above it. But the status gutter is a
 * flat 28px, which was sized against the 8px floor that applies when there is
 * no inset to read; against a real one the cell's padding leaves the dot no
 * width at all and it disappears.
 *
 * So the column is re-sized here to what its own contents now cost: 16px of
 * inset, the 8px dot, and the 12px the density puts after every cell. The
 * plugin's `renderCell` is kept as it is — the dot, its colour and its tooltip
 * are the plugin's business, and this is only about where the box is.
 */
const STATUS_GUTTER_WIDTH = 36;

/**
 * The plugin's own column key. Reaching for it is the part of this worth
 * flagging: it is internal to `useTableRowStatus`, and if it is ever renamed
 * this quietly stops applying rather than failing.
 */
const STATUS_COLUMN_KEY = '__rowStatus';

const ALIGN_STATUS_GUTTER: TablePlugin<Conversation> = {
  transformColumns: columns =>
    columns.map(column =>
      column.key === STATUS_COLUMN_KEY
        ? {...column, width: pixel(STATUS_GUTTER_WIDTH)}
        : column,
    ),
};

/**
 * Room for "Yesterday" — the widest `receivedAt` this data produces — plus the
 * attachment clip and its gap ahead of it.
 *
 * Paid on every row, not just the ones carrying an attachment, because a
 * column is one width. Buying it per-row would mean the date sitting twenty
 * pixels further left wherever a clip appears, which turns the one edge in the
 * table you scan straight down into a ragged one.
 */
const TIMESTAMP_WIDTH = 76 + 16 + 4;

/**
 * How wide the trailing column has to be.
 *
 * Overlaid, the actions and the timestamp occupy the same box at different
 * times, so the column has to fit whichever is wider — sizing it to the
 * actions alone is what truncates "Yesterday" to "Yesterd…" the moment the
 * stacked layout drops to two buttons. Side by side they are both on screen
 * at once and the column pays for the pair plus the gap between them.
 */
function trailingWidth(actionCount: number, isSideBySide: boolean): number {
  const actions = actionsWidth(actionCount);
  return isSideBySide
    ? actions + 4 + TIMESTAMP_WIDTH + CELL_INSET
    : Math.max(actions, TIMESTAMP_WIDTH) + CELL_INSET;
}

/**
 * The actions take the whole cell the moment they enter flow, which is what
 * leaves the timestamp with nowhere to be.
 *
 * `Stack` has no flex-basis prop and `StackItem` no width, so this pair is the
 * one thing the composition cannot say for itself. Without it the cell's slack
 * stays with the timestamp, and a few pixels of it survive underneath the
 * buttons instead of collapsing to nothing.
 */
const ACTIONS_CLAIM_CELL = {flexBasis: '100%', flexShrink: 0};

/**
 * Clips whatever the actions squeeze out of the trailing box.
 *
 * The date survives being squeezed to zero width because `maxLines` gives it
 * an overflow rule of its own. The attachment clip beside it has none — it is
 * a fixed 16px box that paints wherever it lands — so without this it stays on
 * screen, overlapping the buttons that just took its cell.
 */
const HIDE_SQUEEZED_CONTENT = {overflow: 'hidden'};

/**
 * The bulk-selection band, matched to the one in the `table-filter` template.
 *
 * Same muted fill, same element radius, same entry. Two tables that both let
 * you tick rows and act on the set should not disagree about what that looks
 * like, and `table-filter` got there first.
 */
const styles = stylex.create({
  // A radius because the band is inset to the content line rather than run
  // full-bleed, so square corners would read as a clipped strip.
  bulkBand: {
    borderRadius: radiusVars['--radius-element'],
  },
  // The band mounts the moment the first row is checked, so the entry is a
  // `@starting-style` transition rather than a keyframe or a mount flag: the
  // settled value is the one written here, so an interrupted transition still
  // lands correctly. Reduced motion collapses the duration rather than the
  // property, because a media query cannot nest inside `@starting-style`.
  bulkBandEnter: {
    opacity: 1,
    transform: 'translateY(0)',
    transitionProperty: 'opacity, transform',
    transitionDuration: {
      default: durationVars['--duration-medium'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
    '@starting-style': {
      opacity: 0,
      transform: `translateY(${spacingVars['--spacing-3']})`,
    },
  },
});

/**
 * The timestamp, and the actions that take its place on hover.
 *
 * Both visibilities come from `useContainerReveal` — the row is the container —
 * so nothing here is driven by React state and hovering re-renders nothing.
 *
 * The actions land *on* the timestamp rather than beside it, and the mechanism
 * is flow, not `position: absolute`. Revealed content is `absolute` at rest and
 * `static` once the container is active; that flip belongs to the hook, and it
 * answers to pointer hover, `:focus-within` and a coarse pointer alike. So the
 * actions cost nothing while they are hidden and claim the entire cell the
 * instant they appear, and the timestamp — the one box here that is allowed to
 * give, because `StackItem` carries the `min-width: 0` reset — is squeezed to
 * zero width by the very declaration that puts them in flow.
 *
 * That the two are one fact is the point, and it is why this cannot repeat the
 * collision an earlier build hit. Absolutely positioning the actions over the
 * timestamp made their arrival and its departure two separate rules answering
 * to two different triggers: reveal comes in on `:focus-within` so a keyboard
 * user can reach it, and conceal deliberately ignores focus, because nobody
 * should watch text vanish as they tab into a row. Click a row — which leaves
 * it focused — and both fired at once, on top of each other. Here there is no
 * second rule to disagree with the first. The timestamp is not hidden, it is
 * displaced, and no state exists in which the actions hold the cell and the
 * timestamp still has width to be seen in.
 *
 * The cost is real and worth naming: while the row holds focus the date is not
 * readable. It stays in the accessibility tree — clipped, never `display:
 * none` — the pane carries `receivedFull`, and the alternative is the empty
 * column this layout exists to remove.
 */
function ReceivedCell({
  item,
  actions,
  reveal,
  isOverlaid,
}: {
  item: Conversation;
  actions: RowAction[];
  reveal: UseContainerRevealReturn;
  /**
   * False on coarse pointers. There the reveal keeps the actions up
   * permanently — they are never behind a hover a touch user cannot perform —
   * so an overlay would bury the timestamp for good rather than swap with it.
   * With nothing to swap, the two go back to sharing the row.
   */
  isOverlaid: boolean;
}) {
  return (
    /* `height` reserves the buttons' line box. Without it the row is 40px at
       rest and 44px with the actions in it, so every row nudges its
       neighbours down as the cursor passes. Matching the small IconButton
       (28px) keeps the whole table on one rhythm. */
    <HStack gap={1} vAlign="center" hAlign="end" height={28}>
      {/* No `isLayoutPreserved`: the position flip is the mechanism here, not
          a side effect of it. Layout-preserved content stays in flow at rest,
          which reserves exactly the width this layout exists to remove. */}
      <HStack
        {...reveal.getContentRevealProps()}
        style={isOverlaid ? ACTIONS_CLAIM_CELL : undefined}
        gap={0.5}
        vAlign="center"
        hAlign="end">
        {actions.map(action => (
          <IconButton
            key={action.id}
            variant="ghost"
            size="sm"
            label={`${action.label} — ${item.subject}`}
            tooltip={action.label}
            icon={<Icon icon={action.icon} size="sm" />}
          />
        ))}
      </HStack>

      {/* `size="fill"` is what nominates the timestamp as the thing that gives:
          it is the only child here carrying the `min-width: 0` reset, so it is
          the only one flex is permitted to take width from. `maxLines` is what
          makes the giving invisible — a zero-width box still paints its text
          without it. The truncate tooltip is off because at zero width the
          text always counts as truncated, and a tooltip competing with the
          action tooltips is the last thing this cell needs.

          Only the side-by-side build wears `isRevealInverted`. Overlaid, the
          conceal rule is exactly the half that could not see focus, and
          nothing is left that needs it. */}
      <StackItem size="fill">
        {/* The clip rides inside the displaced box rather than beside it,
            which is the whole reason it can live here at all. Anything outside
            this `StackItem` keeps its width when the actions claim the cell,
            so a clip parked next to it would still be sitting there under the
            buttons. In here it is squeezed to nothing by the same declaration
            that takes the date away, and comes back with it. */}
        <HStack
          {...(isOverlaid
            ? {}
            : reveal.getContentRevealProps({isRevealInverted: true}))}
          /* Squeezing this box to zero width does not stop a 16px glyph from
             painting outside it — `maxLines` is the date's own overflow rule
             and covers only the date. */
          style={HIDE_SQUEEZED_CONTENT}
          gap={1}
          vAlign="center"
          hAlign="end">
          {item.attachments.length === 0 ? null : (
            /* Labelled, not decorative: this glyph is the only place the list
               says an attachment exists, so unlabelled it would take the fact
               away from anyone not looking at it. */
            <Icon
              icon={PaperClipIcon}
              size="sm"
              color="gray"
              label="Has attachments"
            />
          )}
          <Text
            color="secondary"
            hasTabularNumbers
            justify="end"
            maxLines={1}
            hasTruncateTooltip={false}
            weight={item.isUnread ? 'semibold' : 'normal'}>
            {item.receivedAt}
          </Text>
        </HStack>
      </StackItem>
    </HStack>
  );
}

// ============= ROW BEHAVIOUR =============

/**
 * Makes each row a doorway and a reveal container at once.
 *
 * A `<tr>` has no activation of its own, so click, Enter, and Space are wired
 * by hand. The reveal container props ride along on the same element: the
 * actions live two levels down in a `<td>`, and reach the state through
 * inheritance rather than a selector, so the container can be the row.
 *
 * The open row is painted on its cells rather than the row itself, because the
 * selection plugin owns `row.style.backgroundColor` and rewrites it on every
 * notify.
 */
function useInboxRows({
  openId,
  onOpen,
  getContainerProps,
}: {
  openId: string | null;
  onOpen: (item: Conversation) => void;
  getContainerProps: UseContainerRevealReturn['getContainerProps'];
}): TablePlugin<Conversation> {
  return useMemo(
    () => ({
      transformBodyRow: (props, item) => {
        const container = getContainerProps({hoverDelay: HOVER_INTENT_MS});
        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            className: [props.htmlProps.className, container.className]
              .filter(Boolean)
              .join(' '),
            style: {...props.htmlProps.style, ...container.style},
            tabIndex: 0,
            'aria-current': item.id === openId ? true : undefined,
            onClick: event => {
              if (isRowItself(event)) {
                onOpen(item);
              }
            },
            onKeyDown: event => {
              // Same guard: Space on a focused checkbox must toggle it and
              // nothing else, and the keystroke bubbles to the row too.
              if (
                (event.key !== 'Enter' && event.key !== ' ') ||
                !isRowItself(event)
              ) {
                return;
              }
              event.preventDefault();
              onOpen(item);
            },
          },
        };
      },
      transformBodyCell: (props, _column, item) =>
        item.id === openId
          ? {
              ...props,
              htmlProps: {
                ...props.htmlProps,
                style: {...props.htmlProps.style, ...OPEN_CELL_STYLE},
              },
            }
          : props,
    }),
    [getContainerProps, onOpen, openId],
  );
}

// ============= READING PANE =============

/**
 * The avatar's column, continued past the row the avatar is on.
 *
 * A message's avatar and name are laid out by the collapsible's trigger; the
 * body is in the collapsible's content, a different element entirely, so
 * nothing lines the two up on its own and the prose ran out to the avatar's
 * left edge. Reserving the avatar's width again below it starts the first
 * character of the message under the first character of the sender, and leaves
 * the avatars hanging in a column of their own down the side of the thread.
 *
 * An empty box rather than a 48px indent because the number is not a spacing
 * decision — it is the avatar plus the gap, and the two are declared here
 * rather than added up into a constant that quietly goes wrong when the avatar
 * changes size.
 */
function ThreadGutter() {
  return <VStack width={AVATAR_SIZE} />;
}

/**
 * Image attachments as Thumbnails, opening into a lightbox.
 *
 * `onClick` is what makes each one a control. Without it Thumbnail renders a
 * static group: no keyboard reach, no press affordance, and the file name only
 * ever surfaces in a hover tooltip. With it the component supplies the button
 * semantics, the accessible name and the press wash itself.
 *
 * A thumbnail is a 64px square of a screenshot somebody attached to prove a
 * point, which is to say it is unreadable — clicking one has to lead
 * somewhere. `useLightbox` is the whole of that: it owns the open state and
 * the index and hands back an `element` to render and an `open(i)` to call.
 * Passing the array rather than one item is what puts the viewer in gallery
 * mode, so a message with three screenshots can be paged through without
 * closing and reopening.
 */
function AttachmentStrip({attachments}: {attachments: Attachment[]}) {
  // Above the empty guard, not below it: a hook cannot sit behind an early
  // return, and most messages have nothing attached.
  const lightbox = useLightbox({
    media: attachments.map(attachment => ({
      src: attachment.src,
      alt: `Attachment: ${attachment.name}`,
      // The file name is the caption. It is the only thing identifying which
      // of three near-identical screenshots is on screen.
      caption: attachment.name,
    })),
    // Attachments here are screenshots of the thing being reported, and the
    // detail that matters is usually a few pixels of it.
    hasZoom: true,
  });

  if (attachments.length === 0) {
    return null;
  }

  return (
    <VStack gap={2}>
      <HStack gap={1} vAlign="center">
        <Icon icon={PaperClipIcon} size="sm" color="gray" />
        <Text type="supporting" color="secondary">
          {attachments.length} attachment
          {attachments.length === 1 ? '' : 's'}
        </Text>
      </HStack>
      <HStack gap={2} wrap="wrap">
        {attachments.map((attachment, index) => (
          <Thumbnail
            key={attachment.id}
            src={attachment.src}
            alt={`Preview of ${attachment.name}`}
            label={attachment.name}
            onClick={() => lightbox.open(index)}
          />
        ))}
      </HStack>
      {lightbox.element}
    </VStack>
  );
}

/**
 * The whole thread, oldest first, with the message the row points at last.
 *
 * The newest message is not a separate thing rendered under the history — it
 * is the last item in the same list. A conversation is one sequence, and
 * rendering its final entry with a different header, its own divider and no
 * disclosure made the pane read as two components that happened to be stacked.
 * It is folded in here and pre-expanded instead, so clicking a row still lands
 * on readable text while every message in the column opens, closes and lines
 * up the same way.
 */
function threadMessages(conversation: Conversation): ThreadMessage[] {
  return [
    ...(conversation.replies ?? []),
    {
      id: conversation.id,
      sender: conversation.sender,
      senderEmail: conversation.senderEmail,
      receivedFull: conversation.receivedFull,
      body: conversation.body,
      attachments: conversation.attachments,
    },
  ];
}

/**
 * `type="multiple"`, not the default accordion. Reading a thread is usually
 * comparing two messages rather than reading one, and single mode closes the
 * message you just finished in order to open the next.
 */
function ThreadHistory({conversation}: {conversation: Conversation}) {
  const messages = threadMessages(conversation);

  return (
    <VStack gap={2}>
      {/* No dividers. Each message already announces itself with an avatar, a
          name and an address on their own line, and a rule between them was a
          second boundary drawn where there was visibly one already —
          `density="spacious"` is doing that work with white space. */}
      <CollapsibleGroup
        // Remount per thread. `defaultValue` is a default, so it is read once
        // and never again — without this the group carries the previous
        // thread's open set into the next one, and since those ids are not in
        // the new thread the result is a conversation with every message shut.
        // A key is the whole fix: a different thread is a different disclosure
        // group, not the same one with new children.
        key={conversation.id}
        type="multiple"
        density="spacious"
        // The one message the row was pointing at. Everything older stays
        // closed: context that costs a click is cheaper than context that
        // costs a scroll.
        defaultValue={[conversation.id]}>
        {messages.map(message => (
          <Collapsible
            key={message.id}
            // A `value` hands state to the group, and the group is then the
            // only source of truth — `defaultIsOpen` is ignored from here on,
            // which is why the pre-expanded one is named in `defaultValue`
            // above rather than marked here.
            value={message.id}
            trigger={
              /* `tooltip={false}` is load-bearing, not cosmetic: a named
                 Avatar owns a hover tooltip and takes `tabIndex={0}` to make
                 it keyboard-reachable, which would put a second tab stop
                 inside the trigger's own button.

                 `fill` on the identity is what sends the date to the far edge:
                 Collapsible lays the trigger out against the chevron with
                 `space-between`, so the slack has to be claimed by something
                 for the date to end up on the other side of it. The end inset
                 is what keeps the date off the chevron once it gets there —
                 `space-between` puts the two hard against each other, and the
                 trigger's own gap does not apply across that boundary. */
              <HStack
                gap={THREAD_HEADER_GAP}
                vAlign="center"
                paddingInlineEnd={2}>
                <Avatar name={message.sender} tooltip={false} />
                <StackItem size="fill">
                  <VStack gap={0.5}>
                    <Text maxLines={1} weight="semibold">
                      {message.sender}
                    </Text>
                    <Text maxLines={1} type="supporting" color="secondary">
                      {message.senderEmail}
                    </Text>
                  </VStack>
                </StackItem>
                <Text type="supporting" color="secondary">
                  {message.receivedFull}
                </Text>
              </HStack>
            }>
            <HStack gap={THREAD_HEADER_GAP}>
              <ThreadGutter />
              <StackItem size="fill">
                <VStack gap={3} maxWidth={MESSAGE_MEASURE}>
                  {message.body.map(paragraph => (
                    <Text key={paragraph}>{paragraph}</Text>
                  ))}
                  <AttachmentStrip attachments={message.attachments ?? []} />
                </VStack>
              </StackItem>
            </HStack>
          </Collapsible>
        ))}
      </CollapsibleGroup>
    </VStack>
  );
}

function ConversationPane({
  conversation,
  onClose,
  onReply,
  isFullWidth,
}: {
  conversation: Conversation;
  onClose: () => void;
  /** Hands a filled-in draft up to the composer; see `replyDraft`. */
  onReply: (draft: ComposeDraft) => void;
  /** True when the pane has replaced the list rather than sitting beside it. */
  isFullWidth: boolean;
}) {
  // Named against the subject, because the pane is not the only Archive on
  // screen — every row in the list behind it has one.
  const threadActions = THREAD_ACTIONS.map(action => (
    <IconButton
      key={action.id}
      variant="ghost"
      label={`${action.label} — ${conversation.subject}`}
      tooltip={action.label}
      icon={<Icon icon={action.icon} size="sm" />}
    />
  ));

  return (
    <VStack height="100%">
      {/* Two headers, because the subject and the way out compete for the same
          row and only one surface has room for both.

          Beside the list there is width to spare, so everything is one line:
          subject at the start, the three thread actions and the close button
          at the end.

          Full width, that line is a phone's width and the back control eats
          the front of it — the subject started 96px in and truncated inside
          what was left. So the navigation and the actions take the top row on
          their own and the subject drops beneath them, where it has the whole
          width and can afford a second line. It also lands on the same 16px as
          the page title above it and the avatars below it, which the toolbar's
          own optical inset was pulling it off.

          No `dividers` on either. The subject is the widest, heaviest thing in
          the pane and separates itself from the message under it; a rule as
          well made two lines out of one boundary. */}
      {isFullWidth ? (
        <>
          <Toolbar
            label="Conversation"
            startContent={
              // Nothing is behind the pane to go back to visually, so the
              // dismissal has to name where it leads.
              <Button
                label="Inbox"
                variant="ghost"
                icon={<Icon icon={ArrowLeftIcon} size="sm" />}
                onClick={onClose}
              />
            }
            endContent={threadActions}
          />
          <VStack paddingBlockEnd={3}>
            <Heading
              level={3}
              accessibilityLevel={2}
              // Two lines here where the side-by-side header allows one: on
              // its own row the subject is not setting the header's height
              // against anything else, and most of these fit in two.
              maxLines={2}
              hasTruncateTooltip>
              {conversation.subject}
            </Heading>
          </VStack>
        </>
      ) : (
        /* Outer inset on top of the toolbar's own, and deliberately uneven.

           A Toolbar holds the content line by insetting itself by the
           container's padding less its buttons' intrinsic padding — it expects
           the things on its ends to be buttons, and lets their padding make up
           the difference. It reads that container figure from a CSS custom
           property no template can set, but a plain Stack does not republish
           the property, so a Stack's padding simply adds on top.

           The two ends then need different amounts, because only one of them
           is a button. The title is a Heading with no side bearing at all, so
           it needs the larger share to reach 24px. The close button carries
           its own, so the same amount would push its glyph past the line the
           text is on. 12 and 8 put both on it.

           The top works the same way and lands on the same 24px: the toolbar
           already holds 8 of its own, so 16 here tops it up rather than
           replacing it. The body below starts at 0, so this is the only top
           inset the pane pays — the two used to stack, which is what put the
           title and the tags under it that far apart. */
        <VStack
          paddingBlockStart={4}
          paddingInlineStart={3}
          paddingInlineEnd={2}>
          <Toolbar
            label="Conversation"
            startContent={
              /* A plain h2: the pane's title, directly under the page's h1.
                 It was on the display scale, which is built for hero copy and
                 renders at a size the docsite's own type ramp does not use
                 anywhere else — beside the rest of the page it read as a
                 different document. The heading scale is the one the subject
                 belongs on. */
              <Heading
                level={2}
                // Two lines, then truncate. Cutting a long subject at the
                // first line hid most of what the pane is about; three would
                // start moving the message down far enough to notice between
                // threads, so the tooltip covers the rest.
                maxLines={2}
                hasTruncateTooltip>
                {conversation.subject}
              </Heading>
            }
            endContent={
              <>
                {threadActions}
                <IconButton
                  variant="ghost"
                  label="Close conversation"
                  tooltip="Close"
                  icon={<Icon icon={XMarkIcon} size="sm" />}
                  onClick={onClose}
                />
              </>
            }
          />
        </VStack>
      )}

      <StackItem size="fill">
        {/* Full width, the pane sits inside a `LayoutContent` that is already
            padded — the inset that lines the table's first column up with the
            page. Padding again here would double it, so the pane only pays for
            its own gutters when it is the panel beside the list. */}
        <VStack
          // 24px down the sides and along the bottom. The pane is the reading
          // surface and was wearing the same 16px as the list beside it, which
          // left the message crowded against both edges of the wider of the
          // two.
          //
          // The top is the header's to pay, not this block's. The header sits
          // directly above with no rule between them, so an inset on both read
          // as one gap of their sum and pushed the tags away from the subject
          // they belong to.
          paddingInline={isFullWidth ? 0 : 6}
          paddingBlockStart={0}
          paddingBlockEnd={isFullWidth ? 0 : 6}
          gap={4}
          isScrollable
          height="100%">
          {/* The subject these belong to is up in the header now, so this is
              the first thing in the body. */}
          <HStack gap={2} vAlign="center" wrap="wrap">
            {conversation.priority === 'normal' ? null : (
              <Token
                size="sm"
                color={PRIORITY_COLOR[conversation.priority]}
                label={PRIORITY_LABEL[conversation.priority]}
              />
            )}
            {conversation.tags.map(tag => (
              <Token key={tag} size="sm" label={tag} />
            ))}
          </HStack>

          {/* Every message in the thread, the newest one included and already
              open. There is no separate block for it below — see
              `threadMessages`. */}
          <ThreadHistory conversation={conversation} />

          {/* In the scroll, directly under the last message, rather than
              pinned in a footer. Replying is the thing you do having read to
              the bottom, and a docked bar offers it from the top of a thread
              you have not read yet while spending a permanent strip of the
              pane to do so. Here it arrives exactly when it becomes the
              obvious next move.

              On the same line as the message bodies. These are the end of the
              thread, not a new section under it, so the avatar column carries
              through to them — left at the pane's edge they started a second
              left margin two lines under the first. */}
          <HStack gap={THREAD_HEADER_GAP}>
            <ThreadGutter />
            <HStack gap={2}>
              <Button
                label="Reply"
                variant="primary"
                icon={<Icon icon={ArrowUturnLeftIcon} size="sm" />}
                onClick={() => onReply(replyDraft(conversation, false))}
              />
              <Button
                label="Reply all"
                variant="secondary"
                // Not a second reply arrow. The distinction between these two is
                // who receives it, so the icon that separates them is the one
                // about people.
                icon={<Icon icon={UsersIcon} size="sm" />}
                onClick={() => onReply(replyDraft(conversation, true))}
              />
            </HStack>
          </HStack>
        </VStack>
      </StackItem>
    </VStack>
  );
}

// ============= COMPOSER =============

/**
 * Everybody the inbox has heard from, offered as recipients.
 *
 * `Tokenizer` needs a `SearchSource`, and the file already holds a directory:
 * nine conversations, each with a name and an address. Inventing a second cast
 * of contacts would let the To field disagree with the list behind it.
 */
const RECIPIENTS: SearchableItem[] = CONVERSATIONS.map(item => ({
  id: item.senderEmail,
  label: item.sender,
}));

/**
 * The team's own domain. Anyone on it is us, and a reply is not addressed to
 * us — see `replyDraft`.
 */
const OUR_DOMAIN = '@support.example';

/** What the composer opens with when it is opened from somewhere. */
interface ComposeDraft {
  conversationId: string;
  recipients: SearchableItem[];
  subject: string;
}

/**
 * Turns a thread into the reply to it.
 *
 * Reply goes to whoever wrote the newest message. Reply all adds everyone else
 * who has written in the thread, minus the team's own addresses — including
 * yourself on a reply-all is the classic mail-client bug, and here the rule
 * that avoids it is available: internal senders are the ones on `OUR_DOMAIN`.
 *
 * `Re:` is added only if it is not already there, which several of these
 * subjects arrive with. Threads do not need `Re: Re:`.
 */
function replyDraft(
  conversation: Conversation,
  isReplyAll: boolean,
): ComposeDraft {
  const author: SearchableItem = {
    id: conversation.senderEmail,
    label: conversation.sender,
  };
  const others = (conversation.replies ?? [])
    .filter(
      message =>
        !message.senderEmail.endsWith(OUR_DOMAIN) &&
        message.senderEmail !== conversation.senderEmail,
    )
    // A thread is a conversation, so the same person is usually in it more
    // than once — and each appearance would otherwise become a token.
    .filter(
      (message, index, all) =>
        all.findIndex(other => other.senderEmail === message.senderEmail) ===
        index,
    )
    .map(message => ({id: message.senderEmail, label: message.sender}));

  return {
    conversationId: conversation.id,
    recipients: isReplyAll ? [author, ...others] : [author],
    subject: conversation.subject.startsWith('Re:')
      ? conversation.subject
      : `Re: ${conversation.subject}`,
  };
}

const RECIPIENT_SOURCE: SearchSource = {
  search: (query: string) =>
    RECIPIENTS.filter(person =>
      person.label.toLowerCase().includes(query.toLowerCase()),
    ),
  bootstrap: () => RECIPIENTS,
};

/**
 * The formatting row is scaffolding, and nothing behind it works.
 *
 * These four buttons establish that the surface is a composer and hold the
 * place a real editor's controls would occupy. Core ships no rich-text editor,
 * so the body below is a plain `TextArea` — there is no document model for
 * bold, a link, or an inline image to act on. They carry no `onClick` on
 * purpose: a handler that quietly does nothing is a worse lie than a control
 * that is visibly inert. Replace the `TextArea` first; these become real
 * afterwards, not before.
 */
const COMPOSER_TOOLS: {
  id: string;
  label: string;
  icon: typeof PaperClipIcon;
}[] = [
  {id: 'attach', label: 'Attach files', icon: PaperClipIcon},
  {id: 'link', label: 'Insert link', icon: LinkIcon},
  {id: 'image', label: 'Insert image', icon: PhotoIcon},
  {id: 'emoji', label: 'Insert emoji', icon: FaceSmileIcon},
];

/**
 * The compose sheet.
 *
 * **`BottomSheet hasScrim={false}` keeps this bottom-edge composer non-modal.**
 * With the scrim off the sheet opens with `show()` rather than
 * `showModal()`, so it never enters the top layer, never makes the page inert
 * and never locks body scroll: the inbox behind it stays live. That matters
 * more here than anywhere else in this template, because writing a message is
 * exactly when someone needs to go back and read one — check what a customer
 * actually said, copy an order number out of a thread. A modal composer
 * answers that with "close me first".
 *
 * The trade is bottom-edge geometry, and it is worth naming. A non-modal
 * `Drawer` keeps page context live from an inline edge, but it is a full-height
 * side panel; this composer intentionally rises from the bottom. A sheet's
 * positioner is `inset-inline: 0` with `justify-content: center`, and there is
 * no anchor, side or width prop. So this cannot be docked to the inline-end
 * corner the way a `Dialog` can be. `Dialog` takes a static `position` and would
 * put the window in that corner — but `Dialog` is always modal, so buying the
 * corner costs the live inbox.
 * `ChatComposerDrawer` is a false friend: despite the name it is an in-flow
 * disclosure tray for a ChatComposer's attachments, with no positioning of its
 * own.
 *
 * **`purpose="form"` is doing real work.** The default, `info`, dismisses on a
 * scrim tap *and on a downward swipe*, either of which throws a half-written
 * message away by accident. `form` blocks both and keeps Escape and the close
 * button. It is worth setting even with no scrim to render, because the swipe
 * is still live.
 *
 * Focus is not hand-rolled. The sheet focuses whichever descendant carries
 * `data-autofocus` once it is actually visible — React's own `autoFocus` fires
 * while the dialog is still `display: none` and silently fails, which is why
 * the attribute exists.
 */
function ComposeWindow({
  isOpen,
  onOpenChange,
  draft,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /**
   * A pre-filled draft, or null to open on whatever is already in the window.
   *
   * Identity is the signal, not equality: every Reply press hands over a fresh
   * object, so replying twice to the same thread refills the fields both
   * times. Compose passes null and so keeps the draft in progress, which is
   * the distinction — one of them is starting a specific message, the other is
   * returning to the one you were writing.
   */
  draft: ComposeDraft | null;
}) {
  const [recipients, setRecipients] = useState<SearchableItem[]>([]);
  const [cc, setCc] = useState<SearchableItem[]>([]);
  const [bcc, setBcc] = useState<SearchableItem[]>([]);
  /**
   * Whether the copy fields have been asked for.
   *
   * Separate from whether they hold anyone, because a field someone opened and
   * then thought better of should stay open — collapsing it the moment the
   * last token came out would take the control away mid-edit.
   */
  const [hasCc, setHasCc] = useState(false);
  const [hasBcc, setHasBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const draftConversationId = useRef<string | null>(null);

  // Fill the header from the thread that asked for this. A draft survives
  // closing and reopening the same thread, but none of its recipient-specific
  // state crosses conversations. This must finish before paint: a regular effect
  // would briefly reveal the previous thread's recipients and body while the
  // newly opened sheet waits for its reset.
  useLayoutEffect(() => {
    if (draft == null) {
      return;
    }
    setRecipients(draft.recipients);
    setSubject(draft.subject);
    if (draftConversationId.current !== draft.conversationId) {
      setCc([]);
      setBcc([]);
      setHasCc(false);
      setHasBcc(false);
      setBody('');
    }
    draftConversationId.current = draft.conversationId;
  }, [draft]);

  // Closing keeps the draft: the sheet stays mounted, so reopening finds the
  // message where it was left. Discarding is the separate control that empties
  // it, and that distinction is the reason both exist.
  const discard = useCallback(() => {
    setRecipients([]);
    setCc([]);
    setBcc([]);
    setHasCc(false);
    setHasBcc(false);
    setSubject('');
    setBody('');
    draftConversationId.current = null;
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      // The sheet has no built-in heading to take a name from, so this is not
      // decoration — without it the surface is announced unnamed.
      label="New message"
      // `hug` is `height: fit-content` under a 92dvh ceiling, so the sheet is
      // as tall as the composer and no taller. The fixed budgets are the wrong
      // instrument here: `tall` opened a mostly-empty window over the list this
      // sheet gave up its scrim to keep usable, and `capped` picked a height
      // that had nothing to do with what was in it — the Cc and Bcc rows
      // appear and disappear, so the right height is not a constant.
      //
      // No `snapPoints` with it. A stop is a fraction of the *viewport*, and
      // against a sheet that is only as tall as its contents those either fall
      // outside it or land somewhere arbitrary inside it. Hugging is the
      // cheaper answer to the same problem: there is not much to drag out of
      // the way in the first place.
      height="hug"
      hasScrim={false}
      // The Layout below owns the inset; the sheet adds none of its own.
      padding={0}>
      {/* The grab handle floats over the top edge, out of flow, about 12px
          down. The Layout's own padding is not quite enough to clear it — the
          heading came up level with the pill, four pixels under it — so the
          sheet buys the handle its own band of space before the content
          starts. */}
      <VStack paddingBlockStart={3}>
        <Layout
          // auto, not fill: the sheet is sized by this Layout now rather than
          // the other way round. `fill` would stretch it to a height that
          // `hug` is trying to measure.
          height="auto"
          padding={4}
          defaultHasDividers
          header={
            <Toolbar
              label="Message"
              startContent={<Heading level={2}>New message</Heading>}
              endContent={
                // The sheet draws a grab handle but no close button, and with
                // no scrim there is nothing to tap outside it — which would
                // leave Escape as the only way out, and that is not a control
                // a touch user has.
                <IconButton
                  variant="ghost"
                  label="Close composer"
                  tooltip="Close"
                  icon={<Icon icon={XMarkIcon} size="sm" />}
                  onClick={() => onOpenChange(false)}
                />
              }
            />
          }
          content={
            // 12px, to land on the same line the header and footer already
            // use. Those two render through Section, which insets by 12
            // regardless of the Layout's own padding, while the content area
            // falls back to 16 — so the fields were sitting four pixels inside
            // the heading above them and the Send button below them.
            <LayoutContent padding={3}>
              {/* No visible labels, and no label grid to hold them. A mail
                  header is one of the few forms whose fields are identified by
                  their own contents — "Recipient" in an empty box is the label
                  — and dropping the column moves the address to the left edge
                  where the message under it starts. Every field keeps a `label`
                  for the accessibility tree; `isLabelHidden` is what takes it
                  off screen without taking it away.

                  `gap={2}` rather than the 4 between sections: these rows are
                  one header, not four separate questions. */}
              <VStack gap={2}>
                <Tokenizer
                  label="Recipient"
                  isLabelHidden
                  placeholder="Recipient"
                  searchSource={RECIPIENT_SOURCE}
                  value={recipients}
                  onChange={items => setRecipients(items)}
                  // Mail goes to people outside the directory more often than
                  // not, so typed text has to be able to become a token rather
                  // than being rejected for not matching anything.
                  hasCreate
                  // Stamps data-autofocus, which is what the sheet looks for
                  // once the window is actually visible.
                  //
                  // Deliberately without `hasEntriesOnFocus`: the two together
                  // mean the window can never open without the full directory
                  // hanging over the subject and the message body. A suggestion
                  // list is worth having once there is a query to narrow it;
                  // unprompted it is just the form with a menu on top of it.
                  hasAutoFocus
                  endContent={
                    // Each disappears once it has been used, because it has
                    // nothing left to do — the field it summons is now on
                    // screen and is where copies are managed from. Keeping a
                    // spent button would also make it ambiguous whether
                    // pressing it again adds a second field or removes the
                    // one already there.
                    <>
                      {hasCc ? null : (
                        <Button
                          label="Cc"
                          variant="ghost"
                          size="sm"
                          onClick={() => setHasCc(true)}
                        />
                      )}
                      {hasBcc ? null : (
                        <Button
                          label="Bcc"
                          variant="ghost"
                          size="sm"
                          onClick={() => setHasBcc(true)}
                        />
                      )}
                    </>
                  }
                />
                {hasCc ? (
                  <Tokenizer
                    label="Cc"
                    isLabelHidden
                    placeholder="Cc"
                    searchSource={RECIPIENT_SOURCE}
                    value={cc}
                    onChange={items => setCc(items)}
                    hasCreate
                  />
                ) : null}
                {hasBcc ? (
                  <Tokenizer
                    label="Bcc"
                    isLabelHidden
                    placeholder="Bcc"
                    searchSource={RECIPIENT_SOURCE}
                    value={bcc}
                    onChange={items => setBcc(items)}
                    hasCreate
                  />
                ) : null}
                <TextInput
                  label="Subject"
                  isLabelHidden
                  placeholder="Subject"
                  value={subject}
                  onChange={setSubject}
                />

                <TextArea
                  label="Message"
                  isLabelHidden
                  placeholder="Write your message…"
                  value={body}
                  onChange={setBody}
                  // TextArea has no auto-grow and no height prop, so `rows` is
                  // both the writing area and — now that the sheet hugs — most
                  // of the sheet's height. Eight is a paragraph or two, which
                  // is what a support reply usually is; the field scrolls past
                  // that rather than the window growing to meet it.
                  rows={8}
                  width="100%"
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            // Toolbar rather than a bare row, for the roving tabindex: the
            // whole action row is one Tab stop with arrows moving inside it,
            // instead of six stops between the message body and Discard. Its
            // inline padding comes from the Layout container, so it lines up
            // with the fields above without being told to.
            <Toolbar
              label="Message actions"
              dividers={['top']}
              startContent={
                <>
                  <Button
                    label="Send"
                    variant="primary"
                    icon={<Icon icon={PaperAirplaneIcon} size="sm" />}
                  />
                  {COMPOSER_TOOLS.map(tool => (
                    <IconButton
                      key={tool.id}
                      variant="ghost"
                      label={tool.label}
                      tooltip={tool.label}
                      icon={<Icon icon={tool.icon} size="sm" />}
                    />
                  ))}
                </>
              }
              endContent={
                <IconButton
                  variant="ghost"
                  label="Discard draft"
                  tooltip="Discard draft"
                  icon={<Icon icon={TrashIcon} size="sm" />}
                  onClick={discard}
                />
              }
            />
          }
        />
      </VStack>
    </BottomSheet>
  );
}

// ============= PAGE =============

export default function SupportInboxTemplate() {
  const [category, setCategory] = useState<Category>('inbox');
  /**
   * Which thread the user has picked — `undefined` until they pick one.
   *
   * Three states rather than two, because "nothing is open" and "nothing has
   * been chosen yet" want different things on screen. A two-pane mail client
   * that opens onto an empty pane is showing you its layout instead of your
   * mail, so the unchosen state falls through to the top of the list; but
   * closing the pane has to actually close it, and with only `string | null`
   * the close would be indistinguishable from the initial state and the
   * default would immediately reopen the thread.
   *
   * A derived default rather than a seeded `useState`, because the right
   * default is not knowable at mount: it depends on the category in view and
   * on whether there is a second pane to put it in.
   */
  const [chosenId, setChosenId] = useState<string | null | undefined>(
    undefined,
  );
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  /**
   * What the composer should open filled with, and null once it has been.
   *
   * Cleared on close so that reopening with the Compose button finds the
   * message as it was left rather than being re-addressed from the last thread
   * replied to. The composer only reads this on a change of identity, so
   * clearing it does not empty the fields — see its `draft` prop.
   */
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );

  const startReply = useCallback((draft: ComposeDraft) => {
    setComposeDraft(draft);
    setIsComposeOpen(true);
  }, []);

  const setComposeOpen = useCallback((isOpen: boolean) => {
    setIsComposeOpen(isOpen);
    if (!isOpen) {
      setComposeDraft(null);
    }
  }, []);

  const visible = useMemo(
    () => CONVERSATIONS.filter(item => inCategory(item, category)),
    [category],
  );

  // Static data, so this is computed once rather than per render.
  const unreadCounts = useMemo(unreadByCategory, []);

  // Scoped to `visible`, so select-all means "everything I can currently see"
  // rather than everything in the dataset.
  const {selectionConfig} = useTableSelectionState<Conversation>({
    data: visible,
    idKey: 'id',
    selectedKeys,
    setSelectedKeys,
  });

  const reveal = useContainerReveal();

  const [surfaceRef, surfaceWidth] = useSurfaceWidth();

  // Nothing measured yet — server render, or the tick before the layout effect
  // runs. Assume the roomy case: guessing "narrow" would open on the phone
  // layout and snap out of it, which is the more startling of the two wrong
  // first frames.
  const isMeasured = surfaceWidth > 0;
  const isSingleSurface = isMeasured && surfaceWidth < SINGLE_SURFACE_BELOW;

  /**
   * The thread on screen: whatever was chosen, or the default when nothing has
   * been.
   *
   * The default is the top of the list on a split layout and nothing at all on
   * a single surface, where opening a thread means replacing the list — a
   * phone that loads straight into somebody's first message has skipped the
   * screen the user came for.
   */
  const defaultOpenId = isSingleSurface ? null : (visible[0]?.id ?? null);

  /**
   * A chosen thread only counts while it is still in the queue on screen.
   *
   * Switching category filters the list but says nothing about the pane, so a
   * thread opened from Escalations would sit there while Resolved is in front
   * of you — and the pane's own archive and delete would act on it. Falling
   * back to the default re-derives the pane from the category, so the two
   * cannot disagree about which queue you are in.
   *
   * An explicit close still wins: `null` means the user shut the pane, and
   * changing category is no reason to reopen it.
   */
  const openId =
    chosenId === null
      ? null
      : chosenId !== undefined && visible.some(item => item.id === chosenId)
        ? chosenId
        : defaultOpenId;

  const openConversation = visible.find(item => item.id === openId) ?? null;

  const isPaneFullWidth = isSingleSurface && openId != null;

  /**
   * The movable boundary between the list and the pane.
   *
   * Single-region, because there is one boundary here and the list is not a
   * sized region at all — it is whatever `LayoutContent` has left over. No
   * `snaps`, which are not magnetism but the only positions the panel may rest
   * at, and no `collapsible`, because both halves have to stay on screen.
   *
   * `defaultSize` is a rough first guess and not the real split. The hook
   * takes its default once, on the first render, before the surface has been
   * measured — and a percentage there is no better, because the hook resolves
   * one against `window.innerWidth`, which is the very measurement this
   * template cannot trust. The real answer arrives just below, as soon as
   * there is a surface width to take a share of.
   */
  // Set by the hook whenever the boundary moves, and read to tell the two
  // reasons it can move apart: the placement below, or the handle. Only the
  // handle is the user choosing a split, and only that ends the placement.
  const hasUserMovedPane = useRef(false);
  const isPlacingPane = useRef(false);
  const onPaneSizeChange = useCallback(() => {
    if (isPlacingPane.current) {
      return;
    }
    hasUserMovedPane.current = true;
  }, []);

  const pane = useResizable({
    defaultSize: '58%',
    minSize: PANE_MIN_WIDTH,
    // Everything the surface has, less the list's floor — so the ceiling
    // tracks the screen and the list keeps its whole range on any of them,
    // stacked rows included.
    //
    // Floored at the minimum, because a ceiling below the floor is not a
    // narrower range but an inverted one, and the hook clamps low then high —
    // so the max wins and every request lands on it. On a surface too small to
    // seat both halves that turned the pane into a sliver instead of the
    // largest pane that still fits. The layout that is actually right down
    // there is the single-surface one, which `isPaneFullWidth` takes over
    // before this is on screen.
    maxSize: isMeasured
      ? Math.max(PANE_MIN_WIDTH, surfaceWidth - LIST_MIN_WIDTH)
      : undefined,
    onSizeChange: onPaneSizeChange,
  });

  // Land the pane on its share of the surface, and keep it there until the
  // handle is used.
  //
  // Following the surface rather than latching on the first measurement is
  // what makes the opening split survive being measured early: a card in the
  // catalog, a dialog mid-animation and a pane in a split editor can all
  // report a width that is real for one frame and wrong for the rest of the
  // session, and a latch has no way to tell that from a settled one. Once the
  // handle has moved, the split is the user's answer and nothing here
  // overrides it — which is the property the latch was there to protect.
  const {resize: resizePane} = pane;
  useLayoutEffect(() => {
    if (hasUserMovedPane.current || !isMeasured) {
      return;
    }
    isPlacingPane.current = true;
    resizePane(Math.round(surfaceWidth * PANE_DEFAULT_SHARE));
    isPlacingPane.current = false;
  }, [isMeasured, surfaceWidth, resizePane]);

  // Whether the rows stack is a question about the table, not the surface and
  // certainly not the window. A reading pane holding the majority of a wide
  // page leaves the table narrow long before anything else is narrow, so the
  // table's own width is what gets asked.
  //
  // Measured, not `surfaceWidth - pane.size`. That subtraction looks like it
  // says the same thing and does not: `pane.size` is the resizable's *model*
  // of the pane, which starts life as the `'58%'` string below and only
  // becomes a pixel count once something has resized it. Until then the term
  // is not in the same units as `surfaceWidth`, the difference comes out as
  // the full surface, and a 330px list confidently reports itself wide enough
  // for columns. Reading the element settles it — the list is a box on the
  // page and its width is observable, so observe it.
  const [listRef, measuredListWidth] = useSurfaceWidth();
  const listWidth = measuredListWidth;
  const isListMeasured = listWidth > 0;
  const isStacked = isListMeasured && listWidth < STACK_ROWS_BELOW;
  const isTight = isListMeasured && listWidth < TIGHTEN_COLUMNS_BELOW;

  // Touch never hovers, so the reveal shows the actions permanently there.
  // Overlaying content that never goes away is not a swap, it is a deletion.
  //
  // `hover: none` and not `any-pointer: coarse`. The question being asked is
  // whether the primary input can hover, and `any-pointer` answers a different
  // one — whether *some* attached input is coarse — which is true of a laptop
  // with a touchscreen, a desktop with a tablet plugged in, and any browser
  // with touch emulation on. All of those have a mouse, so all of them were
  // getting the permanent-actions layout and losing both the timestamp and the
  // hover swap for no reason. `hover` is the media feature that describes the
  // capability actually in question.
  const isTouch = useMediaQuery('(hover: none)');

  const handleOpen = useCallback((item: Conversation) => {
    setChosenId(item.id);
  }, []);

  const rowStatus = useTableRowStatus<Conversation>({
    getStatus: useCallback(
      (item: Conversation) =>
        item.isUnread ? {color: 'accent' as const, label: 'Unread'} : null,
      [],
    ),
  });

  const selection = useTableSelection<Conversation>({
    ...selectionConfig,
    getRowLabel: item => `conversation from ${item.sender}`,
    // The open row already owns the row background; two washes would fight.
    hasRowHighlight: false,
  });

  const rows = useInboxRows({
    openId,
    onOpen: handleOpen,
    getContainerProps: reveal.getContainerProps,
  });

  const columns = useMemo((): TableColumn<Conversation>[] => {
    const rowActions = isStacked ? NARROW_ROW_ACTIONS : ROW_ACTIONS;

    const received: TableColumn<Conversation> = {
      key: 'receivedAt',
      header: 'Received',
      // No wider than whichever of the two is actually in the cell. Wider is
      // the empty gap this layout exists to remove; narrower clips, because a
      // `truncate` table hides each cell's overflow.
      width: pixel(trailingWidth(rowActions.length, isTouch)),
      align: 'end',
      renderCell: item => (
        <ReceivedCell
          item={item}
          actions={rowActions}
          reveal={reveal}
          isOverlaid={!isTouch}
        />
      ),
    };

    if (isStacked) {
      // Stacked, the row stops being tabular, and the columns that were
      // holding sender, subject and tags in the same place on every row have
      // nothing left to align. What survives is the pair that identifies a
      // thread — sender over subject — and the time. The preview is what goes:
      // the pane is one click away and reprints it in full, while a subject
      // lost to truncation is not recoverable from anywhere on screen.
      //
      // The avatar goes with the columns. The status gutter and the checkbox
      // already own the row's leading edge, and a third leading element costs
      // the two lines it decorates about thirty pixels while naming a sender
      // the text names again a few pixels to its right.
      //
      // Both plugin columns stay. They are 28px and 36px, they are the only
      // things in the row that are not text, and dropping either removes a
      // capability rather than a decoration — the gutter is the unread signal
      // the whole queue is scanned by, and without the checkbox the header's
      // bulk-action mode becomes unreachable.
      return [
        {
          key: 'conversation',
          // The header cannot be dropped: data mode renders one whenever
          // columns are defined, and going headerless means hand-composing the
          // rows, which loses the selection and row-status plugins outright.
          // So it collapses to the one label still true of the column under it
          // rather than naming a structure that is gone.
          header: 'Conversation',
          width: proportional(1, {minWidth: 160}),
          renderCell: item => (
            <VStack gap={0.5}>
              <Text maxLines={1} weight={item.isUnread ? 'semibold' : 'normal'}>
                {item.sender}
              </Text>
              {/* Body size, not `supporting`. Stacked, these two lines are the
                  whole row, and the subject is the half of them people
                  actually read — dropping it to 12px made the thing being
                  triaged smaller than the name attached to it. Secondary
                  colour is enough to keep the sender first. */}
              <Text maxLines={1} color="secondary">
                {item.subject}
              </Text>
            </VStack>
          ),
        },
        received,
      ];
    }

    const all: TableColumn<Conversation>[] = [
      {
        key: 'sender',
        header: 'From',
        width: pixel(190),
        renderCell: item => (
          <HStack gap={2} vAlign="center">
            <Avatar name={item.sender} size="sm" tooltip={false} />
            <Text maxLines={1} weight={item.isUnread ? 'semibold' : 'normal'}>
              {item.sender}
            </Text>
          </HStack>
        ),
      },
      {
        key: 'subject',
        header: 'Subject',
        width: proportional(3),
        renderCell: item => (
          <HStack gap={2} vAlign="center">
            {/* `static` is what makes the subject win. Both children shrink
                by default and in proportion to their content, so the longer
                preview was keeping width the subject had already lost.
                Pinning the subject to its intrinsic size leaves the preview
                as the only thing that can give. */}
            <StackItem size="static">
              <Text maxLines={1} weight={item.isUnread ? 'semibold' : 'normal'}>
                {item.subject}
              </Text>
            </StackItem>
            <StackItem size="fill">
              <Text maxLines={1} color="secondary">
                — {item.preview}
              </Text>
            </StackItem>
          </HStack>
        ),
      },
      {
        key: 'tags',
        header: 'Tags',
        width: pixel(200),
        renderCell: item => (
          /* Tokens truncate to nonsense when a fixed column runs out of room
             ("Escal…", "Webho…"). OverflowList measures instead: it shows the
             ones that fit whole and collapses the rest to a count, so a tag is
             either readable or honestly absent. `observeParent` because the
             list itself is content-sized — it has to watch the cell. */
          <OverflowList
            gap={1}
            behavior="observeParent"
            overflowRenderer={hidden => (
              <Token
                size="sm"
                label={`+${hidden.length}`}
                // The count is meaningless to a screen reader on its own, and
                // each hidden Token is keyed by its own label, so the names
                // are already here.
                description={hidden
                  .map(entry => entry.child.key)
                  .filter(Boolean)
                  .join(', ')}
              />
            )}>
            {item.priority === 'normal' ? null : (
              <Token
                key={item.priority}
                size="sm"
                color={PRIORITY_COLOR[item.priority]}
                label={PRIORITY_LABEL[item.priority]}
              />
            )}
            {item.tags.map(tag => (
              <Token key={tag} size="sm" label={tag} />
            ))}
          </OverflowList>
        ),
      },
      received,
    ];

    // Tags are the first thing worth losing — the subject is what people scan.
    // Keyed off the table's width rather than off whether the pane is open,
    // because the pane is only one of the things that can take the width: a
    // 760px window with no pane at all leaves the subject just as short.
    return isTight ? all.filter(column => column.key !== 'tags') : all;
  }, [isStacked, isTight, isTouch, reveal]);

  // Stacked, the checkbox column goes. It is 36px of a roughly 300px table, it
  // sits in front of the one column that is carrying both the sender and the
  // subject, and multi-select is not what a narrow surface is for — every mail
  // client on a phone puts bulk selection behind an explicit "edit" mode
  // rather than parking a checkbox on every row.
  //
  // Keys already selected are kept rather than cleared, so widening restores
  // exactly what was there. The cost is that the selection is briefly
  // invisible, which is why `hasSelection` is gated too: a bulk-action bar
  // naming a count the user cannot see or amend is worse than no bar.
  // Annotated, because inference widens the two branches into a union whose
  // narrow arm carries `selection?: undefined` — which the plugin record's
  // index signature rejects.
  const tablePlugins: Record<string, TablePlugin<Conversation>> = isStacked
    ? {rowStatus, rows, gutter: ALIGN_STATUS_GUTTER}
    : {selection, rowStatus, rows, gutter: ALIGN_STATUS_GUTTER};

  // Counted against the visible queue rather than the raw set, for the same
  // reason the pane re-derives: ticks made in Escalations must not still be
  // armed once Resolved is the list on screen. The set itself is left alone,
  // so switching back finds the selection where it was.
  const selectedCount = visible.filter(item =>
    selectedKeys.has(item.id),
  ).length;
  const hasSelection = selectedCount > 0 && !isStacked;
  const unreadCount = CONVERSATIONS.filter(item => item.isUnread).length;

  return (
    <>
      <Layout
        ref={surfaceRef}
        height="fill"
        header={
          /* No padding on the header itself: the tab strip's own rail is the
             line above the table now, and a rail has to sit directly on what
             it divides, which the header's bottom padding would prevent. So
             the padding moves down onto the rows that still want it.

             `hasDivider` then only has work to do in the one state that has no
             rail to inherit — the full-width pane, which drops the tabs.
             Leaving it on unconditionally would double the line everywhere
             else. */
          <LayoutHeader hasDivider={isPaneFullWidth} padding={0}>
            <VStack gap={0}>
              <HStack gap={3} vAlign="center" wrap="wrap" padding={4}>
                <StackItem size="fill">
                  <VStack gap={0.5}>
                    <Heading level={1}>Inbox</Heading>
                    <Text type="supporting">
                      {unreadCount} unread of {CONVERSATIONS.length}{' '}
                      conversations
                    </Text>
                  </VStack>
                </StackItem>
                <Button
                  label="Refresh"
                  variant="ghost"
                  icon={<Icon icon={ArrowPathIcon} size="sm" />}
                />
                {/* Compose belongs on this row rather than down with the tabs.
                    Starting a message is unconditional — as true with nine
                    rows selected as with none, and true of every bucket — so
                    it sits beside Refresh in the row that never changes rather
                    than in the one that reacts to selection. That row's
                    existing `wrap` already handles narrow. */}
                <Button
                  label="Compose"
                  variant="primary"
                  icon={<Icon icon={PencilSquareIcon} size="sm" />}
                  onClick={() => setIsComposeOpen(true)}
                />
              </HStack>

              {/* Nothing here applies to a conversation, so when the pane has
                  taken the whole surface the row goes with the list. */}
              {isPaneFullWidth ? null : hasSelection ? (
                /* In the strip's place, not above it. Stacking the two was
                   costing a row of height the moment a checkbox was ticked,
                   which moved the table out from under the pointer that had
                   just clicked it — and moved it back on untick. Swapping in
                   place keeps the table still, which matters more here than
                   keeping the tabs visible: acting on a selection is a
                   deliberate, short-lived mode, and the bucket you are in is
                   still named by the heading above and the rows themselves.
                   Clearing the selection puts the tabs straight back.

                   The band itself is `table-filter`'s, down to the muted fill,
                   the radius and the `@starting-style` rise on entry, and it
                   runs full-bleed there too — so it lands on exactly the
                   footprint the tab strip's rail just vacated. The fill is
                   what separates it from the rows, which is why nothing draws
                   a rule under it.

                   The *slot* is pinned to `SELECTION_BAR_HEIGHT`, and only the
                   slot: that is the part the table can feel, so that is the
                   part that must not move. The band inside it is free to be
                   taller than the strip it replaces — 8px above and below the
                   buttons, which is what stops a bar made of ghost buttons
                   from reading as a row of loose glyphs — and the surplus is
                   sent upward by aligning it to the bottom of the slot, so it
                   laps into the header's own padding rather than over the
                   first row. Bottom-aligned rather than centred for that
                   reason alone; centring would split the overflow and put half
                   of it on the table. */
                <VStack
                  height={SELECTION_BAR_HEIGHT}
                  vAlign="end"
                  paddingBlockEnd={0.5}>
                  <Section
                    variant="muted"
                    paddingInline={3}
                    paddingBlock={2}
                    xstyle={[styles.bulkBand, styles.bulkBandEnter]}>
                    <HStack gap={3} vAlign="center" minHeight={28}>
                      <StackItem size="fill">
                        <HStack gap={1} vAlign="center">
                          {ROW_ACTIONS.filter(
                            action => action.id !== 'reply',
                          ).map(action => (
                            <Button
                              key={action.id}
                              label={action.label}
                              variant="ghost"
                              size="sm"
                              icon={<Icon icon={action.icon} size="sm" />}
                            />
                          ))}
                        </HStack>
                      </StackItem>

                      {/* Grouped so the separator cannot strand itself at the
                          end of a line once the actions grow wide. */}
                      <HStack gap={3} vAlign="center">
                        <Text type="body">
                          {selectedCount}{' '}
                          {selectedCount === 1
                            ? 'conversation'
                            : 'conversations'}{' '}
                          selected
                        </Text>
                        <Text type="supporting" color="secondary">
                          •
                        </Text>
                        <Button
                          label="Unselect All"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedKeys(new Set())}
                        />
                      </HStack>
                    </HStack>
                  </Section>
                </VStack>
              ) : (
                <>
                  {/* Tabs, not a SegmentedControl, because these are places
                      rather than filters — a thread has one standing at a
                      time, and switching moves you rather than narrowing what
                      you had. That is also what makes the badges meaningful: a
                      count on "Unread" would have restated the tab's own name,
                      while a count on "Escalations" says how much of that pile
                      is new.

                      `role="tablist"` is deliberately *not* set. That role
                      promises the WAI-ARIA tabs pattern, where each tab points
                      at the panel it controls and the panel switches in place;
                      the list here is a single table whose contents change,
                      with no per-tab panel to point `panelId` at. Left unset,
                      the strip is a nav landmark marking the current bucket
                      with `aria-current`, which is what this actually is. */}
                  {/* The 4px inset is what puts the tabs on the content line.
                      A Tab carries 12px of its own inline padding, so a strip
                      flush to the edge would start its first *label* at 12
                      while the heading above starts at 16. Inset the strip by
                      the 4px difference and the label lands on 16 with it, at
                      the cost of the rail stopping 4px short of each edge. */}
                  <VStack paddingInline={1}>
                    <TabList
                      hasDivider
                      value={category}
                      onChange={value => setCategory(value as Category)}>
                      {CATEGORIES.map(option => {
                        const unread = unreadCounts[option.value];
                        return (
                          <Tab
                            key={option.value}
                            value={option.value}
                            label={option.label}
                            endContent={
                              // No zero badges. A badge is a call to look; one
                              // reading "0" is a call to look at nothing, and
                              // four of them turn the strip into noise the eye
                              // learns to skip.
                              unread === 0 ? undefined : (
                                <Badge
                                  // Grey, not blue. An unread count is the
                                  // normal condition of a mailbox, not a status
                                  // anyone has to act on, and four coloured
                                  // pills across the strip read as four alerts.
                                  // Neutral keeps the number legible and lets
                                  // the row's own unread dot stay the only
                                  // accent-coloured thing in the list.
                                  variant="neutral"
                                  // The count alone is what a badge is supposed
                                  // to be, and spelling it out made a pill wider
                                  // than the tab it belonged to. But a bare "1"
                                  // announces as "Inbox 1", which is not a fact
                                  // about anything. Badge takes a node and has
                                  // no separate label prop, so the word rides
                                  // along inside it, out of sight.
                                  label={
                                    <>
                                      {unread}
                                      <VisuallyHidden> unread</VisuallyHidden>
                                    </>
                                  }
                                />
                              )
                            }
                          />
                        );
                      })}
                    </TabList>
                  </VStack>
                </>
              )}
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent ref={listRef} padding={4} isScrollable>
            {isPaneFullWidth && openConversation != null ? (
              <ConversationPane
                conversation={openConversation}
                onClose={() => setChosenId(null)}
                onReply={startReply}
                isFullWidth
              />
            ) : visible.length === 0 ? (
              <VStack padding={6}>
                {/* An empty bucket is a normal, often good state — nothing
                    waiting on a customer is a cleared queue, not a failed
                    filter — so this says the bucket is empty rather than that
                    a search found nothing, and the way out goes back to the
                    tab that always has something in it. */}
                <EmptyState
                  title="Nothing here"
                  description="No conversations in this category."
                  icon={<Icon icon={InboxIcon} size="lg" />}
                  actions={
                    <Button
                      label="Go to Inbox"
                      variant="secondary"
                      onClick={() => setCategory('inbox')}
                    />
                  }
                />
              </VStack>
            ) : (
              <Table
                data={visible}
                columns={columns}
                idKey="id"
                // Key order here is not pipeline order: Table sorts first-party
                // plugins into a canonical sequence and appends the rest. Only
                // `selection` is in that sequence, so it prepends its checkbox
                // first and `rowStatus` prepends outside it — the unread dot
                // lands at the left edge, where Apple Mail and Notion Mail put
                // it. Rewriting this record will not change that.
                plugins={tablePlugins}
                density="balanced"
                dividers="none"
                hasHover
                textOverflow="truncate"
              />
            )}
          </LayoutContent>
        }
        end={
          isSingleSurface || openConversation == null ? undefined : (
            <>
              {/* The handle comes before the panel, because the panel is in
                `end` and the boundary it drags is the panel's inline-START
                edge. `isReversed` is the other half of that: the hook grows a
                region as the pointer travels toward inline-end, and this one
                grows as the pointer travels the other way — without it,
                dragging left narrows the pane it is meant to widen.

                `hasDivider` moves here from the panel. LayoutPanel's own
                divider and the handle's are the same 1px line in the same
                place, so leaving it on both draws it twice.

                `pillPlacement` is the offset: the grip is anchored to the
                divider and pushed a grip-width clear of it, and the grab zone
                travels with it rather than staying on the line. `end` puts
                both over the pane's padding instead of over the list's
                timestamp column. */}
              <ResizeHandle
                direction="horizontal"
                isReversed
                hasDivider
                pillPlacement="end"
                resizable={pane.props}
                label="Resize conversation pane"
              />
              <LayoutPanel
                resizable={pane.props}
                padding={0}
                // Without a role the label is announced by nothing; with it the
                // pane becomes a landmark a screen reader can jump straight to.
                role="complementary"
                label="Conversation">
                <ConversationPane
                  conversation={openConversation}
                  onClose={() => setChosenId(null)}
                  onReply={startReply}
                  isFullWidth={false}
                />
              </LayoutPanel>
            </>
          )
        }
      />
      {/* Rendered outside the Layout because `showModal()` puts the window in
        the browser's top layer — its position in the tree is irrelevant to
        where it lands. Kept mounted rather than conditionally rendered so
        Dialog's close branch can hand focus back to the Compose button, and so
        an unsent draft survives being closed. */}
      <ComposeWindow
        isOpen={isComposeOpen}
        onOpenChange={setComposeOpen}
        draft={composeDraft}
      />
    </>
  );
}
