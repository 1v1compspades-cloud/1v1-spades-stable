#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const root = fileURLToPath(new URL("..", import.meta.url));
const appJsonPath = resolve(root, "app.json");
const defaultOutDir = resolve(root, "app-store-screenshots");

const targets = [
  {
    key: "6.3",
    label: '6.3" Display',
    folder: "iphone-6.3",
    accepted: [
      [1179, 2556],
      [1206, 2622],
    ],
    preferredDeviceNames: [
      "iPhone 16 Pro",
      "iPhone 15 Pro",
      "iPhone 14 Pro",
      "iPhone 16",
      "iPhone 15",
      "iPhone 17 Pro",
      "iPhone 17",
    ],
  },
  {
    key: "6.5",
    label: '6.5" Display',
    folder: "iphone-6.5",
    accepted: [
      [1284, 2778],
      [1242, 2688],
    ],
    preferredDeviceNames: [
      "iPhone 14 Plus",
      "iPhone 13 Pro Max",
      "iPhone 12 Pro Max",
      "iPhone 11 Pro Max",
      "iPhone 11",
      "iPhone XS Max",
      "iPhone XR",
    ],
  },
];

const defaultShots = [
  "01-home",
  "02-bidding",
  "03-playing-trick",
  "04-learn-deal",
  "05-rules",
  "06-fair-play",
];

function printHelp() {
  console.log(`Capture App Store screenshots for 1v1 Spades.

Usage:
  pnpm run appstore:screenshots -- [options]

Options:
  --app <path>          Install a built .app before launching.
  --bundle-id <id>     Bundle identifier to launch. Defaults to app.json ios.bundleIdentifier.
  --out <dir>          Output directory. Defaults to app-store-screenshots.
  --targets <list>     Comma-separated display targets: 6.3,6.5. Defaults to both.
  --shots <list>       Comma-separated shot names. Defaults to the App Store checklist set.
  --open-url <url>     Open a URL after launch, useful for app schemes or hosted test URLs.
  --delay <ms>         Delay before each capture. Defaults to 1500.
  --no-prompt          Do not pause before each shot. Captures current app state in sequence.
  --skip-launch        Do not launch the app. Useful when you already have the screen ready.
  --help               Show this help.

Examples:
  pnpm run appstore:screenshots -- --app ./build/Build/Products/Debug-iphonesimulator/1v1\\ Spades.app
  pnpm run appstore:screenshots -- --targets 6.3 --shots home,rules --skip-launch
`);
}

function parseArgs(argv) {
  const options = {
    appPath: null,
    bundleId: null,
    outDir: defaultOutDir,
    selectedTargets: ["6.3", "6.5"],
    shots: defaultShots,
    openUrl: null,
    delayMs: 1500,
    prompt: true,
    skipLaunch: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    switch (arg) {
      case "--":
        break;
      case "--app":
        options.appPath = resolve(next());
        break;
      case "--bundle-id":
        options.bundleId = next();
        break;
      case "--out":
        options.outDir = resolve(next());
        break;
      case "--targets":
        options.selectedTargets = splitList(next());
        break;
      case "--shots":
        options.shots = splitList(next());
        break;
      case "--open-url":
        options.openUrl = next();
        break;
      case "--delay":
        options.delayMs = Number(next());
        if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
          throw new Error("--delay must be a positive number of milliseconds");
        }
        break;
      case "--no-prompt":
        options.prompt = false;
        break;
      case "--skip-launch":
        options.skipLaunch = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function splitList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const detail = stderr || stdout || `${command} exited with ${result.status}`;
    throw new Error(detail);
  }

  return result.stdout ?? "";
}

function readJson(command, args) {
  return JSON.parse(run(command, args));
}

async function readDefaultBundleId() {
  const appJson = JSON.parse(await readFile(appJsonPath, "utf8"));
  const bundleId = appJson.expo?.ios?.bundleIdentifier;
  if (!bundleId) {
    throw new Error(`Could not read expo.ios.bundleIdentifier from ${appJsonPath}`);
  }
  return bundleId;
}

function getLatestIosRuntime() {
  const data = readJson("xcrun", ["simctl", "list", "--json", "runtimes"]);
  const runtimes = (data.runtimes ?? [])
    .filter((runtime) => runtime.isAvailable && runtime.platform === "iOS")
    .sort((a, b) => compareVersions(b.version, a.version));

  if (!runtimes.length) {
    throw new Error("No available iOS Simulator runtime found. Install an iOS runtime in Xcode first.");
  }

  return runtimes[0];
}

function compareVersions(a, b) {
  const left = String(a).split(".").map(Number);
  const right = String(b).split(".").map(Number);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function findDeviceType(target) {
  const data = readJson("xcrun", ["simctl", "list", "--json", "devicetypes"]);
  const deviceTypes = data.devicetypes ?? [];
  for (const name of target.preferredDeviceNames) {
    const match = deviceTypes.find((deviceType) => deviceType.name === name);
    if (match) return match;
  }
  throw new Error(`No Simulator device type found for ${target.label}. Tried: ${target.preferredDeviceNames.join(", ")}`);
}

function findExistingDevice(target) {
  const data = readJson("xcrun", ["simctl", "list", "--json", "devices", "available"]);
  const runtimes = Object.values(data.devices ?? {});
  for (const name of target.preferredDeviceNames) {
    for (const devices of runtimes) {
      const match = devices.find((device) => device.name === name && device.isAvailable);
      if (match) return match;
    }
  }
  return null;
}

function ensureDevice(target) {
  const existing = findExistingDevice(target);
  if (existing) return existing;

  const runtime = getLatestIosRuntime();
  const deviceType = findDeviceType(target);
  const name = `1v1 Spades ${target.label}`;
  const udid = run("xcrun", ["simctl", "create", name, deviceType.identifier, runtime.identifier]).trim();
  return { name, udid, state: "Shutdown", isAvailable: true };
}

function bootDevice(device) {
  if (device.state !== "Booted") {
    try {
      run("xcrun", ["simctl", "boot", device.udid]);
    } catch (error) {
      if (!String(error.message).includes("current state: Booted")) {
        throw error;
      }
    }
  }
  run("xcrun", ["simctl", "bootstatus", device.udid, "-b"], { stdio: "inherit" });
}

function installAndLaunch(device, options) {
  if (options.appPath) {
    if (!existsSync(options.appPath)) {
      throw new Error(`App path does not exist: ${options.appPath}`);
    }
    run("xcrun", ["simctl", "install", device.udid, options.appPath], { stdio: "inherit" });
  }

  if (!options.skipLaunch) {
    run("xcrun", ["simctl", "launch", device.udid, options.bundleId], { stdio: "inherit" });
  }

  if (options.openUrl) {
    run("xcrun", ["simctl", "openurl", device.udid, options.openUrl], { stdio: "inherit" });
  }
}

async function sleep(ms) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function getPngSize(path) {
  const outputText = run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path]);
  const width = Number(outputText.match(/pixelWidth:\s+(\d+)/)?.[1]);
  const height = Number(outputText.match(/pixelHeight:\s+(\d+)/)?.[1]);
  if (!width || !height) {
    throw new Error(`Could not read PNG dimensions for ${path}`);
  }
  return { width, height };
}

function isAcceptedSize(target, size) {
  return target.accepted.some(([width, height]) => width === size.width && height === size.height);
}

function formatSizes(target) {
  return target.accepted.map(([width, height]) => `${width}x${height}`).join(" or ");
}

async function captureShot(device, target, shotName, options) {
  const safeName = shotName.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "");
  const folder = resolve(options.outDir, target.folder);
  const filePath = join(folder, `${safeName}.png`);
  await mkdir(dirname(filePath), { recursive: true });

  run("xcrun", ["simctl", "io", device.udid, "screenshot", filePath], { stdio: "inherit" });
  const size = await getPngSize(filePath);
  const accepted = isAcceptedSize(target, size);

  if (!accepted) {
    console.warn(
      `Warning: ${filePath} is ${size.width}x${size.height}; Apple accepts ${formatSizes(target)} for ${target.label}.`,
    );
  }

  return {
    target: target.key,
    targetLabel: target.label,
    shot: shotName,
    path: filePath,
    width: size.width,
    height: size.height,
    accepted,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.bundleId ??= await readDefaultBundleId();

  const selectedTargets = options.selectedTargets.map((key) => {
    const target = targets.find((candidate) => candidate.key === key);
    if (!target) {
      throw new Error(`Unknown target "${key}". Use one of: ${targets.map((item) => item.key).join(", ")}`);
    }
    return target;
  });

  const prompt = options.prompt
    ? createInterface({ input, output })
    : null;
  const results = [];

  try {
    for (const target of selectedTargets) {
      console.log(`\nPreparing ${target.label} (${formatSizes(target)})`);
      const device = ensureDevice(target);
      console.log(`Using simulator: ${device.name} (${device.udid})`);
      bootDevice(device);
      installAndLaunch(device, options);

      for (const shot of options.shots) {
        if (prompt) {
          await prompt.question(`Navigate ${target.label} to "${shot}", then press Enter to capture...`);
        }
        await sleep(options.delayMs);
        const result = await captureShot(device, target, shot, options);
        results.push(result);
        const status = result.accepted ? "OK" : "CHECK SIZE";
        console.log(`[${status}] ${result.path} (${result.width}x${result.height})`);
      }
    }
  } finally {
    prompt?.close();
  }

  const manifestPath = resolve(options.outDir, "manifest.json");
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), bundleId: options.bundleId, results }, null, 2)}\n`,
  );

  const bad = results.filter((result) => !result.accepted);
  console.log(`\nWrote ${results.length} screenshot(s) to ${options.outDir}`);
  console.log(`Manifest: ${manifestPath}`);
  if (bad.length) {
    process.exitCode = 1;
    console.log("Some screenshots need resizing or a different simulator target before upload.");
  }
}

main().catch((error) => {
  console.error(`appstore:screenshots failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
