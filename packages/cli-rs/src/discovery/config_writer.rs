//! Port of `foundation/config/config-writer.mjs`: `setConfigString`, which
//! sets one string key (a dotted path into nested objects) in the project's
//! `astryx.config.*` with recast's output, through the integration
//! manifest writer's recast reproduction.

use super::nodepath as np;
use crate::commands::integration::manifest_writer::{self as mw, NewNode, Target, ValInfo};

/// What `setConfigString` did.
#[derive(Debug, Clone, PartialEq)]
pub struct ConfigWrite {
    pub file: String,
    pub created: bool,
    pub previous: Option<String>,
    pub changed: bool,
}

/// An error with its JS `code` (`ERR_CODEMOD_PROTECTED` for a protected file).
#[derive(Debug, Clone, PartialEq)]
pub struct ConfigWriteError {
    pub message: String,
    pub code: Option<String>,
}

fn plain(message: String) -> ConfigWriteError {
    ConfigWriteError { message, code: None }
}

fn assert_writable(project_dir: &str, file: &str) -> Result<(), ConfigWriteError> {
    let resolver = super::file_protection::FileProtectionResolver::new(project_dir, &[]).map_err(|e| plain(e.message.clone()))?;
    let protections = resolver.classify(file).map_err(|e| plain(e.message.clone()))?;
    if protections.is_empty() {
        return Ok(());
    }
    let declarations = protections.iter().map(|p| p.declaration.clone()).collect::<Vec<_>>().join("; ");
    Err(ConfigWriteError {
        message: format!("Could not update {}: it is protected by {declarations}. Set the value at its source yourself.", np::basename(file)),
        code: Some("ERR_CODEMOD_PROTECTED".into()),
    })
}

fn write_atomically(file: &str, text: &str) -> Result<(), ConfigWriteError> {
    let tmp = np::join2(&np::dirname(file), &format!(".{}.tmp-{}", np::basename(file), std::process::id()));
    if let Err(e) = std::fs::write(&tmp, text).and_then(|_| std::fs::rename(&tmp, file)) {
        let _ = std::fs::remove_file(&tmp);
        return Err(plain(e.to_string()));
    }
    Ok(())
}

/// The span of the value of the object property that starts at `start`.
fn property_value_span(source: &str, start: u32) -> Option<(u32, u32)> {
    use oxc::allocator::Allocator;
    use oxc::ast::ast::ObjectProperty;
    use oxc::ast_visit::{walk, Visit};
    use oxc::parser::{ParseOptions, Parser};
    use oxc::span::{GetSpan, SourceType};
    struct V {
        start: u32,
        found: Option<(u32, u32)>,
    }
    impl<'a> Visit<'a> for V {
        fn visit_object_property(&mut self, p: &ObjectProperty<'a>) {
            if p.span.start == self.start && self.found.is_none() {
                let s = p.value.span();
                self.found = Some((s.start, s.end));
            }
            walk::walk_object_property(self, p);
        }
    }
    let alloc = Allocator::default();
    let ret = Parser::new(&alloc, source, SourceType::tsx()).with_options(ParseOptions { preserve_parens: false, ..ParseOptions::default() }).parse();
    let mut v = V { start, found: None };
    v.visit_program(&ret.program);
    v.found
}

/// `setConfigString(projectDir, key, value)`.
pub fn set_config_string(project_dir: &str, key: &str, value: &str) -> Result<ConfigWrite, ConfigWriteError> {
    let keys: Vec<&str> = key.split('.').collect();
    let leaf = *keys.last().unwrap();
    let existing = super::project::CONFIG_BASENAMES.iter().map(|n| np::join2(project_dir, n)).find(|f| np::exists(f));
    let Some(existing) = existing else {
        let file = np::join2(project_dir, "astryx.config.mjs");
        assert_writable(project_dir, &file)?;
        let quoted = format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'"));
        let parents = &keys[..keys.len() - 1];
        let open: String = parents.iter().enumerate().map(|(d, k)| format!("{}{k}: {{\n", "  ".repeat(d + 1))).collect();
        let close: String = (0..parents.len()).rev().map(|d| format!("{}}},\n", "  ".repeat(d + 1))).collect();
        write_atomically(&file, &format!("export default {{\n{open}{}{leaf}: {quoted},\n{close}}};\n", "  ".repeat(keys.len())))?;
        return Ok(ConfigWrite { file, created: true, previous: None, changed: true });
    };
    assert_writable(project_dir, &existing)?;
    let base = np::basename(&existing);
    let source = np::read_text(&existing).ok_or_else(|| plain(format!("ENOENT: no such file or directory, open '{existing}'")))?;
    let refuse = || plain(format!("Could not update {base} safely: its default export is not a static object literal. Set \"{key}: '{value}'\" in it yourself."));
    let an = mw::analyze(&source).map_err(|e| plain(e))?;
    let Some(root) = an.root.clone() else { return Err(refuse()) };
    let no_spread = |o: &mw::ObjInfo, where_: &str| -> Result<(), ConfigWriteError> {
        if o.props.iter().any(|p| p.spread) {
            return Err(plain(format!(
                "Could not update {base} safely: {where_} spreads another object (`...`), whose keys a written \"{key}\" could replace. Set \"{key}: '{value}'\" in it yourself."
            )));
        }
        Ok(())
    };
    no_spread(&root, "its default export")?;
    let mut object = root;
    for (i, each) in keys[..keys.len() - 1].iter().enumerate() {
        let holder = object.props.iter().find(|p| p.named(each)).cloned();
        match holder {
            None => {
                // Every key from here on opens a new object holding the next.
                let mut node = NewNode::Str(value.to_string());
                let mut name = leaf.to_string();
                for k in keys[i + 1..keys.len() - 1].iter().rev() {
                    node = NewNode::Object(vec![(name, node)]);
                    name = k.to_string();
                }
                let next = mw::append_member(&an, Target::Object(&object), NewNode::Object(vec![(each.to_string(), NewNode::Object(vec![(name, node)]))]));
                write_atomically(&existing, &next)?;
                return Ok(ConfigWrite { file: existing, created: false, previous: None, changed: true });
            }
            Some(h) => match h.value.as_deref() {
                Some(ValInfo::Object(o)) => {
                    no_spread(o, &format!("its \"{each}\" object"))?;
                    object = o.clone();
                }
                _ => return Err(refuse()),
            },
        }
    }
    let property = object.props.iter().find(|p| p.named(leaf)).cloned();
    let Some(property) = property else {
        let next = mw::append_member(&an, Target::Object(&object), NewNode::Object(vec![(leaf.to_string(), NewNode::Str(value.to_string()))]));
        write_atomically(&existing, &next)?;
        return Ok(ConfigWrite { file: existing, created: false, previous: None, changed: true });
    };
    let previous = property.string_value.clone();
    if previous.as_deref() == Some(value) {
        return Ok(ConfigWrite { file: existing, created: false, previous, changed: false });
    }
    let (vs, ve) = property_value_span(&source, property.start).ok_or_else(refuse)?;
    let mut next = format!("{}{}{}", &source[..vs as usize], mw::single_quote(value), &source[ve as usize..]);
    if source.ends_with('\n') && !next.ends_with('\n') {
        next.push('\n');
    }
    write_atomically(&existing, &next)?;
    Ok(ConfigWrite { file: existing, created: false, previous, changed: true })
}
