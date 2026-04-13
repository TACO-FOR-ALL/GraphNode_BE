-- CreateEnum
CREATE TYPE "OnboardingOccupation" AS ENUM (
  'developer',
  'student',
  'entrepreneur',
  'researcher',
  'creator',
  'other'
);

-- CreateEnum
CREATE TYPE "OnboardingAgentMode" AS ENUM ('formal', 'friendly', 'casual');

-- CreateTable
CREATE TABLE "user_info" (
  "id" TEXT NOT NULL,
  "onboarding_occupation" "OnboardingOccupation",
  "onboarding_interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "onboarding_agent_mode" "OnboardingAgentMode" NOT NULL DEFAULT 'formal',
  CONSTRAINT "user_info_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "user_info_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_user_info_id_key" ON "users"("user_info_id");

-- AddForeignKey
ALTER TABLE "users"
ADD CONSTRAINT "users_user_info_id_fkey"
FOREIGN KEY ("user_info_id") REFERENCES "user_info"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
