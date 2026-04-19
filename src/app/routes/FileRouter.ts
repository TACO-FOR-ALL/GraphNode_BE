import { Router } from 'express';
import multer from 'multer';

import { FileController } from '../controllers/FileController';
import { asyncHandler } from '../utils/asyncHandler';
import { AwsS3Adapter } from '../../infra/aws/AwsS3Adapter';

const upload = multer({ storage: multer.memoryStorage() });

/**
 * AI 파일 업로드/다운로드 라우터.
 * `/api/v1/ai/files` 에 마운트된다.
 * req.params[0] 으로 S3 key를 추출하므로 마운트 경로가 key prefix에 포함되지 않는다.
 */
export function createFileRouter(deps: { awsS3Adapter: AwsS3Adapter }) {
  const router = Router();
  const controller = new FileController(deps);

  router.post('/', upload.array('files'), asyncHandler(controller.uploadFiles.bind(controller)));
  router.get(/^\/(.*)/, asyncHandler(controller.downloadFile.bind(controller)));

  return router;
}

/**
 * 파일 프록시 라우터.
 * `/feedback-files`, `/chat-files`, `/sdk-files` 처럼 S3 key prefix와 동일한
 * 경로에 마운트하여, `{domain}/{s3-key}` 형태의 URL로 브라우저가 직접 파일을
 * 렌더링할 수 있게 한다.
 *
 * req.baseUrl + req.path 로 S3 key 전체를 복원하기 때문에
 * 마운트 경로 이름이 곧 S3 key prefix와 일치해야 한다.
 */
export function createFileProxyRouter(deps: { awsS3Adapter: AwsS3Adapter }): Router {
  const router = Router();
  const controller = new FileController(deps);

  router.get(/^\/.*/, asyncHandler(controller.downloadFileByFullPath.bind(controller)));

  return router;
}
