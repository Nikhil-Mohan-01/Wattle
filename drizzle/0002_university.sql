ALTER TABLE "user" ADD COLUMN "university" text;--> statement-breakpoint
CREATE INDEX "user_university_idx" ON "user" USING btree ("university","faculty");--> statement-breakpoint
-- Existing players were all Waterloo students.
UPDATE "user" SET "university" = 'uwaterloo' WHERE "university" IS NULL AND "student_email" LIKE '%@uwaterloo.ca';
