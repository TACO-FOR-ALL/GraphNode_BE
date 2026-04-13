import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { MicroscopeWorkspace, MicroscopeGraphData } from '../types/microscope.js';

/**
 * Microscope API
 * 
 * 다중 파일 및 컨텍스트 기반의 지식 그래프 구축 파이프라인 관리 엔드포인트를 제공합니다.
 * 백엔드 `/v1/microscope` 엔드포인트와 연동합니다.
 * @public
 */
export class MicroscopeApi {
  private readonly rb: RequestBuilder;

  /**
   * @internal
   */
  constructor(rb: RequestBuilder) {
    this.rb = rb.path('/v1/microscope');
  }

  /**
   * 노트(Note) 데이터를 기반으로 지식 그래프 구축(Ingest) 파이프라인을 비동기로 시작합니다.
   * 백엔드에서는 전달된 노트의 제목을 기반으로 새로운 워크스페이스를 생성하며, 
   * 상태(PENDING $\rightarrow$ COMPLETED) 추적이 가능합니다.
   *
   * @param noteId 분석을 요청할 노트의 고유 ID
   * @param schemaName 추출에 사용할 커스텀 엔티티 스키마 명칭 (옵션)
   * @returns {Promise<HttpResponse<MicroscopeWorkspace>>} 생성된 워크스페이스 메타데이터 반환
   *
   * **응답 상태 코드:**
   * - `201 Created`: 워크스페이스 생성 및 Ingest 파이프라인 시작 성공
   * - `400 Bad Request`: nodeId 또는 nodeType 누락
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `502 Bad Gateway`: SQS 전송 또는 데이터베이스 오류
   *
   * @example
   * const res = await sdk.microscope.ingestFromNote('note_123');
   * console.log(res.data._id); // 워크스페이스(그룹) ID
   */
  async ingestFromNote(noteId: string, schemaName?: string): Promise<HttpResponse<MicroscopeWorkspace>> {
    return this.rb.path('/nodes/ingest').post<MicroscopeWorkspace>({
      nodeId: noteId,
      nodeType: 'note',
      schemaName
    });
  }

  /**
   * 대화(Conversation) 데이터를 기반으로 지식 그래프 구축(Ingest) 파이프라인을 비동기로 시작합니다.
   * 백엔드에서는 전달된 대화의 제목을 기반으로 새로운 워크스페이스를 생성합니다.
   *
   * @param conversationId 분석을 요청할 대화의 고유 ID
   * @param schemaName 추출에 사용할 커스텀 엔티티 스키마 명칭 (옵션)
   * @returns {Promise<HttpResponse<MicroscopeWorkspace>>} 생성된 워크스페이스 메타데이터 반환
   *
   * **응답 상태 코드:**
   * - `201 Created`: 워크스페이스 생성 및 Ingest 파이프라인 시작 성공
   * - `400 Bad Request`: nodeId 또는 nodeType 누락
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `502 Bad Gateway`: SQS 전송 또는 데이터베이스 오류
   *
   * @example
   * const res = await sdk.microscope.ingestFromConversation('conv_456', 'code_schema');
   */
  async ingestFromConversation(conversationId: string, schemaName?: string): Promise<HttpResponse<MicroscopeWorkspace>> {
    return this.rb.path('/nodes/ingest').post<MicroscopeWorkspace>({
      nodeId: conversationId,
      nodeType: 'conversation',
      schemaName
    });
  }

  /**
   * 유저의 모든 현존 워크스페이스(Workspace) 메타데이터 목록을 조회합니다.
   * 
   * @remarks
   * 이 메서드는 사이드바 등에서 지식 그래프(Microscope) 목록을 보여주기 위한 용도로 사용됩니다.
   * 반환된 목록의 객체들은 그래프 노드/엣지를 포함하지 않는 '메타데이터' 전용 객체입니다.
   * 
   * @returns {Promise<HttpResponse<MicroscopeWorkspace[]>>} 워크스페이스 메타데이터 배열
   * @example
   * const workspaces = await client.microscope.listWorkspaces();
   * console.log(workspaces.data[0].name);
   */
  async listWorkspaces(): Promise<HttpResponse<MicroscopeWorkspace[]>> {
    return this.rb.get<MicroscopeWorkspace[]>();
  }

  /**
   * 단일 워크스페이스의 상세 상태와 메타데이터를 조회합니다.
   * 
   * @remarks
   * 이 메서드는 Ingest 진행 과정(진행률, 에러 상태 등)을 파악하기 위해 사용되며, 
   * 실제 그래프 데이터 요소를 반환하지 않습니다.
   *
   * @param microscopeWorkspaceId - 조회할 워크스페이스 ID
   * @returns {Promise<HttpResponse<MicroscopeWorkspace>>} 워크스페이스 메타데이터
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 워크스페이스가 존재하지 않음
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * const ws = await client.microscope.getWorkspace('ws_123');
   * console.log(ws.data.status); // 'COMPLETED'
   */
  async getWorkspace(microscopeWorkspaceId: string): Promise<HttpResponse<MicroscopeWorkspace>> {
    return this.rb.path(`/${microscopeWorkspaceId}`).get<MicroscopeWorkspace>();
  }

  /**
   * 워크스페이스의 실제 구체적인 세부 "지식 그래프 데이터(Nodes & Edges)"를 조회합니다.
   * 
   * @remarks
   * `listWorkspaces`나 `getWorkspace`와 달리 이 메서드는 화면 가운데 그려질 메인 시각화용 
   * 그래프 데이터를 가져오기 위한 목적으로 사용됩니다.
   * 
   * @param microscopeWorkspaceId - 조회할 워크스페이스 ID
   * @returns {Promise<HttpResponse<MicroscopeGraphData[]>>} 실제 그래프 데이터 목록
   * @example
   * const graphData = await client.microscope.getWorkspaceGraph('ws_123');
   * console.log(graphData[0].nodes.length);
   */
  async getWorkspaceGraph(microscopeWorkspaceId: string): Promise<HttpResponse<MicroscopeGraphData[]>> {
    return this.rb.path(`/${microscopeWorkspaceId}/graph`).get<MicroscopeGraphData[]>();
  }

  /**
   * 특정 노드 ID로 가장 최근에 요청된 Microscope Ingest의 워크스페이스를 조회합니다.
   *
   * @description
   * `ingestFromNote` / `ingestFromConversation` 호출 후 반환된 워크스페이스 ID를 보관하지 않아도,
   * 이 메서드를 통해 해당 노드의 최신 Ingest 진행 상태를 즉시 확인할 수 있습니다.
   *
   * **정렬 기준**: 동일 nodeId에 대해 여러 번 Ingest를 요청한 경우, `documents.createdAt DESC` 기준으로
   * 가장 최근에 **생성된** Document를 포함하는 워크스페이스를 반환합니다.
   * `updatedAt` 기준 대비 "완료된 오래된 Ingest"가 "진행 중인 최신 Ingest"보다 우선 반환되는 역전 현상을 방지합니다.
   *
   * **status 확인 방법**: 반환된 `workspace.documents` 배열에서
   * `documents.find(d => d.nodeId === nodeId)`로 특정 Document를 추출하여 `status` 필드를 확인하십시오.
   *
   * @param nodeId 조회할 노트(Note) 또는 대화(Conversation)의 고유 ID
   * @returns {Promise<HttpResponse<MicroscopeWorkspace>>} 워크스페이스 메타데이터 전체 (documents 배열 포함)
   * @throws `404` 해당 nodeId로 생성된 Microscope 워크스페이스가 존재하지 않을 때
   * @throws `401` 인증되지 않은 요청 (세션 없음 또는 만료)
   * @throws `502` 데이터베이스 오류
   * @example
   * // Step 1: ingest 요청
   * await sdk.microscope.ingestFromNote('note_123');
   *
   * // Step 2: 워크스페이스 ID 없이 상태 추적
   * const { data: workspace } = await sdk.microscope.getLatestWorkspaceByNodeId('note_123');
   * const doc = workspace.documents.find(d => d.nodeId === 'note_123');
   * console.log(doc?.status); // 'PROCESSING' | 'COMPLETED' | 'FAILED'
   *
   * // Step 3: 완료 시 그래프 조회
   * if (doc?.status === 'COMPLETED') {
   *   const graph = await sdk.microscope.getLatestGraphByNodeId('note_123');
   * }
   */
  async getLatestWorkspaceByNodeId(nodeId: string): Promise<HttpResponse<MicroscopeWorkspace>> {
    return this.rb.path(`/nodes/${nodeId}/latest-workspace`).get<MicroscopeWorkspace>();
  }

  /**
   * 특정 노드(Note/Conversation) ID와 연계된 가장 최신의 Microscope 지식 그래프 데이터를 조회합니다.
   * 
   * @remarks
   * 이 메서드는 현재 FE 개발 편의성을 위해 추가되었습니다. 
   * 백엔드 및 AI 워커는 내부적으로 여러 노드를 하나의 워크스페이스(Workspace)로 묶어 관리할 수 있는 구조를 갖추고 있으나, 
   * 현재 FE 시각화 테스트 코드가 "1개 노드 = 1개 Microscope" 매핑을 가정하고 있는 점을 고려하여, 
   * 해당 노드가 포함된 가장 최근의 워크스페이스 결과물을 단일 객체로 반환하도록 구현되었습니다.
   * 
   * @param nodeId 조회할 대상 노드(노트/대화)의 고유 ID
   * @returns {Promise<HttpResponse<MicroscopeGraphData>>} 최신 그래프 데이터
   * @example
   * const res = await sdk.microscope.getLatestGraphByNodeId('note_123');
   * const { nodes, edges } = res.data;
   */
  async getLatestGraphByNodeId(nodeId: string): Promise<HttpResponse<MicroscopeGraphData>> {
    return this.rb.path(`/nodes/${nodeId}/latest-graph`).get<MicroscopeGraphData>();
  }



  /**
   * 워크스페이스를 삭제합니다. 연관된 Neo4j 그래프와 메타데이터가 파기됩니다.
   *
   * @param microscopeWorkspaceId - 삭제할 워크스페이스 ID
   *
   * **응답 상태 코드:**
   * - `204 No Content`: 삭제 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 해당 워크스페이스가 존재하지 않음
   * - `502 Bad Gateway`: 데이터베이스 오류
   *
   * @example
   * await client.microscope.deleteWorkspace('ws_123');
   */
  async deleteWorkspace(microscopeWorkspaceId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/${microscopeWorkspaceId}`).delete<void>();
  }
}
