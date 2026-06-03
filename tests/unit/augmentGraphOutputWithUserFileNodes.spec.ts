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
        _id: '01KT1AJS0YPC4C3805641TKH5E', // Missing file
        ownerUserId: 'user-12345',
        folderId: null,
        displayName: 'e2e-macro-sample.pdf',
        s3Key: 'user-files/user-12345/01KT1AJS0YPC4C3805641TKH5E.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        category: 'pdf',
        summaryStatus: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    expect(out.nodes).toHaveLength(2);
    expect(out.nodes.map((n) => n.orig_id).sort()).toEqual(['01KT1AJS0YPC4C3805641TKH5E', 'uf-e2e-docx']);
    expect(out.metadata.total_nodes).toBe(2);
    expect(out.nodes[1]?.id).toBe(1);
  });

  it('prevents duplication when AI outputs a strange format containing ULID', () => {
    const graphWithStrangeId = {
      ...baseGraph(),
      nodes: [
        {
          id: 0,
          orig_id: 'strange_01KT1AJS0YPC4C3805641TKH5E_no_ext',
          cluster_id: 'cluster_1',
          cluster_name: 'Docs',
          keywords: [],
          top_keywords: [],
          timestamp: '2026-01-01T00:00:00.000Z',
          num_sections: 1,
          source_type: 'file',
        },
      ],
    };

    const out = augmentGraphOutputWithUserFileNodes(graphWithStrangeId, [
      {
        _id: '01KT1AJS0YPC4C3805641TKH5E',
        ownerUserId: 'user-12345',
        folderId: null,
        displayName: 'e2e-macro-sample.pdf',
        s3Key: 'user-files/user-12345/01KT1AJS0YPC4C3805641TKH5E.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        category: 'pdf',
        summaryStatus: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Should NOT duplicate, because the ULID was extracted from the strange orig_id
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0].orig_id).toBe('strange_01KT1AJS0YPC4C3805641TKH5E_no_ext');
    expect(out.metadata.total_nodes).toBe(1);
  });
});
