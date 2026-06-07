import { randomUUID } from 'crypto';

import type { AiMicroscopeIngestBundle } from '../dtos/ai_graph_output';

/** Neo4j Entity MERGE에 사용할 집계된 엔티티 계획 */
export interface MicroscopeIngestEntityPlan {
  name: string;
  types: string[];
  description: string;
  chunkIds: string[];
}

/** Neo4j REL MERGE에 사용할 관계 계획 */
export interface MicroscopeIngestEdgePlan {
  start: string;
  target: string;
  type: string;
  weight: number;
}

/**
 * AI ingest_bundle → Neo4j 단일 transaction write에 필요한 실행 계획.
 * graphnode_repository.py 의 entity/edge 집계 로직과 동일한 결과를 만듭니다.
 */
export interface MicroscopeIngestPlan {
  userId: string;
  groupId: string;
  sourceId: string;
  chunks: Array<{
    uuid: string;
    text: string;
    chunk_index: number;
  }>;
  entities: MicroscopeIngestEntityPlan[];
  edges: MicroscopeIngestEdgePlan[];
  /** Entity.name ↔ Chunk.uuid EXTRACTED_FROM 연결 목록 */
  chunkEntityLinks: Array<{ entityName: string; chunkUuid: string }>;
}

/** 노드의 source_chunk_id(인덱스)를 정수 청크 인덱스로 정규화합니다. */
function resolveChunkIndex(sourceChunkId: unknown): number | null {
  if (sourceChunkId === null || sourceChunkId === undefined) return null;
  if (typeof sourceChunkId === 'number' && Number.isInteger(sourceChunkId)) return sourceChunkId;
  if (typeof sourceChunkId === 'string' && sourceChunkId.trim() !== '' && /^\d+$/.test(sourceChunkId)) {
    return parseInt(sourceChunkId, 10);
  }
  return null;
}

/**
 * AI ingest_bundle을 Neo4j write plan으로 변환합니다.
 *
 * 처리 순서:
 * 1. chunk_id_map + chunks 배열로 청크 인덱스 → UUID 매핑 구성
 * 2. standardized_graphs 노드의 source_chunk_id로 entity↔chunk 연결 맵 생성
 * 3. 동일 name 엔티티 types/description 병합
 * 4. Chunk / Entity / EXTRACTED_FROM / REL 저장에 필요한 plan 반환
 */
export function buildMicroscopeIngestPlan(bundle: AiMicroscopeIngestBundle): MicroscopeIngestPlan {
  const userId = bundle.user_id;
  const groupId = bundle.group_id;
  const sourceId = bundle.source_id;

  const chunkIndexToId = new Map<number, string>();
  for (const [idxStr, uuid] of Object.entries(bundle.chunk_id_map ?? {})) {
    const idx = parseInt(idxStr, 10);
    if (!Number.isNaN(idx) && uuid) {
      chunkIndexToId.set(idx, uuid);
    }
  }
  for (const chunk of bundle.chunks ?? []) {
    chunkIndexToId.set(chunk.chunk_index, chunk.uuid);
  }

  const entityChunkMap = new Map<string, string[]>();
  for (const batch of bundle.standardized_graphs) {
    for (const node of batch.nodes ?? []) {
      const name = node.name?.trim();
      if (!name) continue;
      const chunkIdx = resolveChunkIndex(node.source_chunk_id);
      if (chunkIdx === null || !chunkIndexToId.has(chunkIdx)) continue;
      const chunkUuid = chunkIndexToId.get(chunkIdx)!;
      const list = entityChunkMap.get(name) ?? [];
      if (!list.includes(chunkUuid)) {
        list.push(chunkUuid);
        entityChunkMap.set(name, list);
      }
    }
  }

  const entityMap = new Map<string, MicroscopeIngestEntityPlan>();
  const edges: MicroscopeIngestEdgePlan[] = [];

  for (const batch of bundle.standardized_graphs) {
    for (const node of batch.nodes ?? []) {
      const name = node.name?.trim();
      if (!name) continue;
      let entry = entityMap.get(name);
      if (!entry) {
        entry = {
          name,
          types: [],
          description: '',
          chunkIds: entityChunkMap.get(name) ?? [],
        };
        entityMap.set(name, entry);
      }
      const rawType = node.type;
      const types = Array.isArray(rawType)
        ? rawType
        : typeof rawType === 'string' && rawType
          ? [rawType]
          : [];
      for (const t of types) {
        if (t && !entry.types.includes(t)) {
          entry.types.push(t);
        }
      }
      const desc = node.description?.trim();
      if (desc) {
        entry.description = entry.description ? `${entry.description} | ${desc}` : desc;
      }
    }

    for (const edge of batch.edges ?? []) {
      const start = edge.start?.trim();
      const target = edge.target?.trim();
      const etype = edge.type?.trim();
      if (!start || !target || !etype) continue;
      edges.push({
        start,
        target,
        type: etype,
        weight: typeof edge.confidence === 'number' ? edge.confidence : 1.0,
      });
    }
  }

  const chunkEntityLinks: Array<{ entityName: string; chunkUuid: string }> = [];
  for (const [entityName, chunkIds] of entityChunkMap.entries()) {
    for (const chunkUuid of chunkIds) {
      chunkEntityLinks.push({ entityName, chunkUuid });
    }
  }

  // AI Neo4j handler 와 동일하게 Chunk.text 는 500자로 truncate
  const chunks = (bundle.chunks ?? []).map((c) => ({
    uuid: c.uuid,
    text: (c.text ?? '').slice(0, 500),
    chunk_index: c.chunk_index,
  }));

  return {
    userId,
    groupId,
    sourceId,
    chunks,
    entities: Array.from(entityMap.values()),
    edges,
    chunkEntityLinks,
  };
}

/** @description Neo4j ON CREATE용 entity/edge uuid 생성 */
export function newMicroscopeNeo4jUuid(): string {
  return randomUUID();
}
