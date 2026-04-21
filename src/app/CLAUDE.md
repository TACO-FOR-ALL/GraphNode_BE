# src/app — Presentation Layer

HTTP 진입점. Zod 검증 · 라우팅 · `next(e)` 에러 위임만 담당. 비즈니스 로직 금지. **≤150 LOC/파일**.

## 파일 구성

```
controllers/   <Domain>Controller.ts — 요청 파싱·검증·Service 호출·응답 직렬화
routes/        <domain>.routes.ts — Express Router 정의, 미들웨어 체인 연결
middlewares/   인증(authMiddleware), correlationId 주입, 공통 검증 등
presenters/    도메인 객체 → HTTP 응답 DTO 변환 (Controller에서 분리)
utils/         HTTP 계층 전용 유틸 (파라미터 파싱 등)
```

## Controller 패턴

```ts
// 반드시 이 구조를 유지할 것
export class FooController {
  constructor(private readonly fooService: FooService) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = CreateFooSchema.parse(req.body);   // Zod 검증
      const result = await this.fooService.create(dto, req.user.id);
      res.status(201).json(result);
    } catch (e) {
      next(e);  // 에러는 반드시 next(e)로 위임
    }
  };
}
```

## 금지사항

- Repository 직접 import 금지 (`src/infra/repositories/**`)
- `try/catch` 안에서 비즈니스 로직 작성 금지
- `res.status(500).json(...)` 직접 응답 금지 → 항상 `next(e)`
- `console.*` 사용 금지 → `logger.withContext()`
