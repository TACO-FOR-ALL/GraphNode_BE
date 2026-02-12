# 🔐 Security Architecture

GraphNode Backend는 **다층 보안(Defense in Depth)** 원칙을 적용하여 애플리케이션, 데이터, 인프라를 보호합니다.

## 1. Authentication & Authorization

### **JWT (JSON Web Tokens)**
- **Access Token**: 짧은 수명(1시간), API 요청 시 `Authorization: Bearer <token>` 헤더로 전송.
- **Refresh Token**: 긴 수명(14일), `HttpOnly`, `Secure` 쿠키로 관리하여 XSS 공격 방지.
- **Rotation**: Refresh Token 사용 시 새로운 Access/Refresh Token 쌍을 발급하여 탈취 위험 최소화.

### **OAuth 2.0 (Social Login)**
- **Google & Apple**: 소셜 로그인 제공자의 ID Token을 검증하여 사용자 신원을 확인합니다.
- **Profile**: 최소한의 프로필 정보(식별자, 이메일, 이름)만 저장합니다.

## 2. Data Protection

### **Encryption at Rest**
- **DB**: AWS RDS/DocumentDB의 저장 데이터 암호화(KMS) 사용.
- **Sensitve Data**: 사용자의 OpenAI/Claude API Key 등 민감 정보는 애플리케이션 레벨에서 암호화(AES-256)하여 DB에 저장합니다.

### **Transit Security**
- **TLS/SSL**: 모든 API 통신은 HTTPS(TLS 1.2+)를 강제합니다.
- **Internal**: VPC 내부 통신(ECS <-> RDS/Redis)은 Private Subnet 내에서 안전하게 이루어집니다.

## 3. Infrastructure Security

### **VPC Isolation**
- **Public Subnet**: ALB(Load Balancer)만 배치하여 외부 트래픽 수신.
- **Private Subnet**: API 서버, 워커, DB는 외부에서 직접 접근할 수 없는 Private Subnet에 배치.
- **NAT Gateway**: 서버가 외부(OpenAI API 등)로 나가는 트래픽은 NAT를 통해 제어.

### **Secret Management**
- **Development**: **Infisical**을 사용하여 암호화된 환경 변수를 팀원 간 안전하게 공유.
- **Production**: **AWS Secrets Manager** 또는 ECS Task Definition의 Secure Environment Variables를 사용하여 비밀 정보를 주입.
- **Hardcoding**: 소스 코드 내에 어떠한 비밀 정보(Key, Password)도 포함하지 않음.

## 4. Application Security

- **Helmet**: HTTP 보안 헤더(HSTS, X-Frame-Options 등) 자동 설정.
- **Input Validation**: Zod를 사용하여 모든 요청 데이터의 타입과 형식을 엄격히 검증.
- **Rate Limiting**: 과도한 요청 방지 및 DDoS 완화를 위한 API 요청 제한.
