# 작업 상세 문서 — [AI] Worker 노트(Markdown) 처리 및 파이프라인 연동

## 📌 메타 (Meta)
- **작성일**: 2026-03-06 KST
- **작성자**: Antigravity
- **버전**: v1.0
- **관련 이슈/PR**: —
- **스코프 태그**: [AI]

---

## 📝 TL;DR (핵심 요약)
- **목표:** 백엔드에서 전송된 `notes.json` 데이터를 다운로드하여 개별 마크다운 파일로 변환하고, 이를 AI 그래프 생성 파이프라인의 추가 입력(Extra Input)으로 전달함.
- **결과:** `worker.py` 내의 `handle_graph_generation` 메서드 수정, S3로부터의 추가 페이로드 다운로드 및 소스 병합 체계 고도화.
- **영향 범위:** `server/worker.py`, `macro/src/run_pipeline.py` 호출 로직.

---

## 📌 배경 / 컨텍스트

### 요구 사항
- SQS 메시지의 `extraS3Keys` 필드에 포함된 S3 키(예: `notes.json`)를 처리해야 함.
- 마크다운 데이터는 파이프라인(`run_pipeline.py`)이 인식할 수 있는 파일 시스템 구조(.md 파일들이 담긴 폴더)로 변환되어야 함.
- 기존 대화 JSON 입력과 마크다운 입력을 병합하여 하나의 결과물로 산출해야 함.

### 사전 조건/선행 작업
- 파이프라인의 `extract_features.py` 및 `markdown_loader.py`가 마크다운 소스 로딩을 지원해야 함 (기 구현됨).

---

## 📦 산출물

### 📄 수정된 파일
- `server/worker.py` — `extraS3Keys` 처리 및 노트 데이터의 마크다운 변환 로직 추가

---

## 🔧 상세 변경 (Method/Component)

### ✏ 수정 (Modified)

#### `server/worker.py` (`handle_graph_generation`)
- **Extra Inputs 처리**: `req.extraS3Keys`가 존재할 경우 반복문을 통해 S3에서 파일을 다운로드함.
- **Markdown 변환 로직**: 
    - 다운로드된 파일이 `notes.json`인 경우, 이를 파싱하여 `{note_id}.md` 파일들을 생성.
    - 각 파일 상단에 제목을 포함(`f"# {note_title}\n\n{note_content}"`)하여 리더블한 정보를 보존.
    - 생성된 임시 폴더 경로를 `extra_input_dirs` 리스트에 추가.
- **파이프라인 연동**: `run_pipeline.py` 실행 시 `--extra-input` 플래그를 통해 위에서 생성된 폴더들을 인자로 전달.

---

## 🚀 재현/실행 절차 (Onboarding)

### 📌 환경
- Python 3.9+
- AWS Credentials 및 S3 접근 권한

### ▶ 실행
```bash
# Worker 실행
python server/worker.py
```

### 🧪 검증
- SQS에 `extraS3Keys`가 포함된 `GRAPH_GENERATION_REQUEST` 메시지를 전송.
- Worker 로그에서 "Downloading extra input from s3://..." 메시지 확인.
- `INPUT_DIR` 내에 임시 폴더 및 `.md` 파일들이 정상적으로 생성되는지 확인.
- 결과 그래프의 `nodes` 배열에서 `source_type: 'markdown'` 노드 포함 여부 확인.

---

## 🛠 구성 / 가정 / 제약
- `notes.json`은 백엔드에서 정의한 특정 스키마(`id`, `title`, `content`)를 따른다고 가정함.
- 임시 폴더는 작업 완료 후 자동으로 정리되도록 설계됨.

---

## ⚠ 리스크 / 이슈 / 트러블슈팅
- **제목 추출 이슈**: 파이프라인의 `markdown_loader`가 YAML Front-matter를 선호하므로, 향후 `worker.py`에서 Front-matter를 생성하도록 보완 필요 (현재는 Markdown 헤더 방식 사용).

---

## 🔜 다음 작업 / TODO
- `worker.py`에서 마크다운 생성 시 YAML Front-matter 추가 지원.
- 비즈니스 로직에 따른 마크다운 정리(Cleaning) 단계 추가 여부 검토.

---

## 📎 참고 / 링크
- `macro/src/run_pipeline.py` (파이프라인 진입점)
- `macro/src/util/markdown_loader.py` (마크다운 로더)

---

## 📜 변경 이력
- v1.0 (2026-03-06): 최초 작성
