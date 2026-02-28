/**
 * 모듈: File 컴포지션 (의존성 조립)
 *
 * 책임:
 * - File 관련 .
 * - 최종적으로 Express Router를 생성하여 반환합니다.
 * - 의존성 주입(Dependency Injection)의 시작점 역할을 합니다.
 */

import { Router } from 'express';

import { createFileRouter } from '../../app/routes/FileRouter';
import { container } from '../container';
import { AwsS3Adapter } from '../../infra/aws/AwsS3Adapter';

/**
 * File 라우터 생성 팩토리 함수
 *
 * @returns 조립이 완료된 Express Router 객체
 */
export function makeFileRouter(): Router {
  const awsS3Adapter = container.getAwsS3Adapter() as AwsS3Adapter;

  // 3. Router 생성 (Service 주입) 및 반환
  return createFileRouter({ awsS3Adapter });
}
