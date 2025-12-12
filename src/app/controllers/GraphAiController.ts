import { Request, Response } from 'express';

import { GraphGenerationService } from '../../core/services/GraphGenerationService';
import { getUserIdFromRequest } from '../utils/request';

export class GraphAiController {
    constructor(private readonly graphGenerationService: GraphGenerationService) {}

    /**
     * post /v1/graph-ai/generate
     * @param req 
     * @param res 
     */
    generateGraph = async (req: Request, res: Response) => {

        // 세션에서 사용자 ID 가져오기
        const userId = getUserIdFromRequest(req);

        // 그래프 생성 프로세스 시작
        const taskId = await this.graphGenerationService.generateGraphForUser(userId);

        // 작업 id와 함께 곧바로 반환
        res.status(202).json({
        message: 'Graph generation started',
        taskId: taskId,
        status: 'queued'
        });
    };
}
