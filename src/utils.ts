import type { JSONSchema } from '~/types';
import { schemaProps } from '~/schema-props';

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
