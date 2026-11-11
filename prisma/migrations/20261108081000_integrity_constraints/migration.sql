ALTER TABLE "Content" ADD CONSTRAINT "content_bounds" CHECK ("duration" > 0 AND "releaseYear" BETWEEN 1888 AND 2100 AND "editorialRating" BETWEEN 0 AND 10);
ALTER TABLE "Content" ADD CONSTRAINT "content_window" CHECK ("availableUntil" IS NULL OR "availableFrom" IS NULL OR "availableUntil" > "availableFrom");
ALTER TABLE "Episode" ADD CONSTRAINT "episode_bounds" CHECK ("number" > 0 AND "duration" > 0);
ALTER TABLE "Season" ADD CONSTRAINT "season_number" CHECK ("number" > 0);
ALTER TABLE "WatchProgress" ADD CONSTRAINT "progress_bounds" CHECK ("duration" > 0 AND "position" >= 0 AND "position" <= "duration");
ALTER TABLE "UserRating" ADD CONSTRAINT "rating_bounds" CHECK ("value" BETWEEN 1 AND 10);
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "plan_bounds" CHECK ("price" >= 0 AND "durationDays" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "payment_amount" CHECK ("amount" >= 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "coupon_percent" CHECK ("percent" BETWEEN 1 AND 100);
ALTER TABLE "Subscription" ADD CONSTRAINT "subscription_window" CHECK ("expiresAt" IS NULL OR "startsAt" IS NULL OR "expiresAt" > "startsAt");
ALTER TABLE "Subscription" ADD CONSTRAINT "active_subscription_dates" CHECK ("status" <> 'ACTIVE' OR ("startsAt" IS NOT NULL AND "expiresAt" IS NOT NULL));
CREATE INDEX "UserRating_contentId_idx" ON "UserRating"("contentId");
-- Safe parameterized ILIKE queries remain valid without optional text-search extensions.
