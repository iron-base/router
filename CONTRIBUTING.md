# Contributing to @ironbase/router

Thank you for contributing to `@ironbase/router`. Contributions should preserve
Fetch portability, type safety, immutable router composition, and the documented
public API.

## Prerequisites

- [Bun](https://bun.com/) 1.4.0 or newer
- Node.js 22 or newer for validating the published Node.js target
- Git

Install the locked dependencies:

```bash
bun install --frozen-lockfile
```

## Development Workflow

Create a focused branch from `main`, make the smallest change that solves the
problem, and add or update tests for observable behavior. Avoid changing public
APIs without updating the relevant documentation.

Useful commands:

```bash
bun run format          # Format supported files with Biome
bun run format:check    # Check formatting without writing files
bun run lint            # Run Biome lint rules
bun run typecheck       # Type-check the project
bun run test:types      # Check public API type tests
bun run test            # Run the test suite
bun run test:coverage   # Run the test suite with coverage
bun run bench           # Run router benchmarks
bun run build           # Build JavaScript, source maps, and declarations
```

Tests cover runtime behavior, type contracts, OpenAPI output, and matcher
properties. Changes involving requests, paths, headers, or public APIs must
remain portable across Linux, macOS, and Windows.

## Before Opening A Pull Request

Run the complete quality gate:

```bash
bun run check
```

For packaging changes, inspect exactly what Bun would publish:

```bash
bun run package:dry-run
bun run publish:dry-run
```

`package:dry-run` runs all checks and exercises the pack lifecycle without
creating a tarball. `publish:dry-run` exercises Bun's publish lifecycle without
publishing to npm. Confirm that the package contains only the intended `dist`
entry points, declaration files, source maps, README, license, and package
metadata.

## Pull Requests

- Explain the problem and the behavior of the proposed solution.
- Link related issues when applicable.
- Include tests for fixes and new behavior.
- Keep unrelated refactors out of the pull request.
- Update the README and API documentation when behavior changes.
- Ensure all required GitHub Actions checks pass.

Commit messages should be concise and describe the completed change. Maintainers
may request changes when a pull request introduces undocumented behavior,
platform-specific assumptions, or avoidable public API compatibility issues.

## Releases

Only maintainers should create releases. Versioning follows semantic versioning
and uses Bun's version command:

```bash
bun pm version patch
git push origin main --follow-tags
```

Use `minor`, `major`, a prerelease increment, or an explicit version when
appropriate. The version command runs the package dry-run before creating its
commit and `v<version>` tag. Pushing that tag triggers npm publication and a
GitHub Release.

Prerelease versions use Bun's prerelease increment or an explicit semantic
version:

```bash
bun pm version prerelease
git push origin main --follow-tags
```

A prerelease tag dispatches the trusted release workflow, publishes the package
under npm's `next` tag, and creates a GitHub prerelease. Stable versions publish
under npm's `latest` tag.

Publishing uses npm trusted publishing with GitHub Actions OIDC. Configure the
`@ironbase/router` package on npm with a GitHub Actions trusted publisher for
organization `iron-base`, repository `router`, and workflow filename
`release.yml`. Allow the `npm publish` action. No npm write token should be
stored in GitHub. Never publish manually from an untagged or unverified working
tree.

## License

By contributing, you agree that your contribution will be licensed under the
project's MIT License.
