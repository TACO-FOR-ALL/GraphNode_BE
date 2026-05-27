import {
  aiRawSourceTypeFromMacroFileHint,
  buildUserFileResolvedHint,
} from '../../src/workers/utils/sourceTypeResolver';
import type { UserFileDoc } from '../../src/core/types/persistence/userFile.persistence';

function stubUserFile(partial: Partial<UserFileDoc> & Pick<UserFileDoc, '_id' | 'displayName'>): UserFileDoc {
  return {
    ownerUserId: 'user-12345',
    folderId: null,
    s3Key: `user-files/user-12345/${partial._id}`,
    mimeType: 'application/octet-stream',
    sizeBytes: 1,
    category: 'unknown',
    summaryStatus: 'completed',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as UserFileDoc;
}

describe('aiRawSourceTypeFromMacroFileHint', () => {
  it('maps macro file types to extension bucket keys', () => {
    expect(
      aiRawSourceTypeFromMacroFileHint(
        buildUserFileResolvedHint(
          stubUserFile({ _id: 'uf-pdf', displayName: 'a.pdf', mimeType: 'application/pdf', category: 'pdf' })
        )
      )
    ).toBe('pdf');
    expect(
      aiRawSourceTypeFromMacroFileHint(
        buildUserFileResolvedHint(
          stubUserFile({
            _id: 'uf-docx',
            displayName: 'a.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            category: 'word',
          })
        )
      )
    ).toBe('docx');
    expect(
      aiRawSourceTypeFromMacroFileHint(
        buildUserFileResolvedHint(
          stubUserFile({
            _id: 'uf-pptx',
            displayName: 'a.pptx',
            mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            category: 'ppt',
          })
        )
      )
    ).toBe('pptx');
  });
});
