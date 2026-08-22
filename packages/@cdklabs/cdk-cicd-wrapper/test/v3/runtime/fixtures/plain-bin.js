// A stand-in for a PLAIN user bin/app.ts: `new cdk.App()` + a stack, no wrapper import, no builder.
// The assembler replays this once per stage; `new cdk.App()` is patched to return the current Stage.
const cdk = require('aws-cdk-lib');
const s3 = require('aws-cdk-lib/aws-s3');

const app = new cdk.App();
const stack = new cdk.Stack(app, 'shop-app', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
new s3.Bucket(stack, `Data-${process.env.CDK_STAGE}`);
