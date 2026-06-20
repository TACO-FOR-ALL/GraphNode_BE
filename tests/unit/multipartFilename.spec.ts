import {
  repairMultipartFilename,
  resolveUploadFilename,
} from '../../src/shared/utils/multipartFilename';

describe('multipartFilename', () => {
  it('UTF-8 한글 파일명이 latin1로 깨진 경우 복구한다', () => {
    const original = '70216008-보고서.pdf';
    const corrupted = Buffer.from(original, 'utf8').toString('latin1');

    expect(repairMultipartFilename(corrupted)).toBe(original);
  });

  it('이미 정상인 한글 파일명은 그대로 둔다', () => {
    expect(repairMultipartFilename('보고서.pdf')).toBe('보고서.pdf');
  });

  it('ASCII 파일명은 변경하지 않는다', () => {
    expect(repairMultipartFilename('report.pdf')).toBe('report.pdf');
  });

  it('displayName 필드가 있으면 multer originalname보다 우선한다', () => {
    const corrupted = Buffer.from('70216008-보고서.pdf', 'utf8').toString('latin1');

    expect(resolveUploadFilename('70216008-보고서.pdf', corrupted)).toBe(
      '70216008-보고서.pdf'
    );
  });

  it('displayName이 비어 있으면 originalname 복구를 시도한다', () => {
    const corrupted = Buffer.from('70216008-보고서.pdf', 'utf8').toString('latin1');

    expect(resolveUploadFilename('   ', corrupted)).toBe('70216008-보고서.pdf');
  });
});
