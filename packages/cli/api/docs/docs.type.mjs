// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for the `docs` command — source of truth for the docs
 *   command JSON responses. `types/docs.d.ts` re-exports these.
 *
 *   Invocation                           -> type discriminator
 *   ------------------------------------------------------------
 *   astryx --json docs                   -> docs.list
 *   astryx --json docs <topic>           -> docs.detail
 *   astryx --json docs <topic> --index   -> docs.index
 *   astryx --json docs <topic> <section> -> docs.detail.section
 *   astryx --json docs <route>           -> docs.node (a namespace or a
 *                                           typed doc in the docs tree)
 *   (unknown topic/section)              -> CLIError
 */

/**
 * astryx --json docs
 * @typedef {object} DocsListResponse
 * @property {'docs.list'} type
 * @property {DocsListEntry[]} data every topic, each readable as a topic
 * @property {{namespaces?: DocsListNamespace[], notLoaded?: Array<{package: string, message: string}>}} [meta]
 *   `namespaces`: the docs tree's top-level namespaces, each opened by its
 *   `topic` as a docs.node; `notLoaded`: each package whose doc files did not
 *   load, and why (its docs are withdrawn)
 */

/**
 * @typedef {object} DocsListEntry
 * @property {string} topic
 * @property {string} description
 * @property {string} package the package that owns this topic —
 *   '@astryxdesign/cli' for a built-in one, else the contributing integration
 * @property {string} [replaces] the topic this one took the place of, when it
 *   was contributed as a replacement
 * @property {string} [replacedPackage] the package whose topic it took the
 *   place of, with `replaces`
 */

/**
 * A top-level namespace of the docs tree, as `astryx docs --json` lists it in
 * `meta.namespaces`.
 * @typedef {object} DocsListNamespace
 * @property {string} topic its route, the argument that opens it
 * @property {string} description
 * @property {string} package the package that owns it
 */

/**
 * astryx --json docs <topic> --index
 * @typedef {object} DocsIndexResponse
 * @property {'docs.index'} type
 * @property {string} package the npm package that owns the topic
 * @property {DocsIndex} data
 */

/**
 * astryx --json docs <topic>
 * @typedef {object} DocsDetailResponse
 * @property {'docs.detail'} type
 * @property {string} package the npm package that owns the topic
 * @property {Omit<DocsReadDoc, 'sections'> & {sections: DocsDetailSection[], links: DocsLinks, replacedPackage?: string}} data
 *   the whole doc, each section naming the package that wrote it, and the
 *   moves from it; `replacedPackage` names the package whose topic or guide
 *   it took the place of, with `replaces`
 */

/**
 * A topic section as a read returns it. A read inlines each token reference
 * and each `reference` block the author wrote, so its content holds only the
 * stable ReferenceContentBlock kinds.
 * @typedef {Omit<import('@astryxdesign/cli/authoring').ReferenceSection, 'content' | 'before' | 'after'>
 *   & {content: import('@astryxdesign/cli/authoring').ReferenceContentBlock[]}} DocsReadSection
 */

/**
 * A section of a whole-topic read: the read section, naming the package that
 * wrote it.
 * @typedef {DocsReadSection & {package: string}} DocsDetailSection
 */

/**
 * A topic as a read returns it: every section a {@link DocsReadSection}.
 * @typedef {Omit<import('@astryxdesign/cli/authoring').ReferenceDoc, 'sections'>
 *   & {sections: DocsReadSection[]}} DocsReadDoc
 */

/**
 * The doc a link opens (spec:AST-047 FR9). A docs read resolves every link:
 * an inline `{@link <target>}` reads as `link.command`, a `reference` block in
 * a namespace doc carries `link` (null when the target names no doc), and each
 * `workflow` step carries `links`, one per reference. A topic read inlines a
 * section's `reference` block as the doc it includes, then a line naming where
 * that comes from and the command that opens it.
 * @typedef {import('../../foundation/doc-compiler/links.mjs').DocLink} DocLink
 */

/**
 * One move: a whole `astryx docs` command a reader can run as is.
 * @typedef {'astryx docs' | `astryx docs ${string}`} DocsCommand
 */

/**
 * The moves a docs read offers (spec:AST-047). Every read but the topic list
 * carries them.
 * @typedef {object} DocsLinks
 * @property {DocsCommand} up opens the level the read sits in: a section's
 *   topic index, a node's parent namespace, or the topic list
 * @property {DocsCommand} [previous] opens the item before it at its level: the
 *   previous section of its topic, or the previous node in its parent's slot
 * @property {DocsCommand} [next] opens the item after it at its level
 * @property {DocsCommand[]} [related] opens each doc a typed doc names: a
 *   function's command, a command's function, and the docs it lists as
 *   related
 */

/**
 * The section index of one topic: what the topic is, and the key each section
 * is read by.
 * @typedef {object} DocsIndex
 * @property {string} name the topic
 * @property {string} title
 * @property {string} description
 * @property {string} [replaces] the topic or guide this one took the place of
 * @property {string} [replacedPackage] the package whose topic or guide it
 *   took the place of
 * @property {DocsIndexSection[]} sections
 * @property {DocsLinks} links the moves from the index
 */

/**
 * One section of a topic's index, before it names its package.
 * @typedef {object} DocsIndexEntry
 * @property {string} id stable key; pass it as the section argument
 * @property {string} title
 * @property {string} summary the section's first line of text, at most 240
 *   characters
 */

/**
 * One section of a topic's index, naming the package that wrote it: the
 * topic's own, or the extension's that contributed it.
 * @typedef {DocsIndexEntry & {package: string}} DocsIndexSection
 */

/**
 * astryx --json docs <topic> <section>
 * @typedef {object} DocsDetailSectionResponse
 * @property {'docs.detail.section'} type
 * @property {string} package the npm package that wrote the section: the
 *   topic's own, or the extension's that contributed it
 * @property {DocsReadSection & {links: DocsLinks}} data
 *   the section, and the moves from it: up to its topic's index, and across to
 *   the sections before and after it
 */

/**
 * astryx --json docs <route>, for a namespace or a typed doc in the docs tree
 * @typedef {object} DocsNodeResponse
 * @property {'docs.node'} type
 * @property {string} package the package that owns the node
 * @property {DocsNode} data
 */

/**
 * One node of the docs tree.
 * @typedef {object} DocsNode
 * @property {string | null} id the doc's DocId, built from its provider's
 *   ProviderId, kind, and name (see the provider-identity authoring doc);
 *   unchanged when the node moves. Always present; null on a generated level,
 *   such as `cli/api/functions`, which has no authored doc
 * @property {string} route pass it to `astryx docs`
 * @property {string} kind `namespace`, or the typed doc's kind: `command`,
 *   `function`, `schema`, or `enum`
 * @property {string} package the package that owns the node
 * @property {string} title
 * @property {string} summary
 * @property {'experimental'} [stability] Present only when the node's doc is
 *   marked experimental: it may change or be removed in a patch release.
 * @property {DocsNodeLink[]} breadcrumb the namespaces above it, top first
 * @property {DocsNodeSlot[]} slots a namespace's slots that hold children, in
 *   order; empty for a typed doc, and for a depth read of 0
 * @property {number} [childCount] with a depth read of 0, how many docs sit
 *   right below the namespace
 * @property {import('@astryxdesign/cli/authoring').ReferenceContentBlock[]} content
 *   a typed doc's content; empty for a namespace
 * @property {DocsLinks} links the moves from the node: up to its parent (the
 *   topic list, for a top-level namespace), and across to its neighbors in its
 *   parent's slot
 */

/**
 * @typedef {object} DocsNodeLink
 * @property {string} route
 * @property {string} title
 */

/**
 * @typedef {object} DocsNodeSlot
 * @property {string} name the slot's key in its namespace
 * @property {string} title
 * @property {DocsNodeChild[]} children in reading order
 */

/**
 * @typedef {object} DocsNodeChild
 * @property {string} route pass it to `astryx docs` to go one level down
 * @property {string} name the last segment of its route
 * @property {string} package the package that owns the child
 * @property {string} [replaces] the guide's own route, when an integration's
 *   doc took its place
 * @property {string} [replacedPackage] the package whose guide it took the
 *   place of, with `replaces`
 * @property {string} kind
 * @property {string} title
 * @property {string} summary
 * @property {'experimental'} [stability] Present only when the child's doc is
 *   marked experimental: it may change or be removed in a patch release.
 * @property {DocsNodeSlot[]} [slots] with a depth read, its own slots, while
 *   the read goes deeper
 * @property {number} [childCount] with a depth read, how many docs sit right
 *   below it where the read stops
 * @property {import('@astryxdesign/cli/authoring').ReferenceContentBlock[]} [content]
 *   with a depth read at compact or full detail: a namespace's intro or a typed
 *   doc's content
 * @property {DocsReadSection[]} [sections] with a depth read at compact or full
 *   detail: a guide's sections
 */

/**
 * Options for `docs()`.
 * @typedef {object} DocsOptions
 * @property {string} [lang]
 * @property {boolean} [zh]
 * @property {boolean} [dense]
 * @property {boolean} [index] return a topic's section index instead of its
 *   whole doc
 * @property {number | 'all'} [depth] how many levels below a docs-tree
 *   namespace to read: 0 for the namespace alone, 1 for its children (the
 *   default), 'all' for every level
 * @property {'brief' | 'compact' | 'full'} [detail] how much of each doc below
 *   the named one a depth read returns: brief (the default) is its identity,
 *   compact and full add its text
 * @property {string} [cwd] project directory whose configured integrations
 *   contribute topics; defaults to process.cwd()
 */

export {};
