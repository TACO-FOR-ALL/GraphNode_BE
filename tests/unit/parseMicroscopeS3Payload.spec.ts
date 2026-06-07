import { describe, it, expect } from '@jest/globals';

import {
  isPersistableMicroscopeBundle,
  parseMicroscopeS3Payload,
} from '../../src/shared/utils/parseMicroscopeS3Payload';

describe('parseMicroscopeS3Payload', () => {
  it('레거시 배열 형식(standardized_graphs only)을 graphItems 로 파싱한다', () => {
    const result = parseMicroscopeS3Payload([{ nodes: [], edges: [] }]);
    expect(result.bundle).toBeNull();
    expect(result.graphItems).toHaveLength(1);
  });

  it('ingest_bundle 객체 형식을 bundle 과 graphItems 로 동시에 파싱한다', () => {
    const result = parseMicroscopeS3Payload({
      standardized_graphs: [{ nodes: [], edges: [] }],
      source_id: 's1',
      source_name: 'a.md',
      user_id: 'u1',
      group_id: 'g1',
      chunk_id_map: {},
      chunks: [],
    });
    expect(result.bundle?.source_id).toBe('s1');
    expect(result.graphItems).toHaveLength(1);
    expect(isPersistableMicroscopeBundle(result.bundle)).toBe(true);
  });

  it('알 수 없는 객체는 빈 결과를 반환한다', () => {
    const result = parseMicroscopeS3Payload({ foo: 'bar' });
    expect(result.bundle).toBeNull();
    expect(result.graphItems).toEqual([]);
  });

  it('null/undefined 는 빈 graphItems 를 반환한다', () => {
    expect(parseMicroscopeS3Payload(null).graphItems).toEqual([]);
    expect(parseMicroscopeS3Payload(undefined).graphItems).toEqual([]);
  });
});

describe('isPersistableMicroscopeBundle', () => {
  it('필수 필드가 없으면 false 를 반환한다', () => {
    expect(isPersistableMicroscopeBundle(null)).toBe(false);
    expect(isPersistableMicroscopeBundle({ standardized_graphs: [] } as never)).toBe(false);
    expect(
      isPersistableMicroscopeBundle({
        standardized_graphs: [],
        source_id: '',
        user_id: 'u',
        group_id: 'g',
        chunks: [],
      } as never)
    ).toBe(false);
  });
});
