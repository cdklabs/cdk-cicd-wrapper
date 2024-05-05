// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { AwsSolutionsChecks } from 'cdk-nag';
import { PipelineStack } from './PipelineStack';
import { WorkbenchStack } from './WorkbenchStack';
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
  WorkbenchOptions,
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

/**
 * Default configuration for the Pipeline Blueprint.
 */
const defaultConfigs = {
  applicationName: process.env.npm_package_config_applicationName || process.env.npm_package_name || '',
  applicationQualifier: process.env.npm_package_config_cdkQualifier || 'hnb659fds',
  region: defaultRegion,
  logRetentionInDays: '365',
  codeBuildEnvSettings: {
    privileged: false,
    buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
  },
  resourceProviders: {},
  deploymentDefinition: {},
  primaryOutputDirectory: './cdk.out',
  workbenchPrefix: process.env.USER || 'workbench',
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

/**
 * Class for building a Pipeline Blueprint.
 */
export class PipelineBlueprintBuilder {
  private _id?: string;

  private stacksCommon: IStackProvider[] = [];

  private stageEnvironments: AllStage<Partial<Environment>> = {};

  private stacksByStage: AllStage<IStackProvider[]> = {};

  private _region?: string = defaultRegion;

  /**
   * Constructor for the PipelineBlueprintBuilder class.
   * @param props The configuration properties for the Pipeline Blueprint. Defaults to the `defaultConfigs` object.
   */
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

  /**
   * Sets the ID for the Pipeline Blueprint.
   * @param id The ID to set.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public id(id: string) {
    this._id = id;
    return this;
  }

  /**
   * Sets the application name for the Pipeline Blueprint.
   * @param applicationName The application name to set.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public applicationName(applicationName: string) {
    this.props.applicationName = applicationName;
    return this;
  }

  /**
   * Sets the NPM registry configuration for the Pipeline Blueprint.
   * @param npmRegistry The NPM registry configuration to set.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public npmRegistry(npmRegistry: NPMRegistryConfig) {
    this.props.npmRegistry = npmRegistry;
    return this;
  }

  /**
   * Sets the proxy configuration for the Pipeline Blueprint.
   * @param proxy The proxy configuration to set. If not provided, a default proxy configuration will be used.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public proxy(proxy?: IProxyConfig) {
    this.resourceProvider(GlobalResources.PROXY, new HttpProxyProvider(proxy));
    return this;
  }

  /**
   * Sets the application qualifier for the Pipeline Blueprint.
   * @param applicationQualifier The application qualifier to set.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public applicationQualifier(applicationQualifier: string) {
    this.props.applicationQualifier = applicationQualifier;
    return this;
  }

  /**
   * Sets the AWS region for the Pipeline Blueprint.
   * @param region The AWS region to set.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public region(region: string) {
    this._region = region;
    return this;
  }

  /**
   * Sets the log retention period in days for the Pipeline Blueprint.
   * @param logRetentionInDays The log retention period in days to set.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public logRetentionInDays(logRetentionInDays: string) {
    this.props.logRetentionInDays = logRetentionInDays;
    return this;
  }

  /**
   * Sets the CodeBuild environment settings for the Pipeline Blueprint.
   * @param codeBuildEnvSettings The CodeBuild environment settings to set.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public codeBuildEnvSettings(codeBuildEnvSettings: codebuild.BuildEnvironment) {
    this.props.codeBuildEnvSettings = codeBuildEnvSettings;
    return this;
  }

  /**
   * Sets the Amazon CodeGuru Reviewer severity threshold for the Pipeline Blueprint.
   * @param codeGuruScanThreshold The Amazon CodeGuru Reviewer severity threshold to set.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public codeGuruScanThreshold(codeGuruScanThreshold: CodeGuruSeverityThreshold) {
    this.props.codeGuruScanThreshold = codeGuruScanThreshold;
    return this;
  }

  /**
   * Sets the repository provider for the Pipeline Blueprint.
   * @param repositoryProvider The repository provider to set.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public repositoryProvider(repositoryProvider: RepositoryProvider) {
    return this.resourceProvider(GlobalResources.REPOSITORY, repositoryProvider);
  }

  /**
   * Sets a resource provider for the Pipeline Blueprint.
   * @param name The name of the resource provider.
   * @param provider The resource provider to set.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public resourceProvider(name: string, provider: IResourceProvider): this {
    this.props.resourceProviders![name] = provider;
    return this;
  }

  /**
   * Defines the stages for the Pipeline Blueprint.
   * @param stageDefinition An array of stage definitions or stage names.
   * @returns This PipelineBlueprintBuilder instance.
   */
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

  /**
   * Adds a stage to the Pipeline Blueprint.
   * @param stage The name of the stage to add.
   * @param account The AWS account ID for the stage.
   * @param region The AWS region for the stage.
   * @returns This PipelineBlueprintBuilder instance.
   */
  private addStage(stage: string, account: string, region?: string) {
    this.stageEnvironments[stage] = {
      account,
      region,
    };
    return this;
  }

  /**
   * Sets up a workbench environment for the Pipeline Blueprint.
   * @param stackProvider The stack provider for the workbench environment.
   * @param option Optional workbench options.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public workbench(stackProvider: IStackProvider, option?: WorkbenchOptions) {
    this.props.workbench = {
      stackProvider,
      options: { workbenchPrefix: process.env.USER || 'sbx', stageToUse: 'DEV', ...option },
    };

    return this;
  }

  /**
   * Adds a stack to the Pipeline Blueprint.
   * @param stackProvider The stack provider to add.
   * @param stages The stages to which the stack should be added.
   * @returns This PipelineBlueprintBuilder instance.
   */
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

  /**
   * Defines a phase for the Pipeline Blueprint.
   * @param phase The phase to define.
   * @param commandsToExecute The commands to execute during the phase.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public definePhase(phase: PipelinePhases, commandsToExecute: IPhaseCommand[]) {
    this.props.phases![phase] = commandsToExecute;
    return this;
  }

  /**
   * Synthesizes the Pipeline Blueprint and creates the necessary stacks.
   * @param app The CDK app instance.
   * @returns The created stack.
   */
  public synth(app: cdk.App) {
    this.props.deploymentDefinition = this.generateDeploymentDefinitions();

    let stack: cdk.Stack;

    const id = this._id || this.props.applicationName || 'CiCdBlueprint';

    if (app.node.tryGetContext('workbench')) {
      const workbenchEnv = this.props.deploymentDefinition[this.props.workbench?.options.stageToUse!];
      if (!workbenchEnv) {
        throw new Error(`Workbench stage ${this.props.workbench?.options.stageToUse} not defined`);
      }

      this.props.applicationName = `${this.props.workbench?.options.workbenchPrefix}-${this.props.applicationName}`;

      stack = new WorkbenchStack(
        app,
        `${this.props.workbench?.options.workbenchPrefix}-${id}`,
        workbenchEnv.env,
        this.props as IPipelineBlueprintProps,
      );
    } else {
      stack = new PipelineStack(app, id, this.props as IPipelineBlueprintProps);
    }

    cdk.Tags.of(app).add('Application', `${this.props.applicationName}`);

    cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: false }));

    return stack;
  }

  /**
   * Generates the deployment definitions for the Pipeline Blueprint.
   * @returns The deployment definitions.
   */
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

/**
 * Interface for Pipeline Blueprint configuration properties.
 */
export interface IPipelineBlueprintProps extends IPipelineConfig {
  /**
   * Named resource providers to leverage for cluster resources.
   * The resource can represent Vpc, Hosting Zones or other resources, see {@link spi.ResourceType}.
   * VPC for the cluster can be registered under the name of 'vpc' or as a single provider of type
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resourceProviders: { [key in string]: IResourceProvider };
}

/**
 * Class for creating a Pipeline Blueprint.
 */
export class PipelineBlueprint {
  /**
   * Creates a new PipelineBlueprintBuilder instance.
   * @returns A PipelineBlueprintBuilder instance.
   */
  public static builder(): PipelineBlueprintBuilder {
    return new PipelineBlueprintBuilder();
  }
}
