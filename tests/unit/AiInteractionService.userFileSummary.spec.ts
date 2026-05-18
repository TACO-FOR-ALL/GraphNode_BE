/**
 * 목적: 사용자 라이브러리 파일 요약 (`summarizeUserLibraryFile`) 단위 테스트.
 * - S3 다운로드 → 텍스트 추출 → 선호 언어 → LLM 호출 흐름을 목으로 검증한다.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockDocumentProcess = jest.fn() as jest.MockedFunction<
  (buffer: Buffer, mimetype: string, filename: string) => Promise<
    import('../../src/shared/utils/documentProcessor').ProcessedDocument
  >
>;

jest.mock('../../src/shared/utils/documentProcessor', () => ({
  documentProcessor: {
    process: (buffer: Buffer, mimetype: string, filename: string) =>
      mockDocumentProcess(buffer, mimetype, filename),
  },
}));

jest.mock('../../src/shared/ai-providers/index', () => ({
  getAiProvider: jest.fn(),
}));

import { AiInteractionService } from '../../src/core/services/AiInteractionService';
import { ChatManagementService } from '../../src/core/services/ChatManagementService';
import { UserService } from '../../src/core/services/UserService';
import { StoragePort } from '../../src/core/ports/StoragePort';
import { IAiProvider } from '../../src/shared/ai-providers/IAiProvider';
import { getAiProvider } from '../../src/shared/ai-providers/index';

const mockChatSvc = {} as unknown as jest.Mocked<ChatManagementService>;

const mockUserSvc = {
  getPreferredLanguage: jest.fn(),
} as unknown as jest.Mocked<UserService>;

const mockStorageAdapter = {
  upload: jest.fn(),
  downloadStream: jest.fn(),
  downloadFile: jest.fn(),
} as unknown as jest.Mocked<StoragePort>;

const mockProvider = {
  checkAPIKeyValid: jest.fn(),
  generateChat: jest.fn(),
  requestGenerateThreadTitle: jest.fn(),
} as unknown as jest.Mocked<IAiProvider>;

const baseInput = {
  userId: 'user-sum-1',
  s3Key: 'user-files/user-sum-1/doc.pdf',
  displayName: 'doc.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
};

describe('AiInteractionService.summarizeUserLibraryFile', () => {
  let service: AiInteractionService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getAiProvider as jest.Mock).mockReturnValue(mockProvider);

    mockStorageAdapter.downloadFile.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4 fake'),
      contentType: 'application/pdf',
    });
    mockDocumentProcess.mockResolvedValue({
      type: 'text',
      content: '[File: doc.pdf (PDF)]\n본문 텍스트입니다.',
    });
    mockUserSvc.getPreferredLanguage.mockResolvedValue('ko');
    mockProvider.generateChat.mockResolvedValue({
      ok: true,
      data: {
        content: JSON.stringify({
          oneLine: '한 줄 요약 결과',
          purpose: '문서는 테스트 목적으로 작성되었습니다.',
          keyPoints: ['첫째', '둘째', '셋째'],
          conclusion: '결론입니다.',
        }),
        attachments: [],
      },
    });

    service = new AiInteractionService(mockChatSvc, mockUserSvc, mockStorageAdapter);
  });

  it('S3에서 파일을 받아 추출 텍스트로 generateChat을 호출하고 요약을 반환한다', async () => {
    const result = await service.summarizeUserLibraryFile(baseInput);

    expect(mockStorageAdapter.downloadFile).toHaveBeenCalledWith(baseInput.s3Key);
    expect(mockDocumentProcess).toHaveBeenCalledWith(
      expect.any(Buffer),
      baseInput.mimeType,
      baseInput.displayName
    );
    expect(getAiProvider).toHaveBeenCalledWith('openai');
    expect(mockUserSvc.getPreferredLanguage).toHaveBeenCalledWith(baseInput.userId);
    expect(mockProvider.generateChat).toHaveBeenCalledWith(
      'sk-test-openai-key',
      expect.objectContaining({
        model: 'gpt-4o-mini',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringMatching(/Korean|\[ 생성 언어 \]/),
          }),
          expect.objectContaining({
            role: 'user',
            content: expect.stringMatching(
              /\[파일 내용\][\s\S]*본문 텍스트입니다\./
            ),
          }),
        ]),
      }),
      undefined,
      undefined
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.summary).toBe('한 줄 요약 결과');
      expect(result.data.structured.oneLine).toBe('한 줄 요약 결과');
      expect(result.data.structured.keyPoints).toHaveLength(3);
    }
  });

  it('시스템 프롬프트에 생성 언어 라벨이 포함된다 (일본어 선호 → English 라벨)', async () => {
    mockUserSvc.getPreferredLanguage.mockResolvedValue('ja');

    await service.summarizeUserLibraryFile(baseInput);

    const call = mockProvider.generateChat.mock.calls[0];
    const messages = call[1].messages as { role: string; content: string }[];
    const systemContent = messages.find((m) => m.role === 'system')?.content ?? '';
    expect(systemContent).toContain('English');
  });

  it('선호 언어 조회 실패 시 English 라벨로 요약한다', async () => {
    mockUserSvc.getPreferredLanguage.mockRejectedValue(new Error('no user'));

    await service.summarizeUserLibraryFile(baseInput);

    const call = mockProvider.generateChat.mock.calls[0];
    const messages = call[1].messages as { role: string; content: string }[];
    const systemContent = messages.find((m) => m.role === 'system')?.content ?? '';
    expect(systemContent).toContain('English');
  });

  it('추출 결과가 이미지면 지원하지 않는다고 반환한다', async () => {
    mockDocumentProcess.mockResolvedValue({
      type: 'image',
      content: 'base64...',
    });

    const result = await service.summarizeUserLibraryFile(baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('요약을 지원하지 않습니다');
    }
    expect(mockProvider.generateChat).not.toHaveBeenCalled();
  });

  it('추출 텍스트가 비면 실패한다', async () => {
    mockDocumentProcess.mockResolvedValue({ type: 'text', content: '   \n  ' });

    const result = await service.summarizeUserLibraryFile(baseInput);

    expect(result).toEqual({ ok: false, error: '추출된 텍스트가 없습니다.' });
    expect(mockProvider.generateChat).not.toHaveBeenCalled();
  });

  it('generateChat 실패 시 ok: false와 에러 코드를 반환한다', async () => {
    mockProvider.generateChat.mockResolvedValue({ ok: false, error: 'rate_limited' });

    const result = await service.summarizeUserLibraryFile(baseInput);

    expect(result).toEqual({ ok: false, error: 'rate_limited' });
  });

  it('generateChat 응답 본문이 비면 실패한다', async () => {
    mockProvider.generateChat.mockResolvedValue({
      ok: true,
      data: { content: '   ', attachments: [] },
    });

    const result = await service.summarizeUserLibraryFile(baseInput);

    expect(result).toEqual({ ok: false, error: '요약 결과가 비어 있습니다.' });
  });

  it('JSON 파싱 실패 시 ok: false를 반환한다', async () => {
    mockProvider.generateChat.mockResolvedValue({
      ok: true,
      data: { content: 'not-json', attachments: [] },
    });

    const result = await service.summarizeUserLibraryFile(baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('JSON');
    }
  });
});
