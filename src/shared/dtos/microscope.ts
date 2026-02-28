/**
 * Microscope (지식 그래프 파이프라인) 관련 Data Transfer Objects
 */

import { MicroscopeGraphEdgeDoc, MicroscopeGraphNodeDoc } from "../../core/types/persistence/microscope_workspace.persistence";

/**
 * Microscope 워커가 생성한 그래프 노드 DTO
 * @property id 노드 고유 식별자
 * @property name 노드 이름


/**
 * Microscope 워커가 생성한 그래프 데이터 DTO
 * @property nodes 그래프 노드 배열
 * @property edges 그래프 엣지 배열
 */
export interface MicroscopeGraphDataDto {
  nodes: MicroscopeGraphNodeDoc[];
  edges: MicroscopeGraphEdgeDoc[];
}
