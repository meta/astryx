//! Port of `authoring/doctypes` parsing (`parseDoc` and the per-kind
//! parsers, `_schema.mjs`), on [`super::zod`]. Each parser returns the zod
//! output value or the error message the JS parser throws.
//!
//! `icon-set` docs are parsed by `icon_set_discovery::parse_icon_set`.

use super::zod::{self, *};
use crate::json::{Map, Value};
use std::sync::Arc;

fn ne() -> Z {
    non_empty()
}

fn graph_fields() -> Vec<(&'static str, Z)> {
    vec![
        (
            "placement",
            opt(object(
                vec![("parent", ne()), ("slot", opt(ne())), ("order", opt(int_safe()))],
                Mode::Strict,
            )),
        ),
        ("aliases", opt(array(ne()))),
        ("audience", opt(enum_(&["public", "internal"]))),
        ("stability", opt(lit("experimental"))),
    ]
}

fn prose() -> Z {
    object(vec![("type", lit("prose")), ("text", ne())], Mode::Strict)
}
fn heading() -> Z {
    object(
        vec![
            ("type", lit("heading")),
            (
                "level",
                union(vec![
                    literal(Value::from(3)),
                    literal(Value::from(4)),
                    literal(Value::from(5)),
                    literal(Value::from(6)),
                ]),
            ),
            ("text", ne()),
        ],
        Mode::Strict,
    )
}
fn code() -> Z {
    object(
        vec![("type", lit("code")), ("lang", ne()), ("code", string()), ("label", opt(ne()))],
        Mode::Strict,
    )
}
fn table() -> Z {
    object(
        vec![("type", lit("table")), ("headers", array_min(string(), 1)), ("rows", array(array(string())))],
        Mode::Strict,
    )
    .refine(Arc::new(|t: &Value, out: &mut Vec<Issue>| {
        let n = t.get("headers").and_then(|h| h.as_array()).map(|a| a.len()).unwrap_or(0);
        if let Some(rows) = t.get("rows").and_then(|r| r.as_array()) {
            for (i, row) in rows.iter().enumerate() {
                if row.as_array().map(|a| a.len()).unwrap_or(0) != n {
                    out.push(Issue {
                        code: "custom",
                        path: vec![Seg::Key("rows".into()), Seg::Index(i)],
                        message: format!("expected {n} cells"),
                        cont: true,
                    });
                }
            }
        }
    }))
}
fn list() -> Z {
    object(
        vec![
            ("type", lit("list")),
            ("style", enum_(&["ordered", "unordered", "do", "dont"])),
            ("items", array_min(ne(), 1)),
        ],
        Mode::Strict,
    )
}
fn token_ref() -> Z {
    object(vec![("type", lit("token-ref")), ("topic", ne()), ("section", ne())], Mode::Strict)
}
fn workflow() -> Z {
    object(
        vec![
            ("type", lit("workflow")),
            ("title", opt(ne())),
            (
                "steps",
                array_min(
                    object(
                        vec![
                            ("title", ne()),
                            ("description", opt(ne())),
                            ("references", opt(array_min(ne(), 1))),
                        ],
                        Mode::Strict,
                    ),
                    1,
                ),
            ),
        ],
        Mode::Strict,
    )
}
fn collection() -> Z {
    object(
        vec![
            ("type", lit("collection")),
            ("title", opt(ne())),
            ("source", object(vec![("slot", ne())], Mode::Strict)),
            ("presentation", opt(enum_(&["list", "cards", "compact"]))),
            ("whenEmpty", opt(enum_(&["show", "omit"]))),
        ],
        Mode::Strict,
    )
}
fn reference_block() -> Z {
    object(
        vec![
            ("type", lit("reference")),
            ("target", ne()),
            (
                "projection",
                opt(object(
                    vec![("fields", opt(array_min(ne(), 1))), ("sections", opt(array_min(ne(), 1)))],
                    Mode::Strict,
                )),
            ),
            ("presentation", opt(enum_(&["summary", "compact", "full"]))),
        ],
        Mode::Strict,
    )
}

/// `ReferenceContentBlockSchema`.
pub fn reference_content_block() -> Z {
    disc("type", vec![prose(), heading(), code(), table(), list(), token_ref()])
}
/// `SectionContentBlockSchema`.
pub fn section_content_block() -> Z {
    disc("type", vec![prose(), heading(), code(), table(), list(), token_ref(), reference_block()])
}
/// `NamespaceContentBlockSchema`.
pub fn namespace_content_block() -> Z {
    disc(
        "type",
        vec![prose(), heading(), code(), table(), list(), token_ref(), workflow(), collection(), reference_block()],
    )
}

fn reference_section() -> Z {
    object(
        vec![
            ("id", opt(ne())),
            ("title", ne()),
            ("category", opt(string())),
            ("content", array(section_content_block())),
            ("before", opt(ne())),
            ("after", opt(ne())),
            (
                "previewType",
                opt(enum_(&[
                    "swatch",
                    "shadow-box",
                    "radius-box",
                    "spacing-bar",
                    "size-bar",
                    "border-line",
                    "duration-bar",
                    "easing-curve",
                    "font-sample",
                ])),
            ),
        ],
        Mode::Strict,
    )
}

fn prop() -> Z {
    object(
        vec![
            ("name", string_min(1, "prop name is required")),
            ("type", string_min(1, "prop type is required")),
            ("description", string()),
            ("default", opt(string())),
            ("required", opt(boolean())),
        ],
        Mode::Passthrough,
    )
}
fn param() -> Z {
    object(
        vec![
            ("name", string_min(1, "param name is required")),
            ("type", string_min(1, "param type is required")),
            ("description", string()),
            ("default", opt(string())),
            ("required", opt(boolean())),
        ],
        Mode::Passthrough,
    )
}
fn ret() -> Z {
    object(
        vec![
            ("name", string_min(1, "return name is required")),
            ("type", string_min(1, "return type is required")),
            ("description", string()),
        ],
        Mode::Passthrough,
    )
}

fn base_doc_fields() -> Vec<(&'static str, Z)> {
    let mut v = graph_fields();
    v.extend(vec![
        ("name", string_min(1, "name is required")),
        ("displayName", opt(string())),
        ("description", opt(string())),
        ("usage", opt(unknown())),
        ("import", opt(Z::Str { checks: vec![StrCheck::Min(1, None)], type_msg: None })),
        ("group", opt(string())),
        ("category", opt(string())),
        ("keywords", opt(array(string()))),
        ("parent", opt(string())),
        ("relatedDocs", opt(array(string()))),
        ("hidden", opt(boolean())),
        ("isHiddenFromOverview", opt(boolean())),
    ]);
    v
}

fn deprecation() -> Z {
    object(vec![("replacement", ne()), ("description", ne())], Mode::Strict)
}

fn with(mut a: Vec<(&'static str, Z)>, b: Vec<(&'static str, Z)>) -> Vec<(&'static str, Z)> {
    for (k, z) in b {
        if let Some(slot) = a.iter_mut().find(|(n, _)| *n == k) {
            slot.1 = z;
        } else {
            a.push((k, z));
        }
    }
    a
}

fn nullish(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => true,
        Some(Value::Object(m)) => m.get("__js").and_then(|x| x.as_str()) == Some("undefined"),
        _ => false,
    }
}

fn custom(path: Vec<Seg>, message: String) -> Issue {
    Issue { code: "custom", path, message, cont: true }
}

/// `ComponentDocKindSchema`.
pub fn component_doc_kind() -> Z {
    let base = with(
        base_doc_fields(),
        vec![
            ("type", lit("component")),
            ("theming", opt(unknown())),
            ("playground", opt(unknown())),
            ("examples", opt(array(unknown()))),
            ("replaces", opt(Z::Str { checks: vec![StrCheck::Min(1, None)], type_msg: None })),
            ("deprecated", opt(deprecation())),
        ],
    );
    let shape = with(
        base,
        vec![
            ("props", opt(array(prop()))),
            (
                "components",
                opt(array(object(vec![("name", string_min(1, "component name is required"))], Mode::Passthrough))),
            ),
        ],
    );
    object(shape, Mode::Passthrough).refine(Arc::new(|d: &Value, out: &mut Vec<Issue>| {
        if nullish(d.get("props")) && nullish(d.get("components")) {
            out.push(custom(
                vec![Seg::Key("props".into())],
                "expected the props array, or `components` for a doc that groups several components".into(),
            ));
        }
    }))
}

/// `FunctionDocKindSchema`.
pub fn function_doc_kind() -> Z {
    let ret_fn = object(
        vec![
            ("name", opt(Z::Str { checks: vec![StrCheck::Min(1, None)], type_msg: None })),
            ("type", string_min(1, "return type is required")),
            ("description", string()),
        ],
        Mode::Passthrough,
    );
    object(
        with(
            base_doc_fields(),
            vec![("type", lit("function")), ("params", array(param())), ("returns", array(ret_fn))],
        ),
        Mode::Passthrough,
    )
}

fn replaces_extends_and_ids(d: &Value, out: &mut Vec<Issue>) {
    if !nullish(d.get("replaces")) && !nullish(d.get("extends")) {
        out.push(custom(
            vec![Seg::Key("extends".into())],
            "declares both `replaces` and `extends`; choose one".into(),
        ));
    }
    let mut ids: Vec<String> = Vec::new();
    if let Some(Value::Array(secs)) = d.get("sections") {
        for (i, s) in secs.iter().enumerate() {
            if nullish(s.get("id")) {
                continue;
            }
            let id = super::paths::js_string(s.get("id"));
            if ids.contains(&id) {
                out.push(custom(
                    vec![Seg::Key("sections".into()), Seg::Index(i), Seg::Key("id".into())],
                    format!("duplicate section id \"{id}\""),
                ));
            }
            ids.push(id);
        }
    }
}

/// `GenericDocKindSchema`.
pub fn generic_doc_kind() -> Z {
    object(
        with(
            base_doc_fields(),
            vec![
                ("type", lit("generic")),
                ("title", opt(ne())),
                ("keywords", opt(array(string()))),
                ("sections", opt(array_min(reference_section(), 1))),
                ("replaces", opt(ne())),
                ("extends", opt(ne())),
                ("tokenCategory", opt(string())),
            ],
        ),
        Mode::Passthrough,
    )
    .refine(Arc::new(replaces_extends_and_ids))
}

fn schema_field() -> Z {
    object(
        vec![
            ("name", string_min(1, "field name is required")),
            ("type", string_min(1, "field type is required").type_message("field type is required")),
            ("description", string()),
            ("required", opt(boolean())),
            ("default", opt(string())),
            ("example", opt(string())),
            ("deprecated", opt(string())),
            ("stability", opt(lit("experimental"))),
            ("fields", opt(array(Z::Lazy(schema_field)))),
        ],
        Mode::Passthrough,
    )
}

/// `SchemaDocKindSchema`.
pub fn schema_doc_kind() -> Z {
    object(
        with(
            graph_fields(),
            vec![
                ("type", lit("schema")),
                ("name", string_min(1, "name is required")),
                ("displayName", string_min(1, "displayName is required")),
                ("description", string()),
                ("namespace", opt(string())),
                ("appliesTo", opt(string())),
                ("fields", array(schema_field())),
                (
                    "examples",
                    opt(array(object(vec![("label", opt(string())), ("code", string())], Mode::Passthrough))),
                ),
                ("notes", opt(array(reference_content_block()))),
            ],
        ),
        Mode::Passthrough,
    )
}

/// `CommandDocKindSchema`.
pub fn command_doc_kind() -> Z {
    object(
        with(
            graph_fields(),
            vec![
                ("type", lit("command")),
                ("name", string_min(1, "name is required")),
                ("displayName", string_min(1, "displayName is required")),
                ("summary", string()),
                ("description", opt(string())),
                ("namespace", opt(string())),
                ("fn", opt(string())),
                (
                    "args",
                    opt(array(object(
                        vec![
                            ("name", Z::Str { checks: vec![StrCheck::Min(1, None)], type_msg: None }),
                            ("param", opt(string())),
                            ("description", opt(string())),
                            ("required", opt(boolean())),
                            ("variadic", opt(boolean())),
                        ],
                        Mode::Passthrough,
                    ))),
                ),
                (
                    "options",
                    opt(array(object(
                        vec![
                            ("flag", Z::Str { checks: vec![StrCheck::Min(1, None)], type_msg: None }),
                            ("param", opt(string())),
                            ("description", opt(string())),
                            ("choices", opt(array(string()))),
                            ("default", opt(union(vec![string(), boolean(), array(string())]))),
                            ("cliOnly", opt(boolean())),
                        ],
                        Mode::Passthrough,
                    ))),
                ),
                ("subcommands", opt(array(string()))),
                (
                    "examples",
                    opt(array(object(
                        vec![("label", opt(string())), ("cli", string()), ("output", opt(string()))],
                        Mode::Passthrough,
                    ))),
                ),
                ("exitCodes", opt(array(object(vec![("code", number()), ("when", string())], Mode::Passthrough)))),
                ("outsideProject", opt(enum_(&["same", "refuse", "own"]))),
                ("related", opt(array(string()))),
                ("notes", opt(array(reference_content_block()))),
            ],
        ),
        Mode::Passthrough,
    )
}

/// `EnumDocKindSchema`.
pub fn enum_doc_kind() -> Z {
    object(
        with(
            graph_fields(),
            vec![
                ("type", lit("enum")),
                ("name", string_min(1, "name is required")),
                ("displayName", string_min(1, "displayName is required")),
                ("description", string()),
                ("namespace", opt(string())),
                (
                    "members",
                    array(object(
                        vec![
                            ("value", string_min(1, "member value is required")),
                            ("description", string()),
                            ("deprecated", opt(string())),
                            ("stability", opt(lit("experimental"))),
                        ],
                        Mode::Passthrough,
                    )),
                ),
            ],
        ),
        Mode::Passthrough,
    )
}

const AUTHORED_KINDS: [&str; 10] =
    ["component", "function", "generic", "page", "block", "schema", "command", "enum", "namespace", "icon-definition"];

/// `NamespaceDocKindSchema`.
pub fn namespace_doc_kind() -> Z {
    let slot = object(
        vec![
            ("title", ne()),
            (
                "accepts",
                object(
                    vec![("kinds", array_min(enum_(&AUTHORED_KINDS), 1)), ("providers", opt(enum_(&["same", "configured"])))],
                    Mode::Strict,
                ),
            ),
        ],
        Mode::Strict,
    );
    let slots = Z::Record {
        key: Box::new(ne()),
        value: Box::new(slot),
        refines: vec![(
            Arc::new(|v: &Value, out: &mut Vec<Issue>| {
                if v.as_object().map(|m| m.is_empty()).unwrap_or(false) {
                    out.push(custom(vec![], "at least one slot is required".into()));
                }
            }),
            None,
        )],
    };
    object(
        with(
            graph_fields(),
            vec![
                ("type", lit("namespace")),
                ("name", ne()),
                ("title", ne()),
                ("summary", ne()),
                ("keywords", opt(array(ne()))),
                ("slots", slots),
                (
                    "adopts",
                    opt(array(object(
                        vec![
                            (
                                "source",
                                object(
                                    vec![
                                        ("group", ne()),
                                        ("kinds", opt(array_min(enum_(&AUTHORED_KINDS), 1))),
                                        ("packages", opt(lit("all"))),
                                    ],
                                    Mode::Strict,
                                ),
                            ),
                            ("into", ne()),
                            ("groupBy", opt(lit("kind"))),
                        ],
                        Mode::Strict,
                    ))),
                ),
                ("blocks", opt(array(namespace_content_block()))),
            ],
        ),
        Mode::Strict,
    )
    .refine(Arc::new(|d: &Value, out: &mut Vec<Issue>| {
        let empty = Map::new();
        let slots = d.get("slots").and_then(|s| s.as_object()).unwrap_or(&empty);
        if let Some(Value::Array(adopts)) = d.get("adopts") {
            for (i, rule) in adopts.iter().enumerate() {
                let into = super::paths::js_string(rule.get("into"));
                let path = vec![Seg::Key("adopts".into()), Seg::Index(i), Seg::Key("into".into())];
                let Some(slot) = slots.get(&into) else {
                    out.push(custom(path, format!("must name a declared slot; received \"{into}\"")));
                    continue;
                };
                let kinds: Vec<String> = if rule.get("groupBy").and_then(|g| g.as_str()) == Some("kind") {
                    vec!["namespace".into()]
                } else {
                    rule.get("source")
                        .and_then(|s| s.get("kinds"))
                        .and_then(|k| k.as_array())
                        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                        .unwrap_or_default()
                };
                let accepts: Vec<&str> = slot
                    .get("accepts")
                    .and_then(|a| a.get("kinds"))
                    .and_then(|k| k.as_array())
                    .map(|a| a.iter().filter_map(|x| x.as_str()).collect())
                    .unwrap_or_default();
                for k in kinds {
                    if !accepts.contains(&k.as_str()) {
                        out.push(custom(
                            path.clone(),
                            format!("slot \"{into}\" does not accept adopted kind \"{k}\""),
                        ));
                    }
                }
            }
        }
        if let Some(Value::Array(blocks)) = d.get("blocks") {
            for (i, b) in blocks.iter().enumerate() {
                if b.get("type").and_then(|t| t.as_str()) == Some("collection") {
                    let slot = super::paths::js_string(b.get("source").and_then(|s| s.get("slot")));
                    if !slots.contains_key(&slot) {
                        out.push(custom(
                            vec![
                                Seg::Key("blocks".into()),
                                Seg::Index(i),
                                Seg::Key("source".into()),
                                Seg::Key("slot".into()),
                            ],
                            format!("must name a declared slot; received \"{slot}\""),
                        ));
                    }
                }
            }
        }
    }))
}

fn legacy_base() -> Vec<(&'static str, Z)> {
    with(
        graph_fields(),
        vec![
            ("name", string_min(1, "name is required")),
            ("displayName", opt(string())),
            ("description", opt(string())),
            ("group", opt(string())),
            ("category", opt(string())),
            ("keywords", opt(array(string()))),
            ("isHiddenFromOverview", opt(boolean())),
            ("hidden", opt(boolean())),
            ("hiddenComponents", opt(array(string()))),
            ("usage", opt(unknown())),
            ("playground", opt(unknown())),
            ("theming", opt(unknown())),
            ("examples", opt(array(unknown()))),
            ("showcase", opt(unknown())),
            ("parent", opt(string())),
            ("relatedDocs", opt(array(string()))),
            ("relatedComponents", opt(array(string()))),
            ("relatedHooks", opt(array(string()))),
        ],
    )
}

/// `LegacyDocSchema`.
pub fn legacy_doc() -> Z {
    let reference = object(
        with(
            legacy_base(),
            vec![
                ("title", ne()),
                ("description", string()),
                ("keywords", opt(array(string()))),
                ("sections", array_min(reference_section(), 1)),
                ("replaces", opt(ne())),
                ("extends", opt(ne())),
                ("tokenCategory", opt(string())),
            ],
        ),
        Mode::Passthrough,
    )
    .refine(Arc::new(replaces_extends_and_ids));
    let single = object(
        with(legacy_base(), vec![("props", array(prop())), ("deprecated", opt(deprecation()))]),
        Mode::Passthrough,
    );
    let multi = object(
        with(legacy_base(), vec![("components", array(unknown())), ("deprecated", opt(deprecation()))]),
        Mode::Passthrough,
    );
    let hook = object(with(legacy_base(), vec![("params", array(param())), ("returns", array(ret()))]), Mode::Passthrough);
    let sub = object(
        with(
            legacy_base(),
            vec![
                ("subComponentOf", string_min(1, "subComponentOf is required")),
                ("description", string()),
                ("props", array(prop())),
                ("deprecated", opt(deprecation())),
            ],
        ),
        Mode::Passthrough,
    );
    union(vec![sub, hook, multi, single, reference])
}

fn template_envelope() -> Z {
    let preview = object(vec![("image", opt(string())), ("aspectRatio", opt(string()))], Mode::Strict);
    let registry = object(
        vec![
            ("slug", opt(string().check(StrCheck::Regex(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", "", None)))),
            (
                "aliases",
                opt(array(string().check(StrCheck::Regex(
                    r"^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$",
                    "",
                    None,
                )))),
            ),
        ],
        Mode::Strict,
    );
    let icons = Z::Record {
        key: Box::new(string().check(StrCheck::Regex(r"^[$A-Z_a-z][$\w]*$", "u", Some("icons keys are imported names".into())))),
        value: Box::new(string().check(StrCheck::Regex(
            r"^[a-z][a-zA-Z0-9]*$",
            "u",
            Some("icons values are icon definition names".into()),
        ))),
        refines: vec![],
    };
    let base = with(
        graph_fields(),
        vec![
            ("name", string_min(1, "name is required")),
            ("displayName", opt(Z::Str { checks: vec![StrCheck::Min(1, None)], type_msg: None })),
            ("description", opt(string_min(1, "description is required"))),
            ("keywords", opt(array(Z::Str { checks: vec![StrCheck::Min(1, None)], type_msg: None }))),
            ("category", opt(string())),
            ("componentsUsed", opt(array(string()))),
            ("preview", opt(preview)),
            ("isReady", opt(boolean())),
            ("icons", opt(icons)),
            ("scaffold", opt(boolean())),
            ("isHiddenFromOverview", opt(boolean())),
            ("registry", opt(registry)),
            ("replaces", opt(string_min(1, "replaces must name a Core template id"))),
        ],
    );
    let page = object(with(base.clone(), vec![("type", lit("page"))]), Mode::Strict);
    let block = object(
        with(
            base,
            vec![
                ("type", lit("block")),
                ("exampleFor", opt(Z::Str { checks: vec![StrCheck::Min(1, None)], type_msg: None })),
                ("alsoExampleFor", opt(array(string()))),
                ("alsoShowcaseFor", opt(array(string()))),
                ("aspectRatio", opt(positive())),
                ("scale", opt(positive())),
                ("isShowcase", opt(boolean())),
            ],
        ),
        Mode::Strict,
    );
    disc("type", vec![page, block])
}

fn theme_doc() -> Z {
    fn not_blank(s: &str) -> bool {
        !s.trim_matches(super::paths::js_ws).is_empty()
    }
    object(
        vec![
            ("type", lit("theme")),
            (
                "name",
                string()
                    .check(StrCheck::Refine(not_blank, "name must not be blank".into(), true))
                    .check(StrCheck::Regex(
                        r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
                        "u",
                        Some("name must be lowercase kebab-case starting with a letter".into()),
                    )),
            ),
            ("displayName", string().check(StrCheck::Refine(not_blank, "displayName must not be blank".into(), true))),
            ("description", string()),
            ("maintained", boolean()),
        ],
        Mode::Strict,
    )
}

fn icon_definition_doc() -> Z {
    fn not_blank(s: &str) -> bool {
        !s.trim_matches(super::paths::js_ws).is_empty()
    }
    fn lower_trimmed(s: &str) -> bool {
        s == s.to_lowercase() && s == s.trim_matches(super::paths::js_ws)
    }
    object(
        vec![
            ("type", lit("icon-definition")),
            (
                "name",
                string()
                    .check(StrCheck::Refine(not_blank, "name must not be blank".into(), true))
                    .check(StrCheck::Regex(
                        r"^[a-z][a-zA-Z0-9]*$",
                        "u",
                        Some("name must be camelCase starting with a lower-case letter".into()),
                    )),
            ),
            ("description", string().check(StrCheck::Refine(not_blank, "description must not be blank".into(), true))),
            (
                "words",
                Z::Array {
                    item: Box::new(
                        string()
                            .check(StrCheck::Refine(not_blank, "word must not be blank".into(), true))
                            .check(StrCheck::Refine(lower_trimmed, "words must be lower-case and trimmed".into(), false)),
                    ),
                    min: Some(1),
                    min_msg: Some("a definition must have at least one word".into()),
                    max: None,
                },
            ),
            ("builtIn", opt(literal(Value::Bool(true)))),
            ("stability", opt(lit("experimental"))),
        ],
        Mode::Strict,
    )
}

fn run(z: &Z, input: &Value, label: &str) -> Result<Value, String> {
    zod::safe_parse(z, input).map_err(|issues| format_zod_error(label, &issues))
}

/// `parseComponent`.
pub fn parse_component(input: &Value, label: &str) -> Result<Value, String> {
    run(&component_doc_kind(), input, label)
}
/// `parseHook` (also `parseFunction`).
pub fn parse_hook(input: &Value, label: &str) -> Result<Value, String> {
    run(&function_doc_kind(), input, label)
}
/// `parseReference`: fills title, description and sections.
pub fn parse_reference(input: &Value, label: &str) -> Result<Value, String> {
    let mut doc = run(&generic_doc_kind(), input, label)?;
    if let Value::Object(m) = &mut doc {
        let title = [m.get("title"), m.get("displayName"), m.get("name")]
            .into_iter()
            .find(|v| !nullish(*v))
            .flatten()
            .cloned()
            .unwrap_or_else(zod::undefined);
        let desc = m.get("description").filter(|v| !nullish(Some(v))).cloned().unwrap_or(Value::String(String::new()));
        let secs = m.get("sections").filter(|v| !nullish(Some(v))).cloned().unwrap_or(Value::Array(vec![]));
        m.insert("title".into(), title);
        m.insert("description".into(), desc);
        m.insert("sections".into(), secs);
    }
    Ok(doc)
}
/// `parseTemplate`.
pub fn parse_template(input: &Value, label: &str) -> Result<Value, String> {
    let (t, mut issues) = zod::parse_all(&template_envelope(), input);
    // superRefine on the union runs unless an issue aborted.
    if !zod::any_aborted(&issues) {
        if t.get("type").and_then(|x| x.as_str()) == Some("block")
            && super::paths::js_truthy(t.get("isShowcase"))
            && !super::paths::js_truthy(t.get("exampleFor"))
        {
            issues.push(custom(vec![Seg::Key("exampleFor".into())], "exampleFor is required when isShowcase is true".into()));
        }
    }
    if issues.is_empty() {
        Ok(t)
    } else {
        Err(format_zod_error(label, &issues))
    }
}
/// `parseSchema`.
pub fn parse_schema(input: &Value, label: &str) -> Result<Value, String> {
    run(&schema_doc_kind(), input, label)
}
/// `parseCommand`.
pub fn parse_command(input: &Value, label: &str) -> Result<Value, String> {
    run(&command_doc_kind(), input, label)
}
/// `parseEnum`.
pub fn parse_enum(input: &Value, label: &str) -> Result<Value, String> {
    run(&enum_doc_kind(), input, label)
}
/// `parseNamespace`.
pub fn parse_namespace(input: &Value, label: &str) -> Result<Value, String> {
    run(&namespace_doc_kind(), input, label)
}

fn with_proto_check(z: &Z, input: &Value, label: &str) -> Result<Value, String> {
    let r = zod::safe_parse(z, input);
    let proto = input.as_object().map(|m| m.contains_key("__proto__")).unwrap_or(false);
    match r {
        Ok(v) if !proto => Ok(v),
        r => {
            let mut issues = r.err().unwrap_or_default();
            if proto {
                issues.push(Issue {
                    code: "unrecognized_keys",
                    path: vec![],
                    message: "Unrecognized key: \"__proto__\"".into(),
                    cont: false,
                });
            }
            Err(format_zod_error(label, &issues))
        }
    }
}
/// `parseTheme`.
pub fn parse_theme(input: &Value, label: &str) -> Result<Value, String> {
    with_proto_check(&theme_doc(), input, label)
}
/// `parseIconDefinition`.
pub fn parse_icon_definition(input: &Value, label: &str) -> Result<Value, String> {
    with_proto_check(&icon_definition_doc(), input, label)
}
/// `parseLegacyDoc`.
pub fn parse_legacy(input: &Value, label: &str) -> Result<Value, String> {
    run(&legacy_doc(), input, label)
}


fn stamped_type(input: &Value) -> Option<&Value> {
    match input {
        Value::Object(m) if super::zod::received(input) == "object" => m.get("type"),
        _ => None,
    }
}

/// `parseDoc(input, label)`.
pub fn parse_doc(input: &Value, label: &str) -> Result<Value, String> {
    match stamped_type(input).and_then(|t| t.as_str()) {
        Some("component") => parse_component(input, label),
        Some("function") => parse_hook(input, label),
        Some("generic") => parse_reference(input, label),
        Some("page") | Some("block") => parse_template(input, label),
        Some("schema") => parse_schema(input, label),
        Some("command") => parse_command(input, label),
        Some("enum") => parse_enum(input, label),
        Some("namespace") => parse_namespace(input, label),
        Some("theme") => parse_theme(input, label),
        Some("icon-set") => super::icon_set_discovery::parse_icon_set(input, label),
        Some("icon-definition") => parse_icon_definition(input, label),
        _ => parse_legacy(input, label),
    }
}

/// `parseReadableDoc(input, label)`: theme descriptors are unsupported.
pub fn parse_readable_doc(input: &Value, label: &str) -> Result<Value, String> {
    if let Some(t) = stamped_type(input) {
        if t.as_str() == Some("theme") {
            return Err(format!("{label} has unsupported type {}.", crate::json::stringify(t, 0)));
        }
    }
    parse_doc(input, label)
}

/// `parserFor(root)` in compile.mjs.
pub fn parser_for(root: &str) -> fn(&Value, &str) -> Result<Value, String> {
    match root {
        "themes" => parse_theme,
        "icon-definitions" => parse_icon_definition,
        "templates" => parse_template,
        _ => parse_readable_doc,
    }
}
