/**
 * MongoDB에서 conversation을 가져와서 IndexedDB용 브라우저 스크립트를 생성
 *
 * Usage:
 * npx tsx scripts/export-to-indexeddb.ts conversation_283 1
 */

import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import 'dotenv/config';

async function exportToIndexedDBScript(conversationId: string, userId: string) {
  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl) {
    throw new Error('MONGODB_URL is not set');
  }

  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db();

  try {
    // 1. Fetch conversation
    const conversation = await db.collection('conversations').findOne({ _id: conversationId });
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // 2. Fetch messages (sorted by ts)
    const messages = await db
      .collection('messages')
      .find({ conversationId, ownerUserId: userId })
      .sort({ ts: 1 })
      .toArray();

    console.log(`📦 Exported ${messages.length} messages from conversation: ${conversation.title}`);

    // 3. Build IndexedDB format
    const indexedDBData = {
      id: conversationId,
      title: conversation.title,
      messages: messages.map((msg: any) => ({
        id: msg._id,
        role: msg.role,
        content: msg.content,
        ts: msg.ts,
        createdAt: msg.createdAt,
      })),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };

    // 4. Generate browser console script
    const script = `
// Auto-generated script to add conversation to IndexedDB
(async function() {
  const conversationData = ${JSON.stringify(indexedDBData, null, 2)};

  const dbName = 'threadsDB';
  const storeName = 'threads';

  const request = indexedDB.open(dbName, 1);

  request.onerror = () => {
    console.error('❌ Failed to open IndexedDB:', request.error);
  };

  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    // Delete existing conversation if present
    const deleteRequest = store.delete(conversationData.id);

    deleteRequest.onsuccess = () => {
      const addRequest = store.add(conversationData);

      addRequest.onsuccess = () => {
        console.log('✅ Conversation "${conversation.title}" added to IndexedDB');
        console.log('   Messages: ${messages.length}');
        console.log('   Conversation ID: ${conversationId}');
        console.log('');
        console.log('🔄 Please reload the app (Ctrl+R) to see the conversation.');
      };

      addRequest.onerror = () => {
        console.error('❌ Failed to add conversation:', addRequest.error);
      };
    };

    deleteRequest.onerror = () => {
      console.warn('⚠️  Delete failed (conversation may not exist):', deleteRequest.error);
      // Try to add anyway
      const addRequest = store.add(conversationData);
      addRequest.onsuccess = () => {
        console.log('✅ Conversation added');
      };
    };

    transaction.oncomplete = () => {
      db.close();
    };
  };
})();
`;

    // 5. Save to file
    const outputPath = `./scripts/indexeddb-insert-${conversationId}.js`;
    fs.writeFileSync(outputPath, script);

    console.log(`\n✅ Script generated: ${outputPath}`);
    console.log(`\n📋 Copy and paste this into the Electron app console (F12):\n`);
    console.log(script);

  } finally {
    await client.close();
  }
}

// Main
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('❌ Usage: npx tsx scripts/export-to-indexeddb.ts <conversationId> <userId>');
  console.error('   Example: npx tsx scripts/export-to-indexeddb.ts conversation_283 1');
  process.exit(1);
}

const [conversationId, userId] = args;

exportToIndexedDBScript(conversationId, userId)
  .catch((error) => {
    console.error('\n❌ Export failed:', error);
    process.exit(1);
  });
