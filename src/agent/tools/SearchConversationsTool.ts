import { OpenAI } from 'openai';
import { IAgentTool } from '../types';
import { AgentServiceDeps } from '../../core/services/AgentService';
import { generateMiniLMEmbedding } from '../../shared/utils/huggingface';

/**
 * 대화 내용 검색 (벡터 검색) 도구
 */
export class SearchConversationsTool implements IAgentTool {
  readonly name = 'search_conversations';
  readonly definition: OpenAI.Chat.Completions.ChatCompletionTool = {
    type: 'function',
    function: {
      name: 'search_conversations',
      description:
        '사용자의 과거 대화 내용이나 저장된 지식 노드 중에서 키워드와 의미적으로 유사한 내용을 검색합니다.',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '검색할 키워드 혹은 질문' },
          limit: { type: 'number', description: '반환할 최대 결과 수 (기본값: 5)' },
        },
        required: ['keyword'],
      },
    },
  };

  /**
   * 대화 내용 검색 (벡터 검색) 실행
   * @param userId 사용자 ID
   * @param args 검색어와 제한 수
   * @param deps AgentServiceDeps
   * @param openai OpenAI
   * @returns JSON.stringify({ message: `${searchResults.length}개의 관련 지식/대화를 찾았습니다.`, results: searchResults.map((r) => ({ id: r.node.origId, content: r.node.summary || r.node.label || '', score: r.score, metadata: r.node.metadata, })) })
   */
  async execute(userId: string, args: any, deps: AgentServiceDeps, openai: OpenAI): Promise<string> {
    const { graphVectorService } = deps;
    const keyword = args.keyword as string;
    const limit = (args.limit as number) || 5;

    let queryVector: number[];
    try {
      queryVector = await generateMiniLMEmbedding(keyword);
    } catch (e: any) {
      console.error('[SearchConversationsTool] Embedding Error:', e);
      return JSON.stringify({ message: '검색용 의미 분석에 실패했습니다. (임베딩 엔진 오류)', conversations: [] });
    }

    // Macro의 Node에 있는 embedding Vector로 유사도검색을 하는데, 이 경우 Macro가 없으면 동작을 안함.
    const searchResults = await graphVectorService.searchNodes(userId, queryVector, limit);

    if (searchResults.length === 0) {
      return JSON.stringify({ message: '검색 결과가 없습니다.', conversations: [] });
    }

    return JSON.stringify({
      message: `${searchResults.length}개의 관련 대화/노드를 찾았습니다.`,
      conversations: searchResults.map((result) => ({
        id: result.node.origId,
        title: result.node.label || result.node.clusterName || '제목 없음',
        content: result.node.summary || '',
        similarity: result.score,
        clusterId: result.node.clusterId,
      })),
    });
  }
}
