//! Native ports of `packages/cli/assets/codemods/transforms/*`, keyed by
//! `<version dir>/<file stem>`.

use super::jsc::TResult;
use serde_json::Value;

pub type TransformFn = fn(source: &str, path: &str, options: &Value) -> TResult;

/// A `codemodType: 'project'` transform: `transform(root) -> plan`.
pub type ProjectFn = fn(root: &std::path::Path) -> Result<ProjectPlan, String>;

/// The plan a project codemod returns (`{writes, deletes, problems}`).
#[derive(Debug, Clone, Default)]
pub struct ProjectPlan {
    /// (absolute path, contents)
    pub writes: Vec<(std::path::PathBuf, String)>,
    pub deletes: Vec<std::path::PathBuf>,
    /// (file, message)
    pub problems: Vec<(String, String)>,
}

pub fn get_project(name: &str) -> Option<ProjectFn> {
    later::PROJECT.iter().find(|(n, _)| *n == name).map(|(_, f)| *f)
}

pub mod v0_0_2;
pub mod v0_0_6;
pub mod v0_0_7;
pub mod v0_0_12;
pub mod v0_0_13;
pub mod v0_0_14;
pub mod v0_0_15;
pub mod v0_1_0;
pub mod v0_1_x;
pub mod v0_1_3;
pub mod v0_1_7;
pub mod common;
pub mod later;

pub fn get(name: &str) -> Option<TransformFn> {
    ALL.iter().chain(later::ALL.iter()).find(|(n, _)| *n == name).map(|(_, f)| *f)
}

pub const ALL: &[(&str, TransformFn)] = &[
    ("v0.0.2/rename-isShown-to-isOpen", v0_0_2::rename_is_shown_to_is_open),
    ("v0.0.2/rename-selector-items-to-options", v0_0_2::rename_selector_items_to_options),
    ("v0.0.2/unify-visibility-to-onOpenChange", v0_0_2::unify_visibility),
    ("v0.0.2/unify-uncontrolled-to-defaultX", v0_0_2::unify_uncontrolled),
    ("v0.0.2/rename-banner-endButton-to-endContent", v0_0_2::rename_banner_end_button),
    ("v0.0.2/rename-form-tooltip-startIcon", v0_0_2::rename_form_tooltip_start_icon),
    ("v0.0.2/rename-topnav-title-to-heading", v0_0_2::rename_topnav_title),
    ("v0.0.2/rename-sidenav-header-to-heading", v0_0_2::rename_sidenav_header),
    ("v0.0.2/migrate-useXDSIcon-to-getIcon", v0_0_2::migrate_use_xds_icon),
    ("v0.0.2/migrate-gap-to-numeric", v0_0_2::migrate_gap_to_numeric),
    ("v0.0.2/migrate-isFullBleed-to-padding", v0_0_2::migrate_is_full_bleed),
    ("v0.0.2/migrate-badge-dot-to-statusdot", v0_0_2::migrate_badge_dot),
    ("v0.0.6/migrate-badge-children-to-label", v0_0_6::migrate_badge_children_to_label),
    ("v0.0.6/migrate-collapse-to-collapsible", v0_0_6::migrate_collapse_to_collapsible),
    ("v0.0.6/migrate-radius-tokens", v0_0_6::migrate_radius_tokens),
    ("v0.0.6/migrate-shadow-tokens", v0_0_6::migrate_shadow_tokens),
    ("v0.0.6/migrate-skeleton-radius", v0_0_6::migrate_skeleton_radius),
    ("v0.0.6/migrate-token-names", v0_0_6::migrate_token_names),
    ("v0.0.7/rename-banner-variant-to-container", v0_0_7::rename_banner_variant),
    ("v0.0.8/migrate-token-renames", v0_0_7::migrate_token_renames),
    ("v0.0.8/rename-endslot-to-endcontent", v0_0_7::rename_endslot),
    ("v0.0.10/remove-size-props", v0_0_7::remove_size_props),
    ("v0.0.12/add-is-icon-only", v0_0_12::add_is_icon_only),
    ("v0.0.13/icon-name-deprecations", v0_0_13::icon_name_deprecations),
    ("v0.0.13/rename-attachments-to-drawer", v0_0_13::rename_attachments_to_drawer),
    ("v0.0.13/toolbar-density-to-size", v0_0_13::toolbar_density_to_size),
    ("v0.0.14/rename-action-props", v0_0_14::rename_action_props),
    ("v0.0.14/rename-section-wash-to-muted", v0_0_14::rename_section_wash),
    ("v0.0.14/rename-status-variants", v0_0_14::rename_status_variants),
    ("v0.0.15/migrate-item-children-to-endcontent", v0_0_15::migrate_item_children_to_endcontent),
    ("v0.0.15/migrate-selector-children-to-render-option", v0_0_15::migrate_selector_children),
    ("v0.0.15/rename-date-picker-to-input", v0_0_15::rename_date_picker),
    ("v0.0.15/rename-imperative-ref-to-handleRef", v0_0_15::rename_imperative_ref),
    ("v0.0.15/rename-isStreaming-to-isStopShown", v0_0_15::rename_is_streaming),
    ("v0.0.15/rename-stack-element-to-as", v0_0_15::rename_stack_element),
    ("v0.0.15/migrate-theme-selectors-to-data-attrs", v0_0_15::migrate_theme_selectors),
    ("v0.1.0/drop-xds-prefix-imports", v0_1_0::drop_xds_prefix_imports),
    ("v0.1.0/migrate-xds-module-specifiers", v0_1_0::migrate_xds_module_specifiers),
    ("v0.1.0/migrate-xds-declare-module", v0_1_0::migrate_xds_declare_module),
    ("v0.1.0/migrate-xds-css-surfaces", v0_1_0::migrate_xds_css_surfaces),
    ("v0.1.2/rename-text-color-active-to-accent", v0_1_x::rename_text_color_active),
    ("v0.1.5/rename-switch-label-spacing-default-to-hug", v0_1_x::rename_switch_label_spacing),
    ("v0.1.8/rename-avatar-size-scale", v0_1_x::rename_avatar_size_scale),
    ("v0.2.0/remove-tablist-orientation", v0_1_x::remove_tablist_orientation),
    ("v0.1.3/migrate-layout-components-to-experimental", v0_1_3::migrate_layout_components),
    ("v0.1.7/migrate-table-tableprops-to-direct-props", v0_1_7::migrate_table_tableprops),
    ("v0.1.7/rename-table-renderprops-styles-to-xstyle", v0_1_7::rename_table_renderprops_styles),
    ("v0.2.1/migrate-dialog-position-to-logical", v0_1_7::migrate_dialog_position),
];
