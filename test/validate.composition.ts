import type { JSONSchema } from '~/types';
import assert from 'node:assert';
import { validateValue } from '~/validate';

describe('schema composition', () => {
  describe('property exclusion', () => {
    it('should enforce mutually exclusive properties via not/required', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' }
        },
        allOf: [
          { not: { required: ['a', 'b'] } }
        ]
      };

      const errorsOneProperty = await validateValue({ a: 'test' }, schema);
      assert.strictEqual(errorsOneProperty.length, 0);

      const errorsBothProperties = await validateValue({ a: 'test', b: 'test' }, schema);
      assert.ok(errorsBothProperties.length > 0);
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
          { required: ['b'] },
          { required: ['c'] }
        ]
      };

      const errorsOneProperty = await validateValue({ b: 'test' }, schema);
      assert.strictEqual(errorsOneProperty.length, 0);

      const errorsTwoProperties = await validateValue({ a: 'test', b: 'test' }, schema);
      assert.ok(errorsTwoProperties.length > 0);

      const errorsNoProperties = await validateValue({}, schema);
      assert.ok(errorsNoProperties.length > 0);
    });
  });

  describe('conditional requirements', () => {
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

      const errors = await validateValue({ type: 'normal' }, schema);
      assert.strictEqual(errors.length, 0);

      // Missing required format when value is present
      const errors2 = await validateValue({ type: 'special', value: 'test' }, schema);
      console.log(errors2);
      assert.ok(errors2.length > 0);
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

      const errorsValidString = await validateValue('valid', schema);
      assert.strictEqual(errorsValidString.length, 0);

      const errorsValidNumber = await validateValue(15, schema);
      assert.strictEqual(errorsValidNumber.length, 0);

      const errorsShortString = await validateValue('hi', schema);
      assert.ok(errorsShortString.length > 0);

      const errorsLargeNumber = await validateValue(25, schema);
      assert.ok(errorsLargeNumber.length > 0);
    });
  });
});
