import { Request, Response, NextFunction } from 'express';
import { getUserIdFromRequest } from '../utils/request';
import { MicroscopeManagementService } from '../../core/services/MicroscopeManagementService';
import { MicroscopeWorkspaceMetaDoc } from '../../core/types/persistence/microscope_workspace.persistence';
import { captureEvent, POSTHOG_EVENT } from '../../shared/utils/posthog';

export class MicroscopeController {
  constructor(private microscopeService: MicroscopeManagementService) {}

  /**
   * (신규) 지정된 노드(Note/Conversation)를 바탕으로 워크스페이스를 생성하고 처리(ingest) 요청을 보냅니다.
   */
  ingestFromNode = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nodeId, nodeType, schemaName } = req.body;

      if (!nodeId || !nodeType) {
        return res.status(400).json({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          detail: 'nodeId and nodeType are required',
          instance: req.originalUrl
        });
      }

      const workspace : MicroscopeWorkspaceMetaDoc= await this.microscopeService.createWorkspaceAndMicroscopeIngestFromNode(
        getUserIdFromRequest(req)!, 
        nodeId,
        nodeType,
        schemaName
      );

      captureEvent(getUserIdFromRequest(req)!, POSTHOG_EVENT.MICROSCOPE_INGEST_REQUESTED, { 
        node_id: nodeId, 
        node_type: nodeType,
        schema_name: schemaName 
      });
      res.status(201).json(workspace);
    } catch (err) {
      next(err);
    }
  };

  /**
   * 유저의 모든 현존 워크스페이스 목록을 조회합니다.
   */
  listWorkspaces = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaces = await this.microscopeService.listWorkspaces(getUserIdFromRequest(req)!);
      res.status(200).json(workspaces);
    } catch (err) {
      next(err);
    }
  };

  /**
   * 단일 워크스페이스 상세 정보를 조회합니다.
   */
  getWorkspace = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { groupId } = req.params;
      const workspace = await this.microscopeService.getWorkspaceActivity(getUserIdFromRequest(req)!, groupId);
      res.status(200).json(workspace);
    } catch (err) {
      next(err);
    }
  };

  /**
   * 워크스페이스의 실제 그래프 데이터(Nodes & Edges)를 조회합니다.
   */
  getWorkspaceGraph = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { groupId } = req.params;
      const userId = getUserIdFromRequest(req)!;
      const graphData = await this.microscopeService.getWorkspaceGraph(userId, groupId);
      res.status(200).json(graphData);
    } catch (err) {
      next(err);
    }
  };

  /**
   * 특정 노드 ID로 가장 최근에 요청된 Ingest의 워크스페이스 메타데이터를 반환합니다.
   * FE에서 워크스페이스 ID 없이도 ingest 진행 상태를 추적할 때 사용합니다.
   *
   * @description
   * `documents.createdAt DESC` 정렬을 사용하여 가장 최근에 생성된 Document를 포함하는 워크스페이스를 반환합니다.
   * 반환된 워크스페이스의 `documents` 배열에서 `documents.find(d => d.nodeId === nodeId)`로
   * 특정 Document를 추출한 뒤 `status` 필드를 확인하십시오.
   *
   * @param req.params.nodeId 조회할 노드 ID (Note 또는 Conversation의 _id)
   * @returns 200 MicroscopeWorkspaceMetaDoc — 워크스페이스 메타데이터 전체
   * @throws 404 해당 nodeId로 생성된 워크스페이스가 존재하지 않을 때
   * @throws 502 DB 조회 실패 시
   */
  getLatestWorkspaceByNodeId = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nodeId } = req.params;
      const userId = getUserIdFromRequest(req)!;
      const workspace = await this.microscopeService.getLatestWorkspaceByNodeId(userId, nodeId);
      res.status(200).json(workspace);
    } catch (err) {
      next(err);
    }
  };

  /**
   * (신규) 특정 노드 ID와 연계된 가장 최신의 Microscope 그래프 데이터를 조회합니다.
   */
  getLatestGraphByNodeId = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nodeId } = req.params;
      const userId = getUserIdFromRequest(req)!;
      const graphData = await this.microscopeService.getLatestGraphByNodeId(userId, nodeId);
      res.status(200).json(graphData);
    } catch (err) {
      next(err);
    }
  };

  /**
   * 워크스페이스 삭제
   */
  deleteWorkspace = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { groupId } = req.params;
      await this.microscopeService.deleteWorkspace(getUserIdFromRequest(req)!, groupId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

}
