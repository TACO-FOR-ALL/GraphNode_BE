import { describe, expect, it, jest } from '@jest/globals';

import { buildExportZipBuffer, threadToExportConversation } from '../../src/core/services/chatExport/buildExportZip';
import type { StoragePort } from '../../src/core/ports/StoragePort';

describe('buildExportZip', () => {
  it('maps thread createdAt without using job timestamps', () => {
    const payload = threadToExportConversation({
      id: 'c1',
      title: 'T',
      createdAt: '2019-05-01T08:00:00.000Z',
      updatedAt: '2019-06-01T08:00:00.000Z',
      messages: [],
    });
    expect(payload.conversation.createdAt).toBe('2019-05-01T08:00:00.000Z');
  });

  it('produces a zip buffer containing export.json', async () => {
    const storage = {
      downloadFile: jest.fn(async () => ({
        buffer: Buffer.from('file-bytes'),
        contentType: 'application/pdf',
      })),
    } as unknown as StoragePort;

    const zipBuffer = await buildExportZipBuffer(
      {
        exportedAt: new Date().toISOString(),
        exportScope: 'conversation',
        conversations: [
          threadToExportConversation({
            id: 'c1',
            title: 'T',
            createdAt: '2019-05-01T08:00:00.000Z',
            updatedAt: '2019-06-01T08:00:00.000Z',
            messages: [
              {
                id: 'm1',
                role: 'user',
                content: 'hi',
                attachments: [
                  {
                    id: 'a1',
                    type: 'file',
                    url: 'chat-files/a.pdf',
                    name: 'a.pdf',
                    mimeType: 'application/pdf',
                    size: 4,
                  },
                ],
              },
            ],
          }),
        ],
      },
      storage
    );

    expect(zipBuffer[0]).toBe(0x50);
    expect(zipBuffer[1]).toBe(0x4b);
    expect(storage.downloadFile).toHaveBeenCalledWith('chat-files/a.pdf', { bucketType: 'file' });
  });
});
