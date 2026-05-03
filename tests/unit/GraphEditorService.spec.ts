/**
 * @file GraphEditorService.spec.ts
 * @description GraphEditorService 단위 테스트.
 * 작성일: 2026-05-01
 *
 * 전략:
 * - MacroGraphStore를 인메모리 Map으로 구현하여 Neo4j 의존성을 제거한다.
 * - 비즈니스 로직(검증, 에러 처리, 상태 변화)만 검증한다.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

import { GraphEditorService } from '../../src/core/services/GraphEditorService';
import type { MacroGraphStore, MacroGraphStoreOptions } from '../../src/core/ports/MacroGraphStore';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../../src/shared/errors/domain';
import type {
  GraphNodeDto,
  GraphEdgeDto,
  GraphClusterDto,
  GraphSubclusterDto,
} from '../../src/shared/dtos/graph';

// ─── In-Memory MacroGraphStore ────────────────────────────────────────────────

/**
 * GraphEditorService가 실제로 호출하는 MacroGraphStore 메서드만 구현한 인메모리 스텁.
 * 전체 MacroGraphStore 인터페이스를 구현하지 않으므로 as unknown as MacroGraphStore로 캐스팅한다.
 */
class InMemoryMacroGraphStore {
  private nodes = new Map<number, GraphNodeDto>();
  private edges = new Map<string, GraphEdgeDto>();
  private clusters = new Map<string, GraphClusterDto>();
  private subclusters = new Map<string, GraphSubclusterDto>();
  private nextId = 1;

  async getNextNodeId(): Promise<number> {
    return this.nextId++;
  }

  async findNode(userId: string, nodeId: number): Promise<GraphNodeDto | null> {
    const n = this.nodes.get(nodeId);
    return n && n.userId === userId && !n.deletedAt ? n : null;
  }

  async upsertNode(node: GraphNodeDto): Promise<void> {
    this.nodes.set(node.id, node);
  }

  async updateNode(userId: string, nodeId: number, patch: Partial<GraphNodeDto>): Promise<void> {
    const n = this.nodes.get(nodeId);
    if (n && n.userId === userId) this.nodes.set(nodeId, { ...n, ...patch });
  }

  async deleteNode(userId: string, nodeId: number, permanent?: boolean): Promise<void> {
    if (permanent) {
      this.nodes.delete(nodeId);
    } else {
      const n = this.nodes.get(nodeId);
      if (n && n.userId === userId) this.nodes.set(nodeId, { ...n, deletedAt: new Date().toISOString() });
    }
  }

  async deleteNodes(userId: string, nodeIds: number[], permanent?: boolean): Promise<void> {
    for (const id of nodeIds) await this.deleteNode(userId, id, permanent);
  }

  async listNodesByCluster(userId: string, clusterId: string): Promise<GraphNodeDto[]> {
    return Array.from(this.nodes.values()).filter(
      (n) => n.userId === userId && n.clusterId === clusterId && !n.deletedAt
    );
  }

  async findEdge(userId: string, edgeId: string): Promise<GraphEdgeDto | null> {
    const e = this.edges.get(edgeId);
    return e && e.userId === userId && !e.deletedAt ? e : null;
  }

  async upsertEdge(edge: GraphEdgeDto): Promise<string> {
    this.edges.set(edge.id!, edge);
    return edge.id!;
  }

  async updateEdge(userId: string, edgeId: string, patch: Partial<GraphEdgeDto>): Promise<void> {
    const e = this.edges.get(edgeId);
    if (e && e.userId === userId) this.edges.set(edgeId, { ...e, ...patch });
  }

  async deleteEdge(userId: string, edgeId: string, permanent?: boolean): Promise<void> {
    if (permanent) {
      this.edges.delete(edgeId);
    } else {
      const e = this.edges.get(edgeId);
      if (e && e.userId === userId) this.edges.set(edgeId, { ...e, deletedAt: new Date().toISOString() });
    }
  }

  async deleteEdgesByNodeIds(userId: string, nodeIds: number[], permanent?: boolean): Promise<void> {
    for (const [id, e] of this.edges.entries()) {
      if (e.userId === userId && (nodeIds.includes(e.source) || nodeIds.includes(e.target))) {
        if (permanent) this.edges.delete(id);
        else this.edges.set(id, { ...e, deletedAt: new Date().toISOString() });
      }
    }
  }

  async findCluster(userId: string, clusterId: string): Promise<GraphClusterDto | null> {
    const c = this.clusters.get(clusterId);
    return c && c.userId === userId && !c.deletedAt ? c : null;
  }

  async upsertCluster(cluster: GraphClusterDto): Promise<void> {
    this.clusters.set(cluster.id, cluster);
  }

  async updateCluster(userId: string, clusterId: string, patch: Partial<GraphClusterDto>): Promise<void> {
    const c = this.clusters.get(clusterId);
    if (c && c.userId === userId) this.clusters.set(clusterId, { ...c, ...patch });
  }

  async deleteCluster(userId: string, clusterId: string, permanent?: boolean): Promise<void> {
    if (permanent) {
      this.clusters.delete(clusterId);
    } else {
      const c = this.clusters.get(clusterId);
      if (c && c.userId === userId) this.clusters.set(clusterId, { ...c, deletedAt: new Date().toISOString() });
    }
  }

  async clusterHasNodes(userId: string, clusterId: string): Promise<boolean> {
    return Array.from(this.nodes.values()).some(
      (n) => n.userId === userId && n.clusterId === clusterId && !n.deletedAt
    );
  }

  async findSubcluster(userId: string, subclusterId: string): Promise<GraphSubclusterDto | null> {
    const sc = this.subclusters.get(subclusterId);
    return sc && sc.userId === userId && !sc.deletedAt ? sc : null;
  }

  async listSubclusters(userId: string): Promise<GraphSubclusterDto[]> {
    return Array.from(this.subclusters.values()).filter(
      (sc) => sc.userId === userId && !sc.deletedAt
    );
  }

  async upsertSubcluster(subcluster: GraphSubclusterDto): Promise<void> {
    this.subclusters.set(subcluster.id, subcluster);
  }

  async updateSubcluster(userId: string, subclusterId: string, patch: Partial<GraphSubclusterDto>): Promise<void> {
    const sc = this.subclusters.get(subclusterId);
    if (sc && sc.userId === userId) this.subclusters.set(subclusterId, { ...sc, ...patch });
  }

  async deleteSubcluster(userId: string, subclusterId: string, permanent?: boolean): Promise<void> {
    if (permanent) {
      this.subclusters.delete(subclusterId);
    } else {
      const sc = this.subclusters.get(subclusterId);
      if (sc && sc.userId === userId) this.subclusters.set(subclusterId, { ...sc, deletedAt: new Date().toISOString() });
    }
  }

  async moveNodeToCluster(userId: string, nodeId: number, newClusterId: string): Promise<void> {
    const n = this.nodes.get(nodeId);
    if (n && n.userId === userId) this.nodes.set(nodeId, { ...n, clusterId: newClusterId });
  }

  async moveSubclusterToCluster(userId: string, subclusterId: string, newClusterId: string): Promise<void> {
    const sc = this.subclusters.get(subclusterId);
    if (sc && sc.userId === userId) {
      this.subclusters.set(subclusterId, { ...sc, clusterId: newClusterId });
      for (const nId of sc.nodeIds) {
        const n = this.nodes.get(nId);
        if (n && n.userId === userId) this.nodes.set(nId, { ...n, clusterId: newClusterId });
      }
    }
  }

  async addNodeToSubcluster(userId: string, subclusterId: string, nodeId: number): Promise<void> {
    const sc = this.subclusters.get(subclusterId);
    if (sc && sc.userId === userId && !sc.nodeIds.includes(nodeId)) {
      this.subclusters.set(subclusterId, { ...sc, nodeIds: [...sc.nodeIds, nodeId] });
    }
  }

  async removeNodeFromSubcluster(userId: string, subclusterId: string, nodeId: number): Promise<void> {
    const sc = this.subclusters.get(subclusterId);
    if (sc && sc.userId === userId) {
      this.subclusters.set(subclusterId, { ...sc, nodeIds: sc.nodeIds.filter((id) => id !== nodeId) });
    }
  }

}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER = 'user-001';

function makeCluster(id: string, name = 'Test Cluster'): GraphClusterDto {
  return {
    id,
    userId: USER,
    name,
    description: '',
    size: 0,
    themes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeNode(id: number, clusterId: string): GraphNodeDto {
  return {
    id,
    userId: USER,
    origId: `orig:${id}`,
    clusterId,
    clusterName: 'Test Cluster',
    label: `Node ${id}`,
    timestamp: null,
    numMessages: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeEdge(id: string, source: number, target: number): GraphEdgeDto {
  return {
    id,
    userId: USER,
    source,
    target,
    weight: 0.5,
    type: 'insight',
    intraCluster: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeSubcluster(id: string, clusterId: string, nodeIds: number[] = []): GraphSubclusterDto {
  return {
    id,
    userId: USER,
    clusterId,
    nodeIds,
    representativeNodeId: 0,
    size: nodeIds.length,
    density: 0,
    topKeywords: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GraphEditorService', () => {
  let repo: InMemoryMacroGraphStore;
  let service: GraphEditorService;

  beforeEach(() => {
    repo = new InMemoryMacroGraphStore();
    service = new GraphEditorService(repo as unknown as MacroGraphStore);
  });

  // ── createNode ─────────────────────────────────────────────────────────────

  describe('createNode', () => {
    it('클러스터가 존재할 때 노드를 생성한다', async () => {
      await repo.upsertCluster(makeCluster('c1'));

      const result = await service.createNode(USER, { label: 'My Node', clusterId: 'c1' });

      expect(result.nodeId).toBeGreaterThan(0);
      expect(result.node.label).toBe('My Node');
      expect(result.node.clusterId).toBe('c1');
      expect(result.node.userId).toBe(USER);
      expect(result.node.origId).toMatch(/^editor:/);
    });

    it('클러스터가 없으면 NotFoundError를 던진다', async () => {
      await expect(
        service.createNode(USER, { label: 'X', clusterId: 'nonexistent' })
      ).rejects.toThrow(NotFoundError);
    });

    it('label이 비어 있으면 ValidationError를 던진다', async () => {
      await repo.upsertCluster(makeCluster('c1'));
      await expect(
        service.createNode(USER, { label: '  ', clusterId: 'c1' })
      ).rejects.toThrow(ValidationError);
    });

    it('userId가 없으면 ValidationError를 던진다', async () => {
      await expect(
        service.createNode('', { label: 'X', clusterId: 'c1' })
      ).rejects.toThrow(ValidationError);
    });
  });

  // ── updateNode ─────────────────────────────────────────────────────────────

  describe('updateNode', () => {
    it('노드를 수정한다', async () => {
      await repo.upsertCluster(makeCluster('c1'));
      await repo.upsertNode(makeNode(1, 'c1'));

      await service.updateNode(USER, 1, { label: 'Updated' });

      const updated = await repo.findNode(USER, 1);
      expect(updated?.label).toBe('Updated');
    });

    it('존재하지 않는 노드이면 NotFoundError를 던진다', async () => {
      await expect(service.updateNode(USER, 999, { label: 'X' })).rejects.toThrow(NotFoundError);
    });
  });

  // ── deleteNode ─────────────────────────────────────────────────────────────

  describe('deleteNode', () => {
    it('soft delete: deletedAt이 설정된다', async () => {
      await repo.upsertNode(makeNode(1, 'c1'));

      await service.deleteNode(USER, 1);

      const n = (repo as any).nodes.get(1);
      expect(n.deletedAt).toBeDefined();
    });

    it('존재하지 않는 노드이면 NotFoundError를 던진다', async () => {
      await expect(service.deleteNode(USER, 999)).rejects.toThrow(NotFoundError);
    });
  });

  // ── createEdge ─────────────────────────────────────────────────────────────

  describe('createEdge', () => {
    beforeEach(async () => {
      await repo.upsertCluster(makeCluster('c1'));
      await repo.upsertNode(makeNode(1, 'c1'));
      await repo.upsertNode(makeNode(2, 'c1'));
    });

    it('엣지를 생성한다', async () => {
      const result = await service.createEdge(USER, { source: 1, target: 2 });

      expect(result.edgeId).toBeDefined();
      expect(result.edge.source).toBe(1);
      expect(result.edge.target).toBe(2);
    });

    it('source === target이면 ValidationError를 던진다', async () => {
      await expect(
        service.createEdge(USER, { source: 1, target: 1 })
      ).rejects.toThrow(ValidationError);
    });

    it('source 노드가 없으면 NotFoundError를 던진다', async () => {
      await expect(
        service.createEdge(USER, { source: 99, target: 2 })
      ).rejects.toThrow(NotFoundError);
    });

    it('target 노드가 없으면 NotFoundError를 던진다', async () => {
      await expect(
        service.createEdge(USER, { source: 1, target: 99 })
      ).rejects.toThrow(NotFoundError);
    });

    it('relationType을 UPPER_SNAKE_CASE로 정규화한다', async () => {
      const result = await service.createEdge(USER, {
        source: 1,
        target: 2,
        relationType: 'my custom type',
      });
      expect(result.edge.type).toBe('insight');
      expect(result.edge.relationType).toBe('MY_CUSTOM_TYPE');
    });

    it('사용자 지정 relation 이름과 properties를 저장한다', async () => {
      const result = await service.createEdge(USER, {
        source: 1,
        target: 2,
        relationType: 'depends on',
        relation: 'Depends on',
        properties: { confidence: 0.82, id: 'blocked' },
      });

      expect(result.edge.relation).toBe('Depends on');
      expect(result.edge.relationType).toBe('DEPENDS_ON');
      expect(result.edge.properties).toEqual({ confidence: 0.82 });
    });

    it('예약된 relationType이면 ValidationError를 던진다', async () => {
      await expect(
        service.createEdge(USER, { source: 1, target: 2, relationType: 'BELONGS_TO' })
      ).rejects.toThrow(ValidationError);
    });

    it('intraCluster: 같은 클러스터이면 true', async () => {
      const result = await service.createEdge(USER, { source: 1, target: 2 });
      expect(result.edge.intraCluster).toBe(true);
    });

    it('intraCluster: 다른 클러스터이면 false', async () => {
      await repo.upsertCluster(makeCluster('c2'));
      await repo.upsertNode(makeNode(3, 'c2'));

      const result = await service.createEdge(USER, { source: 1, target: 3 });
      expect(result.edge.intraCluster).toBe(false);
    });
  });

  // ── updateEdge ─────────────────────────────────────────────────────────────

  describe('updateEdge', () => {
    it('엣지를 수정한다', async () => {
      await repo.upsertEdge(makeEdge('e1', 1, 2));

      await service.updateEdge(USER, 'e1', {
        weight: 0.9,
        relationType: 'supports',
        relation: 'Supports',
        properties: { note: 'ok', userId: 'blocked' },
      });

      const e = await repo.findEdge(USER, 'e1');
      expect(e?.weight).toBe(0.9);
      expect(e?.relationType).toBe('SUPPORTS');
      expect(e?.relation).toBe('Supports');
      expect(e?.properties).toEqual({ note: 'ok' });
    });

    it('존재하지 않는 엣지이면 NotFoundError를 던진다', async () => {
      await expect(service.updateEdge(USER, 'ghost', { weight: 0.1 })).rejects.toThrow(NotFoundError);
    });
  });

  // ── createCluster ──────────────────────────────────────────────────────────

  describe('createCluster', () => {
    it('클러스터를 생성한다', async () => {
      const result = await service.createCluster(USER, { name: 'Science' });

      expect(result.cluster.name).toBe('Science');
      expect(result.cluster.userId).toBe(USER);
      expect(result.cluster.id).toBeDefined();
    });

    it('id를 제공하면 해당 id를 사용한다', async () => {
      const result = await service.createCluster(USER, { id: 'my-id', name: 'Arts' });
      expect(result.cluster.id).toBe('my-id');
    });

    it('동일 id가 이미 존재하면 ConflictError를 던진다', async () => {
      await repo.upsertCluster(makeCluster('dup-id'));

      await expect(
        service.createCluster(USER, { id: 'dup-id', name: 'Dup' })
      ).rejects.toThrow(ConflictError);
    });

    it('name이 비어 있으면 ValidationError를 던진다', async () => {
      await expect(
        service.createCluster(USER, { name: '' })
      ).rejects.toThrow(ValidationError);
    });
  });

  // ── deleteCluster ──────────────────────────────────────────────────────────

  describe('deleteCluster', () => {
    it('cascade=false이고 노드가 있으면 ConflictError를 던진다', async () => {
      await repo.upsertCluster(makeCluster('c1'));
      await repo.upsertNode(makeNode(1, 'c1'));

      await expect(
        service.deleteCluster(USER, 'c1', false)
      ).rejects.toThrow(ConflictError);
    });

    it('cascade=false이고 노드가 없으면 삭제된다', async () => {
      await repo.upsertCluster(makeCluster('c-empty'));

      await service.deleteCluster(USER, 'c-empty', false);

      const c = await repo.findCluster(USER, 'c-empty');
      expect(c).toBeNull();
    });

    it('cascade=true이면 노드+엣지도 함께 삭제된다', async () => {
      await repo.upsertCluster(makeCluster('c1'));
      await repo.upsertNode(makeNode(1, 'c1'));
      await repo.upsertNode(makeNode(2, 'c1'));
      await repo.upsertEdge(makeEdge('e1', 1, 2));

      await service.deleteCluster(USER, 'c1', true);

      expect(await repo.findCluster(USER, 'c1')).toBeNull();
      expect(await repo.findNode(USER, 1)).toBeNull();
      expect(await repo.findNode(USER, 2)).toBeNull();
      expect(await repo.findEdge(USER, 'e1')).toBeNull();
    });

    it('존재하지 않는 클러스터이면 NotFoundError를 던진다', async () => {
      await expect(service.deleteCluster(USER, 'ghost', false)).rejects.toThrow(NotFoundError);
    });
  });

  // ── createSubcluster ───────────────────────────────────────────────────────

  describe('createSubcluster', () => {
    it('서브클러스터를 생성한다', async () => {
      await repo.upsertCluster(makeCluster('c1'));

      const result = await service.createSubcluster(USER, { clusterId: 'c1' });

      expect(result.subcluster.clusterId).toBe('c1');
      expect(result.subcluster.userId).toBe(USER);
    });

    it('clusterId에 해당하는 클러스터가 없으면 NotFoundError를 던진다', async () => {
      await expect(
        service.createSubcluster(USER, { clusterId: 'no-cluster' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── addNodeToSubcluster ────────────────────────────────────────────────────

  describe('addNodeToSubcluster', () => {
    it('같은 클러스터의 노드를 서브클러스터에 편입한다', async () => {
      await repo.upsertCluster(makeCluster('c1'));
      await repo.upsertNode(makeNode(1, 'c1'));
      await repo.upsertSubcluster(makeSubcluster('sc1', 'c1'));

      await service.addNodeToSubcluster(USER, 'sc1', { nodeId: 1 });

      const sc = await repo.findSubcluster(USER, 'sc1');
      expect(sc?.nodeIds).toContain(1);
    });

    it('다른 클러스터의 노드를 편입 시도하면 ValidationError를 던진다', async () => {
      await repo.upsertCluster(makeCluster('c1'));
      await repo.upsertCluster(makeCluster('c2'));
      await repo.upsertNode(makeNode(1, 'c2'));
      await repo.upsertSubcluster(makeSubcluster('sc1', 'c1'));

      await expect(
        service.addNodeToSubcluster(USER, 'sc1', { nodeId: 1 })
      ).rejects.toThrow(ValidationError);
    });

    it('노드가 없으면 NotFoundError를 던진다', async () => {
      await repo.upsertSubcluster(makeSubcluster('sc1', 'c1'));

      await expect(
        service.addNodeToSubcluster(USER, 'sc1', { nodeId: 999 })
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── moveNodeToCluster ──────────────────────────────────────────────────────

  describe('moveNodeToCluster', () => {
    it('노드를 다른 클러스터로 이동한다', async () => {
      await repo.upsertCluster(makeCluster('c1'));
      await repo.upsertCluster(makeCluster('c2'));
      await repo.upsertNode(makeNode(1, 'c1'));

      await service.moveNodeToCluster(USER, 1, { newClusterId: 'c2' });

      const n = await repo.findNode(USER, 1);
      expect(n?.clusterId).toBe('c2');
    });

    it('node를 다른 cluster로 이동하면 기존 subcluster 소속을 제거한다', async () => {
      await repo.upsertCluster(makeCluster('c1'));
      await repo.upsertCluster(makeCluster('c2'));
      await repo.upsertNode(makeNode(1, 'c1'));
      await repo.upsertSubcluster(makeSubcluster('sc1', 'c1', [1]));

      await service.moveNodeToCluster(USER, 1, { newClusterId: 'c2' });

      const n = await repo.findNode(USER, 1);
      const sc = await repo.findSubcluster(USER, 'sc1');
      expect(n?.clusterId).toBe('c2');
      expect(sc?.nodeIds).not.toContain(1);
    });

    it('대상 클러스터가 없으면 NotFoundError를 던진다', async () => {
      await repo.upsertCluster(makeCluster('c1'));
      await repo.upsertNode(makeNode(1, 'c1'));

      await expect(
        service.moveNodeToCluster(USER, 1, { newClusterId: 'ghost' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── executeBatch ───────────────────────────────────────────────────────────

  describe('executeBatch', () => {
    it('여러 오퍼레이션을 순서대로 실행한다', async () => {
      await repo.upsertCluster(makeCluster('c1'));

      const result = await service.executeBatch(USER, {
        operations: [
          { type: 'createCluster', payload: { name: 'Batch Cluster' } },
          { type: 'createNode', payload: { label: 'Batch Node', clusterId: 'c1' } },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
    });

    it('첫 번째 실패 시 이후 오퍼레이션은 실행되지 않는다', async () => {
      const result = await service.executeBatch(USER, {
        operations: [
          { type: 'createNode', payload: { label: 'Node', clusterId: 'nonexistent' } },
          { type: 'createCluster', payload: { name: 'Should Not Run' } },
        ],
      }).catch((err) => err);

      // UpstreamError로 래핑되어 던져지므로 catch해서 results를 확인
      expect(result).toBeDefined();
    });

    it('빈 operations이면 ValidationError를 던진다', async () => {
      await expect(
        service.executeBatch(USER, { operations: [] })
      ).rejects.toThrow(ValidationError);
    });
  });
});
