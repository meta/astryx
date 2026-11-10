use boa_string::StaticJsStrings;

use crate::{
    Context, JsResult, JsValue, js_string,
    object::{internal_methods::InternalMethodPropertyContext, shape::slot::SlotAttributes},
    property::PropertyKey,
    vm::opcode::{IndexOperand, Operation, RegisterOperand},
};

fn get_by_name<const LENGTH: bool>(
    (dst, object, receiver, index): (RegisterOperand, &JsValue, &JsValue, IndexOperand),
    context: &mut Context,
) -> JsResult<()> {
    if LENGTH {
        if let Some(object) = object.as_object()
            && object.is_array()
        {
            let value = object.borrow().properties().storage[0].clone();
            context.vm.set_register(dst.into(), value);
            return Ok(());
        } else if let Some(string) = object.as_string() {
            // NOTE: Since we’re using the prototype returned directly by `base_class()`,
            //       we need to handle string primitives separately due to the
            //       string exotic internal methods.
            context
                .vm
                .set_register(dst.into(), (string.len() as u32).into());
            return Ok(());
        }
    }

    // OPTIMIZATION:
    //    Instead of calling `to_object()`, which creates a temporary wrapper object for primitive
    //    values (e.g., numbers, strings, booleans) just to query their prototype chain.
    //
    //    To prevent the creation of a temporary JsObject, we directly retrieve the prototype that
    //    `to_object()` would produce, such as `Number.prototype`, `String.prototype`, etc.
    if object.is_null_or_undefined() {
        let key: PropertyKey = context.vm.frame().code_block().ic[usize::from(index)].name.clone().into();
        return Err(crate::v8_messages::read_properties(object, &key).into());
    }
    let object = object.base_class(context)?;

    let ic = &context.vm.frame().code_block().ic[usize::from(index)];
    let object_borrowed = object.borrow();
    if let Some((shape, slot)) = ic.get(object_borrowed.shape()) {
        let mut result = if slot.attributes.contains(SlotAttributes::PROTOTYPE) {
            let prototype = shape.prototype().expect("prototype should have value");
            let prototype = prototype.borrow();
            prototype.properties().storage[slot.index as usize].clone()
        } else {
            object_borrowed.properties().storage[slot.index as usize].clone()
        };

        drop(object_borrowed);
        if slot.attributes.has_get() && result.is_object() {
            result =
                result
                    .as_object()
                    .expect("should contain getter")
                    .call(receiver, &[], context)?;
        }
        context.vm.set_register(dst.into(), result);
        return Ok(());
    }

    drop(object_borrowed);

    let key: PropertyKey = ic.name.clone().into();

    let context = &mut InternalMethodPropertyContext::new(context);
    let result = object.__get__(&key, receiver.clone(), context)?;

    // Cache the property.
    let slot = *context.slot();
    if slot.is_cacheable() {
        let ic = &context.vm.frame().code_block.ic[usize::from(index)];
        let object_borrowed = object.borrow();
        let shape = object_borrowed.shape();
        ic.set(shape, slot);
    }

    context.vm.set_register(dst.into(), result);
    Ok(())
}

fn get_by_value<const PUSH_KEY: bool>(
    (dst, key, receiver, object): (
        RegisterOperand,
        RegisterOperand,
        RegisterOperand,
        RegisterOperand,
    ),
    context: &mut Context,
) -> JsResult<()> {
    let key_value = context.vm.get_register(key.into()).clone();
    let base = context.vm.get_register(object.into()).clone();
    if base.is_null_or_undefined() {
        let key = key_value.to_property_key(context)?;
        return Err(crate::v8_messages::read_properties(&base, &key).into());
    }
    let object = base.base_class(context)?;
    let key_value = key_value.to_property_key(context)?;

    // Fast Path
    //
    // NOTE: Since we’re using the prototype returned directly by `base_class()`,
    //       we need to handle string primitives separately due to the
    //       string exotic internal methods.
    match &key_value {
        PropertyKey::Index(index) => {
            if object.is_array() {
                let object_borrowed = object.borrow();
                if let Some(element) = object_borrowed.properties().get_dense_property(index.get())
                {
                    if PUSH_KEY {
                        context.vm.set_register(key.into(), key_value.into());
                    }

                    context.vm.set_register(dst.into(), element);
                    return Ok(());
                }
            } else if let Some(string) = base.as_string() {
                let value = string
                    .code_unit_at(index.get() as usize)
                    .map_or_else(JsValue::undefined, |char| {
                        js_string!([char].as_slice()).into()
                    });

                if PUSH_KEY {
                    context.vm.set_register(key.into(), key_value.into());
                }
                context.vm.set_register(dst.into(), value);
                return Ok(());
            }
        }
        PropertyKey::String(string) if *string == StaticJsStrings::LENGTH => {
            if let Some(string) = base.as_string() {
                let value = string.len().into();

                if PUSH_KEY {
                    context.vm.set_register(key.into(), key_value.into());
                }
                context.vm.set_register(dst.into(), value);
                return Ok(());
            }
        }
        _ => {}
    }

    let receiver = context.vm.get_register(receiver.into());

    // Slow path:
    let result = object.__get__(
        &key_value,
        receiver.clone(),
        &mut InternalMethodPropertyContext::new(context),
    )?;

    if PUSH_KEY {
        context.vm.set_register(key.into(), key_value.into());
    }
    context.vm.set_register(dst.into(), result);
    Ok(())
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct GetLengthProperty;

impl GetLengthProperty {
    #[inline(always)]
    pub(crate) fn operation(
        (dst, object, index): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let object = context.vm.get_register(object.into()).clone();
        get_by_name::<true>((dst, &object, &object, index), context)
    }
}

impl Operation for GetLengthProperty {
    const NAME: &'static str = "GetLengthProperty";
    const INSTRUCTION: &'static str = "INST - GetLengthProperty";
    const COST: u8 = 4;
}

/// `GetPropertyByName` implements the Opcode Operation for `Opcode::GetPropertyByName`
///
/// Operation:
///  - Get a property by name from an object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct GetPropertyByName;

impl GetPropertyByName {
    #[inline(always)]
    pub(crate) fn operation(
        (dst, object, index): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let object = context.vm.get_register(object.into()).clone();
        get_by_name::<false>((dst, &object, &object, index), context)
    }
}

impl Operation for GetPropertyByName {
    const NAME: &'static str = "GetPropertyByName";
    const INSTRUCTION: &'static str = "INST - GetPropertyByName";
    const COST: u8 = 4;
}

/// `GetPropertyByNameWithThis` implements the Opcode Operation for `Opcode::GetPropertyByNameWithThis`
///
/// Operation:
///  - Get a property by name from an object with this.
#[derive(Debug, Clone, Copy)]
pub(crate) struct GetPropertyByNameWithThis;

impl GetPropertyByNameWithThis {
    #[inline(always)]
    pub(crate) fn operation(
        (dst, receiver, value, index): (
            RegisterOperand,
            RegisterOperand,
            RegisterOperand,
            IndexOperand,
        ),
        context: &mut Context,
    ) -> JsResult<()> {
        let receiver = context.vm.get_register(receiver.into()).clone();
        let object = context.vm.get_register(value.into()).clone();
        get_by_name::<false>((dst, &object, &receiver, index), context)
    }
}

impl Operation for GetPropertyByNameWithThis {
    const NAME: &'static str = "GetPropertyByNameWithThis";
    const INSTRUCTION: &'static str = "INST - GetPropertyByNameWithThis";
    const COST: u8 = 4;
}

/// `GetPropertyByValue` implements the Opcode Operation for `Opcode::GetPropertyByValue`
///
/// Operation:
///  - Get a property by value from an object and store it in dst.
#[derive(Debug, Clone, Copy)]
pub(crate) struct GetPropertyByValue;

impl GetPropertyByValue {
    #[inline(always)]
    pub(crate) fn operation(
        args: (
            RegisterOperand,
            RegisterOperand,
            RegisterOperand,
            RegisterOperand,
        ),
        context: &mut Context,
    ) -> JsResult<()> {
        get_by_value::<false>(args, context)
    }
}

impl Operation for GetPropertyByValue {
    const NAME: &'static str = "GetPropertyByValue";
    const INSTRUCTION: &'static str = "INST - GetPropertyByValue";
    const COST: u8 = 4;
}

/// `GetPropertyByValuePush` implements the Opcode Operation for `Opcode::GetPropertyByValuePush`
///
/// Operation:
///  - Get a property by value from an object and store the key and value in registers.
#[derive(Debug, Clone, Copy)]
pub(crate) struct GetPropertyByValuePush;

impl GetPropertyByValuePush {
    #[inline(always)]
    pub(crate) fn operation(
        args: (
            RegisterOperand,
            RegisterOperand,
            RegisterOperand,
            RegisterOperand,
        ),
        context: &mut Context,
    ) -> JsResult<()> {
        get_by_value::<true>(args, context)
    }
}

impl Operation for GetPropertyByValuePush {
    const NAME: &'static str = "GetPropertyByValuePush";
    const INSTRUCTION: &'static str = "INST - GetPropertyByValuePush";
    const COST: u8 = 4;
}
