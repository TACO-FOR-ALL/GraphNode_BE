import { S3Client } from '@aws-sdk/client-s3';

/**
 * @description Jest VM에서 AWS SDK flexible-checksums dynamic import 오류를 피하는 LocalStack S3 클라이언트.
 * @returns E2E·시드·bundle 검증용 `S3Client`.
 */
export function createE2eS3Client(): S3Client {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-2';
  const endpoint = process.env.AWS_ENDPOINT_URL || 'http://127.0.0.1:4566';

  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}
