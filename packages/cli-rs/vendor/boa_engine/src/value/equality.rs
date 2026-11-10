use super::{JsBigInt, JsObject, JsResult, JsValue, PreferredType};
#[cfg(feature = "annex-b")]
use crate::builtins::is_html_dda::IsHTMLDDA;
use crate::{Context, JsVariant, builtins::Number};
use std::collections::HashSet;

impl JsValue {
    /// Inner loop of the deep equality comparison, strict.
    pub(crate) fn deep_strict_equals_inner(
        &self,
        other: &Self,
        encounters: &mut HashSet<usize>,
        context: &mut Context,
    ) -> JsResult<bool> {
        match (self.as_object(), other.as_object()) {
            (None, None) => Ok(self.strict_equals(other)),
            (Some(x), Some(y)) => JsObject::deep_strict_equals_inner(&x, &y, encounters, context),
            _ => Ok(false),
        }
    }

    /// Deep strict equality.
    ///
    /// If the value is an object/array, also compare the key-values.
    /// It uses `strict_equals()` for non-object values.
    pub fn deep_strict_equals(&self, other: &Self, context: &mut Context) -> JsResult<bool> {
        self.deep_strict_equals_inner(other, &mut HashSet::new(), context)
    }

    /// Strict equality comparison.
    ///
    /// This method is executed when doing strict equality comparisons with the `===` operator.
    /// For more information, check <https://tc39.es/ecma262/#sec-strict-equality-comparison>.
    #[must_use]
    pub fn strict_equals(&self, other: &Self) -> bool {
        // 1. If Type(x) is different from Type(y), return false.
        if self.get_type() != other.get_type() {
            return false;
        }

        match (self.variant(), other.variant()) {
            // 2. If Type(x) is Number or BigInt, then
            //    a. Return ! Type(x)::equal(x, y).
            (JsVariant::BigInt(x), JsVariant::BigInt(y)) => JsBigInt::equal(&x, &y),
            (JsVariant::Float64(x), JsVariant::Float64(y)) => Number::equal(x, y),
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => Number::equal(x, f64::from(y)),
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => Number::equal(f64::from(x), y),
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => x == y,

            //Null has to be handled specially because "typeof null" returns object and if we managed
            //this without a special case we would compare self and other as if they were actually
            //objects which unfortunately fails
            //Specification Link: https://tc39.es/ecma262/#sec-typeof-operator
            (JsVariant::Null, JsVariant::Null) => true,

            // 3. Return ! SameValueNonNumeric(x, y).
            (_, _) => Self::same_value_non_numeric(self, other),
        }
    }

    /// Abstract equality comparison.
    ///
    /// This method is executed when doing abstract equality comparisons with the `==` operator.
    ///  For more information, check <https://tc39.es/ecma262/#sec-abstract-equality-comparison>
    #[allow(clippy::float_cmp)]
    pub fn equals(&self, other: &Self, context: &mut Context) -> JsResult<bool> {
        // 1. If Type(x) is the same as Type(y), then
        //     a. Return the result of performing Strict Equality Comparison x === y.
        if self.get_type() == other.get_type() {
            return Ok(self.strict_equals(other));
        }

        Ok(match (self.variant(), other.variant()) {
            // 2. If x is null and y is undefined, return true.
            // 3. If x is undefined and y is null, return true.
            (JsVariant::Null, JsVariant::Undefined) | (JsVariant::Undefined, JsVariant::Null) => {
                true
            }

            // B.3.6.2: Objects with [[IsHTMLDDA]] are loosely equal to null and undefined.
            #[cfg(feature = "annex-b")]
            (JsVariant::Object(ref obj), JsVariant::Null | JsVariant::Undefined)
                if obj.is::<IsHTMLDDA>() =>
            {
                true
            }
            #[cfg(feature = "annex-b")]
            (JsVariant::Null | JsVariant::Undefined, JsVariant::Object(ref obj))
                if obj.is::<IsHTMLDDA>() =>
            {
                true
            }

            // 3. If Type(x) is Number and Type(y) is String, return the result of the comparison x == ! ToNumber(y).
            // 4. If Type(x) is String and Type(y) is Number, return the result of the comparison ! ToNumber(x) == y.
            //
            // https://github.com/rust-lang/rust/issues/54883
            (
                JsVariant::Integer32(_) | JsVariant::Float64(_),
                JsVariant::String(_) | JsVariant::Boolean(_),
            )
            | (JsVariant::String(_), JsVariant::Integer32(_) | JsVariant::Float64(_)) => {
                let x = self.to_number(context)?;
                let y = other.to_number(context)?;
                Number::equal(x, y)
            }

            // 6. If Type(x) is BigInt and Type(y) is String, then
            //    a. Let n be ! StringToBigInt(y).
            //    b. If n is NaN, return false.
            //    c. Return the result of the comparison x == n.
            (JsVariant::BigInt(a), JsVariant::String(b)) => JsBigInt::from_js_string(&b) == Some(a),

            // 7. If Type(x) is String and Type(y) is BigInt, return the result of the comparison y == x.
            (JsVariant::String(a), JsVariant::BigInt(b)) => JsBigInt::from_js_string(&a) == Some(b),

            // 8. If Type(x) is Boolean, return the result of the comparison ! ToNumber(x) == y.
            (JsVariant::Boolean(x), _) => {
                return other.equals(&JsValue::new(i32::from(x)), context);
            }

            // 9. If Type(y) is Boolean, return the result of the comparison x == ! ToNumber(y).
            (_, JsVariant::Boolean(y)) => return self.equals(&JsValue::new(i32::from(y)), context),

            // 10. If Type(x) is either String, Number, BigInt, or Symbol and Type(y) is Object, return the result
            // of the comparison x == ? ToPrimitive(y).
            (
                JsVariant::Object(_),
                JsVariant::String(_)
                | JsVariant::Float64(_)
                | JsVariant::Integer32(_)
                | JsVariant::BigInt(_)
                | JsVariant::Symbol(_),
            ) => {
                let primitive = self.to_primitive(context, PreferredType::Default)?;
                return Ok(primitive
                    .equals(other, context)
                    .expect("should not fail according to spec"));
            }

            // 11. If Type(x) is Object and Type(y) is either String, Number, BigInt, or Symbol, return the result
            // of the comparison ? ToPrimitive(x) == y.
            (
                JsVariant::String(_)
                | JsVariant::Float64(_)
                | JsVariant::Integer32(_)
                | JsVariant::BigInt(_)
                | JsVariant::Symbol(_),
                JsVariant::Object(_),
            ) => {
                let primitive = other.to_primitive(context, PreferredType::Default)?;
                return Ok(primitive
                    .equals(self, context)
                    .expect("should not fail according to spec"));
            }

            // 12. If Type(x) is BigInt and Type(y) is Number, or if Type(x) is Number and Type(y) is BigInt, then
            //    a. If x or y are any of NaN, +∞, or -∞, return false.
            //    b. If the mathematical value of x is equal to the mathematical value of y, return true; otherwise return false.
            (JsVariant::BigInt(a), JsVariant::Float64(b)) => a == b,
            (JsVariant::Float64(a), JsVariant::BigInt(b)) => a == b,
            (JsVariant::BigInt(a), JsVariant::Integer32(b)) => a == b,
            (JsVariant::Integer32(a), JsVariant::BigInt(b)) => a == b,

            // 13. Return false.
            _ => false,
        })
    }

    /// Abstract non-equality comparison.
    ///
    /// This method is executed when doing abstract equality comparisons with the `!=` operator.
    /// It uses [`Self::equals`] to perform the comparison and negates the result.
    pub fn not_equals(&self, other: &Self, context: &mut Context) -> JsResult<bool> {
        Ok(!self.equals(other, context)?)
    }

    /// The internal comparison abstract operation SameValue(x, y),
    /// where x and y are ECMAScript language values, produces true or false.
    ///
    /// More information:
    ///  - [ECMAScript][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-samevalue
    #[must_use]
    pub fn same_value(x: &Self, y: &Self) -> bool {
        // 1. If Type(x) is different from Type(y), return false.
        if x.get_type() != y.get_type() {
            return false;
        }

        match (x.variant(), y.variant()) {
            // 2. If Type(x) is Number or BigInt, then
            //    a. Return ! Type(x)::SameValue(x, y).
            (JsVariant::BigInt(x), JsVariant::BigInt(y)) => JsBigInt::same_value(&x, &y),
            (JsVariant::Float64(x), JsVariant::Float64(y)) => Number::same_value(x, y),
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => Number::same_value(x, f64::from(y)),
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => Number::same_value(f64::from(x), y),
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => x == y,

            // 3. Return ! SameValueNonNumeric(x, y).
            (_, _) => Self::same_value_non_numeric(x, y),
        }
    }

    /// The internal comparison abstract operation `SameValueZero(x, y)`,
    /// where `x` and `y` are ECMAScript language values, produces `true` or `false`.
    ///
    /// `SameValueZero` differs from `SameValue` only in its treatment of `+0` and `-0`.
    ///
    /// More information:
    ///  - [ECMAScript][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-samevaluezero
    #[must_use]
    pub fn same_value_zero(x: &Self, y: &Self) -> bool {
        if x.get_type() != y.get_type() {
            return false;
        }

        match (x.variant(), y.variant()) {
            // 2. If Type(x) is Number or BigInt, then
            //    a. Return ! Type(x)::SameValueZero(x, y).
            (JsVariant::BigInt(x), JsVariant::BigInt(y)) => JsBigInt::same_value_zero(&x, &y),

            (JsVariant::Float64(x), JsVariant::Float64(y)) => Number::same_value_zero(x, y),
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => {
                Number::same_value_zero(x, f64::from(y))
            }
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => {
                Number::same_value_zero(f64::from(x), y)
            }
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => x == y,

            // 3. Return ! SameValueNonNumeric(x, y).
            (_, _) => Self::same_value_non_numeric(x, y),
        }
    }

    fn same_value_non_numeric(x: &Self, y: &Self) -> bool {
        debug_assert_eq!(x.get_type(), y.get_type());
        match (x.variant(), y.variant()) {
            (JsVariant::Null, JsVariant::Null) | (JsVariant::Undefined, JsVariant::Undefined) => {
                true
            }
            (JsVariant::String(x), JsVariant::String(y)) => x == y,
            (JsVariant::Boolean(x), JsVariant::Boolean(y)) => x == y,
            (JsVariant::Object(x), JsVariant::Object(y)) => JsObject::equals(&x, &y),
            (JsVariant::Symbol(x), JsVariant::Symbol(y)) => x == y,
            _ => false,
        }
    }
}
