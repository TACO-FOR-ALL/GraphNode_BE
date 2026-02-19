import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import officeParser from 'officeparser';

const pdf = require('pdf-parse');

/**
 * 처리된 문서의 결과 인터페이스
 * @property type 'text' | 'image' - 문서 컨텐츠 유형
 * @property content 추출된 텍스트 또는 Base64 문자열
 * @property metadata 문서 메타데이터 (파일명, MIME 타입 등)
 */
export interface ProcessedDocument {
  type: 'text' | 'image';
  content: string;
  metadata?: {
    filename: string;
    mimeType: string;
    pageCount?: number;
  };
}

/**
 * 문서 처리기 (Document Processor)
 * 
 * 다양한 파일 형식(PDF, Word, Excel, PPT, Code 등)을 읽어 
 * AI 모델이 이해할 수 있는 텍스트 형식으로 변환하거나,
 * 이미지를 처리 가능한 형태로 변환합니다.
 * 
 * 주요 기능:
 * - PDF 텍스트 추출 (`pdf-parse`)
 * - Word(.docx) 텍스트 추출 (`mammoth`)
 * - Excel/CSV 표 데이터 -> CSV 텍스트 변환 (`xlsx`)
 * - PPT 프레젠테이션 텍스트 추출 (`officeparser`)
 * - 소스 코드 및 일반 텍스트 파일 읽기
 * - 이미지 파일 처리 (Base64 변환은 Provider 혹은 호출부에서 처리하도록 바이패스하거나 지원 가능)
 */
export class DocumentProcessor {
  
  /**
   * 파일 버퍼를 받아 처리된 문서 결과를 반환합니다.
   * 
   * @param buffer 파일의 바이너리 버퍼
   * @param mimetype 파일의 MIME 타입 (예: application/pdf)
   * @param filename 파일명 (확장자 기반 처리를 위해 필요)
   * @returns {Promise<ProcessedDocument>} 처리된 문서 객체
   * @throws {Error} 지원하지 않거나 처리 중 오류 발생 시 에러
   * 
   * @example
   * ```ts
   * const processor = new DocumentProcessor();
   * const result = await processor.process(fileBuffer, 'application/pdf', 'doc.pdf');
   * console.log(result.content); // 추출된 텍스트
   * ```
   */
  async process(buffer: Buffer, mimetype: string, filename: string): Promise<ProcessedDocument> {
    const ext = path.extname(filename).toLowerCase().replace('.', '');

    // 1. 코드 및 텍스트 파일 (Code / Text Files)
    // - 명시적으로 text/* 타입이거나, 알려진 코드 확장자인 경우
    if (this.isCodeOrTextFile(ext) || mimetype.startsWith('text/')) {
      return { 
        type: 'text', 
        content: `[File: ${filename}]\n\`\`\`${ext}\n${buffer.toString('utf-8')}\n\`\`\``,
        metadata: { filename, mimeType: mimetype }
      };
    }

    // 2. PDF 파일
    if (mimetype === 'application/pdf' || ext === 'pdf') {
      try {
        const data = await pdf(buffer);
        return {
          type: 'text',
          content: `[File: ${filename} (PDF)]\n${data.text}`,
          metadata: { filename, mimeType: mimetype, pageCount: data.numpages }
        };
      } catch (e) {
        throw new Error(`Failed to parse PDF: ${e}`);
      }
    }

    // 3. Excel / CSV / Spreadsheet
    if (mimetype.includes('spreadsheet') || mimetype.includes('csv') || ['xlsx', 'xls', 'csv'].includes(ext)) {
      try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0]; // 첫 번째 시트만 처리 (일반적)
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        return {
          type: 'text',
          content: `[File: ${filename} (Sheet: ${sheetName})]\n\`\`\`csv\n${csv}\n\`\`\``,
          metadata: { filename, mimeType: mimetype }
        };
      } catch (e) {
         throw new Error(`Failed to parse Spreadsheet: ${e}`);
      }
    }

    // 4. Word (.docx)
    if (mimetype.includes('wordprocessingml') || ext === 'docx') {
       try {
         const result = await mammoth.extractRawText({ buffer });
         return {
           type: 'text',
           content: `[File: ${filename} (Word)]\n${result.value}`,
           metadata: { filename, mimeType: mimetype }
         };
       } catch (e) {
          throw new Error(`Failed to parse Word document: ${e}`);
       }
    }

    // 5. PowerPoint (.pptx)
    if (mimetype.includes('presentation') || ['pptx', 'ppt'].includes(ext)) {
        try {
             // 임시 파일 생성
             const tempPath = path.join(__dirname, `temp_${Date.now()}_${filename}`);
             fs.writeFileSync(tempPath, buffer);
             
             try {
                const text = await new Promise<string>((resolve, reject) => {
                    officeParser.parseOffice(tempPath, (data: any, err: any) => {
                        if (err) reject(err);
                        else resolve(typeof data === 'string' ? data : JSON.stringify(data));
                    });
                });
                
                return {
                    type: 'text',
                    content: `[File: ${filename} (Slide)]\n${text}`,
                    metadata: { filename, mimeType: mimetype }
                };
             } finally {
                 // 임시 파일 삭제
                 if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
             }

        } catch (e) {
             throw new Error(`Failed to parse Presentation: ${e}`);
        }
    }

    // 6. 이미지 (Image) - Base64 변환은 호출부(Provider)에서 수행하거나 여기서 변환
    // OpenAI Provider 로직상 여기서 Base64로 주면 편함.
    // 하지만 Provider가 "Image URL" 구조를 원하므로, 여기서는 "image" 타입임을 알리고 
    // Content에 Base64를 담아준다.
    if (mimetype.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return {
        type: 'image',
        content: buffer.toString('base64'),
        metadata: { filename, mimeType: mimetype }
      };
    }

    // 7. 기타 바이너리/알 수 없는 파일
    // 텍스트로 시도해보고 안되면 메시지 반환
    try {
        // UTF-8 텍스트로 읽기 시도
        const text = buffer.toString('utf-8');
        // 널 바이트 등 바이너리 시그니처 체크 (간단히)
        // \0 문자가 많이 포함되어 있으면 바이너리로 간주
        if (text.includes('\0')) {
             return {
                 type: 'text',
                 content: `[File: ${filename}]\n(Binary file content not displayed)`,
                 metadata: { filename, mimeType: mimetype }
             };
        }
        return {
            type: 'text',
            content: `[File: ${filename}]\n\`\`\`\n${text}\n\`\`\``,
            metadata: { filename, mimeType: mimetype }
        };
    } catch {
         return {
             type: 'text',
             content: `[File: ${filename}]\n(Unable to read file content)`,
             metadata: { filename, mimeType: mimetype }
         };
    }
  }

  /**
   * 확장자가 텍스트/코드 파일인지 판별합니다.
   * @param ext 파일 확장자 (점 제외)
   */
  private isCodeOrTextFile(ext: string): boolean {
    const codeExts = [
      'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', // Programming
      'html', 'css', 'scss', 'less', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'env', // Config/Web
      'md', 'txt', 'log', 'csv', 'sql', 'sh', 'bat', 'ps1', 'dockerfile' // Docs/Scripts
    ];
    return codeExts.includes(ext);
  }
}

export const documentProcessor = new DocumentProcessor();
