import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * v1.1 account scaffold only.
 *
 * These tables are intentionally inert until the v1.1 data model is reviewed,
 * migrations are approved, and `V11_ACCOUNTS_ENABLED` is explicitly enabled.
 * Guest play remains the default experience.
 */
export const v11AccountsTable = pgTable(
  "v11_accounts",
  {
    id: text("id").primaryKey(),
    emailHash: text("email_hash"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    recoveryEmailAttachedAt: timestamp("recovery_email_attached_at", {
      withTimezone: true,
    }),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("active"),
    deletionRequestedAt: timestamp("deletion_requested_at", {
      withTimezone: true,
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("v11_accounts_email_hash_unique").on(t.emailHash),
    index("v11_accounts_status_idx").on(t.status),
    index("v11_accounts_deletion_requested_idx").on(t.deletionRequestedAt),
  ],
);

export const v12AccountRecoveryCodesTable = pgTable(
  "v12_account_recovery_codes",
  {
    id: text("id").primaryKey(),
    emailHash: text("email_hash").notNull(),
    accountId: text("account_id"),
    codeHash: text("code_hash").notNull(),
    purpose: text("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("v12_recovery_codes_email_idx").on(t.emailHash),
    index("v12_recovery_codes_expires_idx").on(t.expiresAt),
    index("v12_recovery_codes_purpose_idx").on(t.purpose),
  ],
);

/**
 * Claimed usernames are separate from historical guest display names in
 * `match_results`. A pre-account match name is not claimable identity until a
 * later reviewed policy says otherwise.
 */
export const v11UsernamesTable = pgTable(
  "v11_usernames",
  {
    normalizedUsername: text("normalized_username").primaryKey(),
    accountId: text("account_id").notNull(),
    displayUsername: text("display_username").notNull(),
    status: text("status").notNull().default("active"),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("v11_usernames_account_unique").on(t.accountId),
    index("v11_usernames_status_idx").on(t.status),
  ],
);

export type V11AccountRow = typeof v11AccountsTable.$inferSelect;
export type InsertV11Account = typeof v11AccountsTable.$inferInsert;
export type V11UsernameRow = typeof v11UsernamesTable.$inferSelect;
export type InsertV11Username = typeof v11UsernamesTable.$inferInsert;
export type V12AccountRecoveryCodeRow =
  typeof v12AccountRecoveryCodesTable.$inferSelect;
export type InsertV12AccountRecoveryCode =
  typeof v12AccountRecoveryCodesTable.$inferInsert;
