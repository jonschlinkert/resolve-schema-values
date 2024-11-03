import assert from 'node:assert';
import { resolveValues } from '~/resolve';
import type { JSONSchema } from '~/types';

describe('resolve', () => {
  describe('required properties', () => {
    it('should validate required properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          required: {
            type: 'string',
            minLength: 1
          }
        },
        required: ['required']
      };

      const result = await resolveValues(schema, {});
      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].message, 'Missing required property: required');
    });

    it('should handle missing required nested field', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1 }
            },
            required: ['name']
          }
        }
      };

      const result = await resolveValues(schema, {
        user: {
          settings: {}
        }
      });
      assert.ok(!result.ok);
      assert.strictEqual(result.errors[0].message, 'Missing required property: name');
    });
  });

  describe('string validation', () => {
    it('should validate string minimum length', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            minLength: 3
          }
        }
      };

      const result = await resolveValues(schema, {
        name: 'ab'
      });
      assert.ok(!result.ok);
      assert.strictEqual(result.errors[0].message, 'String length must be >= 3');
    });

    it('should validate string maximum length', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            maxLength: 10
          }
        }
      };

      const result = await resolveValues(schema, {
        name: 'this is too long'
      });
      assert.ok(!result.ok);
      assert.strictEqual(result.errors[0].message, 'String length must be <= 10');
    });

    it('should validate string constraints as valid', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            minLength: 3,
            maxLength: 10
          }
        }
      };

      const result = await resolveValues(schema, {
        name: 'valid'
      });
      assert.ok(result.ok);
      assert.strictEqual(result.value.name, 'valid');
    });
  });

  describe('number validation', () => {
    it('should validate number type', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: {
            type: 'number'
          }
        }
      };

      const result = await resolveValues(schema, {
        age: 'not a number'
      });
      assert.ok(!result.ok);
      assert.strictEqual(result.errors[0].message, 'Value must be a number');
    });

    it('should validate integer type', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          count: {
            type: 'integer'
          }
        }
      };

      const result = await resolveValues(schema, {
        count: 1.5
      });
      assert.ok(!result.ok);
      assert.strictEqual(result.errors[0].message, 'Value must be an integer');
    });

    it('should validate number constraints - range', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: {
            type: 'number',
            minimum: 0
          },
          count: {
            type: 'integer',
            minimum: 1
          }
        }
      };

      const result = await resolveValues(schema, {
        age: -1,
        count: 0
      });
      assert.ok(!result.ok);
      assert.strictEqual(result.errors[0].message, 'Value must be >= 0');
      assert.strictEqual(result.errors[1].message, 'Value must be >= 1');
    });

    it('should validate valid numbers', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'number', minimum: 0 },
          count: { type: 'integer', minimum: 1 }
        }
      };

      const result = await resolveValues(schema, {
        age: 25,
        count: 5
      });
      assert.ok(result.ok);
    });
  });

  describe('if/then conditionals', () => {
    it('should pass validation when no conditions are present', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['personal'] }
        }
      };

      const result = await resolveValues(schema, {
        type: 'personal'
      });
      assert.ok(result.ok);
    });

    it('should enforce required fields based on conditional', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['business'] },
          taxId: { type: 'string', pattern: '^\\d{9}$' }
        },
        if: {
          properties: { type: { const: 'business' } }
        },
        then: {
          required: ['taxId']
        }
      };

      const result = await resolveValues(schema, {
        type: 'business'
      });
      assert.ok(!result.ok);
      assert.strictEqual(result.errors[0].message, 'Missing required property: taxId');
    });

    it('should validate field patterns when condition is met', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['business'] },
          taxId: { type: 'string', pattern: '^\\d{9}$' }
        },
        if: {
          properties: { type: { const: 'business' } }
        },
        then: {
          required: ['taxId']
        }
      };

      const result = await resolveValues(schema, {
        type: 'business',
        taxId: '12345'
      });
      assert.ok(!result.ok);
      assert.strictEqual(result.errors[0].message, 'String must match pattern: ^\\d{9}$');
    });

    it('should pass validation when condition and pattern are satisfied', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['business'] },
          taxId: { type: 'string', pattern: '^\\d{9}$' }
        },
        if: {
          properties: { type: { const: 'business' } }
        },
        then: {
          required: ['taxId']
        }
      };

      const result = await resolveValues(schema, {
        type: 'business',
        taxId: '123456789'
      });
      assert.ok(result.ok);
    });
  });

  describe('arrays', () => {
    it('should handle array default', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string', minLength: 2 },
            default: ['default']
          }
        }
      };

      const result = await resolveValues(schema, {});
      assert.ok(result.ok);
      assert.deepStrictEqual(result.value.tags, ['default']);
    });

    it('should handle array constraints', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string', minLength: 2 },
            minItems: 1,
            maxItems: 3,
            uniqueItems: true
          }
        }
      };

      const result = await resolveValues(schema, {
        tags: ['a', 'b', 'b', 'c', 'd']
      });
      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 2);
    });

    it('should handle valid array', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string', minLength: 2 },
            minItems: 1,
            maxItems: 3,
            uniqueItems: true
          }
        }
      };

      const result = await resolveValues(schema, {
        tags: ['tag1', 'tag2', 'tag3']
      });
      assert.ok(result.ok);
    });
  });

  describe('nested objects', () => {
    it('should handle nested object defaults', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1 },
              settings: {
                type: 'object',
                properties: {
                  theme: { type: 'string', default: 'light' },
                  notifications: { type: 'boolean', default: true }
                }
              }
            },
            required: ['name']
          }
        }
      };

      const result = await resolveValues(schema, {
        user: {
          name: 'test',
          settings: {}
        }
      });
      assert.ok(result.ok);
      assert.strictEqual(result.value.user.settings.theme, 'light');
      assert.strictEqual(result.value.user.settings.notifications, true);
    });
  });

  describe('schema composition', () => {
    describe('allOf', () => {
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
        assert.ok(result.ok);
        assert.deepStrictEqual(result.value, {
          name: 'John',
          age: 30
        });
      });

      it('should resolve allOf composition with required properties and defaults', async () => {
        const schema: JSONSchema = {
          type: 'object',
          allOf: [
            {
              properties: {
                name: { type: 'string', default: 'John' },
                email: { type: 'string' }
              },
              required: ['email']
            },
            {
              properties: {
                age: { type: 'number', default: 30 },
                country: { type: 'string' }
              },
              required: ['country']
            }
          ]
        };

        const result = await resolveValues(schema, {
          email: 'john@example.com',
          country: 'USA'
        });
        assert.ok(result.ok);
        assert.deepStrictEqual(result.value, {
          name: 'John',
          email: 'john@example.com',
          age: 30,
          country: 'USA'
        });
      });

      it('should fail when required properties are missing in allOf composition', async () => {
        const schema: JSONSchema = {
          type: 'object',
          allOf: [
            {
              properties: {
                username: { type: 'string' },
                password: { type: 'string' }
              },
              required: ['username', 'password']
            },
            {
              properties: {
                role: { type: 'string' },
                active: { type: 'boolean', default: true }
              },
              required: ['role']
            }
          ]
        };

        const result = await resolveValues(schema, {
          username: 'johndoe'
          // missing password and role
        });

        assert.ok(!result.ok);
        assert.strictEqual(result.errors.length > 0, true);
      });
    });

    describe('anyOf', () => {
      it('should resolve anyOf composition with string', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            value: {
              anyOf: [
                { type: 'string' }
              ],
              default: 'default'
            }
          }
        };

        const result = await resolveValues(schema, { value: 'test' });
        assert.ok(result.ok);
        assert.strictEqual(result.value.value, 'test');
      });

      it('should resolve anyOf composition with number', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            value: {
              anyOf: [
                { type: 'number' }
              ],
              default: 'default'
            }
          }
        };

        const result = await resolveValues(schema, { value: 42 });
        assert.ok(result.ok);
        assert.strictEqual(result.value.value, 42);
      });

      it('should resolve anyOf composition with default', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            value: {
              anyOf: [
                { type: 'string' },
                { type: 'number' }
              ],
              default: 'default'
            }
          }
        };

        const result = await resolveValues(schema, {});
        assert.ok(result.ok);
        assert.strictEqual(result.value.value, 'default');
      });
    });

    describe('oneOf', () => {
      it('should resolve oneOf composition - valid', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            value: {
              oneOf: [
                { type: 'number', minimum: 0 }
              ]
            }
          }
        };

        const result = await resolveValues(schema, { value: 5 });
        assert.ok(result.ok);
        assert.strictEqual(result.value.value, 5);
      });

      it('should resolve oneOf composition - invalid', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            value: {
              oneOf: [
                { type: 'number', maximum: 0 }
              ]
            }
          }
        };
        const result = await resolveValues(schema, { value: 1 });
        assert.ok(!result.ok);
        assert.strictEqual(result.errors.length > 0, true);
      });

      it('should resolve oneOf composition with default', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            value: {
              oneOf: [
                { type: 'number', minimum: 0 },
                { type: 'string', minLength: 1 }
              ],
              default: 'default'
            }
          }
        };

        const result = await resolveValues(schema, {});
        assert.ok(result.ok);
        assert.strictEqual(result.value.value, 'default');
      });
    });
  });

  describe('array items', () => {
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
      assert.ok(result.ok);
      assert.deepStrictEqual(result.value, [
        { id: 1, name: 'unnamed' },
        { id: 2, name: 'test' }
      ]);
    });
  });

  describe('dependent schemas', () => {
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
      assert.ok(result.ok);
      assert.deepStrictEqual(result.value, {
        credit_card: '1234-5678-9012-3456',
        billing_address: 'required'
      });
    });
  });

  describe('pattern properties', () => {
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
      assert.ok(result.ok);
      assert.strictEqual(result.value.S_name, 'test');
      assert.strictEqual(result.value.N_age, 25);
      assert.strictEqual(result.value.other, 'value');
    });
  });

  describe('additional properties', () => {
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
      assert.ok(result.ok);
      assert.deepStrictEqual(result.value, {
        name: 'test',
        extra: 'value'
      });
    });
  });

  describe('const and enum values', () => {
    it('should resolve const values', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          status: { type: 'string', const: 'active' }
        }
      };

      const result = await resolveValues(schema, {
        status: 'anything'
      });
      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].message, 'Value must be active');
    });

    it('should resolve enum values', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['admin', 'user'], default: 'user' }
        }
      };

      const result = await resolveValues(schema, {
        role: 'invalid'
      });
      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].message, 'Value must be one of: admin, user');
    });
  });

  describe('basic types', () => {
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
      assert.ok(result.ok);
      assert.deepStrictEqual(result.value, {
        str: 'default',
        num: 42,
        bool: true,
        arr: [],
        obj: {}
      });
    });
  });

  describe('conditional schemas', () => {
    it('should resolve conditional schemas (minimum)', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'integer' }
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
      assert.ok(adult.ok);
      assert.strictEqual(adult.value.canVote, true);

      const minor = await resolveValues(schema, { age: 16 });
      assert.ok(minor.ok);
      assert.strictEqual(minor.value.canVote, false);
    });

    it('should resolve conditional schemas (maximum)', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'integer' }
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
      assert.ok(adult.ok);
      assert.strictEqual(adult.value.canVote, true);

      const minor = await resolveValues(schema, { age: 16 });
      assert.ok(minor.ok);
      assert.strictEqual(minor.value.canVote, false);
    });
  });
});
