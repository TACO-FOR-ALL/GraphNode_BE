import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { MicroscopeWorkspace } from '../types/microscope.js';

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
   * 워크스페이스를 생성하고 여러 문서를 업로드하여 분석(Graph Ingest) 파이프라인을 비동기로 시작합니다.
   *
   * @param name 워크스페이스 이름
   * @param files 업로드할 File 또는 Blob 객체 배열 (옵션)
   * @param schemaName 추출에 사용할 엔티티 스키마 명칭 (옵션)
   * @returns {Promise<HttpResponse<MicroscopeWorkspace>>}
   */
  async createWorkspaceWithDocuments(name: string, files?: File[] | Blob[], schemaName?: string): Promise<HttpResponse<MicroscopeWorkspace>> {
    const formData = new FormData();
    formData.append('name', name);
    if (schemaName) formData.append('schemaName', schemaName);
    
    if (files && files.length > 0) {
      files.forEach((file) => formData.append('files', file));
    }

    return this.rb.post<MicroscopeWorkspace>(formData);
  }

  /**
   * 유저의 모든 현존 워크스페이스 목록을 조회합니다.
   * @returns {Promise<HttpResponse<MicroscopeWorkspace[]>>}
   */
  async listWorkspaces(): Promise<HttpResponse<MicroscopeWorkspace[]>> {
    return this.rb.get<MicroscopeWorkspace[]>();
  }

  /**
   * 단일 워크스페이스 상세 정보를 조회합니다.
   *
   * @param groupId 조회할 워크스페이스 ID
   * @returns {Promise<HttpResponse<MicroscopeWorkspace>>}
   */
  async getWorkspace(groupId: string): Promise<HttpResponse<MicroscopeWorkspace>> {
    return this.rb.path(`/${groupId}`).get<MicroscopeWorkspace>();
  }

  /**
   * 기존 워크스페이스에 새로운 파일들을 추가 업로드하여 처리합니다.
   *
   * @param groupId 문서를 추가할 워크스페이스 ID
   * @param files 업로드할 File 또는 Blob 배열
   * @param schemaName (옵션) 추출 스키마명
   * @returns {Promise<HttpResponse<{ message: string }>>}
   */
  async addDocumentsToWorkspace(groupId: string, files: File[] | Blob[], schemaName?: string): Promise<HttpResponse<{ message: string }>> {
    const formData = new FormData();
    if (schemaName) {
      formData.append('schemaName', schemaName);
    }
    files.forEach((file) => formData.append('files', file));

    return this.rb.path(`/${groupId}/documents`).post<{ message: string }>(formData);
  }

  /**
   * 워크스페이스를 삭제합니다. 연관된 Neo4j 그래프와 메타데이터가 파기됩니다.
   *
   * @param groupId 삭제할 워크스페이스 ID
   * @returns {Promise<HttpResponse<void>>}
   */
  async deleteWorkspace(groupId: string): Promise<HttpResponse<void>> {
    return this.rb.path(`/${groupId}`).delete<void>();
  }
}
