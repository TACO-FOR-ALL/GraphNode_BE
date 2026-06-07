import type {
  AiMicroscopeIngestBundle,
  AiMicroscopeIngestResultItem,
} from '../dtos/ai_graph_output';

/** S3 다운로드 JSON 파싱 결과 — Mongo용 graphItems 와 Neo4j용 bundle 을 분리합니다. */
export interface ParsedMicroscopeS3Payload {
  /** ingest_bundle.json 객체 형식일 때만 존재 (Neo4j persist용) */
  bundle: AiMicroscopeIngestBundle | null;
  /** FE/Mongo graph payload 저장에 사용하는 standardized_graphs 배열 */
  graphItems: AiMicroscopeIngestResultItem[];
}

/**
 * @description S3에서 내려받은 Microscope JSON을 graph items와 ingest bundle로 분리합니다.
 * 레거시 배열 형식(standardized_graphs only)과 ingest_bundle 객체 형식을 모두 지원합니다.
 */
export function parseMicroscopeS3Payload(data: unknown): ParsedMicroscopeS3Payload {
  if (Array.isArray(data)) {
    return { bundle: null, graphItems: data as AiMicroscopeIngestResultItem[] };
  }

  if (data && typeof data === 'object' && 'standardized_graphs' in data) {
    const record = data as AiMicroscopeIngestBundle;
    const graphs = Array.isArray(record.standardized_graphs) ? record.standardized_graphs : [];
    return { bundle: { ...record, standardized_graphs: graphs }, graphItems: graphs };
  }

  return { bundle: null, graphItems: [] };
}

/**
 * @description ingest bundle에 Neo4j persist에 필요한 최소 필드가 있는지 검증합니다.
 */
export function isPersistableMicroscopeBundle(
  bundle: AiMicroscopeIngestBundle | null
): bundle is AiMicroscopeIngestBundle {
  if (!bundle) return false;
  return (
    typeof bundle.source_id === 'string' &&
    bundle.source_id.length > 0 &&
    typeof bundle.user_id === 'string' &&
    typeof bundle.group_id === 'string' &&
    Array.isArray(bundle.standardized_graphs) &&
    Array.isArray(bundle.chunks)
  );
}
