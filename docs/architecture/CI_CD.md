# 🚀 CI/CD Pipeline & Deployment

GraphNode Backend는 **GitHub Actions**를 사용하여 빌드, 테스트, 배포 과정을 자동화하고 있으며, **AWS ECS (Fargate)** 환경에 컨테이너 기반으로 배포됩니다.

## 1. CI/CD Workflow (`.github/workflows/deploy.yml`)

### **Trigger**
- `Main` 브랜치에 코드가 푸시될 때 자동으로 실행됩니다.
- 관련 파일 변경 감지: `src/**`, `ecs/**`, `Dockerfile`, `package*.json`

### **Steps**
1. **Checkout**: 깃허브 리포지토리 코드를 가져옵니다.
2. **Configure AWS Credentials**: GitHub Secrets에 저장된 AWS 자격 증명(OIDC/Access Key)을 설정합니다.
3. **Login to Amazon ECR**: Docker 이미지를 업로드할 ECR 레지스트리에 로그인합니다.
4. **Build & Push Docker Image**:
   - `docker buildx`를 사용하여 멀티 플랫폼 빌드(필요시) 및 캐싱을 활용해 이미지를 빌드합니다.
   - 생성된 이미지를 Amazon ECR에 푸시합니다. 태그는 Git Commit SHA를 사용합니다.
5. **Update ECS Task Definitions**:
   - `ecs/task-definition.json` (API 서버)과 `ecs/worker-task-definition.json` (워커) 파일의 이미지 URI를 새 이미지로 교체합니다.
6. **Deploy to Amazon ECS**:
   - 새로운 Task Definition을 등록하고, ECS Service를 업데이트하여 배포를 시작합니다.
   - `force-new-deployment: true` 옵션으로 새로운 컨테이너가 즉시 롤링 업데이트됩니다.

## 2. Docs Deployment (`.github/workflows/docs-pages.yml`)

### **Trigger**
- `Main` 브랜치에 푸시될 때 자동으로 실행됩니다.
- 목적: 프로젝트 문서를 빌드하고 GitHub Pages에 배포합니다.

### **Steps**
1. **Build Docs**: `npm run docs:build`를 실행하여 OpenAPI(HTML), TypeDoc, Changelog 등을 생성합니다.
2. **Upload Artifact**: `docs/` 폴더를 GitHub Pages 아티팩트로 업로드합니다.
3. **Deploy to GitHub Pages**: 아티팩트를 `github-pages` 환경에 배포하여 정적 웹사이트로 호스팅합니다.

## 3. NPM SDK Publishing (`.github/workflows/npm-deploy.yml`)

### **Trigger**
- `Main` 브랜치에 `z_npm_sdk/` 경로의 변경사항이 푸시될 때 실행됩니다.
- 목적: 프론트엔드용 SDK 패키지를 NPM 레지스트리에 배포합니다.

### **Steps**
1. **Build SDK**: `npm run build`를 실행하여 SDK를 번들링합니다.
2. **Automated Version Bump**:
   - `git` 설정을 하고 `npm version patch`를 실행하여 `package.json`의 버전을 자동으로 올립니다 (0.0.x -> 0.0.x+1).
   - 변경된 버전 파일을 Git에 커밋하고 푸시합니다.
3. **Publish to NPM**:
   - `npm publish --provenance`를 실행하여 퍼블릭 NPM 레지스트리에 패키지를 배포합니다.
   - `provenance` 옵션으로 패키지의 출처(GitHub Actions)를 증명합니다.

## 4. Infrastructure (AWS)

- **Compute**: AWS ECS (Elastic Container Service) with Fargate (Serverless)
- **Networking**: VPC, Public/Private Subnets, ALB (Application Load Balancer)
- **Database**:
  - PostgreSQL, Redis, MongoDB는 외부 관리형 서비스(, Azure/MongoDB Atlas) 또는 EC2/Docker를 사용합니다.
- **Messaging**: Amazon SQS (Simple Queue Service)

## 3. Secret Management

- **Build Time**: GitHub Repository Secrets (`AWS_ACCESS_KEY_ID`, `ECR_REPOSITORY` 등)
- **Runtime**:
  - **ECS**: Task Definition의 `secrets` 또는 `environment` 필드를 통해 주입됩니다.
  - **Infisical**: (Local/Dev) 개발 환경에서는 Infisical CLI를 통해 환경 변수를 주입받습니다.
