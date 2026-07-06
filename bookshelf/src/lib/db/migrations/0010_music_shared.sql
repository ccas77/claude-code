ALTER TABLE "music_clips" ADD COLUMN "shared" boolean DEFAULT false NOT NULL;
CREATE INDEX "music_shared_idx" ON "music_clips" ("shared") WHERE "shared" = true;
