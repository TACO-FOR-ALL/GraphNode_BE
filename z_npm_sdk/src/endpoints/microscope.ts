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
   * 이 메서드는 사이드바 등에서 지식 그래프(Microscope) 목록을 보여주기 위한 용도로 사용됩니다.
   * 반환된 목록의 객체들은 그래프 노드/엣지를 포함하지 않는 '메타데이터' 전용 객체입니다.
   * 
   * @returns {Promise<HttpResponse<MicroscopeWorkspace[]>>} 워크스페이스 메타데이터 배열
   */
  async listWorkspaces(): Promise<HttpResponse<MicroscopeWorkspace[]>> {
    return this.rb.get<MicroscopeWorkspace[]>();
  }

  /**
   * 단일 워크스페이스의 상세 상태와 메타데이터(예: 진행률, 에러 상태 등)를 조회합니다.
   * 이 메서드는 Ingest 진행 과정 등을 파악하기 위해 사용되며, 
   * 실제 그래프 데이터 요소를 반환하지 않습니다.
   *
   * @param microscopeWorkspaceId 조회할 microscope 워크스페이스 ID
   * @returns {Promise<HttpResponse<MicroscopeWorkspace>>} 워크스페이스 메타데이터
   */
  async getWorkspace(microscopeWorkspaceId: string): Promise<HttpResponse<MicroscopeWorkspace>> {
    return this.rb.path(`/${microscopeWorkspaceId}`).get<MicroscopeWorkspace>();
  }

  /**
   * 워크스페이스의 실제 구체적인 세부 "지식 그래프(Microscope) 데이터(Nodes & Edges)"를 조회합니다.
   * `listWorkspaces`나 `getWorkspace`와 달리 이 메서드는 화면 가운데 그려질 메인 시각화용 
   * 그래프 데이터를 가져오기 위한 목적으로 사용됩니다.
   * 
   * @param microscopeWorkspaceId 조회할 microscope 워크스페이스 ID
   * @returns {Promise<HttpResponse<MicroscopeGraphData[]>>} 실제 그래프 데이터
   */
  async getWorkspaceGraph(microscopeWorkspaceId: string): Promise<HttpResponse<MicroscopeGraphData[]>> {
    return this.rb.path(`/${microscopeWorkspaceId}/graph`).get<MicroscopeGraphData[]>();
  }



  /**
   * 워크스페이스를 삭제합니다. 연관된 Neo4j 그래프와 메타데이터가 파기됩니다.
   *
   * @param microscopeWorkspaceId 삭제할 microscope 워크스페이스 ID
   * @returns {Promise<HttpResponse<void>>}
   */
  async deleteWorkspace(microscopeWorkspaceId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/${microscopeWorkspaceId}`).delete<void>();
  }
}
