use crate::{
    Context, JsBigInt, JsResult, JsValue, JsVariant,
    builtins::{
        Number,
        number::{f64_to_int32, f64_to_uint32},
    },
    error::JsNativeError,
    js_string,
    value::{JsSymbol, Numeric, PreferredType},
};

impl JsValue {
    /// Perform the binary `+` operator on the value and return the result.
    pub fn add(&self, other: &Self, context: &mut Context) -> JsResult<Self> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path:
            // Numeric add
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => x
                .checked_add(y)
                .map_or_else(|| Self::new(f64::from(x) + f64::from(y)), Self::new),
            (JsVariant::Float64(x), JsVariant::Float64(y)) => Self::new(x + y),
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => Self::new(f64::from(x) + y),
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => Self::new(x + f64::from(y)),
            (JsVariant::BigInt(x), JsVariant::BigInt(y)) => Self::new(JsBigInt::add(&x, &y)),

            // String concat
            (JsVariant::String(x), JsVariant::String(y)) => Self::from(js_string!(&x, &y)),

            // Slow path:
            (_, _) => {
                let x = self.to_primitive(context, PreferredType::Default)?;
                let y = other.to_primitive(context, PreferredType::Default)?;
                match (x.variant(), y.variant()) {
                    (JsVariant::String(x), _) => Self::from(js_string!(&x, &y.to_string(context)?)),
                    (_, JsVariant::String(y)) => Self::from(js_string!(&x.to_string(context)?, &y)),
                    (_, _) => {
                        match (x.to_numeric(context)?, y.to_numeric(context)?) {
                            (Numeric::Number(x), Numeric::Number(y)) => Self::new(x + y),
                            (Numeric::BigInt(ref x), Numeric::BigInt(ref y)) => {
                                Self::new(JsBigInt::add(x, y))
                            }
                            (_, _) => return Err(JsNativeError::typ()
                                .with_message(
                                    "Cannot mix BigInt and other types, use explicit conversions",
                                )
                                .into()),
                        }
                    }
                }
            }
        })
    }

    /// Perform the binary `-` operator on the value and return the result.
    pub fn sub(&self, other: &Self, context: &mut Context) -> JsResult<Self> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path:
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => x
                .checked_sub(y)
                .map_or_else(|| Self::new(f64::from(x) - f64::from(y)), Self::new),
            (JsVariant::Float64(x), JsVariant::Float64(y)) => Self::new(x - y),
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => Self::new(f64::from(x) - y),
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => Self::new(x - f64::from(y)),

            (JsVariant::BigInt(x), JsVariant::BigInt(y)) => Self::new(JsBigInt::sub(&x, &y)),

            // Slow path:
            (_, _) => match (self.to_numeric(context)?, other.to_numeric(context)?) {
                (Numeric::Number(a), Numeric::Number(b)) => Self::new(a - b),
                (Numeric::BigInt(ref x), Numeric::BigInt(ref y)) => Self::new(JsBigInt::sub(x, y)),
                (_, _) => {
                    return Err(JsNativeError::typ()
                        .with_message("Cannot mix BigInt and other types, use explicit conversions")
                        .into());
                }
            },
        })
    }

    /// Perform the binary `*` operator on the value and return the result.
    pub fn mul(&self, other: &Self, context: &mut Context) -> JsResult<Self> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path:
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => x
                .checked_mul(y)
                // Check for the special case of `0 * -N` which must produce `-0.0`
                .filter(|v| *v != 0 || i32::min(x, y) >= 0)
                .map_or_else(|| Self::new(f64::from(x) * f64::from(y)), Self::new),
            (JsVariant::Float64(x), JsVariant::Float64(y)) => Self::new(x * y),
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => Self::new(f64::from(x) * y),
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => Self::new(x * f64::from(y)),

            (JsVariant::BigInt(x), JsVariant::BigInt(y)) => Self::new(JsBigInt::mul(&x, &y)),

            // Slow path:
            (_, _) => match (self.to_numeric(context)?, other.to_numeric(context)?) {
                (Numeric::Number(a), Numeric::Number(b)) => Self::new(a * b),
                (Numeric::BigInt(ref x), Numeric::BigInt(ref y)) => Self::new(JsBigInt::mul(x, y)),
                (_, _) => {
                    return Err(JsNativeError::typ()
                        .with_message("Cannot mix BigInt and other types, use explicit conversions")
                        .into());
                }
            },
        })
    }

    /// Perform the binary `/` operator on the value and return the result.
    pub fn div(&self, other: &Self, context: &mut Context) -> JsResult<Self> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path:
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => x
                .checked_div(y)
                .filter(|div| y * div == x)
                .map_or_else(|| Self::new(f64::from(x) / f64::from(y)), Self::new),
            (JsVariant::Float64(x), JsVariant::Float64(y)) => Self::new(x / y),
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => Self::new(f64::from(x) / y),
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => Self::new(x / f64::from(y)),

            (JsVariant::BigInt(x), JsVariant::BigInt(y)) => {
                if y.is_zero() {
                    return Err(JsNativeError::range()
                        .with_message("BigInt division by zero")
                        .into());
                }
                Self::new(JsBigInt::div(&x, &y))
            }

            // Slow path:
            (_, _) => match (self.to_numeric(context)?, other.to_numeric(context)?) {
                (Numeric::Number(a), Numeric::Number(b)) => Self::new(a / b),
                (Numeric::BigInt(ref x), Numeric::BigInt(ref y)) => {
                    if y.is_zero() {
                        return Err(JsNativeError::range()
                            .with_message("BigInt division by zero")
                            .into());
                    }
                    Self::new(JsBigInt::div(x, y))
                }
                (_, _) => {
                    return Err(JsNativeError::typ()
                        .with_message("Cannot mix BigInt and other types, use explicit conversions")
                        .into());
                }
            },
        })
    }

    /// Perform the binary `%` operator on the value and return the result.
    pub fn rem(&self, other: &Self, context: &mut Context) -> JsResult<Self> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path:
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => {
                if y == 0 {
                    Self::nan()
                } else {
                    match x % y {
                        rem if rem == 0 && x < 0 => Self::new(-0.0),
                        rem => Self::new(rem),
                    }
                }
            }
            (JsVariant::Float64(x), JsVariant::Float64(y)) => Self::new((x % y).copysign(x)),
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => {
                let x = f64::from(x);
                Self::new((x % y).copysign(x))
            }

            (JsVariant::Float64(x), JsVariant::Integer32(y)) => {
                Self::new((x % f64::from(y)).copysign(x))
            }

            (JsVariant::BigInt(x), JsVariant::BigInt(y)) => {
                if y.is_zero() {
                    return Err(JsNativeError::range()
                        .with_message("BigInt division by zero")
                        .into());
                }
                Self::new(JsBigInt::rem(&x, &y))
            }

            // Slow path:
            (_, _) => match (self.to_numeric(context)?, other.to_numeric(context)?) {
                (Numeric::Number(a), Numeric::Number(b)) => Self::new(a % b),
                (Numeric::BigInt(ref x), Numeric::BigInt(ref y)) => {
                    if y.is_zero() {
                        return Err(JsNativeError::range()
                            .with_message("BigInt division by zero")
                            .into());
                    }
                    Self::new(JsBigInt::rem(x, y))
                }
                (_, _) => {
                    return Err(JsNativeError::typ()
                        .with_message("Cannot mix BigInt and other types, use explicit conversions")
                        .into());
                }
            },
        })
    }

    /// Perform the binary `**` operator on the value and return the result.
    // NOTE: There are some cases in the spec where we have to compare floats
    #[allow(clippy::float_cmp)]
    pub fn pow(&self, other: &Self, context: &mut Context) -> JsResult<Self> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path:
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => u32::try_from(y)
                .ok()
                .and_then(|y| x.checked_pow(y))
                .map_or_else(|| Self::new(f64::from(x).powi(y)), Self::new),
            (JsVariant::Float64(x), JsVariant::Float64(y)) => {
                if x.abs() == 1.0 && y.is_infinite() {
                    Self::nan()
                } else {
                    Self::new(x.powf(y))
                }
            }
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => {
                if x.wrapping_abs() == 1 && y.is_infinite() {
                    Self::nan()
                } else {
                    Self::new(f64::from(x).powf(y))
                }
            }
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => Self::new(x.powi(y)),
            (JsVariant::BigInt(a), JsVariant::BigInt(b)) => Self::new(JsBigInt::pow(&a, &b)?),

            // Slow path:
            (_, _) => match (self.to_numeric(context)?, other.to_numeric(context)?) {
                (Numeric::Number(a), Numeric::Number(b)) => {
                    if a.abs() == 1.0 && b.is_infinite() {
                        Self::nan()
                    } else {
                        Self::new(a.powf(b))
                    }
                }
                (Numeric::BigInt(ref a), Numeric::BigInt(ref b)) => Self::new(JsBigInt::pow(a, b)?),
                (_, _) => {
                    return Err(JsNativeError::typ()
                        .with_message("Cannot mix BigInt and other types, use explicit conversions")
                        .into());
                }
            },
        })
    }

    /// Perform the binary `&` operator on the value and return the result.
    pub fn bitand(&self, other: &Self, context: &mut Context) -> JsResult<Self> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path:
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => Self::new(x & y),
            (JsVariant::Float64(x), JsVariant::Float64(y)) => {
                Self::new(f64_to_int32(x) & f64_to_int32(y))
            }
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => Self::new(x & f64_to_int32(y)),
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => Self::new(f64_to_int32(x) & y),

            (JsVariant::BigInt(x), JsVariant::BigInt(y)) => Self::new(JsBigInt::bitand(&x, &y)),

            // Slow path:
            (_, _) => match (self.to_numeric(context)?, other.to_numeric(context)?) {
                (Numeric::Number(a), Numeric::Number(b)) => {
                    Self::new(f64_to_int32(a) & f64_to_int32(b))
                }
                (Numeric::BigInt(ref x), Numeric::BigInt(ref y)) => {
                    Self::new(JsBigInt::bitand(x, y))
                }
                (_, _) => {
                    return Err(JsNativeError::typ()
                        .with_message("Cannot mix BigInt and other types, use explicit conversions")
                        .into());
                }
            },
        })
    }

    /// Perform the binary `|` operator on the value and return the result.
    pub fn bitor(&self, other: &Self, context: &mut Context) -> JsResult<Self> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path:
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => Self::new(x | y),
            (JsVariant::Float64(x), JsVariant::Float64(y)) => {
                Self::new(f64_to_int32(x) | f64_to_int32(y))
            }
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => Self::new(x | f64_to_int32(y)),
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => Self::new(f64_to_int32(x) | y),

            (JsVariant::BigInt(x), JsVariant::BigInt(y)) => Self::new(JsBigInt::bitor(&x, &y)),

            // Slow path:
            (_, _) => match (self.to_numeric(context)?, other.to_numeric(context)?) {
                (Numeric::Number(a), Numeric::Number(b)) => {
                    Self::new(f64_to_int32(a) | f64_to_int32(b))
                }
                (Numeric::BigInt(ref x), Numeric::BigInt(ref y)) => {
                    Self::new(JsBigInt::bitor(x, y))
                }
                (_, _) => {
                    return Err(JsNativeError::typ()
                        .with_message("Cannot mix BigInt and other types, use explicit conversions")
                        .into());
                }
            },
        })
    }

    /// Perform the binary `^` operator on the value and return the result.
    pub fn bitxor(&self, other: &Self, context: &mut Context) -> JsResult<Self> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path:
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => Self::new(x ^ y),
            (JsVariant::Float64(x), JsVariant::Float64(y)) => {
                Self::new(f64_to_int32(x) ^ f64_to_int32(y))
            }
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => Self::new(x ^ f64_to_int32(y)),
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => Self::new(f64_to_int32(x) ^ y),

            (JsVariant::BigInt(x), JsVariant::BigInt(y)) => Self::new(JsBigInt::bitxor(&x, &y)),

            // Slow path:
            (_, _) => match (self.to_numeric(context)?, other.to_numeric(context)?) {
                (Numeric::Number(a), Numeric::Number(b)) => {
                    Self::new(f64_to_int32(a) ^ f64_to_int32(b))
                }
                (Numeric::BigInt(ref x), Numeric::BigInt(ref y)) => {
                    Self::new(JsBigInt::bitxor(x, y))
                }
                (_, _) => {
                    return Err(JsNativeError::typ()
                        .with_message("Cannot mix BigInt and other types, use explicit conversions")
                        .into());
                }
            },
        })
    }

    /// Perform the binary `<<` operator on the value and return the result.
    pub fn shl(&self, other: &Self, context: &mut Context) -> JsResult<Self> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path:
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => {
                Self::new(x.wrapping_shl(y as u32))
            }
            (JsVariant::Float64(x), JsVariant::Float64(y)) => {
                Self::new(f64_to_int32(x).wrapping_shl(f64_to_uint32(y)))
            }
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => {
                Self::new(x.wrapping_shl(f64_to_uint32(y)))
            }
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => {
                Self::new(f64_to_int32(x).wrapping_shl(y as u32))
            }

            (JsVariant::BigInt(a), JsVariant::BigInt(b)) => {
                Self::new(JsBigInt::shift_left(&a, &b)?)
            }

            // Slow path:
            (_, _) => match (self.to_numeric(context)?, other.to_numeric(context)?) {
                (Numeric::Number(x), Numeric::Number(y)) => {
                    Self::new(f64_to_int32(x).wrapping_shl(f64_to_uint32(y)))
                }
                (Numeric::BigInt(ref x), Numeric::BigInt(ref y)) => {
                    Self::new(JsBigInt::shift_left(x, y)?)
                }
                (_, _) => {
                    return Err(JsNativeError::typ()
                        .with_message("Cannot mix BigInt and other types, use explicit conversions")
                        .into());
                }
            },
        })
    }

    /// Perform the binary `>>` operator on the value and return the result.
    pub fn shr(&self, other: &Self, context: &mut Context) -> JsResult<Self> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path:
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => {
                Self::new(x.wrapping_shr(y as u32))
            }
            (JsVariant::Float64(x), JsVariant::Float64(y)) => {
                Self::new(f64_to_int32(x).wrapping_shr(f64_to_uint32(y)))
            }
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => {
                Self::new(x.wrapping_shr(f64_to_uint32(y)))
            }
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => {
                Self::new(f64_to_int32(x).wrapping_shr(y as u32))
            }

            (JsVariant::BigInt(a), JsVariant::BigInt(b)) => {
                Self::new(JsBigInt::shift_right(&a, &b)?)
            }

            // Slow path:
            (_, _) => match (self.to_numeric(context)?, other.to_numeric(context)?) {
                (Numeric::Number(x), Numeric::Number(y)) => {
                    Self::new(f64_to_int32(x).wrapping_shr(f64_to_uint32(y)))
                }
                (Numeric::BigInt(ref x), Numeric::BigInt(ref y)) => {
                    Self::new(JsBigInt::shift_right(x, y)?)
                }
                (_, _) => {
                    return Err(JsNativeError::typ()
                        .with_message("Cannot mix BigInt and other types, use explicit conversions")
                        .into());
                }
            },
        })
    }

    /// Perform the binary `>>>` operator on the value and return the result.
    pub fn ushr(&self, other: &Self, context: &mut Context) -> JsResult<Self> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path:
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => {
                Self::new((x as u32).wrapping_shr(y as u32))
            }
            (JsVariant::Float64(x), JsVariant::Float64(y)) => {
                Self::new(f64_to_uint32(x).wrapping_shr(f64_to_uint32(y)))
            }
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => {
                Self::new((x as u32).wrapping_shr(f64_to_uint32(y)))
            }
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => {
                Self::new(f64_to_uint32(x).wrapping_shr(y as u32))
            }

            // Slow path:
            (_, _) => match (self.to_numeric(context)?, other.to_numeric(context)?) {
                (Numeric::Number(x), Numeric::Number(y)) => {
                    Self::new(f64_to_uint32(x).wrapping_shr(f64_to_uint32(y)))
                }
                (Numeric::BigInt(_), Numeric::BigInt(_)) => {
                    return Err(JsNativeError::typ()
                        .with_message("BigInts have no unsigned right shift, use >> instead")
                        .into());
                }
                (_, _) => {
                    return Err(JsNativeError::typ()
                        .with_message("Cannot mix BigInt and other types, use explicit conversions")
                        .into());
                }
            },
        })
    }

    /// Abstract operation `InstanceofOperator ( V, target )`
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-instanceofoperator
    pub fn instance_of(&self, target: &Self, context: &mut Context) -> JsResult<bool> {
        // 1. If Type(target) is not Object, throw a TypeError exception.
        if !target.is_object() {
            return Err(JsNativeError::typ()
                .with_message("Right-hand side of 'instanceof' is not an object")
                .into());
        }

        // 2. Let instOfHandler be ? GetMethod(target, @@hasInstance).
        match target.get_method(JsSymbol::has_instance(), context)? {
            // 3. If instOfHandler is not undefined, then
            Some(instance_of_handler) => {
                // a. Return ! ToBoolean(? Call(instOfHandler, target, « V »)).
                Ok(instance_of_handler
                    .call(target, std::slice::from_ref(self), context)?
                    .to_boolean())
            }
            None if target.is_callable() => {
                // 5. Return ? OrdinaryHasInstance(target, V).
                Self::ordinary_has_instance(target, self, context)
            }
            None => {
                // 4. If IsCallable(target) is false, throw a TypeError exception.
                Err(JsNativeError::typ()
                    .with_message("Right-hand side of 'instanceof' is not callable")
                    .into())
            }
        }
    }

    /// Returns the negated value.
    pub fn neg(&self, context: &mut Context) -> JsResult<Self> {
        Ok(match self.variant() {
            JsVariant::Symbol(_) | JsVariant::Undefined => Self::new(f64::NAN),
            JsVariant::Object(_) => Self::new(
                self.to_numeric_number(context)
                    .map_or(f64::NAN, std::ops::Neg::neg),
            ),
            JsVariant::String(str) => Self::new(-str.to_number()),
            JsVariant::Float64(num) => Self::new(-num),
            JsVariant::Integer32(0) | JsVariant::Boolean(false) | JsVariant::Null => {
                Self::new(-0.0)
            }
            JsVariant::Integer32(num) => Self::new(-num),
            JsVariant::Boolean(true) => Self::new(-1),
            JsVariant::BigInt(x) => Self::new(JsBigInt::neg(&x)),
        })
    }

    /// Returns the negated boolean value.
    #[inline]
    pub fn not(&self) -> JsResult<bool> {
        Ok(!self.to_boolean())
    }

    /// Abstract relational comparison
    ///
    /// The comparison `x < y`, where `x` and `y` are values, produces `true`, `false`,
    /// or `undefined` (which indicates that at least one operand is `NaN`).
    ///
    /// In addition to `x` and `y` the algorithm takes a Boolean flag named `LeftFirst` as a parameter.
    /// The flag is used to control the order in which operations with potentially visible side-effects
    /// are performed upon `x` and `y`. It is necessary because ECMAScript specifies left to right evaluation
    /// of expressions. The default value of `LeftFirst` is `true` and indicates that the `x` parameter
    /// corresponds to an expression that occurs to the left of the `y` parameter's corresponding expression.
    ///
    /// If `LeftFirst` is `false`, the reverse is the case and operations must be performed upon `y` before `x`.
    ///
    /// More Information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-abstract-relational-comparison
    pub fn abstract_relation(
        &self,
        other: &Self,
        left_first: bool,
        context: &mut Context,
    ) -> JsResult<AbstractRelation> {
        Ok(match (self.variant(), other.variant()) {
            // Fast path (for some common operations):
            (JsVariant::Integer32(x), JsVariant::Integer32(y)) => (x < y).into(),
            (JsVariant::Integer32(x), JsVariant::Float64(y)) => Number::less_than(f64::from(x), y),
            (JsVariant::Float64(x), JsVariant::Integer32(y)) => Number::less_than(x, f64::from(y)),
            (JsVariant::Float64(x), JsVariant::Float64(y)) => Number::less_than(x, y),
            (JsVariant::BigInt(x), JsVariant::BigInt(y)) => (x < y).into(),

            // Slow path:
            (_, _) => {
                let (px, py) = if left_first {
                    let px = self.to_primitive(context, PreferredType::Number)?;
                    let py = other.to_primitive(context, PreferredType::Number)?;
                    (px, py)
                } else {
                    // NOTE: The order of evaluation needs to be reversed to preserve left to right evaluation.
                    let py = other.to_primitive(context, PreferredType::Number)?;
                    let px = self.to_primitive(context, PreferredType::Number)?;
                    (px, py)
                };

                match (px.variant(), py.variant()) {
                    (JsVariant::String(x), JsVariant::String(y)) => (x < y).into(),
                    (JsVariant::BigInt(x), JsVariant::String(y)) => JsBigInt::from_js_string(&y)
                        .map_or(AbstractRelation::Undefined, |y| (x < y).into()),
                    (JsVariant::String(x), JsVariant::BigInt(y)) => JsBigInt::from_js_string(&x)
                        .map_or(AbstractRelation::Undefined, |x| (x < y).into()),
                    (_, _) => match (px.to_numeric(context)?, py.to_numeric(context)?) {
                        (Numeric::Number(x), Numeric::Number(y)) => Number::less_than(x, y),
                        (Numeric::BigInt(ref x), Numeric::BigInt(ref y)) => (x < y).into(),
                        (Numeric::BigInt(ref x), Numeric::Number(y)) => {
                            if y.is_nan() {
                                return Ok(AbstractRelation::Undefined);
                            }
                            if y.is_infinite() {
                                return Ok(y.is_sign_positive().into());
                            }

                            if let Ok(y) = JsBigInt::try_from(y) {
                                return Ok((x < &y).into());
                            }

                            (x.to_f64() < y).into()
                        }
                        (Numeric::Number(x), Numeric::BigInt(ref y)) => {
                            if x.is_nan() {
                                return Ok(AbstractRelation::Undefined);
                            }
                            if x.is_infinite() {
                                return Ok(x.is_sign_negative().into());
                            }

                            if let Ok(x) = JsBigInt::try_from(x) {
                                return Ok((&x < y).into());
                            }

                            (x < y.to_f64()).into()
                        }
                    },
                }
            }
        })
    }

    /// The less than operator (`<`) returns `true` if the left operand is less than the right operand,
    /// and `false` otherwise.
    ///
    /// More Information:
    ///  - [MDN documentation][mdn]
    ///  - [ECMAScript reference][spec]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Less_than
    /// [spec]: https://tc39.es/ecma262/#sec-relational-operators-runtime-semantics-evaluation
    #[inline]
    pub fn lt(&self, other: &Self, context: &mut Context) -> JsResult<bool> {
        match self.abstract_relation(other, true, context)? {
            AbstractRelation::True => Ok(true),
            AbstractRelation::False | AbstractRelation::Undefined => Ok(false),
        }
    }

    /// The less than or equal operator (`<=`) returns `true` if the left operand is less than
    /// or equal to the right operand, and `false` otherwise.
    ///
    /// More Information:
    ///  - [MDN documentation][mdn]
    ///  - [ECMAScript reference][spec]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Less_than_or_equal
    /// [spec]: https://tc39.es/ecma262/#sec-relational-operators-runtime-semantics-evaluation
    #[inline]
    pub fn le(&self, other: &Self, context: &mut Context) -> JsResult<bool> {
        match other.abstract_relation(self, false, context)? {
            AbstractRelation::False => Ok(true),
            AbstractRelation::True | AbstractRelation::Undefined => Ok(false),
        }
    }

    /// The greater than operator (`>`) returns `true` if the left operand is greater than
    /// the right operand, and `false` otherwise.
    ///
    /// More Information:
    ///  - [MDN documentation][mdn]
    ///  - [ECMAScript reference][spec]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Greater_than
    /// [spec]: https://tc39.es/ecma262/#sec-relational-operators-runtime-semantics-evaluation
    #[inline]
    pub fn gt(&self, other: &Self, context: &mut Context) -> JsResult<bool> {
        match other.abstract_relation(self, false, context)? {
            AbstractRelation::True => Ok(true),
            AbstractRelation::False | AbstractRelation::Undefined => Ok(false),
        }
    }

    /// The greater than or equal operator (`>=`) returns `true` if the left operand is greater than
    /// or equal to the right operand, and `false` otherwise.
    ///
    /// More Information:
    ///  - [MDN documentation][mdn]
    ///  - [ECMAScript reference][spec]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Greater_than_or_equal
    /// [spec]: https://tc39.es/ecma262/#sec-relational-operators-runtime-semantics-evaluation
    #[inline]
    pub fn ge(&self, other: &Self, context: &mut Context) -> JsResult<bool> {
        match self.abstract_relation(other, true, context)? {
            AbstractRelation::False => Ok(true),
            AbstractRelation::True | AbstractRelation::Undefined => Ok(false),
        }
    }

    // ==== Numeric Fast Paths ====
    //
    // These methods provide optimized paths for binary operations at the opcode
    // handler level. They use `self.0.as_integer32()` and `self.as_number_cheap()`
    // (pure bit operations) instead of `variant()`, which avoids cloning pointer
    // types (Object, String, Symbol, BigInt) for non-numeric values.
    //
    // Returns `Some(result)` if both operands are numeric, `None` otherwise
    // (caller should fall back to the full method with type coercion).

    /// Converts the value to a number if possible, using fast bit operations. This is
    /// used for the fast operations to allow mixed i32/f64 values.
    #[inline]
    fn as_number_cheap(&self) -> Option<f64> {
        if let Some(i) = self.0.as_integer32() {
            Some(f64::from(i))
        } else {
            self.0.as_float64()
        }
    }

    /// Fast path for the binary `+` operator (numeric only).
    #[inline]
    #[allow(clippy::float_cmp)]
    pub(crate) fn add_fast(&self, other: &Self) -> Option<Self> {
        if let (Some(x), Some(y)) = (self.0.as_integer32(), other.0.as_integer32()) {
            return Some(
                x.checked_add(y)
                    .map_or_else(|| Self::new(f64::from(x) + f64::from(y)), Self::new),
            );
        }
        let x = self.as_number_cheap()?;
        let y = other.as_number_cheap()?;
        Some(Self::new(x + y))
    }

    /// Fast path for the binary `-` operator.
    #[inline]
    pub(crate) fn sub_fast(&self, other: &Self) -> Option<Self> {
        if let (Some(x), Some(y)) = (self.0.as_integer32(), other.0.as_integer32()) {
            return Some(
                x.checked_sub(y)
                    .map_or_else(|| Self::new(f64::from(x) - f64::from(y)), Self::new),
            );
        }
        let x = self.as_number_cheap()?;
        let y = other.as_number_cheap()?;
        Some(Self::new(x - y))
    }

    /// Fast path for the binary `*` operator.
    #[inline]
    pub(crate) fn mul_fast(&self, other: &Self) -> Option<Self> {
        if let (Some(x), Some(y)) = (self.0.as_integer32(), other.0.as_integer32()) {
            return Some(
                x.checked_mul(y)
                    .filter(|v| *v != 0 || i32::min(x, y) >= 0)
                    .map_or_else(|| Self::new(f64::from(x) * f64::from(y)), Self::new),
            );
        }
        let x = self.as_number_cheap()?;
        let y = other.as_number_cheap()?;
        Some(Self::new(x * y))
    }

    /// Fast path for the binary `/` operator.
    #[inline]
    #[allow(clippy::float_cmp)]
    pub(crate) fn div_fast(&self, other: &Self) -> Option<Self> {
        if let (Some(x), Some(y)) = (self.0.as_integer32(), other.0.as_integer32()) {
            return Some(
                x.checked_div(y)
                    .filter(|div| y * div == x)
                    .map_or_else(|| Self::new(f64::from(x) / f64::from(y)), Self::new),
            );
        }
        let x = self.as_number_cheap()?;
        let y = other.as_number_cheap()?;
        Some(Self::new(x / y))
    }

    /// Fast path for the binary `%` operator.
    #[inline]
    pub(crate) fn rem_fast(&self, other: &Self) -> Option<Self> {
        if let (Some(x), Some(y)) = (self.0.as_integer32(), other.0.as_integer32()) {
            if y == 0 {
                return Some(Self::nan());
            }
            return Some(match x % y {
                rem if rem == 0 && x < 0 => Self::new(-0.0),
                rem => Self::new(rem),
            });
        }
        let x = self.as_number_cheap()?;
        let y = other.as_number_cheap()?;
        Some(Self::new((x % y).copysign(x)))
    }

    /// Fast path for the binary `**` operator.
    #[inline]
    #[allow(clippy::float_cmp)]
    pub(crate) fn pow_fast(&self, other: &Self) -> Option<Self> {
        if let (Some(x), Some(y)) = (self.0.as_integer32(), other.0.as_integer32()) {
            return Some(
                u32::try_from(y)
                    .ok()
                    .and_then(|y| x.checked_pow(y))
                    .map_or_else(|| Self::new(f64::from(x).powi(y)), Self::new),
            );
        }
        let x = self.as_number_cheap()?;
        let y = other.as_number_cheap()?;
        if x.abs() == 1.0 && y.is_infinite() {
            Some(Self::nan())
        } else {
            Some(Self::new(x.powf(y)))
        }
    }

    /// Fast path for the binary `&` operator (i32 only).
    #[inline]
    pub(crate) fn bitand_fast(&self, other: &Self) -> Option<Self> {
        let x = self.0.as_integer32()?;
        let y = other.0.as_integer32()?;
        Some(Self::new(x & y))
    }

    /// Fast path for the binary `|` operator (i32 only).
    #[inline]
    pub(crate) fn bitor_fast(&self, other: &Self) -> Option<Self> {
        let x = self.0.as_integer32()?;
        let y = other.0.as_integer32()?;
        Some(Self::new(x | y))
    }

    /// Fast path for the binary `^` operator (i32 only).
    #[inline]
    pub(crate) fn bitxor_fast(&self, other: &Self) -> Option<Self> {
        let x = self.0.as_integer32()?;
        let y = other.0.as_integer32()?;
        Some(Self::new(x ^ y))
    }

    /// Fast path for the binary `<<` operator (i32 only).
    #[inline]
    pub(crate) fn shl_fast(&self, other: &Self) -> Option<Self> {
        let x = self.0.as_integer32()?;
        let y = other.0.as_integer32()?;
        Some(Self::new(x.wrapping_shl(y as u32)))
    }

    /// Fast path for the binary `>>` operator (i32 only).
    #[inline]
    pub(crate) fn shr_fast(&self, other: &Self) -> Option<Self> {
        let x = self.0.as_integer32()?;
        let y = other.0.as_integer32()?;
        Some(Self::new(x.wrapping_shr(y as u32)))
    }

    /// Fast path for the binary `>>>` operator (i32 only).
    #[inline]
    pub(crate) fn ushr_fast(&self, other: &Self) -> Option<Self> {
        let x = self.0.as_integer32()?;
        let y = other.0.as_integer32()?;
        Some(Self::new((x as u32).wrapping_shr(y as u32)))
    }

    /// Fast path for the `<` operator.
    #[inline]
    pub(crate) fn lt_fast(&self, other: &Self) -> Option<bool> {
        if let (Some(x), Some(y)) = (self.0.as_integer32(), other.0.as_integer32()) {
            return Some(x < y);
        }
        let x = self.as_number_cheap()?;
        let y = other.as_number_cheap()?;
        Some(x < y)
    }

    /// Fast path for the `<=` operator.
    #[inline]
    pub(crate) fn le_fast(&self, other: &Self) -> Option<bool> {
        if let (Some(x), Some(y)) = (self.0.as_integer32(), other.0.as_integer32()) {
            return Some(x <= y);
        }
        let x = self.as_number_cheap()?;
        let y = other.as_number_cheap()?;
        Some(x <= y)
    }

    /// Fast path for the `>` operator.
    #[inline]
    pub(crate) fn gt_fast(&self, other: &Self) -> Option<bool> {
        if let (Some(x), Some(y)) = (self.0.as_integer32(), other.0.as_integer32()) {
            return Some(x > y);
        }
        let x = self.as_number_cheap()?;
        let y = other.as_number_cheap()?;
        Some(x > y)
    }

    /// Fast path for the `>=` operator.
    #[inline]
    pub(crate) fn ge_fast(&self, other: &Self) -> Option<bool> {
        if let (Some(x), Some(y)) = (self.0.as_integer32(), other.0.as_integer32()) {
            return Some(x >= y);
        }
        let x = self.as_number_cheap()?;
        let y = other.as_number_cheap()?;
        Some(x >= y)
    }

    /// Fast path for the `==` operator (numeric only).
    #[inline]
    #[allow(clippy::float_cmp)]
    pub(crate) fn equals_fast(&self, other: &Self) -> Option<Self> {
        if let (Some(x), Some(y)) = (self.0.as_integer32(), other.0.as_integer32()) {
            return Some(Self::new(x == y));
        }
        let x = self.as_number_cheap()?;
        let y = other.as_number_cheap()?;
        Some(Self::new(x == y))
    }

    /// Fast path for the `!=` operator (numeric only).
    #[inline]
    #[allow(clippy::float_cmp)]
    pub(crate) fn not_equals_fast(&self, other: &Self) -> Option<Self> {
        if let (Some(x), Some(y)) = (self.0.as_integer32(), other.0.as_integer32()) {
            return Some(Self::new(x != y));
        }
        let x = self.as_number_cheap()?;
        let y = other.as_number_cheap()?;
        Some(Self::new(x != y))
    }
}

/// The result of the [Abstract Relational Comparison][arc].
///
/// Comparison `x < y`, where `x` and `y` are values.
/// It produces `true`, `false`, or `undefined`
/// (which indicates that at least one operand is `NaN`).
///
/// [arc]: https://tc39.es/ecma262/#sec-abstract-relational-comparison
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum AbstractRelation {
    /// `x` is less than `y`
    True,
    /// `x` is **not** less than `y`
    False,
    /// Indicates that at least one operand is `NaN`
    Undefined,
}

impl From<bool> for AbstractRelation {
    #[inline]
    fn from(value: bool) -> Self {
        if value { Self::True } else { Self::False }
    }
}
