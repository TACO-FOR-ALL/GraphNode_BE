import { GraphService } from '../../src/core/services/GraphService';
import type { GraphStore, GraphNode, GraphEdge } from '../../src/core/ports/GraphStore';
import { NotFoundError } from '../../src/shared/errors/domain';

class InMemoryGraphStore implements GraphStore {
  nodes = new Map<string, any>();
  edges: any[] = [];

  async createNode(node: GraphNode) {
    this.nodes.set(node.id, { ...node });
  }
  async updateNode(nodeId: string, patch: Partial<GraphNode>) {
    const n = this.nodes.get(nodeId);
    if (!n) throw new NotFoundError('Node not found');
    this.nodes.set(nodeId, { ...n, ...patch });
  }
  async deleteNode(nodeId: string) {
    this.nodes.delete(nodeId);
    this.edges = this.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
  }
  async addEdge(edge: GraphEdge) {
    const id = edge.id ?? `e_${this.edges.length + 1}`;
    this.edges.push({ ...edge, id });
  }
  async removeEdgeById(edgeId: string) {
    this.edges = this.edges.filter(e => e.id !== edgeId);
  }
  async removeEdgeBetween(from: string, to: string) {
    this.edges = this.edges.filter(e => !( (e.from===from && e.to===to) || (e.from===to && e.to===from) ));
  }
  async getNodeById(nodeId: string) {
    const v = this.nodes.get(nodeId);
    return v ? { id: nodeId, ...v } : null;
  }
  async getNeighbors(nodeId: string, opts?: any) {
    const neigh = new Set<string>();
    for (const e of this.edges) {
      if (e.from === nodeId) neigh.add(e.to);
      if (e.to === nodeId) neigh.add(e.from);
    }
    const out: GraphNode[] = [];
    for (const id of Array.from(neigh).slice(0, opts?.limit ?? 100)) {
      const n = await this.getNodeById(id);
      if (n) out.push(n);
    }
    return out;
  }
  async getSubgraph(rootId: string, depth: number, opts?: any) {
    // simple BFS using in-memory edges
    const visited = new Set<string>([rootId]);
    let frontier = [rootId];
    let d = 0;
    const nodes: any[] = [];
    const edges: any[] = [];
    while (frontier.length && d <= depth) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const e of this.edges) {
          if (e.from === id || e.to === id) {
            edges.push(e);
            const other = e.from === id ? e.to : e.from;
            if (!visited.has(other)) { visited.add(other); next.push(other); }
          }
        }
      }
      frontier = next;
      d++;
    }
    for (const id of Array.from(visited)) {
      const n = await this.getNodeById(id);
      if (n) nodes.push(n);
    }
    return { nodes, edges };
  }
}

describe('GraphService (unit)', () => {
  let store: InMemoryGraphStore;
  let svc: GraphService;

  beforeEach(() => {
    store = new InMemoryGraphStore();
    svc = new GraphService(store as unknown as GraphStore);
  });

  test('create/update/get/delete node', async () => {
    const node = { id: 'n1', userId: 'u1', title: 'T1' };
    await svc.createNode(node);
    const loaded = await svc.getNodeById('n1');
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe('T1');

    await svc.updateNode('n1', { title: 'New' });
    const after = await svc.getNodeById('n1');
    expect(after?.title).toBe('New');

    await svc.deleteNode('n1');
    const gone = await svc.getNodeById('n1');
    expect(gone).toBeNull();
  });

  test('add and remove edge and neighbors', async () => {
    await svc.createNode({ id: 'a', userId: 'u1' });
    await svc.createNode({ id: 'b', userId: 'u1' });
    await svc.addEdge({ from: 'a', to: 'b', userId: 'u1' });
    const neigh = await svc.getNeighbors('a');
    expect(neigh.map(n => n.id)).toContain('b');
    await svc.removeEdgeBetween('a','b');
    const neigh2 = await svc.getNeighbors('a');
    expect(neigh2.length).toBe(0);
  });

  test('getSubgraph BFS', async () => {
    // build small chain a-b-c
    await svc.createNode({ id: 'a', userId: 'u1' });
    await svc.createNode({ id: 'b', userId: 'u1' });
    await svc.createNode({ id: 'c', userId: 'u1' });
    await svc.addEdge({ from: 'a', to: 'b', userId: 'u1' });
    await svc.addEdge({ from: 'b', to: 'c', userId: 'u1' });
    const sub = await svc.getSubgraph('a', 2, { maxNodes: 10 });
    const ids = sub.nodes.map(n => n.id).sort();
    expect(ids).toEqual(expect.arrayContaining(['a','b','c']));
  });
});
