import { Request, Response, NextFunction } from 'express';
import { getUserIdFromRequest } from '../utils/request';
import { MicroscopeManagementService } from '../../core/services/MicroscopeManagementService';
import { logger } from '../../shared/utils/logger';
import { MicroscopeWorkspaceMetaDoc } from '../../core/types/persistence/microscope_workspace.persistence';

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
