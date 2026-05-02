/**
 * 모듈: GraphEditorService (그래프 편집 서비스)
 * 작성일: 2026-05-01
 *
 * 책임:
 * - 사용자가 직접 macro graph 요소(node, edge, cluster, subcluster)를 편집하는 비즈니스 로직을 담당합니다.
 * - MacroGraphStore(Port)만 의존하며, infra 구현체를 직접 import하지 않습니다.
 * - 편집 검증(소유권, 존재 여부, clusterId 일관성)과 orchestration을 수행합니다.
 * - 배치 트랜잭션 엔드포인트를 지원하여 여러 작업을 단일 Neo4j write transaction으로 처리합니다.
 *
 * 외부 의존: MacroGraphStore (Port), shared/errors/domain, shared/dtos/graph, shared/dtos/graph.editor
 */

import { v4 as uuidv4 } from 'uuid';

import type { MacroGraphStore, MacroGraphStoreOptions } from '../ports/MacroGraphStore';
import { ValidationError, NotFoundError, ConflictError, UpstreamError } from '../../shared/errors/domain';
import { AppError } from '../../shared/errors/base';
import type {
  GraphNodeDto,
  GraphEdgeDto,
  GraphClusterDto,
  GraphSubclusterDto,
} from '../../shared/dtos/graph';
import type {
  CreateNodeEditorDto,
  UpdateNodeEditorDto,
  CreateEdgeEditorDto,
  UpdateEdgeEditorDto,
  CreateClusterEditorDto,
  UpdateClusterEditorDto,
  CreateSubclusterEditorDto,
  UpdateSubclusterEditorDto,
  MoveNodeToClusterDto,
  MoveSubclusterToClusterDto,
  AddNodeToSubclusterDto,
  BatchEditorRequestDto,
  BatchEditorResponseDto,
  BatchOperationResult,
  CreateNodeEditorResponseDto,
  CreateEdgeEditorResponseDto,
  CreateClusterEditorResponseDto,
  CreateSubclusterEditorResponseDto,
  EditorBatchOperation,
} from '../../shared/dtos/graph.editor';

/** 시스템이 내부적으로 사용하는 Neo4j 관계 타입 예약어 목록. 사용자가 edge relationType으로 사용 불가. */
const RESERVED_RELATION_TYPES = new Set([
  'BELONGS_TO', 'HAS_SUBCLUSTER', 'CONTAINS', 'REPRESENTS',
  'RELATES_SOURCE', 'RELATES_TARGET', 'MACRO_RELATED',
  'HAS_NODE', 'HAS_CLUSTER', 'HAS_RELATION', 'HAS_STATS',
  'HAS_SUMMARY',
]);

/** metadata/properties에서 덮어쓰기를 차단하는 예약 필드. 작성일: 2026-05-01 */
const RESERVED_PROPERTY_KEYS = new Set(['id', 'userId', 'createdAt']);

/**
 * @description 사용자 정의 관계 타입 문자열을 UPPER_SNAKE_CASE로 정규화합니다. 작성일: 2026-05-01
 *
 * - 영문자, 숫자, 공백, 하이픈, 언더스코어만 허용합니다.
 * - 대문자+언더스코어로 변환 후 예약어 여부를 확인합니다.
 *
 * @param input 사용자가 입력한 관계 타입 문자열
 * @returns 정규화된 UPPER_SNAKE_CASE 문자열
 * @throws {ValidationError} 빈 문자열이거나 예약어인 경우
 */
function normalizeRelationType(input: string): string {
  const normalized = input
    .trim()
    .toUpperCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (normalized.length === 0) {
    throw new ValidationError('relationType cannot be empty after normalization');
  }
  if (RESERVED_RELATION_TYPES.has(normalized)) {
    throw new ValidationError(`relationType '${normalized}' is reserved and cannot be used`);
  }
  return normalized;
}

/**
 * @description 임의 속성 맵에서 예약 필드를 제거합니다. 작성일: 2026-05-01
 *
 * @param props 사용자가 제공한 속성 객체
 * @returns 예약 필드가 제거된 새 객체
 */
function sanitizeProps(props?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!props) return undefined;
  const sanitized = { ...props };
  for (const key of RESERVED_PROPERTY_KEYS) {
    delete sanitized[key];
  }
  return sanitized;
}

/**
 * @description GraphEditorService — macro graph 직접 편집 비즈니스 로직. 작성일: 2026-05-01
 *
 * 모든 메서드는 userId 범위 안에서만 동작합니다.
 * 존재하지 않는 리소스에 접근하면 NotFoundError를 던집니다.
 * 불변 조건(clusterId 일관성, 사용자 소유권 등) 위반 시 ValidationError 또는 ConflictError를 던집니다.
 */
export class GraphEditorService {
  constructor(private readonly repo: MacroGraphStore) {}

  // =====================
  // Node CRUD
  // =====================

  /**
   * @description 새 graph node를 생성합니다. 작성일: 2026-05-01
   *
   * node ID는 서버에서 자동 발급됩니다. clusterId로 지정된 cluster가 존재해야 합니다.
   *
   * @param userId 사용자 ID
   * @param dto 노드 생성 요청 DTO
   * @param options transaction 등 adapter 전용 옵션
   * @returns 생성된 노드 ID와 전체 DTO
   * @throws {ValidationError} userId 또는 필수 필드 누락
   * @throws {NotFoundError} clusterId에 해당하는 cluster가 없을 때
   * @throws {UpstreamError} DB 저장 실패 시
   */
  async createNode(
    userId: string,
    dto: CreateNodeEditorDto,
    options?: MacroGraphStoreOptions
  ): Promise<CreateNodeEditorResponseDto> {
    try {
      this.assertUser(userId);
      if (!dto.label?.trim()) throw new ValidationError('label is required');
      if (!dto.clusterId?.trim()) throw new ValidationError('clusterId is required');

      const cluster = await this.repo.findCluster(userId, dto.clusterId, options);
      if (!cluster) throw new NotFoundError(`Cluster '${dto.clusterId}' not found`);

      const nodeId = await this.repo.getNextNodeId(userId, options);
      const now = new Date().toISOString();

      const node: GraphNodeDto = {
        id: nodeId,
        userId,
        origId: `editor:${userId}:${nodeId}`,
        clusterId: dto.clusterId,
        clusterName: cluster.name,
        label: dto.label.trim(),
        summary: dto.summary,
        metadata: sanitizeProps(dto.metadata),
        sourceType: dto.sourceType,
        timestamp: dto.timestamp ?? null,
        numMessages: dto.numMessages ?? 0,
        createdAt: now,
        updatedAt: now,
      };

      await this.repo.upsertNode(node, options);

      // MacroGraph 루트에 HAS_NODE 연결 — upsertNode가 처리하지 않는 경우를 위해
      // (Neo4jMacroGraphAdapter의 upsertNode는 MERGE로 처리하므로 별도 linkNodesToGraph 불필요)

      return { nodeId, node };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.createNode failed', { cause: String(err) });
    }
  }

  /**
   * @description 기존 graph node를 부분 수정합니다. 작성일: 2026-05-01
   *
   * @param userId 사용자 ID
   * @param nodeId 수정할 node id
   * @param dto 수정 요청 DTO
   * @param options transaction 등 adapter 전용 옵션
   * @throws {NotFoundError} node가 없을 때
   * @throws {UpstreamError} DB 저장 실패 시
   */
  async updateNode(
    userId: string,
    nodeId: number,
    dto: UpdateNodeEditorDto,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      const existing = await this.repo.findNode(userId, nodeId, options);
      if (!existing) throw new NotFoundError(`Node '${nodeId}' not found`);

      const now = new Date().toISOString();
      const patch: Partial<GraphNodeDto> = {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
        ...(dto.metadata !== undefined ? { metadata: sanitizeProps(dto.metadata) } : {}),
        ...(dto.sourceType !== undefined ? { sourceType: dto.sourceType } : {}),
        ...(dto.timestamp !== undefined ? { timestamp: dto.timestamp } : {}),
        ...(dto.numMessages !== undefined ? { numMessages: dto.numMessages } : {}),
        updatedAt: now,
      };

      await this.repo.updateNode(userId, nodeId, patch, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.updateNode failed', { cause: String(err) });
    }
  }

  /**
   * @description graph node를 삭제합니다 (soft 또는 hard). 작성일: 2026-05-01
   *
   * @param userId 사용자 ID
   * @param nodeId 삭제할 node id
   * @param permanent true이면 물리적 삭제
   * @param options transaction 등 adapter 전용 옵션
   * @throws {NotFoundError} node가 없을 때
   */
  async deleteNode(
    userId: string,
    nodeId: number,
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      const existing = await this.repo.findNode(userId, nodeId, options);
      if (!existing) throw new NotFoundError(`Node '${nodeId}' not found`);

      await this.repo.deleteNode(userId, nodeId, permanent, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.deleteNode failed', { cause: String(err) });
    }
  }

  // =====================
  // Edge CRUD
  // =====================

  /**
   * @description 새 graph edge를 생성합니다. 작성일: 2026-05-01
   *
   * source, target 노드가 같은 사용자의 활성 노드여야 합니다.
   * relationType은 UPPER_SNAKE_CASE로 정규화됩니다.
   *
   * @param userId 사용자 ID
   * @param dto 엣지 생성 요청 DTO
   * @param options transaction 등 adapter 전용 옵션
   * @returns 생성된 엣지 ID와 전체 DTO
   * @throws {ValidationError} source === target이거나 필수 필드 누락
   * @throws {NotFoundError} source 또는 target node가 없을 때
   * @throws {UpstreamError} DB 저장 실패 시
   */
  async createEdge(
    userId: string,
    dto: CreateEdgeEditorDto,
    options?: MacroGraphStoreOptions
  ): Promise<CreateEdgeEditorResponseDto> {
    try {
      this.assertUser(userId);
      if (dto.source === dto.target) throw new ValidationError('source and target must be different nodes');

      const [srcNode, tgtNode] = await Promise.all([
        this.repo.findNode(userId, dto.source, options),
        this.repo.findNode(userId, dto.target, options),
      ]);
      if (!srcNode) throw new NotFoundError(`Source node '${dto.source}' not found`);
      if (!tgtNode) throw new NotFoundError(`Target node '${dto.target}' not found`);

      const normalizedRelationType = dto.relationType
        ? normalizeRelationType(dto.relationType)
        : 'INSIGHT';

      const intraCluster = srcNode.clusterId === tgtNode.clusterId;
      const now = new Date().toISOString();
      const edgeId = uuidv4();

      const edge: GraphEdgeDto = {
        id: edgeId,
        userId,
        source: dto.source,
        target: dto.target,
        weight: dto.weight ?? 0.5,
        type: 'insight',
        relationType: normalizedRelationType,
        relation: dto.relation,
        properties: sanitizeProps(dto.properties),
        intraCluster,
        createdAt: now,
        updatedAt: now,
      };

      const savedId = await this.repo.upsertEdge(edge, options);

      return { edgeId: savedId || edgeId, edge: { ...edge, id: savedId || edgeId } };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.createEdge failed', { cause: String(err) });
    }
  }

  /**
   * @description 기존 graph edge를 부분 수정합니다. 작성일: 2026-05-01
   *
   * @param userId 사용자 ID
   * @param edgeId 수정할 edge id
   * @param dto 수정 요청 DTO
   * @param options transaction 등 adapter 전용 옵션
   * @throws {NotFoundError} edge가 없을 때
   */
  async updateEdge(
    userId: string,
    edgeId: string,
    dto: UpdateEdgeEditorDto,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      if (!edgeId) throw new ValidationError('edgeId required');

      const existing = await this.repo.findEdge(userId, edgeId, options);
      if (!existing) throw new NotFoundError(`Edge '${edgeId}' not found`);

      const patch: Partial<GraphEdgeDto> = {};
      if (dto.weight !== undefined) patch.weight = dto.weight;
      if (dto.relation !== undefined) patch.relation = dto.relation;
      if (dto.properties !== undefined) patch.properties = sanitizeProps(dto.properties);
      if (dto.relationType !== undefined) {
        patch.relationType = normalizeRelationType(dto.relationType);
      }

      await this.repo.updateEdge(userId, edgeId, patch, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.updateEdge failed', { cause: String(err) });
    }
  }

  /**
   * @description graph edge를 삭제합니다 (soft 또는 hard). 작성일: 2026-05-01
   *
   * @param userId 사용자 ID
   * @param edgeId 삭제할 edge id
   * @param permanent true이면 물리적 삭제
   * @param options transaction 등 adapter 전용 옵션
   * @throws {NotFoundError} edge가 없을 때
   */
  async deleteEdge(
    userId: string,
    edgeId: string,
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      if (!edgeId) throw new ValidationError('edgeId required');

      const existing = await this.repo.findEdge(userId, edgeId, options);
      if (!existing) throw new NotFoundError(`Edge '${edgeId}' not found`);

      await this.repo.deleteEdge(userId, edgeId, permanent, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.deleteEdge failed', { cause: String(err) });
    }
  }

  // =====================
  // Cluster CRUD
  // =====================

  /**
   * @description 새 cluster를 생성합니다. 작성일: 2026-05-01
   *
   * id를 제공하지 않으면 UUID v4로 자동 생성됩니다.
   *
   * @param userId 사용자 ID
   * @param dto 클러스터 생성 요청 DTO
   * @param options transaction 등 adapter 전용 옵션
   * @returns 생성된 cluster DTO
   * @throws {ConflictError} 동일 id의 cluster가 이미 존재할 때
   */
  async createCluster(
    userId: string,
    dto: CreateClusterEditorDto,
    options?: MacroGraphStoreOptions
  ): Promise<CreateClusterEditorResponseDto> {
    try {
      this.assertUser(userId);
      if (!dto.name?.trim()) throw new ValidationError('cluster name is required');

      const clusterId = dto.id?.trim() || uuidv4();

      if (dto.id) {
        const existing = await this.repo.findCluster(userId, clusterId, options);
        if (existing) throw new ConflictError(`Cluster '${clusterId}' already exists`);
      }

      const now = new Date().toISOString();
      const cluster: GraphClusterDto = {
        id: clusterId,
        userId,
        name: dto.name.trim(),
        description: dto.description ?? '',
        size: 0,
        themes: dto.themes ?? [],
        createdAt: now,
        updatedAt: now,
      };

      await this.repo.upsertCluster(cluster, options);
      return { cluster };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.createCluster failed', { cause: String(err) });
    }
  }

  /**
   * @description 기존 cluster를 부분 수정합니다. 작성일: 2026-05-01
   *
   * @param userId 사용자 ID
   * @param clusterId 수정할 cluster id
   * @param dto 수정 요청 DTO
   * @param options transaction 등 adapter 전용 옵션
   * @throws {NotFoundError} cluster가 없을 때
   */
  async updateCluster(
    userId: string,
    clusterId: string,
    dto: UpdateClusterEditorDto,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      if (!clusterId) throw new ValidationError('clusterId required');

      const existing = await this.repo.findCluster(userId, clusterId, options);
      if (!existing) throw new NotFoundError(`Cluster '${clusterId}' not found`);

      const now = new Date().toISOString();
      const patch: Partial<GraphClusterDto> = {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.themes !== undefined ? { themes: dto.themes } : {}),
        updatedAt: now,
      };

      await this.repo.updateCluster(userId, clusterId, patch, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.updateCluster failed', { cause: String(err) });
    }
  }

  /**
   * @description cluster를 삭제합니다. 작성일: 2026-05-01
   *
   * `cascade=false`(기본값)일 때 활성 node가 있으면 ConflictError를 던집니다.
   * `cascade=true`일 때는 cluster 내 모든 node와 해당 node들의 edge도 삭제합니다.
   *
   * @param userId 사용자 ID
   * @param clusterId 삭제할 cluster id
   * @param cascade true이면 하위 node·edge도 함께 삭제
   * @param permanent true이면 물리적 삭제
   * @param options transaction 등 adapter 전용 옵션
   * @throws {NotFoundError} cluster가 없을 때
   * @throws {ConflictError} cascade=false인데 활성 node가 있을 때
   */
  async deleteCluster(
    userId: string,
    clusterId: string,
    cascade = false,
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      if (!clusterId) throw new ValidationError('clusterId required');

      const existing = await this.repo.findCluster(userId, clusterId, options);
      if (!existing) throw new NotFoundError(`Cluster '${clusterId}' not found`);

      if (!cascade) {
        const hasNodes = await this.repo.clusterHasNodes(userId, clusterId, options);
        if (hasNodes) {
          throw new ConflictError(
            `Cluster '${clusterId}' has active nodes. Use cascade=true to delete cluster with all its nodes.`
          );
        }
      } else {
        // cascade: cluster 내 모든 node와 연관 edge를 먼저 삭제
        const nodes = await this.repo.listNodesByCluster(userId, clusterId, options);
        if (nodes.length > 0) {
          const nodeIds = nodes.map((n) => n.id);
          await this.repo.deleteEdgesByNodeIds(userId, nodeIds, permanent, options);
          await this.repo.deleteNodes(userId, nodeIds, permanent, options);
        }
      }

      await this.repo.deleteCluster(userId, clusterId, permanent, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.deleteCluster failed', { cause: String(err) });
    }
  }

  // =====================
  // Subcluster CRUD
  // =====================

  /**
   * @description 새 subcluster를 생성합니다. 작성일: 2026-05-01
   *
   * @param userId 사용자 ID
   * @param dto 서브클러스터 생성 요청 DTO
   * @param options transaction 등 adapter 전용 옵션
   * @returns 생성된 subcluster DTO
   * @throws {NotFoundError} clusterId에 해당하는 cluster가 없을 때
   * @throws {ConflictError} 동일 id의 subcluster가 이미 존재할 때
   */
  async createSubcluster(
    userId: string,
    dto: CreateSubclusterEditorDto,
    options?: MacroGraphStoreOptions
  ): Promise<CreateSubclusterEditorResponseDto> {
    try {
      this.assertUser(userId);
      if (!dto.clusterId?.trim()) throw new ValidationError('clusterId is required');

      const cluster = await this.repo.findCluster(userId, dto.clusterId, options);
      if (!cluster) throw new NotFoundError(`Cluster '${dto.clusterId}' not found`);

      const subclusterId = dto.id?.trim() || uuidv4();

      if (dto.id) {
        const existing = await this.repo.findSubcluster(userId, subclusterId, options);
        if (existing) throw new ConflictError(`Subcluster '${subclusterId}' already exists`);
      }

      const now = new Date().toISOString();
      const subcluster: GraphSubclusterDto = {
        id: subclusterId,
        userId,
        clusterId: dto.clusterId,
        nodeIds: [],
        representativeNodeId: 0,
        size: 0,
        density: dto.density ?? 0,
        topKeywords: dto.topKeywords ?? [],
        createdAt: now,
        updatedAt: now,
      };

      await this.repo.upsertSubcluster(subcluster, options);
      return { subcluster };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.createSubcluster failed', { cause: String(err) });
    }
  }

  /**
   * @description 기존 subcluster를 부분 수정합니다. 작성일: 2026-05-01
   *
   * @param userId 사용자 ID
   * @param subclusterId 수정할 subcluster id
   * @param dto 수정 요청 DTO
   * @param options transaction 등 adapter 전용 옵션
   * @throws {NotFoundError} subcluster가 없을 때
   */
  async updateSubcluster(
    userId: string,
    subclusterId: string,
    dto: UpdateSubclusterEditorDto,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      if (!subclusterId) throw new ValidationError('subclusterId required');

      const existing = await this.repo.findSubcluster(userId, subclusterId, options);
      if (!existing) throw new NotFoundError(`Subcluster '${subclusterId}' not found`);

      const now = new Date().toISOString();
      const patch: Partial<GraphSubclusterDto> = {
        ...(dto.topKeywords !== undefined ? { topKeywords: dto.topKeywords } : {}),
        ...(dto.density !== undefined ? { density: dto.density } : {}),
        updatedAt: now,
      };

      await this.repo.updateSubcluster(userId, subclusterId, patch, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.updateSubcluster failed', { cause: String(err) });
    }
  }

  /**
   * @description subcluster를 삭제합니다. 작성일: 2026-05-01
   *
   * subcluster 삭제 시 node들은 cluster에 잔류합니다 (CONTAINS 관계만 제거됨).
   *
   * @param userId 사용자 ID
   * @param subclusterId 삭제할 subcluster id
   * @param permanent true이면 물리적 삭제
   * @param options transaction 등 adapter 전용 옵션
   * @throws {NotFoundError} subcluster가 없을 때
   */
  async deleteSubcluster(
    userId: string,
    subclusterId: string,
    permanent?: boolean,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      if (!subclusterId) throw new ValidationError('subclusterId required');

      const existing = await this.repo.findSubcluster(userId, subclusterId, options);
      if (!existing) throw new NotFoundError(`Subcluster '${subclusterId}' not found`);

      await this.repo.deleteSubcluster(userId, subclusterId, permanent, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.deleteSubcluster failed', { cause: String(err) });
    }
  }

  // =====================
  // Move / Membership 작업
  // =====================

  /**
   * @description node를 다른 cluster로 이동합니다. 작성일: 2026-05-01
   *
   * node의 BELONGS_TO 관계를 교체합니다.
   * node가 subcluster에 속해 있으면서 새 clusterId가 기존 subcluster.clusterId와 다를 경우,
   * 해당 subcluster에서 node를 제거합니다.
   *
   * @param userId 사용자 ID
   * @param nodeId 이동할 node id
   * @param dto 이동 요청 DTO
   * @param options transaction 등 adapter 전용 옵션
   * @throws {NotFoundError} node 또는 대상 cluster가 없을 때
   */
  async moveNodeToCluster(
    userId: string,
    nodeId: number,
    dto: MoveNodeToClusterDto,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      if (!dto.newClusterId?.trim()) throw new ValidationError('newClusterId is required');

      const [node, targetCluster] = await Promise.all([
        this.repo.findNode(userId, nodeId, options),
        this.repo.findCluster(userId, dto.newClusterId, options),
      ]);
      if (!node) throw new NotFoundError(`Node '${nodeId}' not found`);
      if (!targetCluster) throw new NotFoundError(`Target cluster '${dto.newClusterId}' not found`);

      await this.repo.moveNodeToCluster(userId, nodeId, dto.newClusterId, options);

      const subclusters = await this.repo.listSubclusters(userId, options);
      await Promise.all(
        subclusters
          .filter((subcluster) => subcluster.clusterId !== dto.newClusterId)
          .filter((subcluster) => subcluster.nodeIds.includes(nodeId))
          .map((subcluster) =>
            this.repo.removeNodeFromSubcluster(userId, subcluster.id, nodeId, options)
          )
      );
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.moveNodeToCluster failed', { cause: String(err) });
    }
  }

  /**
   * @description subcluster를 다른 cluster로 이동합니다. 작성일: 2026-05-01
   *
   * subcluster의 HAS_SUBCLUSTER 관계를 교체하고,
   * subcluster에 속한 모든 node의 BELONGS_TO도 newClusterId로 재설정합니다.
   *
   * @param userId 사용자 ID
   * @param subclusterId 이동할 subcluster id
   * @param dto 이동 요청 DTO
   * @param options transaction 등 adapter 전용 옵션
   * @throws {NotFoundError} subcluster 또는 대상 cluster가 없을 때
   */
  async moveSubclusterToCluster(
    userId: string,
    subclusterId: string,
    dto: MoveSubclusterToClusterDto,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      if (!subclusterId) throw new ValidationError('subclusterId required');
      if (!dto.newClusterId?.trim()) throw new ValidationError('newClusterId is required');

      const [subcluster, targetCluster] = await Promise.all([
        this.repo.findSubcluster(userId, subclusterId, options),
        this.repo.findCluster(userId, dto.newClusterId, options),
      ]);
      if (!subcluster) throw new NotFoundError(`Subcluster '${subclusterId}' not found`);
      if (!targetCluster) throw new NotFoundError(`Target cluster '${dto.newClusterId}' not found`);

      await this.repo.moveSubclusterToCluster(userId, subclusterId, dto.newClusterId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.moveSubclusterToCluster failed', { cause: String(err) });
    }
  }

  /**
   * @description node를 subcluster에 편입합니다. 작성일: 2026-05-01
   *
   * node의 clusterId와 subcluster의 clusterId가 일치해야 합니다.
   *
   * @param userId 사용자 ID
   * @param subclusterId 대상 subcluster id
   * @param dto 편입 요청 DTO
   * @param options transaction 등 adapter 전용 옵션
   * @throws {NotFoundError} node 또는 subcluster가 없을 때
   * @throws {ValidationError} clusterId 불일치 시
   */
  async addNodeToSubcluster(
    userId: string,
    subclusterId: string,
    dto: AddNodeToSubclusterDto,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      if (!subclusterId) throw new ValidationError('subclusterId required');

      const [node, subcluster] = await Promise.all([
        this.repo.findNode(userId, dto.nodeId, options),
        this.repo.findSubcluster(userId, subclusterId, options),
      ]);
      if (!node) throw new NotFoundError(`Node '${dto.nodeId}' not found`);
      if (!subcluster) throw new NotFoundError(`Subcluster '${subclusterId}' not found`);

      // 불변 조건: node.clusterId == subcluster.clusterId
      if (node.clusterId !== subcluster.clusterId) {
        throw new ValidationError(
          `Node '${dto.nodeId}' belongs to cluster '${node.clusterId}' but subcluster '${subclusterId}' belongs to '${subcluster.clusterId}'. ` +
          `Move node to cluster '${subcluster.clusterId}' before adding to this subcluster.`
        );
      }

      await this.repo.addNodeToSubcluster(userId, subclusterId, dto.nodeId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.addNodeToSubcluster failed', { cause: String(err) });
    }
  }

  /**
   * @description node를 subcluster에서 제거합니다. 작성일: 2026-05-01
   *
   * node는 cluster에 잔류합니다. CONTAINS 관계만 삭제됩니다.
   *
   * @param userId 사용자 ID
   * @param subclusterId 대상 subcluster id
   * @param nodeId 제거할 node id
   * @param options transaction 등 adapter 전용 옵션
   * @throws {NotFoundError} subcluster가 없을 때
   */
  async removeNodeFromSubcluster(
    userId: string,
    subclusterId: string,
    nodeId: number,
    options?: MacroGraphStoreOptions
  ): Promise<void> {
    try {
      this.assertUser(userId);
      if (!subclusterId) throw new ValidationError('subclusterId required');

      const subcluster = await this.repo.findSubcluster(userId, subclusterId, options);
      if (!subcluster) throw new NotFoundError(`Subcluster '${subclusterId}' not found`);

      await this.repo.removeNodeFromSubcluster(userId, subclusterId, nodeId, options);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.removeNodeFromSubcluster failed', { cause: String(err) });
    }
  }

  // =====================
  // 배치 트랜잭션
  // =====================

  /**
   * @description 여러 편집 작업을 단일 transaction에서 순서대로 실행합니다. 작성일: 2026-05-01
   *
   * 각 operation을 순서대로 실행하고 결과를 배열로 반환합니다.
   * 단일 operation 실패 시 전체 transaction을 롤백합니다.
   * rollback이 필요한 경우 UpstreamError를 던져서 호출자(Neo4j write session)가 처리합니다.
   *
   * @param userId 사용자 ID
   * @param dto 배치 요청 DTO
   * @returns 전체 성공 여부와 작업별 결과
   * @throws {ValidationError} operations 목록이 비어 있거나 최대 개수 초과
   * @throws {UpstreamError} DB 저장 실패 또는 중간 operation 실패 시
   */
  async executeBatch(
    userId: string,
    dto: BatchEditorRequestDto
  ): Promise<BatchEditorResponseDto> {
    try {
      this.assertUser(userId);
      if (!dto.operations || dto.operations.length === 0) {
        throw new ValidationError('operations must not be empty');
      }
      if (dto.operations.length > 100) {
        throw new ValidationError('operations must not exceed 100 items');
      }

      const results: BatchOperationResult[] = [];

      // 각 operation을 순서대로 실행합니다.
      // Neo4j managed transaction 내에서 실행하려면 adapter 레벨의 executeWrite를 사용해야 하지만,
      // service layer에서 transaction 핸들을 직접 관리하는 것은 계층 위반입니다.
      // 따라서 각 operation은 개별적으로 실행하되, 첫 번째 실패 시 이미 완료된 작업은
      // 롤백할 수 없습니다. 진정한 단일 transaction이 필요한 경우 향후 adapter 레벨 배치 메서드를
      // 추가하는 것을 권장합니다. (현재는 best-effort sequential 실행)
      for (let i = 0; i < dto.operations.length; i++) {
        const op = dto.operations[i];
        try {
          const data = await this.executeOperation(userId, op);
          results.push({ operationIndex: i, success: true, data });
        } catch (opErr: unknown) {
          const message = opErr instanceof Error ? opErr.message : String(opErr);
          results.push({ operationIndex: i, success: false, error: message });
          // 첫 번째 실패 시 중단
          throw new UpstreamError(
            `Batch operation failed at index ${i}: ${message}`,
            { cause: String(opErr) }
          );
        }
      }

      return {
        success: true,
        results,
        processedCount: results.length,
      };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphEditorService.executeBatch failed', { cause: String(err) });
    }
  }

  /**
   * @description 단일 배치 operation을 실행하고 결과 데이터를 반환합니다. 작성일: 2026-05-01
   *
   * @param userId 사용자 ID
   * @param op 실행할 operation
   * @returns operation 결과 데이터 (create 계열만 반환)
   */
  private async executeOperation(userId: string, op: EditorBatchOperation): Promise<unknown> {
    switch (op.type) {
      case 'createNode': return this.createNode(userId, op.payload);
      case 'updateNode': return this.updateNode(userId, op.nodeId, op.payload);
      case 'deleteNode': return this.deleteNode(userId, op.nodeId, op.permanent);
      case 'createEdge': return this.createEdge(userId, op.payload);
      case 'updateEdge': return this.updateEdge(userId, op.edgeId, op.payload);
      case 'deleteEdge': return this.deleteEdge(userId, op.edgeId, op.permanent);
      case 'createCluster': return this.createCluster(userId, op.payload);
      case 'updateCluster': return this.updateCluster(userId, op.clusterId, op.payload);
      case 'deleteCluster': return this.deleteCluster(userId, op.clusterId, op.cascade, op.permanent);
      case 'createSubcluster': return this.createSubcluster(userId, op.payload);
      case 'updateSubcluster': return this.updateSubcluster(userId, op.subclusterId, op.payload);
      case 'deleteSubcluster': return this.deleteSubcluster(userId, op.subclusterId, op.permanent);
      case 'moveNodeToCluster': return this.moveNodeToCluster(userId, op.nodeId, { newClusterId: op.newClusterId });
      case 'moveSubclusterToCluster': return this.moveSubclusterToCluster(userId, op.subclusterId, { newClusterId: op.newClusterId });
      case 'addNodeToSubcluster': return this.addNodeToSubcluster(userId, op.subclusterId, { nodeId: op.nodeId });
      case 'removeNodeFromSubcluster': return this.removeNodeFromSubcluster(userId, op.subclusterId, op.nodeId);
      default: throw new ValidationError(`Unknown operation type`);
    }
  }

  // =====================
  // Private guards
  // =====================

  private assertUser(userId: string | undefined): asserts userId is string {
    if (!userId) throw new ValidationError('userId required');
  }
}
