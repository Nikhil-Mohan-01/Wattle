CREATE TABLE `play_tombstone` (
	`email_hash` text NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `play_tombstone_idx` ON `play_tombstone` (`email_hash`,`date`);