import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pythonVersion = process.env.PYTHON_VERSION ?? "3.11.5";
const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;

const targets = {
  win32: {
    upstreamAsset(version) {
      return `python-${version}-embed-amd64.zip`;
    },
    archiveType: "zip",
    command: ".\\python.exe",
  },
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function versionedAssetName(version, platform) {
  return `lasso-python-${version}-${platform}.zip`;
}

async function download(url, destination) {
  if (existsSync(destination)) {
    return;
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "service-lasso-lasso-python-packager",
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, bytes);
}

async function compressPackage(packageRoot, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });
  run("powershell", [
    "-NoLogo",
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path ${JSON.stringify(path.join(packageRoot, "*"))} -DestinationPath ${JSON.stringify(outputPath)} -Force`,
  ]);
  return outputPath;
}

export async function packagePython(platform = targetPlatform, version = pythonVersion) {
  const target = targets[platform];
  if (!target) {
    throw new Error(`Unsupported target platform for official Python.org embeddable packaging: ${platform}`);
  }

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Expected Python version like "3.11.5", got "${version}".`);
  }

  const upstreamAsset = target.upstreamAsset(version);
  const upstreamUrl = `https://www.python.org/ftp/python/${version}/${upstreamAsset}`;
  const vendorRoot = path.join(repoRoot, "vendor", version, platform);
  const outputRoot = path.join(repoRoot, "output", "package", version, platform);
  const packageRoot = path.join(outputRoot, "payload");
  const upstreamArchive = path.join(vendorRoot, upstreamAsset);
  const assetName = versionedAssetName(version, platform);
  const outputPath = path.join(repoRoot, "dist", assetName);

  await mkdir(vendorRoot, { recursive: true });
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });

  await download(upstreamUrl, upstreamArchive);
  run("tar", ["-xf", upstreamArchive, "-C", packageRoot]);

  const pythonExe = path.join(packageRoot, "python.exe");
  if (!existsSync(pythonExe)) {
    throw new Error(`Expected Python executable was not found at ${pythonExe}`);
  }

  await writeFile(
    path.join(packageRoot, "SERVICE-LASSO-PACKAGE.json"),
    `${JSON.stringify(
      {
        serviceId: "@python",
        upstream: {
          repo: "python/cpython",
          version,
          asset: upstreamAsset,
          url: upstreamUrl,
        },
        packagedBy: "service-lasso/lasso-python",
        platform,
        arch: "x64",
        command: target.command,
        distribution: "python.org Windows embeddable ZIP",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await compressPackage(packageRoot, outputPath);
  console.log(`[lasso-python] packaged ${outputPath}`);
  return outputPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await packagePython();
}
