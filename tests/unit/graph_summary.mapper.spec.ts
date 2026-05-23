import { describe, it, expect } from '@jest/globals';
import type { GraphSummaryDoc } from '../../src/core/types/persistence/graph.persistence';
import {
  createEmptyGraphSummaryDto,
  toGraphSummaryDto,
} from '../../src/shared/mappers/graph_summary.mapper';

describe('graph_summary.mapper', () => {
  it('toGraphSummaryDto passes total_files and file_counts_by_extension from doc overview', () => {
    const doc: GraphSummaryDoc = {
      id: 'summary-1',
      userId: 'user-1',
      overview: {
        total_source_nodes: 6,
        total_conversations: 1,
        total_notes: 1,
        total_notions: 0,
        total_files: 4,
        file_counts_by_extension: { pdf: 1, docx: 1, pptx: 1, other: 1 },
        time_span: 'N/A',
        primary_interests: [],
        conversation_style: '',
        most_active_period: '',
        summary_text: 'ok',
      },
      clusters: [],
      patterns: [],
      connections: [],
      recommendations: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
      detail_level: 'standard',
    };

    const dto = toGraphSummaryDto(doc);

    expect(dto.overview.total_files).toBe(4);
    expect(dto.overview.file_counts_by_extension).toEqual({
      pdf: 1,
      docx: 1,
      pptx: 1,
      other: 1,
    });
  });

  it('createEmptyGraphSummaryDto includes total_files default', () => {
    const dto = createEmptyGraphSummaryDto();
    expect(dto.overview.total_files).toBe(0);
  });
});
