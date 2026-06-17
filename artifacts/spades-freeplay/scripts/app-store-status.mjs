#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const EXPECTED = {
  name: "Spades Free Play",
  version: "1.0.0",
  buildNumber: "23",
  bundleIdentifier: "com.oneononespades.freeplay",
  easProjectId: "9b64353d-700c-4be9-ac70-3101400335b8",
  easBuildId: "3823f18e-c164-4298-b8f9-ac25252e55a5",
  easSubmissionId: "6bab3402-f947-4238-95a5-452c154e9f1f",
  ascAppId: "6776721716",
};

const URLS = [
  "https://1v1spades.com/",
  "https://1v1spades.com/privacy",
  "https://1v1spades.com/terms",
  "https://1v1spades.com/support",
];

const CHECKBOXES = {
  appleProcessing: "Apple processing complete for build 23",
  internalTesting: "Build 23 added to internal TestFlight testing",
  smokeTest: "TestFlight smoke test checklist complete",
  hostedLayout: "Hosted web mobile layout fix deployed to 1v1spades.com",
  screenshots: "App Store screenshots uploaded",
  privacy: "App Privacy questionnaire complete",
  metadata: "App Store metadata complete",
  reviewNotes: "App Review notes added",
  ready: "Ready to submit for App Review",
  submittedReview: "Submitted for App Review",
  reviewApproved: "App Review approved",
  released: "App manually released",
  postRelease: "Post-release verification complete",
};

const root = fileURLToPath(new URL("..", import.meta.url));
const appJsonPath = resolve(root, "app.json");
const taskPath = resolve(root, "APP_STORE_CURRENT_TASK.md");

const results = [];

function pass(label, detail = "") {
  results.push({ status: "PASS", label, detail });
}

function fail(label, detail = "") {
  results.push({ status: "FAIL", label, detail });
}

function warn(label, detail = "") {
  results.push({ status: "WARN", label, detail });
}

function printHeader(title) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

function printResult(item) {
  const marker = item.status === "PASS" ? "PASS" : item.status === "WARN" ? "WARN" : "FAIL";
  const detail = item.detail ? ` - ${item.detail}` : "";
  console.log(`[${marker}] ${item.label}${detail}`);
}

function getChecked(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^- \\[(x|X| )\\] ${escaped}\\s*$`, "m");
  const match = markdown.match(pattern);
  if (!match) return null;
  return match[1].toLowerCase() === "x";
}

async function checkAppConfig() {
  const appJson = JSON.parse(await readFile(appJsonPath, "utf8"));
  const expo = appJson.expo ?? {};
  const ios = expo.ios ?? {};
  const projectId = expo.extra?.eas?.projectId;
  const plugins = JSON.stringify(expo.plugins ?? []);

  expo.name === EXPECTED.name ? pass("App name", expo.name) : fail("App name", `${expo.name} != ${EXPECTED.name}`);
  expo.version === EXPECTED.version ? pass("Marketing version", expo.version) : fail("Marketing version", `${expo.version} != ${EXPECTED.version}`);
  ios.buildNumber === EXPECTED.buildNumber ? pass("iOS build number", ios.buildNumber) : fail("iOS build number", `${ios.buildNumber} != ${EXPECTED.buildNumber}`);
  ios.bundleIdentifier === EXPECTED.bundleIdentifier ? pass("Bundle identifier", ios.bundleIdentifier) : fail("Bundle identifier", `${ios.bundleIdentifier} != ${EXPECTED.bundleIdentifier}`);
  projectId === EXPECTED.easProjectId ? pass("EAS project id", projectId) : fail("EAS project id", `${projectId} != ${EXPECTED.easProjectId}`);
  ios.config?.usesNonExemptEncryption === false ? pass("Export compliance flag", "usesNonExemptEncryption=false") : fail("Export compliance flag", "Expected usesNonExemptEncryption=false");
  plugins.includes("expo-router") ? pass("Expo router configured") : fail("Expo router configured");
  plugins.includes("expo-notifications") ? pass("Notifications plugin configured") : warn("Notifications plugin configured", "Not found in plugins");
}

async function checkUrls() {
  await Promise.all(URLS.map(async (url) => {
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "manual" });
      if (response.status >= 200 && response.status < 400) {
        pass("Live URL reachable", `${url} -> ${response.status}`);
      } else {
        fail("Live URL reachable", `${url} -> ${response.status}`);
      }
    } catch (error) {
      fail("Live URL reachable", `${url} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }));
}

async function runEas(args, label) {
  const command = process.env.npm_execpath ? process.execPath : "corepack";
  const commandArgs = process.env.npm_execpath
    ? [process.env.npm_execpath, "exec", "eas", ...args]
    : ["pnpm", "exec", "eas", ...args];

  try {
    const { stdout } = await execFileAsync(command, commandArgs, {
      cwd: root,
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 8,
      env: { ...process.env, CI: "1" },
    });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warn(label, `Skipped or unavailable: ${message}`);
    return null;
  }
}

function extractJsonArray(output) {
  if (!output) return null;
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function checkEas() {
  const buildOutput = await runEas(
    ["build:list", "--platform", "ios", "--limit", "1", "--json", "--non-interactive"],
    "EAS latest build lookup",
  );
  const builds = extractJsonArray(buildOutput);
  if (Array.isArray(builds) && builds[0]) {
    const build = builds[0];
    if (EXPECTED.easBuildId === "pending") {
      warn("Latest EAS build id", `Build ${EXPECTED.buildNumber} not built yet`);
    } else {
      build.id === EXPECTED.easBuildId ? pass("Latest EAS build id", build.id) : warn("Latest EAS build id", `${build.id} != tracked ${EXPECTED.easBuildId}`);
    }
    build.status === "FINISHED" ? pass("Latest EAS build status", build.status) : fail("Latest EAS build status", build.status ?? "unknown");
    build.appBuildVersion === EXPECTED.buildNumber ? pass("Latest EAS build number", build.appBuildVersion) : warn("Latest EAS build number", `${build.appBuildVersion} != ${EXPECTED.buildNumber}`);
  }

  await checkTrackedSubmission();
}

async function checkTrackedSubmission() {
  if (EXPECTED.easSubmissionId === "pending") {
    warn("Tracked EAS submission lookup", `Build ${EXPECTED.buildNumber} has not been submitted yet`);
    return;
  }

  let session = null;
  try {
    const state = JSON.parse(await readFile(resolve(homedir(), ".expo/state.json"), "utf8"));
    session = state.auth?.sessionSecret ?? null;
  } catch {
    warn("Tracked EAS submission lookup", "Skipped: no local Expo session found");
    return;
  }

  if (!session) {
    warn("Tracked EAS submission lookup", "Skipped: no Expo session secret found");
    return;
  }

  const query = `
    query SubmissionsByIdQuery($submissionId: ID!) {
      submissions {
        byId(submissionId: $submissionId) {
          id
          status
          platform
          iosConfig { ascAppIdentifier appleIdUsername }
          error { errorCode message }
        }
      }
    }
  `;

  try {
    const response = await fetch("https://api.expo.dev/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "expo-session": session,
      },
      body: JSON.stringify({ query, variables: { submissionId: EXPECTED.easSubmissionId } }),
    });
    const payload = await response.json();
    const submission = payload?.data?.submissions?.byId;
    if (!submission) {
      warn("Tracked EAS submission lookup", "No submission returned");
      return;
    }

    submission.id === EXPECTED.easSubmissionId
      ? pass("Tracked EAS submission id", submission.id)
      : warn("Tracked EAS submission id", `${submission.id} != ${EXPECTED.easSubmissionId}`);

    if (submission.error) {
      fail("Tracked EAS submission status", `${submission.status}: ${submission.error.errorCode ?? ""} ${submission.error.message ?? ""}`.trim());
    } else if (["FINISHED", "SUBMITTED"].includes(submission.status)) {
      pass("Tracked EAS submission status", submission.status);
    } else {
      warn("Tracked EAS submission status", submission.status ?? "unknown");
    }
  } catch (error) {
    warn("Tracked EAS submission lookup", `Skipped or unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkManualTasks() {
  const markdown = await readFile(taskPath, "utf8");
  const state = {};
  for (const [key, label] of Object.entries(CHECKBOXES)) {
    const checked = getChecked(markdown, label);
    state[key] = checked === true;
    if (checked === null) {
      warn("Manual task tracking", `Missing checkbox: ${label}`);
    } else if (checked) {
      pass("Manual task complete", label);
    } else {
      warn("Manual task incomplete", label);
    }
  }
  return state;
}

function chooseNextAction(manualState) {
  if (EXPECTED.easBuildId === "pending" || EXPECTED.easSubmissionId === "pending") return `Build and submit iOS build ${EXPECTED.buildNumber}.`;
  if (!manualState.appleProcessing) return "Wait for Apple processing.";
  if (!manualState.internalTesting) return "Add to internal TestFlight and smoke test.";
  if (!manualState.smokeTest) return "Complete smoke test checklist.";
  const metadataDone = manualState.screenshots && manualState.privacy && manualState.metadata && manualState.reviewNotes && manualState.hostedLayout;
  if (!metadataDone) return "Finish App Store Connect metadata.";
  if (!manualState.ready) return "Mark ready to submit for App Review.";
  if (!manualState.submittedReview) return "Submit for App Review.";
  if (!manualState.reviewApproved) return "Track App Review until approval or rejection.";
  if (!manualState.released) return "Manually release the approved app.";
  if (!manualState.postRelease) return "Complete post-release verification.";
  return "Launch complete.";
}

async function main() {
  console.log("Spades Free Play App Store Launch Dashboard");
  console.log(`Version ${EXPECTED.version} (${EXPECTED.buildNumber})`);
  console.log(`TestFlight: https://appstoreconnect.apple.com/apps/${EXPECTED.ascAppId}/testflight/ios`);

  printHeader("Config");
  await checkAppConfig();
  results.splice(0).forEach(printResult);

  printHeader("Live URLs");
  await checkUrls();
  results.splice(0).forEach(printResult);

  printHeader("EAS");
  await checkEas();
  results.splice(0).forEach(printResult);

  printHeader("Manual Tasks");
  const manualState = await checkManualTasks();
  results.splice(0).forEach(printResult);

  printHeader("Recommended Next Action");
  console.log(chooseNextAction(manualState));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
