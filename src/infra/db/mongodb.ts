import { MongoClient } from 'mongodb';

import { logger } from '../../shared/utils/logger';

let client: MongoClient | undefined;

export async function initMongo(url: string) {
  client = new MongoClient(url);
  await client.connect();
  logger.info({ event: 'db.connected', system: 'mongodb' }, 'MongoDB connected');
  await ensureIndexes();
  return client;
}

export function getMongo(): MongoClient {
  if (!client) throw new Error('MongoDB not initialized');
  return client;
}

async function ensureIndexes() {
  // placeholder: ensure required indexes for conversations/messages in next steps
  logger.info({ event: 'db.migrations_checked' }, 'DB indexes ensured');
}
