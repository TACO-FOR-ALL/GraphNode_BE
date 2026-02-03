# GraphNode 기여 가이드

GraphNode 프로젝트에 기여해 주셔서 감사합니다! 원활한 협업을 위해 아래 가이드를 준수해 주세요.

## 1. 개발 프로세스

### 브랜치 전략
우리는 엄격한 브랜치 전략을 따릅니다. 자세한 내용은 [BRANCHING.md](docs/BRANCHING.md)를 참고하세요.
- `main`: 배포 가능한 프로덕션 코드
- `develop`: 통합 개발 브랜치
- `feat/*`: 기능 개발 브랜치
- `fix/*`: 버그 수정 브랜치

### 개발 환경 설정
1. **Node.js**: Node.js 20 LTS 이상 사용
2. **Infisical**: 환경 변수 관리를 위해 Infisical 사용 (수동 `.env` 생성 지양)
3. **Docker**: 로컬 DB 및 벡터 저장소 실행에 필요

```bash
# 인프라 실행
npm run db:up

# 개발 서버 실행
infisical run -- npm run dev
```

## 2. 코드 스타일 및 표준

### 린트(Lint) & 포맷팅(Formatting)
**ESLint**와 **Prettier**를 사용하여 코드 품질을 유지합니다.
- 린트 실행: `npm run lint`
- 자동 수정: `npm run lint:fix`
- **Pre-commit**: 커밋 전 Husky 훅이 자동으로 코드를 검사합니다.

### 테스트(Testing)
- **유닛 테스트**: 모든 새로운 Service 및 Utils에 필수
    - 실행: `npm test`
    - 위치: `tests/unit/*.spec.ts`
- **통합 테스트**: DB Repository 등 외부 의존성이 있는 경우 권장

### 타입 안전성(Type Safety)
- **`any` 사용 지양**: 명시적인 인터페이스나 제네릭 사용
- **DTO 사용**: 계층 간 데이터 전달 시 DTO 사용 (Controller <-> Service)

## 3. Pull Request (PR) 체크리스트

PR을 제출하기 전에 다음을 확인하세요:
- [ ] 에러 없이 빌드됨 (`npm run build`)
- [ ] 모든 테스트 통과 (`npm test`)
- [ ] 린트 에러 없음 (`npm run lint`)
- [ ] 신규 기능에 대한 유닛 테스트 포함
- [ ] 관련 문서(Markdown/TSDoc) 업데이트 완료

## 4. 폴더 구조
모듈 구성 규칙은 [PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)를 참고하세요.
