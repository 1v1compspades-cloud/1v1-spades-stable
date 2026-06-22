import { logger as defaultLogger } from "./logger.js";
import type {
  RecoveryEmailSender,
  V11RecoveryPurpose,
} from "./v11-account-recovery.js";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_APP_URL = "https://1v1spades.com";

type RecoveryEmailLogger = Pick<typeof defaultLogger, "info" | "warn">;

type RecoveryEmailEnv = Pick<
  NodeJS.ProcessEnv,
  | "APP_ENV"
  | "NODE_ENV"
  | "RENDER_SERVICE_NAME"
  | "RESEND_API_KEY"
  | "RESEND_FROM_EMAIL"
  | "V11_ACCOUNT_RECOVERY_APP_URL"
  | "V11_ACCOUNT_RECOVERY_FROM_EMAIL"
  | "V11_ACCOUNT_RECOVERY_REPLY_TO"
>;
type RecoveryEmailRuntimeEnv = Partial<RecoveryEmailEnv> | NodeJS.ProcessEnv;

export type V11RecoveryEmailSenderOptions = {
  env?: RecoveryEmailRuntimeEnv;
  fetchImpl?: typeof fetch;
  logger?: RecoveryEmailLogger;
};

type ResendResponseBody = {
  id?: unknown;
};

function envValue(env: RecoveryEmailRuntimeEnv, key: keyof RecoveryEmailEnv): string | null {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function canLogRecoveryCode(env: RecoveryEmailRuntimeEnv): boolean {
  const nodeEnv = env.NODE_ENV;
  const appEnv = env.APP_ENV || env.RENDER_SERVICE_NAME || "";
  return nodeEnv !== "production" || /staging|dev|preview/i.test(appEnv);
}

function emailSubject(purpose: V11RecoveryPurpose): string {
  return purpose === "attach_email"
    ? "Verify your 1v1 Spades ranked profile email"
    : "Recover your 1v1 Spades ranked profile";
}

function purposeLine(purpose: V11RecoveryPurpose): string {
  return purpose === "attach_email"
    ? "Use this code to attach this email to your ranked profile."
    : "Use this code to recover your ranked profile on this device.";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function recoveryEmailText(message: Parameters<RecoveryEmailSender>[0]): string {
  return [
    "Your 1v1 Spades recovery code is:",
    "",
    message.code,
    "",
    purposeLine(message.purpose),
    "This code expires in 10 minutes and can be used once.",
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");
}

function recoveryEmailHtml(message: Parameters<RecoveryEmailSender>[0]): string {
  const code = escapeHtml(message.code);
  return [
    "<p>Your 1v1 Spades recovery code is:</p>",
    `<p style="font-size:28px;font-weight:700;letter-spacing:0.16em">${code}</p>`,
    `<p>${escapeHtml(purposeLine(message.purpose))}</p>`,
    "<p>This code expires in 10 minutes and can be used once.</p>",
    "<p>If you did not request this, you can ignore this email.</p>",
  ].join("");
}

async function readResendResponse(response: Response): Promise<ResendResponseBody> {
  try {
    return (await response.json()) as ResendResponseBody;
  } catch {
    return {};
  }
}

export function createV11RecoveryEmailSender(
  options: V11RecoveryEmailSenderOptions = {},
): RecoveryEmailSender {
  const env = options.env ?? process.env;
  const logger = options.logger ?? defaultLogger;
  const apiKey = envValue(env, "RESEND_API_KEY");

  if (!apiKey) {
    return (message) => {
      if (!canLogRecoveryCode(env)) {
        logger.warn(
          {
            purpose: message.purpose,
            accountAttached: Boolean(message.accountId),
          },
          "v1.1 account recovery email sender is not configured",
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
        "v1.1 account recovery code (staging/dev only)",
      );
    };
  }

  return async (message) => {
    const from =
      envValue(env, "V11_ACCOUNT_RECOVERY_FROM_EMAIL") ??
      envValue(env, "RESEND_FROM_EMAIL");
    if (!from) {
      throw new Error(
        "V11_ACCOUNT_RECOVERY_FROM_EMAIL or RESEND_FROM_EMAIL must be set when RESEND_API_KEY is set.",
      );
    }

    const fetchImpl = options.fetchImpl ?? fetch;
    const replyTo = envValue(env, "V11_ACCOUNT_RECOVERY_REPLY_TO");
    const appUrl = envValue(env, "V11_ACCOUNT_RECOVERY_APP_URL") ?? DEFAULT_APP_URL;
    const body = {
      from,
      to: message.email,
      subject: emailSubject(message.purpose),
      text: `${recoveryEmailText(message)}\n\n${appUrl}`,
      html: `${recoveryEmailHtml(message)}<p><a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a></p>`,
      ...(replyTo ? { reply_to: replyTo } : {}),
    };

    const response = await fetchImpl(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const responseBody = await readResendResponse(response);
    if (!response.ok) {
      throw new Error(`Resend recovery email failed with status ${response.status}.`);
    }

    logger.info(
      {
        purpose: message.purpose,
        accountAttached: Boolean(message.accountId),
        resendId: typeof responseBody.id === "string" ? responseBody.id : undefined,
      },
      "v1.1 account recovery email sent",
    );
  };
}
