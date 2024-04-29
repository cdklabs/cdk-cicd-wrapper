// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { AwsSolutionsChecks } from 'cdk-nag';
import { PipelineStack } from './PipelineStack';
import { SandboxStack } from './SandboxStack';
import {
  DeploymentDefinition,
  Environment,
  IVanillaPipelineConfig as IPipelineConfig,
  NPMRegistryConfig,
  IPhaseCommand,
  PipelinePhases,
  Stage,
  GlobalResources,
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

const defaultRegion = process.env.AWS_REGION;

const defaultConfigs = {
  applicationName: process.env.npm_package_config_applicationName || '',
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
      PhaseCommands.NPM_CI,
      PhaseCommands.VALIDATE,
      PhaseCommands.CHECK_AUDIT,
      PhaseCommands.CHECK_LINT,
    ],
    [PipelinePhases.BUILD]: [PhaseCommands.BUILD],
    [PipelinePhases.TESTING]: [PhaseCommands.TEST, PhaseCommands.CDK_SYNTH],
  },
};

// Create Builder class for Pipeline Blueprint
export class PipelineBlueprintBuilder {
  private _id: string = defaultConfigs.applicationName || 'CiCdBlueprint';

  private stacksCommon: IStackProvider[] = [];

  private stageEnvironments: AllStage<Partial<Environment>> = {};

  private stacksByStage: AllStage<IStackProvider[]> = {};

  private _region?: string = defaultRegion;

  constructor(private props: IPipelineBlueprintProps = defaultConfigs) {
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

    if (process.env.NPM_BASIC_AUTH_SECRET_ID && process.env.NPM_REGISTRY) {
      this.npmRegistry({
        url: process.env.NPM_REGISTRY!,
        basicAuthSecretArn: process.env.NPM_BASIC_AUTH_SECRET_ID,
        scope: process.env.NPM_SCOPE,
      });
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
    this.props.resourceProviders![name] = provider;
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

  public sandbox(stackProvider: IStackProvider, stage: string = 'DEV') {
    this.props.sandbox = {
      stackProvider,
      stageToUse: stage,
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

    var stack: cdk.Stack;

    if (app.node.tryGetContext('sandbox')) {
      console.log('Sandbox');
      const sandboxEnv = this.props.deploymentDefinition[this.props.sandbox?.stageToUse!];
      if (!sandboxEnv) {
        throw new Error(`Sandbox stage ${this.props.sandbox?.stageToUse} not defined`);
      }

      stack = new SandboxStack(app, this._id, sandboxEnv.env, this.props as IPipelineBlueprintProps);
    } else {
      console.log('Pipeline');
      stack = new PipelineStack(app, this._id, this.props as IPipelineBlueprintProps);
    }

    cdk.Tags.of(app).add('Application', `${this.props.applicationName}`);

    cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: false }));

    return stack;
  }

  private generateDeploymentDefinitions(): RequiredRESStage<DeploymentDefinition> {
    const definitions: AllStage<DeploymentDefinition> = {};

    Object.entries(this.stageEnvironments).forEach(([stage, environment]) => {
      definitions[stage] = {
        env: {
          account: environment.account!,
          region: environment.region || this._region!,
        },
        stacksProviders: [...(stage != Stage.RES ? this.stacksCommon : []), ...(this.stacksByStage[stage] || [])],
      };
    });

    if (!definitions.RES) {
      throw new Error('At least RES stage is required');
    }

    return definitions as RequiredRESStage<DeploymentDefinition>;
  }
}

export interface IPipelineBlueprintProps extends IPipelineConfig {
  /**
   * Named resource providers to leverage for cluster resources.
   * The resource can represent Vpc, Hosting Zones or other resources, see {@link spi.ResourceType}.
   * VPC for the cluster can be registered under the name of 'vpc' or as a single provider of type
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resourceProviders: { [key in string]: IResourceProvider };
}

export class PipelineBlueprint {
  public static builder(): PipelineBlueprintBuilder {
    return new PipelineBlueprintBuilder();
  }
}
