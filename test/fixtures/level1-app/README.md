# `level1-app` fixture — dormant until wave 3

`bin/`, `lib/`, `cdk.json`, `tsconfig.json` are byte-for-byte the same shape as
[`../level0-app`](../level0-app). The fixture exists for the two files level0 does *not* have:

| File | Activated by |
|---|---|
| `cicd.config.ts` — `defineCICD({ stages: [dev, prod] })` | `m3-definecicd`, `m3-config-discovery` (wave 3) |
| `config/local.json`, `config/dev.json`, `config/prod.json` | `m1-loader`, `m1-accessor`, `m1-verify` (wave 1) |

## Why `cicd.config.ts` is not compiled today

It imports `defineCICD` and `Repository` from `@cdklabs/cdk-cicd-wrapper`. Neither symbol exists yet,
so the file is listed in `tsconfig.json#exclude` and is not imported by `bin/app.ts`. `npx cdk synth`
therefore still works here (ts-node only transpiles what `bin/app.ts` reaches) — the CDK app half of
this fixture is live, the CI/CD half is not.

Do not "fix" the import by stubbing the symbols. The point of checking the file in now is that wave-3
config discovery has a realistic file to find, and the compile error is the signal that the API landed.

## Why `config/*.json` has no `aws.accountId`

The base `EnvConfig` schema makes `aws.accountId` required, but **account ids may never be committed
to this repo** (it is public). So:

- the *positive* path (wave 1) supplies the account from the environment — `CDK_DEFAULT_ACCOUNT`, which
  the CDK CLI derives from the ambient credentials;
- and these files double as the *negative* case for `m1-verify`: loading one without injecting an
  account must fail with `ConfigError.kind === 'MISSING_ATTRIBUTE'` on `aws.accountId`.

`local.json` is the `CDK_STAGE`-unset fallback that `m1-loader` resolves to for a plain `cdk deploy`.
