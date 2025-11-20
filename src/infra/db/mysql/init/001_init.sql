-- MySQL init schema for GraphNode
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(191) NOT NULL,
  email VARCHAR(191) NULL,
  display_name VARCHAR(191) NULL,
  avatar_url VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_provider_user (provider, provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- sessions mapping (opaque session id hash → user id)
CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_hash CHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_session_hash (session_hash),
  KEY idx_user_id (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
