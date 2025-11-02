import { randomUUID } from 'crypto';

import { getMongo } from '../db/mongodb';
import type { GraphStore, GraphNode, GraphEdge } from '../../core/ports/GraphStore';
import { UpstreamError, ValidationError, NotFoundError } from '../../shared/errors/domain';

/**
 * MongoDB implementation of GraphStore.
 * - nodes in collection `graph_nodes`
 * - edges in collection `graph_edges`
 *
 * Bidirectional adjacency is modeled by storing edges as documents with `from` and `to`.
 * Neighbor queries look up edges where from==id OR to==id.
 */
export class GraphRepositoryMongo implements GraphStore {
  private db() {
    return getMongo().db();
  }

  private col() {
    return this.db().collection('graph_nodes');
  }

  /**
   * Create a new graph node.
   * @param node - The graph node to create.
   */
  async createNode(node: GraphNode): Promise<void> {
    try {
      const doc = { ...node, _id: node.id, createdAt: node.createdAt ?? new Date().toISOString(), updatedAt: node.updatedAt ?? new Date().toISOString() };
      await this.col().updateOne({ _id: node.id as any, userId: node.userId } as any, { $set: doc }, { upsert: true });
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.createNode failed', { cause: String(err) });
    }
  }

  /**
   * Update an existing graph node.
   * @param nodeId - The ID of the node to update.
   * @param patch - Partial node data to update.
   */
  async updateNode(nodeId: string, patch: Partial<GraphNode>): Promise<void> {
    try {
      const update = { ...patch, updatedAt: new Date().toISOString() };
  const res = await this.col().updateOne({ _id: nodeId as any } as any, { $set: update });
      if (res.matchedCount === 0) throw new NotFoundError('Node not found');
    } catch (err: unknown) {
      if (err instanceof NotFoundError) throw err;
      throw new UpstreamError('GraphRepositoryMongo.updateNode failed', { cause: String(err) });
    }
  }

  /**
   * Delete a graph node.
   * @param nodeId - The ID of the node to delete.
   */
  async deleteNode(nodeId: string): Promise<void> {
    try {
  await this.col().deleteOne({ _id: nodeId as any } as any);
      // also delete related edges
      await this.db().collection('graph_edges').deleteMany({ $or: [{ from: nodeId }, { to: nodeId }] });
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteNode failed', { cause: String(err) });
    }
  }

  /**
   * Add a graph edge.
   * @param edge - The graph edge to add.
   */
  async addEdge(edge: GraphEdge): Promise<void> {
    try {
      if (!edge.from || !edge.to) throw new ValidationError('edge.from and edge.to required');
      const doc: any = { ...edge, createdAt: edge.createdAt ?? new Date().toISOString() };
  // generate id if not provided
  if (!doc.id) doc._id = randomUUID(); else doc._id = doc.id;
      await this.db().collection('graph_edges').insertOne(doc);
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      throw new UpstreamError('GraphRepositoryMongo.addEdge failed', { cause: String(err) });
    }
  }

  /**
   * Remove a graph edge by its ID.
   * @param edgeId - The ID of the edge to remove.
   */
  async removeEdgeById(edgeId: string): Promise<void> {
    try {
  await this.db().collection('graph_edges').deleteOne({ _id: edgeId as any } as any);
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.removeEdgeById failed', { cause: String(err) });
    }
  }

  /**
   * Remove a graph edge between two nodes.
   * @param from - The ID of the source node.
   * @param to - The ID of the target node.
   */
  async removeEdgeBetween(from: string, to: string): Promise<void> {
    try {
      await this.db().collection('graph_edges').deleteMany({ $or: [{ from, to }, { from: to, to: from }] });
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.removeEdgeBetween failed', { cause: String(err) });
    }
  }

  /**
   * Get a graph node by its ID.
   * @param nodeId - The ID of the node to retrieve.
   * @returns The graph node, or null if not found.
   */
  async getNodeById(nodeId: string): Promise<GraphNode | null> {
    try {
  const doc = await this.col().findOne({ _id: nodeId as any } as any);
  if (!doc) return null;
  const { _id, ...rest } = doc as any;
  return { id: String(_id), ...rest } as GraphNode;
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.getNodeById failed', { cause: String(err) });
    }
  }

  /**
   * Get the neighbors of a graph node.
   * @param nodeId - The ID of the node to retrieve neighbors for.
   * @param opts - Options for the query.
   * @returns An array of neighboring graph nodes.
   */
  async getNeighbors(nodeId: string, opts?: { direction?: 'both' | 'out' | 'in'; limit?: number }): Promise<GraphNode[]> {
    try {
      const limit = opts?.limit ?? 100;
      const query = { $or: [{ from: nodeId }, { to: nodeId }] };
  const edges = await this.db().collection('graph_edges').find(query as any).limit(limit).toArray();
      const neighborIds = new Set<string>();
      for (const e of edges) {
        if (e.from === nodeId) neighborIds.add(e.to);
        if (e.to === nodeId) neighborIds.add(e.from);
      }
      if (neighborIds.size === 0) return [];
  const nodes = await this.col().find({ _id: { $in: Array.from(neighborIds) } } as any).toArray();
  return nodes.map((n: any) => ({ id: String(n._id), ...n })) as GraphNode[];
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.getNeighbors failed', { cause: String(err) });
    }
  }

  /**
   * Get a subgraph rooted at a specific node.
   * @param rootId - The ID of the root node.
   * @param depth - The depth to search.
   * @param opts - Options for the query.
   * @returns The subgraph as a set of nodes and edges.
   */
    async getSubgraph(rootId: string, depth: number, opts?: { maxNodes?: number }): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
        try {
        // BFS limited expansion (simple implementation suitable for visualization)
        const maxNodes = opts?.maxNodes ?? 1000;
        const visited = new Set<string>();
        const nodes: any[] = [];
        const edges: any[] = [];
        let frontier = [rootId];
        while (frontier.length > 0 && visited.size < maxNodes && depth-- >= 0) {
            const next: string[] = [];
            const foundEdges = await this.db().collection('graph_edges').find({ $or: [{ from: { $in: frontier } }, { to: { $in: frontier } }] } as any).toArray();
            
            for (const e of foundEdges) {
                edges.push({ id: e._id, from: e.from, to: e.to, type: e.type, weight: e.weight, properties: e.properties, createdAt: e.createdAt });
                if (!visited.has(e.from)) { visited.add(e.from); next.push(e.from); }
                if (!visited.has(e.to)) { visited.add(e.to); next.push(e.to); }
            }
            frontier = next.filter(id => !visited.has(id)).slice(0, maxNodes - visited.size);
        }
        // load node docs
        const nodeDocs = await this.col().find({ _id: { $in: Array.from(visited) } } as any).toArray();
        for (const n of nodeDocs) nodes.push({ id: n._id, ...n });
        return { nodes: nodes as GraphNode[], edges: edges as GraphEdge[] };
        } catch (err: unknown) {
        throw new UpstreamError('GraphRepositoryMongo.getSubgraph failed', { cause: String(err) });
        }
    }
}
