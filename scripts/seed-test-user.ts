/**
 * 테스트 유저 (userId: "123") 시드 스크립트
 *
 * GraphNode_AI/main/output/FE_graph.json 데이터를 사용하여
 * 개발 환경에서 테스트할 수 있는 기본 데이터를 생성합니다.
 */

import { PrismaClient } from '@prisma/client';
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const prisma = new PrismaClient();

interface FEGraphData {
  nodes: Array<{
    id: number;
    orig_id: string;
    cluster_id: string;
    cluster_name: string;
    timestamp: string | null;
    num_messages: number;
  }>;
  edges: Array<{
    source: number;
    target: number;
    weight: number;
    type: 'hard' | 'insight';
    intraCluster: boolean;
  }>;
  clusters: Array<{
    id: string;
    name: string;
    description: string;
    size: number;
    themes: string[];
  }>;
  stats: {
    nodes: number;
    edges: number;
    clusters: number;
  };
}

const TEST_USER = {
  userId: '123',
  provider: 'dev',
  providerUserId: '123',
  email: 'work.johnhan@gmail.com',
  displayName: 'John Han',
  avatarUrl:
    'https://lh3.googleusercontent.com/ogw/AF2bZyj8t00d6e-pJ9uS-qktXuPTf2SlhPlB7sqgoIF-RwuqBQ=s32-c-mo',
};

async function main() {
  console.log('🌱 Starting seed for test user (userId: 123)...\n');

  // 1. PostgreSQL - User 생성
  console.log('📦 Creating PostgreSQL user...');
  try {
    const user = await prisma.user.upsert({
      where: {
        provider_providerUserId: {
          provider: TEST_USER.provider,
          providerUserId: TEST_USER.providerUserId,
        },
      },
      update: {
        email: TEST_USER.email,
        displayName: TEST_USER.displayName,
        avatarUrl: TEST_USER.avatarUrl,
        lastLoginAt: new Date(),
      },
      create: {
        provider: TEST_USER.provider,
        providerUserId: TEST_USER.providerUserId,
        email: TEST_USER.email,
        displayName: TEST_USER.displayName,
        avatarUrl: TEST_USER.avatarUrl,
        lastLoginAt: new Date(),
      },
    });
    console.log(`✅ User created/updated: id=${user.id}`);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Your test user ID is: ${user.id}`);
    console.log(`${'='.repeat(60)}\n`);
  } catch (error) {
    console.error('❌ Failed to create user:', error);
    throw error;
  }

  // 2. MongoDB - Graph 데이터 생성
  console.log('\n📦 Creating MongoDB graph data...');

  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl) {
    throw new Error('MONGODB_URL is not set');
  }

  const mongoClient = new MongoClient(mongoUrl);
  await mongoClient.connect();
  const db = mongoClient.db();

  try {
    // FE_graph.json 로드
    const graphDataPath = path.join(
      __dirname,
      '../../GraphNode_AI/main/output/FE_graph.json'
    );
    const graphData: FEGraphData = JSON.parse(
      fs.readFileSync(graphDataPath, 'utf-8')
    );

    console.log(`📊 Loaded graph data: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges, ${graphData.clusters.length} clusters`);

    // 기존 데이터 삭제
    console.log('\n🗑️  Removing existing graph data for user 123...');
    await db.collection('graph_nodes').deleteMany({ userId: TEST_USER.userId });
    await db.collection('graph_edges').deleteMany({ userId: TEST_USER.userId });
    await db.collection('graph_clusters').deleteMany({ userId: TEST_USER.userId });
    await db.collection('graph_stats').deleteMany({ userId: TEST_USER.userId });

    // Nodes 삽입
    console.log('📥 Inserting graph nodes...');
    const nodes = graphData.nodes.map((node) => ({
      id: node.id,
      userId: TEST_USER.userId,
      origId: node.orig_id,
      clusterId: node.cluster_id,
      clusterName: node.cluster_name,
      timestamp: node.timestamp,
      numMessages: node.num_messages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    if (nodes.length > 0) {
      await db.collection('graph_nodes').insertMany(nodes);
      console.log(`✅ Inserted ${nodes.length} nodes`);
    }

    // Edges 삽입
    console.log('📥 Inserting graph edges...');
    const edges = graphData.edges.map((edge, index) => ({
      id: `edge_${index}`,
      userId: TEST_USER.userId,
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      type: edge.type,
      intraCluster: edge.intraCluster,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    if (edges.length > 0) {
      await db.collection('graph_edges').insertMany(edges);
      console.log(`✅ Inserted ${edges.length} edges`);
    }

    // Clusters 삽입
    console.log('📥 Inserting graph clusters...');
    const clusters = graphData.clusters.map((cluster) => ({
      id: cluster.id,
      userId: TEST_USER.userId,
      name: cluster.name,
      description: cluster.description,
      size: cluster.size,
      themes: cluster.themes.slice(0, 3), // 최대 3개만
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    if (clusters.length > 0) {
      await db.collection('graph_clusters').insertMany(clusters);
      console.log(`✅ Inserted ${clusters.length} clusters`);
    }

    // Stats 삽입
    console.log('📥 Inserting graph stats...');
    await db.collection('graph_stats').insertOne({
      userId: TEST_USER.userId,
      nodes: graphData.stats.nodes,
      edges: graphData.stats.edges,
      clusters: graphData.stats.clusters,
      generatedAt: new Date().toISOString(),
      metadata: {
        source: 'seed-script',
        originalFile: 'GraphNode_AI/main/output/FE_graph.json',
      },
    });
    console.log(`✅ Inserted graph stats`);

    console.log('\n✨ Seed completed successfully!');
    console.log('\n📌 Test user credentials:');
    console.log(`   userId: ${TEST_USER.userId}`);
    console.log(`   email: ${TEST_USER.email}`);
    console.log(`   displayName: ${TEST_USER.displayName}`);
    console.log('\n💡 To use in development:');
    console.log('   1. Frontend will auto-login with userId "123" in dev mode');
    console.log('   2. Or call: POST http://localhost:3000/dev/login');
    console.log('   3. Graph data is ready to visualize!\n');
  } catch (error) {
    console.error('❌ Failed to seed MongoDB:', error);
    throw error;
  } finally {
    await mongoClient.close();
  }
}

main()
  .catch((error) => {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
