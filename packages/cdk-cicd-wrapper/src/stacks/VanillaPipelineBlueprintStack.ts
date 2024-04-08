// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Construct } from 'constructs';
import { PostDeployBuildStep, PreDeployBuildStep } from '../code-pipeline';
import {
  DeploymentDefinition,
  Environment,
  IVanillaPipelineConfig,
  NPMRegistryConfig,
  IPhaseCommand,
  PipelinePhases,
  Stage,
  GlobalResources,
  ResourceContext,
  IResourceProvider,
  CodeGuruSeverityThreshold,
  IStackProvider,
  IStageDefinition,
  AllStage,
  RequiredRESStage,
} from '../common';
import { CodeBuildFactoryProvider } from '../resource-providers/CodeBuildFactoryProvider';
import { ComplianceBucketConfigProvider } from '../resource-providers/ComplianceBucketProvider';
import { EncryptionProvider } from '../resource-providers/EncryptionProvider';
import { ParameterProvider } from '../resource-providers/ParameterProvider';
import { PhaseCommandProvider, PhaseCommands } from '../resource-providers/PhaseCommandProvider';
import { PipelineProvider } from '../resource-providers/PipelineProvider';
import { HttpProxyProvider, IProxyConfig } from '../resource-providers/ProxyProvider';
import { BasicRepositoryProvider, RepositoryProvider } from '../resource-providers/RepositoryProvider';
import { StageProvider } from '../resource-providers/StageProvider';
import { VPCProvider } from '../resource-providers/VPCProvider';
import { SecurityControls } from '../utils';

const defaultRegion = process.env.AWS_REGION;

const defaultConfigs = {
  applicationName: process.env.npm_package_config_applicationName || '',
  npmBasicAuthSecretArn: process.env.npm_basic_auth_secret_arn || '',
  applicationQualifier: process.env.npm_package_config_cdkQualifier || 'hnb659fds',
  region: defaultRegion,
  logRetentionInDays: '365',
  codeBuildEnvSettings: {
    privileged: true,
    buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
  },
  resourceProviders: {},
  deploymentDefinition: {},
  primaryOutputDirectory: './cdk.out',
  phases: {
    [PipelinePhases.INITIALIZE]: [
      PhaseCommands.CONFIGURE_HTTP_PROXY,
      PhaseCommands.ENVIRONMENT_PREPARATION,
      PhaseCommands.NPM_LOGIN,
    ],
    [PipelinePhases.PRE_BUILD]: [
      PhaseCommands.VALIDATE,
      PhaseCommands.CHECK_AUDIT,
      PhaseCommands.NPM_CI,
      PhaseCommands.CHECK_LINT,
    ],
    [PipelinePhases.BUILD]: [PhaseCommands.BUILD],
    [PipelinePhases.TESTING]: [PhaseCommands.TEST, PhaseCommands.CDK_SYNTH],
  },
};

// Create Builder class for Pipeline Blueprint
export class VanillaPipelineBlueprintBuilder {
  private _id: string = defaultConfigs.applicationName || 'VanillaPipelineBlueprint';

  private stacksCommon: IStackProvider[] = [];

  private stageEnvironments: AllStage<Partial<Environment>> = {};

  private stacksByStage: AllStage<IStackProvider[]> = {};

  private _region?: string = defaultRegion;

  constructor(private props: IVanillaPipelineBlueprintProps = defaultConfigs) {
    this.repositoryProvider(new BasicRepositoryProvider());
    this.resourceProvider(GlobalResources.PARAMETER_STORE, new ParameterProvider());
    this.resourceProvider(GlobalResources.ENCRYPTION, new EncryptionProvider());
    this.resourceProvider(GlobalResources.VPC, new VPCProvider());
    this.resourceProvider(GlobalResources.STAGE_PROVIDER, new StageProvider());
    this.resourceProvider(GlobalResources.CODEBUILD_FACTORY, new CodeBuildFactoryProvider());
    this.resourceProvider(GlobalResources.PIPELINE, new PipelineProvider());
    this.resourceProvider(GlobalResources.COMPLIANCE_BUCKET, new ComplianceBucketConfigProvider());
    this.resourceProvider(GlobalResources.PHASE, new PhaseCommandProvider());

    this.defineStages([Stage.RES, Stage.DEV, Stage.INT]);

    // Backward compatibility to use proxy if PROXY_SECRET_ARN is present
    if (process.env.PROXY_SECRET_ARN) {
      this.proxy();
    }
  }

  public id(id: string) {
    this._id = id;
    return this;
  }

  public applicationName(applicationName: string) {
    this.props.applicationName = applicationName;
    return this;
  }

  public npmRegistry(npmRegistry: NPMRegistryConfig) {
    this.props.npmRegistry = npmRegistry;
    return this;
  }

  public proxy(proxy?: IProxyConfig) {
    this.resourceProvider(GlobalResources.PROXY, new HttpProxyProvider(proxy));
    return this;
  }

  public applicationQualifier(applicationQualifier: string) {
    this.props.applicationQualifier = applicationQualifier;
    return this;
  }

  public region(region: string) {
    this._region = region;
    return this;
  }

  public logRetentionInDays(logRetentionInDays: string) {
    this.props.logRetentionInDays = logRetentionInDays;
    return this;
  }

  public codeBuildEnvSettings(codeBuildEnvSettings: codebuild.BuildEnvironment) {
    this.props.codeBuildEnvSettings = codeBuildEnvSettings;
    return this;
  }

  public codeGuruScanThreshold(codeGuruScanThreshold: CodeGuruSeverityThreshold) {
    this.props.codeGuruScanThreshold = codeGuruScanThreshold;
    return this;
  }

  public repositoryProvider(repositoryProvider: RepositoryProvider) {
    return this.resourceProvider(GlobalResources.REPOSITORY, repositoryProvider);
  }

  public resourceProvider(name: string, provider: IResourceProvider): this {
    this.props.resourceProviders![(name)] = provider;
    return this;
  }

  public defineStages(stageDefinition: (IStageDefinition | string)[]) {
    stageDefinition.forEach((stageDef) => {
      if (typeof stageDef === 'string') {
        const account = process.env[`ACCOUNT_${stageDef}`];

        if (account) {
          this.addStage(stageDef, account);
        }
      } else {
        const account = stageDef.account || process.env[`ACCOUNT_${stageDef.stage}`];

        if (account) {
          this.addStage(stageDef.stage, account, stageDef.region);
        }
      }
    });

    return this;
  }

  private addStage(stage: string, account: string, region?: string) {
    this.stageEnvironments[stage] = {
      account,
      region,
    };
    return this;
  }

  public addStack(stackProvider: IStackProvider, ...stages: string[]) {
    if (stages.length == 0) {
      this.stacksCommon.push(stackProvider);
    } else {
      stages.forEach((stage) => {
        if (!this.stacksByStage[stage]) {
          this.stacksByStage[stage] = [];
        }

        this.stacksByStage[stage].push(stackProvider);
      });
    }

    return this;
  }

  public definePhase(phase: PipelinePhases, commandsToExecute: IPhaseCommand[]) {
    this.props.phases![phase] = commandsToExecute;
    return this;
  }

  public synth(app: cdk.App) {
    this.props.deploymentDefinition = this.generateDeploymentDefinitions();

    const vanillaPipelineBlueprint = new VanillaPipelineBlueprint(
      app,
      this._id,
      this.props as IVanillaPipelineBlueprintProps,
    );

    cdk.Tags.of(app).add('Application', `${this.props.applicationName}`);

    cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: false }));

    return vanillaPipelineBlueprint;
  }

  private generateDeploymentDefinitions(): RequiredRESStage<DeploymentDefinition> {
    const definitions: AllStage<DeploymentDefinition> = {};

    Object.entries(this.stageEnvironments).forEach(([stage, environment]) => {
      definitions[stage] = {
        env: {
          account: environment.account!,
          region: environment.region || this._region!,
        },
        stacksProviders: [
          ...(stage != Stage.RES ? this.stacksCommon : []),
          ...(this.stacksByStage[stage] || []),
        ],
      };
    });

    if (!definitions.RES) {
      throw new Error('At least RES stage is required');
    }

    return definitions as RequiredRESStage<DeploymentDefinition>;
  }
}

export interface IVanillaPipelineBlueprintProps extends IVanillaPipelineConfig {
  /**
   * Named resource providers to leverage for cluster resources.
   * The resource can represent Vpc, Hosting Zones or other resources, see {@link spi.ResourceType}.
   * VPC for the cluster can be registered under the name of 'vpc' or as a single provider of type
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resourceProviders: { [key in string]: IResourceProvider };
}

export class VanillaPipelineBlueprint extends cdk.Stack {

  public static builder(): VanillaPipelineBlueprintBuilder {
    return new VanillaPipelineBlueprintBuilder();
  }

  constructor(
    scope: Construct,
    id: string,
    readonly config: IVanillaPipelineBlueprintProps,
  ) {
    super(scope, id, { env: config.deploymentDefinition.RES.env });

    const resourceContext = new ResourceContext(scope, this, config);

    resourceContext.initStage(Stage.RES);

    resourceContext.get(GlobalResources.REPOSITORY);
    resourceContext.get(GlobalResources.PARAMETER_STORE);
    resourceContext.get(GlobalResources.ENCRYPTION);
    resourceContext.get(GlobalResources.VPC);
    const pipeline = resourceContext.get(GlobalResources.PIPELINE)!;

    cdk.Aspects.of(scope).add(
      new SecurityControls(
        resourceContext.get(GlobalResources.ENCRYPTION)!.kmsKey,
        Stage.RES,
        config.logRetentionInDays,
        resourceContext.get(GlobalResources.COMPLIANCE_BUCKET)!.bucketName,
      ),
    );

    Object.entries(config.deploymentDefinition).forEach(([deploymentStage, deploymentDefinition]) => {
      this.renderStage(resourceContext, pipeline, deploymentStage, deploymentDefinition);
    });

    pipeline.buildPipeline();
  }

  private renderStage(
    resourceContext: ResourceContext,
    pipeline: pipelines.CodePipeline,
    stage: string,
    deploymentDefinition: DeploymentDefinition,
  ) {
    const deploymentEnvironment = deploymentDefinition.env;

    if (stage == Stage.RES) {
      // Allow to define additional stacks for RES stage
      deploymentDefinition.stacksProviders.forEach((stackProvider) => stackProvider.provide(resourceContext));
      return;
    }

    if (deploymentEnvironment.account == '-') return;

    const phaseDefinition = resourceContext.get(GlobalResources.PHASE)!;
    resourceContext.initStage(stage);
    const preDeployStep = new PreDeployBuildStep(stage, {
      env: {
        TARGET_REGION: deploymentEnvironment.region,
      },
      commands: phaseDefinition.getCommands(PipelinePhases.PRE_DEPLOY),
    });

    const appStage = resourceContext.get(GlobalResources.STAGE_PROVIDER)!;

    resourceContext._scoped(appStage, () => {
      deploymentDefinition.stacksProviders.forEach((stackProvider) => stackProvider.provide(resourceContext));
    });

    pipeline.addStage(appStage, {
      pre: [
        preDeployStep,
        // add manual approval step for all stages, except DEV
        ...(stage != Stage.DEV ? [preDeployStep.appendManualApprovalStep()] : []),
      ],
      post: [
        new PostDeployBuildStep(
          stage,
          {
            env: {
              ACCOUNT_ID: deploymentEnvironment.account,
              TARGET_REGION: deploymentEnvironment.region,
            },
            commands: phaseDefinition.getCommands(PipelinePhases.POST_DEPLOY),
          },
          resourceContext.blueprintProps.applicationName,
          resourceContext.blueprintProps.logRetentionInDays,
          appStage.logRetentionRoleArn,
        ),
      ],
    });
  }
}
