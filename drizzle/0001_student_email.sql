CREATE TABLE "student_code" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "student_email" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "student_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_code" ADD CONSTRAINT "student_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_student_email_unique" UNIQUE("student_email");