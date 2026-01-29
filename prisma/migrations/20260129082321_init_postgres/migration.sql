-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_user_id" VARCHAR(191) NOT NULL,
    "email" VARCHAR(191),
    "display_name" VARCHAR(191),
    "avatar_url" VARCHAR(512),
    "api_key_openai" VARCHAR(191),
    "api_key_deepseek" VARCHAR(191),
    "api_key_claude" VARCHAR(191),
    "api_key_gemini" VARCHAR(191),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(0),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_provider_user" ON "users"("provider", "provider_user_id");
