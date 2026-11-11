-- AlterTable
ALTER TABLE "ContentAsset" ADD COLUMN     "videoJobId" TEXT;

-- AlterTable
ALTER TABLE "MediaUpload" ADD COLUMN     "multipartId" TEXT,
ADD COLUMN     "partSize" INTEGER,
ALTER COLUMN "bytes" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "WatchHistory" ADD COLUMN     "episodeId" TEXT;

-- AlterTable
ALTER TABLE "WatchProgress" ADD COLUMN     "episodeId" TEXT;

-- CreateTable
CREATE TABLE "UploadPart" (
    "mediaId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "etag" TEXT NOT NULL,

    CONSTRAINT "UploadPart_pkey" PRIMARY KEY ("mediaId","number")
);

-- CreateTable
CREATE TABLE "VideoJob" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "episodeId" TEXT,
    "sourceMediaId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "duration" DOUBLE PRECISION,
    "resolutions" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "outputPrefix" TEXT,
    "errorCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VideoJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybackSession" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "userId" TEXT,
    "authSessionId" TEXT,
    "viewerHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybackSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoJob_status_leaseExpiresAt_createdAt_idx" ON "VideoJob"("status", "leaseExpiresAt", "createdAt");

-- CreateIndex
CREATE INDEX "PlaybackSession_expiresAt_idx" ON "PlaybackSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentAsset_videoJobId_key" ON "ContentAsset"("videoJobId");

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_videoJobId_fkey" FOREIGN KEY ("videoJobId") REFERENCES "VideoJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchProgress" ADD CONSTRAINT "WatchProgress_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchHistory" ADD CONSTRAINT "WatchHistory_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadPart" ADD CONSTRAINT "UploadPart_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoJob" ADD CONSTRAINT "VideoJob_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoJob" ADD CONSTRAINT "VideoJob_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoJob" ADD CONSTRAINT "VideoJob_sourceMediaId_fkey" FOREIGN KEY ("sourceMediaId") REFERENCES "MediaUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "ContentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_authSessionId_fkey" FOREIGN KEY ("authSessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "MediaUpload" ADD CONSTRAINT "media_positive_bytes" CHECK (bytes > 0);
ALTER TABLE "UploadPart" ADD CONSTRAINT "upload_part_bounds" CHECK (number > 0 AND bytes > 0);
ALTER TABLE "VideoJob" ADD CONSTRAINT "video_job_bounds" CHECK (progress BETWEEN 0 AND 100 AND attempts >= 0 AND (duration IS NULL OR duration > 0));
ALTER TABLE "VideoJob" ADD CONSTRAINT "ready_video_job" CHECK (status <> 'READY' OR (duration > 0 AND "outputPrefix" IS NOT NULL AND cardinality(resolutions)>0));
UPDATE "WatchProgress" p SET "episodeId"=e.id FROM "Episode" e JOIN "Season" s ON s.id=e."seasonId" WHERE p."contentId"=s."contentId" AND p."episodeKey"='s'||s.number::text||'e'||e.number::text;
UPDATE "WatchHistory" p SET "episodeId"=e.id FROM "Episode" e JOIN "Season" s ON s.id=e."seasonId" WHERE p."contentId"=s."contentId" AND p."episodeKey"='s'||s.number::text||'e'||e.number::text;
