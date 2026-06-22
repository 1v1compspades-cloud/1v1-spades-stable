import pg from "pg";

const { Pool } = pg;

const REQUIRED_SCHEMA = {
  v11_accounts: {
    columns: [
      "id",
      "email_hash",
      "email_verified_at",
      "recovery_email_attached_at",
      "display_name",
      "status",
      "deletion_requested_at",
      "deleted_at",
      "metadata",
      "created_at",
      "updated_at",
    ],
    indexes: [
      "v11_accounts_pkey",
      "v11_accounts_email_hash_unique",
      "v11_accounts_status_idx",
      "v11_accounts_deletion_requested_idx",
    ],
  },
  v11_usernames: {
    columns: [
      "normalized_username",
      "account_id",
      "display_username",
      "status",
      "claimed_at",
      "released_at",
    ],
    indexes: [
      "v11_usernames_pkey",
      "v11_usernames_account_unique",
      "v11_usernames_status_idx",
    ],
  },
  v11_account_recovery_codes: {
    columns: [
      "id",
      "email_hash",
      "account_id",
      "code_hash",
      "purpose",
      "expires_at",
      "consumed_at",
      "attempt_count",
      "created_at",
    ],
    indexes: [
      "v11_account_recovery_codes_pkey",
      "v11_recovery_codes_email_idx",
      "v11_recovery_codes_expires_idx",
      "v11_recovery_codes_purpose_idx",
    ],
  },
  v11_leaderboard_results: {
    columns: [
      "id",
      "season_key",
      "room_code",
      "winner_account_id",
      "loser_account_id",
      "winner_username",
      "loser_username",
      "winner_score",
      "loser_score",
      "winner_bags",
      "loser_bags",
      "rounds_played",
      "result_reason",
      "completed_at",
      "created_at",
    ],
    indexes: [
      "v11_leaderboard_results_pkey",
      "v11_leaderboard_results_room_unique",
      "v11_leaderboard_results_season_idx",
      "v11_leaderboard_results_winner_idx",
      "v11_leaderboard_results_loser_idx",
    ],
  },
  v11_leaderboard_stats: {
    columns: [
      "id",
      "season_key",
      "account_id",
      "normalized_username",
      "display_username",
      "wins",
      "losses",
      "games_played",
      "points_for",
      "points_against",
      "bags_taken",
      "bags_given",
      "current_streak",
      "updated_at",
    ],
    indexes: [
      "v11_leaderboard_stats_pkey",
      "v11_leaderboard_stats_account_season_unique",
      "v11_leaderboard_stats_season_wins_idx",
      "v11_leaderboard_stats_username_idx",
    ],
  },
};

function stagingDatabaseUrl() {
  const url = process.env.STAGING_DATABASE_URL;
  if (!url) {
    throw new Error("STAGING_DATABASE_URL is required for staging schema verification.");
  }
  return url;
}

function safeTarget(connectionString) {
  const parsed = new URL(connectionString);
  return `${parsed.hostname}${parsed.pathname}`;
}

async function readExistingColumns(pool) {
  const result = await pool.query(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
    `,
    [Object.keys(REQUIRED_SCHEMA)],
  );

  const byTable = new Map();
  for (const row of result.rows) {
    const columns = byTable.get(row.table_name) ?? new Set();
    columns.add(row.column_name);
    byTable.set(row.table_name, columns);
  }
  return byTable;
}

async function readExistingIndexes(pool) {
  const result = await pool.query(
    `
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = any($1::text[])
    `,
    [Object.keys(REQUIRED_SCHEMA)],
  );
  return new Set(result.rows.map((row) => row.indexname));
}

function missingSchemaItems(columnsByTable, indexes) {
  const missing = [];
  for (const [tableName, spec] of Object.entries(REQUIRED_SCHEMA)) {
    const existingColumns = columnsByTable.get(tableName);
    if (!existingColumns) {
      missing.push(`table ${tableName}`);
      continue;
    }
    for (const columnName of spec.columns) {
      if (!existingColumns.has(columnName)) {
        missing.push(`column ${tableName}.${columnName}`);
      }
    }
    for (const indexName of spec.indexes) {
      if (!indexes.has(indexName)) {
        missing.push(`index ${indexName}`);
      }
    }
  }
  return missing;
}

async function main() {
  const connectionString = stagingDatabaseUrl();
  const pool = new Pool({ connectionString });
  try {
    const [columnsByTable, indexes] = await Promise.all([
      readExistingColumns(pool),
      readExistingIndexes(pool),
    ]);
    const missing = missingSchemaItems(columnsByTable, indexes);
    if (missing.length > 0) {
      console.error("v1.1 staging schema verification failed.");
      console.error(`Target: ${safeTarget(connectionString)}`);
      for (const item of missing) console.error(`Missing ${item}`);
      process.exitCode = 1;
      return;
    }
    console.log("v1.1 staging schema verification passed.");
    console.log(`Target: ${safeTarget(connectionString)}`);
    console.log(`Tables checked: ${Object.keys(REQUIRED_SCHEMA).join(", ")}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("v1.1 staging schema verification failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
