# resolve-schema-values [![NPM version](https://img.shields.io/npm/v/resolve-schema-values.svg?style=flat)](https://www.npmjs.com/package/resolve-schema-values) [![NPM monthly downloads](https://img.shields.io/npm/dm/resolve-schema-values.svg?style=flat)](https://npmjs.org/package/resolve-schema-values) [![NPM total downloads](https://img.shields.io/npm/dt/resolve-schema-values.svg?style=flat)](https://npmjs.org/package/resolve-schema-values)

> Resolve values based on a JSON schema. Supports conditionals and composition. Useful for configuration, preferences, LLM chat completions, etc.

Please consider following this project's author, [Jon Schlinkert](https://github.com/jonschlinkert), and consider starring the project to show your :heart: and support.

## Install

Install with [npm](https://www.npmjs.com/):

```sh
$ npm install --save resolve-schema-values
```

## What is this?

A JSON Schema resolver and validator that transforms and verifies data based on a provided JSON Schema. It combines value resolution (providing defaults, handling conditionals, and managing complex compositions) with strict validation (enforcing types, formats, and constraints) to ensure data consistency and correctness.

**Why another JSON Schema library?**

This library focuses on resolution of data, versus validation only. You can use any validation library, then use this one to resolve values.

Note that this library is not a full JSON Schema validator and _does not resolve $refs_, but rather a _value resolver_ that can be used in conjunction with a validator to provide a more complete solution.

## Usage and Examples

```js
import { resolveValues } from 'resolve-schema-values';

const schema = {
  type: 'object',
  properties: {
    username: {
      type: 'string',
      default: 'jonschlinkert'
    },
    company: {
      type: 'string'
    }
  }
};

const data = { company: 'Sellside' };
const result = await resolveValues(schema, data);
console.log(result.value); // { username: 'jonschlinkert', company: 'Sellside' }
```

**Conditional Schema Resolution**

```ts
const schema = {
  type: 'object',
  properties: {
    userType: { type: 'string' }
  },
  if: {
    properties: { userType: { const: 'business' } }
  },
  then: {
    properties: {
      taxId: { type: 'string', default: 'REQUIRED' },
      employees: { type: 'number', default: 0 }
    }
  },
  else: {
    properties: {
      personalId: { type: 'string', default: 'REQUIRED' }
    }
  }
};

const data = { userType: 'business' };
const result = await resolveValues(schema, data);
console.log(result.value);
// {
//   userType: 'business',
//   taxId: 'REQUIRED',
//   employees: 0
// }
```

**Composition with allOf**

```ts
const schema = {
  type: 'object',
  allOf: [
    {
      properties: {
        name: { type: 'string', default: 'Unnamed' }
      }
    },
    {
      properties: {
        age: { type: 'number', default: 0 }
      }
    }
  ]
};

const data = {};
const result = await resolveValues(schema, data);
console.log(result.value); // { name: 'Unnamed', age: 0 }
```

**Pattern Properties**

```ts
const schema = {
  type: 'object',
  patternProperties: {
    '^field\\d+$': {
      type: 'string',
      default: 'empty'
    }
  }
};

const data = {
  field1: undefined,
  field2: undefined,
  otherField: undefined
};

const result = await resolveValues(schema, data);
console.log(result.value);
// {
//   field1: 'empty',
//   field2: 'empty',
//   otherField: undefined
// }
```

**Dependent Schemas**

```ts
const schema = {
  type: 'object',
  properties: {
    creditCard: { type: 'string' }
  },
  dependentSchemas: {
    creditCard: {
      properties: {
        billingAddress: { type: 'string', default: 'REQUIRED' },
        securityCode: { type: 'string', default: 'REQUIRED' }
      }
    }
  }
};

const data = { creditCard: '1234-5678-9012-3456' };
const result = await resolveValues(schema, data);
console.log(result.value);
// {
//   creditCard: '1234-5678-9012-3456',
//   billingAddress: 'REQUIRED',
//   securityCode: 'REQUIRED'
// }
```

**Array Items Resolution**

```ts
const schema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'number' },
      status: { type: 'string', default: 'pending' }
    }
  }
};

const data = [
  { id: 1 },
  { id: 2 },
  { id: 3 }
];
const result = await resolveValues(schema, data);
console.log(result.value);
// [
//   { id: 1, status: 'pending' },
//   { id: 2, status: 'pending' },
//   { id: 3, status: 'pending' }
// ]
```

**OneOf with Type Validation**

```ts
const schema = {
  type: 'object',
  properties: {
    value: {
      oneOf: [
        { type: 'number' },
        { type: 'string', pattern: '^\\d+$' }
      ],
      default: 0
    }
  }
};

const data = { value: '123' };
const result = await resolveValues(schema, data);
console.log(result.value);
// { value: '123' }  // Validates as it matches the string pattern

const invalidData = { value: 'abc' };
const invalidResult = await resolveValues(schema, invalidData);
if (!invalidResult.ok) {
  console.log('Validation failed:', invalidResult.errors);
} else {
  console.log(invalidResult.value);
  // { value: 0 }  // Falls back to default as it matches neither schema
}
```

**Additional Properties with Schema**

```ts
const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' }
  },
  additionalProperties: {
    type: 'string',
    default: 'additional'
  }
};

const data = {
  name: 'John',
  customField1: undefined,
  customField2: undefined
};
const result = await resolveValues(schema, data);
console.log(result.value);
// {
//   name: 'John',
//   customField1: 'additional',
//   customField2: 'additional'
// }
```

## About

<details>
<summary><strong>Contributing</strong></summary>

Pull requests and stars are always welcome. For bugs and feature requests, [please create an issue](../../issues/new).

</details>

<details>
<summary><strong>Running Tests</strong></summary>

Running and reviewing unit tests is a great way to get familiarized with a library and its API. You can install dependencies and run tests with the following command:

```sh
$ npm install && npm test
```

</details>

<details>
<summary><strong>Building docs</strong></summary>

_(This project's readme.md is generated by [verb](https://github.com/verbose/verb-generate-readme), please don't edit the readme directly. Any changes to the readme must be made in the [.verb.md](.verb.md) readme template.)_

To generate the readme, run the following command:

```sh
$ npm install -g verbose/verb#dev verb-generate-readme && verb
```

</details>

### Related projects

You might also be interested in these projects:

* [clone-deep](https://www.npmjs.com/package/clone-deep): Recursively (deep) clone JavaScript native types, like Object, Array, RegExp, Date as well as primitives. | [homepage](https://github.com/jonschlinkert/clone-deep "Recursively (deep) clone JavaScript native types, like Object, Array, RegExp, Date as well as primitives.")
* [kind-of](https://www.npmjs.com/package/kind-of): Get the native type of a value. | [homepage](https://github.com/jonschlinkert/kind-of "Get the native type of a value.")

### Author

**Jon Schlinkert**

* [GitHub Profile](https://github.com/jonschlinkert)
* [Twitter Profile](https://twitter.com/jonschlinkert)
* [LinkedIn Profile](https://linkedin.com/in/jonschlinkert)

### License

Copyright © 2024, [Jon Schlinkert](https://github.com/jonschlinkert).
Released under the MIT License.

***

_This file was generated by [verb-generate-readme](https://github.com/verbose/verb-generate-readme), v0.8.0, on November 02, 2024._
