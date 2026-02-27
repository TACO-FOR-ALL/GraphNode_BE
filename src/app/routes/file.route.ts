import { Router } from 'express';
import multer from 'multer';

import { FileController } from '../controllers/file.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { AwsS3Adapter } from '../../infra/aws/AwsS3Adapter';

const upload = multer({ storage: multer.memoryStorage() });

/**
 * 모듈: File 라우터 팩토리
 * 책임: FileController를 생성하고 라우팅을 설정한다.
 */
export function createFileRouter(deps: { awsS3Adapter: AwsS3Adapter }) {
  const router = Router();
  const controller = new FileController(deps);

  // 파일 업로드 라우트
  router.post('/', upload.array('files'), asyncHandler(controller.uploadFiles.bind(controller)));

  // 파일 다운로드 라우트
  // :key(*) 패턴을 사용하여 슬래시가 포함된 경로(예: chat-files/uuid-image.png)를 캡처
  router.get(/^\/(.*)/, asyncHandler(controller.downloadFile.bind(controller)));

  return router;
}
