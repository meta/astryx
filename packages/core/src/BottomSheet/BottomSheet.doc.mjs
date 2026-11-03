// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheet.doc.mjs
 * @input BottomSheet props, sheet anatomy, and focus-time keyboard scrolling behavior
 * @output Consumer documentation and examples for BottomSheet
 * @position CLI and rendered component documentation
 */

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Sheet panel',
    required: true,
    description:
      'Painted surface that rises from the bottom edge and contains the sheet.',
  },
  {
    name: 'Content area',
    required: true,
    description:
      'Padded, scrollable container that presents the caller-provided sheet content.',
  },
  {
    name: 'Handle',
    required: true,
    description:
      'Decorative grab affordance and drag region at the top of the panel.',
  },
  {
    name: 'Scrim',
    required: false,
    description:
      'Backdrop that dims and blocks the page in a scrim-backed presentation.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'BottomSheet',
  displayName: 'Bottom Sheet',
  group: 'BottomSheet',
  category: 'Overlay',
  keywords: [
    'bottom sheet',
    'sheet',
    'mobile',
    'touch',
    'drag',
    'swipe',
    'snap point',
    'detent',
    'resize',
    'dismiss',
    'grab handle',
    'dialog',
    'overlay',
    'modal',
    'form',
    'mobile keyboard',
    'visual viewport',
  ],
  playground: {
    overlay: true,
    defaults: {
      isOpen: false,
      label: 'Filters',
      height: 'hug',
      children: {
        __element: 'Section',
        props: {padding: 4},
        children: {
          __element: 'VStack',
          props: {gap: 2},
          children: [
            {
              __element: 'Heading',
              props: {level: 3},
              children: 'Filters',
            },
            {
              __element: 'Text',
              props: {type: 'body'},
              children: 'Adjust the properties below, then open the preview.',
            },
          ],
        },
      },
    },
  },
  theming: {
    container: true,
    targets: [{className: 'astryx-bottom-sheet', visualProps: []}],
    derived: [{property: 'padding', expand: 'container'}],
  },
  description:
    "A mobile touch sheet that rises from the bottom edge, with animated entrance and exit, a grab handle, optional drag-to-resize snap points, and purpose-controlled dismissal. Like Dialog, it is a padded container: content starts at the theme's bottom-sheet padding (--spacing-4 by default), and a lone Section child or bleed children such as Table and Divider align against it. A sheet always owns a native <dialog>; inside the deprecated BottomSheetSwitcher the switcher presents and closes that dialog as the flow moves between steps. In both modes, ref and shared DOM props target the visual panel <div>. Sheets stack: a sheet opened while another is open sits on top of it, the covered sheet stays mounted and recedes, and one scrim covers the page. A sheet that closes as another opens in the same update is replaced by it, with the step-to-step handoff a multi-step flow needs.",
  props: [
    {
      name: 'isOpen',
      type: 'boolean',
      description:
        'Whether a standalone sheet is open. Fully controlled; pair with onOpenChange. Omitted only inside the deprecated BottomSheetSwitcher, which drives its steps itself.',
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description:
        'For a standalone sheet, called when it requests an open-state change. Automatic calls follow purpose: info dismisses on Escape, scrim click, or swipe; form dismisses on Escape only; required never dismisses implicitly. Omitted only inside the deprecated BottomSheetSwitcher, which drives its steps itself.',
    },
    {
      name: 'finalFocusRef',
      type: 'RefObject<HTMLElement | null>',
      description:
        'Optional explicit focus-return target for a standalone sheet. Use when the opener can remount or the active element is not a reliable trigger, such as an adaptive presentation switch. Always focused when the sheet closes on its own or last; when a modal sheet is still open beneath, focus returns into that sheet (to this element if it is inside it, else the revealed panel). Omitted only inside the deprecated BottomSheetSwitcher, which drives its steps itself.',
    },
    {
      name: 'purpose',
      type: "'required' | 'form' | 'info'",
      description:
        "Controls implicit dismissal behavior, matching Dialog. info allows Escape, scrim click, and swipe-to-dismiss. form protects entered data by blocking scrim click and swipe while allowing Escape. required blocks every implicit dismissal path and uses role='alertdialog'. Explicit controls may still update the controlled state. Works for standalone and BottomSheetSwitcher-managed sheets.",
      default: "'info'",
    },
    {
      name: 'sheetId',
      type: 'string',
      description:
        'Deprecated with BottomSheetSwitcher: give each step its own standalone sheet with isOpen instead. Still works as released: the unique ID of this sheet inside a BottomSheetSwitcher, which opens it when activeSheet matches; omit isOpen and onOpenChange when sheetId is used.',
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible label for the sheet. Required; the sheet has no built-in heading to derive a name from.',
      required: true,
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        "Sheet content in a scrollable area. The named body is keyboard reachable while overflowing. Forward Tab entry may move directly to the first native link or button; input controls, composite widgets, and nested scroll areas retain the body stop. Shift+Tab from a delegated first child skips the body. Fitting content adds no body stop. The internal observed content box preserves block flow and percentage heights. If it includes a text-entry control that can bring up the mobile keyboard, use height='tall' and keep the sheet fully expanded while editing.",
      required: true,
    },
    {
      name: 'padding',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description:
        'Internal padding of the sheet content using the spacing scale, matching Dialog. When omitted, uses the theme default for bottom sheets (--spacing-4 unless the theme sets padding on bottom-sheet). A lone Section child escapes the padding, and bleed children such as Table and Divider compensate against it. Use 0 for edge-to-edge content that supplies its own inset.',
    },
    {
      name: 'height',
      type: "'hug' | 'capped' | 'tall' | number | string",
      description:
        "How tall the sheet is. Named budgets: 'hug' fits its content up to 92% of the viewport, 'capped' is a scrolling mid-height panel (~62%), and 'tall' is a pinned near-full panel (~92%) for content that streams in. Or pass a number (px) / CSS length for a custom budget. Give snapPoints to let the user drag between heights. On shorter viewports the sheet fills the available height. Only a fully expanded 'tall' sheet provides mobile-keyboard accommodation: it stays put and scrolls each focused control above the keyboard. Hug, Capped, numeric and CSS-length heights never do, and a Tall sheet stops doing it the moment the user drags it to a shorter detent, resuming when they drag it back. Outside that state the sheet neither moves nor adds keyboard scroll space, and the browser's own focus reveal is left in place; on iOS that reveal can shift the whole page.",
      default: "'capped'",
    },
    {
      name: 'snapPoints',
      type: 'ReadonlyArray<number | string>',
      description:
        "Extra heights the sheet can rest at when dragged; its own height is always the tallest stop, and omitting this gives a sheet that only opens and closes. Each stop is the sheet's visible height: a number is a viewport fraction (0.5 is half the screen), '50%' the same in CSS, '320px' an absolute length. A stop of a quarter of the sheet or less is a peek: it slides away instead of reflowing, and thins the scrim.",
    },
    {
      name: 'hasScrim',
      type: 'boolean',
      description:
        "For a standalone BottomSheet, whether to render a scrim, the semi-transparent overlay that covers and blocks the background. true (default) uses showModal(): top layer, native focus containment, ::backdrop scrim, body scroll lock, and tap-scrim-to-dismiss when purpose='info', with the background inert. A scrim sheet also takes part in stacking (see Stacking below). false presents the sheet in the top layer as a manual popover (below the Popover API support floor, show() in page stacking order as a reduced fallback) with no scrim, no focus trap and no scroll lock, leaving the page behind interactive and scrollable; a no-scrim sheet neither stacks nor is stacked on, but no-scrim steps replace each other with the same handoff. A no-scrim sheet shown while a modal (a scrim sheet or a Dialog) that does not contain it is open is inert under that modal and stays beneath it (show(), no page-level z-index) until that modal has gone, then enters the top layer; a modal mid-exit counts as gone, and rendered inside the modal the sheet enters the top layer at once. In a multi-step flow, set hasScrim the same on every step.",
      default: 'true',
    },
  ],
  usage: {
    anatomy,
    description:
      "A mobile touch surface for filters, actions, forms, and detail views that should rise from the bottom of the viewport. For a multi-step flow, give each step its own sheet and one state value that names the open step (see Replacing a sheet); open a second sheet over the first when a step should stay visible beneath it.\n\nStacking. Every sheet keeps its own isOpen. Open a sheet while another scrim sheet is open and it stacks on top: the sheet beneath stays mounted with its scroll position and inputs, recedes behind the new one (the nearest covered sheet shrinks to 0.96 and lifts 8px, deeper ones to 0.92 and 16px), and is blocked from pointer, keyboard, and assistive technology by the top sheet's modal dialog. The sheets can be siblings, live in separate components, sit inside another sheet's content, or sit inside a BottomSheetSwitcher step; a whole switcher is one level, and switching its step in place does not change its position. Nothing moves in the DOM: each sheet's dialog stays where it is written, and no wrapper component is needed.\n\nOrder is open order. The top sheet is the one presented most recently that is still open; a sheet that closes and reopens comes back on top. When several sheets open in one update (a deep link into a flow), there is no open order between them, so tree order decides: a sheet below the sheets rendered in its content, siblings in the order they are written. That order is right in the first painted frame.\n\nOne scrim. Only the bottom sheet's backdrop dims the page; the backdrops of the sheets above it are transparent, so a stack never darkens per level. The dim holds steady while sheets push and pop, and if the bottom sheet closes while sheets remain above it, the next sheet's backdrop takes over in the same frame.\n\nDismissal. Escape, a tap on the scrim, a downward swipe, and a platform close request (Android back, a close watcher) reach only the top sheet, through that sheet's own onOpenChange, and that sheet's purpose applies: required blocks all of them, form blocks the scrim and the swipe. Nothing closes a whole stack at once; set every sheet closed in one update when a flow is done and they leave together.\n\nClosing a covered sheet from code. Sheets rendered inside the closing sheet's content are part of it: they are presented only while it is open and leave with it. Their isOpen stays yours, as with a Dialog rendered in a closed Dialog: nothing is written to it, and a nested sheet that is still open when its host reopens is presented again, on top. Set it closed yourself when the flow is done. Sheets above the closing sheet that are not in its content stay open and keep their order; the closing sheet slides out from beneath them, and if it owned the scrim, the sheet above takes it over.\n\nReplacing a sheet. Close the top sheet and open another in the same update (one state value that names the open step does this) and the new sheet replaces it instead of stacking on it: the new sheet rises above the one it replaces; if the replaced sheet is taller it moves down to meet the new sheet's top edge at the same time; the replaced sheet fades only after both motions finish, and is inert and hidden from assistive technology from the start. The scrim holds steady throughout, with no dip; focus moves into the new sheet; and when the flow closes, focus returns to the element that opened its first sheet, whichever sheet closed last. This is the handoff the deprecated BottomSheetSwitcher ran between its steps; a multi-step flow needs no switcher: give each step its own BottomSheet and one state value. A replace happens only when exactly one sheet closes and one opens in the update, the closing sheet was the top sheet of its stack, and the move was made from inside it (the control last pressed, or with no recent press the focused element, was in the closing sheet, as a step's own Continue or Back button is); a covered sheet closing while a sheet opens, a close and an open in different updates, or a close and an open driven from a control outside the closing sheet (two unrelated owners acting at once) keep the ordinary push and pop motion and their own focus return. A replace over an open stack runs one level up and leaves the sheets beneath covered. Non-modal sheets (hasScrim={false}) replace each other the same way, with no scrim: they are hosted in the browser top layer as manual popovers, so the entering step orders above the retained one with no page-level z-index, and toasts raised before or while the sheet is open stay above it. Below the Popover API support floor (Tier 2 in the browser support guide) the sheet falls back to show() in page stacking order: usable, but with no promise over later page content. A non-modal sheet returns focus to its opener on close only while focus is still inside it; focus taken elsewhere on the live page stays there.\n\nFocus. Opening a sheet moves focus into it, wherever the engine's native dialog focusing steps land: the panel in Chromium, the first focusable control in Firefox (a data-autofocus field only when it comes first). A step entering as a replacement focuses a data-autofocus descendant first, so a flow that opens on a field keeps the keyboard on it. Closing the top sheet returns focus into the sheet it reveals: to the control that opened it when that control is still there, otherwise to the revealed sheet's panel. When the last sheet closes, the standalone rules apply: finalFocusRef, else the element that opened the sheet, with a focus ring only after keyboard input. When every sheet of a stack closes in one update, focus returns once, to the bottom sheet's finalFocusRef or opener, after the last dialog has closed.\n\nCaveats. A Dialog, AlertDialog, or Popover opened from a sheet paints above the sheet and does not make it recede; a sheet opened from inside that Dialog paints above the Dialog and stacks over the sheet beneath. Sheets with hasScrim={false} stay out of the stack entirely (they replace each other, but never stack, recede, or take the scrim). A sheet React hides (a suspended Suspense boundary, Activity mode=\"hidden\") leaves the stack and closes its dialog; when it is shown again it is presented again, on top. Only sheets rendered in the same document stack; a sheet inside an iframe is its own stack.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for mobile-first surfaces (filters, share sheets, quick actions) where the content should rise from the bottom edge.',
      },
      {
        guidance: true,
        description:
          "For a drill-in, open the next sheet over the current one and keep each sheet's isOpen where its data lives; a detail sheet can sit inside the list sheet that opens it, right next to the row. Close every sheet in one update to close the whole flow.",
      },
      {
        guidance: true,
        description:
          "Pick the starting height that fits the content: 'hug' for short bounded content, 'capped' for lists, and 'tall' for forms or streaming/resizing content.",
      },
      {
        guidance: true,
        description:
          "Use purpose='form' to protect entered data from scrim clicks and swipes while keeping Escape available; reserve purpose='required' for flows that must end through an explicit action.",
      },
      {
        guidance: false,
        description:
          "Don't make the sheet content overly long. Break it into steps, each its own sheet, with one state value naming the open step; moving on replaces one with the next.",
      },
      {
        guidance: false,
        description:
          "Don't stack more than two or three sheets: deeper sheets share the second recede step and the user has to pop them one at a time. Replace steps instead (close one, open the next in one update) when they do not need to stay visible.",
      },
    ],
  },
  examples: [
    {
      label: 'Basic',
      code: `const [isOpen, setIsOpen] = useState(false);
<BottomSheet
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Filters">
  <FilterControls />
</BottomSheet>`,
    },
    {
      label: 'Tall sheet (a list)',
      code: `const [isOpen, setIsOpen] = useState(false);
<BottomSheet
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Nearby places"
  height="tall">
  <PlaceList />
</BottomSheet>`,
    },
    {
      label: 'Collapsible to half the screen',
      code: `const [isOpen, setIsOpen] = useState(false);
<BottomSheet
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Nearby places"
  height="tall"
  snapPoints={[0.5]}>
  <PlaceList />
</BottomSheet>`,
    },
    {
      label: 'A peek, a working height, and full',
      code: `const [isOpen, setIsOpen] = useState(false);
<BottomSheet
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Route"
  height="tall"
  snapPoints={['96px', '50%']}>
  <RouteDetails />
</BottomSheet>`,
    },
    {
      label: 'Hug height (fits content)',
      code: `const [isOpen, setIsOpen] = useState(false);
<BottomSheet
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Share"
  height="hug">
  <ShareActions />
</BottomSheet>`,
    },
    {
      label: 'Long scrolling content',
      code: `const [isOpen, setIsOpen] = useState(false);
<BottomSheet
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Release notes"
  height="hug">
  <ReleaseNotes />
</BottomSheet>`,
    },
    {
      label:
        'Multi-step flow (one sheet at a time, each step replaces the last)',
      code: `// One value names the open step. Moving on closes one sheet and opens the
// next in the same update: the next step rises above the current one, which
// fades once it has arrived. A dismissed step closes the flow.
const [step, setStep] = useState(null);
const stepProps = own => ({
  isOpen: step === own,
  onOpenChange: isOpen => !isOpen && setStep(current => (current === own ? null : current)),
});
<>
  <Button label="Start" onClick={() => setStep('details')} />
  <BottomSheet {...stepProps('details')} label="Details">
    <Button label="Continue" onClick={() => setStep('confirm')} />
  </BottomSheet>
  <BottomSheet {...stepProps('confirm')} label="Confirm">
    <Button label="Back" onClick={() => setStep('details')} />
    <Button label="Done" onClick={() => setStep(null)} />
  </BottomSheet>
</>`,
    },
    {
      label: 'Stacked sheets (drill-in: list, order, edit)',
      code: `const [isListOpen, setIsListOpen] = useState(false);
const [orderId, setOrderId] = useState(null);
const [isEditing, setIsEditing] = useState(false);
const closeAll = () => {
  setIsListOpen(false);
  setOrderId(null);
  setIsEditing(false);
};
<>
  <Button label="Orders" onClick={() => setIsListOpen(true)} />
  <BottomSheet isOpen={isListOpen} onOpenChange={setIsListOpen} label="Orders">
    {orders.map(order => (
      <Button key={order.id} label={order.title} onClick={() => setOrderId(order.id)} />
    ))}
  </BottomSheet>
  {/* Opens over the list; the list recedes and stays mounted. */}
  <BottomSheet
    isOpen={orderId != null}
    onOpenChange={open => !open && setOrderId(null)}
    label="Order">
    <Button label="Edit" onClick={() => setIsEditing(true)} />
    <Button label="Close all" onClick={closeAll} />
  </BottomSheet>
  <BottomSheet isOpen={isEditing} onOpenChange={setIsEditing} label="Edit order">
    <Button label="Save" onClick={() => setIsEditing(false)} />
  </BottomSheet>
</>`,
    },
    {
      label: 'Detail sheet inside the list sheet that opens it',
      code: `function PlaceRow({place}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button label={place.name} onClick={() => setIsOpen(true)} />
      {/* Rendered in the list sheet's content: stacks above it, leaves with it, and comes back with it while still open. */}
      <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label={place.name}>
        <PlaceDetail place={place} />
      </BottomSheet>
    </>
  );
}

<BottomSheet isOpen={isListOpen} onOpenChange={setIsListOpen} label="Places">
  {places.map(place => <PlaceRow key={place.id} place={place} />)}
</BottomSheet>`,
    },
    {
      label: 'Deep link into a stack (several sheets open in one update)',
      code: `// From a URL: list, order and editor open together. With no open order
// between them, tree order decides: the list is at the bottom, the editor on top.
const [isListOpen, setIsListOpen] = useState(() => route.list);
const [orderId, setOrderId] = useState(() => route.orderId);
const [isEditing, setIsEditing] = useState(() => route.edit);
<>
  <BottomSheet isOpen={isListOpen} onOpenChange={setIsListOpen} label="Orders">…</BottomSheet>
  <BottomSheet isOpen={orderId != null} onOpenChange={open => !open && setOrderId(null)} label="Order">…</BottomSheet>
  <BottomSheet isOpen={isEditing} onOpenChange={setIsEditing} label="Edit order">…</BottomSheet>
</>`,
    },
    {
      label: 'Mobile keyboard',
      code: `const [isOpen, setIsOpen] = useState(false);
<BottomSheet
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Add a comment"
  height="tall">
  <LongCommentForm />
</BottomSheet>`,
    },
    {
      label: 'No scrim',
      code: `const [isOpen, setIsOpen] = useState(true);
<BottomSheet
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Nearby places"
  hasScrim={false}>
  <PlaceList />
</BottomSheet>`,
    },
    {
      label: 'Protect form input',
      code: `const [isOpen, setIsOpen] = useState(false);
<BottomSheet
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  purpose="form"
  label="Edit profile">
  <ProfileForm onSave={() => setIsOpen(false)} />
</BottomSheet>`,
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'mobile touch sheet rising from the bottom edge (native <dialog>): grab handle, opt-in transform-based drag-to-resize snap points (snapPoints: viewport fraction, percent or px length), scrolling area resizes to the snapped visible height on release (a peek stop, a quarter of the sheet or less, keeps the full height and slides instead), Dialog-aligned dismissal purpose (info/form/required), purpose-gated swipe-to-dismiss, fully-expanded Tall visual-viewport mobile-keyboard handling, named height scale, Dialog-like container padding (padding prop, theme bottom-sheet padding, default --spacing-4), modal (default) or non-modal (hasScrim={false}) presentation; modal sheets stack in open order (covered sheet stays mounted, recedes 0.96/−8px then 0.92/−16px, blocked; one scrim; same-update opens ordered by tree; Escape/scrim/swipe pop the top sheet only; a sheet inside a closing sheet leaves with it and returns with it while still open)',
  usage: {
    anatomy,
    description:
      "Mobile touch surface for filters, actions, forms, and detail views that should rise from the bottom of the viewport; for a multi-step flow give each step its own sheet and one state value naming the open step: a same-update close and open is a replace handoff (entering sheet above, retained sheet aligns then fades, one steady scrim, focus back to the flow's opener on close). Open a sheet over another to stack: each sheet keeps its own isOpen, the top sheet is the most recently opened one, the covered sheet recedes and is blocked, one scrim dims the page, and dismissal pops only the top sheet. Sheets rendered in a closing sheet's content leave with it (their isOpen stays yours; they return with the host while still open); siblings above it stay open.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for mobile-first surfaces (filters, share sheets, quick actions) where the content should rise from the bottom edge.',
      },
      {
        guidance: true,
        description:
          "Pick the starting height that fits the content: 'hug' for short bounded content, 'capped' for lists, and 'tall' for forms or streaming/resizing content.",
      },
      {
        guidance: true,
        description:
          "Use purpose='form' to protect entered data from scrim clicks and swipes while keeping Escape available; reserve purpose='required' for flows that must end through an explicit action.",
      },
      {
        guidance: false,
        description:
          "Don't make the sheet content overly long. Break it into steps, each its own sheet, with one state value naming the open step; moving on replaces one with the next.",
      },
      {
        guidance: false,
        description:
          "Don't stack more than two or three sheets; replace steps (close one, open the next in one update) when they need not stay visible.",
      },
    ],
  },
};
