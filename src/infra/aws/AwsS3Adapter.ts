import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

import { StoragePort } from '../../core/ports/StoragePort';
import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { UpstreamError } from '../../shared/errors/domain';

/**
 * AWS S3 어댑터
 *
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
      // PutObjectCommand 생성
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      });

      // S3 클라이언트를 사용하여 명령 실행
      await this.client.send(command);
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
}
