import { AppConfig, FieldKind } from '@cdklabs/cdk-cicd-wrapper';
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * Same trivial payload as level0-app, but this one READS its per-environment config
 * through the wrapper. See test/fixtures/README.md.
 *
 * The config read lives here, not in bin/app.ts, on purpose: bin/app.ts stays
 * byte-for-byte identical to level0-app so the A/B "wrapper inert vs active" contract
 * holds, and so the wave-2 "zero edits to bin/" injection story stays clean.
 * AppConfig.of reads the injected `cicd:config` context first (wave 2) and falls back
 * to loading config/<stage>.json (wave 1), so this same line works either way.
 */
export class Level1Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const runId = process.env.CDK_CICD_TEST_RUN_ID ?? 'local';

    // The schema is the APP's, not the wrapper's -- the wrapper ships no required-field
    // table of its own. aws.accountId is deliberately absent from config/*.json (account
    // ids may never be committed here), so on the positive path it is derived from
    // CDK_DEFAULT_ACCOUNT, and with no account available at all this throws MISSING_ATTRIBUTE
    // and cdk synth exits non-zero -- which is the m1-verify negative case.
    const cfg = AppConfig.of(this, {
      schema: {
        requiredAttributes: [
          { path: 'application', kind: FieldKind.STRING },
          { path: 'aws.accountId', kind: FieldKind.STRING },
        ],
      },
    });

    new ssm.StringParameter(this, 'Marker', {
      parameterName: `/cdkcicdtest/${runId}/level1`,
      stringValue: `cdk-cicd-wrapper ${cfg.application} fixture, run ${runId}`,
    });
  }
}
