# Contributing

## Branch Workflow
- Create feature branches from `development`.
- Merge completed feature branches into `development` via PR.
- When releasing, merge `development` into `main` via PR.
- `development` should always equal `main` + merged feature work.

## Pull Requests
- Keep PRs focused and small.
- Update docs and tests where applicable.
- Use the PR template checklist.

## Releases
- Open a PR from `development` to `main`.
- Use a merge commit (no squash) to preserve history between branches.

## Protected Branches
- `main` and `development` are protected; direct pushes are disallowed.
- Changes must land via PRs with at least one approval.
