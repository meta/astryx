// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'useTableRowsVirtualization',
  subComponentOf: 'Table',
  displayName: 'useTableRowsVirtualization',
  description:
    "Returns an opaque capability for fixed-height flat-row Table windowing. Pass the capability to Table.virtualization and keep the complete data, columns, explicit stable idKey and plugins on Table. Sizes are positive finite CSS pixels. The Table scrolls inside the height its parent gives it and fills all of it. Give the Table's parent a height, fixed or relative, or a flex child, so windowing can bound the rows; with no height every row renders. Make the Table the parent's only child, or a flex child with min-height: 0 beside a heading or toolbar. Supported rows use single-line content; explicit wrapping, non-flat rows or invalid identity use ordinary full rendering. What stays windowed: a column without renderCell (its default cell renders the row's value as single-line text) and the row-number (useTableRowIndex, counting from 1) and selection (useTableSelection) columns. A column with a custom renderCell turns windowing off for the whole table, because Table cannot check that the cell keeps the fixed row height; it renders every row and warns in development with the column's key. To window a table, put the text a column shows in the row data and leave renderCell off that column. Windowing uses the Table-owned scroll wrapper; a caller-provided scrollWrapper takes diagnostic full-render fallback. Mounted rows retain native table semantics and full-table positions; unmounted rows are not promised screen-reader discovery.",
  props: [
    {
      name: 'rowHeight',
      type: 'number',
      required: true,
      description:
        'Total body-row pitch in CSS pixels, including existing density padding and collapsed borders. Must fit text and supported controls without reducing their size. When every row measures taller, as with enlarged text or zoom, the Table windows at the measured height and warns in development; rows of unequal height render every row.',
    },
    {
      name: 'initialViewportHeight',
      type: 'number',
      required: true,
      description:
        'The viewport height in CSS pixels that the first window plans for, on the server and before the viewport is measured. It does not size the Table: the Table scrolls inside the height its parent gives it, and after mount the measured viewport sets the window. Table accounts for its headers and chrome.',
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Geometry-only fixed-height flat-row opt-in for Table.virtualization. Keep full data and stable idKey on Table. Positive finite CSS-pixel sizes; unsupported content, geometry, identity or a caller scrollWrapper falls back to full rendering. Native mounted-row semantics, not discovery of unmounted rows. Windowed: columns without renderCell, row-number (from 1) and selection columns; any custom renderCell turns windowing off for the table, with a development warning naming the column.',
  propDescriptions: {
    rowHeight:
      'Total body-row pitch including density padding and borders; text and supported controls must fit. Taller equal rows window at their measured height.',
    initialViewportHeight:
      'First-frame viewport height for the window plan; does not size the Table; measured viewport wins after mount.',
  },
};
