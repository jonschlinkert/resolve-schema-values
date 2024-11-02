import type { JSONSchema, ResolveOptions } from '~/types';
import { evaluateCondition, validateValue } from '~/validate';

export const resolveConditional = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions
): Promise<any> => {
  if (!schema.if) {
    return value;
  }

  const conditionMet = await evaluateCondition(schema.if, value, options);
  if (conditionMet && schema.then) {
    return resolveValues(schema.then, value, options);
  } else if (!conditionMet && schema.else) {
    return resolveValues(schema.else, value, options);
  }

  return value;
};

export const resolveComposition = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions
): Promise<any> => {
  let result = value;

  if (schema.allOf) {
    for (let i = 0; i < schema.allOf.length; i++) {
      result = await resolveValues(schema.allOf[i], result, options);
    }
    return result;
  }

  if (schema.anyOf) {
    for (let i = 0; i < schema.anyOf.length; i++) {
      try {
        return await resolveValues(schema.anyOf[i], value, { ...options, skipValidation: true });
      } catch (e) {
        continue;
      }
    }
    return schema.default !== undefined ? schema.default : null;
  }

  if (schema.oneOf) {
    let validCount = 0;
    let lastValidResult = null;

    for (let i = 0; i < schema.oneOf.length; i++) {
      try {
        const resolved = await resolveValues(schema.oneOf[i], value, { ...options, skipValidation: true });
        validCount++;
        lastValidResult = resolved;
      } catch (e) {
        continue;
      }
    }

    if (validCount === 1) {
      return lastValidResult;
    }
    return schema.default !== undefined ? schema.default : null;
  }

  return result;
};

export const resolveObjectProperties = async (
  properties: Record<string, JSONSchema>,
  value: any,
  options: ResolveOptions
): Promise<Record<string, any>> => {
  const result: Record<string, any> = {};

  for (const key in properties) {
    result[key] = await resolveValues(properties[key], value[key], options);
  }

  return result;
};

export const resolveDependentSchemas = async (
  schema: JSONSchema,
  value: any,
  result: Record<string, any>,
  options: ResolveOptions
): Promise<Record<string, any>> => {
  if (!schema.dependentSchemas) {
    return result;
  }

  const newResult = { ...result };

  for (const dependentSchema of Object.values(schema.dependentSchemas)) {
    const resolvedDependent = await resolveValues(dependentSchema, value, options);

    if (typeof resolvedDependent === 'object') {
      Object.assign(newResult, resolvedDependent);
    }
  }

  return newResult;
};

export const resolvePatternProperties = async (
  schema: JSONSchema,
  value: any,
  result: Record<string, any>,
  options: ResolveOptions
): Promise<Record<string, any>> => {
  if (!schema.patternProperties) {
    return result;
  }

  const newResult = { ...result };

  for (const pattern in schema.patternProperties) {
    const regex = new RegExp(pattern);

    for (const [key, patternProp] of Object.entries(schema.patternProperties[pattern])) {
      if (regex.test(key) && !newResult.hasOwnProperty(key)) {
        newResult[key] = await resolveValues(patternProp, value[key], options);
      }
    }
  }

  return newResult;
};

export const resolveAdditionalProperties = async (
  schema: JSONSchema,
  value: any,
  result: Record<string, any>,
  options: ResolveOptions
): Promise<Record<string, any>> => {
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

  return newResult;
};

export const resolveArray = async (
  schema: JSONSchema,
  values: any[],
  options: ResolveOptions
): Promise<any[]> => {
  if (!Array.isArray(values)) {
    return schema.default !== undefined ? schema.default : [];
  }
  return resolveArrayItems(schema, values, options);
};

export const resolveArrayItems = async (
  schema: JSONSchema,
  values: any[],
  options: ResolveOptions
): Promise<any[]> => {
  const result: any[] = [];

  if (schema.items) {
    for (let i = 0; i < values.length; i++) {
      result.push(await resolveValues(schema.items, values[i], options));
    }
    return result;
  }

  return [...values];
};

// Type-specific resolvers
export const resolveString = (schema: JSONSchema, value: any): string => {
  if (typeof value !== 'string') {
    return schema.default !== undefined ? schema.default : '';
  }

  return value;
};

export const resolveInteger = (schema: JSONSchema, value: any): number => {
  if (schema.type === 'integer' && !Number.isInteger(value)) {
    return schema.default !== undefined ? schema.default : Math.floor(value);
  }

  return value;
};

export const resolveNumber = (schema: JSONSchema, value: any): number => {
  if (typeof value !== 'number') {
    return schema.default !== undefined ? schema.default : 0;
  }

  return value;
};

export const resolveBoolean = (schema: JSONSchema, value: any): boolean => {
  if (typeof value !== 'boolean') {
    return schema.default !== undefined ? schema.default : false;
  }

  return value;
};

export const resolveNull = (schema: JSONSchema, value: any): null => {
  if (value !== null) {
    return schema.default !== undefined ? schema.default : null;
  }

  return null;
};

export const resolveObject = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions
): Promise<any> => {
  if (typeof value !== 'object' || Array.isArray(value)) {
    return schema.default !== undefined ? schema.default : {};
  }

  let result = {};
  if (schema.properties) {
    result = await resolveObjectProperties(schema.properties, value, options);
  }

  result = await resolveDependentSchemas(schema, value, result, options);
  result = await resolvePatternProperties(schema, value, result, options);
  result = await resolveAdditionalProperties(schema, value, result, options);
  return result;
};

export const resolveValue = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions = {} // eslint-disable-line
): Promise<any> => {
  if (value == null) {
    return schema.default !== undefined ? schema.default : null;
  }

  if (schema.const !== undefined) {
    return schema.const;
  }

  if (schema.enum !== undefined) {
    return schema.enum.includes(value) ? value : schema.default;
  }

  return value;
};

export const resolveValues = async (
  schema: JSONSchema,
  values: any = {},
  options: ResolveOptions = {}
): Promise<any> => {
  const resolvedValue = await resolveValue(schema, values, options);
  const resolvedConditional = await resolveConditional(schema, resolvedValue, options);
  const result = await resolveComposition(schema, resolvedConditional, options);

  if (schema.type) {
    switch (schema.type) {
      case 'null': return resolveNull(schema, result);
      case 'array': return resolveArray(schema, result, options);
      case 'boolean': return resolveBoolean(schema, result);
      case 'integer': return resolveInteger(schema, result);
      case 'number': return resolveNumber(schema, result);
      case 'object': return resolveObject(schema, result, options);
      case 'string': return resolveString(schema, result);
      default: return result;
    }
  }

  return result;
};
