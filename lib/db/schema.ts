import { pgTable, uuid, text, timestamp, jsonb, integer, pgEnum } from "drizzle-orm/pg-core";

export const planStatusEnum = pgEnum("plan_status", ["draft", "clarifying", "generated", "finalized"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);
export const taskStatusEnum = pgEnum("task_status", ["todo", "doing", "blocked", "done", "failed"]);
export const taskLayerEnum = pgEnum("task_layer", ["frontend", "backend", "database", "integration", "testing"]);
export const featurePriorityEnum = pgEnum("feature_priority", ["must-have", "nice-to-have"]);
export const syncModeEnum = pgEnum("sync_mode", ["basic", "full"]);

export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type TaskLayer = (typeof taskLayerEnum.enumValues)[number];
export type FeaturePriority = (typeof featurePriorityEnum.enumValues)[number];
export type SyncMode = (typeof syncModeEnum.enumValues)[number];
export type PlanStatus = (typeof planStatusEnum.enumValues)[number];
export type MessageRole = (typeof messageRoleEnum.enumValues)[number];

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
  selectedProvider: text("selected_provider").default("openrouter"),
  selectedModel: text("selected_model"),
  currentVersionId: uuid("current_version_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  planId: uuid("plan_id").references(() => plans.id).notNull(),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  options: jsonb("options").$type<Array<{ id: string; label: string }>>(), // array of {id, label} — diisi jika role="assistant" dan berupa pertanyaan multiple-choice
  selectedOptionId: text("selected_option_id"), // diisi jika role="user" menjawab pertanyaan multiple-choice
  order: integer("order").notNull(),
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

export const features = pgTable("features", {
  id: uuid("id").defaultRandom().primaryKey(),
  planVersionId: uuid("plan_version_id").references(() => planVersions.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  priority: featurePriorityEnum("priority").default("must-have"),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  featureId: uuid("feature_id").references(() => features.id).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  layer: taskLayerEnum("layer").notNull(),
  phase: integer("phase").notNull(),          // urutan fase eksekusi (1, 2, 3...)
  order: integer("order").notNull(),          // urutan dalam fase yang sama
  status: taskStatusEnum("status").default("todo"),
  targetFile: text("target_file"),            // saran path file yang akan disentuh
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const taskDependencies = pgTable("task_dependencies", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").references(() => tasks.id).notNull(),
  dependsOnTaskId: uuid("depends_on_task_id").references(() => tasks.id).notNull(),
});

export const codebases = pgTable("codebases", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id).notNull(),
  rootPath: text("root_path").notNull(),
  framework: text("framework"),
  syncMode: syncModeEnum("sync_mode").default("basic"),
  lastSyncedAt: timestamp("last_synced_at"),
});

export const codebaseFiles = pgTable("codebase_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  codebaseId: uuid("codebase_id").references(() => codebases.id).notNull(),
  filePath: text("file_path").notNull(),
  summary: text("summary"),
  codeSnippet: text("code_snippet"),
  language: text("language"),
});

export const personalAccessTokens = pgTable("personal_access_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  tokenHash: text("token_hash").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

