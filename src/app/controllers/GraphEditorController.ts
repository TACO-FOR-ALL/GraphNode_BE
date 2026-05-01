/**
 * 모듈: Graph Editor Controller
 * 작성일: 2026-05-01
 *
 * 책임:
 * - /v1/graph/editor/* 엔드포인트의 HTTP 요청을 처리합니다.
 * - Zod 스키마로 요청 본문을 검증하고, GraphEditorService를 호출합니다.
 * - 에러는 반드시 next(e)로 위임합니다. 비즈니스 로직 포함 금지.
 */

import { Request, Response, NextFunction } from 'express';

import { GraphEditorService } from '../../core/services/GraphEditorService';
import {
  createNodeEditorSchema,
  updateNodeEditorSchema,
  createEdgeEditorSchema,
  updateEdgeEditorSchema,
  createClusterEditorSchema,
  updateClusterEditorSchema,
  createSubclusterEditorSchema,
  updateSubclusterEditorSchema,
  moveNodeToClusterSchema,
  moveSubclusterToClusterSchema,
  addNodeToSubclusterSchema,
  batchEditorRequestSchema,
} from '../../shared/dtos/graph.editor.schemas';
import { getUserIdFromRequest } from '../utils/request';

/**
 * Graph Editor HTTP 컨트롤러.
 * 모든 핸들러는 Zod 파싱 → 서비스 호출 → 응답 직렬화만 수행합니다.
 */
export class GraphEditorController {
  constructor(private readonly editorService: GraphEditorService) {}

  // ── Node ──────────────────────────────────────────────

  /**
   * 노드 생성
   * [POST] /v1/graph/editor/nodes
   */
  async createNode(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const dto = createNodeEditorSchema.parse(req.body);
      const result = await this.editorService.createNode(userId, dto);
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  }

  /**
   * 노드 수정
   * [PATCH] /v1/graph/editor/nodes/:nodeId
   */
  async updateNode(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const nodeId = parseInt(req.params.nodeId, 10);
      const dto = updateNodeEditorSchema.parse(req.body);
      await this.editorService.updateNode(userId, nodeId, dto);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  /**
   * 노드 삭제 (소프트 또는 영구)
   * [DELETE] /v1/graph/editor/nodes/:nodeId
   * Query: permanent=true (영구 삭제)
   */
  async deleteNode(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const nodeId = parseInt(req.params.nodeId, 10);
      const permanent = req.query.permanent === 'true';
      await this.editorService.deleteNode(userId, nodeId, permanent);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  // ── Edge ──────────────────────────────────────────────

  /**
   * 엣지 생성
   * [POST] /v1/graph/editor/edges
   */
  async createEdge(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const dto = createEdgeEditorSchema.parse(req.body);
      const result = await this.editorService.createEdge(userId, dto);
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  }

  /**
   * 엣지 수정
   * [PATCH] /v1/graph/editor/edges/:edgeId
   */
  async updateEdge(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const { edgeId } = req.params;
      const dto = updateEdgeEditorSchema.parse(req.body);
      await this.editorService.updateEdge(userId, edgeId, dto);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  /**
   * 엣지 삭제 (소프트 또는 영구)
   * [DELETE] /v1/graph/editor/edges/:edgeId
   * Query: permanent=true (영구 삭제)
   */
  async deleteEdge(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const { edgeId } = req.params;
      const permanent = req.query.permanent === 'true';
      await this.editorService.deleteEdge(userId, edgeId, permanent);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  // ── Cluster ───────────────────────────────────────────

  /**
   * 클러스터 생성
   * [POST] /v1/graph/editor/clusters
   */
  async createCluster(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const dto = createClusterEditorSchema.parse(req.body);
      const result = await this.editorService.createCluster(userId, dto);
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  }

  /**
   * 클러스터 수정
   * [PATCH] /v1/graph/editor/clusters/:clusterId
   */
  async updateCluster(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const { clusterId } = req.params;
      const dto = updateClusterEditorSchema.parse(req.body);
      await this.editorService.updateCluster(userId, clusterId, dto);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  /**
   * 클러스터 삭제
   * [DELETE] /v1/graph/editor/clusters/:clusterId
   * Query: cascade=true (포함 노드+엣지 연쇄 삭제), permanent=true (영구 삭제)
   */
  async deleteCluster(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const { clusterId } = req.params;
      const cascade = req.query.cascade === 'true';
      const permanent = req.query.permanent === 'true';
      await this.editorService.deleteCluster(userId, clusterId, cascade, permanent);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  // ── Subcluster ────────────────────────────────────────

  /**
   * 서브클러스터 생성
   * [POST] /v1/graph/editor/subclusters
   */
  async createSubcluster(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const dto = createSubclusterEditorSchema.parse(req.body);
      const result = await this.editorService.createSubcluster(userId, dto);
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  }

  /**
   * 서브클러스터 수정
   * [PATCH] /v1/graph/editor/subclusters/:subclusterId
   */
  async updateSubcluster(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const { subclusterId } = req.params;
      const dto = updateSubclusterEditorSchema.parse(req.body);
      await this.editorService.updateSubcluster(userId, subclusterId, dto);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  /**
   * 서브클러스터 삭제 (노드는 클러스터에 유지)
   * [DELETE] /v1/graph/editor/subclusters/:subclusterId
   * Query: permanent=true (영구 삭제)
   */
  async deleteSubcluster(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const { subclusterId } = req.params;
      const permanent = req.query.permanent === 'true';
      await this.editorService.deleteSubcluster(userId, subclusterId, permanent);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  // ── Move / Membership ─────────────────────────────────

  /**
   * 노드를 다른 클러스터로 이동
   * [POST] /v1/graph/editor/nodes/:nodeId/move-cluster
   */
  async moveNodeToCluster(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const nodeId = parseInt(req.params.nodeId, 10);
      const dto = moveNodeToClusterSchema.parse(req.body);
      await this.editorService.moveNodeToCluster(userId, nodeId, dto);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  /**
   * 서브클러스터를 다른 클러스터로 이동
   * [POST] /v1/graph/editor/subclusters/:subclusterId/move-cluster
   */
  async moveSubclusterToCluster(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const { subclusterId } = req.params;
      const dto = moveSubclusterToClusterSchema.parse(req.body);
      await this.editorService.moveSubclusterToCluster(userId, subclusterId, dto);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  /**
   * 노드를 서브클러스터에 편입
   * [POST] /v1/graph/editor/subclusters/:subclusterId/nodes
   */
  async addNodeToSubcluster(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const { subclusterId } = req.params;
      const dto = addNodeToSubclusterSchema.parse(req.body);
      await this.editorService.addNodeToSubcluster(userId, subclusterId, dto);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  /**
   * 노드를 서브클러스터에서 제거 (클러스터 멤버십 유지)
   * [DELETE] /v1/graph/editor/subclusters/:subclusterId/nodes/:nodeId
   */
  async removeNodeFromSubcluster(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const { subclusterId } = req.params;
      const nodeId = parseInt(req.params.nodeId, 10);
      await this.editorService.removeNodeFromSubcluster(userId, subclusterId, nodeId);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  }

  // ── Batch ─────────────────────────────────────────────

  /**
   * 배치 트랜잭션 실행 (최대 100개 오퍼레이션, 첫 번째 실패 시 중단)
   * [POST] /v1/graph/editor/transactions
   */
  async executeBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = getUserIdFromRequest(req);
      const dto = batchEditorRequestSchema.parse(req.body);
      const result = await this.editorService.executeBatch(userId, dto);
      res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  }
}
