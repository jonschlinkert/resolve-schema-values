/* eslint-disable complexity */
import type { JSONSchema, ResolveOptions } from '~/types';
import cloneDeep from 'clone-deep';
import { resolveRef } from 'expand-json-schema';
import { mergeSchemas } from '~/merge';
import { deepAssign, filterProps, getSegments, getValueType, isComposition, isObject } from '~/utils';

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
  private stack: string[];
  private errors: ValidationError[] = [];
  private root: JSONSchema;
  private resolvedType: boolean = false;

  constructor(options: ResolveOptions = {}) {
    this.options = {
      ...options,
      getValue: options.getValue || ((obj, key) => obj?.[key])
    };

    this.negationDepth = 0;
    this.errors = [];
    this.stack = [];
  }

  private success<T>(value: T, parent, key?: string): Success<T> {
    return {
      ok: true,
      value,
      parent,
      key
    };
  }

  private failure(errors: ValidationError[], parent, key?: string): Failure {
    const stack = this.stack.length > 0 ? [...this.stack] : [];

    const errorsWithPath = errors.map(error => {
      return {
        ...error,
        path: stack.concat(error.path || [])
      };
    });

    const result = {
      ok: false,
      errors: errorsWithPath,
      parent,
      key
    };

    if (!this.isInside(['if', 'contains', 'oneOf'])) {
      this.errors.push(...errorsWithPath);
    }

    if (this.isInside(['oneOf']) && stack.join('.') === 'oneOf') {
      this.errors.push(...errorsWithPath);
    }

    return result;
  }

  private isInside(keys: string[]): boolean {
    return keys.some(key => this.stack.includes(key));
  }

  private isInsideNegation(): boolean {
    return this.negationDepth > 0;
  }

  private isValidFormat(value: string, format: string): boolean {
    switch (format) {
      case 'date-time':
        return !isNaN(Date.parse(value));
      case 'date':
        return /^\d{4}-\d{2}-\d{2}$/.test(value);
      case 'time':
        return /^\d{2}:\d{2}:\d{2}$/.test(value);
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case 'ipv4': {
        if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return false;
        return value.split('.').every(num => {
          const n = parseInt(num, 10);
          return n >= 0 && n <= 255;
        });
      }
      case 'uuid':
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      default: {
        return true;
      }
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

      this.stack.push('items');
      for (let i = 0; i < value.length; i++) {
        const itemValue = getValue(value, String(i), schema);
        const resolved = await this.internalResolveValues(schema.items, itemValue, schema, key, options);

        if (!resolved.ok) {
          this.stack.pop();
          return false;
        }
      }

      this.stack.pop();
      return true;
    }

    if (schema.properties) {
      if (!isObject(value)) {
        return false;
      }

      for (const [prop, condition] of Object.entries(schema.properties)) {
        this.stack.push(prop);
        const parentProp = parent?.properties?.[prop];
        const propValue = getValue(value, prop, condition, schema);

        if (propValue === undefined) {
          if (condition.default !== undefined) {
            value[prop] = condition.default;
          } else {
            this.stack.pop();
            return false;
          }
        }

        const propSchema = mergeSchemas(parentProp, condition, { mergeType: false });
        const resolved = await this.internalResolveValues(propSchema, propValue, schema, prop, {
          ...options,
          skipValidation: true,
          skipConditional: true
        });

        this.stack.pop();

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

      return this.success(value, parent, key);
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
    const { if: ifSchema, then: thenSchema, else: elseSchema = {}, ...partialSchema } = schema;

    this.stack.push('if');
    const isSatisfied = await this.evaluateCondition(ifSchema, value, parent, key, options);
    this.stack.pop();

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

      const resolved = await this.internalResolveValues(merged, value, parent, 'allOf', options);
      if (!resolved.ok) {
        errors.push(...resolved.errors);
      } else {
        values = deepAssign(values, resolved.value);
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
    const { oneOf, ...rest } = schema;
    const candidates = [];

    for (const subSchema of oneOf) {
      const mergedSchema = mergeSchemas(subSchema, rest);
      const resolved = await this.internalResolveValues(mergedSchema, value, parent, key, options);
      candidates.push({ resolved, schema: subSchema });
    }

    const matches = candidates.filter(c => c.resolved.ok);

    if (matches.length === 1) {
      return matches[0].resolved;
    }

    if (matches.length === 0) {
      // First check which schema structurally matches our value
      const valueProps = Object.keys(value || {});
      const matchingCandidate = candidates.find(c =>
        // Find the schema that declares the properties our value has
        valueProps.some(prop => prop in (c.schema.properties || {}))
      );

      // If we found a matching schema, use its errors
      if (matchingCandidate) {
        return matchingCandidate.resolved;
      }

      // If no structural match found, return generic oneOf error
      return this.failure([{ message: 'Value must match exactly one schema in oneOf' }], parent, key);
    }

    // Multiple matches - oneOf violation
    if (schema.default !== undefined) {
      return this.success(schema.default, parent, key);
    }

    return this.failure([{ message: 'Value must match exactly one schema in oneOf' }], parent, key);
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
      this.stack.push('not');
      const notResult = await this.internalResolveValues(notSchema, value, parent, 'not', options);

      if (notResult.ok) {
        const failure = this.failure([{ message: 'Value must not match schema' }], parent, key);
        this.stack.pop();
        return failure;
      }

      this.stack.pop();
      return this.internalResolveValues(partialSchema, value, parent, key, options);
    } finally {
      this.negationDepth--;
    }
  }

  private resolveNotRequired(schema: JSONSchema, value: any): boolean {
    const { getValue = this.options.getValue } = {};

    if (schema.allOf) {
      const notRequiredSchemas = schema.allOf.filter(s => s.not?.required);
      if (notRequiredSchemas.length > 0) {
        return notRequiredSchemas.every(s => {
          return !s.not.required.every(prop => {
            return getValue(value, prop, schema) !== undefined;
          });
        });
      }
    }

    if (schema.not?.required) {
      return !schema.not.required.every(prop => getValue(value, prop, schema) !== undefined);
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
    if (schema.allOf) {
      this.stack.push('allOf');
      const resolved = await this.resolveAllOf(schema, value, parent, key, options);
      this.stack.pop();
      return resolved;
    }

    if (schema.anyOf) {
      this.stack.push('anyOf');
      const resolved = await this.resolveAnyOf(schema, value, parent, key, options);
      this.stack.pop();
      return resolved;
    }

    if (schema.oneOf) {
      this.stack.push('oneOf');
      const resolved = await this.resolveOneOf(schema, value, parent, key, options);
      this.stack.pop();
      return resolved;
    }

    if (schema.not) {
      this.stack.push('not');
      const resolved = await this.resolveNot(schema, value, parent, key, options);
      this.stack.pop();
      return resolved;
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
          return this.success([].concat(schema.default), parent, key);
        }

        if (required.includes(key) && !this.isInsideNegation()) {
          errors.push({ message: `Missing required array: ${key}` });
          return this.failure(errors, parent, key);
        }

        return this.success(undefined, parent, key);
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
      this.stack.push('contains');
      let containsValid = false;

      for (let i = 0; i < value.length; i++) {
        const itemValue = getValue(value, String(i), schema);
        const resolved = await this.internalResolveValues(schema.contains, itemValue, parent, key, options);

        if (resolved.ok) {
          containsValid = true;
          break;
        }
      }

      this.stack.pop();

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
      this.stack.push('items');

      for (let i = 0; i < values.length; i++) {
        const itemValue = getValue(values, String(i), schema);

        if (i < schema.items.length) {
          const resolved = await this.internalResolveValues(schema.items[i], itemValue, schema, String(i), options);

          if (!resolved.ok) {
            errors.push(...resolved.errors);
          } else {
            result.push(resolved.value);
          }
        } else if (schema.additionalItems === false) {
          errors.push({ message: 'Additional items not allowed' });
          break;
        } else if (schema.additionalItems) {
          const resolved = await this.internalResolveValues(schema.additionalItems, itemValue, schema, String(i), options);

          if (!resolved.ok) {
            errors.push(...resolved.errors);
          }
        }
      }

      this.stack.pop();

      if (errors.length > 0) {
        return this.failure(errors, parent, key);
      }

      return this.success(result, parent, key);
    }

    for (let i = 0; i < maxLength; i++) {
      const itemValue = getValue(values, String(i), schema);

      if (schema.prefixItems && i < schema.prefixItems.length) {
        this.stack.push('prefixItems');
        const resolved = await this.internalResolveValues(schema.prefixItems[i], itemValue, schema, String(i), options);
        this.stack.pop();

        if (!resolved.ok) {
          errors.push(...resolved.errors);
        } else {
          result.push(resolved.value);
        }
      } else if (isObject(schema.items)) {
        this.stack.push('items');

        // Check if we have conditional logic in the items schema
        if (schema.items.if) {
          const resolved = await this.resolveConditional(schema.items, itemValue, schema, String(i), options);
          if (!resolved.ok) {
            errors.push(...resolved.errors);
          } else {
            result.push(resolved.value);
          }
        } else {
          // If no conditionals, process normally
          const resolved = await this.internalResolveValues(schema.items, itemValue, schema, String(i), options);
          if (!resolved.ok) {
            errors.push(...resolved.errors);
          } else {
            result.push(resolved.value);
          }
        }

        this.stack.pop();
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

    if (this.isInsideNegation()) {
      this.stack.push('required');
      if (!this.resolveNotRequired(schema, value)) {
        errors.push({ message: 'Object does not satisfy required property constraints' });
      }
      this.stack.pop();
    } else if (schema.required) {
      for (const propKey of schema.required) {
        const prop = schema.properties?.[propKey];
        const propValue = getValue(value, propKey, prop, schema);

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
      this.stack.push('propertyNames');

      for (const propName in value) {
        const resolved = await this.internalResolveValues(schema.propertyNames, propName, parent, key, options);

        if (!resolved.ok) {
          errors.push(...resolved.errors);
        }
      }

      this.stack.pop();
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

    if (schema.patternProperties) {
      const patternResult = await this.resolvePatternProperties(schema, value, result, parent, key, options);
      if (!patternResult.ok) {
        return patternResult;
      }
      result = patternResult.value;
    }

    if (schema.additionalProperties === true) {
      const additionalResult = await this.resolveAdditionalProperties(schema, value, result, parent, key, options);
      if (!additionalResult.ok) {
        return additionalResult;
      }
      result = additionalResult.value;
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

    if (result !== undefined) {
      value = result;
    }

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
      const propValue = getValue(value, propKey, propSchema, parent);

      if (propValue === undefined && propSchema.default !== undefined) {
        result[propKey] = propSchema.default;
      }

      this.stack.push(propKey);
      const resolved = await this.internalResolveValues(propSchema, propValue, parent, propKey, options);
      this.stack.pop();

      if (!resolved.ok) {
        errors.push(...resolved.errors);
      } else if (resolved.value !== undefined) {
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
          const propValue = getValue(value, k, propSchema, parent);
          const resolved = await this.internalResolveValues(propSchema, propValue, parent, k, options);

          if (!resolved.ok) {
            errors.push(...resolved.errors);
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
    const addlProps = schema.additionalProperties;

    if (addlProps?.$ref) {
      const refSchema = addlProps.$ref === '#'
        ? this.root
        : resolveRef(addlProps.$ref, this.root);

      if (!refSchema) {
        return this.failure([{ message: `Schema not found: ${addlProps.$ref}` }], parent, key);
      }

      this.stack.push('additionalProperties');
      const merged = mergeSchemas(refSchema, addlProps);
      const resolved = await this.internalResolveValues(merged, result, parent, key, options);
      this.stack.pop();
      return resolved;
    }

    if (addlProps === false) {
      return this.success(result, parent, key);
    }

    const { getValue = this.options.getValue } = options;
    const newResult = { ...result };
    const errors: ValidationError[] = [];

    for (const [k, v] of Object.entries(value)) {
      if (!newResult.hasOwnProperty(k)) {
        const propValue = getValue(v, k, schema);

        if (typeof addlProps === 'object') {
          const resolved = await this.internalResolveValues(addlProps, propValue, parent, k, options);

          if (!resolved.ok) {
            errors.push(...resolved.errors);
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
      .filter(([prop]) => getValue(value, prop, dependentSchemas) !== undefined)
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

    if (schema.not && !opts.skipValidation) {
      return this.resolveNot(schema, value, parent, key, options);
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
        const result = this.failure([{ message: `Missing required value: ${key}` }], parent, key);
        this.stack.pop();
        return result;
      }

      return this.success(value, parent, key);
    }

    if (schema.const && value !== schema.const) {
      errors.push({ message: `Value must be ${schema.const}` });
    }

    if (schema.enum && !schema.enum.some(v => v === value || v?.name === value)) {
      const values = schema.enum.map(v => {
        if (typeof v === 'string') {
          return v;
        }

        return v?.name || JSON.stringify(v);
      });

      errors.push({ message: `Value must be one of: ${values.join(', ')}`, invalidValue: value });
    }

    if (schema.required?.length > 0 && !opts.skipValidation) {
      const { getValue = this.options.getValue } = options;
      const missingProps = schema.required.filter(prop => {
        return getValue(value, prop, schema) === undefined && schema.properties?.[prop]?.default === undefined;
      });

      if (missingProps.length > 0) {
        missingProps.forEach(prop => this.stack.push(prop));
        const error = this.failure(missingProps.map(prop => ({ message: `Missing required property: ${prop}` })), parent, key);
        missingProps.forEach(() => this.stack.pop());
        return error;
      }
    }

    if (errors.length > 0) {
      if (key) this.stack.push(key);
      const result = this.failure(errors, parent, key);
      if (key) this.stack.pop();
      return result;
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

    const resolveType = () => {
      this.resolvedType = true;
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
    };

    const valueResult = await this.resolveValue(schema, result, parent, key, options);
    if (!valueResult.ok) {
      if (!this.resolvedType && !this.isInside(['not'])) {
        // If we haven't resolved the type yet, try to resolve it now
        // so we can get any error messages pushed onto the error stack
        await resolveType();
      }

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
        const error = { message: `Value must be one of type: ${schema.type.join(', ')}` };
        return this.failure([error], parent, key);
      }

      const typeSchema = filterProps({ ...schema, type: valueType }, valueType);
      return this.internalResolveValues(typeSchema, result, parent, key, options);
    }

    return resolveType();
  }

  async resolveValues(schema: JSONSchema, values: any): Promise<Result<any>> {
    this.root ||= cloneDeep(schema);

    const { ok, value } = await this.internalResolveValues(schema, values);
    const seen = new Set();
    let errors = [];

    for (const error of this.errors) {
      if (!seen.has(error.message)) {
        seen.add(error.message);
        errors.push(error);
      }
    }

    const isOneOfError = error => error.path.join('') === 'oneOf';
    const isRequiredError = error => error.message.startsWith('Missing required');
    const isDisposableError = error => isOneOfError(error) || isRequiredError(error);
    const isInsideOneOf = error => error.path?.includes('oneOf');

    if (errors.length > 1 && errors.some(e => isDisposableError(e)) && errors.some(e => (e.path?.length > 1 && !isInsideOneOf(e)) || !isDisposableError(e))) {
      errors = errors.filter(e => (e.path?.length > 1 && !isInsideOneOf(e)) || !isDisposableError(e));
    }

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
