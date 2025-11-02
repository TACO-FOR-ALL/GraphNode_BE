/**
 * Graph node and edge port interfaces
 *
 * These types define the minimal shape used by services and repositories.
 */

/**
 * Graph node representation stored in graph_nodes collection.
 * @property id - unique identifier for the node
 * @property userId - owner of the node
 * @property title - optional title for display
 * @property properties - arbitrary key/value metadata
 * @property embeddingId - optional id used in VectorStore (recommended to be same as node.id)
 */
export interface GraphNode {
  id: string;
  userId: string;
  title?: string;
  properties?: Record<string, any>;
  embeddingId?: string; // id used in VectorStore (recommended to be same as node.id)
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Graph edge representation stored in graph_edges collection.
 * We store edges as undirected (from/to) for this project but queries will treat
 * an edge as connecting both endpoints. Additional properties like weight/type
 * are included for visualization and ranking.
 * @property id - unique identifier for the edge
 * @property userId - owner of the edge
 * @property from - source node id
 * @property to - target node id
 * @property type - optional edge type for categorization
 * @property weight - optional weight for ranking
 * @property properties - arbitrary key/value metadata
 */
export interface GraphEdge {
  id?: string;
  userId: string;
  from: string;
  to: string;
  type?: string;
  weight?: number;
  properties?: Record<string, any>;
  createdAt?: string;
}

/**
 * GraphStore port: abstract operations the app needs for graph persistence.
 */
export interface GraphStore {
  createNode(node: GraphNode): Promise<void>;
  updateNode(nodeId: string, patch: Partial<GraphNode>): Promise<void>;
  deleteNode(nodeId: string): Promise<void>;

  addEdge(edge: GraphEdge): Promise<void>;
  removeEdgeById(edgeId: string): Promise<void>;
  removeEdgeBetween(from: string, to: string): Promise<void>;

  getNodeById(nodeId: string): Promise<GraphNode | null>;
  getNeighbors(nodeId: string, opts?: { direction?: 'both' | 'out' | 'in'; limit?: number }): Promise<GraphNode[]>;
  getSubgraph(rootId: string, depth: number, opts?: { maxNodes?: number }): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
}
