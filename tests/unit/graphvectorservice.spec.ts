
import { GraphVectorService } from '../../src/core/services/GraphVectorService';
import { GraphService } from '../../src/core/services/GraphService';
import type {
  GraphClusterRecord,
  GraphEdgeRecord,
  GraphNodeRecord,
  GraphStatsRecord,
  GraphStore,
} from '../../src/core/ports/GraphStore';
import { NotFoundError } from '../../src/shared/errors/domain';
import type { VectorStore, VectorItem } from '../../src/core/ports/VectorStore';
import { VectorService } from '../../src/core/services/VectorService';

// Mock GraphStore
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

// Mock VectorStore
class InMemoryVectorStore implements VectorStore {
    async ensureCollection(collection: string, dims?: number, distance?: "Cosine" | "Euclid" | "Dot"): Promise<void> {
        return;
    }
    async upsert(collection: string, items: VectorItem[]): Promise<void> {
        return;
    }
    async search(collection: string, queryVector: number[], opts?: { filter?: Record<string, any>; limit?: number; }): Promise<{ id: string; score: number; payload?: any; }[]> {
        return [{id: "1", score: 0.9}];
    }
    async deleteByFilter(collection: string, filter: Record<string, any>): Promise<void> {
        return;
    }
}

describe('GraphVectorService (unit)', () => {
  let graphStore: InMemoryGraphStore;
  let vectorStore: InMemoryVectorStore;
  let graphService: GraphService;
  let vectorService: VectorService;
  let graphVectorService: GraphVectorService;

  beforeEach(() => {
    graphStore = new InMemoryGraphStore();
    vectorStore = new InMemoryVectorStore();
    graphService = new GraphService(graphStore as unknown as GraphStore);
    vectorService = new VectorService(vectorStore as unknown as VectorStore);
    graphVectorService = new GraphVectorService(graphService, vectorService);
  });

  test('should throw error when vector operations are disabled', async () => {
    const serviceWithNoVectorStore = new GraphVectorService(graphService);
    await expect(serviceWithNoVectorStore.prepareNodeAndVector({}, [])).rejects.toThrow('Vector operations are temporarily disabled');
    await expect(serviceWithNoVectorStore.applyBatchNodes([])).rejects.toThrow('Vector operations are temporarily disabled');
    await expect(serviceWithNoVectorStore.searchNodesByVector('u1', 'col', [])).rejects.toThrow('Vector operations are temporarily disabled');
    await expect(serviceWithNoVectorStore.findNodesMissingVectors('u1', 'col', [])).rejects.toThrow('Vector operations are temporarily disabled');
  });

  test('delegates graph operations to graphService', async () => {
    const node: GraphNodeRecord = {
      id: 1,
      userId: 'u1',
      origId: 'conv-1',
      clusterId: 'c1',
      clusterName: 'Cluster',
      timestamp: null,
      numMessages: 10,
    };
    
    const upsertNodeSpy = jest.spyOn(graphService, 'upsertNode');
    await graphVectorService.upsertNode(node);
    expect(upsertNodeSpy).toHaveBeenCalledWith(node);

    const findNodeSpy = jest.spyOn(graphService, 'findNode');
    await graphVectorService.findNode('u1', 1);
    expect(findNodeSpy).toHaveBeenCalledWith('u1', 1);
  });
});
