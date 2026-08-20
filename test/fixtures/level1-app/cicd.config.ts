/**
 * Level 1 config: the minimum a user writes to get a pipeline.
 *
 * !! NOT ACTIVE YET !!  `defineCICD` / `Repository` do not exist in
 * `@cdklabs/cdk-cicd-wrapper` until wave 3 (`m3-definecicd`, `m3-config-discovery`).
 * This file is therefore excluded from `tsconfig.json` and is not imported by
 * `bin/app.ts`, so nothing compiles it today. It is checked in now so the wave-3
 * discovery code has a real target to find. See ./README.md.
 */
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'cdkcicdtest-level1',
  repository: Repository.github('cdklabs/cdk-cicd-wrapper-fixture'),
  stages: [
    // Account ids must never be committed to this repo, so both stages read the
    // test account from the environment (the gitignored .env supplies it).
    { name: 'dev', env: { account: process.env.CDK_CICD_TEST_ACCOUNT!, region: 'us-west-2' } },
    {
      name: 'prod',
      env: { account: process.env.CDK_CICD_TEST_ACCOUNT!, region: 'us-west-1' },
      manualApproval: true,
    },
  ],
});
