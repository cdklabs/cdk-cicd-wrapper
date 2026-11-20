# Audit project dependencies

`cdk-cicd check` runs the `audit` check by default (alongside `validate`/`license`/`security` — see the [Security guide](./security.md)). The pipeline's default Build runs your project's `npm run audit` script when it exists; to get dependency auditing without writing that script, set `ci.steps`. It replaces the whole default,
`npm ci` included, so list every step: `npm ci`, `npx cdk-cicd check`, then your build and test (see the
[CI guide](./ci.md)). `audit` runs `cdk-cicd check-dependencies` with `--npm` when an npm lock file is present and `--python` when a `Pipfile` is present; if neither is present, the check is skipped rather than failed.

You can also run the underlying commands directly:

```bash
npx cdk-cicd check-dependencies --npm      # better-npm-audit against package-lock.json/npm-shrinkwrap.json
npx cdk-cicd check-dependencies --python   # pip-audit against Pipfile
```

If you set your own `ci.steps` in `cicd.config.ts` (which **replaces** the whole default build phase, `npm ci` included, rather than adding to it — see the [CI guide](./ci.md)), list `npm ci` and the commands above explicitly to keep dependency auditing in your CI build:

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
