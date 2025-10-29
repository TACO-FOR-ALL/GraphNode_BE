/**
 * 모듈: Graph 컴포지션(의존성 조립)
 * 책임: Repo/Service 인스턴스를 조립하고 라우터를 생성해 반환한다.
 */
import type { Router } from 'express';

import { getQdrantAdapter } from '../../infra/db/qdrantClient';
import { loadEnv } from '../../config/env';
import { GraphVectorService } from '../../core/services/GraphVectorService';
import { createGraphRouter } from '../../app/routes/graph';

export function makeGraphRouter() : Router {

    //ENV
    const env = loadEnv();

    //Repositories(Adapter)
    const qdrantAdapter = getQdrantAdapter();
    

    // Services
    const graphService = new GraphVectorService(qdrantAdapter);

    //Router(Factory)
    return createGraphRouter(graphService);

}
