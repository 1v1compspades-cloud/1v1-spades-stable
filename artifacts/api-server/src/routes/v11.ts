import { Router, type IRouter, type Response } from "express";
import { db } from "@workspace/db";
import { isV11FlagEnabled } from "../lib/v11-flags.js";
import { logger } from "../lib/logger.js";
import {
  claimV11Username,
  createV11Account,
  deleteV11Account,
  V11AccountError,
} from "../lib/v11-accounts.js";
import {
  confirmV12RecoveryEmailAttach,
  startV12AccountRecovery,
  verifyV12AccountRecovery,
  V12RecoveryError,
  type RecoveryEmailSender,
} from "../lib/v12-account-recovery.js";
import {
  DEFAULT_V11_LEADERBOARD_SEASON,
  listV11Leaderboard,
  sanitizeLeaderboardSeason,
} from "../lib/v11-leaderboards.js";

const router: IRouter = Router();

function disabledPayload(feature: string) {
  return {
    enabled: false,
    feature,
    status: "disabled",
    message: "v1.1 account features are not enabled.",
  };
}

function accountFeatureEnabled(res: Response, feature: string) {
  if (isV11FlagEnabled("V11_ACCOUNTS_ENABLED")) return true;
  res.status(503).json(disabledPayload(feature));
  return false;
}

function leaderboardDisabledPayload() {
  return {
    enabled: false,
    feature: "leaderboards",
    status: "disabled",
    message: "v1.1 leaderboards are not enabled.",
  };
}

function leaderboardFeatureEnabled(res: Response) {
  if (isV11FlagEnabled("V11_LEADERBOARDS_ENABLED")) return true;
  res.status(503).json(leaderboardDisabledPayload());
  return false;
}

function recoveryDisabledPayload() {
  return {
    enabled: false,
    feature: "account_recovery",
    status: "disabled",
    message: "v1.2 account recovery is not enabled.",
  };
}

function recoveryFeatureEnabled(res: Response) {
  if (
    isV11FlagEnabled("V11_ACCOUNTS_ENABLED") &&
    isV11FlagEnabled("V12_ACCOUNT_RECOVERY_ENABLED")
  ) return true;
  res.status(503).json(recoveryDisabledPayload());
  return false;
}

function statusForAccountError(error: V11AccountError): number {
  switch (error.code) {
    case "invalid_display_name":
    case "invalid_email_hash":
    case "invalid_username":
      return 400;
    case "account_not_found":
    case "account_deleted":
      return 404;
    case "account_exists":
    case "username_taken":
    case "account_already_has_username":
      return 409;
  }
}

function serializeAccountError(error: unknown) {
  const candidate = error as {
    cause?: unknown;
  };
  const cause =
    candidate?.cause && typeof candidate.cause === "object"
      ? (candidate.cause as {
          message?: unknown;
          code?: unknown;
          table?: unknown;
          column?: unknown;
          constraint?: unknown;
          detail?: unknown;
        })
      : {};

  return {
    causeMessage: typeof cause.message === "string" ? cause.message : undefined,
    causeCode: typeof cause.code === "string" ? cause.code : undefined,
    causeConstraint:
      typeof cause.constraint === "string" ? cause.constraint : undefined,
    causeColumn: typeof cause.column === "string" ? cause.column : undefined,
    causeTable: typeof cause.table === "string" ? cause.table : undefined,
    causeDetail: typeof cause.detail === "string" ? cause.detail : undefined,
  };
}

function handleAccountError(res: Response, error: unknown) {
  if (error instanceof V11AccountError) {
    res.status(statusForAccountError(error)).json({
      ok: false,
      code: error.code,
      message: error.message,
    });
    return;
  }

  logger.error(
    {
      err: serializeAccountError(error),
      feature: "v1.1_accounts",
      code: "account_error",
    },
    "v1.1 account request failed",
  );

  res.status(500).json({
    ok: false,
    code: "account_error",
    message: "Account request failed.",
  });
}

function statusForRecoveryError(error: V12RecoveryError): number {
  switch (error.code) {
    case "invalid_email":
    case "invalid_code":
    case "code_expired":
    case "code_consumed":
    case "too_many_attempts":
      return 400;
    case "account_not_found":
    case "account_deleted":
    case "recovery_not_found":
      return 404;
    case "account_exists":
      return 409;
  }
}

function handleRecoveryError(res: Response, error: unknown) {
  if (error instanceof V12RecoveryError) {
    res.status(statusForRecoveryError(error)).json({
      ok: false,
      code: error.code,
      message: error.message,
    });
    return;
  }

  logger.error(
    {
      err: serializeAccountError(error),
      feature: "v1.2_account_recovery",
      code: "account_recovery_error",
    },
    "v1.2 account recovery request failed",
  );

  res.status(500).json({
    ok: false,
    code: "account_recovery_error",
    message: "Account recovery request failed.",
  });
}

function recoverySecret(): string {
  const secret = process.env.V12_ACCOUNT_RECOVERY_SECRET || process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("V12_ACCOUNT_RECOVERY_SECRET or SESSION_SECRET must be set.");
  }
  return "local-dev-only-account-recovery-secret";
}

function canLogRecoveryCode(): boolean {
  const env = process.env.NODE_ENV;
  const appEnv = process.env.APP_ENV || process.env.RENDER_SERVICE_NAME || "";
  return env !== "production" || /staging|dev|preview/i.test(appEnv);
}

const logOnlyRecoverySender: RecoveryEmailSender = (message) => {
  if (!canLogRecoveryCode()) {
    logger.warn(
      {
        purpose: message.purpose,
        accountAttached: Boolean(message.accountId),
      },
      "v1.2 account recovery email sender is not configured",
    );
    return;
  }

  logger.info(
    {
      purpose: message.purpose,
      code: message.code,
      accountAttached: Boolean(message.accountId),
      expiresAt: message.expiresAt.toISOString(),
    },
    "v1.2 account recovery code (staging/dev only)",
  );
};

router.get("/accounts/status", (_req, res) => {
  if (!accountFeatureEnabled(res, "accounts")) return;

  res.status(200).json({
    enabled: true,
    feature: "accounts",
    status: "enabled",
  });
});

router.post("/accounts/create", async (req, res) => {
  if (!accountFeatureEnabled(res, "accounts")) return;

  try {
    const account = await createV11Account(db, {
      displayName: req.body?.displayName,
      emailHash: req.body?.emailHash,
    });
    res.status(201).json({ ok: true, account });
  } catch (error) {
    handleAccountError(res, error);
  }
});

router.post("/accounts/claim-username", async (req, res) => {
  if (!accountFeatureEnabled(res, "accounts")) return;

  try {
    const username = await claimV11Username(db, {
      accountId: req.body?.accountId,
      username: req.body?.username,
    });
    res.status(201).json({ ok: true, username });
  } catch (error) {
    handleAccountError(res, error);
  }
});

router.post("/accounts/delete", async (req, res) => {
  if (!accountFeatureEnabled(res, "account_deletion")) return;

  try {
    const result = await deleteV11Account(db, { accountId: req.body?.accountId });
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    handleAccountError(res, error);
  }
});

router.post("/accounts/recovery/start", async (req, res) => {
  if (!recoveryFeatureEnabled(res)) return;

  try {
    const result = await startV12AccountRecovery(
      db,
      {
        email: req.body?.email,
        purpose: "recover_profile",
      },
      {
        secret: recoverySecret(),
        sender: logOnlyRecoverySender,
      },
    );
    res.status(200).json({ ok: true, expiresAt: result.expiresAt });
  } catch (error) {
    handleRecoveryError(res, error);
  }
});

router.post("/accounts/recovery/verify", async (req, res) => {
  if (!recoveryFeatureEnabled(res)) return;

  try {
    const profile = await verifyV12AccountRecovery(
      db,
      {
        email: req.body?.email,
        code: req.body?.code,
      },
      { secret: recoverySecret() },
    );
    res.status(200).json({ ok: true, profile });
  } catch (error) {
    handleRecoveryError(res, error);
  }
});

router.post("/accounts/recovery/attach-email", async (req, res) => {
  if (!recoveryFeatureEnabled(res)) return;

  try {
    const result = await startV12AccountRecovery(
      db,
      {
        email: req.body?.email,
        accountId: req.body?.accountId,
        purpose: "attach_email",
      },
      {
        secret: recoverySecret(),
        sender: logOnlyRecoverySender,
      },
    );
    res.status(200).json({ ok: true, expiresAt: result.expiresAt });
  } catch (error) {
    handleRecoveryError(res, error);
  }
});

router.post("/accounts/recovery/confirm-attach", async (req, res) => {
  if (!recoveryFeatureEnabled(res)) return;

  try {
    const profile = await confirmV12RecoveryEmailAttach(
      db,
      {
        accountId: req.body?.accountId,
        email: req.body?.email,
        code: req.body?.code,
      },
      { secret: recoverySecret() },
    );
    res.status(200).json({ ok: true, profile });
  } catch (error) {
    handleRecoveryError(res, error);
  }
});

router.get("/leaderboards/status", (_req, res) => {
  if (!leaderboardFeatureEnabled(res)) return;

  res.status(200).json({
    enabled: true,
    feature: "leaderboards",
    status: "enabled",
    seasonKey: DEFAULT_V11_LEADERBOARD_SEASON,
  });
});

router.get("/leaderboards", async (req, res) => {
  if (!leaderboardFeatureEnabled(res)) return;

  try {
    const seasonKey = sanitizeLeaderboardSeason(req.query.season);
    const entries = await listV11Leaderboard(db, {
      limit: req.query.limit,
      seasonKey,
    });
    res.status(200).json({
      ok: true,
      seasonKey,
      entries,
    });
  } catch (error) {
    logger.error(
      {
        err: serializeAccountError(error),
        feature: "v1.1_leaderboards",
        code: "leaderboard_error",
      },
      "v1.1 leaderboard request failed",
    );
    res.status(500).json({
      ok: false,
      code: "leaderboard_error",
      message: "Leaderboard request failed.",
    });
  }
});

export default router;
