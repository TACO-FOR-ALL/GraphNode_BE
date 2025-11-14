/**
 * Graph API에 사용되는 타입 정의
 */

export interface GraphNodeDto {
  id: number;
  userId: string;
  origId: string;
  clusterId: string;
  clusterName: string;
  timestamp: string | null;
  numMessages: number;
  createdAt?: string;
  updatedAt?: string;
}

export type GraphEdgeType = 'hard' | 'insight';

export interface GraphEdgeDto {
  userId: string;
  id?: string;
  source: number;
  target: number;
  weight: number;
  type: GraphEdgeType;
  intraCluster: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GraphClusterDto {
  id: string;
  userId: string;
  name: string;
  description: string;
  size: number;
  themes: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface GraphStatsDto {
  userId: string;
  nodes: number;
  edges: number;
  clusters: number;
  generatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface GraphSnapshotDto {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  clusters: GraphClusterDto[];
  stats: Omit<GraphStatsDto, 'userId'>;
}

export interface CreateEdgeResponse {
  id: string;
}

export type UpdateNodePayload = Partial<Pick<GraphNodeDto, 'clusterId' | 'clusterName'>>;
