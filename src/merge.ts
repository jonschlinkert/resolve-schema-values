import type { JSONSchema } from '~/types';

/**
 * Merges arrays by concatenating them and removing duplicates
 */

const mergeArrays = (arr1: any[] = [], arr2: any[] = []): any[] => {
  return [...new Set([...arr1, ...arr2])];
};

/**
 * Deep merges two objects
 */

const deepMerge = (obj1: any, obj2: any): any => {
  if (obj1 === null || obj2 === null) {
    return obj2 ?? obj1;
  }

  if (Array.isArray(obj1) || Array.isArray(obj2)) {
    return mergeArrays(obj1, obj2);
  }

  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return obj2 ?? obj1;
  }

  const result = { ...obj1 };

  for (const key in obj2) {
    if (key in obj1) {
      result[key] = deepMerge(obj1[key], obj2[key]);
    } else {
      result[key] = obj2[key];
    }
  }

  return result;
};

// eslint-disable-next-line complexity
export const mergeSchemas = (schema1: JSONSchema = {}, schema2: JSONSchema = {}): JSONSchema => {
  const result: JSONSchema = { ...schema1, ...schema2 };

  // Merge validation keywords
  if (schema1.const !== undefined || schema2.const !== undefined) {
    result.const = schema2.const ?? schema1.const;
  }

  if (schema1.enum || schema2.enum) {
    result.enum = mergeArrays(schema1.enum, schema2.enum);
  }

  // Merge number validation
  result.minimum = schema2.minimum ?? schema1.minimum;
  result.maximum = schema2.maximum ?? schema1.maximum;
  result.exclusiveMinimum = schema2.exclusiveMinimum ?? schema1.exclusiveMinimum;
  result.exclusiveMaximum = schema2.exclusiveMaximum ?? schema1.exclusiveMaximum;
  result.multipleOf = schema2.multipleOf ?? schema1.multipleOf;

  // Merge string validation
  result.minLength = schema2.minLength ?? schema1.minLength;
  result.maxLength = schema2.maxLength ?? schema1.maxLength;
  result.pattern = schema2.pattern ?? schema1.pattern;
  result.format = schema2.format ?? schema1.format;

  // Merge array validation
  result.minItems = schema2.minItems ?? schema1.minItems;
  result.maxItems = schema2.maxItems ?? schema1.maxItems;
  result.uniqueItems = schema2.uniqueItems ?? schema1.uniqueItems;

  if (schema1.items || schema2.items) {
    result.items = schema2.items
      ? schema1.items ? mergeSchemas(schema1.items, schema2.items) : schema2.items
      : schema1.items;
  }

  // Merge object validation
  result.minProperties = schema2.minProperties ?? schema1.minProperties;
  result.maxProperties = schema2.maxProperties ?? schema1.maxProperties;

  // Only merge required arrays if at least one schema has them
  if (schema1.required || schema2.required) {
    result.required = mergeArrays(schema1.required, schema2.required);
  }

  // Merge properties
  if (schema1.properties || schema2.properties) {
    result.properties = {};
    const allPropertyKeys = new Set([
      ...Object.keys(schema1.properties || {}),
      ...Object.keys(schema2.properties || {})
    ]);

    for (const key of allPropertyKeys) {
      const prop1 = schema1.properties?.[key];
      const prop2 = schema2.properties?.[key];

      if (prop1 && prop2) {
        result.properties[key] = mergeSchemas(prop1, prop2);
      } else {
        result.properties[key] = prop2 ?? prop1;
      }
    }
  }

  // Merge pattern properties
  if (schema1.patternProperties || schema2.patternProperties) {
    const left = schema1.patternProperties || {};
    const right = schema2.patternProperties || {};
    result.patternProperties = deepMerge(left, right);
  }

  // Merge additional properties
  if (schema1.additionalProperties !== undefined || schema2.additionalProperties !== undefined) {
    if (typeof schema1.additionalProperties === 'object' && typeof schema2.additionalProperties === 'object') {
      result.additionalProperties = mergeSchemas(schema1.additionalProperties, schema2.additionalProperties);
    } else {
      result.additionalProperties = schema2.additionalProperties ?? schema1.additionalProperties;
    }
  }

  // Merge dependent schemas
  if (schema1.dependentSchemas || schema2.dependentSchemas) {
    result.dependentSchemas = deepMerge(schema1.dependentSchemas || {}, schema2.dependentSchemas || {});
  }

  // Merge conditional schemas
  if (schema1.if || schema2.if) {
    result.if = schema2.if ?? schema1.if;
    result.then = schema2.then ?? schema1.then;
    result.else = schema2.else ?? schema1.else;
  }

  // Merge composition keywords
  if (schema1.allOf || schema2.allOf) {
    result.allOf = mergeArrays(schema1.allOf, schema2.allOf);
  }

  if (schema1.anyOf || schema2.anyOf) {
    result.anyOf = mergeArrays(schema1.anyOf, schema2.anyOf);
  }

  if (schema1.oneOf || schema2.oneOf) {
    result.oneOf = mergeArrays(schema1.oneOf, schema2.oneOf);
  }

  // Clean up undefined values
  return Object.fromEntries(Object.entries(result).filter(([_, value]) => value !== undefined)) as JSONSchema;
};