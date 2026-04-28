import type {
  MicroscopeDocumentMetaDoc,
  MicroscopeWorkspaceMetaDoc,
} from '../types/persistence/microscope_workspace.persistence';
import type { MicroscopeGraphDataDto } from '../../shared/dtos/microscope';
import type { Neo4jMicroscopeIngestBatch } from '../types/neo4j/microscope_graph.neo4j';

/**
 * @description Microscope Graph 저장소 구현체에 전달하는 실행 옵션입니다.
 *
 * Core 계층은 Neo4j driver 타입을 직접 알면 안 되므로 transaction 타입을 `unknown`으로 둡니다.
 * 실제 Neo4j adapter는 이 값을 Neo4j transaction으로 좁혀 사용합니다.
 *
 * @property transaction 저장소 구현체가 사용할 외부 transaction 객체입니다.
 */
export interface MicroscopeGraphStoreOptions {
  transaction?: unknown;
}

/**
 * @description Neo4j 기반 Microscope workspace/graph 원천 저장소 Port입니다.
 *
 * 기존 구조에서는 workspace/document 진행 상태는 MongoDB에, 실제 graph payload도 MongoDB의
 * 별도 collection에 저장했습니다. 전환 후에는 workspace metadata와 추출 graph를 모두
 * Neo4j에 저장하고, Service는 기존 `MicroscopeWorkspaceMetaDoc` 및 `MicroscopeGraphDataDto`
 * 형태로 응답을 유지합니다.
 */
export interface MicroscopeGraphStore {
  /**
   * @description 새 Microscope workspace 루트 노드를 생성합니다.
   * @param workspace 기존 workspace metadata 계약입니다.
   * @param options 선택적 transaction 옵션입니다.
   */
  createWorkspace(
    workspace: MicroscopeWorkspaceMetaDoc,
    options?: MicroscopeGraphStoreOptions
  ): Promise<void>;

  /**
   * @description workspace ID로 Microscope workspace metadata를 조회합니다.
   * @param groupId workspace/group 식별자입니다.
   * @param options 선택적 transaction 옵션입니다.
   */
  findWorkspaceById(
    groupId: string,
    options?: MicroscopeGraphStoreOptions
  ): Promise<MicroscopeWorkspaceMetaDoc | null>;

  /**
   * @description 사용자의 Microscope workspace 목록을 조회합니다.
   * @param userId workspace 소유자 ID입니다.
   * @param options 선택적 transaction 옵션입니다.
   */
  listWorkspacesByUserId(
    userId: string,
    options?: MicroscopeGraphStoreOptions
  ): Promise<MicroscopeWorkspaceMetaDoc[]>;

  /**
   * @description workspace에 새 document 처리 상태 노드를 추가합니다.
   * @param groupId 대상 workspace 식별자입니다.
   * @param document 추가할 document metadata입니다.
   * @param options 선택적 transaction 옵션입니다.
   */
  addDocument(
    groupId: string,
    document: MicroscopeDocumentMetaDoc,
    options?: MicroscopeGraphStoreOptions
  ): Promise<void>;

  /**
   * @description 완료된 document ingest 결과를 graph 구조와 함께 저장합니다.
   *
   * 구현체의 권장 흐름:
   * 1. workspace와 document를 `MERGE`합니다.
   * 2. document 상태를 `COMPLETED`로 갱신합니다.
   * 3. entity/chunk를 `UNWIND`로 batch upsert합니다.
   * 4. `PRODUCED`, `EXTRACTED_FROM`, `MICRO_REL` 관계를 생성합니다.
   *
   * @param batch workspace, document, entity, chunk, relationship을 포함한 저장 payload입니다.
   * @param options 선택적 transaction 옵션입니다.
   */
  upsertCompletedIngest(
    batch: Neo4jMicroscopeIngestBatch,
    options?: MicroscopeGraphStoreOptions
  ): Promise<void>;

  /**
   * @description 특정 document의 처리 상태를 갱신합니다.
   * @param groupId workspace/group 식별자입니다.
   * @param docId document/task 식별자입니다.
   * @param status 변경할 처리 상태입니다.
   * @param sourceId 성공 시 AI 워커가 반환한 source 식별자입니다.
   * @param error 실패 시 에러 메시지입니다.
   * @param options 선택적 transaction 옵션입니다.
   */
  updateDocumentStatus(
    groupId: string,
    docId: string,
    status: MicroscopeDocumentMetaDoc['status'],
    sourceId?: string,
    error?: string,
    options?: MicroscopeGraphStoreOptions
  ): Promise<void>;

  /**
   * @description 특정 note/conversation nodeId와 연결된 최신 workspace를 조회합니다.
   * @param userId workspace 소유자 ID입니다.
   * @param nodeId note/conversation 원본 ID입니다.
   * @param options 선택적 transaction 옵션입니다.
   */
  findLatestWorkspaceByNodeId(
    userId: string,
    nodeId: string,
    options?: MicroscopeGraphStoreOptions
  ): Promise<MicroscopeWorkspaceMetaDoc | null>;

  /**
   * @description workspace의 entity/relationship graph를 FE가 기대하는 DTO로 조회합니다.
   * @param userId workspace 소유자 ID입니다.
   * @param groupId workspace/group 식별자입니다.
   * @param options 선택적 transaction 옵션입니다.
   */
  getWorkspaceGraph(
    userId: string,
    groupId: string,
    options?: MicroscopeGraphStoreOptions
  ): Promise<MicroscopeGraphDataDto>;

  /**
   * @description workspace와 그 하위 document/entity/chunk/relationship을 삭제합니다.
   * @param groupId 삭제할 workspace/group 식별자입니다.
   * @param options 선택적 transaction 옵션입니다.
   */
  deleteWorkspace(groupId: string, options?: MicroscopeGraphStoreOptions): Promise<void>;
}
