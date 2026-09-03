// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The self-mutating assembler: `cdk-cicd exec` runs this (not the entry) when engine === CDK_PIPELINES or
// GITHUB_ACTIONS. It builds the self-mutating pipeline by REPLAYING a plain user bin once per configured
// stage -- proving the single-entry principle needs zero wrapper code in the user's bin.
//
// Two layers of test: the pipeline STRUCTURE is checked in-process with a stub provider; the real replay
// (require.cache manipulation) is checked in a SUBPROCESS, because jest's module registry does not honour
// require.cache (same reason bundled-diagnostic runs the compiled preload out of process).

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { App, Aspects, CfnResource, IAspect, Stack, Stage } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { IConstruct } from 'constructs';
import { AppConfig } from '../../src/appconfig/accessor';
import { defineCICD } from '../../src/config/define';
import { Repository } from '../../src/config/repository';
import { EngineType, SynthesizerType } from '../../src/config/types';
import { CdkPipelinesStageContext, IStageProvider } from '../../src/engine/cdkpipelines/CdkPipelinesEngine';
import { GitHubActionsEngine } from '../../src/engine/github/GitHubActionsEngine';
import { buildPipelineApp, replayForcedRoleEnv } from '../../src/runtime/pipeline-assembler';
import { registerPlugin } from '../../src/runtime/plugins';

function config() {
  return defineCICD({
    application: 'shop',
    repository: Repository.codecommit('shop'),
    stages: ['dev', { name: 'prod', env: { account: '222222222222', region: 'us-east-1' }, manualApproval: true }],
  });
}

/** Stand-in for the replay: drops one stack (a bucket) into each stage, no require.cache needed. */
class StubProvider implements IStageProvider {
  public stacks(stage: Stage, context: CdkPipelinesStageContext): void {
    const stack = new Stack(stage, 'shop-app', { env: context.env });
    new s3.Bucket(stack, 'Data');
  }
}

describe('CDK Pipelines assembler: pipeline structure (stub provider)', () => {
  const prev = { a: process.env.CDK_DEFAULT_ACCOUNT, r: process.env.CDK_DEFAULT_REGION };
  beforeEach(() => {
    process.env.CDK_DEFAULT_ACCOUNT = '111111111111';
    process.env.CDK_DEFAULT_REGION = 'us-east-1';
  });
  afterEach(() => {
    process.env.CDK_DEFAULT_ACCOUNT = prev.a;
    process.env.CDK_DEFAULT_REGION = prev.r;
  });

  test('assembles one self-mutating pipeline with a wave per stage, in promotion order', () => {
    const t = Template.fromStack(
      buildPipelineApp(config(), new StubProvider()).node.findChild('shop-pipeline') as Stack,
    );
    t.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const names = (pipeline.Properties.Stages as any[]).map((s) => s.Name);
    expect(names).toEqual(expect.arrayContaining(['Source', 'Build', 'UpdatePipeline', 'dev', 'prod']));
    expect(names.indexOf('dev')).toBeLessThan(names.indexOf('prod'));
  });

  test('the gated stage gets a manual-approval action; the auto stage does not', () => {
    const t = Template.fromStack(
      buildPipelineApp(config(), new StubProvider()).node.findChild('shop-pipeline') as Stack,
    );
    const pipeline = Object.values(t.findResources('AWS::CodePipeline::Pipeline'))[0] as any;
    const byName = (n: string) => (pipeline.Properties.Stages as any[]).find((s) => s.Name === n);
    const categories = (n: string) => (byName(n).Actions as any[]).map((a) => a.ActionTypeId.Category);
    expect(categories('prod')).toContain('Approval');
    expect(categories('dev')).not.toContain('Approval');
  });

  test('applies the full default wrapper aspect set to the self-mutating app', () => {
    const app = buildPipelineApp(config(), new StubProvider());
    const aspectNames = Aspects.of(app).all.map((aspect) => {
      const delegated = (aspect as { delegate?: IAspect }).delegate;
      return (delegated ?? aspect).constructor.name;
    });
    expect(aspectNames).toEqual(
      expect.arrayContaining([
        'AwsSolutionsChecks',
        'LogRetentionAspect',
        'EncryptBucketOnTransitAspect',
        'EncryptSNSTopicOnTransitAspect',
        'RotateEncryptionKeysAspect',
        'DisablePublicIPAssignmentForEC2Aspect',
      ]),
    );
  });

  test('root pipeline aspects do not revisit resources in an independently wrapped application stage', () => {
    const counter = new (class implements IAspect {
      public bucketVisits = 0;

      public visit(node: IConstruct): void {
        if (CfnResource.isCfnResource(node) && node.cfnResourceType === 'AWS::S3::Bucket') {
          this.bucketVisits += 1;
        }
      }
    })();
    let applicationStack: Stack | undefined;
    const provider: IStageProvider = {
      stacks(stage: Stage, context: CdkPipelinesStageContext): void {
        registerPlugin(stage, {
          ref: { name: 'CountBuckets', version: '1' },
          aspect: counter,
        });
        applicationStack = new Stack(stage, 'shop-app', { env: context.env });
        new s3.Bucket(applicationStack, 'Data');
      },
    };
    buildPipelineApp(
      defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev'],
        plugins: [{ name: 'CountBuckets', version: '1' }],
      }),
      provider,
    );

    Template.fromStack(applicationStack!);
    expect(counter.bucketVisits).toBe(1);
  });

  test('honours plugins: [] for the self-mutating app', () => {
    const app = buildPipelineApp(
      defineCICD({
        application: 'shop',
        repository: Repository.codecommit('shop'),
        stages: ['dev'],
        plugins: [],
      }),
      new StubProvider(),
    );
    expect(Aspects.of(app).all).toEqual([]);
  });

  test('loads per-stage application config before replay and applies its tags/plugin settings to that stage', () => {
    const originalCwd = process.cwd();
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-stage-config-'));
    mkdirSync(path.join(cwd, 'config'));
    writeFileSync(
      path.join(cwd, 'config', 'dev.json'),
      JSON.stringify({ tags: { StageConfig: 'dev' }, logRetentionInDays: 14 }),
    );

    let appConfig: Record<string, unknown> | undefined;
    let applicationStack: Stack | undefined;
    const provider: IStageProvider = {
      stacks(stage: Stage, context: CdkPipelinesStageContext): void {
        appConfig = AppConfig.of(stage) as Record<string, unknown>;
        applicationStack = new Stack(stage, 'shop-app', { env: context.env });
        new s3.Bucket(applicationStack, 'Data');
        new logs.CfnLogGroup(applicationStack, 'Logs');
      },
    };

    try {
      process.chdir(cwd);
      buildPipelineApp(
        defineCICD({
          application: 'shop',
          repository: Repository.codecommit('shop'),
          stages: ['dev'],
        }),
        provider,
      );

      expect(appConfig).toMatchObject({ tags: { StageConfig: 'dev' }, logRetentionInDays: 14 });
      const template = Template.fromStack(applicationStack!);
      template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 14 });
      template.hasResourceProperties('AWS::S3::Bucket', {
        Tags: Match.arrayWith([{ Key: 'StageConfig', Value: 'dev' }]),
      });
    } finally {
      process.chdir(originalCwd);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('rejects APP_STAGING for self-mutating engines until the pinned alpha supports CDK Pipelines', () => {
    expect(() =>
      buildPipelineApp(
        defineCICD({
          application: 'shop',
          repository: Repository.codecommit('shop'),
          stages: ['dev'],
          synthesizer: { type: SynthesizerType.APP_STAGING },
        }),
        new StubProvider(),
      ),
    ).toThrow(/APP_STAGING is not supported by the CDK_PIPELINES or GITHUB_ACTIONS engines/);
  });
});

describe('self-mutating assembler: stage forced-role contract', () => {
  test('exports deploy, CFN execution, and ExternalId values for replay synthesis', () => {
    const cicd = defineCICD({
      application: 'shop',
      repository: Repository.codecommit('shop'),
      stages: [
        {
          name: 'prod',
          deployment: {
            deployRole: 'arn:aws:iam::222222222222:role/ForcedDeploy',
            cfnExecutionRole: 'arn:aws:iam::222222222222:role/ForcedCfn',
            externalId: 'prod-external',
          },
        },
      ],
    });
    expect(replayForcedRoleEnv(cicd, 'prod')).toEqual({
      CDK_CICD_DEPLOY_ROLE_ARN: 'arn:aws:iam::222222222222:role/ForcedDeploy',
      CDK_CICD_CFN_EXEC_ROLE_ARN: 'arn:aws:iam::222222222222:role/ForcedCfn',
      CDK_CICD_DEPLOY_ROLE_EXTERNAL_ID: 'prod-external',
    });
  });

  test('uses the pipeline ExternalId fallback only when a deployRole is configured', () => {
    const cicd = defineCICD({
      application: 'shop',
      repository: Repository.codecommit('shop'),
      deployRoleExternalId: 'pipeline-external',
      stages: [
        { name: 'dev', deployment: { deployRole: 'arn:dev' } },
        { name: 'qa', deployment: { cfnExecutionRole: 'arn:cfn' } },
      ],
    });
    expect(replayForcedRoleEnv(cicd, 'dev').CDK_CICD_DEPLOY_ROLE_EXTERNAL_ID).toBe('pipeline-external');
    expect(replayForcedRoleEnv(cicd, 'qa')).toEqual({ CDK_CICD_CFN_EXEC_ROLE_ARN: 'arn:cfn' });
  });

  test('fails explicitly if a direct assembler call receives an unresolved secret reference', () => {
    const cicd = defineCICD({
      application: 'shop',
      repository: Repository.codecommit('shop'),
      stages: [
        {
          name: 'prod',
          deployment: { deployRole: 'arn:prod', externalId: 'resolve:secretsmanager:prod-external' },
        },
      ],
    });
    expect(() => replayForcedRoleEnv(cicd, 'prod')).toThrow(/unresolved Secrets Manager externalId reference/);
  });
});

describe('CDK Pipelines assembler: pipelineStackName override', () => {
  const prev = { a: process.env.CDK_DEFAULT_ACCOUNT, r: process.env.CDK_DEFAULT_REGION };
  beforeEach(() => {
    process.env.CDK_DEFAULT_ACCOUNT = '111111111111';
    process.env.CDK_DEFAULT_REGION = 'us-east-1';
  });
  afterEach(() => {
    process.env.CDK_DEFAULT_ACCOUNT = prev.a;
    process.env.CDK_DEFAULT_REGION = prev.r;
  });

  function pinnedConfig() {
    return defineCICD({
      application: 'automation',
      pipelineStackName: 'automation',
      repository: Repository.codecommit('automation'),
      engine: EngineType.CDK_PIPELINES,
      stages: ['dev'],
    });
  }

  test('renders the pipeline stack with the overridden CloudFormation stackName', () => {
    const app = buildPipelineApp(pinnedConfig(), new StubProvider());
    // The construct id is unchanged (`${application}-pipeline`), so the stack is still found by it...
    const stack = app.node.findChild('automation-pipeline') as Stack;
    // ...but its CloudFormation stack name is the override.
    expect(stack.stackName).toBe('automation');
  });

  test('the construct id stays `${application}-pipeline`, so child logical IDs are unchanged', () => {
    const withOverride = buildPipelineApp(pinnedConfig(), new StubProvider());
    const withoutOverride = buildPipelineApp(
      defineCICD({
        application: 'automation',
        repository: Repository.codecommit('automation'),
        engine: EngineType.CDK_PIPELINES,
        stages: ['dev'],
      }),
      new StubProvider(),
    );
    // Same construct id both ways.
    const a = withOverride.node.findChild('automation-pipeline') as Stack;
    const b = withoutOverride.node.findChild('automation-pipeline') as Stack;
    // The pipeline role's logical id derives from the construct node path -- identical with and without
    // the stackName override (only the CFN stackName differs).
    const roleIds = (s: Stack) => Object.keys(Template.fromStack(s).findResources('AWS::IAM::Role')).sort();
    expect(roleIds(a)).toEqual(roleIds(b));
  });

  test('omitting pipelineStackName keeps the `${application}-pipeline` default', () => {
    const stack = buildPipelineApp(
      defineCICD({
        application: 'automation',
        repository: Repository.codecommit('automation'),
        engine: EngineType.CDK_PIPELINES,
        stages: ['dev'],
      }),
      new StubProvider(),
    ).node.findChild('automation-pipeline') as Stack;
    expect(stack.stackName).toBe('automation-pipeline');
  });
});

describe('self-mutating assembler: GITHUB_ACTIONS picks the GitHubActionsEngine', () => {
  const prev = { a: process.env.CDK_DEFAULT_ACCOUNT, r: process.env.CDK_DEFAULT_REGION };
  let workflowDir: string;
  beforeEach(() => {
    process.env.CDK_DEFAULT_ACCOUNT = '111111111111';
    process.env.CDK_DEFAULT_REGION = 'us-west-2';
    workflowDir = mkdtempSync(path.join(os.tmpdir(), 'cdk-cicd-github-actions-assembler-'));
  });
  afterEach(() => {
    process.env.CDK_DEFAULT_ACCOUNT = prev.a;
    process.env.CDK_DEFAULT_REGION = prev.r;
    rmSync(workflowDir, { recursive: true, force: true });
  });

  test('config.engine === GITHUB_ACTIONS renders a GitHubActionsEngine, not CdkPipelinesEngine', () => {
    const app = buildPipelineApp(
      defineCICD({
        application: 'shop',
        repository: Repository.github('org/shop'),
        stages: ['dev'],
        engine: EngineType.GITHUB_ACTIONS,
        githubActions: { workflowPath: path.join(workflowDir, '.github', 'workflows', 'deploy.yml') },
      }),
      new StubProvider(),
    );
    const stack = app.node.findChild('shop-pipeline') as Stack;
    expect(stack.node.tryFindChild('Cd')).toBeInstanceOf(GitHubActionsEngine);
    // No AWS-hosted CodePipeline: GitHub Actions renders a workflow file, not a CodePipeline resource.
    Template.fromStack(stack).resourceCountIs('AWS::CodePipeline::Pipeline', 0);
  });

  test('pipelineStackName overrides the CloudFormation stackName but not the construct id', () => {
    const app = buildPipelineApp(
      defineCICD({
        application: 'shop',
        pipelineStackName: 'shop',
        repository: Repository.github('org/shop'),
        stages: ['dev'],
        engine: EngineType.GITHUB_ACTIONS,
        githubActions: { workflowPath: path.join(workflowDir, '.github', 'workflows', 'deploy.yml') },
      }),
      new StubProvider(),
    );
    // Construct id preserved (the stable literal the workflow's self-mutation check compares)...
    const stack = app.node.findChild('shop-pipeline') as Stack;
    // ...while the CloudFormation stack name is the override.
    expect(stack.stackName).toBe('shop');
  });
});

// The faithful replay proof. Needs the COMPILED assembler (lib/) because it runs in a real node process;
// skip with a pointer when lib/ is absent, exactly as the bundled-diagnostic test does.
describe('CDK Pipelines assembler: real per-stage replay (subprocess)', () => {
  const runner = path.join(__dirname, 'fixtures', 'cdkp-runner.js');
  const compiled = path.join(__dirname, '..', '..', 'lib', 'runtime', 'pipeline-assembler.js');
  const maybe = existsSync(compiled) ? test : test.skip;

  maybe('replays the plain bin into each stage so every stage stack gets the bucket', () => {
    const out = execFileSync(process.execPath, [runner], {
      env: { ...process.env, CDK_DEFAULT_ACCOUNT: '111111111111', CDK_DEFAULT_REGION: 'us-east-1' },
      encoding: 'utf-8',
    });
    const line = out.split('\n').find((l) => l.startsWith('RESULT='));
    expect(line).toBeDefined();
    const result = JSON.parse(line!.slice('RESULT='.length)) as Array<{
      stage: string;
      buckets: number;
      bucketIds: string[];
      account?: string;
      assumeRoleArn?: string;
      cfnRoleArn?: string;
      assumeRoleExternalId?: string;
    }>;
    const byStage = Object.fromEntries(result.map((r) => [r.stage, r]));
    // Each replayed stage got exactly the plain bin's one bucket.
    expect(byStage.dev.buckets).toBe(1);
    expect(byStage.prod.buckets).toBe(1);
    // Per-stage env pinning took effect: prod's stack resolved to the prod account (222…), dev to the
    // ambient hub account (111…) -- so the replay set CDK_DEFAULT_ACCOUNT per stage, not once.
    expect(byStage.dev.account).toBe('111111111111');
    expect(byStage.prod.account).toBe('222222222222');
    expect(byStage.prod.assumeRoleArn).toBe('arn:aws:iam::222222222222:role/ForcedDeploy');
    expect(byStage.prod.cfnRoleArn).toBe('arn:aws:iam::222222222222:role/ForcedCfn');
    expect(byStage.prod.assumeRoleExternalId).toBe('prod-external');
    // CDK_STAGE was pinned per stage: the bucket logical id (Data-${CDK_STAGE}) differs across stages.
    expect(byStage.dev.bucketIds[0]).not.toEqual(byStage.prod.bucketIds[0]);
  });

  // Regression guard for the App.of crash: plain-bin.js emits a construct warning during replay
  // (addWarningV2 -> Acknowledgements.of -> App.of). If ReplayApp stops inheriting App's statics, the
  // subprocess above throws `App.of is not a function` and execFileSync rejects -- so the assertions
  // there already fail closed. This case makes the intent explicit and independent of bucket counts.
  maybe('replay survives an aws-cdk-lib warning that reaches App.of', () => {
    const out = execFileSync(process.execPath, [runner], {
      env: { ...process.env, CDK_DEFAULT_ACCOUNT: '111111111111', CDK_DEFAULT_REGION: 'us-east-1' },
      encoding: 'utf-8',
    });
    // The subprocess only reaches its RESULT= line if the warning path (App.of) did not throw.
    expect(out).toMatch(/^RESULT=/m);
    expect(out).not.toMatch(/App\.of is not a function/);
  });
});

// The App.of crash in isolation, without the compiled lib/ or a subprocess: it is a property of the
// ReplayApp stand-in the assembler builds. ReplayApp REPLACES the exported `App`, so aws-cdk-lib code
// that reads a static off `App` reads it off ReplayApp. `App.of` is the one that bites -- the synth-time
// warning path (Acknowledgements.of -> App.of) calls it. A bare class has no statics; setting App as its
// prototype makes them delegate. This reproduces both halves so the fix cannot silently regress.
describe('CDK Pipelines assembler: ReplayApp inherits App statics (App.of)', () => {
  test('a bare ReplayApp has no App.of; prototype-linked to App it delegates', () => {
    const parent = new App();
    const stage = new Stage(parent, 'dev');

    const Bare = class {
      public constructor() {
        return stage as unknown as object;
      }
    };
    // The bug: the replay stand-in without the fix.
    expect((Bare as unknown as { of?: unknown }).of).toBeUndefined();

    const Fixed = class {
      public constructor() {
        return stage as unknown as object;
      }
    };
    Object.setPrototypeOf(Fixed, App);
    // The fix: App's statics (App.of, App.isApp, …) delegate through the prototype.
    expect(typeof (Fixed as unknown as { of?: unknown }).of).toBe('function');
    expect((Fixed as unknown as typeof App).of).toBe(App.of);
    // Instance behaviour is unchanged -- constructing still yields the stage, not a real App.
    expect(new (Fixed as unknown as new () => object)()).toBe(stage);
  });

  // Pin the supported range explicitly. The App-export injection hook is documented (inject.ts) as
  // verified from aws-cdk-lib 2.195.0 upward -- that is the wrapper's declared peer floor
  // (`^2.195.0`), so this fix widens NOTHING below it; it repairs a crash WITHIN the range. This guard
  // fails loudly if the installed dev version drifts below the floor, or if a future aws-cdk-lib ever
  // drops the `App.of` static the fix relies on -- either would invalidate the compatibility claim.
  test('the installed aws-cdk-lib is within the declared peer range and exposes App.of', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installed: string = require('aws-cdk-lib/package.json').version;
    const [major, minor] = installed.split('.').map((n) => parseInt(n, 10));
    expect(major).toBe(2);
    expect(minor).toBeGreaterThanOrEqual(195); // the wrapper's declared peer floor
    expect(typeof (App as unknown as { of?: unknown }).of).toBe('function');
  });

  // The fix must hold for the versions the compatibility claim names, not just whatever single copy is
  // installed. We cannot install a second aws-cdk-lib in CI (offline), so model each version's `App`
  // shape: `App.of` is a static that has existed unchanged across this range, so a class exposing a
  // static `of` faithfully represents 2.250.0 and 2.255.0's App for the purpose of THIS mechanism.
  // Reproduces the crash (bare stand-in) and proves the fix (prototype-linked) against each shape.
  it.each([['2.250.0'], ['2.255.0']])('replay stand-in survives App.of for an aws-cdk-lib %s-shaped App', (version) => {
    // A version-representative App: a class whose only relevant surface is the static `App.of`.
    const marker = Symbol(version);
    const VersionedApp = class {
      public static of(_scope: unknown): symbol {
        return marker;
      }
    };

    // Without the fix: the bare replay stand-in that replaced the exported App has no `.of`, so the
    // synth warning path (Acknowledgements.of -> App.of) throws `App.of is not a function`.
    const Bare = class {};
    expect((Bare as unknown as { of?: unknown }).of).toBeUndefined();

    // With the fix: setPrototypeOf makes the stand-in delegate to this version's App.of.
    const Fixed = class {};
    Object.setPrototypeOf(Fixed, VersionedApp);
    const resolvedOf = (Fixed as unknown as { of: (s: unknown) => symbol }).of;
    expect(typeof resolvedOf).toBe('function');
    expect(resolvedOf(undefined)).toBe(marker); // delegates to the versioned App.of, does not throw
  });
});
