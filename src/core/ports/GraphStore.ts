/**
 * Graph node and edge port interfaces
 *
 * These types define the minimal shape used by services and repositories.
 */

import { ClientSession } from 'mongodb';

import type { GraphNodeDoc, GraphEdgeDoc, GraphClusterDoc, GraphStatsDoc } from '../types/persistence/graph.persistence';

/**
 * Options for repository methods, including session for transactions.
 */
export interface RepoOptions {
  session?: ClientSession;
}

/**
 * GraphStore port: abstract operations the app needs for graph persistence.
 * Uses strictly DB-specific types (Docs) as per architecture rules.
 */
export interface GraphStore {
  upsertNode(node: GraphNodeDoc, options?: RepoOptions): Promise<void>;
  updateNode(userId: string, nodeId: number, patch: Partial<GraphNodeDoc>, options?: RepoOptions): Promise<void>;
  deleteNode(userId: string, nodeId: number, options?: RepoOptions): Promise<void>;
  deleteNodes(userId: string, nodeIds: number[], options?: RepoOptions): Promise<void>;
  findNode(userId: string, nodeId: number): Promise<GraphNodeDoc | null>;
  listNodes(userId: string): Promise<GraphNodeDoc[]>;
  listNodesByCluster(userId: string, clusterId: string): Promise<GraphNodeDoc[]>;

  upsertEdge(edge: GraphEdgeDoc, options?: RepoOptions): Promise<string>;
  deleteEdge(userId: string, edgeId: string, options?: RepoOptions): Promise<void>;
  deleteEdgeBetween(userId: string, source: number, target: number, options?: RepoOptions): Promise<void>;
  deleteEdgesByNodeIds(userId: string, nodeIds: number[], options?: RepoOptions): Promise<void>;
  listEdges(userId: string): Promise<GraphEdgeDoc[]>;

  upsertCluster(cluster: GraphClusterDoc, options?: RepoOptions): Promise<void>;
  deleteCluster(userId: string, clusterId: string, options?: RepoOptions): Promise<void>;
  findCluster(userId: string, clusterId: string): Promise<GraphClusterDoc | null>;
  listClusters(userId: string): Promise<GraphClusterDoc[]>;

  saveStats(stats: GraphStatsDoc, options?: RepoOptions): Promise<void>;
  getStats(userId: string): Promise<GraphStatsDoc | null>;
  deleteStats(userId: string, options?: RepoOptions): Promise<void>;
}
