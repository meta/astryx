// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'useTableColumnsVirtualization',
  subComponentOf: 'Table',
  displayName: 'useTableColumnsVirtualization',
  description:
    "Returns an opaque capability for Table column windowing. Pass the capability to Table.virtualization and keep the complete data, columns, explicit stable idKey and plugins on Table. Columns keep their declared widths: an overflowing Table renders at its minimum width, and the window uses the width each column has there. Pinned columns from useTableStickyColumns always mount; only the columns between the pinned runs window, with a few overscan columns on each side. When the Table's scroll area is at least as wide as the Table's minimum width, every column mounts. Supported tables have one header row, flat rows, no cell that spans columns and single-line content; explicit wrapping, arbitrary custom renderers, non-flat rows, invalid identity, a caller-provided scrollWrapper or a min-width wider than the column floors render every column. Windowing columns together with useTableRowsVirtualization is not available yet: the Table windows its rows and renders every column. Mounted cells keep native table semantics and full-table column positions; unmounted columns are not promised screen-reader discovery.",
  props: [
    {
      name: 'initialViewportWidth',
      type: 'number',
      required: true,
      description:
        "The inline viewport width in CSS pixels that the first window plans for, on the server and before the viewport is measured. It does not size the Table: after mount, the measured width of the Table's scroll area sets the window. Table accounts for its pinned columns.",
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Geometry-only column windowing opt-in for Table.virtualization. Keep full data, columns and a stable idKey on Table. Declared widths set the window; pinned columns always mount; a wide enough scroll area mounts every column. Unsupported content or structure renders every column. Native mounted-cell semantics, not discovery of unmounted columns.',
  propDescriptions: {
    initialViewportWidth:
      'First-frame inline viewport width for the window plan; does not size the Table; measured scroll area wins after mount.',
  },
};
