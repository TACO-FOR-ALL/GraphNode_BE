/**
 * MySQL 초기화 스키마 정의.
 * 빌드 시 정적 파일(.sql) 누락 문제를 방지하기 위해 TypeScript 상수로 관리한다.
 */
export const MYSQL_INIT_SCHEMA = `
-- MySQL init schema for GraphNode
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(191) NOT NULL,
  email VARCHAR(191) NULL,
  display_name VARCHAR(191) NULL,
  avatar_url VARCHAR(512) NULL,
  api_key_openai VARCHAR(191) NULL,
  api_key_deepseek VARCHAR(191) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_provider_user (provider, provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- APIKEY Column 추가, 2025/12/03

`;
