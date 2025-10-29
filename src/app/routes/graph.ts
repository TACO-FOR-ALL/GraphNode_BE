/**
 * 모듈: Graph Routes (팩토리)
 * 책임: 주입된 서비스로 라우터를 생성한다. 의존성 생성은 bootstrap에서 수행.
 */

import { Router } from 'express'

import type { GraphVectorService } from '../../core/services/GraphVectorService'
import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';
import { GraphController } from '../controllers/graph';

/**
 * 라우터 팩토리 함수
 * @param graphService - 그래프 관련 서비스 인스턴스
 * @returns 라우터 객체
 */
export function createGraphRouter(graphService: GraphVectorService) {

    const router = Router();
    const graphController = new GraphController(graphService);

    // 공통 미들웨어 적용: 세션 사용자 바인딩 및 로그인 요구
    router.use(bindSessionUser, requireLogin);


    // 필요한 Graph 관련 라우트들을 여기에 추가
    // TODO : fixme

    //upsert vector route

    //search vector route

    //delete vector route

    return router;
}
