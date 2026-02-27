/**
 * 모듈: Graph 컴포지션(의존성 조립)
 * 책임: Repo/Service 인스턴스를 조립하고 라우터를 생성해 반환한다.
 */
import type { Router } from 'express';

import { createGraphRouter } from '../../app/routes/GraphRouter';
import { container } from '../container';

export function makeGraphRouter(): Router {
  const graphEmbeddingService = container.getGraphEmbeddingService();

  //Router(Factory) - expose composite (or graphService) to router as appropriate
  return createGraphRouter(graphEmbeddingService);
}
