import { describe, it, expect } from '@jest/globals';

import { buildMicroscopeVisualizationFromIngestResult } from '../../src/shared/utils/microscopeIngestResult';

describe('buildMicroscopeVisualizationFromIngestResult', () => {
  it('prefers standardized_s3_key (non-block mode)', () => {
    const out = buildMicroscopeVisualizationFromIngestResult({
      standardized_s3_key: 'results/microscope/ws/standardized.json',
      block_graph_s3_key: 'results/microscope/ws/block_graph.json',
    });

    expect(out).toEqual({
      outputMode: 'non_block',
      visualizationS3Key: 'results/microscope/ws/standardized.json',
      standardizedS3Key: 'results/microscope/ws/standardized.json',
      blockGraphS3Key: 'results/microscope/ws/block_graph.json',
      imagesS3Prefix: undefined,
    });
  });

  it('uses block_graph_s3_key when standardized is absent', () => {
    const out = buildMicroscopeVisualizationFromIngestResult({
      block_graph_s3_key: 'results/microscope/ws/block_graph.json',
      images_s3_prefix: 'results/microscope/ws/images/',
    });

    expect(out).toEqual({
      outputMode: 'block',
      visualizationS3Key: 'results/microscope/ws/block_graph.json',
      standardizedS3Key: undefined,
      blockGraphS3Key: 'results/microscope/ws/block_graph.json',
      imagesS3Prefix: 'results/microscope/ws/images/',
    });
  });

  it('returns undefined when no visualization keys', () => {
    expect(buildMicroscopeVisualizationFromIngestResult({ status: 'COMPLETED' })).toBeUndefined();
  });
});
