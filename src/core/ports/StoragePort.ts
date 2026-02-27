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
}
