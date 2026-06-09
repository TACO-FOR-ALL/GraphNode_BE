import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { Upload } from '@aws-sdk/lib-storage';

import { StoragePort } from '../../core/ports/StoragePort';
import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { UpstreamError, NotFoundError } from '../../shared/errors/domain';
import { isS3NotFoundError, s3MissingObjectMessage } from '../../shared/utils/s3Error';


/**
 * AWS S3 어댑터
 *
 * StoragePort 인터페이스를 구현하여 S3와의 파일 업로드/다운로드/삭제를 제공합니다.
 */
export class AwsS3Adapter implements StoragePort {
  private readonly client: S3Client;
  private readonly payloadBucket: string;
  private readonly fileBucket: string;

  // 생성자
  constructor() {
    const env = loadEnv();
    this.payloadBucket = env.S3_PAYLOAD_BUCKET;
    this.fileBucket = env.S3_FILE_BUCKET;

    // S3 클라이언트 초기화
    this.client = new S3Client({
      region: env.AWS_REGION,
      endpoint: env.AWS_ENDPOINT_URL, // LocalStack 등 가상 환경 연동용
      forcePathStyle: !!env.AWS_ENDPOINT_URL, // 커스텀 엔드포인트가 있을 때만 Path Style 활성화
      credentials:
        env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.AWS_ACCESS_KEY_ID,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  /**
   * S3에 객체를 업로드합니다.
   * @param key 객체 키
   * @param body 객체 본문
   * @param contentType 콘텐츠 타입
   * @param options 옵션 (bucketType)
   */
  async upload(
    key: string,
    body: string | Buffer | Readable,
    contentType = 'application/json',
    options?: { bucketType?: 'payload' | 'file' }
  ): Promise<void> {
    const bucket = options?.bucketType === 'file' ? this.fileBucket : this.payloadBucket;
    try {
      const parallelUploads3 = new Upload({
        client: this.client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        },
      });

      await parallelUploads3.done();
    } catch (error) {
      logger.error({ err: error, key, bucket }, 'Failed to upload to S3');
      throw new UpstreamError('Failed to upload to S3', { originalError: error });
    }
  }

  /**
   * S3에 JSON 객체를 업로드합니다.
   * @param key 객체 키
   * @param data JSON 데이터
   */
  async uploadJson(key: string, data: unknown): Promise<void> {
    const jsonString = JSON.stringify(data);
    await this.upload(key, jsonString, 'application/json');
  }

  /**
   * S3에서 객체를 스트림으로 다운로드합니다.
   * @param key 객체 키
   * @param options 옵션 (bucketType)
   * @returns Readable 스트림
   */
  async downloadStream(
    key: string,
    options?: { bucketType?: 'payload' | 'file' }
  ): Promise<Readable> {
    const bucket = options?.bucketType === 'file' ? this.fileBucket : this.payloadBucket;
    try {
      // GetObjectCommand 생성
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      // S3 클라이언트를 사용하여 명령 실행
      const response = await this.client.send(command);

      if (!response.Body) {
        throw new Error(`Empty body received from S3 for key: ${key}`);
      }

      // AWS SDK v3의 Body는 IncomingMessage가 아닐 수 있으므로 변환 필요
      // Node.js 환경에서 Body는 sdk-stream-mixin이 적용된 Readable 호환 객체임
      return response.Body as Readable;
    } catch (error) {
      logger.error({ err: error, key, bucket }, 'Failed to download stream from S3');
      throw new UpstreamError('Failed to download stream from S3', { originalError: error });
    }
  }

  /**
   * S3에서 객체를 전체 버퍼로 다운로드합니다.
   * 메타데이터(ContentType, ContentLength)도 함께 반환합니다.
   * stream 방식 대비 작은 파일에 적합하며, HTTP 응답에 Content-Type/Length 헤더를 온전히 설정해야 할 때 사용합니다.
   *
   * @param key 객체 키
   * @param options 옵션 (bucketType)
   * @returns 파일 버퍼, ContentType, ContentLength
   */
  async downloadFile(
    key: string,
    options?: { bucketType?: 'payload' | 'file' }
  ): Promise<{ buffer: Buffer; contentType?: string; contentLength?: number }> {
    const bucket = options?.bucketType === 'file' ? this.fileBucket : this.payloadBucket;
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new Error(`Empty body received from S3 for key: ${key}`);
      }

      // 스트림을 버퍼로 완전히 수집 (메타데이터 동시 획득)
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve());
      });

      return {
        buffer: Buffer.concat(chunks),
        contentType: response.ContentType,
        contentLength: response.ContentLength,
      };
    } catch (error) {
      if (isS3NotFoundError(error)) {
        throw new NotFoundError(s3MissingObjectMessage(key), { key, bucket });
      }
      logger.error({ err: error, key, bucket }, 'Failed to download file from S3');
      throw new UpstreamError('Failed to download file from S3', { originalError: error });
    }
  }

  /**
   * S3에서 JSON 객체를 다운로드합니다.
   * @param key 객체 키
   * @param options 옵션 (bucketType)
   * @returns JSON 객체
   */
  async downloadJson<T>(
    key: string,
    options?: { bucketType?: 'payload' | 'file' }
  ): Promise<T> {
    // 스트림 다운로드
    const stream: Readable = await this.downloadStream(key, options);

    // 스트림을 버퍼로 변환 후 JSON 파싱
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []; // 버퍼 청크 배열

      // 스트림 이벤트 처리
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk))); // 데이터 청크 수집
      stream.on('error', (err) => reject(err)); // 에러 처리
      stream.on('end', () => {
        // 스트림 종료 시
        try {
          // 청크들을 하나의 버퍼로 결합
          const buffer = Buffer.concat(chunks);
          const json = JSON.parse(buffer.toString('utf-8'));
          resolve(json as T);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * S3에서 객체를 삭제합니다.
   * @param key 객체 키
   * @param options 옵션 (bucketType)
   */
  async delete(key: string, options?: { bucketType?: 'payload' | 'file' }): Promise<void> {
    const bucket = options?.bucketType === 'file' ? this.fileBucket : this.payloadBucket;
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      await this.client.send(command);
    } catch (error) {
      logger.error({ err: error, key, bucket }, 'Failed to delete from S3');
      throw new UpstreamError('Failed to delete from S3', { originalError: error });
    }
  }

  /**
   * 단건 객체 GET용 Presigned URL을 생성합니다.
   *
   * 실제 HTTP 요청 시 서명에 포함된 응답 헤더 파라미터와 일치해야 하므로,
   * `responseContentType` 등을 넘긴 경우 클라이언트는 반환 URL을 수정하지 말고 그대로 사용해야 합니다.
   */
  async getPresignedGetUrl(
    key: string,
    options: {
      expiresInSeconds: number;
      bucketType?: 'payload' | 'file';
      responseContentType?: string;
      responseContentDisposition?: string;
    }
  ): Promise<string> {
    const bucket = options.bucketType === 'file' ? this.fileBucket : this.payloadBucket;
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(options.responseContentType
          ? { ResponseContentType: options.responseContentType }
          : {}),
        ...(options.responseContentDisposition
          ? { ResponseContentDisposition: options.responseContentDisposition }
          : {}),
      });

      return await getSignedUrl(this.client, command, {
        expiresIn: options.expiresInSeconds,
      });
    } catch (error) {
      logger.error({ err: error, key, bucket }, 'Failed to create presigned GET URL');
      throw new UpstreamError('Failed to create presigned GET URL', { originalError: error });
    }
  }
}
