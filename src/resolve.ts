/* eslint-disable complexity */
import type { JSONSchema, ResolveOptions } from '~/types';
import { mergeSchemas } from '~/merge';
import {
  deepAssign,
  filterProps,
  getSegments,
  getValueType,
  isComposition,
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

class SchemaResolver {
  private readonly options: ResolveOptions & { getValue?: (obj: any, key: string) => any };
  private negationDepth: number;

  constructor(options: ResolveOptions = {}) {
    this.options = {
      ...options,
      getValue: options.getValue || ((obj, key) => obj?.[key])
    };
    this.negationDepth = 0;
    this.stack = [];
  }

  private success<T>(value: T, parent, key?: string): Success<T> {
    return { ok: true, value, parent, key };
  }

  private failure(errors: ValidationError[], parent, key?: string): Failure {
    return { ok: false, errors, parent, key };
  }

  private isInsideNegation(): boolean {
    return this.negationDepth > 0;
  }

  private isValidFormat(value: string, format: string): boolean {
    switch (format) {
      case 'date-time': return !isNaN(Date.parse(value));
      case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(value);
      case 'time': return /^\d{2}:\d{2}:\d{2}$/.test(value);
      case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case 'ipv4': {
        if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return false;
        return value.split('.').every(num => {
          const n = parseInt(num, 10);
          return n >= 0 && n <= 255;
        });
      }
      case 'uuid': return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      default: return true;
    }
  }

  private async evaluateCondition(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<boolean> {
    const { getValue = this.options.getValue } = options;

    if (schema.contains?.const && !value?.some(item => item === schema.contains?.const)) {
      return false;
    }

    if (schema.items) {
      if (!Array.isArray(value)) {
        return false;
      }

      for (let i = 0; i < value.length; i++) {
        const itemValue = getValue(value, String(i));
        const resolved = await this.internalResolveValues(schema.items, itemValue, parent, key, {
          ...options,
          currentPath: [i]
        });

        if (!resolved.ok) {
          return false;
        }
      }

      return true;
    }

    if (schema.properties) {
      if (!isObject(value)) {
        return false;
      }

      for (const [prop, condition] of Object.entries(schema.properties)) {
        const parentProp = parent?.properties?.[prop];
        const propValue = getValue(value, prop);

        if (propValue === undefined) {
          if (condition.default !== undefined) {
            value[prop] = condition.default;
          } else {
            return false;
          }
        }

        const propSchema = mergeSchemas(parentProp, condition, { mergeType: false });
        const resolved = await this.internalResolveValues(propSchema, propValue, schema, prop, {
          ...options,
          skipValidation: true,
          skipConditional: true
        });

        if (!resolved.ok) {
          return false;
        }
      }

      return true;
    }

    const resolved = await this.internalResolveValues(schema, value, parent, key, {
      ...options,
      skipValidation: true,
      skipConditional: true
    });

    return resolved.ok;
  }

  private async resolveNull(schema: JSONSchema, value: any, parent, key?: string): Result<null> {
    const errors: ValidationError[] = [];

    if (value !== undefined && value !== null) {
      errors.push({ message: 'Value must be null' });
      return this.failure(errors, parent, key);
    }

    return this.success(null, parent, key);
  }

  private async resolveBoolean(schema: JSONSchema, value: any, parent, key?: string): Result<boolean> {
    const required = parent?.required || [];
    const errors: ValidationError[] = [];

    if (value === undefined || value === null) {
      return this.success(schema.default !== undefined ? schema.default : false, parent, key);
    }

    if (typeof value !== 'boolean' && (value != null || (required.includes(key) && !this.isInsideNegation()))) {
      errors.push({ message: 'Value must be a boolean' });
      return this.failure(errors, parent, key);
    }

    return this.success(value, parent, key);
  }

  private async resolveInteger(schema: JSONSchema, value: any, parent, key?: string): Result<number> {
    const required = parent?.required || [];
    const errors: ValidationError[] = [];

    if (value === undefined || value === null) {
      if (schema.default !== undefined) {
        return this.success(schema.default, parent, key);
      }

      if (required.includes(key) && !this.isInsideNegation()) {
        errors.push({ message: `Missing required integer: ${key}` });
        return this.failure(errors, parent, key);
      }

      return this.success(0, parent, key);
    }

    if (typeof value !== 'number' && (value != null || (required.includes(key) && !this.isInsideNegation()))) {
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
      return this.failure(errors, parent, key);
    }

    return this.success(value, parent, key);
  }

  private async resolveNumber(schema: JSONSchema, value: any, parent, key?: string): Result<number> {
    const required = parent?.required || [];
    const errors: ValidationError[] = [];

    if (value === undefined || value === null) {
      if (schema.default !== undefined) {
        return this.success(schema.default, parent, key);
      }

      if (required.includes(key) && !this.isInsideNegation()) {
        errors.push({ message: `Missing required number: ${key}` });
        return this.failure(errors, parent, key);
      }

      return this.success(0, parent, key);
    }

    if (typeof value !== 'number' && (value != null || (required.includes(key) && !this.isInsideNegation()))) {
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
      return this.failure(errors, parent, key);
    }

    return this.success(value, parent, key);
  }

  private async resolveString(schema: JSONSchema, value: any, parent, key?: string): Result<string> {
    const required = parent?.required || [];
    const errors: ValidationError[] = [];

    if (value === undefined || value === null) {
      if (schema.default !== undefined) {
        return this.success(schema.default, parent, key);
      }

      if (required.includes(key) && !this.isInsideNegation()) {
        errors.push({ message: `Missing required string: ${key}` });
        return this.failure(errors, parent, key);
      }

      return this.success(undefined, parent, key);
    }

    if (typeof value !== 'string' && (value != null || (required.includes(key) && !this.isInsideNegation()))) {
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

    if (schema.format && !this.isValidFormat(value, schema.format)) {
      errors.push({ message: `Invalid ${schema.format} format` });
    }

    if (errors.length > 0) {
      return this.failure(errors, parent, key);
    }

    return this.success(value, parent, key);
  }

  private async resolveConditional(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<any>> {
    this.isInsideConditional = true;
    const { if: ifSchema, then: thenSchema, else: elseSchema = {}, ...partialSchema } = schema;

    const isSatisfied = await this.evaluateCondition(ifSchema, value, parent, key, options);
    const targetSchema = isSatisfied ? thenSchema : elseSchema;

    const completeSchema = mergeSchemas(partialSchema, targetSchema, { mergeType: false });
    const resolved = await this.internalResolveValues(completeSchema, value, parent, key, options);
    return resolved;
  }

  private async resolveAllOf(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<any>> {
    const { allOf, ...partialSchema } = schema;
    const errors: ValidationError[] = [];
    let values = {};

    for (const subSchema of allOf) {
      let merged;
      if (subSchema.if) {
        const mergedSubSchema = mergeSchemas(subSchema, partialSchema, { mergeType: false });
        const condResult = await this.resolveConditional(mergedSubSchema, value, parent, 'allOf', options);

        if (!condResult.ok) {
          errors.push(...condResult.errors);
        }

        merged = partialSchema;
      } else {
        merged = mergeSchemas(subSchema, partialSchema, { mergeType: false });
      }

      const result = await this.internalResolveValues(merged, value, parent, 'allOf', options);
      if (!result.ok) {
        errors.push(...result.errors);
      } else {
        values = deepAssign(values, result.value);
      }
    }

    if (errors.length > 0) {
      return this.failure(errors, parent, key);
    }

    if (isObject(value) && isObject(values)) {
      return this.success(values, parent, key);
    }

    return this.internalResolveValues(partialSchema, value, parent, key);
  }

  private async resolveAnyOf(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<any>> {
    const errors: ValidationError[] = [];
    const { anyOf, ...rest } = schema;

    for (const subSchema of anyOf) {
      const mergedSchema = mergeSchemas(subSchema, rest);
      const resolved = await this.internalResolveValues(mergedSchema, value, parent, 'anyOf', options);

      if (resolved.ok) {
        return this.success(value, parent, key);
      }

      errors.push(...resolved.errors);
    }

    if (schema.default !== undefined) {
      return this.success(schema.default, parent, key);
    }

    return this.failure([{ message: 'Value must match at least one schema in anyOf' }], parent, key);
  }

  private async resolveOneOf(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<any>> {
    let validCount = 0;
    let validResult = null;
    const errors: ValidationError[] = [];
    const { oneOf, ...rest } = schema;

    for (const subSchema of oneOf) {
      const mergedSchema = mergeSchemas(subSchema, rest);
      const resolved = await this.internalResolveValues(mergedSchema, value, parent, 'oneOf', options);
      if (resolved.ok) {
        validCount++;
        validResult = value;
      } else {
        errors.push(...resolved.errors);
      }
    }

    if (validCount !== 1) {
      if (schema.default !== undefined) {
        return this.success(schema.default, parent, key);
      }

      return this.failure([{ message: 'Value must match exactly one schema in oneOf' }], parent, key);
    }

    return this.success(validResult, parent, key);
  }

  private async resolveNot(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<any>> {
    this.negationDepth++;

    try {
      const { not: notSchema, ...partialSchema } = schema;
      const notResult = await this.internalResolveValues(notSchema, value, parent, 'not', options);
      if (notResult.ok) {
        return this.failure([{ message: 'Value must not match schema' }], parent, key);
      }

      return this.internalResolveValues(partialSchema, value, parent, 'not', options);
    } finally {
      this.negationDepth--;
    }
  }

  private resolveNotRequired(schema: JSONSchema, value: any): boolean {
    const { getValue = this.options.getValue } = {};

    if (schema.allOf) {
      const notSchemas = schema.allOf.filter(s => s.not?.required);
      if (notSchemas.length > 0) {
        return notSchemas.every(s => {
          const requiredProps = s.not.required;
          return !requiredProps.every(prop => getValue(value, prop) !== undefined);
        });
      }
    }

    if (schema.not?.required) {
      const requiredProps = schema.not.required;
      return !requiredProps.every(prop => getValue(value, prop) !== undefined);
    }

    return true;
  }

  private async resolveComposition(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<any>> {
    if (schema.not) {
      return this.resolveNot(schema, value, parent, key, options);
    }

    if (schema.allOf) {
      return this.resolveAllOf(schema, value, parent, key, options);
    }

    if (schema.anyOf) {
      return this.resolveAnyOf(schema, value, parent, key, options);
    }

    if (schema.oneOf) {
      return this.resolveOneOf(schema, value, parent, key, options);
    }

    return this.success(value, parent, key);
  }

  private async resolveArray(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<any[]>> {
    const errors: ValidationError[] = [];
    const required = parent?.required || [];
    const { getValue = this.options.getValue } = options;

    if (!Array.isArray(value)) {
      if (value === undefined || value === null) {
        if (schema.default !== undefined) {
          return this.success(schema.default, parent, key);
        }

        if (required.includes(key) && !this.isInsideNegation()) {
          errors.push({ message: `Missing required array: ${key}` });
          return this.failure(errors, parent, key);
        }

        return this.success([], parent, key);
      }

      errors.push({ message: 'Value must be an array' });
      return this.failure(errors, parent, key);
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
        const itemValue = getValue(value, String(i));
        const resolved = await this.internalResolveValues(schema.contains, itemValue, parent, key, {
          ...options,
          currentPath: [i]
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
      return this.failure(errors, parent, key);
    }

    return this.resolveArrayItems(schema, value, parent, key, options);
  }

  private async resolveArrayItems(
    schema: JSONSchema,
    values: any[],
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<any[]>> {
    const { getValue = this.options.getValue } = options;

    if (!schema.items && !schema.prefixItems) {
      return this.success(values, parent, key);
    }

    const result = [];
    const errors: ValidationError[] = [];
    const maxLength = Math.max(values.length, schema.prefixItems?.length || 0);

    if (Array.isArray(schema.items)) {
      for (let i = 0; i < values.length; i++) {
        const itemValue = getValue(values, String(i));

        if (i < schema.items.length) {
          const resolved = await this.internalResolveValues(schema.items[i], itemValue, parent, i, options);

          if (!resolved.ok) {
            for (const error of resolved.errors) {
              errors.push({
                message: error.message,
                path: error.path ? [i, ...error.path] : [i]
              });
            }
          } else {
            result.push(resolved.value);
          }
        } else if (schema.additionalItems === false) {
          errors.push({ message: 'Additional items not allowed' });
          break;
        } else if (schema.additionalItems) {
          const resolved = await this.internalResolveValues(schema.additionalItems, itemValue, parent, i, options);

          if (!resolved.ok) {
            for (const error of resolved.errors) {
              errors.push({
                message: error.message,
                path: error.path ? [i, ...error.path] : [i]
              });
            }
          }
        }
      }

      if (errors.length > 0) {
        return this.failure(errors, parent, key);
      }

      return this.success(result, parent, key);
    }

    for (let i = 0; i < maxLength; i++) {
      const itemValue = getValue(values, String(i));

      if (schema.prefixItems && i < schema.prefixItems.length) {
        const resolved = await this.internalResolveValues(schema.prefixItems[i], itemValue, parent, i, options);

        if (!resolved.ok) {
          for (const error of resolved.errors) {
            errors.push({
              message: error.message,
              path: error.path ? [i, ...error.path] : [i]
            });
          }
        } else {
          result.push(resolved.value);
        }
      } else if (isObject(schema.items)) {
        const resolved = await this.internalResolveValues(schema.items, itemValue, parent, i, options);
        if (!resolved.ok) {
          for (const error of resolved.errors) {
            errors.push({
              message: error.message,
              path: error.path ? [i, ...error.path] : [i]
            });
          }
        } else {
          result.push(resolved.value);
        }
      } else {
        result.push(itemValue);
      }
    }

    if (errors.length > 0) {
      return this.failure(errors, parent, key);
    }

    return this.success(result, parent, key);
  }

  private async resolveObject(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<any>> {
    const errors: ValidationError[] = [];
    const required = parent?.required || [];
    const { getValue = this.options.getValue } = options;

    if (!isObject(value)) {
      if (value === undefined || value === null) {
        const defaultValue = schema.default;

        if (defaultValue !== undefined) {
          return this.success(defaultValue, parent, key);
        }

        if (required.includes(key) && !this.isInsideNegation()) {
          errors.push({ message: `Missing required object: ${key}` });
          return this.failure(errors, parent, key);
        }

        // Instead of returning early, set value to empty object and continue
        // This allows for default values to be set for nested properties
        value = {};
      } else {
        errors.push({ message: 'Value must be an object' });
        return this.failure(errors, parent, key);
      }
    }

    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
      errors.push({ message: `Object must have >= ${schema.minProperties} properties` });
    }

    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) {
      errors.push({ message: `Object must have <= ${schema.maxProperties} properties` });
    }

    if (this.isInsideNegation()) {
      if (!this.resolveNotRequired(schema, value)) {
        errors.push({ message: 'Object does not satisfy required property constraints' });
      }
    } else if (schema.required) {
      for (const propKey of schema.required) {
        const prop = schema.properties?.[propKey];
        const propValue = getValue(value, propKey);

        if (propValue === undefined) {
          const defaultValue = prop?.default;

          if (defaultValue !== undefined) {
            value[propKey] = defaultValue;
          } else {
            errors.push({ message: `Missing required property: ${propKey}`, path: [propKey] });
          }
        }
      }
    }

    if (schema.propertyNames) {
      for (const propName in value) {
        const resolved = await this.internalResolveValues(schema.propertyNames, propName, parent, key, {
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
      return this.failure(errors, parent, key);
    }

    let result = value;

    if (schema.properties) {
      const resolvedProperties = await this.resolveObjectProperties(schema.properties, value, parent, key, options);
      if (!resolvedProperties.ok) {
        return resolvedProperties;
      }
      result = { ...result, ...resolvedProperties.value };
    }

    if (schema.dependentSchemas) {
      const dependentResult = await this.resolveDependentSchemas(schema, value, result, parent, key, options);
      if (!dependentResult.ok) {
        return dependentResult;
      }
      result = dependentResult.value;
    }

    if (schema.if) {
      const conditionalResult = await this.resolveConditional(schema, result, parent, key, options);
      if (!conditionalResult.ok) {
        return conditionalResult;
      }
      result = conditionalResult.value;
    }

    return this.success(result, parent, key);
  }

  private async resolveObjectProperties(
    properties: Record<string, JSONSchema>,
    value: any,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<Record<string, any>>> {
    const result: Record<string, any> = {};
    const errors: ValidationError[] = [];
    const { getValue = this.options.getValue } = options;

    for (const [propKey, propSchema] of Object.entries(properties)) {
      const propValue = getValue(value, propKey);

      if (propValue === undefined && propSchema.default !== undefined) {
        result[propKey] = propSchema.default;
        continue;
      }

      const resolved = await this.internalResolveValues(propSchema, propValue, parent, propKey, options);

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
      return this.failure(errors, parent, key);
    }

    return this.success(result, parent, key);
  }

  private async resolvePatternProperties(
    schema: JSONSchema,
    value: any,
    result: Record<string, any>,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<Record<string, any>>> {
    if (!schema.patternProperties) {
      return this.success(result, parent, key);
    }

    const { getValue = this.options.getValue } = options;
    const newResult = { ...result };
    const errors: ValidationError[] = [];

    for (const [pattern, propSchema] of Object.entries(schema.patternProperties)) {
      const regex = new RegExp(pattern, 'u');

      for (const [k, v] of Object.entries(value)) {
        if (regex.test(k) && !(k in newResult)) {
          const propValue = getValue(value, k);
          const resolved = await this.internalResolveValues(propSchema, propValue, parent, k, options);
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
      return this.failure(errors, parent, key);
    }

    return this.success(newResult, parent, key);
  }

  private async resolveAdditionalProperties(
    schema: JSONSchema,
    value: any,
    result: Record<string, any>,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<Record<string, any>>> {
    if (schema.additionalProperties === false) {
      return this.success(result, parent, key);
    }

    const { getValue = this.options.getValue } = options;
    const newResult = { ...result };
    const errors: ValidationError[] = [];

    for (const [k, v] of Object.entries(value)) {
      if (!newResult.hasOwnProperty(k)) {
        const propValue = getValue(value, k);
        if (typeof schema.additionalProperties === 'object') {
          const resolved = await this.internalResolveValues(schema.additionalProperties, propValue, parent, k, options);
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
          newResult[k] = propValue;
        }
      }
    }

    if (errors.length > 0) {
      return this.failure(errors, parent, key);
    }

    return this.success(newResult, parent, key);
  }

  private async resolveDependentSchemas(
    schema: JSONSchema,
    value: any,
    result: Record<string, any>,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<Record<string, any>>> {
    if (!schema.dependentSchemas || !value) {
      return this.success(result, parent, key);
    }

    const { dependentSchemas, ...rest } = schema;
    const { getValue = this.options.getValue } = options;

    const depSchemas = Object.entries(dependentSchemas)
      .filter(([prop]) => getValue(value, prop) !== undefined)
      .map(([, schema]) => schema);

    if (depSchemas.length === 0) {
      return this.success(result, parent, key);
    }

    const mergedSchema = depSchemas.reduce((acc, schema) => mergeSchemas(acc, schema), rest);

    return this.internalResolveValues(mergedSchema, result, parent, key, options);
  }

  private async resolveValue(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<any>> {
    const errors: ValidationError[] = [];
    const required = parent?.required || [];
    const opts = { ...this.options, ...options };

    if (schema.allOf && schema.allOf.length === 1) {
      const { allOf, ...rest } = schema;
      const merged = mergeSchemas(rest, allOf[0]);
      const result = this.internalResolveValues(merged, value, parent, key, options);
      return result;
    }

    if (schema.anyOf && schema.anyOf.length === 1) {
      const { anyOf, ...rest } = schema;
      const merged = mergeSchemas(rest, anyOf[0]);
      return this.internalResolveValues(merged, value, parent, key, options);
    }

    if (schema.oneOf && schema.oneOf.length === 1) {
      const { oneOf, ...rest } = schema;
      const merged = mergeSchemas(rest, oneOf[0]);
      return this.internalResolveValues(merged, value, parent, key, options);
    }

    if (schema.oneOf || schema.anyOf || schema.allOf) {
      return this.resolveComposition(schema, value, parent, key, options);
    }

    if (value === undefined || value === null) {
      const defaultValue = schema.default ?? schema.const;

      if (defaultValue !== undefined) {
        return this.success(defaultValue, parent, key);
      }

      if (required.includes(key) && !this.isInsideNegation()) {
        return this.failure(errors, parent, key);
      }

      return this.success(value, parent, key);
    }

    if (schema.not && !opts.skipValidation) {
      const notResult = await this.resolveNot(schema, value, parent, key, options);
      return notResult;
    }

    if (schema.const !== undefined && value !== schema.const) {
      errors.push({ message: `Value must be ${schema.const}` });
    }

    if (schema.enum !== undefined && !schema.enum.includes(value)) {
      errors.push({ message: `Value must be one of: ${schema.enum.join(', ')}` });
    }

    if (schema.required?.length > 0 && !opts.skipValidation) {
      const { getValue = this.options.getValue } = options;
      const missingProps = schema.required.filter(prop => {
        return getValue(value, prop) === undefined && (schema.properties?.[prop]?.default === undefined);
      });

      if (missingProps.length > 0) {
        return this.failure(missingProps.map(prop => ({
          message: `Missing required property: ${prop}`
        })), parent, key);
      }
    }

    if (errors.length > 0) {
      return this.failure(errors, parent, key);
    }

    return this.success(value, parent, key);
  }

  private async internalResolveValues(
    schema: JSONSchema,
    value: any,
    parent = schema,
    key?: string,
    options: ResolveOptions = {}
  ): Promise<Result<any>> {
    let result = value;

    const valueResult = await this.resolveValue(schema, result, parent, key, options);
    if (!valueResult.ok) {
      return valueResult;
    }

    result = valueResult.value;

    if (result && typeof result === 'object' && schema.if) {
      const conditionalResult = await this.resolveConditional(schema, result, parent, key, options);
      if (!conditionalResult.ok) {
        return conditionalResult;
      }

      result = conditionalResult.value;
    }

    if (isObject(result) && isComposition(schema)) {
      const compositionResult = await this.resolveComposition(schema, result, parent, key, options);
      if (!compositionResult.ok) {
        return compositionResult;
      }

      result = compositionResult.value;
    }

    if (!schema.type) {
      return this.success(result, parent, key);
    }

    if (Array.isArray(schema.type)) {
      const valueType = getValueType(result, schema.type);

      if (valueType === undefined) {
        return this.failure([{ message: `Value must be one of type: ${schema.type.join(', ')}` }], parent, key);
      }

      const typeSchema = filterProps({ ...schema, type: valueType }, valueType);
      return this.internalResolveValues(typeSchema, result, parent, key, options);
    }

    switch (schema.type) {
      case 'null': return this.resolveNull(schema, result, parent, key, options);
      case 'array': return this.resolveArray(schema, result, parent, key, options);
      case 'boolean': return this.resolveBoolean(schema, result, parent, key, options);
      case 'integer': return this.resolveInteger(schema, result, parent, key, options);
      case 'number': return this.resolveNumber(schema, result, parent, key, options);
      case 'object': return this.resolveObject(schema, result, parent, key, options);
      case 'string': return this.resolveString(schema, result, parent, key, options);
      default: {
        return this.failure([{ message: `Unsupported type: ${schema.type}` }], parent, key);
      }
    }
  }

  async resolveValues(schema: JSONSchema, values: any): Promise<Result<any>> {
    const { ok, errors, value } = await this.internalResolveValues(schema, values);
    return ok ? { ok, value } : { ok, errors };
  }
}

export const resolveValues = async (
  schema: JSONSchema,
  values: any,
  options: ResolveOptions = {}
): Promise<Result<any>> => {
  const validator = new SchemaResolver(options);
  return validator.resolveValues(schema, values);
};
