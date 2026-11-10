use crate::JsExpect;
use crate::JsValue;
use crate::value::JsVariant;
use crate::vm::opcode::{IndexOperand, RegisterOperand};
use crate::{
    Context, JsNativeError, JsResult,
    builtins::function::set_function_name,
    object::{internal_methods::InternalMethodPropertyContext, shape::slot::SlotAttributes},
    property::{PropertyDescriptor, PropertyKey},
    vm::opcode::Operation,
};
use boa_macros::js_str;

fn set_by_name(
    value: RegisterOperand,
    value_object: &JsValue,
    receiver: &JsValue,
    index: IndexOperand,
    context: &mut Context,
) -> JsResult<()> {
    let value = context.vm.get_register(value.into()).clone();

    if value_object.is_null_or_undefined() {
        let key: PropertyKey = context.vm.frame().code_block().ic[usize::from(index)].name.clone().into();
        return Err(crate::v8_messages::set_properties(value_object, &key).into());
    }
    let object = value_object.to_object(context)?;

    let ic = &context.vm.frame().code_block().ic[usize::from(index)];

    let object_borrowed = object.borrow();
    if let Some((shape, slot)) = ic.get(object_borrowed.shape()) {
        let slot_index = slot.index as usize;

        if slot.attributes.is_accessor_descriptor() {
            let result = if slot.attributes.contains(SlotAttributes::PROTOTYPE) {
                let prototype = shape.prototype().expect("prototype should have value");
                let prototype = prototype.borrow();

                prototype.properties().storage[slot_index + 1].clone()
            } else {
                object_borrowed.properties().storage[slot_index + 1].clone()
            };

            drop(object_borrowed);
            if slot.attributes.has_set() && result.is_object() {
                result.as_object().expect("should contain getter").call(
                    receiver,
                    std::slice::from_ref(&value),
                    context,
                )?;
            }
        } else if slot.attributes.contains(SlotAttributes::PROTOTYPE) {
            let prototype = shape.prototype().expect("prototype should have value");
            let mut prototype = prototype.borrow_mut();

            prototype.properties_mut().storage[slot_index] = value.clone();
        } else {
            drop(object_borrowed);
            let mut object_borrowed = object.borrow_mut();
            object_borrowed.properties_mut().storage[slot_index] = value.clone();
        }
        return Ok(());
    }
    drop(object_borrowed);

    let name: PropertyKey = ic.name.clone().into();

    let context = &mut InternalMethodPropertyContext::new(context);
    let succeeded = object.__set__(name.clone(), value.clone(), receiver.clone(), context)?;
    if !succeeded && context.vm.frame().code_block.strict() {
        let exists = object.has_property(name.clone(), context)?;
        return Err(crate::v8_messages::failed_set(&object, &name, exists)
            .into());
    }

    // Cache the property.
    let slot = *context.slot();
    if succeeded && slot.is_cacheable() {
        let ic = &context.vm.frame().code_block.ic[usize::from(index)];
        let object_borrowed = object.borrow();
        let shape = object_borrowed.shape();
        ic.set(shape, slot);
    }

    Ok(())
}

/// `SetPropertyByName` implements the Opcode Operation for `Opcode::SetPropertyByName`
///
/// Operation:
///  - Sets a property by name of an object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SetPropertyByName;

impl SetPropertyByName {
    #[inline(always)]
    pub(crate) fn operation(
        (value, object, index): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let object = context.vm.get_register(object.into()).clone();
        set_by_name(value, &object, &object, index, context)
    }
}

impl Operation for SetPropertyByNameWithThis {
    const NAME: &'static str = "SetPropertyByNameWithThis";
    const INSTRUCTION: &'static str = "INST - SetPropertyByNameWithThis";
    const COST: u8 = 4;
}

/// `SetPropertyByNameWithThis` implements the Opcode Operation for `Opcode::SetPropertyByNameWithThis`
///
/// Operation:
///  - Sets a property by name of an object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SetPropertyByNameWithThis;

impl SetPropertyByNameWithThis {
    #[inline(always)]
    pub(crate) fn operation(
        (value, receiver, object, index): (
            RegisterOperand,
            RegisterOperand,
            RegisterOperand,
            IndexOperand,
        ),
        context: &mut Context,
    ) -> JsResult<()> {
        let value_object = context.vm.get_register(object.into()).clone();
        let receiver = context.vm.get_register(receiver.into()).clone();
        set_by_name(value, &value_object, &receiver, index, context)
    }
}

impl Operation for SetPropertyByName {
    const NAME: &'static str = "SetPropertyByName";
    const INSTRUCTION: &'static str = "INST - SetPropertyByName";
    const COST: u8 = 4;
}

/// `SetPropertyByValue` implements the Opcode Operation for `Opcode::SetPropertyByValue`
///
/// Operation:
///  - Sets a property by value of an object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SetPropertyByValue;

impl SetPropertyByValue {
    #[inline(always)]
    pub(crate) fn operation(
        (value, key, receiver, object): (
            RegisterOperand,
            RegisterOperand,
            RegisterOperand,
            RegisterOperand,
        ),
        context: &mut Context,
    ) -> JsResult<()> {
        let value = context.vm.get_register(value.into()).clone();
        let key = context.vm.get_register(key.into()).clone();
        let receiver = context.vm.get_register(receiver.into()).clone();
        let object = context.vm.get_register(object.into()).clone();
        if object.is_null_or_undefined() {
            let key = key.to_property_key(context)?;
            return Err(crate::v8_messages::set_properties(&object, &key).into());
        }
        let object = object.to_object(context)?;

        let key = key.to_property_key(context)?;

        // Fast Path:
        'fast_path: {
            if object.is_array()
                && let PropertyKey::Index(index) = &key
            {
                let mut object_borrowed = object.borrow_mut();

                // Cannot modify if not extensible.
                if !object_borrowed.extensible {
                    break 'fast_path;
                }

                if object_borrowed
                    .properties_mut()
                    .set_dense_property(index.get(), &value)
                {
                    return Ok(());
                }
            }
        }

        // Slow path:
        let succeeded = object.__set__(
            key.clone(),
            value.clone(),
            receiver.clone(),
            &mut context.into(),
        )?;
        if !succeeded && context.vm.frame().code_block.strict() {
            let exists = object.has_property(key.clone(), context)?;
            return Err(crate::v8_messages::failed_set(&object, &key, exists)
                .into());
        }

        Ok(())
    }
}

impl Operation for SetPropertyByValue {
    const NAME: &'static str = "SetPropertyByValue";
    const INSTRUCTION: &'static str = "INST - SetPropertyByValue";
    const COST: u8 = 4;
}

/// `SetPropertyGetterByName` implements the Opcode Operation for `Opcode::SetPropertyGetterByName`
///
/// Operation:
///  - Sets a getter property by name of an object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SetPropertyGetterByName;

impl SetPropertyGetterByName {
    #[inline(always)]
    pub(crate) fn operation(
        (object, value, index): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let object = context.vm.get_register(object.into()).clone();
        let value = context.vm.get_register(value.into()).clone();
        let name = context
            .vm
            .frame()
            .code_block()
            .constant_string(index.into())
            .into();

        let object = object.to_object(context)?;
        let set = object
            .__get_own_property__(&name, &mut InternalMethodPropertyContext::new(context))?
            .as_ref()
            .and_then(PropertyDescriptor::set)
            .cloned();
        object.__define_own_property__(
            &name,
            PropertyDescriptor::builder()
                .maybe_get(Some(value.clone()))
                .maybe_set(set)
                .enumerable(true)
                .configurable(true)
                .build(),
            &mut InternalMethodPropertyContext::new(context),
        )?;
        Ok(())
    }
}

impl Operation for SetPropertyGetterByName {
    const NAME: &'static str = "SetPropertyGetterByName";
    const INSTRUCTION: &'static str = "INST - SetPropertyGetterByName";
    const COST: u8 = 4;
}

/// `SetPropertyGetterByValue` implements the Opcode Operation for `Opcode::SetPropertyGetterByValue`
///
/// Operation:
///  - Sets a getter property by value of an object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SetPropertyGetterByValue;

impl SetPropertyGetterByValue {
    #[inline(always)]
    pub(crate) fn operation(
        (value, key, object): (RegisterOperand, RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let value = context.vm.get_register(value.into()).clone();
        let key = context.vm.get_register(key.into()).clone();
        let object = context.vm.get_register(object.into()).clone();
        let object = object.to_object(context)?;
        let name = key.to_property_key(context)?;

        let set = object
            .__get_own_property__(&name, &mut InternalMethodPropertyContext::new(context))?
            .as_ref()
            .and_then(PropertyDescriptor::set)
            .cloned();
        object.__define_own_property__(
            &name,
            PropertyDescriptor::builder()
                .maybe_get(Some(value.clone()))
                .maybe_set(set)
                .enumerable(true)
                .configurable(true)
                .build(),
            &mut InternalMethodPropertyContext::new(context),
        )?;
        Ok(())
    }
}

impl Operation for SetPropertyGetterByValue {
    const NAME: &'static str = "SetPropertyGetterByValue";
    const INSTRUCTION: &'static str = "INST - SetPropertyGetterByValue";
    const COST: u8 = 4;
}

/// `SetPropertySetterByName` implements the Opcode Operation for `Opcode::SetPropertySetterByName`
///
/// Operation:
///  - Sets a setter property by name of an object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SetPropertySetterByName;

impl SetPropertySetterByName {
    #[inline(always)]
    pub(crate) fn operation(
        (object, value, index): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let object = context.vm.get_register(object.into()).clone();
        let value = context.vm.get_register(value.into()).clone();
        let name = context
            .vm
            .frame()
            .code_block()
            .constant_string(index.into())
            .into();

        let object = object.to_object(context)?;

        let get = object
            .__get_own_property__(&name, &mut InternalMethodPropertyContext::new(context))?
            .as_ref()
            .and_then(PropertyDescriptor::get)
            .cloned();
        object.__define_own_property__(
            &name,
            PropertyDescriptor::builder()
                .maybe_set(Some(value.clone()))
                .maybe_get(get)
                .enumerable(true)
                .configurable(true)
                .build(),
            &mut InternalMethodPropertyContext::new(context),
        )?;
        Ok(())
    }
}

impl Operation for SetPropertySetterByName {
    const NAME: &'static str = "SetPropertySetterByName";
    const INSTRUCTION: &'static str = "INST - SetPropertySetterByName";
    const COST: u8 = 4;
}

/// `SetPropertySetterByValue` implements the Opcode Operation for `Opcode::SetPropertySetterByValue`
///
/// Operation:
///  - Sets a setter property by value of an object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SetPropertySetterByValue;

impl SetPropertySetterByValue {
    #[inline(always)]
    pub(crate) fn operation(
        (value, key, object): (RegisterOperand, RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let value = context.vm.get_register(value.into()).clone();
        let key = context.vm.get_register(key.into()).clone();
        let object = context.vm.get_register(object.into()).clone();

        let object = object.to_object(context)?;
        let name = key.to_property_key(context)?;

        let get = object
            .__get_own_property__(&name, &mut InternalMethodPropertyContext::new(context))?
            .as_ref()
            .and_then(PropertyDescriptor::get)
            .cloned();
        object.__define_own_property__(
            &name,
            PropertyDescriptor::builder()
                .maybe_set(Some(value.clone()))
                .maybe_get(get)
                .enumerable(true)
                .configurable(true)
                .build(),
            &mut InternalMethodPropertyContext::new(context),
        )?;
        Ok(())
    }
}

impl Operation for SetPropertySetterByValue {
    const NAME: &'static str = "SetPropertySetterByValue";
    const INSTRUCTION: &'static str = "INST - SetPropertySetterByValue";
    const COST: u8 = 4;
}

/// `SetFunctionName` implements the Opcode Operation for `Opcode::SetFunctionName`
///
/// Operation:
///  - Sets the name of a function object.
#[derive(Debug, Clone, Copy)]
pub(crate) struct SetFunctionName;

impl SetFunctionName {
    #[inline(always)]
    pub(crate) fn operation(
        (function, name, prefix): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let function = context.vm.get_register(function.into()).clone();
        let name = context.vm.get_register(name.into()).clone();
        let name = match name.variant() {
            JsVariant::String(name) => PropertyKey::from(name.clone()),
            JsVariant::Symbol(name) => PropertyKey::from(name.clone()),
            _ => unreachable!(),
        };

        let prefix = match u32::from(prefix) {
            1 => Some(js_str!("get")),
            2 => Some(js_str!("set")),
            _ => None,
        };

        set_function_name(
            &function
                .as_object()
                .js_expect("function is not an object")?,
            &name,
            prefix,
            context,
        )?;
        Ok(())
    }
}

impl Operation for SetFunctionName {
    const NAME: &'static str = "SetFunctionName";
    const INSTRUCTION: &'static str = "INST - SetFunctionName";
    const COST: u8 = 4;
}
