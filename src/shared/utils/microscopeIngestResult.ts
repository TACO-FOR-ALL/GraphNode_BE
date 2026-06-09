import type { MicroscopeDocumentVisualizationMeta } from '../../core/types/persistence/microscope_workspace.persistence';

/**
 * @description AI Microscope ingest 결과 SQS payload에서 FE 시각화용 S3 키 메타를 추출합니다.
 * @param payload AI → Worker 결과 payload (snake_case).
 * @returns visualization S3 키 스냅샷. 키가 없으면 undefined.
 */
export function buildMicroscopeVisualizationFromIngestResult(
  payload: Record<string, unknown>
): MicroscopeDocumentVisualizationMeta | undefined {
  const standardized =
    typeof payload.standardized_s3_key === 'string' ? payload.standardized_s3_key.trim() : '';
  const block =
    typeof payload.block_graph_s3_key === 'string' ? payload.block_graph_s3_key.trim() : '';
  const imagesRaw =
    typeof payload.images_s3_prefix === 'string'
      ? payload.images_s3_prefix
      : typeof payload.images_s3_key === 'string'
        ? payload.images_s3_key
        : '';
  const images = imagesRaw.trim();

  if (!standardized && !block) {
    return undefined;
  }

  const outputMode = standardized ? ('non_block' as const) : ('block' as const);
  const visualizationS3Key = standardized || block;

  return {
    outputMode,
    visualizationS3Key,
    standardizedS3Key: standardized || undefined,
    blockGraphS3Key: block || undefined,
    imagesS3Prefix: images || undefined,
  };
}
