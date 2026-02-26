import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { FileUploadResponse } from '../types/file.js';

/**
 * File API
 *
 * 파일 업로드 및 다운로드를 처리하는 API 클래스.
 * 백엔드 `/api/v1/ai/files` 엔드포인트와 연동합니다.
 *
 * ## 파일 키(key) 구조
 * - **chat-files/**: AI 채팅 중 업로드된 파일 (서버 내부 처리)
 * - **sdk-files/**: SDK를 통해 직접 업로드된 파일
 *
 * 형식: `{prefix}/{uuid}-{originalFilename}`
 *
 * @public
 */
export class FileApi {
  private readonly rb: RequestBuilder;

  /**
   * FileApi 인스턴스를 생성합니다.
   * @param rb RequestBuilder 인스턴스
   * @internal
   */
  constructor(rb: RequestBuilder) {
    this.rb = rb.path('/api/v1/ai/files');
  }

  /**
   * S3 스토리지에 여러 파일을 업로드합니다.
   *
   * `multipart/form-data`로 전송하며, 업로드된 각 파일에 대한
   * 메타데이터(id, url, name, mimeType, size)를 배열로 반환합니다.
   * 반환된 `url` 필드가 파일 조회 시 사용할 `key`입니다.
   *
   * **API Endpoint**: `POST /api/v1/ai/files`
   *
   * @param files 업로드할 File 또는 Blob 객체 배열
   * @returns 업로드된 파일의 메타데이터 배열 (`FileUploadResponse`)
   *
   * @example
   * ```typescript
   * const input = document.querySelector('input[type="file"]');
   * const files = Array.from(input.files);
   *
   * const res = await client.file.uploadFiles(files);
   * if (res.isSuccess) {
   *   const key = res.data.attachments[0].url;   // 🔑 다운로드 시 이 key를 사용
   *   console.log('업로드 완료:', key);
   * }
   * ```
   */
  async uploadFiles(files: File[] | Blob[]): Promise<HttpResponse<FileUploadResponse>> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    return this.rb.post<FileUploadResponse>(formData);
  }

  /**
   * 파일 키(key)를 사용하여 파일을 다운로드합니다.
   *
   * 서버에서 반환하는 Content-Type을 자동으로 감지하여
   * 브라우저 환경에서는 `Blob`, Node.js 환경에서는 `ArrayBuffer`로 파일 데이터를 반환합니다.
   * FE는 단순히 메서드를 호출하기만 하면 알아서 처리됩니다.
   *
   * **API Endpoint**: `GET /api/v1/ai/files/:key`
   *
   * @param key 다운로드할 파일의 고유 키 (예: `sdk-files/uuid-image.png`, `chat-files/uuid-doc.pdf`)
   *            업로드 시 반환된 `url` 필드값을 그대로 사용합니다.
   * @returns 파일의 `Blob` 객체를 담은 `HttpResponse<Blob>`
   *          - `isSuccess: true`일 때 `data`가 Blob
   *          - `isSuccess: false`일 때 `error` (404, 401 등)
   *
   * @example
   * ```typescript
   * // 이미지 다운로드 및 화면에 표시
   * const res = await client.file.getFile('sdk-files/abc123-image.png');
   * if (res.isSuccess) {
   *   const url = URL.createObjectURL(res.data);
   *   document.getElementById('img').src = url;
   * }
   *
   * // PDF 강제 다운로드
   * const res = await client.file.getFile('sdk-files/abc123-doc.pdf');
   * if (res.isSuccess) {
   *   const href = URL.createObjectURL(res.data);
   *   const a = document.createElement('a');
   *   a.href = href;
   *   a.download = 'document.pdf';
   *   a.click();
   * }
   *
   * // 에러 처리
   * if (!res.isSuccess) {
   *   if (res.error.statusCode === 404) alert('파일을 찾을 수 없습니다.');
   *   if (res.error.statusCode === 401) alert('로그인이 필요합니다.');
   * }
   * ```
   */
  async getFile(key: string): Promise<HttpResponse<Blob>> {
    try {
      // sendRaw를 사용하면 JSON 파싱 없이 raw Response 객체를 얻을 수 있습니다.
      // Content-Type: image/png, application/pdf 등 바이너리 응답을 직접 처리하기 위해 필요합니다.
      const res = await this.rb.path(`/${key}`).sendRaw('GET');

      if (!res.ok) {
        // 4xx, 5xx 에러: 에러 본문을 텍스트로 읽어서 error payload로 전달
        let errorBody: unknown = undefined;
        try {
          errorBody = await res.json();
        } catch {
          errorBody = await res.text();
        }
        return {
          isSuccess: false,
          error: {
            statusCode: res.status,
            message: `HTTP ${res.status}: ${res.statusText}`,
            body: errorBody,
          },
        };
      }

      // 성공 시: 응답을 Blob으로 변환
      // Blob은 브라우저/Node.js 18+ 환경 모두에서 지원되며,
      // URL.createObjectURL() 또는 Buffer.from()으로 변환 가능합니다.
      const blob = await res.blob();
      return {
        isSuccess: true,
        statusCode: res.status,
        data: blob,
      };
    } catch (e) {
      const err = e as Error;
      return {
        isSuccess: false,
        error: {
          statusCode: 0,
          message: err.message,
        },
      };
    }
  }
}
