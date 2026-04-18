-- AlterTable: feedbacks 테이블에 attachments JSONB 컬럼 추가 (nullable, 여러 파일 메타데이터 배열)
ALTER TABLE "feedbacks" ADD COLUMN "attachments" JSONB;
