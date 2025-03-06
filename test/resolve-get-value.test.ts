import type { JSONSchema } from '~/types';
import assert from 'node:assert/strict';
import getValue from 'get-value';
import { resolveValues } from '~/resolve';

describe('getValue custom resolution', () => {
  describe('basic value access', () => {
    it('should resolve simple object properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' }
        }
      };

      const result = await resolveValues(schema, { name: 'test' }, {
        getValue: (obj, key) => getValue(obj, key)
      });

      assert.ok(result.ok);
      assert.strictEqual(result.value.name, 'test');
    });

    it('should handle undefined properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', default: 'default' }
        }
      };

      const result = await resolveValues(schema, {}, {
        getValue: (obj, key) => getValue(obj, key)
      });

      assert.ok(result.ok);
      assert.strictEqual(result.value.name, 'default');
    });
  });

  describe('nested object access', () => {
    it('should resolve deeply nested properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  details: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const data = {
        user: {
          profile: {
            details: {
              name: 'John Doe'
            }
          }
        }
      };

      const result = await resolveValues(schema, data, {
        getValue: (obj, key) => getValue(obj, key)
      });

      assert.ok(result.ok);
      assert.strictEqual(result.value.user.profile.details.name, 'John Doe');
    });

    it('should handle missing nested properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  name: { type: 'string', default: 'Anonymous' }
                }
              }
            }
          }
        }
      };

      const result = await resolveValues(schema, { user: {} }, {
        getValue: (obj, key) => getValue(obj, key)
      });

      assert.ok(result.ok);
      assert.strictEqual(result.value.user.profile.name, 'Anonymous');
    });
  });

  describe('array access', () => {
    it('should resolve array indices', async () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' }
          }
        }
      };

      const data = [
        { id: 1 },
        { id: 2 },
        { id: 3 }
      ];

      const result = await resolveValues(schema, data, {
        getValue: (obj, key) => getValue(obj, key)
      });

      assert.ok(result.ok);
      assert.strictEqual(result.value[0].id, 1);
      assert.strictEqual(result.value[1].id, 2);
      assert.strictEqual(result.value[2].id, 3);
    });

    it('should handle nested arrays', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          matrix: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'number' }
            }
          }
        }
      };

      const data = {
        matrix: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9]
        ]
      };

      const result = await resolveValues(schema, data, {
        getValue: (obj, key) => getValue(obj, key)
      });

      assert.ok(result.ok);
      assert.deepStrictEqual(result.value.matrix, [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ]);
    });
  });

  describe('complex paths', () => {
    it('should handle array access within nested objects', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          users: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                addresses: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      street: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      };

      const data = {
        users: [
          {
            addresses: [
              { street: '123 Main St' },
              { street: '456 Oak Ave' }
            ]
          },
          {
            addresses: [
              { street: '789 Pine Rd' }
            ]
          }
        ]
      };

      const result = await resolveValues(schema, data, {
        getValue: (obj, key) => getValue(obj, key)
      });

      assert.ok(result.ok);
      assert.strictEqual(result.value.users[0].addresses[0].street, '123 Main St');
      assert.strictEqual(result.value.users[0].addresses[1].street, '456 Oak Ave');
      assert.strictEqual(result.value.users[1].addresses[0].street, '789 Pine Rd');
    });

    it('should handle object paths with special characters', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          'special.key': {
            type: 'object',
            properties: {
              'nested.value': { type: 'string' }
            }
          }
        }
      };

      const data = {
        'special.key': {
          'nested.value': 'test'
        }
      };

      const result = await resolveValues(schema, data, {
        getValue: (obj, key) => getValue(obj, key, { separator: '.' })
      });

      assert.ok(result.ok);
      assert.strictEqual(result.value['special.key']['nested.value'], 'test');
    });
  });

  describe('error handling', () => {
    it('should handle null values in path', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string', default: 'Anonymous' }
            }
          }
        }
      };

      const result = await resolveValues(schema, { user: null }, {
        getValue: (obj, key) => getValue(obj, key)
      });

      assert.ok(result.ok);
      assert.strictEqual(result.value.user.name, 'Anonymous');
    });

    it('should handle undefined values in nested paths', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          deeply: {
            type: 'object',
            properties: {
              nested: {
                type: 'object',
                properties: {
                  value: { type: 'string', default: 'default' }
                }
              }
            }
          }
        }
      };

      const result = await resolveValues(schema, { deeply: { nested: undefined } }, {
        getValue: (obj, key) => getValue(obj, key)
      });

      assert.ok(result.ok);
      assert.strictEqual(result.value.deeply.nested.value, 'default');
    });
  });
});
