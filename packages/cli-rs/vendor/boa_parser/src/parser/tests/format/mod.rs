mod declaration;
mod expression;
mod function;
mod statement;

/// This parses the given source code, and then makes sure that
/// the resulting `StatementList` is formatted in the same manner
/// as the source code. This is expected to have a preceding
/// newline.
///
/// This is a utility function for tests. It was made in case people
/// are using different indents in their source files. This fixes
/// any strings which may have been changed in a different indent
/// level.
#[cfg(test)]
fn test_formatting(source: &'static str) {
    // Remove preceding newline.

    use crate::{Parser, Source};
    use boa_ast::scope::Scope;
    use boa_interner::{Interner, ToInternedString};
    let source = &source[1..];

    // Find out how much the code is indented
    let first_line = &source[..source.find('\n').unwrap()];
    let trimmed_first_line = first_line.trim();
    let characters_to_remove = first_line.len() - trimmed_first_line.len();

    let scenario = source
        .lines()
        .map(|l| &l[characters_to_remove..]) // Remove preceding whitespace from each line
        .collect::<Vec<&'static str>>()
        .join("\n");
    let source = Source::from_bytes(source);
    let interner = &mut Interner::default();
    let result = Parser::new(source)
        .parse_script(&Scope::new_global(), interner)
        .expect("parsing failed")
        .to_interned_string(interner);
    if scenario != result {
        eprint!("========= Expected:\n{scenario}");
        eprint!("========= Got:\n{result}");
        // Might be helpful to find differing whitespace
        eprintln!("========= Expected: {scenario:?}");
        eprintln!("========= Got:      {result:?}");
        panic!("parsing test did not give the correct result (see above)");
    }
}
