import type { JSONSchema, ResolveOptions, ValidationError } from '~/types';

export const createError = (path: string[], message: string): ValidationError => ({
  path,
  message
});

export const isObject = (value: any): value is Record<string, any> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const validateString = (
  value: any,
  schema: JSONSchema,
  path: string[]
): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (typeof value !== 'string') {
    return [createError(path, 'Value must be a string')];
  }

  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(createError(path, `String length must be >= ${schema.minLength}`));
  }

  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push(createError(path, `String length must be <= ${schema.maxLength}`));
  }

  if (schema.pattern !== undefined) {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(value)) {
      errors.push(createError(path, `String must match pattern: ${schema.pattern}`));
    }
  }

  if (schema.format) {
    const formatErrors = validateFormat(value, schema.format, path);
    errors.push(...formatErrors);
  }

  return errors;
};

export const validateFormat = (
  value: string,
  format: string,
  path: string[]
): ValidationError[] => {
  const errors: ValidationError[] = [];

  switch (format) {
    case 'date-time':
      if (isNaN(Date.parse(value))) {
        errors.push(createError(path, 'Invalid date-time format'));
      }
      break;
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        errors.push(createError(path, 'Invalid date format'));
      }
      break;
    case 'time':
      if (!/^\d{2}:\d{2}:\d{2}$/.test(value)) {
        errors.push(createError(path, 'Invalid time format'));
      }
      break;
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push(createError(path, 'Invalid email format'));
      }
      break;
    case 'ipv4':
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
        errors.push(createError(path, 'Invalid IPv4 format'));
      }
      break;
    case 'uuid':
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        errors.push(createError(path, 'Invalid UUID format'));
      }
      break;
    default: {
      break;
    }
  }

  return errors;
};

export const validateNumber = (
  value: any,
  schema: JSONSchema,
  path: string[]
): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (typeof value !== 'number') {
    return [createError(path, 'Value must be a number')];
  }

  if (schema.type === 'integer' && !Number.isInteger(value)) {
    errors.push(createError(path, 'Value must be an integer'));
  }

  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push(createError(path, `Value must be >= ${schema.minimum}`));
  }

  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push(createError(path, `Value must be <= ${schema.maximum}`));
  }

  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
    errors.push(createError(path, `Value must be > ${schema.exclusiveMinimum}`));
  }

  if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
    errors.push(createError(path, `Value must be < ${schema.exclusiveMaximum}`));
  }

  if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
    errors.push(createError(path, `Value must be multiple of ${schema.multipleOf}`));
  }

  return errors;
};

export const validateArray = async (
  value: any,
  schema: JSONSchema,
  options: ResolveOptions
): Promise<ValidationError[]> => {
  const errors: ValidationError[] = [];
  const path = options.currentPath || [];

  if (!Array.isArray(value)) {
    return [createError(path, 'Value must be an array')];
  }

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push(createError(path, `Array length must be >= ${schema.minItems}`));
  }

  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push(createError(path, `Array length must be <= ${schema.maxItems}`));
  }

  if (schema.uniqueItems === true) {
    const seen = new Set();
    for (let i = 0; i < value.length; i++) {
      const item = JSON.stringify(value[i]);
      if (seen.has(item)) {
        errors.push(createError([...path, i.toString()], 'Duplicate items not allowed'));
      }
      seen.add(item);
    }
  }

  if (schema.contains) {
    let containsValid = false;
    for (let i = 0; i < value.length; i++) {
      const itemErrors = await validateValue(value[i], schema.contains, {
        ...options,
        currentPath: [...path, i.toString()]
      });
      if (itemErrors.length === 0) {
        containsValid = true;
        break;
      }
    }
    if (!containsValid) {
      errors.push(createError(path, 'Array must contain at least one matching item'));
    }
  }

  if (schema.prefixItems) {
    for (let i = 0; i < schema.prefixItems.length && i < value.length; i++) {
      const itemErrors = await validateValue(value[i], schema.prefixItems[i], {
        ...options,
        currentPath: [...path, i.toString()]
      });
      errors.push(...itemErrors);
    }
  } else if (schema.items) {
    for (let i = 0; i < value.length; i++) {
      const itemErrors = await validateValue(value[i], schema.items, {
        ...options,
        currentPath: [...path, i.toString()]
      });
      errors.push(...itemErrors);
    }
  }

  return errors;
};

export const validateObject = async (
  value: any,
  schema: JSONSchema,
  options: ResolveOptions
): Promise<ValidationError[]> => {
  const errors: ValidationError[] = [];
  const path = options.currentPath || [];

  if (!isObject(value)) {
    return [createError(path, 'Value must be an object')];
  }

  if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
    errors.push(createError(path, `Object must have >= ${schema.minProperties} properties`));
  }

  if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) {
    errors.push(createError(path, `Object must have <= ${schema.maxProperties} properties`));
  }

  if (schema.required) {
    for (let i = 0; i < schema.required.length; i++) {
      const requiredProp = schema.required[i];
      if (!value.hasOwnProperty(requiredProp)) {
        errors.push(createError(path, `Missing required property: ${requiredProp}`));
      }
    }
  }

  if (schema.propertyNames) {
    for (const propName in value) {
      const nameErrors = await validateValue(propName, schema.propertyNames, {
        ...options,
        currentPath: [...path, propName]
      });
      errors.push(...nameErrors);
    }
  }

  const properties = schema.properties || {};
  for (const key in properties) {
    if (value.hasOwnProperty(key)) {
      const propErrors = await validateValue(value[key], properties[key], {
        ...options,
        currentPath: [...path, key]
      });
      errors.push(...propErrors);
    }
  }

  if (schema.patternProperties) {
    for (const pattern in schema.patternProperties) {
      const regex = new RegExp(pattern);
      for (const key in value) {
        if (regex.test(key)) {
          const patternErrors = await validateValue(value[key], schema.patternProperties[pattern], {
            ...options,
            currentPath: [...path, key]
          });
          errors.push(...patternErrors);
        }
      }
    }
  }

  return errors;
};

export const evaluateCondition = async (
  schema: JSONSchema,
  value: any,
  options: ResolveOptions
): Promise<boolean> => {
  // For nested property conditions (used in resolution)
  if (schema.properties && !options.skipPropertyCheck) {
    if (!value || typeof value !== 'object') {
      return false;
    }

    // Validate each property against its schema
    for (const [prop, condition] of Object.entries(schema.properties)) {
      if (condition.minimum !== undefined && (
        !value.hasOwnProperty(prop) ||
        value[prop] < condition.minimum
      )) {
        return false;
      }

      if (condition.maximum !== undefined && (
        !value.hasOwnProperty(prop) ||
        value[prop] > condition.maximum
      )) {
        return false;
      }

      const propValue = value[prop];
      const propErrors = await validateValue(propValue, condition, {
        ...options,
        skipValidation: true,
        skipConditional: true, // Prevent infinite recursion
        currentPath: [...options.currentPath || [], prop]
      });

      if (propErrors.length > 0) {
        return false;
      }
    }

    return true;
  }

  // For direct value validation
  const errors = await validateValue(value, schema, {
    ...options,
    skipValidation: true,
    skipConditional: true
  });

  return errors.length === 0;
};

// eslint-disable-next-line complexity
export const validateValue = async (
  value: any,
  schema: JSONSchema,
  options: ResolveOptions = {}
): Promise<ValidationError[]> => {
  const errors: ValidationError[] = [];
  const path = options.currentPath || [];

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(createError(path, `Value must be ${schema.const}`));
    return errors;
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(createError(path, `Value must be one of: ${schema.enum.join(', ')}`));
    return errors;
  }

  if (schema.if && !options.skipConditional) {
    const satisfied = await evaluateCondition(schema.if, value, {
      ...options,
      skipPropertyCheck: false // Use direct value validation for conditions
    });

    if (satisfied && schema.then) {
      const thenErrors = await validateValue(value, schema.then, options);
      errors.push(...thenErrors);
    }

    if (!satisfied && schema.else) {
      const elseErrors = await validateValue(value, schema.else, options);
      errors.push(...elseErrors);
    }
  }

  if (schema.allOf) {
    for (let i = 0; i < schema.allOf.length; i++) {
      const subErrors = await validateValue(value, schema.allOf[i], options);
      errors.push(...subErrors);
    }
  }

  if (schema.anyOf) {
    const anyOfErrors: ValidationError[][] = [];
    for (let i = 0; i < schema.anyOf.length; i++) {
      const subErrors = await validateValue(value, schema.anyOf[i], options);
      anyOfErrors.push(subErrors);
      if (subErrors.length === 0) {
        break;
      }
    }
    if (!anyOfErrors.some(errs => errs.length === 0)) {
      errors.push(createError(path, 'Value must match at least one schema in anyOf'));
    }
  }

  if (schema.oneOf) {
    const oneOfErrors: ValidationError[][] = [];
    let validCount = 0;

    for (let i = 0; i < schema.oneOf.length; i++) {
      const subErrors = await validateValue(value, schema.oneOf[i], options);
      oneOfErrors.push(subErrors);

      if (subErrors.length === 0) {
        validCount++;
      }
    }

    if (validCount !== 1) {
      errors.push(createError(path, 'Value must match exactly one schema in oneOf'));
    }
  }

  // Type-specific validation
  if (schema.type) {
    switch (schema.type) {
      case 'string':
        errors.push(...validateString(value, schema, path));
        break;
      case 'number':
      case 'integer':
        errors.push(...validateNumber(value, schema, path));
        break;
      case 'array':
        errors.push(...await validateArray(value, schema, options));
        break;
      case 'object':
        errors.push(...await validateObject(value, schema, options));
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(createError(path, 'Value must be a boolean'));
        }
        break;
      case 'null':
        if (value !== null) {
          errors.push(createError(path, 'Value must be null'));
        }
        break;
      default: {
        break;
      }
    }
  }

  return errors;
};
