import { pgTable, uuid, text, timestamp, jsonb, integer, pgEnum } from "drizzle-orm/pg-core";

export const planStatusEnum = pgEnum("plan_status", ["draft", "clarifying", "generated", "finalized"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  status: planStatusEnum("status").default("draft"),
  currentVersionId: uuid("current_version_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const planVersions = pgTable("plan_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  planId: uuid("plan_id").references(() => plans.id).notNull(),
  versionNumber: integer("version_number").notNull(),
  contentJson: jsonb("content_json").notNull(), // structured PRD (see section 6)
  contentMarkdown: text("content_markdown").notNull(), // rendered version
  changeSummary: text("change_summary"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const clarificationSessions = pgTable("clarification_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  planId: uuid("plan_id").references(() => plans.id).notNull(),
  initialIdea: text("initial_idea").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const clarificationAnswers = pgTable("clarification_answers", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").references(() => clarificationSessions.id).notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  order: integer("order").notNull(),
});

export const usageRecords = pgTable("usage_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  planId: uuid("plan_id").references(() => plans.id),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsd: text("cost_usd"), // stored as string to avoid float precision issues
  createdAt: timestamp("created_at").defaultNow(),
});
