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
    const { includeSummary, summaryLanguage, inputType, extraS3Keys } = req.body || {};

    // 그래프 생성 프로세스 시작 (SQS 요청)
    const taskId = await this.graphGenerationService.requestGraphGenerationViaQueue(userId, { 
      includeSummary, 
      summaryLanguage,
      inputType,
      extraS3Keys
    });

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
    const taskId = await this.graphGenerationService.requestGraphSummary(userId!);

    res.status(202).json({
      message: 'Graph summary generation queued',
      taskId: taskId,
      status: 'queued',
    });
  };

  /**
   * GET /v1/graph-ai/summary
   * 생성된 그래프 요약을 조회합니다.
   */
  getSummary = async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    const summary = await this.graphGenerationService.getGraphSummary(userId!);

    res.status(200).json(summary);
  };



  /**
   * POST /v1/graph-ai/add-node
   * 신규 또는 업데이트된 대화를 기존 그래프에 추가합니다. (배치)
   */
  addNodeToGraph = async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);

    const taskId = await this.graphGenerationService.requestAddNodeViaQueue(userId);

    if (!taskId) {
        res.status(200).json({
            message: 'No updated conversations found to add',
            status: 'skipped'
        });
        return;
    }

    res.status(202).json({
      message: 'Add node to graph queued',
      taskId: taskId,
      status: 'queued',
    });
  };

  /**
   * DELETE /v1/graph-ai
   * 사용자의 모든 지식 그래프 데이터를 영구 삭제합니다.
   *
   * @param req Request
   * @param res Response
   * @throws {UpstreamError} UPSTREAM_ERROR DB 내부 삭제 실패 시
   * @example
   * await graphAiController.deleteGraph(req, res);
   * // status 204
   * @remarks
   * - 트랜잭션: 연결된 모든 노드, 엣지, 서브클러스터, 통계 등을 일괄 삭제합니다.
   */
  deleteGraph = async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    const permanent = req.query.permanent === 'true';
    await this.graphGenerationService.deleteGraph(userId!, permanent);
    res.status(204).send();
  };

  /**
   * POST /v1/graph-ai/restore
   * 사용자의 모든 지식 그래프 데이터를 복구합니다.
   *
   * @param req Request
   * @param res Response
   */
  restoreGraph = async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    await this.graphGenerationService.restoreGraph(userId!);
    res.status(200).json({ message: 'Graph restored' });
  };

  /**
   * DELETE /v1/graph-ai/summary
   * 사용자의 지식 그래프 요약 정보를 영구 삭제합니다.
   *
   * @param req Request
   * @param res Response
   * @throws {UpstreamError} UPSTREAM_ERROR DB 내부 삭제 실패 시
   * @example
   * await graphAiController.deleteSummary(req, res);
   * // status 204
   * @remarks
   * - 단순 서머리 도큐먼트 삭제 액션입니다.
   */
  deleteSummary = async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    const permanent = req.query.permanent === 'true';
    await this.graphGenerationService.deleteGraphSummary(userId!, permanent);
    res.status(204).send();
  };

  /**
   * POST /v1/graph-ai/summary/restore
   * 지식 그래프 요약 정보를 복구합니다.
   *
   * @param req Request
   * @param res Response
   */
  restoreSummary = async (req: Request, res: Response) => {
    const userId = getUserIdFromRequest(req);
    await this.graphGenerationService.restoreGraphSummary(userId!);
    res.status(200).json({ message: 'Summary restored' });
  };
}
