import type { JSONSchema, ResolveOptions } from '~/types';
import { evaluateCondition, validateValue } from '~/validate';
import { log } from '~/debug';

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export const resolveNull = (schema: JSONSchema, value: any): null => {
  log.value('resolveNull:', { schema, value });
  if (value !== null) {
    return schema.default !== undefined ? schema.default : null;
  }
  return null;
};

export const resolveBoolean = (schema: JSONSchema, value: any): boolean => {
  log.value('resolveBoolean:', { schema, value });
  if (typeof value !== 'boolean') {
    return schema.default !== undefined ? schema.default : false;
  }
  return value;
};

export const resolveInteger = (schema: JSONSchema, value: any): number => {
  log.value('resolveInteger:', { schema, value });
  if (schema.type === 'integer' && !Number.isInteger(value)) {
    return schema.default !== undefined ? schema.default : Math.floor(value);
  }
  return value;
};

export const resolveNumber = (schema: JSONSchema, value: any): number => {
  log.value('resolveNumber:', { schema, value });
  if (typeof value !== 'number') {
    return schema.default !== undefined ? schema.default : 0;
  }
  return value;
};

export const resolveString = (schema: JSONSchema, value: any): string => {
  log.value('resolveString:', { schema, value });
  if (typeof value !== 'string') {
    return schema.default !== undefined ? schema.default : '';
  }
  return value;
};

export const resolveConditional = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions
): Promise<any> => {
  log.cond('(start):', {
    ifSchema: schema.if,
    thenSchema: schema.then,
    elseSchema: schema.else,
    value
  });

  if (!schema.if) {
    log.cond('No if condition found');
    return value;
  }

  const isSatisfied = await evaluateCondition(schema.if, value, options);
  const targetSchema = isSatisfied ? schema.then : schema.else;
  log.cond('Condition evaluation (result):', { isSatisfied });

  log.cond('flow:', {
    isSatisfied,
    targetSchema,
    valueBeforeResolve: value
  });

  if (targetSchema) {
    if (targetSchema.properties) {
      // Resolve properties defined in the conditional schema
      const resolvedProperties = await resolveObjectProperties(targetSchema.properties, value, options);
      log.cond('properties resolved:', {
        resolvedProperties,
        originalValue: value
      });

      return { ...value, ...resolvedProperties };
    }

    // Handle other aspects of the schema
    const resolved = await resolveValues(targetSchema, value, options);
    return { ...value, ...resolved };
  }

  return value;
};

export const resolveAllOf = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions
): Promise<any> => {
  log.comp('Resolving allOf');
  let result = {};
  for (const subSchema of schema.allOf) {
    // First, resolve any properties and their defaults from the subschema
    if (subSchema.properties) {
      const resolvedProperties = await resolveObjectProperties(subSchema.properties, value, options);
      result = { ...result, ...resolvedProperties };
    }

    // Then resolve any other aspects of the subschema
    const resolved = await resolveValues(subSchema, { ...value, ...result }, options);
    result = { ...result, ...resolved };
  }
  log.comp('allOf (result):', result);
  return result;
};

export const resolveAnyOf = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions
): Promise<any> => {
  log.comp('Processing anyOf');
  for (const subSchema of schema.anyOf) {
    try {
      const isValid = (await validateValue(value, subSchema, options)).length === 0;
      if (isValid) {
        log.comp('anyOf found valid schema:', { value });
        return value;
      }
    } catch {
      continue;
    }
  }

  log.comp('anyOf using default:', schema.default);
  return schema.default;
};

export const resolveOneOf = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions
): Promise<any> => {
  log.comp('Processing oneOf');

  let validCount = 0;
  let validResult = null;

  for (const subSchema of schema.oneOf) {
    try {
      const errors = await validateValue(value, { ...subSchema }, options);
      if (errors.length === 0) {
        validCount++;
        validResult = value;
      }
    } catch {
      continue;
    }
  }

  log.comp('oneOf (result):', { validCount, validResult });
  return validCount === 1 ? validResult : schema.default;
};

export const resolveComposition = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions
): Promise<any> => {
  log.comp('resolveComposition (start):', { schema, value, options });

  if (schema.allOf) {
    return resolveAllOf(schema, value, options);
  }

  if (schema.anyOf) {
    return resolveAnyOf(schema, value, options);
  }

  if (schema.oneOf) {
    return resolveOneOf(schema, value, options);
  }

  return value;
};

export const resolveObjectProperties = async (
  properties: Record<string, JSONSchema>,
  value: any,
  options: ResolveOptions
): Promise<Record<string, any>> => {
  log.obj('resolveObjectProperties (start):', { properties, value, options });
  const result: Record<string, any> = {};

  for (const [key, propSchema] of Object.entries(properties)) {
    result[key] = await resolveValues(propSchema, value?.[key], options);
  }

  log.obj('resolveObjectProperties (result):', result);
  return result;
};

export const resolveDependentSchemas = async (
  schema: JSONSchema,
  value: any,
  result: Record<string, any>,
  options: ResolveOptions
): Promise<Record<string, any>> => {
  log.obj('resolveDependentSchemas (start):', { schema, value, result, options });

  if (!schema.dependentSchemas) {
    return result;
  }

  let newResult = { ...result };

  if (value) {
    for (const [prop, dependentSchema] of Object.entries(schema.dependentSchemas)) {
      if (value[prop] !== undefined) {
        // First resolve any properties defined in the dependent schema
        if (dependentSchema.properties) {
          const resolvedProperties = await resolveObjectProperties(
            dependentSchema.properties,
            value,
            options
          );
          newResult = { ...newResult, ...resolvedProperties };
        }

        // Then resolve any other aspects of the dependent schema
        const resolvedDependent = await resolveValues(dependentSchema, newResult, options);
        newResult = { ...newResult, ...resolvedDependent };
      }
    }
  }

  log.obj('resolveDependentSchemas (result):', newResult);
  return newResult;
};

export const resolvePatternProperties = async (
  schema: JSONSchema,
  value: any,
  result: Record<string, any>,
  options: ResolveOptions
): Promise<Record<string, any>> => {
  log.obj('resolvePatternProperties (start):', { schema, value, result, options });

  if (!schema.patternProperties) {
    return result;
  }

  const newResult = { ...result };

  for (const [pattern, prop] of Object.entries(schema.patternProperties)) {
    const regex = new RegExp(pattern);

    for (const [k, v] of Object.entries(prop)) {
      if (regex.test(k) && !(k in newResult)) {
        newResult[k] = await resolveValues(prop, v, options);
      }
    }
  }

  log.obj('resolvePatternProperties (result):', newResult);
  return newResult;
};

export const resolveAdditionalProperties = async (
  schema: JSONSchema,
  value: any,
  result: Record<string, any>,
  options: ResolveOptions
): Promise<Record<string, any>> => {
  log.obj('resolveAdditionalProperties (start):', { schema, value, result, options });

  if (schema.additionalProperties === false) {
    return result;
  }

  const newResult = { ...result };

  for (const key in value) {
    if (!newResult.hasOwnProperty(key)) {
      if (typeof schema.additionalProperties === 'object') {
        newResult[key] = await resolveValues(
          schema.additionalProperties,
          value[key],
          options
        );
      } else {
        newResult[key] = value[key];
      }
    }
  }

  log.obj('resolveAdditionalProperties (result):', newResult);
  return newResult;
};

export const resolveArray = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions
): Promise<any[]> => {
  log('resolveArray (start):', { schema, value, options });

  if (!Array.isArray(value)) {
    return schema.default !== undefined ? schema.default : [];
  }
  return resolveArrayItems(schema, value, options);
};

export const resolveArrayItems = async (
  schema: JSONSchema,
  values: any[],
  options: ResolveOptions
): Promise<any[]> => {
  log('resolveArrayItems (start):', { schema, values, options });

  if (!schema.items) {
    return values;
  }

  const result = [];
  for (const item of values) {
    result.push(await resolveValues(schema.items, item, options));
  }

  log('resolveArrayItems (result):', result);
  return result;
};

export const resolveObject = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions
): Promise<any> => {
  log('resolveObject (start):', {
    schema,
    value,
    hasProperties: Boolean(schema.properties)
  });

  if (!isObject(value)) {
    const defaultValue = schema.default !== undefined ? schema.default : {};
    log('Not an object, using default:', defaultValue);
    return defaultValue;
  }

  let result = value; // Start with the original value

  if (schema.properties) {
    log('Processing schema properties:', schema.properties);
    const resolvedProperties = await resolveObjectProperties(schema.properties, value, options);
    result = { ...result, ...resolvedProperties };
    log('After resolving properties:', result);
  }

  result = await resolveDependentSchemas(schema, value, result, options);
  result = await resolvePatternProperties(schema, value, result, options);
  result = await resolveAdditionalProperties(schema, value, result, options);

  log('Final object (result):', result);
  return result;
};

export const resolveValue = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions = {}
): Promise<any> => {
  log.value('resolveValue (start):', { schema, value, options });

  if (value == null) {
    const result = schema.default !== undefined ? schema.default : null;
    log.value('resolveValue null (result):', result);
    return result;
  }

  if (schema.const !== undefined) {
    log.value('resolveValue const (result):', schema.const);
    return schema.const;
  }

  if (schema.enum !== undefined) {
    const result = schema.enum.includes(value) ? value : schema.default;
    log.value('resolveValue enum (result):', result);
    return result;
  }

  log.value('resolveValue final (result):', value);
  return value;
};

export const resolveValues = async (
  schema: JSONSchema,
  values: any = {},
  options: ResolveOptions = {}
): Promise<any> => {
  log('resolveValues (start):', { schema, values, options });

  let result = values;

  // First resolve basic value (const, enum, default)
  result = await resolveValue(schema, result, options);
  log('After resolveValue:', { result });

  // Then apply conditional logic
  result = await resolveConditional(schema, result, options);
  log('After resolveConditional:', { result });

  // Then apply composition rules
  result = await resolveComposition(schema, result, options);
  log('After resolveComposition:', { result });

  log('Before type-specific resolution:', { type: schema.type, result });

  // Finally apply type-specific resolution
  if (schema.type) {
    switch (schema.type) {
      case 'null':
        result = resolveNull(schema, result);
        break;
      case 'array':
        result = await resolveArray(schema, result, options);
        break;
      case 'boolean':
        result = resolveBoolean(schema, result);
        break;
      case 'integer':
        result = resolveInteger(schema, result);
        break;
      case 'number':
        result = resolveNumber(schema, result);
        break;
      case 'object':
        result = await resolveObject(schema, result, options);
        break;
      case 'string':
        result = resolveString(schema, result);
        break;
      default: {
        break;
      }
    }
  }

  log('resolveValues final (result):', { result });
  return result;
};
