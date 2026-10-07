# Security Policy

phinPDF opens untrusted files, so we take security reports seriously.

## Reporting a vulnerability

Report privately through
[GitHub private vulnerability reporting](https://github.com/phinstack/phinPDF/security/advisories/new).
Please don't open a public issue.

Include what you can: affected version or commit, steps to reproduce, and a sample PDF if
one triggers the problem (attach it to the private advisory, not a public issue).

## What to expect

- Acknowledgement within 3 working days.
- An initial assessment (severity, affected versions) within 10 working days.
- Critical issues fixed within 7 days of confirmation where possible.
- Public disclosure after a fix ships, or after 90 days, whichever comes first. We credit
  reporters unless they prefer otherwise.

## Scope

In scope: the web app, the desktop app, and anything a malicious PDF can make phinPDF do
(script execution, file access, network requests, crashes, hangs, data that survives
redaction).

Out of scope: vulnerabilities in a dependency that phinPDF doesn't expose (report those
upstream), and issues that require an already-compromised device.

## Supported versions

Before 1.0, only the latest commit on the default branch is supported.
