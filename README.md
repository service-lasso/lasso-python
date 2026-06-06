# lasso-python

`lasso-python` is the canonical Service Lasso service repo for packaging Python as a release-backed runtime provider.

The repo does not fork Python. It downloads official Python.org release artifacts, wraps the supported portable runtime shape in Service Lasso-compatible archives, and publishes those archives from protected `main` pushes using the project version pattern:

```text
yyyy.m.d-<shortsha>
```

This repo is public. It is not marked as a GitHub template today; app templates should consume the released `service.json` pattern rather than clone this packaging repo.

## Distribution Decision

`lasso-python` packages Python from platform-appropriate upstream portable distributions:

- Python `3.11.5`: `python-3.11.5-embed-amd64.zip`
- Python `3.14.4`: `python-3.14.4-embed-amd64.zip`
- Python `3.11.5`: `cpython-3.11.5+20230826-x86_64-unknown-linux-gnu-install_only.tar.gz`
- Python `3.11.5`: `cpython-3.11.5+20230826-x86_64-apple-darwin-install_only.tar.gz`

The Windows packages use the official Python.org embeddable runtime. Linux and macOS packages use the Astral-maintained `python-build-standalone` install-only CPython archives for x86_64 hosts.

## Release Assets

Each release publishes:

- `lasso-python-3.11.5-win32.zip`
- `lasso-python-3.11.5-linux.tar.gz`
- `lasso-python-3.11.5-darwin.tar.gz`
- `lasso-python-3.14.4-win32.zip`
- `service.json`
- `SHA256SUMS.txt`

The released `service.json` selects Python `3.11.5` as the default provider version.

## Release Contract

Release tags use the Service Lasso version pattern:

```text
yyyy.m.d-<shortsha>
```

The released `service.json` keeps `artifact.source.channel` set to `latest` so new consumers can track the newest Python provider packaging release intentionally. Core `service-lasso` may pin a specific release tag in its own optional provider manifest after verification.

Platform archives contain:

- `python.exe` on Windows
- `bin/python3` on Linux/macOS
- Python embedded runtime files from Python.org on Windows
- CPython install-only runtime files from `python-build-standalone` on Linux/macOS
- `SERVICE-LASSO-PACKAGE.json`

`SERVICE-LASSO-PACKAGE.json` records:

- Service Lasso service id: `@python`
- upstream project: `python/cpython`
- upstream Python version
- upstream asset name and URL
- packaging repo: `service-lasso/lasso-python`
- target platform and architecture
- Service Lasso artifact command

## Local Verification

```powershell
npm test
```

This packages Python `3.11.5` by default, extracts the archive, verifies package metadata, and runs `python --version` from the extracted payload.

To verify Python `3.14.4`:

```powershell
$env:PYTHON_VERSION = "3.14.4"
npm test
```

To verify Linux or macOS packaging on a matching host:

```powershell
$env:TARGET_PLATFORM = "linux"
npm test
```

```powershell
$env:TARGET_PLATFORM = "darwin"
npm test
```

## Service Lasso Contract

The service manifest declares:

- provider role with no managed daemon start requirement
- native archive acquisition from GitHub releases
- Python `3.11.5` as the default runtime artifact
- Windows, Linux, and Darwin artifact entries for the default runtime
- `PYTHON`, `PYTHON_HOME`, and `PYTHONPATH` provider/global environment hints derived from the installed artifact
- provider version proof using `python --version`
