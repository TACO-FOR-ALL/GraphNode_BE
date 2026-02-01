
/**
 * End-to-End Verification Script
 * 
 * Verifies:
 * 1. Authentication (Login)
 * 2. Graph Data Operations (Node, Edge, Cluster)
 * 3. AI Chat with File Upload & Streaming (OpenAI)
 * 
 * Usage:
 * 1. Start backend: npm run dev
 * 2. Run this script: npx tsx scripts/verify-full-flow.ts
 */

import { GraphNodeSDK } from '../z_npm_sdk/src/index';
import * as fs from 'fs';
import * as path from 'path';

// --- Configuration ---
const BASE_URL = 'http://localhost:3000';
// Ensure these credentials work in your local DB or use a test account
const TEST_USER = {
  email: 'test@example.com',
  password: 'password123'
};

const sdk = new GraphNodeSDK({
  baseURL: BASE_URL,
  // We'll use the managed token/session flow
});

async function main() {
  console.log('🚀 Starting End-to-End Verification...');

  try {
    // 1. Authentication
    console.log('\nPlease ensure you have a user with email:', TEST_USER.email);
    console.log('If not, please create one or update TEST_USER in this script.');
    
    // Attempt Login
    console.log(`\n[1] Logging in as ${TEST_USER.email}...`);
    try {
        await sdk.auth.login(TEST_USER.email, TEST_USER.password);
        console.log('✅ Login successful');
    } catch (e: any) {
        if (e.status === 401 || e.message?.includes('401')) {
            console.error('❌ Login failed. Please check credentials.');
            process.exit(1);
        }
        // Maybe register if login fails? For now just fail.
        throw e;
    }

    // 2. Graph Operations
    console.log('\n[2] Testing Graph Operations (DTO Structure)...');
    
    // Create Cluster
    const clusterRes = await sdk.graph.createCluster({
        name: 'Test Cluster',
    });
    console.log('✅ Cluster Created:', clusterRes.data?.id);
    const clusterId = clusterRes.data!.id;

    // Create Node
    const nodeRes = await sdk.graph.createNode({
        label: 'Test Node',
        clusterId: clusterId,
        x: 0, 
        y: 0
    });
    console.log('✅ Node Created:', nodeRes.data?.id);
    const nodeId = nodeRes.data!.id;
    
    // 3. AI Chat with File & Streaming
    console.log('\n[3] Testing AI Chat (OpenAI + File + Streaming)...');

    // Create Conversation
    const convRes = await sdk.ai.createConversation();
    const conversationId = convRes.data!.id;
    console.log('✅ Conversation Created:', conversationId);

    // Create a dummy file
    const dummyFilePath = path.join(__dirname, 'test-upload.txt');
    fs.writeFileSync(dummyFilePath, 'This is a test file content for AI analysis.');

    console.log('   Uploading file and sending Stream request...');
    
    let fullResponse = '';
    
    // We need to use the lower-level fetch or construct FormData because SDK might not support Node.js ReadStream directly in 'files' array perfectly if it expects Browser File.
    // However, the updated SDK likely handles it via 'superagent' or similar if implemented for Node.
    // Let's try mimicking the SDK call. If the SDK is browser-focused, we might need a polyfill or direct fetch.
    // Assuming the SDK `ai.sendChatMessage` handles it.
    // Wait, the SDK `sendChatMessage` takes `files: File[]`. In Node, we don't have `File`.
    // We'll construct a mock File object or use a direct request for this test script if SDK is strictly browser-bound.
    // Currently `z_npm_sdk` seems to use `fetch` or `superagent`? Previous file view showed `http-builder.ts` using `fetch`.
    // We'll bypass SDK for the file upload part if SDK types are strict, OR we can cast.
    
    // Polyfill File for Node environment if needed, or just use `blob`.
    const fileBuffer = fs.readFileSync(dummyFilePath);
    const fileBlob = new Blob([fileBuffer], { type: 'text/plain' });
    // @ts-ignore
    fileBlob.name = 'test-upload.txt'; 
    
    await sdk.ai.sendChatMessage({
        conversationId,
        message: 'Analyze the uploaded file and tell me what it says.',
        model: 'openai',
        files: [fileBlob as any], // Cast to any to bypass strict 'File' check in Node
        onStream: (chunk) => {
            process.stdout.write(chunk); // Stream output to console
            fullResponse += chunk;
        }
    });

    console.log('\n\n✅ AI Chat Stream Finished.');
    console.log('Full Response Length:', fullResponse.length);

    // Cleanup
    fs.unlinkSync(dummyFilePath);
    console.log('\n✨ Verification Complete!');

  } catch (error) {
    console.error('\n❌ Verification Failed:', error);
    process.exit(1);
  }
}

main();
