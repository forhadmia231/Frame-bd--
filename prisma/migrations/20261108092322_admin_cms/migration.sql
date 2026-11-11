-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Content" ADD COLUMN     "ageRating" TEXT NOT NULL DEFAULT 'Not rated',
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "production" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ContentBanner" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "infoPath" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "watchPath" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "usageLimit" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "access" "ContentAccess" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'English';

-- AlterTable
ALTER TABLE "Genre" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "features" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "suspendedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "MediaUpload" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaUpload_storageKey_key" ON "MediaUpload"("storageKey");
