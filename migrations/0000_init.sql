CREATE TABLE "editor_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar NOT NULL,
	"shop" varchar DEFAULT 'default-shop' NOT NULL,
	"last_heartbeat" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "editor_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "experiment_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop" varchar DEFAULT 'default-shop' NOT NULL,
	"experiment_id" varchar NOT NULL,
	"visitor_id" varchar NOT NULL,
	"variant" text NOT NULL,
	"event_type" text NOT NULL,
	"path" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"revenue" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop" varchar DEFAULT 'default-shop' NOT NULL,
	"date" timestamp NOT NULL,
	"conversion_rate" numeric(5, 2) NOT NULL,
	"avg_order_value" numeric(10, 2) NOT NULL,
	"revenue" numeric(10, 2) NOT NULL,
	"revenue_lift" numeric(10, 2) DEFAULT '0',
	"active_optimizations" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_conversions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"optimization_id" varchar NOT NULL,
	"session_id" varchar NOT NULL,
	"variant" text NOT NULL,
	"revenue" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_evolution_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"optimization_id" varchar NOT NULL,
	"impressions" integer NOT NULL,
	"control_impressions" integer NOT NULL,
	"variant_impressions" integer NOT NULL,
	"control_conversions" integer NOT NULL,
	"variant_conversions" integer NOT NULL,
	"control_revenue" numeric(10, 2) NOT NULL,
	"variant_revenue" numeric(10, 2) NOT NULL,
	"control_rpv" numeric(10, 2) NOT NULL,
	"variant_rpv" numeric(10, 2) NOT NULL,
	"control_allocation" numeric(5, 2) NOT NULL,
	"variant_allocation" numeric(5, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_impressions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"optimization_id" varchar NOT NULL,
	"session_id" varchar NOT NULL,
	"variant" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop" varchar DEFAULT 'default-shop' NOT NULL,
	"scope" text DEFAULT 'product' NOT NULL,
	"product_id" varchar,
	"recommendation_id" varchar,
	"optimization_type" text NOT NULL,
	"target_selector" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"control_data" jsonb NOT NULL,
	"variant_data" jsonb NOT NULL,
	"allocation_strategy" text DEFAULT 'bayesian' NOT NULL,
	"control_allocation" numeric(5, 2) DEFAULT '50',
	"variant_allocation" numeric(5, 2) DEFAULT '50',
	"confidence_threshold" numeric(3, 2) DEFAULT '0.95',
	"min_sample_size" integer DEFAULT 100,
	"bayesian_config" jsonb,
	"control_impressions" integer DEFAULT 0,
	"variant_impressions" integer DEFAULT 0,
	"control_conversions" integer DEFAULT 0,
	"variant_conversions" integer DEFAULT 0,
	"control_revenue" numeric(10, 2) DEFAULT '0',
	"variant_revenue" numeric(10, 2) DEFAULT '0',
	"arpu" numeric(10, 2) DEFAULT '0',
	"arpu_lift" numeric(5, 2) DEFAULT '0',
	"impressions" integer DEFAULT 0,
	"conversions" integer DEFAULT 0,
	"revenue" numeric(10, 2) DEFAULT '0',
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preview_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar NOT NULL,
	"shop" varchar DEFAULT 'default-shop' NOT NULL,
	"product_id" varchar,
	"recommendation_id" varchar,
	"preview_type" text DEFAULT 'product' NOT NULL,
	"storefront_url" text,
	"control_data" jsonb,
	"variant_data" jsonb,
	"changes" jsonb,
	"insights" jsonb,
	"experiment_config" jsonb,
	"expires_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"approved" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "preview_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop" varchar DEFAULT 'default-shop' NOT NULL,
	"shopify_product_id" text NOT NULL,
	"handle" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"compare_at_price" numeric(10, 2),
	"cost" numeric(10, 2),
	"margin" numeric(5, 2),
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rating" numeric(3, 2),
	"review_count" integer DEFAULT 0,
	"total_sold" integer DEFAULT 0,
	"revenue_30d" numeric(12, 2) DEFAULT '0',
	"last_sale_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_shop_shopify_product_id_unique" UNIQUE("shop","shopify_product_id")
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop" varchar DEFAULT 'default-shop' NOT NULL,
	"product_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"optimization_type" text NOT NULL,
	"proposed_changes" jsonb NOT NULL,
	"insights" jsonb NOT NULL,
	"impact_score" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop" varchar DEFAULT 'default-shop' NOT NULL,
	"session_id" varchar NOT NULL,
	"optimization_id" varchar NOT NULL,
	"variant" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"shop" varchar PRIMARY KEY NOT NULL,
	"plan_tier" varchar DEFAULT 'basic' NOT NULL,
	"recommendation_quota" integer DEFAULT 20 NOT NULL,
	"recommendations_used" integer DEFAULT 0 NOT NULL,
	"quota_reset_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slot_experiments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop" varchar DEFAULT 'default-shop' NOT NULL,
	"name" text NOT NULL,
	"slot_id" text DEFAULT 'pdp' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"allocation" numeric(3, 2) DEFAULT '0.50',
	"variant_a" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"variant_b" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"product_id" varchar,
	"views_a" integer DEFAULT 0,
	"views_b" integer DEFAULT 0,
	"conversions_a" integer DEFAULT 0,
	"conversions_b" integer DEFAULT 0,
	"revenue_a" numeric(10, 2) DEFAULT '0',
	"revenue_b" numeric(10, 2) DEFAULT '0',
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theme_positioning_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop" varchar NOT NULL,
	"theme_id" varchar NOT NULL,
	"theme_name" text,
	"rules" jsonb NOT NULL,
	"clone_product_id" text,
	"analyzed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "theme_positioning_rules_shop_unique" UNIQUE("shop")
);
--> statement-breakpoint
ALTER TABLE "optimization_conversions" ADD CONSTRAINT "optimization_conversions_optimization_id_optimizations_id_fk" FOREIGN KEY ("optimization_id") REFERENCES "public"."optimizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_evolution_snapshots" ADD CONSTRAINT "optimization_evolution_snapshots_optimization_id_optimizations_id_fk" FOREIGN KEY ("optimization_id") REFERENCES "public"."optimizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_impressions" ADD CONSTRAINT "optimization_impressions_optimization_id_optimizations_id_fk" FOREIGN KEY ("optimization_id") REFERENCES "public"."optimizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimizations" ADD CONSTRAINT "optimizations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimizations" ADD CONSTRAINT "optimizations_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preview_sessions" ADD CONSTRAINT "preview_sessions_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_assignments" ADD CONSTRAINT "session_assignments_optimization_id_optimizations_id_fk" FOREIGN KEY ("optimization_id") REFERENCES "public"."optimizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_experiments" ADD CONSTRAINT "slot_experiments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;