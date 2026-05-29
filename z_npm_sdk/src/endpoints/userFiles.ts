import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type {
  UserFileDto,
  UserFileListResponseDto,
  UserFilePresignedViewUrlDto,
  UserFilePatchDto,
  UserFileSummaryPreviewResponseDto,
  UserFileSummaryFullResponseDto,
  SidebarItemsResponseDto,
} from '../types/userFile.js';

/**
 * 사용자 라이브러리 파일 API
 *
 * 사이드바·라이브러리에 올린 **사용자 파일**을 관리하는 API 클래스입니다.
 * `/v1/files` 및 `/v1/sidebar-items` 엔드포인트 하위의 API들을 호출합니다.
 *
 * > **주의**: 채팅 중 AI 첨부용 `client.file` / `POST /api/v1/ai/files` 와는 **다른** 경로입니다.
 *
 * 주요 기능:
 * - 파일 업로드·목록 조회·메타데이터 조회 (`uploadUserFile`, `listUserFiles`, `getUserFile`)
 * - 뷰어용 Presigned URL 발급 (`getUserFilePresignedViewUrl`)
 * - 이름 변경·폴더 이동 (`updateUserFile`)
 * - 소프트/영구 삭제 (`deleteUserFile`)
 *
 * @public
 */
export class UserFilesApi {
  private readonly rb: RequestBuilder;

  constructor(rb: RequestBuilder) {
    this.rb = rb.path('/v1');
  }

  /**
   * 단일 파일을 업로드합니다 (`POST /v1/files`).
   *
   * @remarks
   * 내부적으로 `multipart/form-data` 형식으로 서버에 전송합니다.
   *
   * 파일명 중복 시 서버가 자동으로 `이름(1).ext` 형태로 조정합니다.
   * 허용 확장자: `.pdf`, `.docx`, `.ppt`, `.pptx` (MVP 기준).
   * 최대 파일 크기: **80MB**.
   * 업로드 완료 후 백그라운드에서 AI 요약이 자동 실행됩니다 (`summaryStatus: 'pending'` → `'completed'`).
   *
   * @param file 업로드할 파일 객체 (`File` 또는 `Blob`)
   * @param folderId (선택) 저장할 폴더 ID. 생략하거나 `null`이면 루트에 저장됩니다.
   * @returns 생성된 `UserFileDto` (id, displayName, mimeType, summaryStatus 등)
   *
   * **응답 상태 코드:**
   * - `201 Created`: 업로드 성공
   * - `400 Bad Request`: 허용되지 않은 확장자, 파일 없음, 파일 크기 초과 (80MB)
   * - `401 Unauthorized`: 인증되지 않은 요청 (세션 만료)
   * - `404 Not Found`: 지정한 `folderId`가 존재하지 않거나 소유권 없음
   * - `502 Bad Gateway`: 업스트림 S3 오류 (재시도 가능)
   *
   * @example
   * // 파일 선택 후 루트에 업로드
   * const res = await client.userFiles.uploadUserFile(fileInput.files[0]);
   * if (res.isSuccess) {
   *   console.log('업로드 완료:', res.data.displayName, res.data.id);
   * }
   *
   * @example
   * // 특정 폴더에 업로드
   * const res = await client.userFiles.uploadUserFile(fileInput.files[0], 'folder-abc');
   */
  async uploadUserFile(file: File | Blob, folderId?: string | null): Promise<HttpResponse<UserFileDto>> {
    const formData = new FormData();
    formData.append('file', file);
    if (folderId) {
      formData.append('folderId', folderId);
    }
    return this.rb.path('files').post<UserFileDto>(formData);
  }

  /**
   * 특정 폴더의 파일 목록을 커서 기반 페이징으로 조회합니다 (`GET /v1/files`).
   *
   * @remarks
   * `folderId`를 생략하거나 `null`로 설정하면 루트(최상위) 파일 목록을 반환합니다.
   * `nextCursor`가 `null`이면 마지막 페이지입니다.
   *
   * @param params.folderId 조회할 폴더 ID. `null` 또는 생략 시 루트 조회
   * @param params.limit 한 번에 받을 최대 항목 수 (기본값: 20)
   * @param params.cursor 이전 응답의 `nextCursor` 값 (다음 페이지 요청 시)
   * @returns `UserFileListResponseDto` — `items: UserFileDto[]`, `nextCursor: string | null`
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공 (파일이 없으면 `items: []` 반환)
   * - `401 Unauthorized`: 인증되지 않은 요청
   *
   * @example
   * // 루트 파일 첫 페이지 조회
   * const res = await client.userFiles.listUserFiles({ limit: 20 });
   * if (res.isSuccess) {
   *   console.log(res.data.items); // UserFileDto[]
   *   const nextCursor = res.data.nextCursor; // 다음 페이지가 있으면 문자열, 없으면 null
   * }
   *
   * @example
   * // 특정 폴더 + 커서 페이징
   * let cursor: string | null = undefined;
   * do {
   *   const res = await client.userFiles.listUserFiles({ folderId: 'folder-1', cursor });
   *   if (!res.isSuccess) break;
   *   processItems(res.data.items);
   *   cursor = res.data.nextCursor;
   * } while (cursor);
   */
  async listUserFiles(params?: {
    folderId?: string | null;
    limit?: number;
    cursor?: string;
  }): Promise<HttpResponse<UserFileListResponseDto>> {
    let b = this.rb.path('files');
    if (params?.folderId !== undefined && params.folderId !== null) {
      b = b.query({ folderId: params.folderId });
    }
    if (params?.limit != null) {
      b = b.query({ limit: params.limit });
    }
    if (params?.cursor) {
      b = b.query({ cursor: params.cursor });
    }
    return b.get<UserFileListResponseDto>();
  }

  /**
   * 파일 메타데이터를 단건 조회합니다 (`GET /v1/files/:id`).
   *
   * @remarks
   * 파일 바이트를 직접 스트리밍하지 않습니다.
   * 파일 내용을 표시하려면 `getUserFilePresignedViewUrl`을 사용하세요.
   *
   * @param id 파일 ID (ULID)
   * @returns `UserFileDto` — id, displayName, mimeType, sizeBytes, summaryStatus, summary 등
   *
   * **응답 상태 코드:**
   * - `200 OK`: 조회 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 파일이 존재하지 않거나 소유권 없음
   *
   * @example
   * const res = await client.userFiles.getUserFile('file-ulid-123');
   * if (res.isSuccess) {
   *   const { displayName, mimeType, summaryStatus, summary } = res.data;
   *   if (summaryStatus === 'completed') {
   *     showSummary(summary);
   *   }
   * }
   */
  async getUserFile(id: string): Promise<HttpResponse<UserFileDto>> {
    return this.rb.path('files').path(id).get<UserFileDto>();
  }

  /**
   * AI 구조화 요약의 한 줄(1번)만 조회합니다 (`GET /v1/files/:id/summary/preview`).
   *
   * @param id 파일 ID (ULID)
   */
  async getUserFileSummaryPreview(
    id: string
  ): Promise<HttpResponse<UserFileSummaryPreviewResponseDto>> {
    return this.rb.path('files').path(id).path('summary').path('preview').get<UserFileSummaryPreviewResponseDto>();
  }

  /**
   * AI 구조화 요약 전체(1~4번)를 조회합니다 (`GET /v1/files/:id/summary/full`).
   *
   * @param id 파일 ID (ULID)
   */
  async getUserFileSummaryFull(
    id: string
  ): Promise<HttpResponse<UserFileSummaryFullResponseDto>> {
    return this.rb.path('files').path(id).path('summary').path('full').get<UserFileSummaryFullResponseDto>();
  }

  /**
   * 파일 뷰어용 Presigned GET URL을 발급합니다 (`GET /v1/files/:id/view-url`).
   *
   * @remarks
   * 백엔드는 호출자(세션 쿠키 또는 Bearer 토큰)를 검증한 뒤, S3에 대한
   * 단기 서명 URL을 발급합니다. 이후 브라우저는 이 URL로 S3에 **직접** 접근하므로
   * 대용량 파일을 서버 프록시 없이 효율적으로 표시할 수 있습니다.
   *
   * ### ⏱ 유효 기간 (TTL)
   * 기본값은 **900초(15분)** 입니다 (`USER_FILE_PRESIGN_TTL_SECONDS` 환경 변수로 조정 가능).
   * 응답의 `expiresInSeconds` · `expiresAt` 필드를 참고하세요.
   * - 브라우저가 URL로 S3에 **최초 요청**을 보낼 때만 유효성이 검증됩니다.
   * - 즉, 만료 전에 시작된 대용량 다운로드/스트리밍은 중간에 끊기지 않습니다.
   *
   * ### ⚠️ 만료·403 에러 핸들링
   * URL이 만료된 상태에서 S3에 접근하면 HTTP **403** 에러가 반환됩니다.
   * FE는 다음 두 가지 방법 중 하나로 대응하세요.
   *
   * **① 사전 방어 (권장)**: 컴포넌트 마운트 시 또는 파일을 열 때마다 이 메서드를
   *    다시 호출해 항상 새 URL을 사용합니다. 오래된 URL을 localStorage 등에 보관하지 않습니다.
   *
   * **② 사후 복구**: `<img>` / `<iframe>` 의 `onError`에서 403이면
   *    이 메서드를 재호출한 뒤 새 URL로 교체(리마운트)합니다.
   *
   * ### 📌 disposition 파라미터
   * - `'inline'` (기본): 브라우저가 뷰어(PDF 뷰어, 이미지 등)로 표시
   * - `'attachment'`: 브라우저가 파일 저장 대화상자를 표시 (다운로드 강제)
   * FE가 상황에 맞게 선택하는 것이 정석적인 방식입니다.
   *
   * @param id 파일 ID (ULID)
   * @param params.disposition `'inline'`(기본·뷰어 표시) | `'attachment'`(다운로드 강제)
   * @returns `UserFilePresignedViewUrlDto` — `url`, `expiresInSeconds`, `expiresAt`
   *
   * **응답 상태 코드:**
   * - `200 OK`: Presigned URL 발급 성공
   * - `400 Bad Request`: `disposition` 값이 유효하지 않음
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 파일이 존재하지 않거나 소유권 없음
   *
   * @example
   * // ① 사전 방어: 컴포넌트 마운트 시 신선한 URL 발급
   * useEffect(() => {
   *   async function loadUrl() {
   *     const res = await client.userFiles.getUserFilePresignedViewUrl(fileId, { disposition: 'inline' });
   *     if (res.isSuccess) setViewUrl(res.data.url);
   *   }
   *   loadUrl();
   * }, [fileId]);
   *
   * @example
   * // ② 사후 복구: onError에서 403 감지 후 재발급
   * async function handleImgError() {
   *   const res = await client.userFiles.getUserFilePresignedViewUrl(fileId, { disposition: 'inline' });
   *   if (res.isSuccess) setViewUrl(res.data.url);
   * }
   * // <img src={viewUrl} onError={handleImgError} />
   *
   * @example
   * // 다운로드 버튼: attachment disposition으로 저장 대화상자 표시
   * async function handleDownload() {
   *   const res = await client.userFiles.getUserFilePresignedViewUrl(fileId, { disposition: 'attachment' });
   *   if (res.isSuccess) window.open(res.data.url, '_blank');
   * }
   */
  async getUserFilePresignedViewUrl(
    id: string,
    params?: { disposition?: 'inline' | 'attachment' }
  ): Promise<HttpResponse<UserFilePresignedViewUrlDto>> {
    let b = this.rb.path('files').path(id).path('view-url');
    if (params?.disposition != null) {
      b = b.query({ disposition: params.disposition });
    }
    return b.get<UserFilePresignedViewUrlDto>();
  }

  /**
   * 파일을 삭제합니다 (`DELETE /v1/files/:id`).
   *
   * @remarks
   * - `permanent` 생략 또는 `false`: **소프트 삭제** (휴지통으로 이동, 30일 후 자동 영구 삭제).
   * - `permanent: true`: **영구 삭제** (DB 레코드 + S3 객체 즉시 제거, 복구 불가).
   *
   * 삭제 시 연결된 지식 그래프 노드도 연쇄 삭제됩니다.
   *
   * @param id 파일 ID (ULID)
   * @param permanent `true`이면 영구 삭제. 생략하면 소프트 삭제
   * @returns 없음 (204 No Content)
   *
   * **응답 상태 코드:**
   * - `204 No Content`: 삭제 성공
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 파일이 존재하지 않거나 소유권 없음
   *
   * @example
   * // 소프트 삭제 (휴지통)
   * const res = await client.userFiles.deleteUserFile('file-ulid-123');
   * if (res.isSuccess) {
   *   removeFromUI('file-ulid-123');
   * }
   *
   * @example
   * // 영구 삭제 (복구 불가 — 사용자에게 확인 요청 권장)
   * const confirmed = window.confirm('영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.');
   * if (confirmed) {
   *   await client.userFiles.deleteUserFile('file-ulid-123', true);
   * }
   */
  async deleteUserFile(id: string, permanent?: boolean): Promise<HttpResponse<void>> {
    let b = this.rb.path('files').path(id);
    if (permanent) {
      b = b.query({ permanent: true });
    }
    return b.delete<void>();
  }

  /**
   * 파일 표시 이름 또는 폴더 위치를 변경합니다 (`PATCH /v1/files/:id`).
   *
   * @remarks
   * `displayName`과 `folderId` 중 **최소 하나**는 포함해야 합니다.
   * 두 필드 모두 생략하면 서버가 400 에러를 반환합니다.
   *
   * ### 이름 중복 처리
   * 대상 폴더에 동일한 이름의 파일이 이미 존재하면, 서버가 자동으로
   * `이름(1).ext`, `이름(2).ext` 형태로 조정하여 반환합니다.
   * 클라이언트가 요청한 이름과 **응답의 `displayName`이 다를 수 있으므로**,
   * 항상 응답 `dto.displayName`을 UI에 반영하세요.
   *
   * ### 동명(同名) 변경 안전 처리
   * `a.pdf`를 `a.pdf`로 변경하는 요청은 안전하게 처리되며,
   * `a(1).pdf` 같은 불필요한 접미사가 생성되지 않습니다.
   *
   * ### 폴더 이동
   * `folderId: null`은 **루트(최상위)로 이동**을 의미합니다.
   * `folderId` 필드 자체를 생략하면 현재 폴더를 유지합니다.
   *
   * @param id 파일 ID (ULID)
   * @param patch 변경할 필드 (`displayName`과 `folderId` 중 하나 이상 필수)
   * @returns 갱신된 `UserFileDto`
   *
   * **응답 상태 코드:**
   * - `200 OK`: 변경 성공. 응답의 `displayName`이 자동 조정됐을 수 있음
   * - `400 Bad Request`: 두 필드 모두 생략, `displayName`이 빈 문자열
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `404 Not Found`: 파일 또는 대상 `folderId`가 존재하지 않거나 소유권 없음
   *
   * @example
   * // 이름만 변경
   * const res = await client.userFiles.updateUserFile('file-ulid-123', {
   *   displayName: '최종보고서.pdf',
   * });
   * if (res.isSuccess) {
   *   // 응답의 displayName 사용 (중복 시 서버가 조정했을 수 있음)
   *   setFileName(res.data.displayName);
   * }
   *
   * @example
   * // 루트로 이동 (folderId: null)
   * await client.userFiles.updateUserFile('file-ulid-123', { folderId: null });
   *
   * @example
   * // 이름 변경 + 폴더 이동 동시 처리
   * const res = await client.userFiles.updateUserFile('file-ulid-123', {
   *   displayName: '보고서_최종.pdf',
   *   folderId: 'folder-target',
   * });
   * if (res.isSuccess) {
   *   console.log('이동 완료:', res.data.folderId, res.data.displayName);
   * }
   */
  async updateUserFile(id: string, patch: UserFilePatchDto): Promise<HttpResponse<UserFileDto>> {
    return this.rb.path('files').path(id).patch<UserFileDto>(patch);
  }

  /** 노트와 파일을 합친 사이드바 목록. */
  async listSidebarItems(params?: {
    folderId?: string | null;
    limit?: number;
  }): Promise<HttpResponse<SidebarItemsResponseDto>> {
    let b = this.rb.path('sidebar-items');
    if (params?.folderId !== undefined && params.folderId !== null) {
      b = b.query({ folderId: params.folderId });
    }
    if (params?.limit != null) {
      b = b.query({ limit: params.limit });
    }
    return b.get<SidebarItemsResponseDto>();
  }
}

