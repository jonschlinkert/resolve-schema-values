import type { JSONSchema, ResolveOptions } from '~/types';
import { mergeSchemas } from '~/merge';
import {
  getSegments,
  isComposition,
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

class SchemaResolver {
  private readonly options: ResolveOptions;
  private negationDepth: number;

  constructor(options: ResolveOptions = {}) {
    this.options = { ...options };
    this.negationDepth = 0;
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
    value: any
  ): Promise<boolean> {
    // For nested property conditions (used in resolution)
    if (schema.properties && !this.options.skipPropertyCheck) {
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
        const resolved = await this.internalResolveValues(condition, propValue, {
          skipValidation: true,
          skipConditional: true, // Prevent infinite recursion
          currentPath: [...this.options.currentPath || [], prop]
        });

        if (!resolved.ok) {
          return false;
        }
      }

      return true;
    }

    // For direct value validation
    const resolved = await this.internalResolveValues(schema, value, {
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

    if (typeof value !== 'boolean' && (value != null || required.includes(key))) {
      errors.push({ message: 'Value must be a boolean' });
      return this.failure(errors, parent, key);
    }

    return this.success(value, parent, key);
  }

  // eslint-disable-next-line complexity
  private async resolveInteger(schema: JSONSchema, value: any, parent, key?: string): Result<number> {
    const required = parent?.required || [];
    const errors: ValidationError[] = [];

    if (value === undefined || value === null) {
      if (schema.default !== undefined) {
        return this.success(schema.default, parent, key);
      }

      if (required.includes(key)) {
        errors.push({ message: `Missing required integer: ${key}` });
        return this.failure(errors, parent, key);
      }

      return this.success(0, parent, key);
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

      if (required.includes(key)) {
        errors.push({ message: `Missing required number: ${key}` });
        return this.failure(errors, parent, key);
      }

      return this.success(0, parent, key);
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

      if (required.includes(key)) {
        errors.push({ message: `Missing required string: ${key}` });
        return this.failure(errors, parent, key);
      }

      return this.success(undefined, parent, key);
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
    key?: string
  ): Promise<Result<any>> {
    const isSatisfied = await this.evaluateCondition(schema.if, value);
    const conditionalSchema = isSatisfied ? schema.then : schema.else;

    if (!conditionalSchema) {
      return this.success(value, parent, key);
    }

    const baseSchema = { ...schema };
    delete baseSchema.if;
    delete baseSchema.then;
    delete baseSchema.else;

    const mergedSchema = mergeSchemas(baseSchema, conditionalSchema);

    // Handle dependent requirements
    if (mergedSchema.required) {
      const missingProps = mergedSchema.required.filter(prop => {
        return value[prop] === undefined && (!mergedSchema.properties?.[prop]?.default !== undefined);
      });

      if (missingProps.length > 0) {
        return this.failure(missingProps.map(prop => ({
          message: `Missing required property: ${prop}`,
          path: [prop]
        })), parent, key);
      }
    }

    return this.internalResolveValues(mergedSchema, value, parent, key);
  }

  private async resolveAllOf(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string
  ): Promise<Result<any>> {
    const { allOf, ...rest } = schema;

    let mergedSchema = { ...rest };

    for (const subSchema of allOf) {
      mergedSchema = mergeSchemas(mergedSchema, subSchema, { isAllOf: true });

      if (mergedSchema.errors) {
        return this.failure(mergedSchema.errors, parent, key);
      }

      const result = await this.internalResolveValues(subSchema, value, {
        skipValidation: true
      }, parent, key);

      if (!result.ok) {
        return result;
      }
    }

    return this.internalResolveValues(mergedSchema, value, parent, key);
  }

  private async resolveAnyOf(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string
  ): Promise<Result<any>> {
    const errors: ValidationError[] = [];

    for (const subSchema of schema.anyOf) {
      const resolved = await this.internalResolveValues(subSchema, value, parent, key);
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
    key?: string
  ): Promise<Result<any>> {
    let validCount = 0;
    let validResult = null;
    const errors: ValidationError[] = [];

    for (const subSchema of schema.oneOf) {
      const resolved = await this.internalResolveValues(subSchema, value, parent, key);
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
    key?: string
  ): Promise<Result<any>> {
    this.negationDepth++;
    try {
      const notResult = await this.internalResolveValues(schema.not, value, parent, key);
      if (notResult.ok) {
        return this.failure([{ message: 'Value must not match schema' }], parent, key);
      }
      return this.success(value, parent, key);
    } finally {
      this.negationDepth--;
    }
  }

  private async resolveComposition(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string
  ): Promise<Result<any>> {
    if (schema.not) {
      return this.resolveNot(schema, value, parent, key);
    }

    if (schema.allOf) {
      return this.resolveAllOf(schema, value, parent, key);
    }

    if (schema.anyOf) {
      return this.resolveAnyOf(schema, value, parent, key);
    }

    if (schema.oneOf) {
      return this.resolveOneOf(schema, value, parent, key);
    }

    return this.success(value, parent, key);
  }

  private async resolveArray(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string
  ): Promise<Result<any[]>> {
    const errors: ValidationError[] = [];
    const required = parent?.required || [];

    if (!Array.isArray(value)) {
      if (value === undefined || value === null) {
        if (schema.default !== undefined) {
          return this.success(schema.default, parent, key);
        }

        if (required.includes(key)) {
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
        const resolved = await this.internalResolveValues(schema.contains, value[i], {
          currentPath: [i.toString()]
        }, parent, key);

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

    return this.resolveArrayItems(schema, value, parent, key);
  }

  private async resolveArrayItems(
    schema: JSONSchema,
    values: any[],
    parent,
    key?: string
  ): Promise<Result<any[]>> {
    if (!schema.items && !schema.prefixItems) {
      return this.success(values, parent, key);
    }

    const result = [];
    const errors: ValidationError[] = [];
    const maxLength = Math.max(values.length, schema.prefixItems?.length || 0);

    for (let i = 0; i < maxLength; i++) {
      if (schema.prefixItems && i < schema.prefixItems.length) {
        const resolved = await this.internalResolveValues(schema.prefixItems[i], values[i], parent, i.toString());
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
        const resolved = await this.internalResolveValues(schema.items, values[i], parent, i.toString());
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
      return this.failure(errors, parent, key);
    }

    return this.success(result, parent, key);
  }

  // eslint-disable-next-line complexity
  private async resolveObject(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string
  ): Promise<Result<any>> {
    const errors: ValidationError[] = [];
    const required = parent?.required || [];

    if (!isObject(value)) {
      if (value === undefined || value === null) {
        const defaultValue = schema.default;
        if (defaultValue !== undefined) {
          return this.success(defaultValue, parent, key);
        }
        if (required.includes(key)) {
          errors.push({ message: `Missing required object: ${key}` });
          return this.failure(errors, parent, key);
        }
        return this.success({}, parent, key);
      }

      errors.push({ message: 'Value must be an object' });
      return this.failure(errors, parent, key);
    }

    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
      errors.push({ message: `Object must have >= ${schema.minProperties} properties` });
    }

    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) {
      errors.push({ message: `Object must have <= ${schema.maxProperties} properties` });
    }

    if (schema.required && !this.isInsideNegation()) {
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
    } else if (schema.required && this.isInsideNegation()) {
      const hasAllRequired = schema.required.every(key => key in value);
      if (hasAllRequired) {
        errors.push({ message: 'Must not have all required properties' });
      }
    }

    if (schema.propertyNames) {
      for (const propName in value) {
        const resolved = await this.internalResolveValues(schema.propertyNames, propName, {
          currentPath: [propName]
        }, parent, key);

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
      const resolvedProperties = await this.resolveObjectProperties(schema.properties, value, parent);
      if (!resolvedProperties.ok) {
        return resolvedProperties;
      }
      result = { ...result, ...resolvedProperties.value };
    }

    if (schema.dependentSchemas) {
      const dependentResult = await this.resolveDependentSchemas(schema, value, result, parent);
      if (!dependentResult.ok) {
        return dependentResult;
      }
      result = dependentResult.value;
    }

    if (schema.if) {
      const conditionalResult = await this.resolveConditional(schema, result, parent);
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
    key?: string
  ): Promise<Result<Record<string, any>>> {
    const result: Record<string, any> = {};
    const errors: ValidationError[] = [];

    for (const [propKey, propSchema] of Object.entries(properties)) {
      if (value?.[propKey] === undefined && propSchema.default !== undefined) {
        result[propKey] = propSchema.default;
        continue;
      }

      const resolved = await this.internalResolveValues(propSchema, value?.[propKey], parent, propKey);

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
    key?: string
  ): Promise<Result<Record<string, any>>> {
    if (!schema.patternProperties) {
      return this.success(result, parent, key);
    }

    const newResult = { ...result };
    const errors: ValidationError[] = [];

    for (const [pattern, propSchema] of Object.entries(schema.patternProperties)) {
      const regex = new RegExp(pattern, 'u');

      for (const [k, v] of Object.entries(value)) {
        if (regex.test(k) && !(k in newResult)) {
          const resolved = await this.internalResolveValues(propSchema, v, parent, k);
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
    key?: string
  ): Promise<Result<Record<string, any>>> {
    if (schema.additionalProperties === false) {
      return this.success(result, parent, key);
    }

    const newResult = { ...result };
    const errors: ValidationError[] = [];

    for (const [k, v] of Object.entries(value)) {
      if (!newResult.hasOwnProperty(k)) {
        if (typeof schema.additionalProperties === 'object') {
          const resolved = await this.internalResolveValues(schema.additionalProperties, v, parent, k);
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
      return this.failure(errors, parent, key);
    }

    return this.success(newResult, parent, key);
  }

  private async resolveDependentSchemas(
    schema: JSONSchema,
    value: any,
    result: Record<string, any>,
    parent,
    key?: string
  ): Promise<Result<Record<string, any>>> {
    if (!schema.dependentSchemas || !value) {
      return this.success(result, parent, key);
    }

    const { dependentSchemas, ...rest } = schema;

    // Create merged schema from applicable dependent schemas
    const depSchemas = Object.entries(dependentSchemas)
      .filter(([prop]) => value[prop] !== undefined)
      .map(([, schema]) => schema);

    if (depSchemas.length === 0) {
      return this.success(result, parent, key);
    }

    const mergedSchema = depSchemas.reduce((acc, schema) => mergeSchemas(acc, schema), rest);

    // Resolve against merged schema
    return this.internalResolveValues(mergedSchema, result, parent, key);
  }

  private async resolveValue(
    schema: JSONSchema,
    value: any,
    parent,
    key?: string
  ): Promise<Result<any>> {
    const errors: ValidationError[] = [];
    const required = parent?.required || [];

    if (schema.oneOf || schema.anyOf || schema.allOf) {
      return this.resolveComposition(schema, value, parent, key);
    }

    if (value === undefined || value === null) {
      const defaultValue = schema.default ?? schema.const;

      if (defaultValue !== undefined) {
        return this.success(defaultValue, parent, key);
      }

      if (required.includes(key)) {
        errors.push({ message: `Missing required value: ${key}` });
        return this.failure(errors, parent, key);
      }

      return this.success(value, parent, key);
    }

    // Handle 'not' validation first
    if (schema.not && !this.options.skipValidation) {
      this.negationDepth++;
      try {
        const notResult = await this.internalResolveValues(schema.not, value, {
          ...this.options,
          skipValidation: true
        }, parent, key);

        if (notResult.ok) {
          return this.failure([{ message: 'Value must not match schema' }], parent, key);
        }
      } finally {
        this.negationDepth--;
      }
    }

    if (schema.const !== undefined && value !== schema.const) {
      errors.push({ message: `Value must be ${schema.const}` });
    }

    if (schema.enum !== undefined && !schema.enum.includes(value)) {
      errors.push({ message: `Value must be one of: ${schema.enum.join(', ')}` });
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
    key?: string
  ): Promise<Result<any>> {
    let result = value;

    const valueResult = await this.resolveValue(schema, result, parent, key);
    if (!valueResult.ok) {
      return valueResult;
    }

    result = valueResult.value;

    if (isObject(result) && schema.if) {
      const conditionalResult = await this.resolveConditional(schema, result, parent, key);
      if (!conditionalResult.ok) {
        return conditionalResult;
      }
      result = conditionalResult.value;
    }

    if (isObject(result) && isComposition(schema)) {
      const compositionResult = await this.resolveComposition(schema, result, parent, key);
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
      return this.internalResolveValues(typeSchema, result, parent, key);
    }

    switch (schema.type) {
      case 'null': return this.resolveNull(schema, result, parent, key);
      case 'array': return this.resolveArray(schema, result, parent, key);
      case 'boolean': return this.resolveBoolean(schema, result, parent, key);
      case 'integer': return this.resolveInteger(schema, result, parent, key);
      case 'number': return this.resolveNumber(schema, result, parent, key);
      case 'object': return this.resolveObject(schema, result, parent, key);
      case 'string': return this.resolveString(schema, result, parent, key);
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
