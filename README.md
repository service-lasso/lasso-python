# lasso-python

`lasso-python` is the canonical Service Lasso service repo for packaging Python as a release-backed runtime provider.

The repo does not fork Python. It downloads official Python.org release artifacts, wraps the supported portable runtime shape in Service Lasso-compatible archives, and publishes those archives from protected `main` pushes using the project version pattern:

```text
yyyy.m.d-<shortsha>
```

This repo is public. It is not marked as a GitHub template today; app templates should consume the released `service.json` pattern rather than clone this packaging repo.

## Distribution Decision

The first `lasso-python` release uses official Python.org Windows embeddable ZIPs:

- Python `3.11.5`: `python-3.11.5-embed-amd64.zip`
- Python `3.14.4`: `python-3.14.4-embed-amd64.zip`

Python.org does not publish equivalent general-purpose Linux/macOS portable runtime archives. Linux and macOS are therefore intentionally unsupported for this first release-backed provider until a separate portable distribution strategy is approved.

## Release Assets

Each release publishes:

- `lasso-python-3.11.5-win32.zip`
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

Each platform archive contains:

- `python.exe`
- Python embedded runtime files from Python.org
- `SERVICE-LASSO-PACKAGE.json`

`SERVICE-LASSO-PACKAGE.json` records:

- Service Lasso service id: `@python`
- upstream project: `python/cpython`
- upstream Python version
- upstream asset name and URL
- packaging repo: `service-lasso/lasso-python`
- target platform and architecture

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

## Service Lasso Contract

The service manifest declares:

- provider role with no managed daemon start requirement
- native archive acquisition from GitHub releases
- Python `3.11.5` as the default runtime artifact
- `PYTHON`, `PYTHON_HOME`, and `PYTHONPATH` provider/global environment hints
- provider version proof using `python --version`
