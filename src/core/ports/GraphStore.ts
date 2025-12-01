/**
 * 모듈: GraphStore Port (그래프 저장소 인터페이스)
 * 
 * 책임:
 * - 그래프 데이터(노드, 엣지, 클러스터)의 영속성(Persistence)을 담당하는 인터페이스입니다.
 * - 서비스 계층은 이 인터페이스를 통해 그래프 데이터를 저장하고 조회합니다.
 */

import { ClientSession } from 'mongodb';

import type { GraphNodeDoc, GraphEdgeDoc, GraphClusterDoc, GraphStatsDoc } from '../types/persistence/graph.persistence';

/**
 * 저장소 옵션 인터페이스
 * 
 * 트랜잭션 처리를 위한 세션 객체를 포함할 수 있습니다.
 */
export interface RepoOptions {
  session?: ClientSession;
}

/**
 * GraphStore 인터페이스
 * 
 * 그래프 관련 모든 데이터 조작(CRUD) 메서드를 정의합니다.
 * 아키텍처 규칙에 따라 DB 전용 타입(*Doc)을 사용합니다.
 */
export interface GraphStore {
  // --- 노드(Node) 관련 메서드 ---
  
  /** 노드 생성 또는 업데이트 (Upsert) 
   * @param node
   * @param options
   * 
  */
  upsertNode(node: GraphNodeDoc, options?: RepoOptions): Promise<void>;
  
  /** 노드 정보 부분 업데이트 */
  updateNode(userId: string, nodeId: number, patch: Partial<GraphNodeDoc>, options?: RepoOptions): Promise<void>;
  
  /** 노드 삭제 */
  deleteNode(userId: string, nodeId: number, options?: RepoOptions): Promise<void>;
  
  /** 여러 노드 일괄 삭제 */
  deleteNodes(userId: string, nodeIds: number[], options?: RepoOptions): Promise<void>;
  
  /** 노드 단건 조회 */
  findNode(userId: string, nodeId: number): Promise<GraphNodeDoc | null>;
  
  /** 전체 노드 목록 조회 */
  listNodes(userId: string): Promise<GraphNodeDoc[]>;
  
  /** 특정 클러스터에 속한 노드 목록 조회 */
  listNodesByCluster(userId: string, clusterId: string): Promise<GraphNodeDoc[]>;

  // --- 엣지(Edge) 관련 메서드 ---

  /** 엣지 생성 또는 업데이트 (Upsert) */
  upsertEdge(edge: GraphEdgeDoc, options?: RepoOptions): Promise<string>;
  
  /** 엣지 삭제 */
  deleteEdge(userId: string, edgeId: string, options?: RepoOptions): Promise<void>;
  
  /** 두 노드 사이의 엣지 삭제 */
  deleteEdgeBetween(userId: string, source: number, target: number, options?: RepoOptions): Promise<void>;
  
  /** 특정 노드들과 연결된 모든 엣지 삭제 */
  deleteEdgesByNodeIds(userId: string, nodeIds: number[], options?: RepoOptions): Promise<void>;
  
  /** 전체 엣지 목록 조회 */
  listEdges(userId: string): Promise<GraphEdgeDoc[]>;

  // --- 클러스터(Cluster) 관련 메서드 ---

  /** 클러스터 생성 또는 업데이트 */
  upsertCluster(cluster: GraphClusterDoc, options?: RepoOptions): Promise<void>;
  
  /** 클러스터 삭제 */
  deleteCluster(userId: string, clusterId: string, options?: RepoOptions): Promise<void>;
  
  /** 클러스터 단건 조회 */
  findCluster(userId: string, clusterId: string): Promise<GraphClusterDoc | null>;
  
  /** 전체 클러스터 목록 조회 */
  listClusters(userId: string): Promise<GraphClusterDoc[]>;

  // --- 통계(Stats) 관련 메서드 ---

  /** 그래프 통계 저장 */
  saveStats(stats: GraphStatsDoc, options?: RepoOptions): Promise<void>;
  
  /** 그래프 통계 조회 */
  getStats(userId: string): Promise<GraphStatsDoc | null>;
  
  /** 그래프 통계 삭제 */
  deleteStats(userId: string, options?: RepoOptions): Promise<void>;
}
