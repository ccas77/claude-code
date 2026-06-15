CREATE TABLE "music_clip_books" (
	"music_clip_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	CONSTRAINT "music_clip_books_music_clip_id_book_id_pk" PRIMARY KEY("music_clip_id","book_id")
);
--> statement-breakpoint
ALTER TABLE "music_clip_books" ADD CONSTRAINT "music_clip_books_music_clip_id_music_clips_id_fk" FOREIGN KEY ("music_clip_id") REFERENCES "public"."music_clips"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "music_clip_books" ADD CONSTRAINT "music_clip_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
