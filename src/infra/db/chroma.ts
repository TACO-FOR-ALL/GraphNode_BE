import { CloudClient } from 'chromadb';

import { loadEnv } from '../../config/env';
import { logger } from '../../shared/utils/logger';

let client: CloudClient | null = null;

export const initChroma = async (): Promise<CloudClient> => {
  if (client) return client;

  const env = loadEnv();
  const apiKey = env.CHROMA_API_KEY;
  const tenant = env.CHROMA_TENANT;
  const database = env.CHROMA_DATABASE;


  logger.info('Initializing ChromaDB client...');

  try {
    client = new CloudClient({
      apiKey: apiKey,
      tenant: tenant,
      database: database
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

export const getChromaClient = (): CloudClient => {
  if (!client) {
    throw new Error('ChromaDB client not initialized. Call initChroma() first.');
  }
  return client;
};
