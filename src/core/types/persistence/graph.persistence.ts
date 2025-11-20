/**
 * Graph Node Document (MongoDB)
 * Collection: graph_nodes
 */
export interface GraphNodeDoc {
  /** Composite Key: userId::nodeId */
  _id: string;
  userId: string;
  nodeId: number;
  origId: string;
  clusterId: string;
  clusterName: string;
  timestamp: string | null;
  numMessages: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Graph Edge Document (MongoDB)
 * Collection: graph_edges
 */
export interface GraphEdgeDoc {
  /** Composite Key: userId::source->target */
  _id: string;
  userId: string;
  source: number;
  target: number;
  weight: number;
  type: 'hard' | 'insight';
  intraCluster: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Graph Cluster Document (MongoDB)
 * Collection: graph_clusters
 */
export interface GraphClusterDoc {
  /** Composite Key: userId::clusterId */
  _id: string;
  userId: string;
  clusterId: string;
  name: string;
  description: string;
  size: number;
  themes: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Graph Stats Document (MongoDB)
 * Collection: graph_stats
 */
export interface GraphStatsDoc {
  /** Key: userId */
  _id: string;
  userId: string;
  nodes: number;
  edges: number;
  clusters: number;
  generatedAt: string;
  metadata: Record<string, unknown>;
}
