export const schemaProps = {
  base: [
    'type',
    'title',
    'description',
    'default',
    'examples',
    'deprecated',
    'readOnly',
    'writeOnly',
    '$id',
    '$schema',
    '$ref',
    'definitions',
    'enum',
    'const',
    'allOf',
    'anyOf',
    'oneOf',
    'not',
    'if',
    'then',
    'else'
  ],

  string: [
    'maxLength',
    'minLength',
    'pattern',
    'format',
    'contentMediaType',
    'contentEncoding'
  ],

  number: [
    'multipleOf',
    'maximum',
    'exclusiveMaximum',
    'minimum',
    'exclusiveMinimum'
  ],

  integer: [
    'multipleOf',
    'maximum',
    'exclusiveMaximum',
    'minimum',
    'exclusiveMinimum'
  ],

  array: [
    'items',
    'additionalItems',
    'maxItems',
    'minItems',
    'uniqueItems',
    'contains',
    'maxContains',
    'minContains'
  ],

  object: [
    'maxProperties',
    'minProperties',
    'required',
    'properties',
    'patternProperties',
    'additionalProperties',
    'dependencies',
    'propertyNames'
  ],

  boolean: [],

  null: []
} as const;
