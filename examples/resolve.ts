import util from 'node:util';
import { resolveValues } from '~/resolve';
import type { JSONSchema } from '~/types';

const inspect = (obj: any) => util.inspect(obj, { depth: null, colors: true });

async function runExample() {
  // Example 1: Basic type validation
  console.log('\n=== Example 1: Number type validation ===');
  const numberSchema: JSONSchema = {
    type: 'number',
    minimum: 0,
    maximum: 100
  };

  console.log('Testing with string input:');
  let result = await resolveValues(numberSchema, 'not a number');
  console.log(inspect(result));

  console.log('\nTesting with valid number:');
  result = await resolveValues(numberSchema, 50);
  console.log(inspect(result));

  console.log('\nTesting with out of range number:');
  result = await resolveValues(numberSchema, 150);
  console.log(inspect(result));

  // Example 2: Object validation
  console.log('\n=== Example 2: Object validation ===');
  const userSchema: JSONSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      age: { type: 'number' }
    },
    required: ['name', 'age']
  };

  console.log('Testing with invalid types:');
  result = await resolveValues(userSchema, {
    name: 123,
    age: 'invalid'
  });
  console.log(inspect(result));

  // Example 2: Object validation
  console.log('\n=== Example 3: Object validation ===');
  const nestedSchema: JSONSchema = {
    type: 'object',
    properties: {
      person: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          age: { type: 'number' }
        },
        required: ['name', 'age']
      }
    },
    required: ['person']
  };

  console.log('Testing with invalid types:');
  result = await resolveValues(nestedSchema, {
    person: {
      name: 123,
      age: 'invalid'
    }
  });

  console.log(inspect(result));
}

runExample();
