// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'SearchField',
  displayName: 'Search Field',
  category: 'Form Controls',
  keywords: [
    'search',
    'search field',
    'search bar',
    'searchbar',
    'search controller',
    'mobile search',
    'cancel',
    'clear',
  ],
  description:
    "The search field of a phone app, as on iOS 26: a rounded field with a magnifier that, once tapped, narrows to make room for a glass close button and can rise into its host's bar. Under a finger, on any touch screen, it activates and cancels on the clock iOS uses, with a glass close button; with a mouse or a trackpad its parts take their places at once and the close button is plain. With reduced motion it cross-fades under a finger and changes at once otherwise. Its keyboard shows a Search key and does not autocorrect. Experimental: lands in lab first.",
  components: [
    {
      name: 'SearchField',
      displayName: 'Search Field',
      description:
        'The field. Tapping it activates search; the close button (or Escape) cancels: it clears the query, ends editing and returns to rest. A tap elsewhere ends editing but leaves search active, as on iOS.',
      props: [
        {
          name: 'label',
          type: 'string',
          description:
            "The field's accessible name, and its placeholder unless placeholder is set.",
          required: true,
        },
        {
          name: 'placeholder',
          type: 'string',
          description: 'Placeholder text. Defaults to label.',
        },
        {
          name: 'value',
          type: 'string',
          description: 'The query, for a controlled field. Pair with onChange.',
        },
        {
          name: 'defaultValue',
          type: 'string',
          description: 'The initial query, for an uncontrolled field.',
        },
        {
          name: 'onChange',
          type: '(value: string) => void',
          description:
            'Called with the query on every edit, and with an empty string when it is cleared or search is cancelled.',
        },
        {
          name: 'isActive',
          type: 'boolean',
          description:
            'Whether search is active, for a controlled field. Pair with onActiveChange.',
        },
        {
          name: 'defaultIsActive',
          type: 'boolean',
          description:
            'Whether search starts active, for an uncontrolled field.',
        },
        {
          name: 'onActiveChange',
          type: '(isActive: boolean) => void',
          description:
            'Called with true when the field gains focus and with false when search is cancelled.',
        },
        {
          name: 'onSubmit',
          type: '(value: string) => void',
          description:
            "Called with the query when the keyboard's Search key (Enter) is pressed. Focus and the keyboard stay; blur the field yourself if results should take over the screen.",
        },
        {
          name: 'handleRef',
          type: 'Ref<SearchFieldHandle>',
          description:
            "focus(), blur() and cancel() for a host that activates the field from its own tap, such as a tab bar's search tab. Call focus() inside that tap, after committing the activation, so the touch keyboard rises; cancel() does what the close button does (clears, ends editing, reports onActiveChange(false)) for a host that draws its own cancel button.",
        },
        {
          name: 'lift',
          type: 'number',
          description:
            "How far the active field rises into its host's bar, in px. A navigation bar passes the distance from under its large title to its own row. Defaults to 0: the field stays in place.",
        },
        {
          name: 'placement',
          type: "'stacked' | 'bottom' | 'tab'",
          description:
            "Where the field lives. 'stacked' (default): in a page header or under a navigation bar's title. 'bottom': iOS 26's toolbar field, 38 px tall and 33 px from each side, in a bar you keep at the bottom of the viewport; it keeps above the software keyboard (its centre 36 px above the keyboard's top while active), moving once the keyboard reports where it is, and shows a 38 px close button beside it, which grows in under a finger. In Chrome on Android the field reads the browser's own keyboard report while it has focus, and the keyboard overlays the page meanwhile. 'tab': inside a tab bar's search tab, which draws the glass, the cancel button and every motion; the field draws only its content, sized to the box it is given. A tap on the text of a 'bottom' or 'tab' field focuses it without the page scrolling. lift applies to 'stacked' only.",
          default: "'stacked'",
        },
        {
          name: 'cancelLabel',
          type: 'string',
          description:
            "The close button's accessible name. Defaults to Cancel.",
        },
        {
          name: 'clearLabel',
          type: 'string',
          description:
            "The clear button's accessible name. Defaults to Clear text.",
        },
      ],
    },
  ],
  usage: {
    description:
      "Use SearchField at the top of a phone screen whose content can be searched, such as a list, or with placement='bottom' in a bar at the bottom of the screen, where iOS 26 puts a toolbar's search field. Filter the content as the query changes, and restore it when search is cancelled.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Give it a short label that says what is searched, such as "Search messages".',
      },
      {
        guidance: true,
        description:
          'Keep the results on screen while search is active; a tap on them ends editing without cancelling the search.',
      },
      {
        guidance: false,
        description:
          "Don't use it to pick one value from a known list (use Typeahead or a Selector with search) or for a command launcher (use CommandPalette).",
      },
    ],
  },
};
