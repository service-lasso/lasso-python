import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pythonVersion = process.env.PYTHON_VERSION ?? "3.11.5";
const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;
const standaloneBuildTag = process.env.PYTHON_STANDALONE_BUILD_TAG ?? "20230826";

const targets = {
  win32: {
    upstreamAsset(version) {
      return `python-${version}-embed-amd64.zip`;
    },
    upstreamUrl(version, upstreamAsset) {
      return `https://www.python.org/ftp/python/${version}/${upstreamAsset}`;
    },
    archiveType: "zip",
    distribution: "python.org Windows embeddable ZIP",
    command: ".\\python.exe",
    expectedBinary: "python.exe",
    packagedAssetExtension: "zip",
    async preparePayload({ packageRoot, upstreamArchive }) {
      run("tar", ["-xf", upstreamArchive, "-C", packageRoot]);
    },
  },
  linux: {
    upstreamAsset(version) {
      return `cpython-${version}+${standaloneBuildTag}-x86_64-unknown-linux-gnu-install_only.tar.gz`;
    },
    upstreamUrl(_version, upstreamAsset) {
      return `https://github.com/astral-sh/python-build-standalone/releases/download/${standaloneBuildTag}/${encodeURIComponent(upstreamAsset)}`;
    },
    archiveType: "tar.gz",
    distribution: "Astral python-build-standalone install-only x86_64 Linux tarball",
    command: "./bin/python3",
    expectedBinary: "bin/python3",
    packagedAssetExtension: "tar.gz",
    async preparePayload({ packageRoot, upstreamArchive }) {
      const upstreamRoot = path.join(packageRoot, ".upstream");
      await mkdir(upstreamRoot, { recursive: true });
      run("tar", ["-xzf", upstreamArchive, "-C", upstreamRoot]);
      await copyDirectoryContents(path.join(upstreamRoot, "python"), packageRoot);
      await rm(upstreamRoot, { recursive: true, force: true });
    },
  },
  darwin: {
    upstreamAsset(version) {
      return `cpython-${version}+${standaloneBuildTag}-x86_64-apple-darwin-install_only.tar.gz`;
    },
    upstreamUrl(_version, upstreamAsset) {
      return `https://github.com/astral-sh/python-build-standalone/releases/download/${standaloneBuildTag}/${encodeURIComponent(upstreamAsset)}`;
    },
    archiveType: "tar.gz",
    distribution: "Astral python-build-standalone install-only x86_64 Darwin tarball",
    command: "./bin/python3",
    expectedBinary: "bin/python3",
    packagedAssetExtension: "tar.gz",
    async preparePayload({ packageRoot, upstreamArchive }) {
      const upstreamRoot = path.join(packageRoot, ".upstream");
      await mkdir(upstreamRoot, { recursive: true });
      run("tar", ["-xzf", upstreamArchive, "-C", upstreamRoot]);
      await copyDirectoryContents(path.join(upstreamRoot, "python"), packageRoot);
      await rm(upstreamRoot, { recursive: true, force: true });
    },
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

function versionedAssetName(version, platform, extension) {
  return `lasso-python-${version}-${platform}.${extension}`;
}

async function copyDirectoryContents(sourceRoot, destinationRoot) {
  await mkdir(destinationRoot, { recursive: true });
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    await cp(path.join(sourceRoot, entry.name), path.join(destinationRoot, entry.name), {
      recursive: true,
      verbatimSymlinks: true,
    });
  }
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

async function compressTarGzPackage(packageRoot, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });
  run("tar", ["-czf", outputPath, "-C", packageRoot, "."]);
  return outputPath;
}

export async function packagePython(platform = targetPlatform, version = pythonVersion) {
  const target = targets[platform];
  if (!target) {
    throw new Error(`Unsupported target platform for lasso-python packaging: ${platform}`);
  }
  if (platform !== "win32" && process.platform === "win32") {
    throw new Error(
      `Packaging ${platform} from Windows is not supported because the upstream archive contains POSIX filesystem entries. Run this target on a ${platform} host or the matching GitHub Actions runner.`,
    );
  }

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Expected Python version like "3.11.5", got "${version}".`);
  }

  const upstreamAsset = target.upstreamAsset(version);
  const upstreamUrl = target.upstreamUrl(version, upstreamAsset);
  const vendorRoot = path.join(repoRoot, "vendor", version, platform);
  const outputRoot = path.join(repoRoot, "output", "package", version, platform);
  const packageRoot = path.join(outputRoot, "payload");
  const upstreamArchive = path.join(vendorRoot, upstreamAsset);
  const assetName = versionedAssetName(version, platform, target.packagedAssetExtension);
  const outputPath = path.join(repoRoot, "dist", assetName);

  await mkdir(vendorRoot, { recursive: true });
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });

  await download(upstreamUrl, upstreamArchive);
  await target.preparePayload({ packageRoot, upstreamArchive });

  const pythonBinary = path.join(packageRoot, target.expectedBinary);
  if (!existsSync(pythonBinary)) {
    throw new Error(`Expected Python executable was not found at ${pythonBinary}`);
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
        archiveType: target.archiveType,
        distribution: target.distribution,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (target.archiveType === "zip") {
    await compressPackage(packageRoot, outputPath);
  } else {
    await compressTarGzPackage(packageRoot, outputPath);
  }
  console.log(`[lasso-python] packaged ${outputPath}`);
  return outputPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await packagePython();
}
