import { describe, it, expect } from '@jest/globals';

import { mapGraphClustersForAiAddNode } from '../../src/shared/utils/mapGraphClustersForAiAddNode';
import type { GraphClusterDto } from '../../src/shared/dtos/graph';

describe('mapGraphClustersForAiAddNode', () => {
  it('maps only AI contract fields and caps themes to 3', () => {
    const clusters: GraphClusterDto[] = [
      {
        id: 'c1',
        userId: 'user-1',
        name: 'Topic',
        description: 'desc',
        size: 4,
        themes: ['a', 'b', 'c', 'd', 'e'],
        label: 'ignored',
        summary: 'ignored',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    expect(mapGraphClustersForAiAddNode(clusters)).toEqual([
      {
        id: 'c1',
        name: 'Topic',
        description: 'desc',
        size: 4,
        themes: ['a', 'b', 'c'],
      },
    ]);
  });
});
