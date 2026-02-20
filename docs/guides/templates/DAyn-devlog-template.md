# 작업 상세 문서 — [작업 주제]

## 📌 메타 (Meta)
- **작성일**: 2026-XX-XX KST
- **작성자**: [팀명/이름]
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [BE] [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 
- **결과:** 
- **영향 범위:** 

---

## 📌 배경 / 컨텍스트

### 요구 사항
- 

### 사전 조건/선행 작업
- 

---

## 📦 산출물

### 📁 추가된 파일
- `경로/파일명` — 설명

### 📄 수정된 파일
- `경로/파일명` — 설명

### 🗑 삭제된 파일
- `경로/파일명` — 설명

---

## 🔧 상세 변경 (Method/Component)

### ✨ 생성 (Created)

#### `파일경로`
- `메서드/클래스명` — 설명

### ✏ 수정 (Modified)
- `파일경로` — 설명

### 🗑 제거 (Removed)
- `파일경로` — 설명

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- 

### 📦 설치
```bash
```

### ▶ 실행
```bash
```

### 🧪 검증
- 

---

## 🛠 구성 / 가정 / 제약
- 

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- 

---

## 🔜 다음 작업 / TODO
- 

---

## 📎 참고 / 링크
- 

---

## 📜 변경 이력
- v1.0 (2026-XX-XX): 최초 작성

---

## 📝 작성 예시 (참고용)

### ✨ 생성 (Created)

#### `src/shared/utils/documentProcessor.ts`
- `process(buffer, mimetype)` — 파일 바이너리를 받아 `ProcessedDocument` (`text` | `image` + Base64)로 변환
- 지원 포맷: PDF(`pdf-parse`), PPT(`officeparser`), Word(`mammoth`), Excel(`xlsx`), Image(`Buffer`), Code(`utf-8`)

### ✏ 수정 (Modified)

#### `src/core/services/AiInteractionService.ts` (`handleAIChat`)
- **파일 파이프라인**: 
  1. Multer 파일 → S3 업로드 
  2. `Attachment` 메타데이터 생성 
  3. Provider 호출 시 `storageAdapter` 전달 
  4. Provider 내부에서 S3 다운로드 및 `DocumentProcessor` 처리
