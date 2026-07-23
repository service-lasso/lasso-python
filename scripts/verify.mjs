import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packagePython } from "./package.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.env.TARGET_PLATFORM ?? process.platform;
const version = process.env.PYTHON_VERSION ?? "3.11.5";

function assertCanonicalManifestHealthchecks(manifest) {
  if (Object.hasOwn(manifest, "healthcheck")) {
    throw new Error('service.json must use canonical "healthchecks" instead of "healthcheck".');
  }
  if (!Array.isArray(manifest.healthchecks)) {
    throw new Error('service.json must declare canonical "healthchecks" as an array.');
  }

  const ids = new Set();
  for (const check of manifest.healthchecks) {
    if (!check || typeof check !== "object" || Array.isArray(check)) {
      throw new Error(`Each healthchecks[] entry must be an object: ${JSON.stringify(check)}`);
    }
    if (typeof check.id !== "string" || check.id.length === 0) {
      throw new Error(`Each healthchecks[] entry must have a stable id: ${JSON.stringify(check)}`);
    }
    if (ids.has(check.id)) {
      throw new Error(`Duplicate healthchecks[] id: ${check.id}`);
    }
    ids.add(check.id);
    if (Object.hasOwn(check, "tcphost") || Object.hasOwn(check, "tcpport")) {
      throw new Error(`healthchecks[] entry ${check.id} uses deprecated TCP aliases.`);
    }
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      ...options,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}\n${stdout}\n${stderr}`));
      }
    });
  });
}

const manifest = JSON.parse(await readFile(path.join(repoRoot, "service.json"), "utf8"));
assertCanonicalManifestHealthchecks(manifest);

const artifact = await packagePython(platform, version);
const verifyRoot = path.join(repoRoot, "output", "verify", version, platform);
const extractRoot = path.join(verifyRoot, "extract");

await rm(verifyRoot, { recursive: true, force: true });
await mkdir(extractRoot, { recursive: true });
await run("tar", ["-xf", artifact, "-C", extractRoot]);

const packageMetadata = JSON.parse(
  await readFile(path.join(extractRoot, "SERVICE-LASSO-PACKAGE.json"), "utf8"),
);
if (
  packageMetadata.serviceId !== "@python" ||
  packageMetadata.upstream?.repo !== "python/cpython" ||
  packageMetadata.upstream?.version !== version ||
  packageMetadata.packagedBy !== "service-lasso/lasso-python" ||
  packageMetadata.platform !== platform ||
  typeof packageMetadata.command !== "string" ||
  packageMetadata.command.length === 0
) {
  throw new Error(`Unexpected package metadata: ${JSON.stringify(packageMetadata)}`);
}

const binaryPath = path.resolve(extractRoot, packageMetadata.command);
const pythonVersion = await run(binaryPath, ["--version"], { cwd: extractRoot });
const observed = `${pythonVersion.stdout}${pythonVersion.stderr}`.trim();
if (observed !== `Python ${version}`) {
  throw new Error(`Expected Python ${version}, got ${observed}`);
}

console.log(`[lasso-python] verification passed for ${version} on ${platform}`);
