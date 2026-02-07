import { Request, Response } from 'express';
import { AwsS3Adapter } from '../../infra/aws/AwsS3Adapter';
import { ValidationError } from '../../shared/errors/domain';

/**
 * 모듈: FileController
 * 책임: 파일 관련 HTTP 요청을 처리한다.
 *
 * - S3에서 파일 조회 및 스트림 응답 반환
 */
export class FileController {
  private readonly s3Adapter: AwsS3Adapter;

  constructor(deps: { awsS3Adapter: AwsS3Adapter }) {
    // Adapter 직접 의존 (별도 서비스 계층 없음 - 요구사항)
    this.s3Adapter = deps.awsS3Adapter;
  }

  /**
   * 파일 다운로드/조회 핸들러
   * GET /api/v1/ai/files/:key
   */
  async downloadFile(req: Request, res: Response) {
    // req.params.key 에는 '/' 문자가 포함될 수 있으므로, 라우터에서 Wildcard 처리가 필요함 (*).
    // Express 라우터 설정: router.get('/:key(*)', ...) 또는 router.get('/(.*)', ...)
    const key = req.params.key || req.params[0];

    if (!key) {
      throw new ValidationError('File key is required');
    }

    try {
      // S3Adapter에서 스트림 다운로드
      const stream = await this.s3Adapter.downloadStream(key, { bucketType: 'file' });

      // 응답 헤더 설정
      // MIME 타입 추론 로직이 없으므로 기본적으로 octet-stream 또는 브라우저가 해석하도록 둠.
      // S3 Metadata에 ContentType이 있다면 좋겠지만, Adapter `downloadStream` 인터페이스 상 스트림만 반환됨.
      // 필요 시 s3Adapter.headObject 등을 추가 구현해야 하지만, 현재는 최소 기능으로 구현.

      // 단순 파일 제공이므로 Content-Type 명시가 없으면 브라우저가 스니핑하거나 다운로드 처리함.
      // 이미지의 경우 올바르게 렌더링되도록 하려면 확장자 기반 매핑이 필요할 수 있음.
      const filename = key.split('/').pop() || 'file';

      res.setHeader('Content-Disposition', `inline; filename="${filename}"`); // inline: 브라우저 렌더링 시도

      stream.pipe(res);
    } catch (err) {
      // 에러 발생 시 (e.g. NoSuchKey)
      // asyncHandler가 잡아주겠지만, 스트림 시작 전 에러는 여기서 잡힘.
      throw err;
    }
  }
}
