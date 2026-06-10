import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/graphnode?directConnection=true';

export async function assertImportConversationsInMongo(
  ownerUserId: string,
  importJobId: string,
  options: { minConversations?: number; minMessages?: number } = {}
): Promise<{ conversationCount: number; messageCount: number }> {
  const minConversations = options.minConversations ?? 1;
  const minMessages = options.minMessages ?? 1;

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db();
    const conversationCount = await db.collection('conversations').countDocuments({
      ownerUserId,
      importJobId,
      deletedAt: null,
    });
    const convIds = await db
      .collection('conversations')
      .find({ ownerUserId, importJobId, deletedAt: null })
      .project({ _id: 1 })
      .toArray();
    const messageCount = await db.collection('messages').countDocuments({
      ownerUserId,
      conversationId: { $in: convIds.map((c) => c._id) },
      deletedAt: null,
    });

    if (conversationCount < minConversations) {
      throw new Error(
        `expected >= ${minConversations} conversations for job ${importJobId}, got ${conversationCount}`
      );
    }
    if (messageCount < minMessages) {
      throw new Error(
        `expected >= ${minMessages} messages for job ${importJobId}, got ${messageCount}`
      );
    }

    return { conversationCount, messageCount };
  } finally {
    await client.close();
  }
}
