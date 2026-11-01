// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'MobileTokenizer',
  displayName: 'Mobile Tokenizer',
  group: 'MobileTokenizer',
  category: 'Form Controls',
  keywords: ['tokenizer', 'mobile', 'touch', 'bottom sheet', 'tags', 'chips'],
  props: [
    {name: 'label', type: 'string', description: 'Field label and sheet heading.', required: true},
    {name: 'isLabelHidden', type: 'boolean', description: 'Hide the visible label; the trigger and the sheet keep it as their accessible name.', default: 'false'},
    {name: 'searchSource', type: 'SearchSource<T>', description: 'Core Typeahead search source (search + bootstrap).', required: true},
    {name: 'value', type: 'T[]', description: 'Selected items (Core SearchableItem).', required: true},
    {name: 'onChange', type: '(items: T[], change: MobileTokenizerChange<T>) => void', description: 'Called by Save when the selection draft differs from the opening value. Receives the complete committed selection plus the latest add/create/remove metadata.', required: true},
    {name: 'renderItem', type: '(item: T) => ReactNode', description: 'Custom content for a result row, shown beside its checkbox. Default: the item label.'},
    {name: 'placeholder', type: 'string', description: 'Trigger text when nothing is selected.'},
    {name: 'description', type: 'string', description: 'Help text under the field, read with the trigger.'},
    {name: 'status', type: "{type: 'error' | 'warning' | 'success'; message: string}", description: 'Status shown under the field and read with the trigger.'},
    {name: 'disabledMessage', type: 'string', description: 'Why the field is disabled: the disabled trigger exposes it as its description and tooltip.'},
    {name: 'htmlName', type: 'string', description: 'Form field name: one hidden input per selected item while the field is enabled.'},
    {name: 'hasCreate', type: 'boolean', description: 'Offer Create "<query>" for unmatched free text.', default: 'false'},
    {name: 'maxEntries', type: 'number', description: 'Cap selections; add rows disable at the cap.'},
    {name: 'maxMenuItems', type: 'number', description: 'Maximum source results retained, for a search and for the empty-query bootstrap list alike; long lists render progressively in 50-item batches.', default: '10'},
  ],
  usage: {
    description:
      'Lab prototype for trying the touch Tokenizer flow: tap the field to open one searchable sheet where selected and available items share a full-row checkbox list. Selection changes remain in a draft until Save commits them; swipe, scrim, or Escape dismissal asks before discarding a dirty draft, while a clean dismissal closes directly. Selected items are grouped first when the sheet opens, while checkbox changes keep every existing row in place until the sheet closes; the latest selection is regrouped the next time it opens. Selected custom values stay in the list, and long result sets render progressively in 50-item batches. Custom text uses a trailing Add action. The bordered large search stays above the list, and scrolling or dragging results dismisses the software keyboard without clearing the query. Clear all and Save remain visible while searching. Clear all updates the draft only and requires confirmation; a confirmed clear returns focus to the search field and is announced inside the sheet. Every announcement — additions, removals, result counts — is delivered inside the open sheet. The trigger describes its committed selection to assistive technology (count, then the tokens) after the field description, status, and disabled reason. Strings come from the shared Astryx catalog.',
    bestPractices: [
      {guidance: true, description: 'Try this in Lab/canary to validate the flow; graduate via Core Tokenizer presentation="adaptive" when it ships.'},
      {guidance: false, description: 'Do not ship stable product on this Lab API; it has no theming or spec contract yet.'},
    ],
    anatomy: [
      {name: 'Trigger field', required: true, description: 'Button showing tokens as a summary, in the inline Tokenizer field\'s own box: same border, radius, surface, block size and token inset as the desktop field.'},
      {name: 'Management sheet', required: true, description: 'One searchable list with trailing checkboxes for existing items, a trailing Add action for custom text, and persistent equal-width Clear all and Save footer actions. Save commits the draft; dirty dismissal asks before discarding. Nothing of the sheet is in the page while it is closed.'},
    ],
  },
};
