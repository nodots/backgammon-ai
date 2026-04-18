# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities privately to **security@nodots.com**.

Do **not** open a public GitHub issue, pull request, or Discussion for security
reports. Public disclosure before a fix is available puts other users at risk.

When reporting, include:

- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept code is welcome)
- The affected package(s) and version(s)
- Any relevant logs, stack traces, or screenshots

We will acknowledge receipt within **3 business days** and provide a status
update within **7 business days**.

## Disclosure Timeline

We follow a **90-day coordinated disclosure** window:

1. You report the issue to security@nodots.com.
2. We acknowledge and begin investigation.
3. We develop, test, and ship a fix (target: within 90 days of the report).
4. Once a fix is released, we credit the reporter (with permission) in the
   release notes and, if applicable, request a CVE.
5. If 90 days pass without a fix, we discuss extension or coordinated public
   disclosure with the reporter.

## Supported Versions

Security fixes are provided for the latest minor release line of each
published package. Older release lines are supported on a best-effort basis.

## Scope

In scope:

- `@nodots/backgammon-*` npm packages
- `@nodots/gnubg-hints` native addon
- The production web app at `backgammon.nodots.com`
- The production API at `api.nodots.com`

Out of scope:

- Third-party dependencies (report those to the respective maintainers)
- Deprecated `@nodots-llc/*` packages (migrate to `@nodots/*`)
- Issues that require physical access to a user's device
- Denial-of-service via resource exhaustion on self-hosted deployments
