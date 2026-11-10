//! One module per top-level command, mirroring
//! `packages/cli/clients/cli/commands/` and `packages/cli/api/`.
//! Each command lane owns its own module file(s) here and nothing else, apart
//! from its registration lines below.
//!
//! Register a handler by its full command name: `("blog", blog::run)`,
//! `("theme build", theme::build)`. A group command (`theme`) needs no entry;
//! the shell handles groups from the CommandDocs.

use crate::cli::command::Handler;

// Command modules, one line each, alphabetical:
pub mod experimental;
pub mod build;
pub mod doctor;
pub mod gap_report;
pub mod blog;
pub mod docs;
pub mod discover;
pub mod component;
pub mod hook;
pub mod theme_build;
pub mod template;
pub mod theme;
pub mod integration;
pub mod search;
pub mod init;
pub mod swizzle;
pub mod upgrade;

/// Every registered handler, keyed by full command name.
pub const HANDLERS: &[(&str, Handler)] = &[
    // One line per command, alphabetical:
    ("experimental icon", experimental::icon::run),
    ("experimental icon add", experimental::icon::add_cmd),
    ("experimental icon map", experimental::icon::map_cmd),
    ("experimental icon new-definition", experimental::icon::new_definition_cmd),
    ("experimental icon new-set", experimental::icon::new_set_cmd),
    ("experimental icon use", experimental::icon::use_cmd),
    ("experimental render", experimental::render::run),
    ("build", build::run),
    ("doctor", doctor::run),
    ("doctor integration components", doctor::integration::run_components),
    ("doctor integration docs", doctor::integration::run_docs),
    ("doctor integration templates", doctor::integration::run_templates),
    ("doctor integration validate", doctor::integration::run_validate),
    ("gap-report", gap_report::run),
    ("blog", blog::run),
    ("docs", docs::run),
    ("discover", discover::run),
    ("component", component::run),
    ("hook", hook::run),
    ("theme build", theme_build::build),
    ("theme palette generate", theme_build::palette_generate),
    ("template", template::cmd::run),
    ("search", search::run),
    ("theme add", theme::add),
    ("theme eject", theme::eject),
    ("theme list", theme::list),
    ("theme remove", theme::remove),
    ("theme targets", theme::targets_cmd),
    ("theme template", theme::template_cmd),
    ("upgrade", upgrade::run_cmd),
    ("theme use", theme::use_cmd),
    ("integration add", integration::add),
    ("init", init::run),
    ("swizzle", swizzle::run),
    ("integration check", integration::check),
    ("integration pack", integration::pack),
    ("integration verify", integration::verify),
];

/// The handler for a full command name, if one is registered.
pub fn handler(name: &str) -> Option<Handler> {
    HANDLERS.iter().find(|(n, _)| *n == name).map(|(_, h)| *h)
}
