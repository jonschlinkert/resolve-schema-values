export interface JSONSchema {
  // Basic
  type?: string;
  enum?: any[];
  const?: any;
  default?: any;

  // String validation
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  contentEncoding?: string;
  contentMediaType?: string;

  // Number validation
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Array validation
  items?: JSONSchema;
  prefixItems?: JSONSchema[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  contains?: JSONSchema;
  minContains?: number;
  maxContains?: number;

  // Object validation
  properties?: Record<string, JSONSchema>;
  required?: string[];
  minProperties?: number;
  maxProperties?: number;
  additionalProperties?: boolean | JSONSchema;
  patternProperties?: Record<string, JSONSchema>;
  propertyNames?: JSONSchema;
  dependentSchemas?: Record<string, JSONSchema>;
  dependentRequired?: Record<string, string[]>;

  // Conditional
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;

  // Composition
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
}

export interface ResolveOptions {
  skipValidation?: boolean;
  currentPath?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  message: string;
  path?: string[];
}

export interface Success<T> {
  ok: true;
  value: T;
  parent: any;
  key?: string;
}

export interface Failure {
  ok: false;
  errors: ValidationError[];
  parent: any;
  key?: string;
}

export type Result<T> = Success<T> | Failure;
