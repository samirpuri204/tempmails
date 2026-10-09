-- Additive only: existing rows and all mail data remain intact.
ALTER TABLE "BlogPost"
  ADD COLUMN "metaTitle" TEXT,
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Privacy',
  ADD COLUMN "author" TEXT NOT NULL DEFAULT 'TempMails',
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "sources" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "trending" BOOLEAN NOT NULL DEFAULT false;

-- Preserve historical publication provenance; do not pretend old posts are new.
UPDATE "BlogPost" SET "publishedAt" = "createdAt" WHERE "published" = true;
CREATE INDEX "BlogPost_published_publishedAt_idx" ON "BlogPost"("published", "publishedAt");
