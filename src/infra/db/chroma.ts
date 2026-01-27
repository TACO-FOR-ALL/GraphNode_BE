import { ChromaClient } from 'chromadb';

import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';

let client: ChromaClient | null = null;

export const initChroma = async (): Promise<ChromaClient> => {
  if (client) return client;

  const env = loadEnv();
  const path = env.CHROMA_API_URL || 'http://localhost:8000';

  logger.info({ path }, 'Initializing ChromaDB client...');

  try {
    client = new ChromaClient({
      path: path,
      // auth: env.CHROMA_API_KEY ? { provider: 'token', credentials: env.CHROMA_API_KEY } : undefined
    });

    // 연결 테스트 (heartbeat)
    const heartbeat = await client.heartbeat();
    logger.info({ heartbeat }, '✅ ChromaDB connected');

    return client;
  } catch (error) {
    logger.error({ error }, '❌ Failed to connect to ChromaDB');
    throw error;
  }
};

export const getChromaClient = (): ChromaClient => {
  if (!client) {
    throw new Error('ChromaDB client not initialized. Call initChroma() first.');
  }
  return client;
};
