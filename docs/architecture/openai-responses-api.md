# OpenAI Responses API Integration

이 문서는 GraphNode 백엔드에 통합된 OpenAI Responses API의 아키텍처, 동작 방식, 주요 로직 및 데이터 구조를 설명합니다.

## 1. 개요 (Overview)

OpenAI Responses API는 멀티모달(텍스트, 이미지, 도구 호출 등) 출력을 스트리밍 방식으로 제공하는 고급 API입니다. GraphNode는 이를 통해 텍스트 응답뿐만 아니라 생성된 이미지, 코드 인터프리터(Code Interpreter) 실행 결과, 파일 검색(File Search) 결과 등을 처리하여 사용자에게 풍부한 채팅 경험을 제공합니다.

## 2. API 및 주요 기능 (Features)

GraphNode는 `AiInteractionService`를 통해 OpenAI Responses API와 통신합니다.

- **API Endpoint**: OpenAI SDK의 `client.responses.create()` 메서드를 사용 (Beta API).
- **지원 모델**: `gpt-4o` 등 Responses API 지원 모델.
- **주요 기능**:
  - **멀티모달 입력**: 텍스트 및 이미지(Vision) 입력을 동시에 처리.
  - **도구 호출 (Tools)**: Code Interpreter, File Search 등의 도구 사용 및 결과 처리.
  - **풍부한 출력**: 텍스트 스트리밍과 동시에 생성된 이미지 파일, 도구 실행 로그 등을 수신.
  - **Context Chaining**: `previous_response_id`를 사용하여 대화 맥락을 유지 (서버 측 상태 관리).

## 3. 동작 로직 (Logic Flow)

`AiInteractionService.handleOpenAIResponsesChat` 메서드가 핵심 로직을 담당합니다.

### 3.1. 요청 준비 (Request Preparation)
1.  **파일 업로드**: 사용자가 업로드한 파일이 있다면 OpenAI Files API를 통해 업로드합니다.
    - 이미지 파일 -> `vision` purpose
    - 기타 파일 -> `assistants` purpose (Code Interpreter/File Search 용)
2.  **메시지 구성**: 사용자 입력(텍스트/이미지)을 `input_text`, `input_image` 포맷으로 변환합니다.
3.  **도구 설정**: 파일이 첨부된 경우 `code_interpreter` 도구를 활성화하고 파일 ID를 연결합니다.

### 3.2. 스트리밍 응답 처리 (Streaming Response)
OpenAI로부터 수신되는 Server-Sent Events(SSE)를 실시간으로 처리합니다.

- **`response.created`**: 새로운 응답 ID(`response_id`)를 획득합니다.
- **`response.output_text.delta`**: 텍스트 생성이 진행됨에 따라 실시간으로 컨텐츠를 누적하고 클라이언트로 스트리밍(`onStream`)합니다.
- **`response.output_item.done`**: 하나의 출력 항목(메시지, 도구 호출 등)이 완료되었을 때 발생합니다.
    - **Message Item**: 텍스트 외에 **생성된 이미지(`image_file`)**가 포함된 경우, 이미지를 다운로드하고 S3에 업로드한 후 `Attachment`로 변환합니다.
    - **Code Interpreter Call**: 코드 실행 로그(`logs`)와 결과 이미지(`image`)를 추출하여 `metadata`에 저장합니다. 결과 이미지 또한 S3에 업로드하여 `Attachment`로 처리합니다.
- **`response.completed`**: 응답 생성이 완전히 종료되면 최종 `response_id`를 저장하여 다음 대화의 맥락(Context)으로 사용합니다.

### 3.3. 데이터 저장 (Persistence)
- **Attachments**: 생성된 이미지나 파일은 S3에 저장되고 `Attachment` 객체로 DB에 저장됩니다.
- **Metadata**: Code Interpreter의 실행 코드, 로그, 결과 등은 `MessageDoc.metadata` 필드에 구조화된 데이터로 저장되어 프론트엔드에서 활용할 수 있습니다.

## 4. 데이터 구조 (Data Structures)

### 4.1. MessageDoc & ChatMessage 업데이트
기존 메시지 구조에 `metadata` 필드가 추가되었습니다.

```typescript
export interface ChatMessage {
  // ... 기존 필드
  attachments?: Attachment[]; // 생성된 이미지/파일
  metadata?: {
    toolCalls?: {
      type: 'code_interpreter' | 'file_search';
      input?: string; // 실행 코드 또는 검색어
      logs?: string;  // 실행 로그
      outputs?: any[]; // 원본 출력 데이터
      citations?: any[]; // 검색 인용구
      [key: string]: any;
    }[];
    [key: string]: any;
  };
}
```

## 5. 주요 코드 (Key Code Snippets)

### 5.1. 스트리밍 및 이벤트 처리 (`AiInteractionService.ts`)

```typescript
for await (const chunk of res.data) {
    const eventType = (chunk as any).type;

    // 텍스트 스트리밍
    if (eventType === 'response.output_text.delta') {
         const delta = (chunk as any).delta;
         if (delta) {
             aiContent += delta;
             onStream?.(delta);
         }
    }
    
    // 완료된 아이템 처리 (이미지, 도구 등)
    if (eventType === 'response.output_item.done') {
        const item = (chunk as any).item;
        
        // 생성된 이미지 처리
        if (item.type === 'message') {
             for (const content of item.content) {
                 if (content.type === 'image_file') {
                     const fileId = content.image_file.file_id;
                     const attachment = await this.processGeneratedFile(fileId, apiKey, provider);
                     generatedAttachments.push(attachment);
                 }
             }
        }
        // ... Code Interpreter 처리 로직
    }
}
```

### 5.2. 파일 처리 헬퍼 (`processGeneratedFile`)

OpenAI에서 생성된 파일을 다운로드하여 내부 스토리지(S3)로 옮기는 로직입니다.

```typescript
private async processGeneratedFile(fileId: string, apiKey: string, provider: IAiProvider): Promise<Attachment> {
    // 1. OpenAI에서 파일 다운로드 (Buffer)
    const downloadRes = await provider.downloadFile(apiKey, fileId);
    
    // 2. S3 업로드
    const key = `chat-attachments/${uuidv4()}/${safeFilename}`;
    await this.storageAdapter.upload(key, buffer, mimeType, { bucketType: 'file' });
    
    // 3. Attachment 객체 반환
    return {
        id: uuidv4(),
        type: 'image', // or 'file'
        url: key, 
        name: safeFilename,
        // ...
    };
}
```

## 6. 사용법 (Usage)

API 사용자는 별도의 변경 없이 기존 채팅 API를 사용하면 됩니다. 
단, 응답 메시지(`ChatMessage`)에 `attachments`와 `metadata`가 포함될 수 있으므로, 프론트엔드에서는 이를 적절히 렌더링해야 합니다.

- **이미지 렌더링**: `attachments` 배열의 `image` 타입 항목을 렌더링.
- **코드/로그 렌더링**: `metadata.toolCalls` 배열을 확인하여 Code Interpreter 실행 창 등을 표시.
