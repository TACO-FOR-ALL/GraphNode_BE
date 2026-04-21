import { InferenceClient } from '@huggingface/inference';
import { loadEnv } from '../../config/env';

let hfClient: InferenceClient | null = null;

function getClient(): InferenceClient {
  if (!hfClient) {
    const env = loadEnv();
    hfClient = new InferenceClient(env.HF_API_TOKEN);
  }
  return hfClient;
}

/**
 * 주어진 텍스트를 384차원 임베딩 벡터로 변환합니다.
 * 이 모델은 GraphNode의 Python AI 워커와 정확히 동일한 모델입니다.
 * 
 * @param text 임베딩할 텍스트
 * @returns 384차원 숫자 배열 (벡터)
 */
export async function generateMiniLMEmbedding(text: string): Promise<number[]> {
  const client = getClient();
  
  try {
    // featureExtraction은 raw 모델 출력을 반환하므로 number[]로 타입 단언이 필요합니다.
    const output = await client.featureExtraction({
      model: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
      inputs: text,
      // @huggingface/inference v3는 이미 Inference API의 cold start 오류(503)를 자동 재시도합니다.
    });

    return output as unknown as number[];
  } catch (error) {
    console.error('❌ [HuggingFace API] Failed to generate embedding:', error);
    throw error;
  }
}
