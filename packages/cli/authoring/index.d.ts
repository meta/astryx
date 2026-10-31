// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Public type surface for `@astryxdesign/cli/authoring`.
 *
 * Authoring is a pure data contract: the TYPES you write plain objects against,
 * and the PARSERS the CLI runs at the load boundary (`unknown` → typed, or a
 * readable throw). Zod is sealed inside each parser and never appears here.
 * There are no `create*` factories — author a plain object and stamp its `type`.
 *
 * This file reads as a menu: the handful of things you author sit up top, the
 * field/sub-types they compose from are grouped below the divider, and internal
 * runner types are not exported here at all.
 *
 * NOTE: this barrel is a `.d.ts` on purpose. It is a pure re-export (including
 * the parser value bindings from `./*.mjs`), and downstream package builds
 * resolve `@astryxdesign/cli/authoring` here via the `types` condition. Their
 * tsconfigs run with `skipLibCheck` (which skips `.d.ts`) but no `allowJs`, so a
 * real `.ts` barrel would make tsc follow the `.mjs` re-exports and fail TS7016.
 * The runtime entry is the sibling `index.mjs`.
 */

// ═══════════════════════════════════════════════════════════════════════
// AUTHOR THESE — each is the default export of one authored file.
// ═══════════════════════════════════════════════════════════════════════
export type {ComponentDoc} from './doctypes/types.js'; //   Button.doc.mjs
export type {HookDoc} from './doctypes/types.js'; //         useToast.doc.mjs
export type {FunctionDoc} from './doctypes/types.js'; //     search.doc.mjs (hook | api)
export type {ReferenceDoc} from './doctypes/types.js'; //    theming.doc.mjs
export type {TemplateDoc} from './doctypes/types.js'; //     Foo.doc.mjs
export type {IntegrationTemplateDoc} from './doctypes/types.js'; // an integration's Foo.doc.mjs
export type {SchemaDoc} from './doctypes/types.js'; //       config.doc.mjs (object shape)
export type {CommandDoc} from './doctypes/types.js'; //      search.doc.mjs (CLI command)
export type {EnumDoc} from './doctypes/types.js'; //         error-codes.doc.mjs (vocabulary)
export type {NamespaceDoc} from './doctypes/types.js'; //    cli.doc.mjs (hierarchy)
export type {ThemeDoc} from './doctypes/types.js'; //        oceanTheme.doc.mjs
export type {IconSetDoc} from './doctypes/types.js'; //      outline.doc.mjs
export type {IconSetData} from './doctypes/types.js'; //     outline.icons.json
export type {IconDefinitionDoc} from './doctypes/types.js'; //  delete.doc.mjs
export type {AstryxConfig} from './config/type.js'; //       astryx.config.{ts,mjs}
export type {DebugEvent} from './debug/type.js'; //          one recorded CLI run
export type {AstryxIntegration} from './integration/type.js'; // astryx.integration.{ts,mjs}
export type {
  GapReportHandler,
  GapReportHandlerContext,
  GapReport,
  GapReportCategory,
  GapReportTarget,
  GapReportHandlerReceipt,
} from './gap-report/type.js'; // gap-report handler contract
export type {
  DiscoverSource,
  DiscoverSourceContext,
  DiscoverCatalog,
  DiscoverPackage,
  DiscoverVersion,
  DiscoverContribution,
  DiscoverKind,
} from './discover/type.js'; // discover source contract
export type {AstryxCodemod, AstryxConfigCodemod} from './codemod/type.js'; // codemods/*

// ═══════════════════════════════════════════════════════════════════════
// PARSERS — the CLI's load boundary (types come from each parser's JSDoc).
// ═══════════════════════════════════════════════════════════════════════
export {parseDoc} from './doctypes/parse.mjs';
export {parseComponent} from './doctypes/component/parse.mjs';
export {parseHook} from './doctypes/hook/parse.mjs';
export {parseFunction} from './doctypes/function/parse.mjs';
export {parseReference} from './doctypes/reference/parse.mjs';
export {parseTemplate} from './doctypes/template/parse.mjs';
export {parseSchema} from './doctypes/schema/parse.mjs';
export {parseCommand} from './doctypes/command/parse.mjs';
export {parseEnum} from './doctypes/enum/parse.mjs';
export {parseNamespace} from './doctypes/namespace/parse.mjs';
export {parseTheme} from './doctypes/theme/parse.mjs';
/** @experimental Icon sets may change or be removed in a patch release. */
export {parseIconSet, parseIconSetData} from './doctypes/icon-set/parse.mjs';
/** @experimental Icon definitions may change or be removed in a patch release. */
export {parseIconDefinition} from './doctypes/icon-definition/parse.mjs';
export {parseLegacyDoc} from './doctypes/legacy.mjs';
export {parseConfig} from './config/parse.mjs';
export {parseIntegration} from './integration/parse.mjs';
export {
  parseGapReportHandler,
  parseGapReportReceipt,
} from './gap-report/parse.mjs';
export {parseDiscoverCatalog} from './discover/parse.mjs';
export {parseCodemod} from './codemod/parse.mjs';
export {parseDebugEvent} from './debug/parse.mjs';

// ═══════════════════════════════════════════════════════════════════════
// FIELD & SUB-TYPES — the building blocks of the docs above. Import these
// only to annotate a part directly (or to read/render docs); you rarely
// need them to author. Names carry the doc kind they belong to.
// ═══════════════════════════════════════════════════════════════════════
export type {
  ProviderId,
  ArtifactId,
  DocId,
  ProviderInstanceId,
  ContentDigest,
  ContributionKind,
  ArtifactIdentity,
  ProviderInstance,
  AuthoredDoc,
  AuthoredDocKindOf,
  AuthoredDocSnapshot,
  AuthoredDocSource,
  AuthoredDocEntry,
} from './identity/type.js';
export type {
  // shared graph
  AuthoredDocKind,
  DocAudience,
  DocPlacement,
  AuthoredDocGraphFields,
  // component
  SingleComponentDoc,
  MultiComponentDoc,
  ComponentEntry,
  ComponentGroupDoc,
  ComponentTranslationDoc,
  ComponentPropDoc,
  ComponentExampleDoc,
  ComponentAnatomyElement,
  ComponentAccessibilityRequirement,
  ComponentAccessibilityThemeStatus,
  ComponentAccessibilityThemeApplicability,
  ComponentAccessibilityThemeMeasurement,
  ComponentAccessibilityThemeResult,
  ComponentAccessibilityThemeMode,
  ComponentAccessibilityThemeTable,
  ComponentAccessibilityThemeCoverage,
  ComponentBestPractice,
  ComponentSlotElement,
  ComponentPlaygroundConfig,
  ComponentThemingTarget,
  ComponentThemingVar,
  ComponentThemingDerivedVar,
  UsageDoc,
  // hook
  HookParamDoc,
  HookReturnDoc,
  HookTranslationDoc,
  // function (hooks + CLI/API functions)
  FunctionReturnDoc,
  FunctionThrowsDoc,
  FunctionExampleDoc,
  // reference
  ReferenceSection,
  ReferenceContentBlock,
  GraphContentBlock,
  ReferenceTokenPreviewType,
  ReferenceTranslationDoc,
  WorkflowStep,
  WorkflowDocBlock,
  CollectionDocBlock,
  ReferenceDocBlock,
  // namespace
  NamespaceProviderScope,
  NamespaceSlotAcceptance,
  NamespaceSlot,
  NamespaceAdoptionSource,
  NamespaceAdoptionRule,
  // template
  TemplateCategory,
  // schema
  SchemaFieldDoc,
  // command
  CommandArgDoc,
  CommandOptionDoc,
  CommandExampleDoc,
  CommandOutsideProject,
  // enum
  EnumMemberDoc,
  // icon set
  IconSetDefault,
  IconSetIcon,
  IconSetMatch,
  IconSetMatchConfidence,
  IconSetSource,
  IconSetVariant,
  IconSetAdapter,
} from './doctypes/types.js';
export type {PostCodemodHook, DebugConfig} from './config/type.js';
export type {
  // debug
  DebugSchemaVersion,
  DebugOutcome,
  DebugOptionSource,
  DebugResultKind,
  DebugInvocationSource,
  DebugEventError,
  DebugEventOutput,
  DebugEventEnv,
  DebugEventProject,
  DebugEventHandler,
} from './debug/type.js';
export type {
  AstryxCodemodDef,
  AstryxConfigCodemodDef,
  AstryxCodemodFile,
  AstryxCodemodApi,
  AstryxCodemodTransform,
} from './codemod/type.js';
