import { MongoClient, AnyBulkWriteOperation } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

type FeaturesJson = {
  conversations: Array<{
    id: number;
    orig_id: string;
    num_messages?: number;
    create_time?: number;
    update_time?: number;
  }>;
  embeddings: number[][];
  metadata?: Record<string, unknown>;
};

function usageAndExit() {
  // eslint-disable-next-line no-console
  console.error('Usage: npx tsx scripts/import-embeddings.ts <features.json> <userId>');
  process.exit(1);
}

async function main() {
  const [featuresPath, userId] = process.argv.slice(2);
  if (!featuresPath || !userId) usageAndExit();

  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl) throw new Error('MONGODB_URL is not set');

  const resolvedPath = path.resolve(process.cwd(), featuresPath);
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const data: FeaturesJson = JSON.parse(raw);

  if (!Array.isArray(data.conversations) || !Array.isArray(data.embeddings)) {
    throw new Error('Invalid features.json: missing conversations or embeddings');
  }

  if (data.conversations.length !== data.embeddings.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `Warning: conversations (${data.conversations.length}) and embeddings (${data.embeddings.length}) length mismatch`
    );
  }

  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db();
  const nodes = db.collection('graph_nodes');

  const ops: AnyBulkWriteOperation[] = [];
  const len = Math.min(data.conversations.length, data.embeddings.length);

  for (let i = 0; i < len; i += 1) {
    const conv = data.conversations[i];
    const embedding = data.embeddings[i];
    if (!conv?.orig_id || !Array.isArray(embedding)) continue;

    ops.push({
      updateOne: {
        filter: { userId, origId: conv.orig_id },
        update: {
          $set: {
            embedding,
            updatedAt: new Date().toISOString(),
          },
          $setOnInsert: {
            id: conv.id ?? i,
            userId,
            origId: conv.orig_id,
            numMessages: conv.num_messages ?? 0,
            timestamp: conv.update_time ? new Date(conv.update_time * 1000).toISOString() : null,
            createdAt: new Date().toISOString(),
          },
        },
        upsert: true,
      },
    });
  }

  if (ops.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No embeddings to import.');
    await client.close();
    return;
  }

  const result = await nodes.bulkWrite(ops, { ordered: false });
  // eslint-disable-next-line no-console
  console.log(
    `Done. matched=${result.matchedCount}, modified=${result.modifiedCount}, upserted=${result.upsertedCount}`
  );

  await client.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to import embeddings:', err);
  process.exit(1);
});
