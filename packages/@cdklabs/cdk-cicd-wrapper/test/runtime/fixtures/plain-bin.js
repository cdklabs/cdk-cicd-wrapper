// A stand-in for a PLAIN user bin/app.ts: `new cdk.App()` + a stack, no wrapper import, no builder.
// The assembler replays this once per stage; `new cdk.App()` is patched to return the current Stage.
const cdk = require('aws-cdk-lib');
const s3 = require('aws-cdk-lib/aws-s3');

const app = new cdk.App();
const stack = new cdk.Stack(app, 'shop-app', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
new s3.Bucket(stack, `Data-${process.env.CDK_STAGE}`);

// Emit a construct warning, the way real aws-cdk-lib code (e.g. NodejsFunction bundling) does during
// synth. addWarningV2 -> Acknowledgements.of(scope) -> App.of(scope). Under replay the exported `App`
// is the assembler's ReplayApp stand-in, so this crashes with `App.of is not a function` unless
// ReplayApp inherits App's statics. Keeping it in the shared fixture means every replay test proves the
// warning path survives, on top of the bucket-per-stage assertions.
cdk.Annotations.of(stack).addWarningV2('cdk-cicd:replay-appof-fixture', 'replay must survive App.of');
