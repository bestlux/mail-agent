# Releasing

This workspace publishes three packages together:

- `mail-agent`
- `@mail-agent/daemon`
- `@mail-agent/shared`

`mail-agent` is the public entrypoint. The scoped packages are internal support packages that get published because the CLI depends on them.

## Release model

The intended steady-state release path is:

1. bump all workspace package versions together
2. push a `vX.Y.Z` git tag
3. let GitHub Actions publish the workspace to npm

The publish workflow lives in [.github/workflows/publish.yml](./.github/workflows/publish.yml).

## npm bootstrap vs steady state

For a brand-new package name, you usually need one bootstrap ownership path before trusted publishing can fully take over.

You have two practical options:

1. Do the first publish manually from a machine that is logged into npm.
2. Add a temporary `NPM_TOKEN` repository secret and let the publish workflow use that for the first release.

After the packages exist on npm, set up npm trusted publishers for all three packages:

- `mail-agent`
- `@mail-agent/daemon`
- `@mail-agent/shared`

Point each one at:

- GitHub org or user: `bestlux`
- repository: `mail-agent`
- workflow filename: `publish.yml`

Once trusted publishers are configured and tested, delete the temporary `NPM_TOKEN` secret.

## Bump versions

Keep the root workspace and all three publishable packages on the same version.

To bump them in one shot:

```powershell
corepack pnpm release:version 0.2.0
```

That updates:

- `package.json`
- `packages/plugin/package.json`
- `packages/daemon/package.json`
- `packages/shared/package.json`

## Pre-release checks

Run:

```powershell
corepack pnpm install
corepack pnpm build
corepack pnpm test
corepack pnpm pack:check
corepack pnpm release:dry-run
```

## GitHub release flow

1. Bump the workspace version:

```powershell
corepack pnpm release:version 0.2.0
```

2. Commit the version bump.
3. Push the branch.
4. Tag the release:

```powershell
git tag v0.2.0
git push origin v0.2.0
```

5. GitHub Actions runs `publish.yml`.
6. The workflow validates the tag against the workspace version, builds, tests, dry-runs the publish, then publishes to npm.

## Workflow notes

- The workflow upgrades npm before publishing because trusted publishing requires a newer npm CLI than the default runner image may ship with.
- `pnpm publish` rewrites workspace dependency ranges during publish time.
- Do not publish only `mail-agent` without publishing the support packages for the same version.
- `NPM_TOKEN` is optional in the workflow and is mainly there as a bootstrap or fallback path.
- If you rerun a publish after some packages already went out, npm will reject already-published versions. Cut a new version instead of trying to overwrite one.
