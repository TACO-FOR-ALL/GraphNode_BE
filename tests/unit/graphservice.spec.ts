import { GraphService } from '../../src/core/services/GraphService';
import type {
  GraphClusterRecord,
  GraphEdgeRecord,
  GraphNodeRecord,
  GraphStatsRecord,
  GraphStore,
} from '../../src/core/ports/GraphStore';
import { NotFoundError } from '../../src/shared/errors/domain';

class InMemoryGraphStore implements GraphStore {
  private nodes = new Map<string, GraphNodeRecord>();
  private edges = new Map<string, GraphEdgeRecord>();
  private clusters = new Map<string, GraphClusterRecord>();
  private stats = new Map<string, GraphStatsRecord>();

  private nodeKey(userId: string, nodeId: number) {
    return `${userId}::${nodeId}`;
  }

  private edgeKey(userId: string, source: number, target: number, id?: string) {
    return id ?? `${userId}::${source}->${target}`;
  }

  private clusterKey(userId: string, clusterId: string) {
    return `${userId}::${clusterId}`;
  }

  async upsertNode(node: GraphNodeRecord): Promise<void> {
    this.nodes.set(this.nodeKey(node.userId, node.id), { ...node });
  }

  async updateNode(userId: string, nodeId: number, patch: Partial<GraphNodeRecord>): Promise<void> {
    const key = this.nodeKey(userId, nodeId);
    const existing = this.nodes.get(key);
    if (!existing) throw new NotFoundError('Node not found');
    this.nodes.set(key, { ...existing, ...patch });
  }

  async deleteNode(userId: string, nodeId: number): Promise<void> {
    const key = this.nodeKey(userId, nodeId);
    this.nodes.delete(key);
    for (const [edgeId, edge] of Array.from(this.edges.entries())) {
      if (edge.userId === userId && (edge.source === nodeId || edge.target === nodeId)) {
        this.edges.delete(edgeId);
      }
    }
  }

  async deleteNodes(userId: string, nodeIds: number[]): Promise<void> {
    for (const nodeId of nodeIds) {
      this.nodes.delete(this.nodeKey(userId, nodeId));
    }
  }

  async findNode(userId: string, nodeId: number): Promise<GraphNodeRecord | null> {
    return this.nodes.get(this.nodeKey(userId, nodeId)) ?? null;
  }

  async listNodes(userId: string): Promise<GraphNodeRecord[]> {
    return Array.from(this.nodes.values()).filter(n => n.userId === userId);
  }

  async listNodesByCluster(userId: string, clusterId: string): Promise<GraphNodeRecord[]> {
    return Array.from(this.nodes.values()).filter(n => n.userId === userId && n.clusterId === clusterId);
  }

  async upsertEdge(edge: GraphEdgeRecord): Promise<string> {
    const key = this.edgeKey(edge.userId, edge.source, edge.target, edge.id);
    this.edges.set(key, { ...edge, id: key });
    return key;
  }

  async deleteEdge(userId: string, edgeId: string): Promise<void> {
    const current = this.edges.get(edgeId);
    if (current && current.userId === userId) {
      this.edges.delete(edgeId);
    }
  }

  async deleteEdgeBetween(userId: string, source: number, target: number): Promise<void> {
    for (const [key, edge] of Array.from(this.edges.entries())) {
      const matches =
        edge.userId === userId &&
        ((edge.source === source && edge.target === target) || (edge.source === target && edge.target === source));
      if (matches) this.edges.delete(key);
    }
  }

  async deleteEdgesByNodeIds(userId: string, nodeIds: number[]): Promise<void> {
    for (const [key, edge] of Array.from(this.edges.entries())) {
      if (edge.userId === userId && (nodeIds.includes(edge.source) || nodeIds.includes(edge.target))) {
        this.edges.delete(key);
      }
    }
  }

  async listEdges(userId: string): Promise<GraphEdgeRecord[]> {
    return Array.from(this.edges.values()).filter(e => e.userId === userId);
  }

  async upsertCluster(cluster: GraphClusterRecord): Promise<void> {
    this.clusters.set(this.clusterKey(cluster.userId, cluster.id), { ...cluster });
  }

  async deleteCluster(userId: string, clusterId: string): Promise<void> {
    this.clusters.delete(this.clusterKey(userId, clusterId));
  }

  async findCluster(userId: string, clusterId: string): Promise<GraphClusterRecord | null> {
    return this.clusters.get(this.clusterKey(userId, clusterId)) ?? null;
  }

  async listClusters(userId: string): Promise<GraphClusterRecord[]> {
    return Array.from(this.clusters.values()).filter(c => c.userId === userId);
  }

  async saveStats(stats: GraphStatsRecord): Promise<void> {
    this.stats.set(stats.userId, { ...stats });
  }

  async getStats(userId: string): Promise<GraphStatsRecord | null> {
    return this.stats.get(userId) ?? null;
  }

  async deleteStats(userId: string): Promise<void> {
    this.stats.delete(userId);
  }
}

describe('GraphService (unit)', () => {
  let store: InMemoryGraphStore;
  let svc: GraphService;

  beforeEach(() => {
    store = new InMemoryGraphStore();
    svc = new GraphService(store as unknown as GraphStore);
  });

  test('node lifecycle', async () => {
    const node: GraphNodeRecord = {
      id: 1,
      userId: 'u1',
      origId: 'conv-1',
      clusterId: 'c1',
      clusterName: 'Cluster',
      timestamp: null,
      numMessages: 10,
    };
    await svc.upsertNode(node);
    const listed = await svc.listNodes('u1');
    expect(listed).toHaveLength(1);
    expect(listed[0].origId).toBe('conv-1');

    await svc.updateNode('u1', 1, { clusterName: 'Updated' });
    const updated = await svc.findNode('u1', 1);
    expect(updated?.clusterName).toBe('Updated');

    await svc.deleteNode('u1', 1);
    const gone = await svc.findNode('u1', 1);
    expect(gone).toBeNull();
  });

  test('edge lifecycle', async () => {
    const baseNode: GraphNodeRecord = {
      id: 1,
      userId: 'u1',
      origId: 'conv',
      clusterId: 'c1',
      clusterName: 'c',
      timestamp: null,
      numMessages: 1,
    };
    await svc.upsertNode(baseNode);
    await svc.upsertNode({ ...baseNode, id: 2 });
    const edge: GraphEdgeRecord = {
      userId: 'u1',
      source: 1,
      target: 2,
      weight: 0.5,
      type: 'hard',
      intraCluster: true,
    };
    const edgeId = await svc.upsertEdge(edge);
    const edges = await svc.listEdges('u1');
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe(edgeId);

    await svc.deleteEdge('u1', edgeId);
    expect(await svc.listEdges('u1')).toHaveLength(0);
  });

  test('cluster and stats lifecycle', async () => {
    const cluster: GraphClusterRecord = {
      id: 'cluster-1',
      userId: 'u1',
      name: 'Focus',
      description: 'desc',
      size: 2,
      themes: ['topic'],
    };
    await svc.upsertCluster(cluster);
    expect((await svc.listClusters('u1')).map(c => c.id)).toContain('cluster-1');

    const stats: GraphStatsRecord = { userId: 'u1', nodes: 2, edges: 1, clusters: 1 };
    await svc.saveStats(stats);
    expect((await svc.getStats('u1'))?.nodes).toBe(2);

    await svc.deleteCluster('u1', 'cluster-1');
    expect(await svc.findCluster('u1', 'cluster-1')).toBeNull();
    await svc.deleteStats('u1');
    expect(await svc.getStats('u1')).toBeNull();
  });
});
