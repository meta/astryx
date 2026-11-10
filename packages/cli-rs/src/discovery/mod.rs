//! The shared read layer every command uses: ports of
//! `packages/cli/foundation/discovery`, `doc-compiler` (read side), `config`,
//! `integrations` (read side), `env` and `fs`. Owner: the `discovery` lane
//! (component/hook discovery: component lane; icon sets: experimental lane;
//! `doc_compiler/`: docs lane; `validate_contributions`: doctor lane).
//! JS/TS modules load only through `crate::js` (via [`docmod`]).
//!
//! Paths are `String`s with Node `path` semantics. Every public fn names the
//! JS function it ports in its doc comment; errors are the JS `err.message`.
//! Oracle tests (`oracle_tests.rs`, inputs from `scripts/*-oracle.mjs`)
//! prove equality with the JS functions.
//!
//! # Map
//!
//! | need | module | main items |
//! | --- | --- | --- |
//! | Node path/fs semantics | [`nodepath`] | `resolve`, `join`, `relative`, `dirname`, `exists`, `read_json`, `list_dir` (Node order), `cwd`, `homedir` |
//! | JS ordering | [`jsort`] | `cmp_utf16`, `sort_strings` (`Array#sort`), `locale_compare` (ICU root) |
//! | project, Core, CLI root | [`paths`] | `cli_root`, `find_core_dir`, `find_project_core_dir`, `require_core_dir`, `find_installed_package`, `find_astryx_project`, `find_workspace_root`, `list_components`, `discover_external_packages`, `exists_case_exact` |
//! | who answers, release facts | [`release`] | `run_choice`, `answered_by` (`meta.answeredBy`), `is_outside_project`, `cli_version`, `read_release_facts`, `user_cache_dir`, `user_config_dir` |
//! | printed commands | [`package_manager`] | `detect_package_manager`, `explain_package_manager`, `get_cli_invocation`, `format_cli_command`, `prefix_cli_commands`, `doc_package_manager`, `quote_command_argument`, `command_in_folder` |
//! | versions | [`semver`] | `is_valid_semver`, `semver_compare`, `satisfies_range` |
//! | PATH commands | [`search_path`] | `astryx_commands_on_search_path` |
//! | `Project.load` | [`project`] | `Project::load(cwd)`, `Project::load_opts(cwd, core_project_only, fresh)` → `config`, `config_path`, `loaded_integrations`, `.contributing()`, `.issues()`, `.docs()`, `.core_dir()`, `.issues_url()`; `find_config_path`, `parse_config` |
//! | integrations | [`integrations`] | `Record` (JS record by field name), `load_integrations`, `load_manifest`, `load_local_integration`, `load_autolink_candidates`, `resolve_providers`, `available_computer_integrations`, `normalize_provider_id` |
//! | contribution inventory | [`contribution_inventory`] | `collect_identities`, `compare_identities`, `contribution_files`, `compute_required_files`, source-only candidates |
//! | CLI peer ranges | [`cli_requirement`] | `lowest_admitted`, `cli_range_problem` and the per-feature checks, `cli_peer_version_problem` |
//! | doc modules | [`docmod`] | `import_doc_module` / `import_native_module` / `import_template_module` (CLI-own modules embedded from `generated/own-modules.json`), `first_export`, `is_nullish` |
//! | doc parsing | [`doctypes`] on [`zod`] | `parse_doc`, `parse_readable_doc`, `parser_for`, per-kind parsers (zod v4 output and messages) |
//! | reading a doc | [`doc_read`] | `read_doc_view`, `load_component_doc`, `load_docs`, `overlay_authored_doc`, `merge_translation`, `package_source`, `load_topic_file` |
//! | doc topics | [`docs_discovery`] | `DocsCatalog`, `project_docs`, `discover_integration_docs`, `problems_in_topic`, `merge_topic` |
//! | section keys | [`docs_section_key`] | `section_key`, `with_section_keys`, `find_doc_section`, `section_summary`, marks (`strip_marks`) |
//! | safe paths | [`path_safety`] | `assert_within`, `sanitize_name`, `is_file_path_arg` |
//! | write protection | [`file_protection`] | `FileProtectionResolver`, `Ignore` (gitignore) |
//! | package exports | [`exports_subpaths`] | `subpath_declaration`, `importable` |
//! | misc env | [`env_misc`] | user settings, node version, `publish_new_file` |
//! | doc checks (doctor) | [`doc_consistency`], [`runner_commands`], [`doc_tokens`], [`copied_passages`], [`doc_fluff`], [`stray_pointers`], [`doc_stability`] | `integration_doc_consistency`, `find_doc_commands`, `token_for_command`, `find_copied_passages`, `find_fluff`, `find_stray_pointers`, `older_cli_notes`, `template_icon_notes` |
//! | doc files a package serves | [`integration_doc_files`] | `integration_doc_files` |
//! | module export origins | [`module_origins`] | `module_export_origin`, `export_origin_verdict`, `module_export_verdict`, `module_parse_failure`, `export_value_kind`, `aliased_origin`, `static_export_bindings` |
//! | icon set checks | [`icon_set_checks`] | `icon_set_issues`, `icon_set_coverage`, `suggest_icon` |
//! | unread theme folders | [`theme_unread`] | `unread_theme_folders` |
//! | Fix texts | [`contribution_fixes`] | `create_fix_context`, `stamp_of`, `unreachable_fix`, `not_a_component_fix`, `not_a_codemod_fix`, `shared_codemods_root_fix`, `held_root_fix`, `theme_importing` |
//!
//! Run the oracle tests with `RUST_MIN_STACK=268435456` (Boa needs more
//! than a test thread's default stack for Core's docs).

pub mod cli_requirement;
pub mod component_discovery;
pub mod component_replacement;
pub mod config_writer;
pub mod contribution_fixes;
pub mod contribution_inventory;
pub mod copied_passages;
pub mod doc_compiler;
pub mod doc_consistency;
pub mod doc_fluff;
pub mod doc_read;
pub mod doc_stability;
pub mod doc_tokens;
pub mod docmod;
pub mod docs_discovery;
pub mod docs_section_key;
pub mod doctypes;
pub mod env_misc;
pub mod exports_subpaths;
pub mod file_protection;
pub mod hook_discovery;
pub mod icon_definition_discovery;
pub mod icon_set_checks;
pub mod icon_set_discovery;
pub mod icon_set_writer;
pub mod integration_doc_files;
pub mod integration_warnings;
pub mod integrations;
pub mod jsort;
pub mod listing_cache;
pub mod module_exports;
pub mod module_origins;
pub mod nodepath;
pub mod package_exports;
pub mod package_manager;
pub mod path_safety;
pub mod paths;
pub mod pnp;
pub mod project;
pub mod release;
pub mod runner_commands;
pub mod search_path;
pub mod semver;
pub mod stray_pointers;
pub mod theme_unread;
pub mod theming_targets;
pub mod validate_contributions;
pub mod zipfs;
pub mod zod;

#[cfg(test)]
mod oracle_tests;
