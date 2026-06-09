import AdmZip from 'adm-zip';

/**
 * OpenAI export 형식 minimal conversations.json ZIP (E2E import용).
 */
export function buildMinimalOpenAiExportZip(): Buffer {
  const conversations = [
    {
      title: 'E2E Import Chat',
      current_node: 'node-2',
      mapping: {
        'node-1': {
          id: 'node-1',
          parent: null,
          message: {
            author: { role: 'user' },
            content: { parts: [{ text: 'Hello from E2E import' }] },
            create_time: 1700000000,
          },
        },
        'node-2': {
          id: 'node-2',
          parent: 'node-1',
          message: {
            author: { role: 'assistant' },
            content: { parts: [{ text: 'Hi from E2E import' }] },
            create_time: 1700000001,
          },
        },
      },
    },
  ];

  const zip = new AdmZip();
  zip.addFile('conversations.json', Buffer.from(JSON.stringify(conversations), 'utf-8'));
  return zip.toBuffer();
}

export function buildEmptyZip(): Buffer {
  const zip = new AdmZip();
  zip.addFile('readme.txt', Buffer.from('not an export', 'utf-8'));
  return zip.toBuffer();
}
