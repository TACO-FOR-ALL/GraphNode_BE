/*
  Warnings:

  - You are about to drop the column `date` on the `daily_usages` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[user_id]` on the table `daily_usages` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `last_reset_date` to the `daily_usages` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "uniq_user_date";

-- AlterTable
ALTER TABLE "daily_usages" DROP COLUMN "date",
ADD COLUMN     "last_reset_date" DATE NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "daily_usages_user_id_key" ON "daily_usages"("user_id");

-- AddForeignKey
ALTER TABLE "daily_usages" ADD CONSTRAINT "daily_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
