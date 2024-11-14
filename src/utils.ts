import type { JSONSchema } from '~/types';
import { schemaProps } from '~/schema-props';
import util from 'node:util';

export const inspect = v => util.inspect(v, { depth: null, colors: true, maxArrayLength: null });

export const isPrimitive = (v): boolean => Object(v) !== v;

export const isObject = (v: any): v is Record<string, any> => {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
};

export const isComposition = (schema: JSONSchema): boolean => {
  return schema.allOf || schema.anyOf || schema.oneOf || schema.not;
};

export const getSegments = (
  input: string,
  options: {
    language?: string;
    granularity?: 'grapheme' | 'word' | 'sentence' | 'line',
    localeMatcher: 'lookup' | 'best fit'
  } = {}
): Intl.SegmentData[] => {
  const { language, granularity = 'grapheme', ...opts } = options;
  const segmenter = new Intl.Segmenter(language, { granularity, ...opts });
  return Array.from(segmenter.segment(input));
};

export const getValueType = (value: any, types: string | string[]): string | undefined => {
  const typeArr = Array.isArray(types) ? types : [types];
  if (value === null && typeArr.includes('null')) return 'null';
  if (Array.isArray(value) && typeArr.includes('array')) return 'array';
  if (isObject(value) && typeArr.includes('object')) return 'object';
  if (typeof value === 'boolean' && typeArr.includes('boolean')) return 'boolean';
  if (typeof value === 'string' && typeArr.includes('string')) return 'string';
  if (typeof value === 'number' && typeArr.includes('number')) return 'number';
  if (typeof value === 'number' && typeArr.includes('integer')) return 'integer';
  return undefined;
};

export const filterProps = (schema: JSONSchema, valueType: string) => {
  const typeProps = new Set(schemaProps[valueType]);
  const filtered = { ...schema };

  for (const key of Object.keys(schema)) {
    if (!schemaProps.base.includes(key) && !typeProps.has(key)) {
      delete filtered[key];
    }
  }

  return filtered;
};

export const isValidValueType = (value: any, type: string): boolean => {
  if (Array.isArray(type)) {
    return type.some(t => isValidValueType(value, t));
  }

  switch (type) {
    case 'null': return value === null;
    case 'array': return Array.isArray(value);
    case 'object': return isObject(value);
    case 'boolean': return typeof value === 'boolean';
    case 'number': return typeof value === 'number';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'string': return typeof value === 'string';
    default: return false;
  }
};
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export function deepAssign<T extends JsonValue>(target: T, ...sources: T[]): T {
  // Handle null, undefined, or primitive values
  if (target === null || typeof target !== 'object') {
    return sources.length ? sources[sources.length - 1] as T : target;
  }

  // Handle arrays
  if (Array.isArray(target)) {
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      if (Array.isArray(source)) {
        const result = [...target] as unknown as T;
        for (let j = 0; j < source.length; j++) {
          if (j < target.length) {
            (result as any)[j] = deepAssign(target[j], source[j]);
          } else {
            (result as any)[j] = source[j];
          }
        }
        target = result;
      }
    }
    return target;
  }

  // Handle objects
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (source === null || typeof source !== 'object') {
      continue;
    }

    const keys = Object.keys(source);
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      const targetValue = (target as any)[key];
      const sourceValue = (source as any)[key];

      if (targetValue === null || typeof targetValue !== 'object') {
        (target as any)[key] = sourceValue;
      } else {
        (target as any)[key] = deepAssign(targetValue, sourceValue);
      }
    }
  }

  return target;
}

export const isEmpty = (value: any, omitZero: boolean = false): boolean => {
  if (value == null) return true;
  if (value === '') return true;

  const seen = new Set();

  const walk = (v: any): boolean => {
    if (!isPrimitive(v) && seen.has(v)) {
      return true;
    }

    if (v == null) return true;
    if (v === '') return true;
    if (Number.isNaN(v)) return true;

    if (typeof v === 'number') {
      return omitZero ? v === 0 : false;
    }

    if (v instanceof RegExp) {
      return v.source === '';
    }

    if (v instanceof Error) {
      return v.message === '';
    }

    if (v instanceof Date) {
      return false;
    }

    if (Array.isArray(v)) {
      seen.add(v);

      for (const e of v) {
        if (!isEmpty(e, omitZero)) {
          return false;
        }
      }
      return true;
    }

    if (isObject(v)) {
      seen.add(v);

      if (typeof v.size === 'number') {
        return v.size === 0;
      }

      for (const k of Object.keys(v)) {
        if (!isEmpty(v[k], omitZero)) {
          return false;
        }
      }

      return true;
    }

    return false;
  };

  return walk(value);
};
