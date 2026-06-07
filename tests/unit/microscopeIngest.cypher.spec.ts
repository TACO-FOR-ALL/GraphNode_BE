import { describe, it, expect } from '@jest/globals';

import { MICROSCOPE_INGEST_CYPHER } from '../../src/infra/graph/cypher/microscopeIngest.cypher';

describe('MICROSCOPE_INGEST_CYPHER', () => {
  it('필수 ingest 쿼리 키가 모두 정의되어 있다', () => {
    expect(Object.keys(MICROSCOPE_INGEST_CYPHER).sort()).toEqual(
      ['linkEntityToChunk', 'mergeChunk', 'mergeEntity', 'mergeRelEdge'].sort()
    );
  });

  it('Entity MERGE 복합키(name, user_id, group_id)를 사용한다', () => {
    expect(MICROSCOPE_INGEST_CYPHER.mergeEntity).toContain(
      'MERGE (n:Entity {name: $name, user_id: $user_id, group_id: $group_id})'
    );
  });

  it('Chunk MERGE 복합키(uuid, user_id, group_id)를 사용한다', () => {
    expect(MICROSCOPE_INGEST_CYPHER.mergeChunk).toContain(
      'MERGE (c:Chunk {uuid: $uuid, user_id: $user_id, group_id: $group_id})'
    );
  });

  it('EXTRACTED_FROM 관계는 Entity name 과 Chunk uuid 로 연결한다', () => {
    expect(MICROSCOPE_INGEST_CYPHER.linkEntityToChunk).toContain('MERGE (e)-[:EXTRACTED_FROM]->(c)');
  });
});
