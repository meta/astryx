use std::fmt;

/// Formats a rational (floating-point) number for display.
///
/// This is different from the ECMAScript compliant number to string, in the printing of `-0`.
///
/// This function prints `-0` as `-0` instead of positive `0` as the specification says.
/// This is done to make it easier for the user of the REPL to identify what is a `-0` vs `0`,
/// since the REPL is not bound to the ECMAScript specification, we can do this.
pub(super) fn format_rational(v: f64, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    if v.is_sign_negative() && v == 0.0 {
        f.write_str("-0")
    } else {
        let mut buffer = ryu_js::Buffer::new();
        f.write_str(buffer.format(v))
    }
}
