import type { JSONSchema, ResolveOptions } from '~/types';
import { mergeSchemas } from '~/merge';
import {
  getSegments,
  isComposition,
  isValidValueType,
  filterProps,
  getValueType,
  isObject
} from '~/utils';

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

const isValidFormat = (value: string, format: string): boolean => {
  switch (format) {
    case 'date-time': return !isNaN(Date.parse(value));
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(value);
    case 'time': return /^\d{2}:\d{2}:\d{2}$/.test(value);
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'ipv4': return /^(\d{1,3}\.){3}\d{1,3}$/.test(value);
    case 'uuid': return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    default: return true;
  }
};

export const evaluateCondition = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions
): Promise<boolean> => {
  // For nested property conditions (used in resolution)
  if (schema.properties && !options.skipPropertyCheck) {
    if (!value || typeof value !== 'object') {
      return false;
    }

    // Validate each property against its schema
    for (const [prop, condition] of Object.entries(schema.properties)) {
      if (condition.minimum !== undefined && (
        !value.hasOwnProperty(prop) ||
        value[prop] < condition.minimum
      )) {
        return false;
      }

      if (condition.maximum !== undefined && (
        !value.hasOwnProperty(prop) ||
        value[prop] > condition.maximum
      )) {
        return false;
      }

      const propValue = value[prop];
      const resolved = await internalResolveValues(condition, propValue, {
        ...options,
        skipValidation: true,
        skipConditional: true, // Prevent infinite recursion
        currentPath: [...options.currentPath || [], prop]
      });

      if (!resolved.ok) {
        return false;
      }
    }

    return true;
  }

  // For direct value validation
  const resolved = await internalResolveValues(schema, value, {
    ...options,
    skipValidation: true,
    skipConditional: true
  });

  return resolved.ok;
};

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

// eslint-disable-next-line complexity
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

  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
    errors.push({ message: `Value must be > ${schema.exclusiveMinimum}` });
  }

  if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
    errors.push({ message: `Value must be < ${schema.exclusiveMaximum}` });
  }

  if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
    errors.push({ message: `Value must be a multiple of ${schema.multipleOf}` });
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

  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
    errors.push({ message: `Value must be > ${schema.exclusiveMinimum}` });
  }

  if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
    errors.push({ message: `Value must be < ${schema.exclusiveMaximum}` });
  }

  if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
    errors.push({ message: `Value must be a multiple of ${schema.multipleOf}` });
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

  if (schema.format && !isValidFormat(value, schema.format)) {
    errors.push({ message: `Invalid ${schema.format} format` });
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

  for (const schema of allOf) {
    if (schema.type && !isValidValueType(value, schema.type)) {
      const type = [].concat(schema.type).join(', ');
      return failure([{ message: `Value must be of type: ${type}` }], parent, key);
    }
  }

  let mergedSchema = { ...rest };

  for (const subSchema of allOf) {
    mergedSchema = mergeSchemas(mergedSchema, subSchema, { isAllOf: true });

    if (mergedSchema.errors) {
      return failure(mergedSchema.errors, parent, key);
    }
  }

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
    const resolved = await internalResolveValues(subSchema, value, options, parent, key);
    if (resolved.ok) {
      return success(value, parent, key);
    }

    errors.push(...resolved.errors);
  }

  if (schema.default !== undefined) {
    return success(schema.default, parent, key);
  }

  return failure([{ message: 'Value must match at least one schema in anyOf' }], parent, key);
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
    const resolved = await internalResolveValues(subSchema, value, options, parent, key);
    if (resolved.ok) {
      validCount++;
      validResult = value;
    } else {
      errors.push(...resolved.errors);
    }
  }

  if (validCount !== 1) {
    if (schema.default !== undefined) {
      return success(schema.default, parent, key);
    }

    return failure([{ message: 'Value must match exactly one schema in oneOf' }], parent, key);
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
          newResult[k] = resolved.value;
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
      if (schema.default !== undefined) {
        return success(schema.default, parent, key);
      }

      if (required.includes(key)) {
        errors.push({ message: `Missing required array: ${key}` });
        return failure(errors, parent, key);
      }

      return success([], parent, key);
    }

    errors.push({ message: 'Value must be an array' });
    return failure(errors, parent, key);
  }

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push({ message: `Array length must be >= ${schema.minItems}` });
  }

  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push({ message: `Array length must be <= ${schema.maxItems}` });
  }

  if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) {
    errors.push({ message: 'Array items must be unique' });
  }

  if (schema.contains) {
    let containsValid = false;
    for (let i = 0; i < value.length; i++) {
      const resolved = await internalResolveValues(schema.contains, value[i], {
        ...options,
        currentPath: [i.toString()]
      });

      if (resolved.ok) {
        containsValid = true;
        break;
      }
    }
    if (!containsValid) {
      errors.push({ message: 'Array must contain at least one matching item' });
    }
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
  if (!schema.items && !schema.prefixItems) {
    return success(values, parent, key);
  }

  const result = [];
  const errors: ValidationError[] = [];
  const maxLength = Math.max(values.length, schema.prefixItems?.length || 0);

  for (let i = 0; i < maxLength; i++) {
    if (schema.prefixItems && i < schema.prefixItems.length) {
      const resolved = await internalResolveValues(schema.prefixItems[i], values[i], options, parent, i.toString());
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
    } else if (schema.items) {
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
    } else {
      result.push(values[i]);
    }
  }

  if (errors.length > 0) {
    return failure(errors, parent, key);
  }

  return success(result, parent, key);
};

// eslint-disable-next-line complexity
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
    return failure(errors, parent, key);
  }

  if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
    errors.push({ message: `Object must have >= ${schema.minProperties} properties` });
  }

  if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) {
    errors.push({ message: `Object must have <= ${schema.maxProperties} properties` });
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

  if (schema.propertyNames) {
    for (const propName in value) {
      const resolved = await internalResolveValues(schema.propertyNames, propName, {
        ...options,
        currentPath: [propName]
      });

      if (!resolved.ok) {
        for (const error of resolved.errors) {
          errors.push({
            message: error.message,
            path: [propName, ...error.path || []]
          });
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

  if (schema.not && !options.skipValidation) {
    const notResult = await internalResolveValues(schema.not, value, {
      ...options,
      skipValidation: true
    });

    if (notResult.ok) {
      errors.push({ message: 'Value must not match schema' });
    }
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

  if (isObject(result) && schema.if) {
    const conditionalResult = await resolveConditional(schema, result, options, parent, key);
    if (!conditionalResult.ok) {
      return conditionalResult;
    }

    result = conditionalResult.value;
  }

  if (isObject(result) && isComposition(schema)) {
    const compositionResult = await resolveComposition(schema, result, options, parent, key);
    if (!compositionResult.ok) {
      return compositionResult;
    }

    result = compositionResult.value;
  }

  if (!schema.type) {
    return success(result, parent, key);
  }

  if (Array.isArray(schema.type)) {
    const valueType = getValueType(result, schema.type);

    if (valueType === undefined) {
      return failure([{ message: `Value must be one of type: ${schema.type.join(', ')}` }], parent, key);
    }

    const typeSchema = filterProps({ ...schema, type: valueType }, valueType);
    return internalResolveValues(typeSchema, result, options, parent, key);
  }

  switch (schema.type) {
    case 'null': return resolveNull(schema, result, parent, key);
    case 'array': return resolveArray(schema, result, options, parent, key);
    case 'boolean': return resolveBoolean(schema, result, parent, key);
    case 'integer': return resolveInteger(schema, result, parent, key);
    case 'number': return resolveNumber(schema, result, parent, key);
    case 'object': return resolveObject(schema, result, options, parent, key);
    case 'string': return resolveString(schema, result, parent, key);
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
