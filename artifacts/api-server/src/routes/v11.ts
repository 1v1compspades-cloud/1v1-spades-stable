import { Router, type IRouter, type Response } from "express";
import { db } from "@workspace/db";
import { isV11FlagEnabled } from "../lib/v11-flags.js";
import {
  claimV11Username,
  createV11Account,
  deleteV11Account,
  V11AccountError,
} from "../lib/v11-accounts.js";

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

function handleAccountError(res: Response, error: unknown) {
  if (error instanceof V11AccountError) {
    res.status(statusForAccountError(error)).json({
      ok: false,
      code: error.code,
      message: error.message,
    });
    return;
  }

  res.status(500).json({
    ok: false,
    code: "account_error",
    message: "Account request failed.",
  });
}

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

export default router;
