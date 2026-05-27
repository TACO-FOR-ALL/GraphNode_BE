import type { AiGraphOutputDto } from '../../src/shared/dtos/ai_graph_output';
import { augmentGraphOutputWithUserFileNodes } from '../../src/workers/utils/augmentGraphOutputWithUserFileNodes';

const baseGraph = (): AiGraphOutputDto => ({
  nodes: [
    {
      id: 0,
      orig_id: 'uf-e2e-docx',
      cluster_id: 'cluster_1',
      cluster_name: 'Docs',
      keywords: [],
      top_keywords: [],
      timestamp: '2026-01-01T00:00:00.000Z',
      num_sections: 1,
      source_type: 'file',
    },
  ],
  edges: [],
  subclusters: [],
  metadata: {
    generated_at: '2026-01-01T00:00:00.000Z',
    total_nodes: 1,
    total_edges: 0,
    total_clusters: 1,
    clusters: {},
  },
});

describe('augmentGraphOutputWithUserFileNodes', () => {
  it('adds MacroNodes for active user_files missing from AI output', () => {
    const out = augmentGraphOutputWithUserFileNodes(baseGraph(), [
      {
        _id: 'uf-e2e-docx',
        ownerUserId: 'user-12345',
        folderId: null,
        displayName: 'e2e-macro-sample.docx',
        s3Key: 'user-files/user-12345/uf-e2e-docx.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 100,
        category: 'word',
        summaryStatus: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: 'uf-e2e-pdf',
        ownerUserId: 'user-12345',
        folderId: null,
        displayName: 'e2e-macro-sample.pdf',
        s3Key: 'user-files/user-12345/uf-e2e-pdf.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        category: 'pdf',
        summaryStatus: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    expect(out.nodes).toHaveLength(2);
    expect(out.nodes.map((n) => n.orig_id).sort()).toEqual(['uf-e2e-docx', 'uf-e2e-pdf']);
    expect(out.metadata.total_nodes).toBe(2);
    expect(out.nodes[1]?.id).toBe(1);
  });
});
