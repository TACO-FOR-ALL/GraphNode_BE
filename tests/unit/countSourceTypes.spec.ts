import { countSourceTypesFromNodeList } from '../../src/workers/utils/countSourceTypes';
import type { GraphNodeDto } from '../../src/shared/dtos/graph';

const baseFileNode = {
  userId: 'u1',
  label: 'file',
  summary: '',
  clusterId: 'c1',
  clusterName: 'Cluster',
  timestamp: null,
  numMessages: 0,
} satisfies Omit<GraphNodeDto, 'id' | 'origId' | 'sourceType' | 'metadata'>;

describe('countSourceTypesFromNodeList', () => {
  it('maps unknown file macroFileType to file_counts_by_extension.other', () => {
    const nodes: GraphNodeDto[] = [
      {
        ...baseFileNode,
        id: 1,
        origId: 'uf-unknown',
        sourceType: 'file',
        metadata: {
          mimeType: 'application/octet-stream',
          macroFileType: 'other',
        },
      },
    ];

    const counts = countSourceTypesFromNodeList(nodes);
    expect(counts.fileCount).toBe(1);
    expect(counts.fileCountsByExtension.other).toBe(1);
  });

  it('prefers ai_raw_source_type over macroFileType for extension bucket', () => {
    const nodes: GraphNodeDto[] = [
      {
        ...baseFileNode,
        id: 2,
        origId: 'uf-pdf',
        sourceType: 'file',
        metadata: {
          ai_raw_source_type: 'pdf',
          macroFileType: 'pdf',
          mimeType: 'application/pdf',
        },
      },
    ];

    const counts = countSourceTypesFromNodeList(nodes);
    expect(counts.fileCountsByExtension.pdf).toBe(1);
    expect(counts.fileCountsByExtension.other).toBeUndefined();
  });
});
