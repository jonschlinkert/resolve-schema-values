import assert from 'node:assert';
import { resolveValues } from '~/resolve';
import type { JSONSchema } from '~/types';

describe('resolve', () => {
  describe('resolveValues', () => {
    it('should resolve basic types with defaults', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          str: { type: 'string', default: 'default' },
          num: { type: 'number', default: 42 },
          bool: { type: 'boolean', default: true },
          arr: { type: 'array', default: [] },
          obj: { type: 'object', default: {} }
        }
      };

      const result = await resolveValues(schema, {});

      assert.deepStrictEqual(result, {
        str: 'default',
        num: 42,
        bool: true,
        arr: [],
        obj: {}
      });
    });

    it('should resolve conditional schemas (minimum)', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'number' }
        },
        if: {
          properties: { age: { minimum: 18 } }
        },
        then: {
          properties: {
            canVote: { type: 'boolean', const: true }
          }
        },
        else: {
          properties: {
            canVote: { type: 'boolean', const: false }
          }
        }
      };

      const adult = await resolveValues(schema, { age: 20 });
      assert.strictEqual(adult.canVote, true);

      const minor = await resolveValues(schema, { age: 16 });
      assert.strictEqual(minor.canVote, false);
    });

    it('should resolve conditional schemas (maximum)', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'number' }
        },
        if: {
          properties: { age: { maximum: 18 } }
        },
        then: {
          properties: {
            canVote: { type: 'boolean', const: false }
          }
        },
        else: {
          properties: {
            canVote: { type: 'boolean', const: true }
          }
        }
      };

      const adult = await resolveValues(schema, { age: 20 });
      assert.strictEqual(adult.canVote, true);

      const minor = await resolveValues(schema, { age: 16 });
      assert.strictEqual(minor.canVote, false);
    });

    it('should resolve allOf composition', async () => {
      const schema: JSONSchema = {
        type: 'object',
        allOf: [
          {
            properties: {
              name: { type: 'string', default: 'John' }
            }
          },
          {
            properties: {
              age: { type: 'number', default: 30 }
            }
          }
        ]
      };

      const result = await resolveValues(schema, {});

      assert.deepStrictEqual(result, {
        name: 'John',
        age: 30
      });
    });

    it('should resolve anyOf composition', async () => {
      const schema: JSONSchema = {
        anyOf: [
          { type: 'string' },
          { type: 'number' }
        ],
        default: 'default'
      };

      const stringResult = await resolveValues(schema, 'test');
      const numberResult = await resolveValues(schema, 42);
      const invalidResult = await resolveValues(schema, true);

      assert.strictEqual(stringResult, 'test');
      assert.strictEqual(numberResult, 42);
      assert.strictEqual(invalidResult, 'default');
    });

    it('should resolve oneOf composition', async () => {
      const schema: JSONSchema = {
        oneOf: [
          { type: 'number', minimum: 0 },
          { type: 'number', maximum: 0 }
        ],
        default: null
      };

      const positiveResult = await resolveValues(schema, 5);
      const negativeResult = await resolveValues(schema, -5);
      const invalidResult = await resolveValues(schema, 0);

      assert.strictEqual(positiveResult, 5);
      assert.strictEqual(negativeResult, -5);
      assert.strictEqual(invalidResult, null);
    });

    it('should resolve array items', async () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string', default: 'unnamed' }
          }
        }
      };

      const result = await resolveValues(schema, [
        { id: 1 },
        { id: 2, name: 'test' }
      ]);

      assert.deepStrictEqual(result, [
        { id: 1, name: 'unnamed' },
        { id: 2, name: 'test' }
      ]);
    });

    it('should resolve dependent schemas', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          credit_card: { type: 'string' }
        },
        dependentSchemas: {
          credit_card: {
            properties: {
              billing_address: { type: 'string', default: 'required' }
            }
          }
        }
      };

      const result = await resolveValues(schema, {
        credit_card: '1234-5678-9012-3456'
      });

      assert.deepStrictEqual(result, {
        credit_card: '1234-5678-9012-3456',
        billing_address: 'required'
      });
    });

    it('should resolve pattern properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        patternProperties: {
          '^S_': {
            type: 'string',
            default: 'string'
          },
          '^N_': {
            type: 'number',
            default: 0
          }
        }
      };

      const result = await resolveValues(schema, {
        'S_name': 'test',
        'N_age': 25,
        'other': 'value'
      });

      assert.strictEqual(result.S_name, 'test');
      assert.strictEqual(result.N_age, 25);
      assert.strictEqual(result.other, 'value');
    });

    it('should handle additional properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        additionalProperties: {
          type: 'string',
          default: 'additional'
        }
      };

      const result = await resolveValues(schema, {
        name: 'test',
        extra: 'value'
      });

      assert.deepStrictEqual(result, {
        name: 'test',
        extra: 'value'
      });
    });

    it('should resolve const and enum values', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          status: { type: 'string', const: 'active' },
          role: { type: 'string', enum: ['admin', 'user'], default: 'user' }
        }
      };

      const result = await resolveValues(schema, {
        status: 'anything',
        role: 'invalid'
      });

      assert.deepStrictEqual(result, {
        status: 'active',
        role: 'user'
      });
    });
  });
});
