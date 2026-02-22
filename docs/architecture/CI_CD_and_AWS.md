# 🚀 CI/CD Pipeline & AWS Architecture

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

## 5. Secret & Credential Management (AWS 접근 인증 방식)

AWS 환경(특히 ECS Fargate)에서의 인증은 기존의 하드코딩된 Access Key 방식이 아닌 **IAM Task Role**을 기반으로 하는 보다 안전한 방식을 사용합니다.

### **ECS Task Role의 개념과 동작 원리**
- ECS 컨테이너를 구동할 때 환경 변수(`environment`, `secrets`)에 `AWS_ACCESS_KEY_ID`나 `AWS_SECRET_ACCESS_KEY`를 넣지 **않는 것**이 권장사항입니다.
- 대신 Task Definition에 정의된 `taskRoleArn` (예: `graphnode-ecs-task-role`)을 통해 컨테이너 자체에 역할을 부여합니다.
- 컨테이너 내부의 AWS SDK(예: SQSClient, S3Client 등)는 명시된 키 정보가 없을 경우 (`credentials: undefined`), ECS 메타데이터 엔드포인트를 호출하여 해당 `Task Role`에 대한 임시 자격 증명(Session Token)을 자동으로 발급받아 사용합니다.

### **코드 레벨 구현 규칙**
코드 내에서 AWS Client 인스턴스를 생성할 때는 아래와 같이 분기를 주어, 환경 변수에 명시적인 키가 없을 경우 `undefined` 값으로 설정되게끔 구현해야 합니다. 이렇게 해야 ECS(운영 환경)에서 SDK가 자동으로 Task Role 인증 절차로 폴백(Fallback)할 수 있습니다.

```typescript
this.client = new SQSClient({
  region: env.AWS_REGION,
  credentials:
    env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined, // ECS Task Role 사용 시 undefined로 두면 임시 토큰 자동 로드
});
```

### **환경별 인증 주입 방식 요약**
- **Build Time (CI/CD)**: GitHub Repository Secrets에 보관된 IAM OIDC를 통해 배포 권한 획득 (`configure-aws-credentials`)
- **Runtime (AWS ECS 운영 환경)**: IAM Task Role을 통한 임시 보안 토큰 자동 프로비저닝 (환경변수 주입 안함)
- **Runtime (Local/Dev 환경)**: Infisical CLI 혹은 `.env` 텍스트 파일을 통해 단일 개발자용 엑세스 키를 환경 변수로 직접 로드하여 사용
- **기타 시크릿**: AWS Secrets Manager(ASM)와 연동하여 Task Definition `secrets` 항목에서 ARN을 설정하면, 컨테이너 기동 시 평문 환경변수로 자동 복호화되어 주입됨.
