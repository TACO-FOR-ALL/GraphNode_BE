import { Readable } from 'stream';

export interface StoragePort {
  /**
   * 데이터를 스토리지에 업로드합니다.
   * @param key 저장할 파일 키 (경로 포함)
   * @param body 저장할 데이터 (문자열, 버퍼, 또는 읽기 가능한 스트림)
   * @param contentType MIME 타입 (기본 application/json)
   * @param options 추가 옵션 (예: bucketType)
   */
  upload(
    key: string,
    body: string | Buffer | Readable,
    contentType?: string,
    options?: { bucketType?: 'payload' | 'file' }
  ): Promise<void>;

  /**
   * JSON 객체를 업로드하는 편의 메서드입니다.
   * @param key 저장할 파일 키
   * @param data 저장할 JSON 객체
   */
  uploadJson(key: string, data: unknown): Promise<void>;

  /**
   * 스토리지에서 데이터를 다운로드하여 스트림으로 반환합니다.
   * @param key 파일 키
   * @param options 추가 옵션 (예: bucketType)
   */
  downloadStream(key: string, options?: { bucketType?: 'payload' | 'file' }): Promise<Readable>;

  /**
   * 스토리지에서 전체 객체를 다운로드합니다 (메타데이터 포함).
   * @param key 객체 키
   * @param options 옵션 (bucketType)
   * @returns 파일 버퍼와 메타데이터
   */
  downloadFile(key: string, options?: { bucketType?: 'payload' | 'file' }): Promise<{ buffer: Buffer; contentType?: string; contentLength?: number }>;

  /**
   * 스토리지에서 JSON 파일을 다운로드하여 파싱된 객체로 반환합니다.
   * @param key 파일 키
   * @param options 추가 옵션 (예: bucketType)
   */
  downloadJson<T>(key: string, options?: { bucketType?: 'payload' | 'file' }): Promise<T>;

  /**
   * 스토리지에서 파일을 삭제합니다.
   * @param key 파일 키
   * @param options 추가 옵션 (예: bucketType)
   */
  delete(key: string, options?: { bucketType?: 'payload' | 'file' }): Promise<void>;

  /**
   * S3 객체에 대한 단건 GET용 Presigned URL을 발급합니다.
   *
   * 브라우저·뷰어가 백엔드를 거치지 않고 객체 바이트를 받을 때 사용합니다.
   * `ResponseContentType` / `ResponseContentDisposition`을 넣으면 서명된 요청과
   * 동일한 쿼리 파라미터로만 다운로드할 수 있으므로, 클라이언트는 반환된 URL을 그대로 열어야 합니다.
   *
   * @param key 객체 키 (`downloadFile` 등과 동일한 버킷 선택 규칙)
   * @param options 만료 시간·버킷 구분·응답 헤더 오버라이드
   */
  getPresignedGetUrl(
    key: string,
    options: {
      expiresInSeconds: number;
      bucketType?: 'payload' | 'file';
      responseContentType?: string;
      responseContentDisposition?: string;
    }
  ): Promise<string>;
}
