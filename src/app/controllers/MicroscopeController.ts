import { Request, Response, NextFunction } from 'express';
import { getUserIdFromRequest } from '../utils/request';
import { MicroscopeManagementService } from '../../core/services/MicroscopeManagementService';
import { logger } from '../../shared/utils/logger';

export class MicroscopeController {
  constructor(private microscopeService: MicroscopeManagementService) {}

  /**
   * 워크스페이스를 생성하고 여러 문서를 업로드하여 처리(ingest) 요청을 보냅니다.
   */
  createWorkspaceWithDocuments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, schemaName } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!name) {
        return res.status(400).json({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          detail: 'name is required',
          instance: req.originalUrl
        });
      }

      const filePayloads = (files || []).map(f => ({
        buffer: f.buffer,
        fileName: f.originalname,
        mimeType: f.mimetype
      }));

      const workspace = await this.microscopeService.createWorkspaceWithDocuments(
        getUserIdFromRequest(req)!, // userId injected by auth middleware
        name,
        filePayloads,
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
   * FIXME TODO : Neo4j에서 groupId에 해당하는 실제 그래프 데이터를 반환하는 로직 구현 필요
   */
  getWorkspaceGraph = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { groupId } = req.params;
      // const userId = getUserIdFromRequest(req)!;
      // const graphData = await this.microscopeService.getWorkspaceGraph(userId, groupId);
      // res.status(200).json(graphData);
      res.status(501).json({ message: 'Not Implemented' });
    } catch (err) {
      next(err);
    }
  };

  /**
   * 기존 워크스페이스에 새로운 파일 문서들을 추가하여 처리(ingest) 요청을 보냅니다.
   */
  addDocumentsToWorkspace = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { groupId } = req.params;
      const { schemaName } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          detail: 'No files provided',
          instance: req.originalUrl
        });
      }

      const filePayloads = files.map(f => ({
        buffer: f.buffer,
        fileName: f.originalname,
        mimeType: f.mimetype
      }));

      await this.microscopeService.addDocumentsToExistingWorkspace(getUserIdFromRequest(req)!, groupId, filePayloads, schemaName);

      res.status(202).json({ message: 'Documents are being ingested' });
    } catch (err) {
      next(err);
    }
  };

  /**
   * 워크스페이스를 삭제합니다 (MongoDB + Neo4j 동시에 트랜잭션).
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
