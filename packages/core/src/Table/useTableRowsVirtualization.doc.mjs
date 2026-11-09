// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'useTableRowsVirtualization',
  subComponentOf: 'Table',
  displayName: 'useTableRowsVirtualization',
  description:
    'Returns an opaque capability for fixed-height flat-row Table windowing. Pass the capability to Table.virtualization and keep the complete data, columns, explicit stable idKey and plugins on Table. Sizes are positive finite CSS pixels. Give the viewport a bounded height: initialViewportHeight, or a block-sized parent. Supported rows use single-line content; explicit wrapping, arbitrary custom renderers, non-flat rows or invalid identity use ordinary full rendering. Windowing uses the Table-owned scroll wrapper; a caller-provided scrollWrapper takes diagnostic full-render fallback. Mounted rows retain native table semantics and full-table positions; unmounted rows are not promised screen-reader discovery.',
  props: [
    {
      name: 'rowHeight',
      type: 'number',
      required: true,
      description:
        'Total body-row pitch in CSS pixels, including existing density padding and collapsed borders. Must fit text and supported controls without reducing their size.',
    },
    {
      name: 'initialViewportHeight',
      type: 'number',
      description:
        "Optional: the Table viewport's height in CSS pixels for the first frame, on the server and before the viewport is measured; it also bounds the viewport. After mount, the measured viewport sets the window. Without it, the viewport fills its block-sized parent, so give that parent a height, and the first frame renders one row plus overscan. Table accounts for its headers and chrome.",
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Geometry-only fixed-height flat-row opt-in for Table.virtualization. Keep full data and stable idKey on Table. Positive finite CSS-pixel sizes; unsupported content, geometry, identity or a caller scrollWrapper falls back to full rendering. Native mounted-row semantics, not discovery of unmounted rows.',
  propDescriptions: {
    rowHeight:
      'Total body-row pitch including density padding and borders; text and supported controls must fit.',
    initialViewportHeight:
      'Optional first-frame viewport height that also bounds the viewport; measured viewport wins after mount; without it the viewport fills its sized parent.',
  },
};
