-- CreateTable
CREATE TABLE "daily_usages" (
    "id" TEXT NOT NULL,
    "user_id" VARCHAR(191) NOT NULL,
    "date" DATE NOT NULL,
    "chat_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_user_date" ON "daily_usages"("user_id", "date");
