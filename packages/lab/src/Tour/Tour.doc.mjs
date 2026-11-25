// Copyright (c) Meta Platforms, Inc. and affiliates.

const stepFields =
  "Each step is an object: id (string, unique in the array), title (ReactNode), and optionally body (ReactNode), anchorRef (a ref to the element the step describes; without it the step shows in the center), placement ('above' | 'below' | 'start' | 'end', default 'below'), alignment ('start' | 'center' | 'end', default 'start') and showAction (a function that runs before the step reads its anchor; the step waits for a promise it returns).";

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'Tour',
  displayName: 'Tour',
  // Keeps the registry route of the TourStep component. Steps are data now.
  registry: {aliases: ['lab/tour-step']},
  category: 'Feedback & Status',
  keywords: [
    'tour',
    'onboarding',
    'walkthrough',
    'product tour',
    'coachmark',
    'spotlight',
    'guide',
    'feature step',
  ],
  description:
    'A guided product tour. One callout moves from step to step, sits beside the element each step describes, and marks that element with a ring. You list the steps as data and name the active step; Tour draws the callout, the ring and the optional backdrop, and manages focus.',
  props: [
    {
      name: 'steps',
      type: 'TourStep[]',
      description: `The steps, in order. ${stepFields} Leave a step out of the array to make it conditional: the step count and Back and Next follow the array.`,
      required: true,
    },
    {
      name: 'activeId',
      type: 'string | null',
      description:
        'The id of the active step. null means the tour is not running. You own this value: set it to start the tour, to resume it, or to move it from your own handlers.',
      required: true,
    },
    {
      name: 'onActiveIdChange',
      type: '(id: string) => void',
      description:
        'Called with the id of the step that Back, Next or a skipped step moves to, and with the id of the step that takes the place of an active step you removed from the array. Set activeId to it.',
      required: true,
    },
    {
      name: 'onEnd',
      type: "(reason: 'complete' | 'skip' | 'close' | 'escape' | 'backdrop') => void",
      description:
        "Called when the tour ends, with the reason: 'complete' (Done on the last step; also when the last step leaves the array, is skipped for a missing anchor, or missingAnchorBehavior is 'endTour'), 'skip', 'close', 'escape', or 'backdrop' (a press on the dimmed page). Set activeId to null in response.",
      required: true,
    },
    {
      name: 'missingAnchorBehavior',
      type: "'center' | 'skipStep' | 'endTour'",
      description:
        "What a step does when it starts and its anchorRef holds no element on the page. 'center' shows the step in the center of the viewport, and moves it to the anchor when a later render of your component finds it; that callout keeps its own place in the Tab order. 'skipStep' moves on in the direction the person was going. 'endTour' ends the tour as 'complete'. To wait for an anchor that renders late, return a promise from the step's showAction.",
      default: "'center'",
    },
    {
      name: 'onMissingAnchor',
      type: '(id: string) => void',
      description:
        'Called once for each step that starts without its anchor, whatever missingAnchorBehavior does next. Use it to log a tour that points at a control the page no longer renders.',
    },
    {
      name: 'hasScrollIntoView',
      type: 'boolean',
      description:
        'Scroll an anchor that is out of view into view when its step shows. Set it to false to do the scrolling yourself.',
      default: 'true',
    },
    {
      name: 'hasStepCount',
      type: 'boolean',
      description: 'Show the step count ("2 of 5") in the callout.',
      default: 'false',
    },
    {
      name: 'hasSkipButton',
      type: 'boolean',
      description: "Show a Skip control that ends the tour with 'skip'.",
      default: 'false',
    },
    {
      name: 'hasBackdrop',
      type: 'boolean',
      description:
        "Dim the page around the anchor. A step with a backdrop is modal: Tab stays in the callout, Escape ends the tour, and a press anywhere outside the callout, the anchor included, ends the tour with 'backdrop'. Without a backdrop the page stays usable while the step shows: Tab leaves the callout, and Escape ends the tour only while focus is in the callout or on the anchor. Set it before the tour starts.",
      default: 'false',
    },
    {
      name: 'nextLabel',
      type: 'string',
      description:
        'Words for the Next control, in place of the translated default.',
    },
    {
      name: 'doneLabel',
      type: 'string',
      description:
        'Words for the Done control on the last step, in place of the translated default.',
    },
    {
      name: 'skipLabel',
      type: 'string',
      description:
        'Words for the Skip control, in place of the translated default.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: "Ref to the callout's dialog element.",
    },
  ],
  examples: [
    {
      label: 'Steps as data, with a conditional step',
      code: `const [activeId, setActiveId] = useState(null);
const saveRef = useRef(null);
const shareRef = useRef(null);

const steps = [
  {id: 'save', anchorRef: saveRef, title: 'Save your work', body: 'Changes save to the cloud.'},
  // Leave a step out when its control is not on the page.
  ...(canShare
    ? [{id: 'share', anchorRef: shareRef, title: 'Share it', body: 'Invite people from here.'}]
    : []),
  {id: 'done', title: 'You are set'},
];

<Button label="Take the tour" onClick={() => setActiveId(steps[0].id)} />
<Button ref={saveRef} label="Save" />
{canShare && <Button ref={shareRef} label="Share" />}
<Tour
  steps={steps}
  activeId={activeId}
  onActiveIdChange={setActiveId}
  onEnd={() => setActiveId(null)}
  hasStepCount
/>`,
    },
    {
      label: 'An intro dialog before the first step',
      code: `const [isIntroOpen, setIsIntroOpen] = useState(true);
const [activeId, setActiveId] = useState(null);

<Dialog isOpen={isIntroOpen} onOpenChange={setIsIntroOpen}>
  <Layout
    header={<DialogHeader title="What is new" onOpenChange={setIsIntroOpen} />}
    content={<LayoutContent>Three controls moved. Take a short tour?</LayoutContent>}
    footer={
      <LayoutFooter>
        <Button
          label="Start"
          variant="primary"
          onClick={() => {
            setIsIntroOpen(false);
            setActiveId('save');
          }}
        />
      </LayoutFooter>
    }
  />
</Dialog>
<Tour steps={steps} activeId={activeId} onActiveIdChange={setActiveId} onEnd={() => setActiveId(null)} />`,
    },
    {
      label: 'A step that opens the panel its anchor is in',
      code: `const steps = [
  {
    id: 'filters',
    anchorRef: filterRef,
    title: 'Filter the list',
    // Open the panel, and settle when its content is on the page. The
    // step waits for the promise, then reads the anchor.
    showAction: async () => {
      setIsPanelOpen(true);
      // Two frames: the panel renders, then it is on the page.
      await new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    },
  },
];`,
    },
    {
      label: 'Moving from TourStep children',
      code: `// Before
<Tour isActive={isActive} onDismiss={() => setIsActive(false)} isStepCountShown>
  <TourStep targetRef={saveRef} heading="Save your work">Changes save to the cloud.</TourStep>
  <TourStep targetRef={shareRef} heading="Share it">Invite people from here.</TourStep>
</Tour>

// After
<Tour
  steps={[
    {id: 'save', anchorRef: saveRef, title: 'Save your work', body: 'Changes save to the cloud.'},
    {id: 'share', anchorRef: shareRef, title: 'Share it', body: 'Invite people from here.'},
  ]}
  activeId={activeId}
  onActiveIdChange={setActiveId}
  onEnd={() => setActiveId(null)}
  hasStepCount
/>`,
    },
  ],
  theming: {
    targets: [
      // The painted callout surface. `astryx-popover` is on the same element.
      {className: 'astryx-tour'},
      // The ring around the anchor. With a backdrop it carries
      // `data-backdrop="backdrop"`, and its shadow dims the page around it.
      {className: 'astryx-tour-highlight', visualProps: ['backdrop']},
      // The layer that holds the ring, with the same attribute.
      {className: 'astryx-tour-overlay', visualProps: ['backdrop']},
    ],
  },
  usage: {
    description:
      'Use a Tour to introduce a feature or to onboard a person through a few key parts of a page. You write every title and body, decide when the tour runs, and remember whether a person has seen it. For a welcome screen before the first step, open a Dialog and start the tour from it. To continue a tour on another page, set activeId after you navigate. When a step shows, focus moves to its heading if focus was in the previous callout, on the previous anchor or on no control; focus a person placed elsewhere stays there, and the step is announced. A step with a backdrop always takes focus. When the tour ends with focus in the callout or on no control, focus goes to the step’s anchor if it takes focus, else to where focus was before the tour; focus elsewhere stays. Focus that is on no control and never entered the callout stays where it is when the anchor cannot take focus.',
    accessibility: [
      {
        name: 'Title, body and step count',
        category: 'Color contrast',
        criterion: '1.4.3 Contrast (Minimum)',
        requirement: '4.5:1',
        states: ['Every step'],
        description:
          'The title, the body and the step count must have at least 4.5:1 contrast with the callout surface. The step count uses secondary text.',
      },
      {
        name: 'Anchor ring',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        requirement: '3:1',
        states: ['Without a backdrop', 'With a backdrop'],
        description:
          'The ring is the only mark of which control a step describes. It must have at least 3:1 contrast with the gap between it and the anchor, and with the page around it. Under forced colors the ring is an outline in the system highlight color.',
      },
      {
        name: 'Controls',
        category: 'Color contrast',
        criterion: '1.4.3 and 1.4.11',
        requirement: '4.5:1 text, 3:1 glyph',
        states: ['Rest', 'Hover', 'Pointer down', 'Focus visible'],
        description:
          'Back, Next, Done and Skip follow the Button contrast profile. The close control is an icon-only button: its glyph needs 3:1.',
      },
      {
        name: 'Backdrop dimming',
        category: 'Color contrast',
        criterion: '1.4.11 exception',
        requirement: 'Not required',
        states: ['With a backdrop'],
        description:
          'The dimming is decorative. The ring and the modal callout show which control the step describes without it.',
      },
      {
        name: 'Keyboard',
        category: 'Keyboard',
        description:
          'Without a backdrop, Tab moves through the page and the callout in one order: the callout\u2019s controls come right before the step\u2019s anchor, so Tab from the callout\u2019s last control lands on the anchor. When the anchor is one of a group with a single tab stop, such as a toolbar or a tab list, the callout comes before the group. To hold that place, Tour puts one empty element in the page before the anchor while the step shows. A step with no anchor keeps the tour\u2019s own place in the page. Inside a dialog or a popover that holds Tab, the callout has the same place, and Tab moves through that layer\u2019s controls and the callout. Escape ends the tour while focus is in the callout or on the anchor. With a backdrop, Tab stays in the callout and Escape ends the tour from anywhere.',
      },
    ],
    anatomy: [
      {
        name: 'Callout',
        required: true,
        description:
          'The dialog surface that shows one step. Tour draws it; it carries the `astryx-tour` theme target and your `className`, `xstyle` and `style`.',
      },
      {
        name: 'Title',
        required: true,
        description: 'The step\u2019s `title`, shown as the callout heading.',
      },
      {
        name: 'Body',
        required: false,
        description: 'The step\u2019s `body`, under the title.',
      },
      {
        name: 'Step count',
        required: false,
        description: 'The "2 of 5" text, shown with `hasStepCount`.',
      },
      {
        name: 'Controls',
        required: true,
        description:
          'Close, Back, and Next or Done. Skip shows with `hasSkipButton`. Back is absent on the first step.',
      },
      {
        name: 'Anchor ring',
        required: false,
        description:
          'A ring around the step\u2019s anchor. A step with no anchor has none.',
      },
      {
        name: 'Backdrop',
        required: false,
        description:
          'Dims the page around the anchor, with `hasBackdrop`. A press on it ends the tour.',
      },
    ],
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep tours short: a few high-value steps. Long tours get skipped.',
      },
      {
        guidance: true,
        description:
          'Write a title that names the control or the task. The title is the callout\u2019s accessible name, and a screen reader reads it when a step shows.',
      },
      {
        guidance: true,
        description:
          'Use `hasBackdrop` only when the person must finish or leave the tour before they use the page. It holds the keyboard in the callout.',
      },
      {
        guidance: true,
        description:
          'Persist completion yourself, from onEnd, so a person does not see the same tour on every visit.',
      },
      {
        guidance: true,
        description:
          'Leave a step out of the array when the control it describes is not on the page for this person, for example behind a feature flag.',
      },
      {
        guidance: true,
        description:
          'Leave the backdrop off when the person should try the control the step points at. Advance from the control\u2019s own handler by setting activeId.',
      },
      {
        guidance: true,
        description:
          'Use showAction when a step\u2019s anchor is inside a panel or a dialog that must open first. While it runs, the callout before it is hidden, and Back, Next and Done do nothing. Return a promise that settles when the anchor is on the page; the callout then shows above that layer.',
      },
      {
        guidance: false,
        description:
          'Gate essential information behind a tour step. People can end a tour at any time; put critical information on the page.',
      },
      {
        guidance: false,
        description:
          'Use a tour as a substitute for a clear page. Fix a confusing interface instead of narrating it.',
      },
    ],
  },
};

export const docsDense = {
  description:
    'Guided tour: one callout that moves between steps listed as data; app-controlled active step.',
  propDescriptions: {
    steps:
      'ordered step objects {id, title, body?, anchorRef?, placement?, alignment?, showAction?}; omit a step to make it conditional',
    activeId: 'id of the active step; null = not running',
    onActiveIdChange:
      'id that Back, Next or a skip moves to, or that replaces a removed active step',
    onEnd:
      "end reason: 'complete' | 'skip' | 'close' | 'escape' | 'backdrop'; set activeId to null",
    missingAnchorBehavior:
      "anchor not on the page at step start: 'center' (default), 'skipStep', 'endTour'",
    onMissingAnchor: 'called once per step that starts without its anchor',
    hasScrollIntoView: 'scroll an out-of-view anchor into view; default true',
    hasStepCount: 'show "2 of 5"',
    hasSkipButton: 'show Skip',
    hasBackdrop:
      'dim the page; the step becomes modal and an outside press ends the tour',
    nextLabel: 'words for Next',
    doneLabel: 'words for Done',
    skipLabel: 'words for Skip',
  },
  usage: {
    description:
      'Use for short feature introductions. The app owns the words, the active step, the intro Dialog and whether the tour was seen.',
    bestPractices: [
      {
        guidance: true,
        description: 'Keep to a few steps and persist completion from onEnd.',
      },
      {
        guidance: true,
        description:
          'Omit a step whose control is absent; use showAction to open a panel first.',
      },
      {
        guidance: false,
        description: 'Put essential information only in a tour step.',
      },
    ],
  },
};
