import { describe, it, expect } from '@jest/globals';
import { augmentAddNodeBatchWithUserFiles } from '../../src/workers/utils/augmentAddNodeBatchWithUserFiles';
import type { AiAddNodeBatchResult } from '../../src/shared/dtos/ai_graph_output';

describe('augmentAddNodeBatchWithUserFiles', () => {
  const baseBatch: AiAddNodeBatchResult = {
    userId: 'user-1',
    processedCount: 1,
    results: [
      {
        conversationId: 'conv-1',
        nodes: [
          {
            id: 'user-1_conv-1',
            userId: 'user-1',
            origId: 'conv-1',
            clusterId: 'c1',
            clusterName: 'Cluster',
          },
        ],
        edges: [],
      },
    ],
  };

  it('returns batch unchanged when no files in request', () => {
    const out = augmentAddNodeBatchWithUserFiles(baseBatch, {
      userId: 'user-1',
      existingClusters: [],
    });
    expect(out).toBe(baseBatch);
  });

  it('adds synthetic file result when AI omitted a requested user file', () => {
    const out = augmentAddNodeBatchWithUserFiles(baseBatch, {
      userId: 'user-1',
      existingClusters: [{ id: 'c1', userId: 'user-1', name: 'Cluster', description: '', size: 1, themes: [] }],
      files: [
        {
          fileId: 'uf-pdf',
          title: 'report.pdf',
          s3Key: 'user-files/user-1/uf-pdf.pdf',
          mimeType: 'application/pdf',
        },
      ],
    });

    expect(out.results).toHaveLength(2);
    const fileItem = out.results.find((r) => r.fileId === 'uf-pdf');
    expect(fileItem?.nodes[0]?.origId).toBe('uf-pdf');
    expect(fileItem?.nodes[0]?.numSections).toBe(1);
    expect(out.processedCount).toBe(2);
  });

  it('does not duplicate when AI already returned the file node', () => {
    const withFile: AiAddNodeBatchResult = {
      ...baseBatch,
      results: [
        ...baseBatch.results,
        {
          fileId: 'uf-pdf',
          nodes: [
            {
              id: 'user-1_uf-pdf',
              userId: 'user-1',
              origId: 'uf-pdf',
              clusterId: 'c1',
              clusterName: 'Cluster',
              numSections: 2,
            },
          ],
          edges: [],
        },
      ],
    };

    const out = augmentAddNodeBatchWithUserFiles(withFile, {
      userId: 'user-1',
      existingClusters: [],
      files: [
        {
          fileId: 'uf-pdf',
          title: 'report.pdf',
          s3Key: 'user-files/user-1/uf-pdf.pdf',
          mimeType: 'application/pdf',
        },
      ],
    });

    expect(out.results.filter((r) => r.fileId === 'uf-pdf')).toHaveLength(1);
  });
});
