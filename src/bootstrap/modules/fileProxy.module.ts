import { Router } from 'express';

import { createFileProxyRouter } from '../../app/routes/FileRouter';
import { container } from '../container';
import { AwsS3Adapter } from '../../infra/aws/AwsS3Adapter';

/**
 * 파일 프록시 라우터 팩토리.
 * `/feedback-files`, `/chat-files`, `/sdk-files` 경로에 각각 마운트한다.
 */
export function makeFileProxyRouter(): Router {
  const awsS3Adapter = container.getAwsS3Adapter() as AwsS3Adapter;
  return createFileProxyRouter({ awsS3Adapter });
}
