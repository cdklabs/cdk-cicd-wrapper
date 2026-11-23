# Audit project dependencies

`cdk-cicd check` runs the `audit` check by default (alongside `validate`/`license`/`security` — see the [Security guide](./security.md)), and the pipeline's default Build runs your project's `audit` npm script when it exists, so point that script at the checks you want, for example `"audit": "cdk-cicd check-dependencies --npm"` (see the [CI guide](./ci.md)). `audit` runs `cdk-cicd check-dependencies` with `--npm` when an npm lock file is present and `--python` when a `Pipfile` is present; if neither is present, the check is skipped rather than failed.

You can also run the underlying commands directly:

```bash
npx cdk-cicd check-dependencies --npm      # better-npm-audit against package-lock.json/npm-shrinkwrap.json
npx cdk-cicd check-dependencies --python   # pip-audit against Pipfile
```

If you set your own `ci.steps` in `cicd.config.ts` (which **replaces** the default build, `npm ci` included, rather than adding to it — see the [CI guide](./ci.md)), include `npm ci` and the commands above explicitly to keep dependency auditing in your CI build:

```typescript
export default defineCICD({
  // ...
  ci: {
    steps: {
      install: 'npm ci',
      audit: 'npx cdk-cicd check-dependencies --npm --python',
      build: 'npm run build',
      test: 'npm run test',
    },
  },
});
```
