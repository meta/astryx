//! Registry for v0.3.0 and later transforms (and `next`). Owned by the
//! second upgrade lane so the two branches merge without conflicts: add a
//! `pub mod` line and a registry entry here, never in `mod.rs`.

use super::{ProjectFn, TransformFn};

#[path = "lhelp.rs"]
pub mod lhelp;
#[path = "v0_3_0.rs"]
pub mod v0_3_0;
#[path = "v0_4_0.rs"]
pub mod v0_4_0;
#[path = "v0_5_0.rs"]
pub mod v0_5_0;
#[path = "v0_6_0.rs"]
pub mod v0_6_0;
#[path = "v0_6_4.rs"]
pub mod v0_6_4;
#[path = "v0_7_0.rs"]
pub mod v0_7_0;
#[path = "v0_7_x.rs"]
pub mod v0_7_x;
#[path = "v0_6_0_css.rs"]
pub mod v0_6_0_css;
#[path = "v0_7_0_theme_surface.rs"]
pub mod v0_7_0_theme_surface;
#[path = "v0_6_x_project.rs"]
pub mod v0_6_x_project;

pub const ALL: &[(&str, TransformFn)] = &[
    ("v0.3.0/migrate-authoring-imports", v0_3_0::migrate_authoring_imports),
    ("v0.3.0/unwrap-authoring-factories", v0_3_0::unwrap_authoring_factories),
    ("v0.3.0/migrate-grid-minchildwidth-to-columns", v0_3_0::migrate_grid_minchildwidth),
    ("v0.3.0/migrate-lab-codeblock-imports", v0_3_0::migrate_lab_codeblock_imports),
    ("v0.3.0/migrate-navmenuitem-to-navheadingmenuitem", v0_3_0::migrate_navmenuitem),
    ("v0.3.0/remove-theme-transition-token-imports", v0_3_0::remove_theme_transition_token_imports),
    ("v0.3.0/rename-authoring-doctypes", v0_3_0::rename_authoring_doctypes),
    ("v0.3.0/rename-radiogroup-arialabel-to-label", v0_3_0::rename_radiogroup_arialabel),
    ("v0.3.0/rename-topnavheading-href-to-headinghref", v0_3_0::rename_topnavheading_href),
    ("v0.4.0/migrate-table-rowexpansion-to-tree", v0_4_0::migrate_table_rowexpansion),
    ("v0.4.0/rename-dropdown-menu-radio-dot-target", v0_4_0::rename_dropdown_menu_radio_dot),
    ("v0.4.0/rename-menu-divider-data-types", v0_4_0::rename_menu_divider_data_types),
    ("v0.5.0/banner-collapsible-content", v0_5_0::banner_collapsible_content),
    ("v0.6.0/move-ime-helper-import", v0_6_0::move_ime_helper_import),
    ("v0.6.0/remove-focus-isrtl-option", v0_6_0::remove_focus_isrtl_option),
    ("v0.6.0/rename-resizable-pixel-bounds", v0_6_0::rename_resizable_pixel_bounds),
    ("v0.6.4/migrate-native-picker-to-presentation", v0_6_4::migrate_native_picker),
    ("v0.7.0/validate-data-token-ownership", v0_7_0::validate_data_token_ownership),
    ("v0.7.0/migrate-field-input-styling", v0_7_0::migrate_field_input_styling),
    ("v0.7.0/preserve-bottom-sheet-content-padding", v0_7_0::preserve_bottom_sheet_padding),
    ("v0.7.0/rename-empty-search-results-text", v0_7_0::rename_empty_search_results_text),
    ("v0.7.2/migrate-list-edge-compensation-to-edge", v0_7_x::migrate_list_edge_compensation),
    ("v0.7.5/migrate-codeblock-tokenizer-to-language", v0_7_x::migrate_codeblock_tokenizer),
    ("v0.7.8/promote-tokenizer-presentation", v0_7_x::promote_tokenizer_presentation),
    ("v0.6.0/migrate-astryx-theme-selectors-to-data-attrs", v0_6_0_css::migrate_theme_selectors_to_data_attrs),
    ("v0.7.0/migrate-deprecated-theme-surface", v0_7_0_theme_surface::migrate_deprecated_theme_surface),
];

/// `codemodType: 'project'` transforms, keyed like `ALL`.
pub const PROJECT: &[(&str, ProjectFn)] = &[
    ("v0.6.4/migrate-theme-catalog-to-descriptors", v0_6_x_project::migrate_theme_catalog_to_descriptors),
    ("v0.6.7/migrate-copied-themes-to-descriptors", v0_6_x_project::migrate_copied_themes_to_descriptors),
];
