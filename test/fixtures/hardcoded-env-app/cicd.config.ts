/**
 * Pipeline config for the drift fixture. The `drift` stage TARGETS the real test account, but
 * bin/app.ts bakes a foreign account (000000000000) into the stack env -- so `cdk-cicd deploy
 * --stage drift` synthesizes a manifest for 000000000000, the drift check compares it to the
 * STS-resolved test account, finds an account mismatch, and refuses to deploy. That refusal is
 * exactly what m3-verify asserts. The stack can never reach AWS.
 */
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'cdkcicdtest-hardcoded-env',
  repository: Repository.github('cdklabs/cdk-cicd-wrapper-fixture'),
  stages: [{ name: 'drift', env: { account: process.env.CDK_CICD_TEST_ACCOUNT!, region: 'us-west-2' } }],
});
