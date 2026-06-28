/**
 * Microscope (지식 그래프 파이프라인) 관련 Data Transfer Objects
 */

import {
  MicroscopeGraphEdgeDoc,
  MicroscopeGraphNodeDoc,
  MicroscopeBlockEdgeDoc,
  MicroscopeBlockItemDoc,
} from "../../core/types/persistence/microscope_workspace.persistence";

/** Block 뷰 단일 블록 — rawText를 선택적으로 포함합니다. */
export interface MicroscopeBlockItemDto extends MicroscopeBlockItemDoc {
  raw_text?: string;
}

/**
 * AI Block 뷰 전체 구조 DTO.
 * blockGraphS3Key 가 있을 경우 FE는 해당 키로 raw_text를 lazy load 할 수 있습니다.
 */
export interface MicroscopeBlockGraphDto {
  blocks: MicroscopeBlockItemDto[];
  edges: MicroscopeBlockEdgeDoc[];
  paths: string[][];
  ordering_rationale?: string;
}

/**
 * Microscope 워커가 생성한 그래프 데이터 DTO
 * @property nodes 그래프 노드 배열
 * @property edges 그래프 엣지 배열
 * @property blockView Block 뷰 데이터 (block SQS 처리 완료 후 제공)
 */
export interface MicroscopeGraphDataDto {
  nodes: MicroscopeGraphNodeDoc[];
  edges: MicroscopeGraphEdgeDoc[];
  blockView?: MicroscopeBlockGraphDto;
}
