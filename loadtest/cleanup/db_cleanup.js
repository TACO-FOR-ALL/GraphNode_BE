// loadtest/cleanup/db_cleanup.js
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const { MYSQL_CONFIG, MONGODB_CONFIG } = require('../common/config.js');

// --- 설정: config.js 파일에서 가져옵니다 ---
const mysqlConfig = {
  uri: MYSQL_CONFIG.url,
};

const mongoConfig = {
  uri: MONGODB_CONFIG.url,
  database: MONGODB_CONFIG.database,
};
// ----------------------------------------------------

async function cleanupMysql() {
  let connection;
  try {
    connection = await mysql.createConnection(mysqlConfig.uri);
    console.log('MySQL에 연결되었습니다.');

    // 주의: 이 쿼리들은 테이블의 모든 데이터를 삭제합니다.
    // 실제 운영 DB에서는 절대 실행하지 마세요.
    const tablesToTruncate = ['notes', 'conversations', 'users', 'graph_nodes', 'graph_edges']; // 예시 테이블명

    for (const table of tablesToTruncate) {
      try {
        // 외래 키 제약 조건을 잠시 비활성화합니다.
        await connection.execute('SET FOREIGN_KEY_CHECKS = 0;');
        console.log(`'${table}' 테이블의 데이터를 삭제합니다...`);
        await connection.execute(`TRUNCATE TABLE ${table};`);
        // 외래 키 제약 조건을 다시 활성화합니다.
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1;');
        console.log(`'${table}' 테이블 정리 완료.`);
      } catch (e) {
        if (e.code === 'ER_NO_SUCH_TABLE') {
          console.warn(`'${table}' 테이블이 존재하지 않아 건너뜁니다.`);
        } else {
          throw e;
        }
      }
    }

    console.log('MySQL 데이터 정리가 완료되었습니다.');
  } catch (error) {
    console.error('MySQL 정리 중 오류 발생:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('MySQL 연결이 종료되었습니다.');
    }
  }
}

async function cleanupMongo() {
  const client = new MongoClient(mongoConfig.uri);
  try {
    await client.connect();
    console.log('MongoDB에 연결되었습니다.');
    const db = client.db();

    // 주의: 이 작업은 컬렉션의 모든 문서를 삭제합니다.
    const collectionsToWipe = ['conversations', 'messages', 'graph_nodes', 'graph_edges']; // 예시 컬렉션명

    for (const collectionName of collectionsToWipe) {
      console.log(`'${collectionName}' 컬렉션의 문서를 삭제합니다...`);
      const collection = db.collection(collectionName);
      const deleteResult = await collection.deleteMany({});
      console.log(`'${collectionName}' 컬렉션에서 ${deleteResult.deletedCount}개의 문서 삭제 완료.`);
    }

    console.log('MongoDB 데이터 정리가 완료되었습니다.');
  } catch (error) {
    console.error('MongoDB 정리 중 오류 발생:', error);
  } finally {
    await client.close();
    console.log('MongoDB 연결이 종료되었습니다.');
  }
}

async function main() {
  console.log('--- 부하 테스트 데이터 정리 스크립트 시작 ---');
  console.warn('경고: 이 스크립트는 DB의 모든 데이터를 삭제합니다. 5초 후에 시작합니다...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  await cleanupMysql();
  console.log('---');
  await cleanupMongo();

  console.log('--- 모든 데이터 정리 작업 완료 ---');
}

main();
