-- CreateTable
CREATE TABLE "notion_integrations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "notion_workspace_id" VARCHAR(64) NOT NULL,
    "notion_workspace_name" VARCHAR(191),
    "notion_bot_id" VARCHAR(64),
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "token_type" VARCHAR(32) NOT NULL DEFAULT 'bearer',
    "token_expires_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "notion_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_notion_workspace_id" ON "notion_integrations"("notion_workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_user_notion_workspace" ON "notion_integrations"("user_id", "notion_workspace_id");

-- AddForeignKey
ALTER TABLE "notion_integrations" ADD CONSTRAINT "notion_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
