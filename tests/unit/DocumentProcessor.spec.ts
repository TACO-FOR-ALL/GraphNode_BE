/**
 * 목적: DocumentProcessor 유닛 테스트
 * - 파일 타입별(PDF, Word, Excel, Image 등) 처리 로직 검증
 * - 에러 핸들링 및 Fallback 검증
 */
import { DocumentProcessor } from '../../src/shared/utils/documentProcessor';

// Mock External Libraries
jest.mock('pdf-parse', () => {
    return jest.fn().mockResolvedValue({ text: 'PDF Content' });
});
jest.mock('mammoth', () => ({
    extractRawText: jest.fn().mockResolvedValue({ value: 'Word Content' }),
}));
jest.mock('officeparser', () => ({
    parseOfficeAsync: jest.fn().mockResolvedValue('PPT Content'),
}));
jest.mock('xlsx', () => ({
    read: jest.fn().mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: {
            'Sheet1': {}
        }
    }),
    utils: {
        sheet_to_csv: jest.fn().mockReturnValue('Col1,Col2\nVal1,Val2'),
    }
}));

describe('DocumentProcessor', () => {
    let processor: DocumentProcessor;

    beforeEach(() => {
        processor = new DocumentProcessor();
    });

    it('should process Images as Base64', async () => {
        const buffer = Buffer.from('fake-image-data');
        const result = await processor.process(buffer, 'image/png', 'test.png');

        expect(result.type).toBe('image');
        expect(result.content).toBe(buffer.toString('base64'));
    });

    it('should process PDF using pdf-parse', async () => {
        const buffer = Buffer.from('pdf-data');
        const result = await processor.process(buffer, 'application/pdf', 'test.pdf');

        expect(result.type).toBe('text');
        expect(result.content).toContain('PDF Content');
        expect(result.metadata?.parser).toBe('pdf-parse');
    });

    it('should process Word using mammoth', async () => {
        const buffer = Buffer.from('word-data');
        const result = await processor.process(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'test.docx');

        expect(result.type).toBe('text');
        expect(result.content).toBe('Word Content');
        expect(result.metadata?.parser).toBe('mammoth');
    });

    it('should process Excel using xlsx', async () => {
        const buffer = Buffer.from('excel-data');
        const result = await processor.process(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'test.xlsx');

        expect(result.type).toBe('text');
        expect(result.content).toContain('Col1,Col2');
        expect(result.metadata?.parser).toBe('xlsx');
    });

    it('should process PPT using officeparser', async () => {
        const buffer = Buffer.from('ppt-data');
        const result = await processor.process(buffer, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'test.pptx');

        expect(result.type).toBe('text');
        expect(result.content).toBe('PPT Content');
        expect(result.metadata?.parser).toBe('officeparser');
    });

    it('should process Code/Text files directly', async () => {
        const code = 'console.log("hello");';
        const buffer = Buffer.from(code);
        const result = await processor.process(buffer, 'application/javascript', 'test.js');

        expect(result.type).toBe('text');
        expect(result.content).toBe(code);
        expect(result.metadata?.parser).toBe('text');
    });

    it('should fallback to text for unsupported types', async () => {
        const content = 'Unknown content';
        const buffer = Buffer.from(content);
        const result = await processor.process(buffer, 'application/unknown', 'test.unknown');

        expect(result.type).toBe('text');
        expect(result.content).toBe(content); // Tries to read as UTF-8
    });
});
