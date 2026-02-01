/**
 * ChatGPT export 형식의 conversation을 MongoDB에 import하는 스크립트
 *
 * Usage:
 * tsx scripts/import-conversation.ts <path-to-conversation.json> <userId>
 *
 * Example:
 * tsx scripts/import-conversation.ts ../GraphNode_AI/input_data/conversation_283.json 1
 */

import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

interface ChatGPTMessage {
  id: string;
  message: {
    id: string;
    author: { role: string };
    content: { content_type: string; parts: string[] };
    create_time?: number | null;
  } | null;
  parent: string | null;
  children: string[];
}

interface ChatGPTConversation {
  title: string;
  create_time: number;
  update_time: number;
  mapping: Record<string, ChatGPTMessage>;
}

async function importConversation(filePath: string, userId: string) {
  console.log(`📥 Importing conversation from: ${filePath}`);
  console.log(`👤 User ID: ${userId}\n`);

  // 1. Read file
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const conversations: ChatGPTConversation[] = JSON.parse(fileContent);

  if (!Array.isArray(conversations) || conversations.length === 0) {
    throw new Error('Invalid format: expected array of conversations');
  }

  const conversation = conversations[0]; // Take first conversation
  console.log(`📖 Title: ${conversation.title}`);

  // 2. Connect to MongoDB
  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl) {
    throw new Error('MONGODB_URL is not set');
  }

  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db();

  try {
    // 3. Generate conversation ID (use filename or UUID)
    const conversationId = path.basename(filePath, '.json');
    console.log(`🆔 Conversation ID: ${conversationId}\n`);

    // 4. Convert to MongoDB format
    const now = Date.now();
    const conversationDoc = {
      _id: conversationId,
      ownerUserId: userId,
      title: conversation.title,
      createdAt: Math.floor(conversation.create_time * 1000), // s → ms
      updatedAt: Math.floor(conversation.update_time * 1000),
      deletedAt: null,
    };

    // 5. Extract messages from mapping
    const messageDocs = [];
    const mapping = conversation.mapping;

    // Sort messages by parent-child relationship to get chronological order
    const messageIds: string[] = [];
    for (const [id, node] of Object.entries(mapping)) {
      // Skip nodes without messages (root nodes, system messages with empty content)
      if (!node.message || !node.message.content.parts || node.message.content.parts.length === 0) {
        continue;
      }
      if (node.message.content.parts[0].trim() === '') {
        continue; // Skip empty messages
      }
      messageIds.push(id);
    }

    // Build messages in order
    let messageIndex = 0;
    for (const msgId of messageIds) {
      const node = mapping[msgId];
      if (!node.message) continue;

      const msg = node.message;
      const content = msg.content.parts[0] || '';

      const timestamp = msg.create_time ? Math.floor(msg.create_time * 1000) : now + messageIndex * 1000;

      messageDocs.push({
        _id: msg.id,
        ownerUserId: userId,
        conversationId: conversationId,
        role: msg.author.role,
        content: content,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        ts: timestamp, // 프론트엔드 정렬용 timestamp 추가
      });

      messageIndex++;
    }

    console.log(`💬 Extracted ${messageDocs.length} messages\n`);

    // 6. Check if conversation already exists
    const existingConv = await db.collection('conversations').findOne({ _id: conversationId });
    if (existingConv) {
      console.log('⚠️  Conversation already exists. Deleting old data...');
      await db.collection('conversations').deleteOne({ _id: conversationId });
      await db.collection('messages').deleteMany({ conversationId });
    }

    // 7. Insert into MongoDB
    console.log('📝 Inserting conversation...');
    await db.collection('conversations').insertOne(conversationDoc);

    if (messageDocs.length > 0) {
      console.log('📝 Inserting messages...');
      await db.collection('messages').insertMany(messageDocs);
    }

    console.log('\n✅ Import completed successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Conversation ID: ${conversationId}`);
    console.log(`   - Title: ${conversation.title}`);
    console.log(`   - Messages: ${messageDocs.length}`);
    console.log(`   - User ID: ${userId}`);
    console.log(`\n💡 You can now test "Add to Graph" with this conversation!`);

  } finally {
    await client.close();
  }
}

// Main
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('❌ Usage: tsx scripts/import-conversation.ts <path-to-json> <userId>');
  console.error('   Example: tsx scripts/import-conversation.ts ../GraphNode_AI/input_data/conversation_283.json 1');
  process.exit(1);
}

const [filePath, userId] = args;

if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

importConversation(filePath, userId)
  .catch((error) => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });
