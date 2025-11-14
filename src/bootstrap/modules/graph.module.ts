/**
 * 모듈: Graph 컴포지션(의존성 조립)
 * 책임: Repo/Service 인스턴스를 조립하고 라우터를 생성해 반환한다.
 */
import type { Router } from 'express';

import { GraphVectorService } from '../../core/services/GraphVectorService';
import { createAuditProxy } from '../../shared/audit/auditProxy';
import { createGraphRouter } from '../../app/routes/graph';
import { GraphRepositoryMongo } from '../../infra/repositories/GraphRepositoryMongo';
import { GraphService } from '../../core/services/GraphService';


export function makeGraphRouter() : Router {


    //Repositories(Adapter)
    const graphRepo = new GraphRepositoryMongo();

    // Services
    const rawGraphService = new GraphService(graphRepo);

    // wrap with audit proxies so service method calls are audited
    const graphService = createAuditProxy(rawGraphService, 'GraphService');

    // Composite service (graph + vector)
    const rawGraphVector = new GraphVectorService(graphService);
    const graphVectorService = createAuditProxy(rawGraphVector, 'GraphVectorService');

    

    //Router(Factory) - expose composite (or graphService) to router as appropriate
    return createGraphRouter(graphVectorService);

}
