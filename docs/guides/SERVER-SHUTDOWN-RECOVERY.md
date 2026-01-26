# GraphNode 서버 완전 중단 및 복구 가이드 (AWS Web Console 기준)

이 가이드는 AWS Web Console을 사용하여 서버 비용을 완전히 제거(ALB, Secrets Manager 포함)하고, 이후 다시 서비스를 재개할 때 필요한 복구 절차를 다룹니다.

---

## 🛑 1. 서버 완전 중단 절차 (비용 0원 만들기)

이미 ASG(Auto Scaling Group)의 용량을 0으로 설정하셨으므로, EC2 비용은 발생하지 않습니다. 이제 남은 비용(ALB, Secrets Manager)을 제거하고 ECS 서비스를 중단하는 절차입니다.

### 1.1 ECS Service 중단 (Web Console)

ECS 서비스가 계속 실행 중이면, ASG가 0이라도 계속해서 태스크를 배치하려고 시도하거나 로그에 에러가 남을 수 있습니다.

1. **AWS Console** 접속 후 **ECS** 검색 및 이동.
2. 좌측 메뉴에서 **Clusters** 클릭 → `taco-4-graphnode-cluster` 클릭.
3. **Services** 탭에서 `taco-4-graphnode-service` 체크박스 선택.
4. 우측 상단 **Update** 버튼 클릭.
5. **Desired tasks** 값을 `0`으로 변경.
6. 하단 **Skip to review** 클릭 후 **Update Service** 클릭.
   - _결과: ECS가 더 이상 태스크를 실행하지 않게 됩니다._

### 1.2 ALB (Load Balancer) 삭제 (Web Console)

ALB는 시간당 비용이 발생하므로 삭제합니다.

1. **AWS Console**에서 **EC2** 검색 및 이동.
2. 좌측 메뉴 하단 **Load Balancing** → **Load Balancers** 클릭.
3. `taco-4-graphnode-alb` (또는 해당되는 ALB 이름) 선택.
4. **Actions** → **Delete load balancer** 클릭.
5. 확인 창에서 `confirm` 입력 후 삭제.
   - _결과: ALB 비용이 즉시 중단됩니다._
   - _주의: Target Group은 비용이 들지 않으므로 굳이 삭제하지 않아도 되지만, 깔끔하게 하려면 삭제해도 됩니다. 복구 가이드는 Target Group도 새로 만드는 것을 가정합니다._

### 1.3 Secrets Manager 삭제 (선택 사항)

Secrets Manager는 저장된 비밀 개당 비용($0.40/월)이 발생합니다.

1. **AWS Console**에서 **Secrets Manager** 검색 및 이동.
2. `taco4/graphnode/mvp` (또는 해당되는 시크릿 이름) 클릭.
3. 우측 상단 **Actions** → **Delete secret** 클릭.
4. **Waiting period**를 최소값(7일)으로 설정하고 삭제.
   - _주의: 삭제 후 7일~30일 동안은 복구 가능하지만, 그 이후에는 영구 삭제됩니다. 백업을 반드시 해두세요._

---

## 🚀 2. 서버 복구 가이드 (재배포 시)

서버를 다시 켤 때 수행해야 하는 순서입니다. ALB가 삭제되었으므로 네트워크 연결을 다시 구성해야 합니다.

### ✅ 사전 준비

- 이전에 사용하던 **Docker Image**가 ECR에 그대로 있어야 합니다.
- **Task Definition**은 ECS에 남아있으므로 그대로 사용합니다.

### 2.1 Secrets Manager 복구 (삭제했을 경우)

삭제했다면 다시 생성해야 ECS가 환경변수를 가져올 수 있습니다.

1. **Secrets Manager** → **Store a new secret**.
2. **Other type of secret** 선택.
3. **Key/Value** 쌍으로 기존 환경변수들 입력 (`MYSQL_URL`, `MONGODB_URL`, `SESSION_SECRET` 등).
4. Secret name을 기존과 동일하게 설정 (`taco4/graphnode/mvp` 등).
   - _이름이 다르면 Task Definition에서 ARN을 수정해야 하므로 기존 이름을 쓰는 것이 좋습니다._

### 2.2 Target Group 생성

ALB가 트래픽을 보낼 대상 그룹을 만듭니다.

1. **EC2** → **Load Balancing** → **Target Groups**.
2. **Create target group** 클릭.
3. **Basic configuration**:
   - Choose a target type: **Instances** (ECS EC2 모드이므로).
   - Target group name: `taco-4-graphnode-tg-new` (이름은 자유).
   - Protocol: **HTTP**, Port: **80** (또는 Node.js 포트, 보통 컨테이너 매핑 포트).
     - _주의: Task Definition에서 호스트 포트를 0(동적 포트)으로 썼다면 ALB가 알아서 찾지만, 고정 포트(80)를 썼다면 80으로 설정._
   - VPC: 기존 ECS 인스턴스가 있는 VPC 선택.
4. **Health checks**:
   - Health check path: `/healthz` (또는 `/v1/healthz`).
5. **Next** 클릭.
6. **Register targets**: 지금은 인스턴스가 없으므로 아무것도 선택하지 않고 **Create target group** 클릭.

### 2.3 ALB (Load Balancer) 생성

새로운 로드 밸런서를 만듭니다.

1. **EC2** → **Load Balancing** → **Load Balancers**.
2. **Create load balancer** → **Application Load Balancer** (Create).
3. **Basic configuration**:
   - Load balancer name: `taco-4-graphnode-alb-new`.
   - Scheme: **Internet-facing** (외부 접속용).
   - IP address type: **IPv4**.
4. **Network mapping**:
   - VPC: ECS 클러스터가 있는 VPC 선택.
   - Mappings: **최소 2개 이상의 Availability Zone (AZ)** 선택 (예: ap-northeast-2a, 2c).
5. **Security groups**:
   - 기존에 사용하던 ALB용 보안 그룹(`taco-4-alb-sg` 등) 선택.
   - _없다면 새로 생성: Inbound 규칙에 HTTP(80), HTTPS(443) - Source: Anywhere (0.0.0.0/0) 추가._
6. **Listeners and routing**:
   - **HTTP:80** 리스너 추가 → Default action: Forward to `taco-4-graphnode-tg-new` (방금 만든 타겟 그룹).
   - **HTTPS:443** 리스너 추가 (SSL 인증서가 있는 경우):
     - Default action: Forward to `taco-4-graphnode-tg-new`.
     - **Secure listener settings**: ACM(Certificate Manager)에서 도메인 인증서 선택.
7. **Create load balancer** 클릭.

### 2.4 Route 53 연결 (도메인 복구)

새로 만든 ALB의 주소(DNS Name)를 도메인과 연결합니다.

1. **Route 53** → **Hosted zones**.
2. 내 도메인(`example.com`) 클릭.
3. 기존 **A 레코드** (ALB 연결된 것) 선택 후 **Edit record**.
4. **Route traffic to**:
   - Alias to Application and Classic Load Balancer.
   - Region: `ap-northeast-2` (서울).
   - Load balancer: 방금 만든 `taco-4-graphnode-alb-new` 선택.
5. **Save** 클릭.

### 2.5 ECS Service 업데이트 (새 ALB 연결)

ECS 서비스가 옛날 ALB(삭제됨)를 찾지 못하도록 새 ALB와 연결해줍니다.

1. **ECS** → **Clusters** → `taco-4-graphnode-cluster`.
2. **Services** → `taco-4-graphnode-service` 클릭.
3. **Update** 클릭.
4. **Load balancing** 섹션 찾기.
   - Load balancer type: **Application Load Balancer**.
   - Load balancer name: `taco-4-graphnode-alb-new` 선택 (안 보이면 기존 설정 삭제 후 다시 추가).
   - Container to load balance: `taco4_graphnode_container:3000` (또는 80) → **Add to load balancer**.
   - **Target group name**: `taco-4-graphnode-tg-new` 선택.
5. **Desired tasks**: `1`로 변경 (서비스 재개).
6. **Update Service** 클릭.

### 2.6 ASG (Auto Scaling Group) 복구

마지막으로 EC2 인스턴스를 다시 띄웁니다.

1. **EC2** → **Auto Scaling** → **Auto Scaling Groups**.
2. ECS용 ASG 선택 (`Infra-ECS-Cluster-...` 같은 이름).
3. **Edit** 클릭.
4. **Desired capacity**: `1` (또는 필요한 수).
5. **Min desired capacity**: `1`.
6. **Update** 클릭.

---

## 🎉 복구 완료 확인

1. **EC2** 인스턴스가 `Running` 상태인지 확인.
2. **ECS** 서비스의 `Running tasks`가 1인지 확인.
3. **Target Group**에서 인스턴스 상태가 `Healthy`인지 확인.
4. 웹 브라우저에서 도메인으로 접속 확인.
