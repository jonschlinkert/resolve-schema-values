import type { JSONSchema } from '~/types';
import assert from 'node:assert/strict';
import { mergeSchemas } from '~/merge';

describe('mergeSchemas', () => {
  it('should merge basic properties', () => {
    const schema1: JSONSchema = {
      type: 'object',
      title: 'Schema 1',
      description: 'First schema'
    };

    const schema2: JSONSchema = {
      type: 'object',
      description: 'Second schema'
    };

    const result = mergeSchemas(schema1, schema2);
    assert.deepStrictEqual(result, {
      type: 'object',
      title: 'Schema 1',
      description: 'Second schema'
    });
  });

  it('should merge validation constraints', () => {
    const schema1: JSONSchema = {
      type: 'number',
      minimum: 0,
      maximum: 100
    };

    const schema2: JSONSchema = {
      type: 'number',
      minimum: 10,
      exclusiveMaximum: 90
    };

    const result = mergeSchemas(schema1, schema2);
    assert.deepStrictEqual(result, {
      type: 'number',
      minimum: 10,
      maximum: 100,
      exclusiveMaximum: 90
    });
  });

  it('should merge object properties', () => {
    const schema1: JSONSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number', minimum: 0 }
      }
    };

    const schema2: JSONSchema = {
      type: 'object',
      properties: {
        age: { type: 'number', maximum: 120 },
        email: { type: 'string', format: 'email' }
      }
    };

    const result = mergeSchemas(schema1, schema2);
    assert.deepStrictEqual(result, {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number', minimum: 0, maximum: 120 },
        email: { type: 'string', format: 'email' }
      }
    });
  });

  it('should merge array schemas', () => {
    const schema1: JSONSchema = {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1
    };

    const schema2: JSONSchema = {
      type: 'array',
      items: { type: 'string', maxLength: 10 },
      maxItems: 5
    };

    const result = mergeSchemas(schema1, schema2);
    assert.deepStrictEqual(result, {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 10 },
      minItems: 1,
      maxItems: 5
    });
  });

  it('should merge conditional schemas', () => {
    const schema1: JSONSchema = {
      type: 'object',
      properties: {
        age: { type: 'number' }
      },
      if: { properties: { age: { minimum: 18 } } },
      then: { properties: { canVote: { type: 'boolean', const: true } } }
    };

    const schema2: JSONSchema = {
      type: 'object',
      if: { properties: { age: { minimum: 21 } } },
      then: { properties: { canDrink: { type: 'boolean', const: true } } }
    };

    const result = mergeSchemas(schema1, schema2);
    assert.deepStrictEqual(result, {
      type: 'object',
      properties: {
        age: { type: 'number' }
      },
      if: { properties: { age: { minimum: 21 } } },
      then: { properties: { canDrink: { type: 'boolean', const: true } } }
    });
  });

  it('should merge composition keywords', () => {
    const schema1: JSONSchema = {
      allOf: [
        { properties: { name: { type: 'string' } } }
      ],
      anyOf: [
        { properties: { age: { type: 'number' } } }
      ]
    };

    const schema2: JSONSchema = {
      allOf: [
        { properties: { email: { type: 'string' } } }
      ],
      oneOf: [
        { properties: { type: { enum: ['user', 'admin'] } } }
      ]
    };

    const result = mergeSchemas(schema1, schema2);
    assert.deepStrictEqual(result, {
      allOf: [
        { properties: { name: { type: 'string' } } },
        { properties: { email: { type: 'string' } } }
      ],
      anyOf: [
        { properties: { age: { type: 'number' } } }
      ],
      oneOf: [
        { properties: { type: { enum: ['user', 'admin'] } } }
      ]
    });
  });
});
