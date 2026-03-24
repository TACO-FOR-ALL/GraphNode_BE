---
title: BE-AI 통합 E2E 테스트 구축 완료
date: 2026-03-22
author: Antigravity
scope: [BE, AI, QA]
---

# 2026-03-22 BE-AI 통합 E2E 테스트 구축 완료

## TL;DR
- **목표**: AI 프로젝트의 환경 변수 주입 및 시크릿(OpenAI) 연동을 통해 GitHub Action runner에서 통합 E2E 테스트가 가능하도록 구축.
- **결과**: `docker-compose.test.yml` 및 GitHub Workflow 수정 완료.
- **영향 범위**: `GraphNode` E2E 테스트 워크플로우 전반.

## 상세 변경 사항

### [BE/QA] `GraphNode/docker-compose.test.yml`
- `graphnode-ai` 서비스의 환경 변수 보정: `MONGODB_URL`, `MONGODB_DB_NAME`, `NEO4J_URI`, `CHROMA_DATABASE`, `CHROMA_API_URL` 등 운영급 설정과 호환되는 로컬 변수 주입.
- `AWS_ENDPOINT_URL` 주입으로 LocalStack 자동 연동 지원.
- 불필요한 TODO/FIXME 주석 제거.

### [BE/QA] `GraphNode/.github/workflows/BE-AI-flow-test.yml`
- GitHub Secrets로부터 `OPENAI_API_KEY`, `GROQ_API_KEY`를 워크플로우 환경 변수로 매핑하여 컨테이너로 전달.

## 사용 방법
- 자세한 가이드는 [walkthrough.md](../../../../.gemini/antigravity/brain/2ecc38d9-0dcd-4dc8-8ca2-4d9d948b560e/walkthrough.md) 및 분석 보고서를 참조하십시오.
