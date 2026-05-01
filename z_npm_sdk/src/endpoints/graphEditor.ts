/**
 * @module GraphEditorApi
 * @description 서버에 저장된 Neo4j 기반 macro graph를 직접 편집하는 SDK 엔드포인트입니다.
 *
 * 모든 메서드는 현재 로그인한 사용자 세션을 기준으로 `/v1/graph/editor` 하위 API를 호출합니다.
 * 노드와 서브클러스터는 반드시 하나의 클러스터에 속해야 하며, 노드를 서브클러스터에 넣을 때는
 * 양쪽의 `clusterId`가 일치해야 합니다.
 *
 * @public
 */

import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  CreateNodeEditorDto,
  UpdateNodeEditorDto,
  CreateNodeEditorResponseDto,
  CreateEdgeEditorDto,
  UpdateEdgeEditorDto,
  CreateEdgeEditorResponseDto,
  CreateClusterEditorDto,
  UpdateClusterEditorDto,
  CreateClusterEditorResponseDto,
  CreateSubclusterEditorDto,
  UpdateSubclusterEditorDto,
  CreateSubclusterEditorResponseDto,
  MoveNodeToClusterDto,
  MoveSubclusterToClusterDto,
  AddNodeToSubclusterDto,
  BatchEditorResponseDto,
} from '../types/graphEditor.js';

const BASE = '/v1/graph/editor';

/**
 * batch editor API에서 사용할 수 있는 작업 discriminated union입니다.
 */
export type BatchOperation =
  | { type: 'createNode'; payload: CreateNodeEditorDto }
  | { type: 'updateNode'; nodeId: number; payload: UpdateNodeEditorDto }
  | { type: 'deleteNode'; nodeId: number; permanent?: boolean }
  | { type: 'createEdge'; payload: CreateEdgeEditorDto }
  | { type: 'updateEdge'; edgeId: string; payload: UpdateEdgeEditorDto }
  | { type: 'deleteEdge'; edgeId: string; permanent?: boolean }
  | { type: 'createCluster'; payload: CreateClusterEditorDto }
  | { type: 'updateCluster'; clusterId: string; payload: UpdateClusterEditorDto }
  | { type: 'deleteCluster'; clusterId: string; cascade?: boolean; permanent?: boolean }
  | { type: 'createSubcluster'; payload: CreateSubclusterEditorDto }
  | { type: 'updateSubcluster'; subclusterId: string; payload: UpdateSubclusterEditorDto }
  | { type: 'deleteSubcluster'; subclusterId: string; permanent?: boolean }
  | { type: 'moveNodeToCluster'; nodeId: number; newClusterId: string }
  | { type: 'moveSubclusterToCluster'; subclusterId: string; newClusterId: string }
  | { type: 'addNodeToSubcluster'; subclusterId: string; nodeId: number }
  | { type: 'removeNodeFromSubcluster'; subclusterId: string; nodeId: number };

/**
 * Graph Editor API SDK client입니다.
 *
 * @example
 * ```ts
 * const { data } = await client.graphEditor.createCluster({ name: 'Research' });
 * await client.graphEditor.createNode({ label: 'Paper A', clusterId: data.cluster.id });
 * ```
 *
 * @public
 */
export class GraphEditorApi {
  constructor(private readonly rb: RequestBuilder) {}

  /**
   * 새 graph node를 생성합니다.
   *
   * @description
   * 노드 ID는 서버에서 자동 발급됩니다(`max(id) + 1`). 클라이언트가 ID를 직접 지정할 수 없습니다.
   * 생성된 노드는 지정한 `clusterId`의 클러스터에 즉시 소속됩니다(`BELONGS_TO` 관계 생성).
   * `metadata`에 `id`, `userId`, `createdAt` 키를 포함해도 서버에서 자동으로 제거됩니다.
   * `origId`는 서버가 `"editor:{userId}:{nodeId}"` 형식으로 자동 생성하며, 이를 통해
   * AI가 자동 생성한 노드와 사용자가 수동으로 생성한 노드를 구분합니다.
   *
   * @param body - `label`과 `clusterId`가 필수입니다. `sourceType`은 `'chat' | 'markdown' | 'notion'` 중 하나입니다.
   * @returns 생성된 `{ nodeId, node }`를 반환합니다.
   * @example
   * ```ts
   * const { data } = await client.graphEditor.createNode({
   *   label: 'Vector Search',
   *   clusterId: 'cluster-ai',
   *   sourceType: 'markdown',
   *   metadata: { priority: 'high' }
   * });
   * // data.nodeId: 서버가 발급한 숫자형 ID
   * // data.node: 생성된 노드 전체 DTO
   * ```
   * @remarks
   * - `201 Created`: 생성 성공
   * - `400 Bad Request`: label/clusterId 누락 또는 payload 검증 실패
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: 대상 cluster가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  createNode(body: CreateNodeEditorDto): Promise<HttpResponse<CreateNodeEditorResponseDto>> {
    return this.rb.path(`${BASE}/nodes`).post<CreateNodeEditorResponseDto>(body);
  }

  /**
   * graph node의 이름, 요약, sourceType, metadata 등을 수정합니다.
   *
   * @description
   * 제공한 필드만 부분 업데이트(PATCH)됩니다. 포함하지 않은 필드는 기존 값을 유지합니다.
   * 클러스터 이동은 이 메서드로 불가능하며, `moveNodeToCluster`를 사용해야 합니다.
   * `metadata`에 `id`, `userId`, `createdAt`을 포함하면 서버에서 자동으로 제거됩니다.
   *
   * @param nodeId - 수정할 node ID입니다.
   * @param body - 수정할 필드만 포함합니다. cluster 이동은 `moveNodeToCluster`를 사용합니다.
   * @example
   * ```ts
   * await client.graphEditor.updateNode(12, {
   *   label: 'Updated title',
   *   metadata: { reviewed: true }
   * });
   * ```
   * @remarks
   * - `204 No Content`: 수정 성공
   * - `400 Bad Request`: payload 검증 실패
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: node가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  updateNode(nodeId: number, body: UpdateNodeEditorDto): Promise<HttpResponse<void>> {
    return this.rb.path(`${BASE}/nodes/${nodeId}`).patch<void>(body);
  }

  /**
   * graph node를 삭제합니다.
   *
   * @description
   * **Soft delete(기본)**: 노드에 `deletedAt` 타임스탬프를 설정합니다. 해당 노드와 연결된
   * 모든 edge(MacroRelation)와 materialized 관계(MACRO_RELATED)도 자동으로 soft delete됩니다.
   * 추후 복원 가능합니다.
   *
   * **Hard delete(`permanent=true`)**: 노드를 물리적으로 제거합니다. 연결된 모든 edge와
   * materialized 관계도 함께 영구 삭제됩니다. 복원이 불가능합니다.
   *
   * 노드의 클러스터 소속(BELONGS_TO)과 서브클러스터 편입(CONTAINS) 관계도 삭제 시 함께 제거됩니다.
   *
   * @param nodeId - 삭제할 node ID입니다.
   * @param permanent - `true`이면 hard delete, 생략하거나 `false`이면 soft delete입니다.
   * @example
   * ```ts
   * await client.graphEditor.deleteNode(12);          // soft delete
   * await client.graphEditor.deleteNode(12, true);    // hard delete (복원 불가)
   * ```
   * @remarks
   * - `204 No Content`: 삭제 성공
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: node가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  deleteNode(nodeId: number, permanent?: boolean): Promise<HttpResponse<void>> {
    return this.rb.path(`${BASE}/nodes/${nodeId}`).query({ permanent }).delete<void>();
  }

  /**
   * 두 node 사이에 edge를 생성합니다.
   *
   * @description
   * `relationType`은 서버에서 UPPER_SNAKE_CASE로 자동 정규화됩니다
   * (공백·하이픈 → `_`, 소문자 → 대문자, 특수문자 제거).
   * 예: `"depends on"` → `"DEPENDS_ON"`, `"is-related"` → `"IS_RELATED"`.
   *
   * `relationType`을 생략하면 기본값 `"INSIGHT"`로 저장됩니다.
   *
   * `source`와 `target`이 동일 클러스터에 속하면 `intraCluster=true`로 자동 표시됩니다.
   *
   * **예약어 제한**: 시스템 내부 관계 타입은 사용자 정의 `relationType`으로 사용할 수 없습니다.
   * 예약어 목록: `BELONGS_TO`, `HAS_SUBCLUSTER`, `CONTAINS`, `REPRESENTS`,
   * `RELATES_SOURCE`, `RELATES_TARGET`, `MACRO_RELATED`,
   * `HAS_NODE`, `HAS_CLUSTER`, `HAS_RELATION`, `HAS_STATS`, `HAS_SUMMARY`
   *
   * `properties`에 `id`, `userId`, `createdAt`을 포함하면 서버에서 자동으로 제거됩니다.
   *
   * @param body - `source`, `target`은 필수입니다. `relationType`은 UPPER_SNAKE_CASE로 정규화되어 저장됩니다.
   * @returns 생성된 `{ edgeId, edge }`를 반환합니다.
   * @example
   * ```ts
   * const { data } = await client.graphEditor.createEdge({
   *   source: 1,
   *   target: 2,
   *   relationType: 'depends on',   // 서버에서 "DEPENDS_ON"으로 저장됨
   *   relation: 'Depends on',       // 표시용 레이블 (정규화 없이 그대로 저장)
   *   properties: { confidence: 0.87 }
   * });
   * ```
   * @remarks
   * - `201 Created`: 생성 성공
   * - `400 Bad Request`: source와 target이 같거나 relationType이 예약어임
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: source 또는 target node가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  createEdge(body: CreateEdgeEditorDto): Promise<HttpResponse<CreateEdgeEditorResponseDto>> {
    return this.rb.path(`${BASE}/edges`).post<CreateEdgeEditorResponseDto>(body);
  }

  /**
   * edge의 weight, relationType, relation, properties를 수정합니다.
   *
   * @description
   * 제공한 필드만 부분 업데이트됩니다. `relationType`을 수정하면 서버에서 UPPER_SNAKE_CASE로
   * 정규화되며, 예약어 검증도 동일하게 적용됩니다.
   * edge를 수정하면 Graph RAG traversal에 사용되는 materialized `MACRO_RELATED` 관계의
   * 속성(weight, relationType 등)도 자동으로 동기화됩니다.
   *
   * @param edgeId - 수정할 edge ID입니다.
   * @param body - 수정할 필드만 포함합니다.
   * @example
   * ```ts
   * await client.graphEditor.updateEdge('edge-id', {
   *   weight: 0.95,
   *   relationType: 'supports',
   *   relation: 'Supports'
   * });
   * ```
   * @remarks
   * - `204 No Content`: 수정 성공
   * - `400 Bad Request`: payload 검증 실패 또는 예약 relationType 사용
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: edge가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  updateEdge(edgeId: string, body: UpdateEdgeEditorDto): Promise<HttpResponse<void>> {
    return this.rb.path(`${BASE}/edges/${edgeId}`).patch<void>(body);
  }

  /**
   * edge를 삭제합니다.
   *
   * @description
   * **Soft delete(기본)**: edge의 `deletedAt` 타임스탬프를 설정합니다. Graph RAG traversal에
   * 사용되는 materialized `MACRO_RELATED` 관계도 함께 soft delete됩니다.
   *
   * **Hard delete(`permanent=true`)**: edge를 물리적으로 제거합니다. MacroRelation 노드와
   * RELATES_SOURCE/RELATES_TARGET 관계, MACRO_RELATED 관계가 모두 삭제됩니다.
   *
   * @param edgeId - 삭제할 edge ID입니다.
   * @param permanent - `true`이면 hard delete, 생략하거나 `false`이면 soft delete입니다.
   * @example
   * ```ts
   * await client.graphEditor.deleteEdge('edge-id');          // soft delete
   * await client.graphEditor.deleteEdge('edge-id', true);    // hard delete
   * ```
   * @remarks
   * - `204 No Content`: 삭제 성공
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: edge가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  deleteEdge(edgeId: string, permanent?: boolean): Promise<HttpResponse<void>> {
    return this.rb.path(`${BASE}/edges/${edgeId}`).query({ permanent }).delete<void>();
  }

  /**
   * 새 cluster를 생성합니다.
   *
   * @description
   * `id`를 직접 지정할 수 있습니다. 생략하면 서버가 UUID v4를 자동 생성합니다.
   * 지정한 `id`와 동일한 cluster가 이미 존재하면 `409 Conflict`가 반환됩니다.
   * cluster는 생성 직후 비어 있으며(`size=0`), 이후 `createNode`나 `moveNodeToCluster`로
   * 노드를 추가할 수 있습니다.
   *
   * @param body - `name`은 필수입니다. `id`를 생략하면 서버가 UUID를 생성합니다.
   * @returns 생성된 `{ cluster }`를 반환합니다.
   * @example
   * ```ts
   * const { data } = await client.graphEditor.createCluster({
   *   id: 'cluster-ai',      // 생략 시 UUID 자동 생성
   *   name: 'AI Research',
   *   themes: ['retrieval', 'graph']
   * });
   * ```
   * @remarks
   * - `201 Created`: 생성 성공
   * - `400 Bad Request`: name 누락 또는 payload 검증 실패
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `409 Conflict`: 같은 cluster id가 이미 존재함
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  createCluster(body: CreateClusterEditorDto): Promise<HttpResponse<CreateClusterEditorResponseDto>> {
    return this.rb.path(`${BASE}/clusters`).post<CreateClusterEditorResponseDto>(body);
  }

  /**
   * cluster의 이름, 설명, theme 목록을 수정합니다.
   *
   * @description
   * 제공한 필드만 부분 업데이트됩니다. cluster에 속한 노드 목록이나 소속 관계는
   * 이 메서드로 변경되지 않습니다. cluster id는 변경할 수 없습니다.
   *
   * @param clusterId - 수정할 cluster ID입니다.
   * @param body - 수정할 필드만 포함합니다.
   * @example
   * ```ts
   * await client.graphEditor.updateCluster('cluster-ai', {
   *   name: 'Applied AI',
   *   description: 'Production AI topics'
   * });
   * ```
   * @remarks
   * - `204 No Content`: 수정 성공
   * - `400 Bad Request`: payload 검증 실패
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: cluster가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  updateCluster(clusterId: string, body: UpdateClusterEditorDto): Promise<HttpResponse<void>> {
    return this.rb.path(`${BASE}/clusters/${clusterId}`).patch<void>(body);
  }

  /**
   * cluster를 삭제합니다.
   *
   * @description
   * **cascade 미지정(기본)**: cluster에 활성 노드가 하나라도 있으면 `409 Conflict`가 반환됩니다.
   * 노드를 모두 다른 클러스터로 이동하거나 삭제한 후 클러스터를 삭제해야 합니다.
   *
   * **`cascade=true`**: cluster 내 모든 활성 노드와 해당 노드들과 연결된 모든 edge를 먼저 삭제한 후
   * cluster를 삭제합니다. 이때 노드·edge 삭제는 `permanent` 옵션을 따릅니다.
   *
   * **Side Effects**: cluster를 삭제해도 해당 cluster에 속한 subcluster의 삭제는 포함되지 않습니다.
   * subcluster를 먼저 삭제하거나, cascade 후 subcluster를 별도로 정리해야 합니다.
   *
   * @param clusterId - 삭제할 cluster ID입니다.
   * @param opts - `cascade`가 `true`이면 포함 node와 관련 edge까지 삭제합니다. `permanent`는 hard delete 여부입니다.
   * @example
   * ```ts
   * // 빈 cluster 삭제
   * await client.graphEditor.deleteCluster('cluster-ai');
   *
   * // 노드가 있는 cluster를 모든 하위 데이터와 함께 삭제
   * await client.graphEditor.deleteCluster('cluster-ai', { cascade: true });
   *
   * // 노드, edge까지 물리적으로 영구 삭제
   * await client.graphEditor.deleteCluster('cluster-ai', { cascade: true, permanent: true });
   * ```
   * @remarks
   * - `204 No Content`: 삭제 성공
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: cluster가 없음
   * - `409 Conflict`: cascade 없이 삭제하려는 cluster에 활성 node가 있음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  deleteCluster(
    clusterId: string,
    opts?: { cascade?: boolean; permanent?: boolean }
  ): Promise<HttpResponse<void>> {
    return this.rb
      .path(`${BASE}/clusters/${clusterId}`)
      .query({ cascade: opts?.cascade, permanent: opts?.permanent })
      .delete<void>();
  }

  /**
   * 새 subcluster를 생성합니다.
   *
   * @description
   * subcluster는 반드시 특정 cluster에 속해야 하므로 `clusterId`가 필수입니다.
   * `id`를 직접 지정할 수 있으며, 생략하면 서버가 UUID v4를 자동 생성합니다.
   * 지정한 `id`와 동일한 subcluster가 이미 존재하면 `409 Conflict`가 반환됩니다.
   * 생성된 subcluster는 비어 있으며(`nodeIds=[]`), 이후 `addNodeToSubcluster`로 노드를 편입할 수 있습니다.
   *
   * @param body - `clusterId`는 필수입니다. `id`를 생략하면 서버가 UUID를 생성합니다.
   * @returns 생성된 `{ subcluster }`를 반환합니다.
   * @example
   * ```ts
   * const { data } = await client.graphEditor.createSubcluster({
   *   clusterId: 'cluster-ai',
   *   topKeywords: ['rag', 'neo4j'],
   *   density: 0.72
   * });
   * ```
   * @remarks
   * - `201 Created`: 생성 성공
   * - `400 Bad Request`: clusterId 누락 또는 payload 검증 실패
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: 대상 cluster가 없음
   * - `409 Conflict`: 같은 subcluster id가 이미 존재함
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  createSubcluster(
    body: CreateSubclusterEditorDto
  ): Promise<HttpResponse<CreateSubclusterEditorResponseDto>> {
    return this.rb.path(`${BASE}/subclusters`).post<CreateSubclusterEditorResponseDto>(body);
  }

  /**
   * subcluster의 keyword와 density를 수정합니다.
   *
   * @description
   * 제공한 필드만 부분 업데이트됩니다. subcluster에 속한 노드 목록이나
   * 클러스터 소속은 이 메서드로 변경되지 않습니다.
   *
   * @param subclusterId - 수정할 subcluster ID입니다.
   * @param body - 수정할 필드만 포함합니다.
   * @example
   * ```ts
   * await client.graphEditor.updateSubcluster('subcluster-id', {
   *   topKeywords: ['graph', 'editor']
   * });
   * ```
   * @remarks
   * - `204 No Content`: 수정 성공
   * - `400 Bad Request`: payload 검증 실패
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: subcluster가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  updateSubcluster(subclusterId: string, body: UpdateSubclusterEditorDto): Promise<HttpResponse<void>> {
    return this.rb.path(`${BASE}/subclusters/${subclusterId}`).patch<void>(body);
  }

  /**
   * subcluster를 삭제합니다.
   *
   * @description
   * subcluster를 삭제해도 subcluster에 속했던 노드들은 **클러스터에 잔류**합니다.
   * 삭제되는 것은 subcluster 노드와 `HAS_SUBCLUSTER`, `CONTAINS`, `REPRESENTS` 관계뿐이며,
   * 노드의 `BELONGS_TO` 관계는 그대로 유지됩니다.
   * 따라서 subcluster를 삭제해도 노드가 고아 상태가 되지 않습니다.
   *
   * @param subclusterId - 삭제할 subcluster ID입니다.
   * @param permanent - `true`이면 hard delete, 생략하거나 `false`이면 soft delete입니다.
   * @example
   * ```ts
   * await client.graphEditor.deleteSubcluster('subcluster-id');
   * // → subcluster만 삭제. 소속 노드들은 cluster에 잔류.
   * ```
   * @remarks
   * - `204 No Content`: 삭제 성공
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: subcluster가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  deleteSubcluster(subclusterId: string, permanent?: boolean): Promise<HttpResponse<void>> {
    return this.rb.path(`${BASE}/subclusters/${subclusterId}`).query({ permanent }).delete<void>();
  }

  /**
   * node를 다른 cluster로 이동합니다.
   *
   * @description
   * 노드의 클러스터 소속(`BELONGS_TO`)을 새 클러스터로 교체합니다.
   *
   * **자동 서브클러스터 탈퇴 (Side Effect)**:
   * 노드가 이전에 속했던 서브클러스터 중, 새 클러스터와 다른 클러스터에 속한 서브클러스터가 있으면
   * 해당 서브클러스터에서 자동으로 탈퇴됩니다(`CONTAINS` 관계 삭제).
   * 새 클러스터 소속의 서브클러스터 편입은 자동으로 이루어지지 않으며,
   * 별도로 `addNodeToSubcluster`를 호출해야 합니다.
   *
   * **불변 조건**: 노드는 항상 하나의 클러스터에 속해야 하며, 서브클러스터에 편입하려면
   * 노드와 서브클러스터의 `clusterId`가 일치해야 합니다. 이동 후 새 클러스터와 다른 클러스터의
   * 서브클러스터에 편입을 시도하면 `400 Bad Request`가 반환됩니다.
   *
   * @param nodeId - 이동할 node ID입니다.
   * @param body - 이동 대상 `newClusterId`입니다.
   * @example
   * ```ts
   * await client.graphEditor.moveNodeToCluster(12, { newClusterId: 'cluster-b' });
   * // Side Effect: node 12가 속한 cluster-a 소속 서브클러스터에서 자동 탈퇴
   * // 이후 cluster-b의 서브클러스터에 편입하려면 addNodeToSubcluster 별도 호출 필요
   * ```
   * @remarks
   * - `204 No Content`: 이동 성공
   * - `400 Bad Request`: newClusterId 누락
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: node 또는 대상 cluster가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  moveNodeToCluster(nodeId: number, body: MoveNodeToClusterDto): Promise<HttpResponse<void>> {
    return this.rb.path(`${BASE}/nodes/${nodeId}/move-cluster`).post<void>(body);
  }

  /**
   * subcluster를 다른 cluster로 이동합니다.
   *
   * @description
   * subcluster의 클러스터 소속(`HAS_SUBCLUSTER`)을 새 클러스터로 교체합니다.
   *
   * **Follower Move (Side Effect)**:
   * subcluster에 속한(`CONTAINS`) 모든 활성 노드의 클러스터 소속(`BELONGS_TO`)도
   * 새 클러스터로 자동 업데이트됩니다. 이 처리는 서버 내부에서 단일 쿼리로 원자적으로 실행되므로
   * subcluster와 소속 노드 간의 클러스터 불일치 상태가 발생하지 않습니다.
   * 클라이언트가 별도로 노드의 클러스터를 업데이트할 필요가 없습니다.
   *
   * **주의**: 이동 완료 후 새 클러스터에서 해당 노드들의 edge `intraCluster` 필드가 자동으로
   * 재계산되지 않습니다. edge의 `intraCluster` 여부를 UI에 표시한다면 이동 후 관련 edge 정보를
   * 다시 조회하는 것을 권장합니다.
   *
   * @param subclusterId - 이동할 subcluster ID입니다.
   * @param body - 이동 대상 `newClusterId`입니다.
   * @example
   * ```ts
   * await client.graphEditor.moveSubclusterToCluster('subcluster-id', {
   *   newClusterId: 'cluster-b'
   * });
   * // Side Effect: subcluster에 속한 모든 노드도 cluster-b로 자동 이동됨
   * ```
   * @remarks
   * - `204 No Content`: 이동 성공
   * - `400 Bad Request`: newClusterId 누락
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: subcluster 또는 대상 cluster가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  moveSubclusterToCluster(
    subclusterId: string,
    body: MoveSubclusterToClusterDto
  ): Promise<HttpResponse<void>> {
    return this.rb.path(`${BASE}/subclusters/${subclusterId}/move-cluster`).post<void>(body);
  }

  /**
   * node를 subcluster에 편입합니다.
   *
   * @description
   * 노드와 서브클러스터의 `clusterId`가 반드시 일치해야 합니다. 다른 클러스터에 속한 노드를
   * 서브클러스터에 편입하려고 하면 `400 Bad Request`가 반환됩니다.
   *
   * **올바른 사용 흐름**:
   * 1. 노드와 서브클러스터가 같은 클러스터에 있어야 합니다.
   * 2. 노드를 다른 클러스터로 이동한 후 서브클러스터에 편입하려면,
   *    먼저 `moveNodeToCluster`로 노드를 서브클러스터와 같은 클러스터로 이동한 뒤 호출해야 합니다.
   *
   * 이미 같은 서브클러스터에 편입된 노드를 다시 편입 요청하면 중복 처리 없이 성공합니다(MERGE 방식).
   *
   * @param subclusterId - 편입 대상 subcluster ID입니다.
   * @param body - 편입할 `nodeId`입니다.
   * @example
   * ```ts
   * // 올바른 예: 같은 clusterId를 가진 node와 subcluster
   * await client.graphEditor.addNodeToSubcluster('subcluster-id', { nodeId: 12 });
   *
   * // 잘못된 예: node가 다른 cluster에 있으면 400 에러
   * // → 먼저 moveNodeToCluster로 node를 subcluster의 cluster로 이동 후 편입
   * ```
   * @remarks
   * - `204 No Content`: 편입 성공
   * - `400 Bad Request`: node와 subcluster의 clusterId가 다르거나 payload 검증 실패
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: node 또는 subcluster가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  addNodeToSubcluster(
    subclusterId: string,
    body: AddNodeToSubclusterDto
  ): Promise<HttpResponse<void>> {
    return this.rb.path(`${BASE}/subclusters/${subclusterId}/nodes`).post<void>(body);
  }

  /**
   * node를 subcluster에서 제거합니다.
   *
   * @description
   * 서브클러스터와 노드 사이의 `CONTAINS` 관계만 삭제합니다.
   * 노드 자체는 삭제되지 않으며, 클러스터 소속(`BELONGS_TO`)도 유지됩니다.
   * 즉, 노드는 여전히 클러스터에 소속되어 있지만 서브클러스터에는 속하지 않는 상태가 됩니다.
   *
   * @param subclusterId - 제거 대상 subcluster ID입니다.
   * @param nodeId - 제거할 node ID입니다.
   * @example
   * ```ts
   * await client.graphEditor.removeNodeFromSubcluster('subcluster-id', 12);
   * // node 12는 cluster에는 여전히 소속됨. subcluster에서만 제거됨.
   * ```
   * @remarks
   * - `204 No Content`: 제거 성공
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: subcluster가 없음
   * - `502 Bad Gateway`: graph 저장소 처리 실패
   */
  removeNodeFromSubcluster(subclusterId: string, nodeId: number): Promise<HttpResponse<void>> {
    return this.rb.path(`${BASE}/subclusters/${subclusterId}/nodes/${nodeId}`).delete<void>();
  }

  /**
   * 여러 graph edit 작업을 순서대로 실행합니다.
   *
   * @description
   * 최대 100개의 작업을 순서대로 실행하고 각 작업의 결과를 배열로 반환합니다.
   *
   * **주의 — 부분 실패(Partial Failure)**:
   * 배치 작업은 진정한 ACID 트랜잭션이 아닙니다. 중간 operation이 실패하면 이미 완료된
   * 이전 작업들은 롤백되지 않습니다. 실패한 operation 이후의 작업도 실행되지 않습니다.
   * 중간 실패 시 응답은 `502 Bad Gateway`가 반환되며, 부분적으로 적용된 변경 사항은
   * 수동으로 정리해야 할 수 있습니다.
   *
   * **권장 사용 패턴**:
   * - 독립적이고 개별 실패해도 무방한 작업들을 묶어서 실행하는 경우에 적합합니다.
   * - 강한 일관성이 필요한 경우 개별 API 호출을 사용하고, 실패 시 보상 로직을 구현하세요.
   * - 작업 간 의존성이 있는 경우(예: createCluster 후 createNode 시 해당 clusterId 사용) 순서를
   *   반드시 지켜야 하며, 앞 작업 실패 시 뒤 작업도 실패합니다.
   *
   * **응답 구조**:
   * - `success`: 모든 작업이 성공했는지 여부
   * - `results`: 각 작업별 결과 (operationIndex, success, data?, error?)
   * - `processedCount`: 성공적으로 처리된 작업 수
   *
   * @param operations - 최대 100개 작업입니다. 각 항목은 `BatchOperation` union 중 하나여야 합니다.
   * @returns `{ success, results, processedCount }`를 반환합니다.
   * @example
   * ```ts
   * const { data } = await client.graphEditor.executeBatch([
   *   { type: 'createCluster', payload: { name: 'Batch Cluster' } },
   *   { type: 'createNode', payload: { label: 'Batch Node', clusterId: 'cluster-a' } },
   *   { type: 'moveNodeToCluster', nodeId: 5, newClusterId: 'cluster-b' }
   * ]);
   * // 첫 번째 작업 실패 시 두 번째, 세 번째 작업은 실행되지 않음
   * // data.results[0].success, data.results[0].data 로 각 작업 결과 확인
   * ```
   * @remarks
   * - `200 OK`: 모든 작업 처리 성공
   * - `400 Bad Request`: operations가 비어 있거나 100개 초과, 또는 payload 검증 실패
   * - `401 Unauthorized`: 로그인 세션 없음
   * - `404 Not Found`: 작업 중 참조 대상이 없음
   * - `409 Conflict`: 작업 중 비즈니스 충돌 발생
   * - `502 Bad Gateway`: 중간 operation 실패 또는 graph 저장소 처리 실패
   */
  executeBatch(operations: BatchOperation[]): Promise<HttpResponse<BatchEditorResponseDto>> {
    return this.rb.path(`${BASE}/transactions`).post<BatchEditorResponseDto>({ operations });
  }
}
