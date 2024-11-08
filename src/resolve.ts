import type { JSONSchema, ResolveOptions } from '~/types';
import { evaluateCondition, validateValue } from '~/validate';
import { mergeSchemas } from '~/merge';

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export const getSegments = (
  input: string,
  options: {
    language?: string;
    granularity?: 'grapheme' | 'word' | 'sentence' | 'line',
    localeMatcher: 'lookup' | 'best fit'
  } = {}
): Intl.SegmentData[] => {
  const { language, granularity = 'grapheme', ...opts } = options;
  const segmenter = new Intl.Segmenter(language, { granularity, ...opts });
  return Array.from(segmenter.segment(input));
};

interface ValidationError {
  message: string;
  path?: string[];
}

interface Success<T> {
  ok: true;
  value: T;
  parent: any;
  key?: string;
}

interface Failure {
  ok: false;
  errors: ValidationError[];
  parent: any;
  key?: string;
}

type Result<T> = Success<T> | Failure;

const success = <T>(value: T, parent, key?: string): Success<T> => ({
  ok: true,
  value,
  parent,
  key
});

const failure = (errors: ValidationError[], parent, key?: string): Failure => ({
  ok: false,
  errors,
  parent,
  key
});

export const resolveNull = (schema: JSONSchema, value: any, parent, key?: string): Result<null> => {
  const errors: ValidationError[] = [];

  if (value !== undefined && value !== null) {
    errors.push({ message: 'Value must be null' });
    return failure(errors, parent, key);
  }

  return success(null, parent, key);
};

export const resolveBoolean = (schema: JSONSchema, value: any, parent, key?: string): Result<boolean> => {
  const required = parent?.required || [];
  const errors: ValidationError[] = [];

  if (value === undefined || value === null) {
    return success(schema.default !== undefined ? schema.default : false, parent, key);
  }

  if (typeof value !== 'boolean' && (value != null || required.includes(key))) {
    errors.push({ message: 'Value must be a boolean' });
    return failure(errors, parent, key);
  }

  return success(value, parent, key);
};

export const resolveInteger = (schema: JSONSchema, value: any, parent, key?: string): Result<number> => {
  const required = parent?.required || [];
  const errors: ValidationError[] = [];

  if (value === undefined || value === null) {
    if (schema.default !== undefined) {
      return success(schema.default, parent, key);
    }

    if (required.includes(key)) {
      errors.push({ message: `Missing required integer: ${key}` });
      return failure(errors, parent, key);
    }

    return success(0, parent, key);
  }

  if (typeof value !== 'number' && (value != null || required.includes(key))) {
    errors.push({ message: 'Value must be a number' });
  }

  if (schema.type === 'integer' && !Number.isInteger(value)) {
    errors.push({ message: 'Value must be an integer' });
  }

  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push({ message: `Value must be >= ${schema.minimum}` });
  }

  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push({ message: `Value must be <= ${schema.maximum}` });
  }

  if (errors.length > 0) {
    return failure(errors, parent, key);
  }

  return success(value, parent, key);
};

export const resolveNumber = (schema: JSONSchema, value: any, parent, key?: string): Result<number> => {
  const required = parent?.required || [];
  const errors: ValidationError[] = [];

  if (value === undefined || value === null) {
    if (schema.default !== undefined) {
      return success(schema.default, parent, key);
    }

    if (required.includes(key)) {
      errors.push({ message: `Missing required number: ${key}` });
      return failure(errors, parent, key);
    }

    return success(0, parent, key);
  }

  if (typeof value !== 'number' && (value != null || required.includes(key))) {
    errors.push({ message: 'Value must be a number' });
  }

  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push({ message: `Value must be >= ${schema.minimum}` });
  }

  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push({ message: `Value must be <= ${schema.maximum}` });
  }

  if (errors.length > 0) {
    return failure(errors, parent, key);
  }

  return success(value, parent, key);
};

export const resolveString = (schema: JSONSchema, value: any, parent, key?: string): Result<string> => {
  const required = parent?.required || [];
  const errors: ValidationError[] = [];

  if (value === undefined || value === null) {
    if (schema.default !== undefined) {
      return success(schema.default, parent, key);
    }

    if (required.includes(key)) {
      errors.push({ message: `Missing required string: ${key}` });
      return failure(errors, parent, key);
    }

    return success(undefined, parent, key);
  }

  if (typeof value !== 'string' && (value != null || required.includes(key))) {
    errors.push({ message: 'Value must be a string' });
  }

  let valueLength;
  const length = () => {
    if (valueLength === undefined) {
      const segments = getSegments(value);
      valueLength = segments.length;
    }
    return valueLength;
  };

  if (schema.minLength !== undefined && length() < schema.minLength) {
    errors.push({ message: `String length must be >= ${schema.minLength}` });
  }

  if (schema.maxLength !== undefined && length() > schema.maxLength) {
    errors.push({ message: `String length must be <= ${schema.maxLength}` });
  }

  if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
    errors.push({ message: `String must match pattern: ${schema.pattern}` });
  }

  if (errors.length > 0) {
    return failure(errors, parent, key);
  }

  return success(value, parent, key);
};

export const resolveConditional = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions,
  parent,
  key?: string
): Promise<Result<any>> => {
  if (!schema.if) {
    return success(value, parent, key);
  }

  const isSatisfied = await evaluateCondition(schema.if, value, options);
  const conditionalSchema = isSatisfied ? schema.then : schema.else;

  if (!conditionalSchema) {
    return success(value, parent, key);
  }

  // Create base schema without conditional properties
  const baseSchema = { ...schema };
  delete baseSchema.if;
  delete baseSchema.then;
  delete baseSchema.else;

  // Merge base schema with the appropriate conditional schema
  const mergedSchema = mergeSchemas(baseSchema, conditionalSchema);

  // Resolve the value against the merged schema
  const resolved = await internalResolveValues(mergedSchema, value, options, parent, key);
  return resolved;
};

export const resolveAllOf = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions,
  parent,
  key?: string
): Promise<Result<any>> => {
  const { allOf, ...rest } = schema;
  const mergedSchema = allOf.reduce((acc, subSchema) => mergeSchemas(acc, subSchema), rest);
  return internalResolveValues(mergedSchema, value, options, parent, key);
};

export const resolveAnyOf = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions,
  parent,
  key?: string
): Promise<Result<any>> => {
  const errors: ValidationError[] = [];

  for (const subSchema of schema.anyOf) {
    const validation = await validateValue(value, subSchema, options);
    if (validation.length === 0) {
      return success(value, parent, key);
    }

    errors.push(...validation.map(err => ({ message: err.message, path: err.path })));
  }

  if (schema.default !== undefined) {
    return success(schema.default, parent, key);
  }

  return failure(errors, parent, key);
};

export const resolveOneOf = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions,
  parent,
  key?: string
): Promise<Result<any>> => {
  let validCount = 0;
  let validResult = null;
  const errors: ValidationError[] = [];

  for (const subSchema of schema.oneOf) {
    const validation = await validateValue(value, subSchema, options);
    if (validation.length === 0) {
      validCount++;
      validResult = value;
    } else {
      errors.push(...validation.map(err => ({ message: err.message, path: err.path })));
    }
  }

  if (validCount !== 1) {
    if (schema.default !== undefined) {
      return success(schema.default, parent, key);
    }

    return failure(errors, parent, key);
  }

  return success(validResult, parent, key);
};

export const resolveComposition = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions,
  parent,
  key?: string
): Promise<Result<any>> => {
  if (schema.allOf) {
    return resolveAllOf(schema, value, options, parent, key);
  }

  if (schema.anyOf) {
    return resolveAnyOf(schema, value, options, parent, key);
  }

  if (schema.oneOf) {
    return resolveOneOf(schema, value, options, parent, key);
  }
  return success(value, parent, key);
};

export const resolveObjectProperties = async (
  properties: Record<string, JSONSchema>,
  value: any,
  options: ResolveOptions,
  parent,
  key?: string
): Promise<Result<Record<string, any>>> => {
  const result: Record<string, any> = {};
  const errors: ValidationError[] = [];

  for (const [propKey, propSchema] of Object.entries(properties)) {
    if (value?.[propKey] === undefined && propSchema.default !== undefined) {
      result[propKey] = propSchema.default;
      continue;
    }

    const resolved = await internalResolveValues(propSchema, value?.[propKey], options, parent, propKey);

    if (!resolved.ok) {
      for (const error of resolved.errors) {
        errors.push({
          message: error.message,
          path: error.path ? [propKey, ...error.path] : [propKey]
        });
      }
    } else {
      result[propKey] = resolved.value;
    }
  }

  if (errors.length > 0) {
    return failure(errors, parent, key);
  }

  return success(result, parent, key);
};

export const resolveDependentSchemas = async (
  schema: JSONSchema,
  value: any,
  result: Record<string, any>,
  options: ResolveOptions,
  parent,
  key?: string
): Promise<Result<Record<string, any>>> => {
  if (!schema.dependentSchemas || !value) {
    return success(result, parent, key);
  }

  const { dependentSchemas, ...rest } = schema;

  // Create merged schema from applicable dependent schemas
  const depSchemas = Object.entries(dependentSchemas)
    .filter(([prop]) => value[prop] !== undefined)
    .map(([, schema]) => schema);

  if (depSchemas.length === 0) {
    return success(result, parent, key);
  }

  const mergedSchema = depSchemas.reduce((acc, schema) => mergeSchemas(acc, schema), rest);

  // Resolve against merged schema
  return internalResolveValues(mergedSchema, result, options, parent, key);
};

export const resolvePatternProperties = async (
  schema: JSONSchema,
  value: any,
  result: Record<string, any>,
  options: ResolveOptions,
  parent,
  key?: string
): Promise<Result<Record<string, any>>> => {
  if (!schema.patternProperties) {
    return success(result, parent, key);
  }

  const newResult = { ...result };
  const errors: ValidationError[] = [];

  for (const [pattern, propSchema] of Object.entries(schema.patternProperties)) {
    const regex = new RegExp(pattern, 'u');

    for (const [k, v] of Object.entries(value)) {
      if (regex.test(k) && !(k in newResult)) {
        const resolved = await internalResolveValues(propSchema, v, options, parent, k);
        if (!resolved.ok) {
          for (const error of resolved.errors) {
            errors.push({
              message: error.message,
              path: error.path ? [k, ...error.path] : [k]
            });
          }
        } else {
          newResult[key] = resolved.value;
        }
      }
    }
  }

  if (errors.length > 0) {
    return failure(errors, parent, key);
  }

  return success(newResult, parent, key);
};

export const resolveAdditionalProperties = async (
  schema: JSONSchema,
  value: any,
  result: Record<string, any>,
  options: ResolveOptions,
  parent,
  key?: string
): Promise<Result<Record<string, any>>> => {
  if (schema.additionalProperties === false) {
    return success(result, parent, key);
  }

  const newResult = { ...result };
  const errors: ValidationError[] = [];

  for (const [k, v] of Object.entries(value)) {
    if (!newResult.hasOwnProperty(k)) {
      if (typeof schema.additionalProperties === 'object') {
        const resolved = await internalResolveValues(schema.additionalProperties, v, options, parent, k);
        if (!resolved.ok) {
          for (const error of resolved.errors) {
            errors.push({
              message: error.message,
              path: error.path ? [k, ...error.path] : [k]
            });
          }
        } else {
          newResult[k] = resolved.value;
        }
      } else {
        newResult[k] = v;
      }
    }
  }

  if (errors.length > 0) {
    return failure(errors, parent, key);
  }

  return success(newResult, parent, key);
};

export const resolveArray = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions,
  parent,
  key?: string
): Promise<Result<any[]>> => {
  const errors: ValidationError[] = [];
  const required = parent?.required || [];

  if (!Array.isArray(value)) {
    if (value === undefined || value === null) {
      const defaultValue = schema.default;
      if (defaultValue !== undefined) {
        return success(defaultValue, parent, key);
      }
      if (required.includes(key)) {
        errors.push({ message: `Missing required array: ${key}` });
        return failure(errors, parent, key);
      }
      return success([], parent, key);
    }

    errors.push({ message: 'Value must be an array' });
  }

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push({ message: `Array length must be >= ${schema.minItems}` });
  }

  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push({ message: `Array length must be <= ${schema.maxItems}` });
  }

  if (schema.uniqueItems && new Set(value).size !== value.length) {
    errors.push({ message: 'Array items must be unique' });
  }

  if (errors.length > 0) {
    return failure(errors, parent, key);
  }

  return resolveArrayItems(schema, value, options, parent, key);
};

export const resolveArrayItems = async (
  schema: JSONSchema,
  values: any[],
  options: ResolveOptions,
  parent,
  key?: string
): Promise<Result<any[]>> => {
  if (!schema.items) {
    return success(values, parent, key);
  }

  const result = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < values.length; i++) {
    const resolved = await internalResolveValues(schema.items, values[i], options, parent, i.toString());
    if (!resolved.ok) {
      for (const error of resolved.errors) {
        errors.push({
          message: error.message,
          path: error.path ? [i.toString(), ...error.path] : [i.toString()]
        });
      }
    } else {
      result.push(resolved.value);
    }
  }

  if (errors.length > 0) {
    return failure(errors, parent, key);
  }

  return success(result, parent, key);
};

export const resolveObject = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions,
  parent,
  key?: string
): Promise<Result<any>> => {
  const errors: ValidationError[] = [];
  const required = parent?.required || [];

  if (!isObject(value)) {
    if (value === undefined || value === null) {
      const defaultValue = schema.default;
      if (defaultValue !== undefined) {
        return success(defaultValue, parent, key);
      }
      if (required.includes(key)) {
        errors.push({ message: `Missing required object: ${key}` });
        return failure(errors, parent, key);
      }
      return success({}, parent, key);
    }

    errors.push({ message: 'Value must be an object' });
  }

  if (schema.required) {
    for (const key of schema.required) {
      const prop = schema.properties?.[key];

      if (!(key in value)) {
        const defaultValue = prop?.default;

        if (defaultValue !== undefined) {
          value[key] = defaultValue;
        } else {
          errors.push({ message: `Missing required property: ${key}`, path: [key] });
        }
      }
    }
  }

  if (errors.length > 0) {
    return failure(errors, parent, key);
  }

  let result = value;

  if (schema.properties) {
    const resolvedProperties = await resolveObjectProperties(schema.properties, value, options, parent);
    if (!resolvedProperties.ok) {
      return resolvedProperties;
    }

    result = { ...result, ...resolvedProperties.value };
  }

  const dependentResult = await resolveDependentSchemas(schema, value, result, options, parent);
  if (!dependentResult.ok) {
    return dependentResult;
  }

  result = dependentResult.value;

  const patternResult = await resolvePatternProperties(schema, value, result, options, parent);
  if (!patternResult.ok) {
    return patternResult;
  }

  result = patternResult.value;

  const additionalResult = await resolveAdditionalProperties(schema, value, result, options, parent);
  if (!additionalResult.ok) {
    return additionalResult;
  }

  result = additionalResult.value;
  return success(result, parent, key);
};

export const resolveValue = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions = {},
  parent,
  key?: string
): Promise<Result<any>> => {
  const errors: ValidationError[] = [];
  const required = parent?.required || [];

  if (schema.oneOf || schema.anyOf || schema.allOf) {
    return resolveComposition(schema, value, options, parent, key);
  }

  if (value === undefined || value === null) {
    const defaultValue = schema.default ?? schema.const;
    if (defaultValue !== undefined) {
      return success(defaultValue, parent, key);
    }
    if (required.includes(key)) {
      errors.push({ message: `Missing required value: ${key}` });
      return failure(errors, parent, key);
    }
    return success(value, parent, key);
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push({ message: `Value must be ${schema.const}` });
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push({ message: `Value must be one of: ${schema.enum.join(', ')}` });
  }

  if (errors.length > 0) {
    return failure(errors, parent, key);
  }

  return success(value, parent, key);
};

export const internalResolveValues = async (
  schema: JSONSchema,
  values: any,
  options: ResolveOptions = {},
  parent = schema,
  key?: string
): Promise<Result<any>> => {
  let result = values;

  const valueResult = await resolveValue(schema, result, options, parent, key);
  if (!valueResult.ok) {
    return valueResult;
  }

  result = valueResult.value;

  if (isObject(result)) {
    const conditionalResult = await resolveConditional(schema, result, options, parent, key);
    if (!conditionalResult.ok) {
      return conditionalResult;
    }

    result = conditionalResult.value;

    const compositionResult = await resolveComposition(schema, result, options, parent, key);
    if (!compositionResult.ok) {
      return compositionResult;
    }

    result = compositionResult.value;
  }

  if (!schema.type) {
    return success(result, parent, key);
  }

  if (Array.isArray(schema.required)) {
    schema.required = [...new Set(schema.required.filter(k => schema.properties?.[k]))];
  }

  switch (schema.type) {
    case 'null':
      return resolveNull(schema, result, parent, key);
    case 'array':
      return resolveArray(schema, result, options, parent, key);
    case 'boolean':
      return resolveBoolean(schema, result, parent, key);
    case 'integer':
      return resolveInteger(schema, result, parent, key);
    case 'number':
      return resolveNumber(schema, result, parent, key);
    case 'object':
      return resolveObject(schema, result, options, parent, key);
    case 'string':
      return resolveString(schema, result, parent, key);
    default: {
      return failure([{ message: `Unsupported type: ${schema.type}` }], parent, key);
    }
  }
};

export const resolveValues = async (
  schema: JSONSchema,
  values: any,
  options: ResolveOptions = {}
): Promise<Result<any>> => {
  const { ok, errors, value } = await internalResolveValues(schema, values, options);
  return ok ? { ok, value } : { ok, errors };
};
