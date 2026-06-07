import { OpenAI } from 'openai';
import { IAgentTool } from '../types';
import { AgentServiceDeps } from '../../core/services/AgentService';
import { logger } from '../../shared/utils/logger';
import type {
  MicroscopeDocumentMetaDoc,
  MicroscopeGraphNodeDoc,
  MicroscopeGraphEdgeDoc,
  MicroscopeGraphPayloadDoc,
} from '../../core/types/persistence/microscope_workspace.persistence';

/**
 * Microscope 워크스페이스 컨텍스트 조회 도구
 *
 * microscopeGroupId로 해당 workspace의 지식 그래프(nodes+edges)와
 * ingest 원본 소스(Note/Conversation 원문)를 로드하여 LLM 컨텍스트로 제공합니다.
 *
 * 지원 nodeType: 'note' | 'conversation' (향후 'file' | 'notion' 확장 예정)
 */
export class MicroscopeContextTool implements IAgentTool {
  readonly name = 'get_microscope_context';
  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'get_microscope_context',
      description: [
        '현재 보고 있는 Microscope 워크스페이스의 지식 그래프 구조와 원본 소스 데이터를 가져옵니다.',
        'Microscope 뷰에서 사용자 질문에 답하기 전에 반드시 이 도구를 먼저 호출하세요.',
        '도구는 워크스페이스의 nodes, edges, 그리고 ingest 원본(Note/Conversation 원문)을 반환합니다.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          microscopeGroupId: {
            type: 'string',
            description: 'Microscope 워크스페이스 ID (시스템 프롬프트에서 제공됨)',
          },
        },
        required: ['microscopeGroupId'],
      },
    },
  };

  /**
   * Microscope 워크스페이스의 그래프 데이터와 원본 소스를 조회합니다.
   *
   * @description
   * 1. microscopeWorkspaceStore로 workspace 메타데이터 조회 (userId 소유권 검증)
   * 2. COMPLETED 문서의 graphPayloadId로 nodes+edges 조회
   * 3. 각 문서의 nodeType에 따라 Note/Conversation 원문 조회
   * 4. 전체를 포맷된 텍스트로 반환
   *
   * @param userId 요청 사용자 ID (소유권 검증용)
   * @param args { microscopeGroupId: string }
   * @param deps AgentServiceDeps (microscopeWorkspaceStore, noteService, conversationService, messageService 포함)
   * @returns 포맷된 Microscope 컨텍스트 문자열
   */
  async execute(
    userId: string,
    args: any,
    deps: AgentServiceDeps,
    _openai: OpenAI
  ): Promise<string> {
    const microscopeGroupId = String(args.microscopeGroupId ?? '').trim();

    if (!microscopeGroupId) {
      return JSON.stringify({ error: 'microscopeGroupId가 필요합니다.' });
    }

    const { microscopeWorkspaceStore, noteService, conversationService, messageService } = deps;

    if (!microscopeWorkspaceStore) {
      return JSON.stringify({ error: 'Microscope 서비스가 초기화되지 않았습니다.' });
    }

    try {
      // 1. workspace 메타데이터 조회 + 소유권 검증
      const workspace = await microscopeWorkspaceStore.findById(microscopeGroupId);
      if (!workspace || workspace.userId !== userId) {
        return JSON.stringify({ error: '워크스페이스를 찾을 수 없거나 접근 권한이 없습니다.' });
      }

      // 2. COMPLETED 문서의 graphPayloadId 수집 후 nodes+edges 조회
      const completedDocs: MicroscopeDocumentMetaDoc[] = workspace.documents.filter(
        (d) => d.status === 'COMPLETED' && d.graphPayloadId
      );
      const payloadIds: string[] = completedDocs.map((d) => d.graphPayloadId!);
      const payloads: MicroscopeGraphPayloadDoc[] =
        payloadIds.length > 0
          ? await microscopeWorkspaceStore.findGraphPayloadsByIds(payloadIds)
          : [];

      const allNodes: MicroscopeGraphNodeDoc[] = payloads.flatMap((p) => p.graphData.nodes);
      const allEdges: MicroscopeGraphEdgeDoc[] = payloads.flatMap((p) => p.graphData.edges);

      // 3. 원본 소스 조회 (nodeType 분기)
      const sourceSections = await Promise.all(
        completedDocs.map((doc) =>
          this.fetchSourceText(doc, userId, { noteService, conversationService, messageService })
        )
      );

      // 4. 포맷된 컨텍스트 조립
      const context = buildMicroscopeContextText(
        workspace.name,
        allNodes,
        allEdges,
        sourceSections.filter(Boolean) as string[]
      );

      logger.info(
        {
          userId,
          microscopeGroupId,
          nodeCount: allNodes.length,
          edgeCount: allEdges.length,
          sourceCount: sourceSections.filter(Boolean).length,
        },
        '[MicroscopeContextTool] Microscope 컨텍스트 로드 완료'
      );

      return context;
    } catch (err: unknown) {
      logger.error(
        { err, userId, microscopeGroupId },
        '[MicroscopeContextTool] 컨텍스트 로드 오류'
      );
      return JSON.stringify({ error: 'Microscope 데이터를 불러오는 중 오류가 발생했습니다.' });
    }
  }

  /**
   * 문서 nodeType에 따라 원본 소스 텍스트를 조회합니다.
   * 새로운 nodeType 추가 시 이 메서드의 switch 분기를 확장하세요.
   *
   * @param doc Microscope 문서 메타데이터
   * @param userId 사용자 ID
   * @param services 필요한 서비스 인스턴스
   * @returns 포맷된 소스 텍스트 또는 null (조회 실패 시)
   */
  private async fetchSourceText(
    doc: MicroscopeDocumentMetaDoc,
    userId: string,
    services: Pick<AgentServiceDeps, 'noteService' | 'conversationService' | 'messageService'>
  ): Promise<string | null> {
    if (!doc.nodeId || !doc.nodeType) return null;

    const { noteService, conversationService, messageService } = services;

    try {
      switch (doc.nodeType) {
        case 'note': {
          const note = await noteService.getNote(userId, doc.nodeId);
          return `[노트: ${note.title}]\n${note.content}`;
        }

        case 'conversation': {
          const conv = await conversationService.getConversation(doc.nodeId, userId);
          const messages = await messageService.findDocsByConversationId(doc.nodeId);
          const messageText = messages
            .map(
              (m: { role: string; content: string }) =>
                `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`
            )
            .join('\n');
          return `[대화: ${conv.title}]\n${messageText}`;
        }

        // 향후 확장 예정
        // case 'file': { ... }
        // case 'notion': { ... }

        default:
          logger.warn(
            { nodeType: doc.nodeType, nodeId: doc.nodeId },
            '[MicroscopeContextTool] 미지원 nodeType 건너뜀'
          );
          return null;
      }
    } catch (err: unknown) {
      logger.warn(
        { err, nodeId: doc.nodeId, nodeType: doc.nodeType },
        '[MicroscopeContextTool] 소스 텍스트 조회 실패 — 건너뜀'
      );
      return null;
    }
  }
}

// ── 내부 유틸 ─────────────────────────────────────────────────────────────────

/**
 * Microscope 컨텍스트 텍스트를 조립합니다.
 */
function buildMicroscopeContextText(
  workspaceName: string,
  nodes: MicroscopeGraphNodeDoc[],
  edges: MicroscopeGraphEdgeDoc[],
  sourceSections: string[]
): string {
  const parts: string[] = [];

  parts.push(`=== MICROSCOPE WORKSPACE: ${workspaceName} ===\n`);

  // 지식 그래프 섹션
  parts.push('--- 지식 그래프 ---');

  if (nodes.length === 0) {
    parts.push('(노드 없음)');
  } else {
    parts.push(`노드 (${nodes.length}개):`);
    for (const node of nodes) {
      parts.push(`  • [${node.type}] ${node.name}: ${node.description ?? ''}`);
    }
  }

  if (edges.length > 0) {
    parts.push(`\n관계 (${edges.length}개):`);
    for (const edge of edges) {
      const conf = edge.confidence != null ? ` (신뢰도: ${edge.confidence.toFixed(2)})` : '';
      parts.push(
        `  • ${edge.start} -[${edge.type}]→ ${edge.target}: ${edge.description ?? ''}${conf}`
      );
      if (edge.evidence) {
        parts.push(`    근거: ${edge.evidence}`);
      }
    }
  }

  // 원본 소스 섹션
  if (sourceSections.length > 0) {
    parts.push('\n--- 원본 소스 ---');
    for (const section of sourceSections) {
      parts.push(section);
      parts.push('---');
    }
  }

  parts.push('\n=== END OF MICROSCOPE CONTEXT ===');

  return parts.join('\n');
}
