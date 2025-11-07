import type { GraphStore, GraphNode, GraphEdge } from '../ports/GraphStore';
import { ValidationError, UpstreamError } from '../../shared/errors/domain';
import { AppError } from '../../shared/errors/base';

/**
 * GraphService: graph persistence and basic graph queries.
 * - Delegates to GraphStore (port) for DB operations.
 */
export class GraphService {
  constructor(private repo: GraphStore) {}

  /**
   * Create or upsert a node.
   * @param node GraphNode
   * @throws {ValidationError|UpstreamError}
   */
  async createNode(node: GraphNode): Promise<void> {
    try {
      if (!node || !node.id || !node.userId) throw new ValidationError('node.id and node.userId required');
      await this.repo.createNode(node);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.createNode failed', { cause: String(err) });
    }
  }

  /**
   * Update node fields
   * @param nodeId
   * @param patch
   * @throws {ValidationError|UpstreamError}
   */
  async updateNode(nodeId: string, patch: Partial<GraphNode>): Promise<void> {
    try {
      if (!nodeId) throw new ValidationError('nodeId required');
      await this.repo.updateNode(nodeId, patch);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.updateNode failed', { cause: String(err) });
    }
  }

  /**
   * Delete node and its incident edges
   * @param nodeId
   * @throws {ValidationError|UpstreamError}
   */
  async deleteNode(nodeId: string): Promise<void> {
    try {
      if (!nodeId) throw new ValidationError('nodeId required');
      await this.repo.deleteNode(nodeId);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.deleteNode failed', { cause: String(err) });
    }
  }

  /**
   * Add an edge (bidirectional semantics maintained by storage)
   * @param edge
   * @throws {ValidationError|UpstreamError}
   */
  async addEdge(edge: GraphEdge): Promise<void> {
    try {
      if (!edge.from || !edge.to || !edge.userId) throw new ValidationError('edge.from, edge.to and edge.userId required');
      await this.repo.addEdge(edge);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.addEdge failed', { cause: String(err) });
    }
  }

  /**
   * Remove an edge by its ID.
   * @param edgeId - The ID of the edge to remove.
   * @throws {ValidationError|UpstreamError}
   */
  async removeEdgeById(edgeId: string): Promise<void> {
    try {
      if (!edgeId) throw new ValidationError('edgeId required');
      await this.repo.removeEdgeById(edgeId);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.removeEdgeById failed', { cause: String(err) });
    }
  }

  /**
   * Remove an edge between two nodes.
   * @param from - The ID of the source node.
   * @param to - The ID of the target node.
   */
  async removeEdgeBetween(from: string, to: string): Promise<void> {
    try {
      if (!from || !to) throw new ValidationError('from and to required');
      await this.repo.removeEdgeBetween(from, to);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.removeEdgeBetween failed', { cause: String(err) });
    }
  }

  /**
   * Get a node by its ID.
   * @param nodeId - The ID of the node to retrieve.
   * @returns The requested node, if found.
   */
  async getNodeById(nodeId: string) {
    try {
      if (!nodeId) throw new ValidationError('nodeId required');
      return await this.repo.getNodeById(nodeId);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.getNodeById failed', { cause: String(err) });
    }
  }

  /**
   * Get the neighbors of a node.
   * @param nodeId - The ID of the node to retrieve neighbors for.
   * @param opts - Options for the query (e.g., direction, limit).
   * @returns An array of neighboring nodes.
   */
  async getNeighbors(nodeId: string, opts?: { direction?: 'both' | 'out' | 'in'; limit?: number }) {
    try {
      if (!nodeId) throw new ValidationError('nodeId required');
      return await this.repo.getNeighbors(nodeId, opts);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.getNeighbors failed', { cause: String(err) });
    }
  }

  /**
   * Get a subgraph rooted at a specific node.
   * @param rootId - The ID of the root node.
   * @param depth - The depth of the subgraph.
   * @param opts - Options for the query (e.g., maxNodes).
   * @returns The requested subgraph.
   */
  async getSubgraph(rootId: string, depth: number, opts?: { maxNodes?: number }) {
    try {
      if (!rootId) throw new ValidationError('rootId required');
      return await this.repo.getSubgraph(rootId, depth, opts);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('GraphService.getSubgraph failed', { cause: String(err) });
    }
  }
}
