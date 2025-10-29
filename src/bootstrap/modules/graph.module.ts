/**
 * 모듈: Graph 컴포지션(의존성 조립)
 * 책임: Repo/Service 인스턴스를 조립하고 라우터를 생성해 반환한다.
 */
import type { Router } from 'express';

import { getQdrantAdapter } from '../../infra/db/qdrantClient';
import { GraphVectorService } from '../../core/services/GraphVectorService';
import { createAuditProxy } from '../../shared/audit/auditProxy';
import { createGraphRouter } from '../../app/routes/graph';

export function makeGraphRouter() : Router {


    //Repositories(Adapter)
    const qdrantAdapter = getQdrantAdapter();
    

    // Services
    const rawGraphService = new GraphVectorService(qdrantAdapter);
    // Wrap service with audit proxy (summary-only logging)
    const graphService = createAuditProxy(rawGraphService, 'GraphVectorService');

    //Router(Factory)
    return createGraphRouter(graphService);

}
