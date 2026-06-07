import { describe, it, expect } from '@jest/globals';

import type { AiMicroscopeIngestBundle } from '../../src/shared/dtos/ai_graph_output';
import { buildMicroscopeIngestPlan } from '../../src/shared/utils/buildMicroscopeIngestPlan';

describe('buildMicroscopeIngestPlan', () => {
  const baseBundle: AiMicroscopeIngestBundle = {
    standardized_graphs: [
      {
        nodes: [
          {
            name: 'GraphNode',
            type: 'Tool',
            description: 'A graph app',
            source_chunk_id: 0,
          },
        ],
        edges: [
          {
            start: 'GraphNode',
            target: 'Neo4j',
            type: 'uses',
            description: 'stores graph',
            confidence: 0.8,
          },
        ],
      },
    ],
    source_id: 'src-1',
    source_name: 'note.md',
    user_id: 'user-1',
    group_id: 'group-1',
    chunk_id_map: { '0': 'chunk-uuid-0' },
    chunks: [{ uuid: 'chunk-uuid-0', chunk_index: 0, text: 'hello world' }],
  };

  it('ingest_bundle 에서 entity, chunk, edge, link plan 을 생성한다', () => {
    const plan = buildMicroscopeIngestPlan(baseBundle);

    expect(plan.sourceId).toBe('src-1');
    expect(plan.userId).toBe('user-1');
    expect(plan.groupId).toBe('group-1');
    expect(plan.chunks).toHaveLength(1);
    expect(plan.chunks[0].uuid).toBe('chunk-uuid-0');
    expect(plan.entities).toHaveLength(1);
    expect(plan.entities[0].name).toBe('GraphNode');
    expect(plan.entities[0].types).toEqual(['Tool']);
    expect(plan.edges).toHaveLength(1);
    expect(plan.edges[0].weight).toBe(0.8);
    expect(plan.chunkEntityLinks).toEqual([
      { entityName: 'GraphNode', chunkUuid: 'chunk-uuid-0' },
    ]);
  });

  it('여러 배치에 걸친 동일 name 엔티티의 types 와 description 을 병합한다', () => {
    const bundle: AiMicroscopeIngestBundle = {
      ...baseBundle,
      standardized_graphs: [
        {
          nodes: [
            { name: 'X', type: 'A', description: 'first', source_chunk_id: 0 },
          ],
          edges: [],
        },
        {
          nodes: [
            { name: 'X', type: 'B', description: 'second', source_chunk_id: 0 },
          ],
          edges: [],
        },
      ],
    };

    const plan = buildMicroscopeIngestPlan(bundle);
    expect(plan.entities).toHaveLength(1);
    expect(plan.entities[0].types).toEqual(['A', 'B']);
    expect(plan.entities[0].description).toBe('first | second');
  });

  it('source_chunk_id 가 없거나 매핑되지 않으면 chunkEntityLinks 에 포함하지 않는다', () => {
    const bundle: AiMicroscopeIngestBundle = {
      ...baseBundle,
      standardized_graphs: [
        {
          nodes: [
            { name: 'Orphan', type: 'T', description: 'd', source_chunk_id: null },
            { name: 'BadIdx', type: 'T', description: 'd', source_chunk_id: 99 },
          ],
          edges: [],
        },
      ],
    };

    const plan = buildMicroscopeIngestPlan(bundle);
    expect(plan.entities).toHaveLength(2);
    expect(plan.chunkEntityLinks).toHaveLength(0);
  });

  it('Chunk text 는 Neo4j 저장 규칙에 맞게 500자로 자른다', () => {
    const bundle: AiMicroscopeIngestBundle = {
      ...baseBundle,
      chunks: [{ uuid: 'c1', chunk_index: 0, text: '가'.repeat(600) }],
    };

    const plan = buildMicroscopeIngestPlan(bundle);
    expect(plan.chunks[0].text).toHaveLength(500);
  });
});
