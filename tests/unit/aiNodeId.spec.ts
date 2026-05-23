import { normalizeAiOrigId } from '../../src/shared/utils/aiNodeId';

describe('normalizeAiOrigId', () => {
  it('removes src<number>_ merge prefix', () => {
    expect(normalizeAiOrigId('src0_conv-e2e-123')).toEqual({
      rawOrigId: 'src0_conv-e2e-123',
      normalizedOrigId: 'conv-e2e-123',
      strippedSourcePrefix: true,
    });
  });

  it('maps macro bundle file origId with type prefix to user_files._id', () => {
    expect(normalizeAiOrigId('docx_uf-e2e-docx_e2e-macro-sample')).toEqual({
      rawOrigId: 'docx_uf-e2e-docx_e2e-macro-sample',
      normalizedOrigId: 'uf-e2e-docx',
      strippedSourcePrefix: false,
      strippedMacroBundleFilePrefix: true,
    });
  });

  it('maps macro bundle file origId without type prefix to user_files._id', () => {
    expect(normalizeAiOrigId('uf-e2e-pdf_e2e-macro-sample.pdf')).toEqual({
      rawOrigId: 'uf-e2e-pdf_e2e-macro-sample.pdf',
      normalizedOrigId: 'uf-e2e-pdf',
      strippedSourcePrefix: false,
      strippedMacroBundleFilePrefix: true,
    });
  });

  it('leaves conversation and note origIds unchanged', () => {
    expect(normalizeAiOrigId('conv-e2e-123').normalizedOrigId).toBe('conv-e2e-123');
    expect(normalizeAiOrigId('note-e2e-123').normalizedOrigId).toBe('note-e2e-123');
  });
});
