import { Router, type IRouter } from "express";
import { isV11FlagEnabled } from "../lib/v11-flags.js";
import { getV11AccountPrivacyBlockers } from "../lib/v11-account-privacy.js";

const router: IRouter = Router();

function disabledPayload(feature: string) {
  return {
    enabled: false,
    feature,
    status: "disabled",
    message: "v1.1 account features are not enabled.",
  };
}

router.get("/accounts/status", (_req, res) => {
  if (!isV11FlagEnabled("V11_ACCOUNTS_ENABLED")) {
    res.status(503).json(disabledPayload("accounts"));
    return;
  }

  res.status(501).json({
    enabled: true,
    feature: "accounts",
    status: "not_implemented",
    blockers: getV11AccountPrivacyBlockers().map((item) => item.id),
  });
});

router.post("/accounts/delete", (_req, res) => {
  if (!isV11FlagEnabled("V11_ACCOUNTS_ENABLED")) {
    res.status(503).json(disabledPayload("account_deletion"));
    return;
  }

  res.status(501).json({
    enabled: true,
    feature: "account_deletion",
    status: "not_implemented",
    blockers: getV11AccountPrivacyBlockers().map((item) => item.id),
  });
});

export default router;
