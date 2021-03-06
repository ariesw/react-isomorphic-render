import { event_name } from './naming'
import normalize_common_settings from './normalize'

// Returns Redux action creator.
// `promise` is for backwards compatibility:
// it has been renamed to `action` since `9.0.8`.
export function action({ namespace, event, promise, action, result }, handler)
{
	// Add handlers for:
	//
	//   * pending
	//   * success
	//   * error
	//
	create_redux_handlers(handler, namespace, event, result)

	return function action_creator(...parameters)
	{
		const redux_action =
		{
			event: event_name(namespace, event),
			promise: http => (action || promise).apply(this, parameters.concat(http))
		}

		return redux_action
	}
}

// Creates Redux handler object
// (which will eventually be transformed into a reducer)
export function create_handler(settings)
{
	settings = normalize_common_settings(settings, { full: false })

	const handlers = {}
	const registered_state_properties = []

	const result =
	{
		settings,

		handle(event, handler)
		{
			handlers[event] = handler
		},

		reducer(initial_state = {})
		{
			// applies a handler based on the action type
			// (is copy & paste'd for all action response handlers)
			return function(state = initial_state, action_data = {})
			{
				const handler = handlers[action_data.type]

				if (!handler)
				{
					return state
				}

				let handler_argument = action_data

				if (action_data.result !== undefined)
				{
					handler_argument = action_data.result
				}
				else if (action_data.error !== undefined)
				{
					handler_argument = action_data.error
				}
				else if (Object.keys(action_data) === 1)
				{
					handler_argument = {}
				}

				return handler(state, handler_argument)
			}
		},

		registered_state_properties,

		add_state_properties()
		{
			registered_state_properties.push.apply(registered_state_properties, arguments)
		}
	}

	result.addStateProperties = result.add_state_properties

	return result
}

// Adds handlers for:
//
//   * pending
//   * done
//   * failed
//   * reset error
//
function create_redux_handlers(handler, namespace, event, on_result)
{
	if (!handler.settings.asynchronous_action_event_naming)
	{
		throw new Error("`asynchronousActionEventNaming` function parameter was not passed")
	}
	
	if (!handler.settings.asynchronous_action_handler_state_property_naming)
	{
		throw new Error("`asynchronousActionHandlerStatePropertyNaming` function parameter was not passed")
	}

	const
	[
		pending_event_name,
		success_event_name,
		error_event_name
	]
	= handler.settings.asynchronous_action_event_naming(event)

	const pending_property_name = handler.settings.asynchronous_action_handler_state_property_naming(pending_event_name)
	const error_property_name   = handler.settings.asynchronous_action_handler_state_property_naming(error_event_name)

	// This info will be used in `storeConnector`
	handler.add_state_properties(pending_property_name, error_property_name)

	// If `on_result` is a property name,
	// then just set that property to the value of `result`.
	if (typeof on_result === 'string')
	{
		handler.add_state_properties(on_result)
	}

	// When Promise is created,
	// clear `error`,
	// set `pending` flag.
	handler.handle(event_name(namespace, pending_event_name), (state, result) =>
	({
		...state,
		// Set `pending` flag
		[pending_property_name] : true,
		// Clear `error`
		[error_property_name] : undefined
	}))

	// When Promise succeeds
	handler.handle(event_name(namespace, success_event_name), (state, result) =>
	{
		// This will be the new Redux state
		let new_state

		// If `on_result` is a reducer, then call it,
		// and the returned object will be the new state.
		if (typeof on_result === 'function')
		{
			new_state = on_result(state, result)

			// If the reducer function didn't return
			// the new state (which it should have done),
			// then create the new state manually.
			// (because `pending` property will be set later)
			if (new_state === state)
			{
				new_state = { ...state }
			}
		}
		// Else `on_result` is a property name, so populate it.
		else
		{
			new_state = { ...state }

			// If `on_result` is a property name,
			// then just set that property to the value of `result`.
			if (typeof on_result === 'string')
			{
				new_state[on_result] = result
			}
		}

		// Clear `pending` flag
		new_state[pending_property_name] = false

		// Return the new Redux state
		return new_state
	})

	// When Promise fails, clear `pending` flag and set `error`.
	// Can also clear `error` when no `error` is passed as part of an action.
	handler.handle(event_name(namespace, error_event_name), (state, error) =>
	({
		...state,
		[pending_property_name] : false,
		[error_property_name] : error
	}))
}

// A little helper for Redux `@connect()`
export function state_connector(handler)
{
	return function connect_state(state)
	{
		const result = {}

		for (let property_name of handler.registered_state_properties)
		{
			result[property_name] = state[property_name]
		}

		return result
	}
}