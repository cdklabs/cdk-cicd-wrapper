/**
 * Level 1 config: the minimum a user writes to get a pipeline.
 *
 * Active as of wave 3. `defineCICD` / `Repository` ship from `@cdklabs/cdk-cicd-wrapper`
 * (`m3-definecicd`), and the CLI's `m3-config-discovery` loads this file in-process via ts-node.
 * It is intentionally NOT imported by `bin/app.ts` and stays listed in `tsconfig.json#exclude`:
 * the fixture's own build never compiles it, the CLI does at discovery time -- which is exactly
 * how a real user's `cicd.config.ts` is consumed. See ./README.md.
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
