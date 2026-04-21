# src/agent — AI Agent Tools (Function Calling)

Claude Function Calling 도구 정의 및 ToolRegistry 관리.
AI가 대화 중 호출할 수 있는 백엔드 데이터 접근 도구들.

## 파일 구성

```
ToolRegistry.ts   등록된 모든 Tool의 스키마·핸들러 맵
types.ts          Tool 공통 타입 정의
tools/
  Get*.ts         조회 도구 (읽기 전용)
  Search*.ts      검색 도구
```

## Tool 구현 패턴

```ts
// tools/GetFooTool.ts
export const GetFooTool: AgentTool<GetFooInput, GetFooOutput> = {
  name: 'get_foo',
  description: 'AI가 언제 이 도구를 호출해야 하는지 명확히 서술',
  inputSchema: GetFooInputSchema,  // Zod schema
  handler: async (input, ctx) => {
    return ctx.fooService.getFoo(input.id);
  },
};
```

## 신규 Tool 추가 시

1. `tools/` 에 `<Action><Domain>Tool.ts` 파일 생성
2. `ToolRegistry.ts` 에 등록 (`registry.register(GetFooTool)`)
3. Tool description은 AI가 판단할 수 있게 **구체적으로** 작성 (예: "사용자가 특정 노트 내용을 물어볼 때 호출")
4. 읽기 전용 도구만 허용 — Tool에서 데이터 변경 금지

## 금지사항

- Tool handler에서 직접 DB/Repository 접근 금지 → Service를 통해 접근
- 쓰기/삭제 도구 추가 금지 (현재 Agent는 read-only 정책)
