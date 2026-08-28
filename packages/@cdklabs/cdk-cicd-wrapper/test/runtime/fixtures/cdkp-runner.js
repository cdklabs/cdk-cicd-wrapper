// Runs the COMPILED assembler in a real node process (jest's module registry cannot exercise the
// require.cache replay). Assembles the pipeline by replaying plain-bin.js per stage and prints, for each
// stage, how many S3 buckets its stack got -- proving the plain bin's resources land in each stage.
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assemblePipelineApp } = require('../../../lib/runtime/pipeline-assembler.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { defineCICD, Repository } = require('../../../lib/index.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cdk = require('aws-cdk-lib');

const config = defineCICD({
  application: 'shop',
  repository: Repository.codecommit('shop'),
  stages: ['dev', { name: 'prod', env: { account: '222222222222', region: 'us-east-1' }, manualApproval: true }],
});

const app = assemblePipelineApp(config, path.join(__dirname, 'plain-bin.js'));
const stages = app.node.findAll().filter((c) => c instanceof cdk.Stage);
const result = stages.map((s) => {
  const asm = s.synth();
  const stack = asm.stacks.find((x) => x.stackName.includes('shop-app'));
  const resources = stack ? stack.template.Resources || {} : {};
  const bucketIds = Object.keys(resources).filter((k) => resources[k].Type === 'AWS::S3::Bucket');
  // stack.environment is `aws://<account>/<region>` -- proves the per-stage env pin took effect.
  const account = stack && stack.environment ? stack.environment.account : undefined;
  return { stage: s.node.id, buckets: bucketIds.length, bucketIds, account };
});
process.stdout.write('RESULT=' + JSON.stringify(result) + '\n');
