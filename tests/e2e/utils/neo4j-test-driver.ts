import neo4j from 'neo4j-driver';
import type { Driver } from 'neo4j-driver';

/**
 * @description E2E 테스트에서 Neo4j driver를 생성하는 공통 헬퍼입니다.
 *
 * graph-flow Scenario 4/5가 서로 다른 기본 비밀번호를 사용하면서 인증 실패가 발생했기 때문에,
 * E2E 컨테이너의 docker-compose 기본값인 `neo4j-password`를 단일 기본값으로 고정합니다.
 * 환경 변수가 주입된 CI에서는 기존과 동일하게 `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`를 우선합니다.
 *
 * @returns 인증 정보가 적용된 Neo4j `Driver` 인스턴스입니다. 호출자는 session 사용 후 driver를 close해야 합니다.
 * @throws Neo4j driver 생성 자체에서 발생하는 구성 오류를 그대로 전파합니다.
 */
export function createNeo4jE2eDriver(): Driver {
  // CI/E2E docker-compose의 실제 Neo4j password 기본값과 일치시켜 로컬 fallback 인증 실패를 방지합니다.
  const uri = process.env.NEO4J_URI || 'neo4j://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'neo4j-password';

  return neo4j.driver(uri, neo4j.auth.basic(user, password));
}
