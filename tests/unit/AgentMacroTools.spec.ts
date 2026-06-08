import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import OpenAI from 'openai';

import { ToolRegistry } from '../../src/agent/ToolRegistry';
import { GetMacroGraphContextTool } from '../../src/agent/tools/GetMacroGraphContextTool';
import { GetGraphNodeDetailsTool } from '../../src/agent/tools/GetGraphNodeDetailsTool';
import { AgentService } from '../../src/core/services/AgentService';

jest.mock('../../src/config/env', () => ({
  loadEnv: () => ({
    OPENAI_API_KEY: 'test-api-key',
  }),
}));

describe('Agent macro graph tools', () => {
  const snapshot = {
    nodes: [
      {
        id: 101,
        userId: 'user-1',
        origId: 'note-001',
        clusterId: 'cluster-a',
        clusterName: 'A',
        timestamp: null,
        numMessages: 2,
        sourceType: 'markdown',
        nodeTitle: '프로젝트 회고',
        createdAt: '2026-05-28T00:00:00.000Z',
        updatedAt: '2026-05-28T01:00:00.000Z',
        metadata: {
          sourceLink: 'https://example.com/note/001',
        },
      },
    ],
    edges: [
      {
        userId: 'user-1',
        source: 101,
        target: 101,
        weight: 1,
        type: 'insight',
      },
    ],
    clusters: [
      {
        id: 'cluster-a',
        userId: 'user-1',
        name: 'A',
        description: 'cluster A',
        size: 1,
        themes: ['retrospective'],
      },
    ],
    subclusters: [],
    stats: {
      nodes: 1,
      edges: 1,
      clusters: 1,
      status: 'CREATED',
    },
  } as any;

  const deps = {
    userService: {} as any,
    noteService: {} as any,
    conversationService: {} as any,
    messageService: {} as any,
    graphVectorService: {} as any,
    searchService: {} as any,
    graphEmbeddingService: {
      getSnapshotForUser: jest.fn(async () => snapshot),
      getGraphSummary: jest.fn(async () => ({ overview: { total_notions: 0 } })),
      getStats: jest.fn(async () => ({ nodes: 1, edges: 1, clusters: 1, status: 'CREATED' })),
    } as any,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ToolRegistry should expose macro tools definitions', () => {
    const registry = new ToolRegistry();
    const names = registry.getDefinitions().map((d) => (d as any).function?.name);

    expect(names).toContain('get_macro_graph_context');
    expect(names).toContain('get_graph_node_details');
  });

  it('GetMacroGraphContextTool returns full snapshot payload', async () => {
    const tool = new GetMacroGraphContextTool();

    const raw = await tool.execute('user-1', {}, deps, {} as OpenAI);
    const parsed = JSON.parse(raw);

    expect(parsed.scope.userId).toBe('user-1');
    expect(parsed.snapshot.nodes).toHaveLength(1);
    expect(parsed.snapshot.edges).toHaveLength(1);
    expect(parsed.summary).toBeDefined();
  });

  it('GetGraphNodeDetailsTool returns node detail by nodeId', async () => {
    const tool = new GetGraphNodeDetailsTool();

    const raw = await tool.execute('user-1', { nodeId: 101 }, deps, {} as OpenAI);
    const parsed = JSON.parse(raw);

    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0].nodeId).toBe(101);
    expect(parsed.nodes[0].cluster.id).toBe('cluster-a');
    expect(parsed.nodes[0].sourceReference.sourceLink).toBe('https://example.com/note/001');
  });

  it('GetGraphNodeDetailsTool supports keyword search', async () => {
    const tool = new GetGraphNodeDetailsTool();

    const raw = await tool.execute('user-1', { keyword: '회고' }, deps, {} as OpenAI);
    const parsed = JSON.parse(raw);

    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0].title).toBe('프로젝트 회고');
  });

  it('AgentService chat prompt contains macro vs micro routing guidance', () => {
    const service = new AgentService(deps);
    const prompt = (service as any).getChatSystemPrompt();

    expect(prompt).toContain('get_macro_graph_context');
    expect(prompt).toContain('get_graph_node_details');
    expect(prompt).toContain('search_conversations');
    expect(prompt).toContain('Macro vs Micro Tool 선택 규칙');
  });
});
