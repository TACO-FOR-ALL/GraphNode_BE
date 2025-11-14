/**
 * 모듈: Graph Controller
 * 책임: Graph 관련 HTTP 요청을 처리하고, 서비스 레이어를 호출하여 응답을 반환한다.
 * 외부 의존:
 * - express: Request, Response 타입
 * - GraphService: 그래프 비즈니스 로직
 */

import { Request, Response } from "express";

import { GraphVectorService } from "../../core/services/GraphVectorService";
import { persistGraphPayloadSchema } from "../../shared/dtos/graph.schemas";
import { getUserIdFromRequest } from "../utils/request";

export class GraphController {
    constructor(
        private readonly graphService: GraphVectorService
    ) {}

    // --- Node ---
    async createNode(req: Request, res: Response) {
        const node = req.body;
        const userId = getUserIdFromRequest(req)!;
        await this.graphService.upsertNode({ ...node, userId });
        res.status(201).json(node);
    }

    async getNode(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const nodeId = parseInt(req.params.nodeId, 10);
        const node = await this.graphService.findNode(userId, nodeId);
        res.status(200).json(node);
    }

    async listNodes(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const nodes = await this.graphService.listNodes(userId);
        res.status(200).json(nodes);
    }

    async updateNode(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const nodeId = parseInt(req.params.nodeId, 10);
        const patch = req.body;
        await this.graphService.updateNode(userId, nodeId, patch);
        res.status(204).send();
    }

    async deleteNode(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const nodeId = parseInt(req.params.nodeId, 10);
        await this.graphService.deleteNode(userId, nodeId);
        res.status(204).send();
    }

    async deleteNodeCascade(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const nodeId = parseInt(req.params.nodeId, 10);
        await this.graphService.removeNodeCascade(userId, nodeId);
        res.status(204).send();
    }

    // --- Edge ---
    async createEdge(req: Request, res: Response) {
        const edge = req.body;
        const userId = getUserIdFromRequest(req)!;
        const edgeId = await this.graphService.upsertEdge({ ...edge, userId });
        res.status(201).json({ id: edgeId });
    }

    async listEdges(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const edges = await this.graphService.listEdges(userId);
        res.status(200).json(edges);
    }

    async deleteEdge(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const edgeId = req.params.edgeId;
        await this.graphService.deleteEdge(userId, edgeId);
        res.status(204).send();
    }

    // --- Cluster ---
    async createCluster(req: Request, res: Response) {
        const cluster = req.body;
        const userId = getUserIdFromRequest(req)!;
        await this.graphService.upsertCluster({ ...cluster, userId });
        res.status(201).json(cluster);
    }

    async getCluster(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const clusterId = req.params.clusterId;
        const cluster = await this.graphService.findCluster(userId, clusterId);
        res.status(200).json(cluster);
    }

    async listClusters(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const clusters = await this.graphService.listClusters(userId);
        res.status(200).json(clusters);
    }

    async deleteCluster(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const clusterId = req.params.clusterId;
        await this.graphService.deleteCluster(userId, clusterId);
        res.status(204).send();
    }

    async deleteClusterCascade(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const clusterId = req.params.clusterId;
        await this.graphService.removeClusterCascade(userId, clusterId);
        res.status(204).send();
    }

    // --- Stats ---
    async getStats(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const stats = await this.graphService.getStats(userId);
        res.status(200).json(stats);
    }

    // --- Snapshot ---
    async getSnapshot(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const snapshot = await this.graphService.getSnapshotForUser(userId);
        res.status(200).json(snapshot);
    }

    async saveSnapshot(req: Request, res: Response) {
        const userId = getUserIdFromRequest(req)!;
        const payloadToValidate = {
            userId,
            snapshot: req.body.snapshot,
        };
        const { snapshot } = persistGraphPayloadSchema.parse(payloadToValidate);
        await this.graphService.persistSnapshot({ userId, snapshot });
        res.status(204).send();
    }
}

