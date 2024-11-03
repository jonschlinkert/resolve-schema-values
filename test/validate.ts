import type { JSONSchema } from '~/types';
import assert from 'node:assert';
import { validateValue, validateString, validateNumber, validateArray, validateObject, createError } from '~/validate';

describe('validate', () => {
  describe('string', () => {
    it('string type', () => {
      const schema: JSONSchema = { type: 'string' };
      assert.deepStrictEqual(validateString('test', schema, []), []);
      assert.deepStrictEqual(validateString(123, schema, []), [
        createError([], 'Value must be a string')
      ]);
    });

    it('minLength', () => {
      const schema: JSONSchema = { type: 'string', minLength: 3 };
      assert.deepStrictEqual(validateString('test', schema, []), []);
      assert.deepStrictEqual(validateString('ab', schema, []), [
        createError([], 'String length must be >= 3')
      ]);
    });

    it('maxLength', () => {
      const schema: JSONSchema = { type: 'string', maxLength: 4 };
      assert.deepStrictEqual(validateString('test', schema, []), []);
      assert.deepStrictEqual(validateString('toolong', schema, []), [
        createError([], 'String length must be <= 4')
      ]);
    });

    it('pattern', () => {
      const schema: JSONSchema = { type: 'string', pattern: '^\\d{3}$' };
      assert.deepStrictEqual(validateString('123', schema, []), []);
      assert.deepStrictEqual(validateString('abc', schema, []), [
        createError([], 'String must match pattern: ^\\d{3}$')
      ]);
    });
  });

  describe('string → formats', () => {
    it('date-time format', () => {
      const schema: JSONSchema = { type: 'string', format: 'date-time' };
      assert.deepStrictEqual(validateString('2024-01-01T12:00:00Z', schema, []), []);
      assert.deepStrictEqual(validateString('invalid', schema, []), [
        createError([], 'Invalid date-time format')
      ]);
    });

    it('date format', () => {
      const schema: JSONSchema = { type: 'string', format: 'date' };
      assert.deepStrictEqual(validateString('2024-01-01', schema, []), []);
      assert.deepStrictEqual(validateString('2024/01/01', schema, []), [
        createError([], 'Invalid date format')
      ]);
    });

    it('email format', () => {
      const schema: JSONSchema = { type: 'string', format: 'email' };
      assert.deepStrictEqual(validateString('test@example.com', schema, []), []);
      assert.deepStrictEqual(validateString('invalid-email', schema, []), [
        createError([], 'Invalid email format')
      ]);
    });
  });

  describe('number', () => {
    it('number type', () => {
      const schema: JSONSchema = { type: 'number' };
      assert.deepStrictEqual(validateNumber(123, schema, []), []);
      assert.deepStrictEqual(validateNumber('123', schema, []), [
        createError([], 'Value must be a number')
      ]);
    });

    it('integer type', () => {
      const schema: JSONSchema = { type: 'integer' };
      assert.deepStrictEqual(validateNumber(123, schema, []), []);
      assert.deepStrictEqual(validateNumber(123.45, schema, []), [
        createError([], 'Value must be an integer')
      ]);
    });

    it('minimum', () => {
      const schema: JSONSchema = { type: 'number', minimum: 10 };
      assert.deepStrictEqual(validateNumber(15, schema, []), []);
      assert.deepStrictEqual(validateNumber(5, schema, []), [
        createError([], 'Value must be >= 10')
      ]);
    });

    it('maximum', () => {
      const schema: JSONSchema = { type: 'number', maximum: 10 };
      assert.deepStrictEqual(validateNumber(5, schema, []), []);
      assert.deepStrictEqual(validateNumber(15, schema, []), [
        createError([], 'Value must be <= 10')
      ]);
    });

    it('multipleOf', () => {
      const schema: JSONSchema = { type: 'number', multipleOf: 5 };
      assert.deepStrictEqual(validateNumber(15, schema, []), []);
      assert.deepStrictEqual(validateNumber(17, schema, []), [
        createError([], 'Value must be multiple of 5')
      ]);
    });
  });

  describe('array', () => {
    it('array type', async () => {
      const schema: JSONSchema = { type: 'array' };
      assert.deepStrictEqual(await validateArray([], schema, {}), []);
      assert.deepStrictEqual(await validateArray('not-array', schema, {}), [
        createError([], 'Value must be an array')
      ]);
    });

    it('minItems', async () => {
      const schema: JSONSchema = { type: 'array', minItems: 2 };
      assert.deepStrictEqual(await validateArray([1, 2], schema, {}), []);
      assert.deepStrictEqual(await validateArray([1], schema, {}), [
        createError([], 'Array length must be >= 2')
      ]);
    });

    it('maxItems', async () => {
      const schema: JSONSchema = { type: 'array', maxItems: 2 };
      assert.deepStrictEqual(await validateArray([1, 2], schema, {}), []);
      assert.deepStrictEqual(await validateArray([1, 2, 3], schema, {}), [
        createError([], 'Array length must be <= 2')
      ]);
    });

    it('uniqueItems', async () => {
      const schema: JSONSchema = { type: 'array', uniqueItems: true };
      assert.deepStrictEqual(await validateArray([1, 2, 3], schema, {}), []);
      assert.deepStrictEqual(await validateArray([1, 2, 2], schema, {}), [
        createError(['2'], 'Duplicate items not allowed')
      ]);
    });

    it('items schema', async () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'number', minimum: 0 }
      };
      assert.deepStrictEqual(await validateArray([1, 2, 3], schema, {}), []);
      assert.deepStrictEqual(await validateArray([1, -2, 3], schema, {}), [
        createError(['1'], 'Value must be >= 0')
      ]);
    });
  });

  describe('object', () => {
    it('object type', async () => {
      const schema: JSONSchema = { type: 'object' };
      assert.deepStrictEqual(await validateObject({}, schema, {}), []);
      assert.deepStrictEqual(await validateObject('not-object', schema, {}), [
        createError([], 'Value must be an object')
      ]);
    });

    it('required properties', async () => {
      const schema: JSONSchema = {
        type: 'object',
        required: ['name']
      };
      assert.deepStrictEqual(await validateObject({ name: 'test' }, schema, {}), []);
      assert.deepStrictEqual(await validateObject({}, schema, {}), [
        createError([], 'Missing required property: name')
      ]);
    });

    it('property schemas', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          age: { type: 'number', minimum: 0 }
        }
      };
      assert.deepStrictEqual(await validateObject({ age: 25 }, schema, {}), []);
      assert.deepStrictEqual(await validateObject({ age: -5 }, schema, {}), [
        createError(['age'], 'Value must be >= 0')
      ]);
    });

    it('minProperties', async () => {
      const schema: JSONSchema = { type: 'object', minProperties: 2 };
      assert.deepStrictEqual(await validateObject({ a: 1, b: 2 }, schema, {}), []);
      assert.deepStrictEqual(await validateObject({ a: 1 }, schema, {}), [
        createError([], 'Object must have >= 2 properties')
      ]);
    });

    it('maxProperties', async () => {
      const schema: JSONSchema = { type: 'object', maxProperties: 2 };
      assert.deepStrictEqual(await validateObject({ a: 1, b: 2 }, schema, {}), []);
      assert.deepStrictEqual(await validateObject({ a: 1, b: 2, c: 3 }, schema, {}), [
        createError([], 'Object must have <= 2 properties')
      ]);
    });
  });

  describe('values', () => {
    it('const values', async () => {
      const schema: JSONSchema = { const: 42 };
      assert.deepStrictEqual(await validateValue(42, schema), []);
      assert.deepStrictEqual(await validateValue(41, schema), [
        createError([], 'Value must be 42')
      ]);
    });

    it('enum values', async () => {
      const schema: JSONSchema = { enum: ['red', 'green', 'blue'] };
      assert.deepStrictEqual(await validateValue('red', schema), []);
      assert.deepStrictEqual(await validateValue('yellow', schema), [
        createError([], 'Value must be one of: red, green, blue')
      ]);
    });
  });

  describe('conditionals', () => {
    it('if/then conditions', async () => {
      const schema: JSONSchema = {
        type: 'object',
        if: {
          type: 'object',
          properties: {
            type: { const: 'number' }
          },
          required: ['type']
        },
        then: {
          type: 'object',
          properties: {
            value: { type: 'number' }
          },
          required: ['value']
        }
      };

      assert.deepStrictEqual(
        await validateValue({ type: 'number', value: 42 }, schema),
        []
      );

      assert.deepStrictEqual(
        await validateValue({ type: 'number', value: 'not-number' }, schema),
        [createError(['value'], 'Value must be a number')]
      );
    });

    it('if/else conditions', async () => {
      const schema: JSONSchema = {
        type: 'object',
        if: {
          type: 'object',
          properties: {
            type: { const: 'number' }
          },
          required: ['type']
        },
        else: {
          type: 'object',
          properties: {
            value: { type: 'string' }
          },
          required: ['value']
        }
      };

      assert.deepStrictEqual(
        await validateValue({ type: 'string', value: 'test' }, schema),
        []
      );

      assert.deepStrictEqual(
        await validateValue({ type: 'string', value: 42 }, schema),
        [createError(['value'], 'Value must be a string')]
      );
    });
  });

  describe('composition', () => {
    it('allOf', async () => {
      const schema: JSONSchema = {
        allOf: [
          { type: 'number', minimum: 0 },
          { type: 'number', maximum: 100 }
        ]
      };

      assert.deepStrictEqual(await validateValue(50, schema), []);
      assert.deepStrictEqual(await validateValue(-1, schema), [
        createError([], 'Value must be >= 0')
      ]);
      assert.deepStrictEqual(await validateValue(101, schema), [
        createError([], 'Value must be <= 100')
      ]);
    });

    it('anyOf', async () => {
      const schema: JSONSchema = {
        anyOf: [
          { type: 'number' },
          { type: 'string' }
        ]
      };

      assert.deepStrictEqual(await validateValue(42, schema), []);
      assert.deepStrictEqual(await validateValue('test', schema), []);
      assert.deepStrictEqual(await validateValue(true, schema), [
        createError([], 'Value must match at least one schema in anyOf')
      ]);
    });

    it('oneOf', async () => {
      const schema: JSONSchema = {
        oneOf: [
          { type: 'number', minimum: 0 },
          { type: 'number', maximum: 0 }
        ]
      };

      assert.deepStrictEqual(await validateValue(1, schema), []);
      assert.deepStrictEqual(await validateValue(-1, schema), []);
      assert.deepStrictEqual(await validateValue(0, schema), [
        createError([], 'Value must match exactly one schema in oneOf')
      ]);
    });
  });
});
