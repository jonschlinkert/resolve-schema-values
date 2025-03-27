import type { JSONSchema } from '~/types';
import assert from 'node:assert';
import { resolveValues } from '~/resolve';

describe('resolve', () => {
  describe('required properties', () => {
    it('should validate required properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          something: { type: 'string', minLength: 1 },
          other: { type: 'string' }
        },
        required: ['something']
      };

      const result = await resolveValues(schema, {});
      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].message, 'Missing required property: something');
    });

    it('should validate missing required properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          something: { type: 'string' },
          other: { type: 'string' }
        },
        required: ['something']
      };

      const result = await resolveValues(schema, {});
      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].message, 'Missing required property: something');
    });

    it('should validate nested missing required properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          steps: {
            type: 'object',
            required: ['nonexistent_prop']
          }
        }
      };

      const result = await resolveValues(schema, { steps: {} });
      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].message, 'Missing required property: nonexistent_prop');
    });

    it('should not ignore required names when no properties exist', async () => {
      const schema: JSONSchema = {
        type: 'object',
        required: ['foo', 'bar']
      };

      const result = await resolveValues(schema, {});
      assert.ok(!result.ok);
    });

    it('should ignore required names on items when no items are passed', async () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name']
        }
      };

      const result = await resolveValues(schema);
      assert.ok(result.ok);
    });

    it('should not ignore required names on items', async () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name']
        }
      };

      const result = await resolveValues(schema, [{}]);
      assert.ok(!result.ok);
      assert.equal(result.errors[0].message, 'Missing required property: id');
      assert.equal(result.errors[1].message, 'Missing required property: name');
    });

    it('should throw an error when "items" value is not an array', async () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'name']
        }
      };

      const result = await resolveValues(schema, {});
      assert.ok(!result.ok);
      assert.strictEqual(result.errors[0].message, 'Value must be an array');
    });

    it('should use default value on required properties without an error', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          something: { type: 'string', minLength: 1, default: 'foo' },
          other: { type: 'string' }
        },
        required: ['something']
      };

      const result = await resolveValues(schema, {});
      assert.ok(result.ok);
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
      assert.strictEqual(result.errors.length, 1);
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
          },
          other: {
            type: 'string'
          }
        }
      };

      const result = await resolveValues(schema, {
        name: 'ab'
      });

      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].message, 'String length must be >= 3');
    });

    it('should validate string minimum length with multiple properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            minLength: 3
          },
          other: {
            type: 'string'
          }
        }
      };

      const result = await resolveValues(schema, {
        name: 'ab'
      });

      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].message, 'String length must be >= 3');
    });

    it('should correctly calculate length of strings with emoji', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            minLength: 3,
            maxLength: 5
          }
        }
      };

      // '👨‍👩‍👧‍👦' is a single grapheme (family emoji) but multiple code points
      const tooShort = await resolveValues(schema, { text: '👨‍👩‍👧‍👦a' });
      assert.ok(!tooShort.ok);
      assert.strictEqual(tooShort.errors[0].message, 'String length must be >= 3');

      // 'abc👨‍👩‍👧‍👦de' is 6 graphemes
      const tooLong = await resolveValues(schema, { text: 'abc👨‍👩‍👧‍👦de' });
      assert.ok(!tooLong.ok);
      assert.strictEqual(tooLong.errors[0].message, 'String length must be <= 5');

      // 'a👨‍👩‍👧‍👦b' is 3 graphemes
      const justRight = await resolveValues(schema, { text: 'a👨‍👩‍👧‍👦b' });
      assert.ok(justRight.ok);
    });

    it('should handle combining characters correctly', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            minLength: 3,
            maxLength: 5
          }
        }
      };

      // 'é' can be composed of 'e' + '´' (combining acute accent)
      const combining = await resolveValues(schema, { text: 'café' }); // should be 4 graphemes
      assert.ok(combining.ok);

      const decomposed = await resolveValues(schema, { text: 'cafe\u0301' }); // same text with decomposed é
      assert.ok(decomposed.ok);
    });

    it('should validate string maximum length', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            maxLength: 10
          },
          other: {
            type: 'string'
          }
        }
      };

      const result = await resolveValues(schema, {
        name: 'this is too long'
      });

      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 1);
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
          },
          other: {
            type: 'string'
          }
        },
        required: ['other']
      };

      const result = await resolveValues(schema, {
        name: 'valid',
        other: 'something'
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
          },
          count: {
            type: 'integer'
          }
        }
      };

      const result = await resolveValues(schema, {
        age: 'not a number'
      });

      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].message, 'Value must be a number');
    });

    it('should validate integer type', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          count: {
            type: 'integer'
          },
          other: {
            type: 'string'
          }
        }
      };

      const result = await resolveValues(schema, {
        count: 1.5
      });

      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].message, 'Value must be an integer');
    });

    it('should validate required integer', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          count: {
            type: 'integer'
          },
          other: {
            type: 'string'
          }
        },
        required: ['count']
      };

      const result = await resolveValues(schema, {
        count: 1.1
      });

      assert.ok(!result.ok);
      assert.strictEqual(result.errors.length, 1);
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
      assert.strictEqual(result.errors.length, 2);
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
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(result.errors[0].message, 'Missing required property: taxId');
    });

    it('should handle regex special characters in patterns', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            pattern: 'hello\\(world\\)'
          }
        }
      };

      const result1 = await resolveValues(schema, { text: 'hello(world)' });
      assert.ok(result1.ok);

      const result2 = await resolveValues(schema, { text: 'helloworld' });
      assert.ok(!result2.ok);
    });

    it('should support Unicode patterns', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            pattern: '^[\\p{L}]+$' // Unicode letter category
          }
        }
      };

      const result1 = await resolveValues(schema, { text: 'HelloПривет你好' }); // mixed scripts
      assert.ok(result1.ok);

      const result2 = await resolveValues(schema, { text: 'Hello123' }); // includes numbers
      assert.ok(!result2.ok);
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
      assert.strictEqual(result.errors.length, 1);
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
            default: ['foo', 'bar', 'baz']
          }
        }
      };

      const result = await resolveValues(schema, {});
      assert.ok(result.ok);
      assert.deepStrictEqual(result.value.tags, ['foo', 'bar', 'baz']);
    });

    it('should be undefined when no tags or default is defined', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      };

      const result = await resolveValues(schema, {});
      assert.ok(result.ok);
      assert.deepEqual(result.value.tags, undefined);
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

    it('should use array from args over default', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string', minLength: 2 },
            minItems: 1,
            maxItems: 3,
            uniqueItems: true,
            default: ['foo', 'bar']
          }
        }
      };

      const result = await resolveValues(schema, {
        tags: ['tag1', 'tag2', 'tag3']
      });

      assert.ok(result.ok);
      assert.deepEqual(result.value.tags, ['tag1', 'tag2', 'tag3']);
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
        assert.strictEqual(result.errors.length, 2);
      });
    });

    describe('anyOf', () => {
      it('should resolve anyOf composition with string', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            value: {
              anyOf: [{ type: 'string' }],
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
              anyOf: [{ type: 'number' }],
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
              anyOf: [{ type: 'string' }, { type: 'number' }],
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
              oneOf: [{ type: 'number', minimum: 0 }]
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
              oneOf: [{ type: 'number', maximum: 0 }]
            }
          }
        };
        const result = await resolveValues(schema, { value: 1 });
        assert.ok(!result.ok);
        assert.strictEqual(result.errors.length, 1);
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

      const result = await resolveValues(schema, [{ id: 1 }, { id: 2, name: 'test' }]);
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
              billing_address: { type: 'string', default: '111222 abc' }
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
        billing_address: '111222 abc'
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
        S_name: 'test',
        N_age: 25,
        other: 'value'
      });

      assert.ok(result.ok);
      assert.strictEqual(result.value.S_name, 'test');
      assert.strictEqual(result.value.N_age, 25);
      assert.strictEqual(result.value.other, 'value');
    });

    describe('pattern properties with special characters', () => {
      it('should handle regex special characters in property patterns', async () => {
        const schema: JSONSchema = {
          type: 'object',
          patternProperties: {
            '^\\[.*\\]$': {
              // matches properties wrapped in square brackets
              type: 'string'
            }
          }
        };

        const result = await resolveValues(schema, {
          '[test]': 'value',
          'normalKey': 'other'
        });

        assert.ok(result.ok);
        assert.strictEqual(result.value['[test]'], 'value');
      });

      it('should support Unicode in property patterns', async () => {
        const schema: JSONSchema = {
          type: 'object',
          patternProperties: {
            '^[\\p{Script=Cyrillic}]+$': {
              // matches Cyrillic property names
              type: 'string'
            }
          }
        };

        const result = await resolveValues(schema, {
          привет: 'hello',
          hello: 'world'
        });

        assert.ok(result.ok);
        assert.strictEqual(result.value['привет'], 'hello');
      });
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

  describe('multiple types', () => {
    describe('basic type validation', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          value: {
            type: ['string', 'number']
          }
        }
      };

      it('should accept string values', async () => {
        const result = await resolveValues(schema, {
          value: 'hello'
        });
        assert.ok(result.ok);
        assert.strictEqual(result.value.value, 'hello');
      });

      it('should accept number values', async () => {
        const result = await resolveValues(schema, {
          value: 42
        });
        assert.ok(result.ok);
        assert.strictEqual(result.value.value, 42);
      });

      it('should reject invalid types', async () => {
        const result = await resolveValues(schema, { value: true });
        assert.ok(!result.ok);
        assert.strictEqual(result.errors.length, 1);
      });
    });

    describe('type-specific constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          value: {
            type: ['string', 'number'],
            minLength: 2,
            minimum: 10
          }
        }
      };

      it('should validate string constraints', async () => {
        const shortString = await resolveValues(schema, { value: 'a' });
        assert.ok(!shortString.ok);
        assert.strictEqual(shortString.errors.length, 1);

        const validString = await resolveValues(schema, { value: 'hello' });
        assert.ok(validString.ok);
      });

      it('should validate number constraints', async () => {
        const lowNumber = await resolveValues(schema, { value: 5 });
        assert.ok(!lowNumber.ok);
        assert.strictEqual(lowNumber.errors.length, 1);

        const validNumber = await resolveValues(schema, { value: 42 });
        assert.ok(validNumber.ok);
      });
    });

    describe('array with multiple types', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          list: {
            type: 'array',
            items: {
              type: ['string', 'number']
            }
          }
        }
      };

      it('should accept arrays with valid mixed types', async () => {
        const result = await resolveValues(schema, {
          list: ['hello', 42, 'world', 123]
        });
        assert.ok(result.ok);
        assert.deepStrictEqual(result.value.list, ['hello', 42, 'world', 123]);
      });

      it('should reject arrays containing invalid types', async () => {
        const result = await resolveValues(schema, {
          list: ['hello', 42, true]
        });
        assert.ok(!result.ok);
        assert.strictEqual(result.errors.length, 1);
      });
    });

    describe('default values', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          value: {
            type: ['string', 'number'],
            default: 'default'
          }
        }
      };

      it('should use default value when property is missing', async () => {
        const result = await resolveValues(schema, {});
        assert.ok(result.ok);
        assert.strictEqual(result.value.value, 'default');
      });

      it('should allow overriding default with valid types', async () => {
        const stringResult = await resolveValues(schema, {
          value: 'test'
        });
        assert.ok(stringResult.ok);
        assert.strictEqual(stringResult.value.value, 'test');

        const numberResult = await resolveValues(schema, { value: 42 });
        assert.ok(numberResult.ok);
        assert.strictEqual(numberResult.value.value, 42);
      });

      it('should apply defaults when parent object is missing', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                settings: {
                  type: 'object',
                  properties: {
                    theme: { type: 'string', default: 'dark' }
                  }
                }
              }
            }
          }
        };

        const result1 = await resolveValues(schema, {});
        assert.ok(result1.ok);
        assert.strictEqual(result1.value?.user?.settings?.theme, 'dark');

        const result2 = await resolveValues(schema, { user: {} });
        assert.ok(result2.ok);
        assert.strictEqual(result2.value?.user?.settings?.theme, 'dark');
      });

      it('should handle multiple nested levels of defaults', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                settings: {
                  type: 'object',
                  default: {
                    theme: 'dark',
                    notifications: true
                  },
                  properties: {
                    theme: { type: 'string', default: 'dark' },
                    notifications: { type: 'boolean', default: true }
                  }
                }
              }
            }
          }
        };

        const result = await resolveValues(schema, {});
        assert.ok(result.ok);
        assert.strictEqual(result.value?.user?.settings?.theme, 'dark');
        assert.strictEqual(result.value?.user?.settings?.notifications, true);
      });
    });

    describe('nested properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              value: {
                type: ['string', 'number'],
                minLength: 2,
                minimum: 10
              }
            },
            required: ['value']
          }
        }
      };

      it('should validate nested string values', async () => {
        const result = await resolveValues(schema, {
          nested: { value: 'hello' }
        });
        assert.ok(result.ok);
        assert.strictEqual(result.value.nested.value, 'hello');
      });

      it('should validate nested number values', async () => {
        const result = await resolveValues(schema, {
          nested: { value: 42 }
        });
        assert.ok(result.ok);
        assert.strictEqual(result.value.nested.value, 42);
      });

      it('should reject nested invalid types', async () => {
        const result = await resolveValues(schema, {
          nested: { value: true }
        });
        assert.ok(!result.ok);
        assert.strictEqual(result.errors.length, 1);
      });

      it('should require nested value property', async () => {
        const result = await resolveValues(schema, {
          nested: {}
        });

        assert.ok(!result.ok);
        assert.strictEqual(result.errors.length, 1);
        assert.strictEqual(result.errors[0].message, 'Missing required property: value');
        assert.strictEqual(result.errors[0].path[0], 'nested');
      });
    });

    describe('composition with multiple types', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          value: {
            allOf: [
              {
                type: ['string', 'number']
              },
              {
                type: ['string', 'boolean']
              }
            ]
          }
        }
      };

      it('should accept values valid for all schemas', async () => {
        const result = await resolveValues(schema, {
          value: 'test'
        });
        assert.ok(result.ok);
        assert.strictEqual(result.value.value, 'test');
      });

      it('should reject values not valid for all schemas', async () => {
        const numberResult = await resolveValues(schema, {
          value: 42
        });

        assert.ok(!numberResult.ok);
        assert.strictEqual(numberResult.errors.length, 1);
        assert.strictEqual(numberResult.errors[0].path[0], 'value');

        const booleanResult = await resolveValues(schema, {
          value: true
        });

        assert.ok(!booleanResult.ok);
        assert.strictEqual(booleanResult.errors.length, 1);

        // This is the only one that should pass
        const stringResult = await resolveValues(schema, {
          value: 'true'
        });

        assert.ok(stringResult.ok);
      });

      it('should correctly handle type validation in allOf', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            value: {
              allOf: [
                {
                  type: ['string', 'number']
                },
                {
                  type: ['string', 'boolean']
                }
              ]
            }
          }
        };

        // A string should be valid as it satisfies both schemas
        const stringResult = await resolveValues(schema, { value: 'test' });
        assert.ok(stringResult.ok);
        assert.strictEqual(stringResult.value.value, 'test');

        const numberResult = await resolveValues(schema, { value: 42 });
        assert.ok(!numberResult.ok);

        const booleanResult = await resolveValues(schema, { value: true });
        assert.ok(!booleanResult.ok);

        const arrayResult = await resolveValues(schema, { value: [] });
        assert.ok(!arrayResult.ok);
      });

      it('should correctly handle integer/number in allOf', async () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            value: {
              allOf: [
                {
                  type: ['string', 'number']
                },
                {
                  type: ['integer', 'boolean']
                }
              ]
            }
          }
        };

        const numberResult = await resolveValues(schema, { value: 42 });
        assert.ok(numberResult.ok);

        const stringResult = await resolveValues(schema, { value: 'test' });
        assert.ok(!stringResult.ok);

        const booleanResult = await resolveValues(schema, { value: true });
        assert.ok(!booleanResult.ok);

        const arrayResult = await resolveValues(schema, { value: [] });
        assert.ok(!arrayResult.ok);
      });
    });
  });

  describe('format validation', () => {
    it('should validate date-time format', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          timestamp: { type: 'string', format: 'date-time' }
        }
      };

      const validResult = await resolveValues(schema, {
        timestamp: '2024-01-01T12:00:00Z'
      });
      assert.ok(validResult.ok);
      assert.strictEqual(validResult.value.timestamp, '2024-01-01T12:00:00Z');

      const invalidResult = await resolveValues(schema, {
        timestamp: 'invalid'
      });
      assert.ok(!invalidResult.ok);
      assert.strictEqual(invalidResult.errors[0].message, 'Invalid date-time format');
    });

    it('should validate date format', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' }
        }
      };

      const validResult = await resolveValues(schema, {
        date: '2024-01-01'
      });
      assert.ok(validResult.ok);
      assert.strictEqual(validResult.value.date, '2024-01-01');

      const invalidResult = await resolveValues(schema, {
        date: '2024/01/01'
      });
      assert.ok(!invalidResult.ok);
      assert.strictEqual(invalidResult.errors[0].message, 'Invalid date format');
    });

    it('should validate email format', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' }
        }
      };

      const validResult = await resolveValues(schema, {
        email: 'test@example.com'
      });
      assert.ok(validResult.ok);
      assert.strictEqual(validResult.value.email, 'test@example.com');

      const invalidResult = await resolveValues(schema, {
        email: 'invalid-email'
      });
      assert.ok(!invalidResult.ok);
      assert.strictEqual(invalidResult.errors[0].message, 'Invalid email format');
    });

    it('should validate ipv4 format', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          ip: { type: 'string', format: 'ipv4' }
        }
      };

      const validResult = await resolveValues(schema, {
        ip: '192.168.1.1'
      });
      assert.ok(validResult.ok);
      assert.strictEqual(validResult.value.ip, '192.168.1.1');

      const invalidResult = await resolveValues(schema, {
        ip: '256.256.256.256'
      });
      assert.ok(!invalidResult.ok);
      assert.strictEqual(invalidResult.errors[0].message, 'Invalid ipv4 format');
    });
  });

  describe('property exclusion', () => {
    it('should enforce mutually exclusive properties via not/required (1)', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' }
        },
        not: { required: ['a', 'b'] }
      };

      const validResult = await resolveValues(schema, { a: 'test' });
      assert.ok(validResult.ok);
      assert.strictEqual(validResult.value.a, 'test');

      const invalidResult = await resolveValues(schema, { a: 'test', b: 'test' });
      assert.ok(!invalidResult.ok);
      assert.strictEqual(invalidResult.errors[0].message, 'Value must not match schema');
    });

    it('should enforce mutually exclusive properties via not/required (2)', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' }
        },
        allOf: [{ not: { required: ['a', 'b'] } }]
      };

      const result1 = await resolveValues(schema, { a: 'foo' });

      assert.ok(result1.ok);
      assert.strictEqual(result1.value.a, 'foo');

      const result2 = await resolveValues(schema, { a: 'bar' });

      assert.ok(result2.ok);
      assert.strictEqual(result2.value.a, 'bar');

      const result3 = await resolveValues(schema, { a: 'foo', b: 'bar' });
      assert.ok(!result3.ok);
      assert.strictEqual(result3.errors[0].message, 'Value must not match schema');
    });

    it('should enforce mutually exclusive properties via not/required (3)', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' }
        },
        allOf: [{ not: { required: ['b'] } }, { not: { required: ['a'] } }]
      };

      const result1 = await resolveValues(schema, { a: 'test' });

      assert.ok(!result1.ok);
      assert.strictEqual(result1.errors[0].path.join('.'), 'allOf.not.b');
      assert.strictEqual(result1.errors[0].message, 'Missing required property: b');
      assert.strictEqual(result1.errors[1].path.join('.'), 'allOf.not');
      assert.strictEqual(result1.errors[1].message, 'Value must not match schema');

      const result2 = await resolveValues(schema, { a: 'test', b: 'test' });
      assert.ok(!result2.ok);
      assert.strictEqual(result2.errors[0].message, 'Value must not match schema');
    });

    it('should enforce exactly one property via oneOf/required', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
          c: { type: 'string' }
        },
        oneOf: [
          { required: ['a'] },
          { required: ['b'], properties: { name: { type: 'string', default: 'doowb' } } },
          { required: ['c'] }
        ]
      };

      const validResult = await resolveValues(schema, { b: 'test' });

      assert.ok(validResult.ok);
      assert.strictEqual(validResult.value.b, 'test');
      assert.strictEqual(validResult.value.name, 'doowb');

      const invalidTwoProps = await resolveValues(schema, { a: 'test', b: 'test' });
      assert.ok(!invalidTwoProps.ok);

      assert.strictEqual(invalidTwoProps.errors[0].message, 'Value must match exactly one schema in oneOf');

      const invalidNoProps = await resolveValues(schema, {});
      assert.ok(!invalidNoProps.ok);
      assert.equal(invalidNoProps.errors.length, 2);
      assert.strictEqual(invalidNoProps.errors[1].message, 'Value must match exactly one schema in oneOf');
    });
  });

  describe('nested composition', () => {
    it('should validate deeply nested allOf/anyOf combinations', async () => {
      const schema: JSONSchema = {
        allOf: [
          {
            anyOf: [
              { type: 'string', minLength: 5 },
              { type: 'number', minimum: 10 }
            ]
          },
          {
            anyOf: [
              { type: 'string', maxLength: 10 },
              { type: 'number', maximum: 20 }
            ]
          }
        ]
      };

      const validString = await resolveValues(schema, 'valid');
      assert.ok(validString.ok);
      assert.strictEqual(validString.value, 'valid');

      const validNumber = await resolveValues(schema, 15);
      assert.ok(validNumber.ok);
      assert.strictEqual(validNumber.value, 15);

      const invalidShortString = await resolveValues(schema, 'hi');
      assert.ok(!invalidShortString.ok);
      assert.ok(invalidShortString.errors.length > 0);

      const invalidLargeNumber = await resolveValues(schema, 25);
      assert.ok(!invalidLargeNumber.ok);
      assert.ok(invalidLargeNumber.errors.length > 0);
    });
  });

  describe('dependent required properties', () => {
    it('should enforce dependent required properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          type: { type: 'string' },
          value: { type: 'string' },
          format: { type: 'string' }
        },
        if: { properties: { type: { const: 'special' } } },
        then: { required: ['value'] }
      };

      const validNormal = await resolveValues(schema, { type: 'normal' });
      assert.ok(validNormal.ok);

      const invalidMissingValue = await resolveValues(schema, { type: 'special' });
      assert.ok(!invalidMissingValue.ok);
      assert.strictEqual(invalidMissingValue.errors[0].message, 'Missing required property: value');
    });

    it('should enforce dependent required properties across multiple conditions', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          type: { type: 'string' },
          value: { type: 'string' },
          format: { type: 'string' }
        },
        allOf: [
          {
            if: { properties: { type: { const: 'special' } } },
            then: { required: ['value'] }
          },
          {
            if: { properties: { value: { minLength: 1 } } },
            then: { required: ['format'] }
          }
        ]
      };

      const validNormal = await resolveValues(schema, { type: 'normal' });
      assert.ok(validNormal.ok); // This should pass since no conditions are triggered.

      const invalidMissingValue = await resolveValues(schema, { type: 'special' });
      assert.ok(!invalidMissingValue.ok);
      assert.strictEqual(invalidMissingValue.errors[0].message, 'Missing required property: value');

      const invalidMissingFormat = await resolveValues(schema, { type: 'special', value: 'test' });
      assert.ok(!invalidMissingFormat.ok);
      assert.strictEqual(invalidMissingFormat.errors[0].message, 'Missing required property: format');
    });

    it('should enforce conditions based on specific items in an array', async () => {
      const schema: JSONSchema = {
        type: 'array',
        items: [
          { type: 'string' },
          {
            type: 'object',
            properties: {
              requiredField: { type: 'string' }
            },
            required: ['requiredField']
          }
        ],
        if: {
          contains: { type: 'string', const: 'specialItem' }
        },
        then: {
          contains: { type: 'object', required: ['requiredField'] }
        }
      };

      const validArray = await resolveValues(schema, ['normalItem', { requiredField: 'value' }]);
      assert.ok(validArray.ok);

      const invalidArray = await resolveValues(schema, ['specialItem', {}]);
      assert.ok(!invalidArray.ok);
      assert.strictEqual(invalidArray.errors[0].message, 'Array must contain at least one matching item');
    });

    it('should enforce conditions across nested arrays', async () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'array',
          items: [
            { type: 'string' },
            {
              type: 'object',
              properties: {
                nestedField: { type: 'string' }
              },
              required: ['nestedField']
            }
          ]
        },
        allOf: [
          {
            if: {
              contains: {
                type: 'array',
                contains: { type: 'string', const: 'trigger' }
              }
            },
            then: {
              contains: {
                type: 'array',
                contains: { type: 'object', required: ['nestedField'] }
              }
            }
          }
        ]
      };

      // Scenario: Nested arrays without 'trigger'
      const validNestedArrays = await resolveValues(schema, [['item1', { nestedField: 'value' }]]);
      assert.ok(validNestedArrays.ok);

      // Scenario: Nested arrays with 'trigger' but missing 'nestedField' in the object
      const invalidNestedArrays = await resolveValues(schema, [['trigger', {}]]);
      assert.ok(!invalidNestedArrays.ok);
      assert.strictEqual(invalidNestedArrays.errors[0].message, 'Array must contain at least one matching item');
    });

    it('should enforce item types conditionally with arrays', async () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
        if: {
          contains: { const: 'trigger' }
        },
        then: {
          items: { type: 'number' }
        }
      };

      const result = await resolveValues(schema, ['one', 'two']);
      assert.ok(result.ok);

      const result2 = await resolveValues(schema, ['trigger', 'notANumber']);
      assert.ok(!result2.ok);
      assert.strictEqual(result2.errors[0].message, 'Value must be a number');
    });

    it('should enforce conditions based on item presence', async () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
        allOf: [
          {
            if: { contains: { const: 'error' } },
            then: { minItems: 3 }
          },
          {
            if: { contains: { const: 'warning' } },
            then: { maxItems: 3 }
          }
        ]
      };

      const validArrayWithError = await resolveValues(schema, ['error', 'more', 'items']);
      assert.ok(validArrayWithError.ok);

      const invalidArrayWithError = await resolveValues(schema, ['error', 'less']);
      assert.ok(!invalidArrayWithError.ok);
      assert.strictEqual(invalidArrayWithError.errors[0].message, 'Array length must be >= 3');

      const validArrayWithWarning = await resolveValues(schema, ['warning', 'still', 'valid']);
      assert.ok(validArrayWithWarning.ok);

      const invalidArrayWithWarning = await resolveValues(schema, ['warning', 'too', 'many', 'items']);
      assert.ok(!invalidArrayWithWarning.ok);
      assert.strictEqual(invalidArrayWithWarning.errors[0].message, 'Array length must be <= 3');
    });
  });

  describe('array contains validation', () => {
    it('should validate array contains constraint', async () => {
      const schema: JSONSchema = {
        type: 'array',
        contains: {
          type: 'number',
          minimum: 5
        }
      };

      const validResult = await resolveValues(schema, [1, 2, 6, 3]);
      assert.ok(validResult.ok);
      assert.deepStrictEqual(validResult.value, [1, 2, 6, 3]);

      const invalidResult = await resolveValues(schema, [1, 2, 3, 4]);
      assert.ok(!invalidResult.ok);
      assert.strictEqual(invalidResult.errors[0].message, 'Array must contain at least one matching item');
    });
  });

  describe('multiple type validation with constraints', () => {
    it('should validate value against type-specific constraints', async () => {
      const schema: JSONSchema = {
        type: ['string', 'number'],
        minLength: 3,
        minimum: 10
      };

      const validString = await resolveValues(schema, 'test');
      assert.ok(validString.ok);
      assert.strictEqual(validString.value, 'test');

      const validNumber = await resolveValues(schema, 15);
      assert.ok(validNumber.ok);
      assert.strictEqual(validNumber.value, 15);

      const invalidShortString = await resolveValues(schema, 'ab');
      assert.ok(!invalidShortString.ok);
      assert.strictEqual(invalidShortString.errors[0].message, 'String length must be >= 3');

      const invalidSmallNumber = await resolveValues(schema, 5);
      assert.ok(!invalidSmallNumber.ok);
      assert.strictEqual(invalidSmallNumber.errors[0].message, 'Value must be >= 10');
    });
  });

  describe('property names validation', () => {
    it('should validate property names against schema', async () => {
      const schema: JSONSchema = {
        type: 'object',
        propertyNames: {
          type: 'string',
          pattern: '^[a-z]+$'
        }
      };

      const validResult = await resolveValues(schema, { abc: 1, def: 2 });
      assert.ok(validResult.ok);
      assert.deepStrictEqual(validResult.value, { abc: 1, def: 2 });

      const invalidResult = await resolveValues(schema, { 'invalid-key': 1 });
      assert.ok(!invalidResult.ok);
      assert.ok(invalidResult.errors[0].message.includes('must match pattern'));
      assert.equal(invalidResult.errors[0].path[0], 'propertyNames');
    });
  });

  describe('deeply nested conditional validation', () => {
    it('should validate nested conditionals with multiple dependencies', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              age: { type: 'number' }
            },
            if: {
              properties: { type: { const: 'minor' } }
            },
            then: {
              properties: { age: { maximum: 18 } }
            },
            else: {
              properties: { age: { minimum: 18 } }
            }
          }
        }
      };

      const validMinor = await resolveValues(schema, {
        user: { type: 'minor', age: 15 }
      });
      assert.ok(validMinor.ok);

      const validAdult = await resolveValues(schema, {
        user: { type: 'adult', age: 25 }
      });
      assert.ok(validAdult.ok);

      const invalidMinor = await resolveValues(schema, {
        user: { type: 'minor', age: 20 }
      });
      assert.ok(!invalidMinor.ok);
      assert.strictEqual(invalidMinor.errors[0].message, 'Value must be <= 18');

      const invalidAdult = await resolveValues(schema, {
        user: { type: 'adult', age: 15 }
      });
      assert.ok(!invalidAdult.ok);
      assert.strictEqual(invalidAdult.errors[0].message, 'Value must be >= 18');
    });
  });

  describe('array items condition evaluation', () => {
    it('should evaluate nested array items with conditions', async () => {
      const schema: JSONSchema = {
        type: 'array',
        if: {
          items: {
            type: 'object',
            properties: {
              status: { const: 'active' }
            }
          }
        },
        then: {
          items: {
            required: ['id']
          }
        }
      };

      // All items are active, should require id
      const valid = await resolveValues(schema, [
        { status: 'active', id: '1' },
        { status: 'active', id: '2' }
      ]);
      assert.ok(valid.ok);

      // Missing id when all items are active
      const invalid = await resolveValues(schema, [{ status: 'active', id: '1' }, { status: 'active' }]);
      assert.ok(!invalid.ok);
      assert.strictEqual(invalid.errors[0].message, 'Missing required property: id');
    });

    it('should evaluate array items with nested conditional logic', async () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          if: {
            properties: {
              type: { const: 'user' }
            }
          },
          then: {
            required: ['name', 'email']
          }
        }
      };

      // Valid: non-user items don't need name/email
      const validMixed = await resolveValues(schema, [
        { type: 'user', name: 'John', email: 'john@test.com' },
        { type: 'system' }
      ]);
      assert.ok(validMixed.ok);

      // Invalid: user type missing required fields
      const invalidUser = await resolveValues(schema, [
        { type: 'user', name: 'John' }, // missing email
        { type: 'system' }
      ]);
      assert.ok(!invalidUser.ok);

      assert.strictEqual(invalidUser.errors[0].message, 'Missing required property: email');
    });

    it('should evaluate conditions on array items with multiple validation rules', async () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          if: {
            properties: {
              role: { const: 'admin' }
            }
          },
          then: {
            properties: {
              accessLevel: {
                type: 'number',
                minimum: 5
              }
            },
            required: ['accessLevel']
          },
          else: {
            properties: {
              accessLevel: {
                type: 'number',
                maximum: 4
              }
            }
          }
        }
      };

      // Valid admin with high access level
      const validAdmin = await resolveValues(schema, [{ role: 'admin', accessLevel: 7 }]);
      assert.ok(validAdmin.ok);

      // Valid user with low access level
      const validUser = await resolveValues(schema, [{ role: 'user', accessLevel: 2 }]);
      assert.ok(validUser.ok);

      // Invalid: admin with low access level
      const invalidAdmin = await resolveValues(schema, [{ role: 'admin', accessLevel: 3 }]);
      assert.ok(!invalidAdmin.ok);
      assert.strictEqual(invalidAdmin.errors[0].message, 'Value must be >= 5');

      // Invalid: user with high access level
      const invalidUser = await resolveValues(schema, [{ role: 'user', accessLevel: 6 }]);
      assert.ok(!invalidUser.ok);

      assert.strictEqual(invalidUser.errors[0].message, 'Value must be <= 4');
    });
  });
});
