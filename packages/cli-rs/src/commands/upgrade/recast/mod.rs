//! A Rust port of the parts of recast (and the jscodeshift parsers) the
//! codemods use: parse to a Babel-shaped tree, then print it back reusing
//! the original text for every node a transform left alone.

pub mod ast;
pub mod comments;
pub mod convert;
pub mod lines;
pub mod patcher;
pub mod path;
pub mod print_more;
pub mod print_nodes;
pub mod printer;
pub mod types;

pub use ast::{Ast, NodeId, V};
pub use convert::{parse, Mode, ParseError};
pub use printer::{to_source, Config, Quote};

/// The tree as JSON in the shape of Babel's (no locations, no comments),
/// for checking the converter against Babel during development.
pub fn debug_json(ast: &Ast, id: NodeId) -> serde_json::Value {
    use serde_json::{Map, Value};
    fn val(ast: &Ast, v: &V) -> Value {
        match v {
            V::Undef => Value::Null,
            V::Null => Value::Null,
            V::Bool(b) => Value::Bool(*b),
            V::Num(n) => serde_json::Number::from_f64(*n).map(Value::Number).unwrap_or(Value::Null),
            V::Str(s) => Value::String(s.to_string()),
            V::Node(n) => debug_json(ast, *n),
            V::Arr(a) => Value::Array(a.iter().map(|x| val(ast, x)).collect()),
            V::Obj(o) => {
                let mut m = Map::new();
                for (k, x) in o {
                    m.insert(k.to_string(), val(ast, x));
                }
                Value::Object(m)
            }
        }
    }
    let n = ast.node(id);
    let mut m = Map::new();
    m.insert("type".into(), Value::String(n.ty.into()));
    if let Some(s) = n.start {
        m.insert("start".into(), (s as u64).into());
    }
    if let Some(e) = n.end {
        m.insert("end".into(), (e as u64).into());
    }
    for (k, v) in &n.fields {
        if *k == "comments" || *k == "leading" || *k == "trailing" {
            continue;
        }
        m.insert(k.to_string(), val(ast, v));
    }
    Value::Object(m)
}
