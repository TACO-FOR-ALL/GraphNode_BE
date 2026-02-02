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

    // 그래프 생성 프로세스 시작 (SQS 요청)
    const taskId = await this.graphGenerationService.requestGraphGenerationViaQueue(userId);

    // 작업 id와 함께 곧바로 반환
    res.status(202).json({
      message: 'Graph generation queued',
      taskId: taskId,
      status: 'queued',
    });
  };

  /**
   * POST /v1/graph-ai/summary
   * 그래프 요약 생성을 요청합니다.
   */
  summarizeGraph = async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);

    // 그래프 요약 프로세스 시작 (SQS 요청)
    // FIXME: 실제 구현 시 GraphGenerationService의 메서드가 SQS 메시지를 발행하도록 구성해야 함
    const taskId = await this.graphGenerationService.requestGraphSummary(userId!);

    res.status(202).json({
      message: 'Graph summary generation queued',
      taskId: taskId,
      status: 'queued',
    });
  };

  /**
   * [테스트용] POST /v1/graph-ai/test/generate-json
   * 클라이언트로부터 직접 JSON 데이터를 받아 그래프 생성을 요청합니다.
   */
  generateGraphTest = async (req: Request, res: Response) => {
    // const userId = getUserIdFromRequest(req);
    const inputData = req.body; // Body 자체가 AiInputData 형식이라고 가정

    // 유효성 검사 (간단하게)
    if (!Array.isArray(inputData)) {
      res
        .status(400)
        .json({ message: 'Invalid input format. Expected an array of conversation objects.' });
      return;
    }

    // WARN: This uses the deprecated direct-processing method which bypasses SQS.
    // Useful for integration testing the AI logic synchronously-ish.
    const taskId = await this.graphGenerationService.generateGraphFromJson(inputData);

    res.status(202).json({
      message: 'Test graph generation started (Direct Mode)',
      taskId: taskId,
      status: 'queued',
    });
  };
}
