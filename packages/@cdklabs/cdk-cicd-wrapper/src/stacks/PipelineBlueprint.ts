// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { AwsSolutionsChecks } from 'cdk-nag';
import { PipelineStack } from './PipelineStack';
import { WorkbenchStack } from './WorkbenchStack';
import {
  DeploymentDefinition,
  IPipelineConfig,
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
import { HookProvider } from '../resource-providers';
import { CodeBuildFactoryProvider } from '../resource-providers/CodeBuildFactoryProvider';
import { ComplianceBucketProvider } from '../resource-providers/ComplianceBucketProvider';
import { DisabledProvider } from '../resource-providers/DisabledProvider';
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
 * Validates the environment variables and default configurations.
 * Throws an error if any validation fails.
 */
function validateConfig(props: IPipelineBlueprintProps, stageDefinitions: AllStage<Partial<IStageDefinition>>, region: string) {
  const envVars = [
    { name: 'AWS_REGION', pattern: /^[a-z]{2}-[a-z]+-\d{1}$/, errorMessage: 'Invalid AWS region format' },
    { name: 'ACCOUNT_RES', pattern: /^\d{12}$/, errorMessage: 'Invalid RES account number format' },
    { name: 'RES_ACCOUNT_AWS_PROFILE', pattern: /^[a-zA-Z0-9-_]+$/, errorMessage: 'Invalid AWS profile name format' },
    { name: 'ACCOUNT_DEV', pattern: /^\d{12}$/, errorMessage: 'Invalid DEV account number format' },
    { name: 'DEV_ACCOUNT_AWS_PROFILE', pattern: /^[a-zA-Z0-9-_]+$/, errorMessage: 'Invalid AWS profile name format' },
    { name: 'ACCOUNT_INT', pattern: /^\d{12}$/, errorMessage: 'Invalid INT account number format' },
    { name: 'INT_ACCOUNT_AWS_PROFILE', pattern: /^[a-zA-Z0-9-_]+$/, errorMessage: 'Invalid AWS profile name format' },
    { name: 'PROXY_SECRET_ARN', pattern: /^arn:aws:[a-z-]+:[a-z0-9-]+:\d{12}:secret\/[a-zA-Z0-9-_]+$/, errorMessage: 'Invalid ARN format' },
  ];

  envVars.forEach((envVar) => {
    const value = process.env[envVar.name];
    if (value && !envVar.pattern.test(value)) {
      throw new Error(`Environment variable ${envVar.name} is invalid: ${envVar.errorMessage}`);
    }
  });

  if (!props.applicationName) {
    throw new Error('Application name is required');
  }

  if (!props.applicationQualifier) {
    throw new Error('Application qualifier is required');
  } else if (!/^[a-zA-Z0-9-_]+$/.test(props.applicationQualifier)) {
    throw new Error('Invalid application qualifier format');
  }

  if (!region) {
    throw new Error('AWS region is required');
  } else if (!/^[a-z]{2}-[a-z]+-\d{1}$/.test(region)) {
    throw new Error('Invalid AWS region format');
  }

  if (!stageDefinitions.RES) {
    throw new Error('At least RES stage is required');
  }

  Object.entries(stageDefinitions).forEach(([stage, providedDefinition]) => {
    if (!providedDefinition.account) {
      throw new Error(`Stage ${stage} does not have an associated account.`);
    } else if (!/^\d{12}$/.test(providedDefinition.account)) {
      throw new Error(`Invalid account number format for stage ${stage}`);
    }
    if (providedDefinition.region && !/^[a-z]{2}-[a-z]+-\d{1}$/.test(providedDefinition.region)) {
      throw new Error(`Invalid AWS region format for stage ${stage}`);
    }
  });
}

/**
 * Class for building a Pipeline Blueprint.
 */
export class PipelineBlueprintBuilder {
  private _id?: string;

  private stacksCommon: IStackProvider[] = [];

  private stageDefinitions: AllStage<Partial<IStageDefinition>> = {};

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
    this.resourceProvider(GlobalResources.COMPLIANCE_BUCKET, new ComplianceBucketProvider());
    this.resourceProvider(GlobalResources.PHASE, new PhaseCommandProvider());
    this.resourceProvider(GlobalResources.HOOK, new HookProvider());

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

  public disable(name: string): this {
    this.props.resourceProviders![name] = new DisabledProvider(name);

    return this;
  }

  /**
   * Defines the stages for the Pipeline Blueprint.
   * @param stageDefinition An array of stage definitions or stage names.
   * @returns This PipelineBlueprintBuilder instance.
   */
  public defineStages(stageDefinition: (IStageDefinition | string)[]) {
    this.stageDefinitions = {};
    stageDefinition.forEach((stageDef) => {
      if (typeof stageDef === 'string') {
        const account = process.env[`ACCOUNT_${stageDef}`];

        if (account) {
          this.addStage({
            stage: stageDef,
            account: account,
          });
        }
      } else {
        const account = stageDef.account || process.env[`ACCOUNT_${stageDef.stage}`];

        if (account) {
          this.addStage({ ...stageDef, account });
        } else {
          throw Error(`Stage ${stageDef.stage} does not have an associated account.`);
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
  private addStage(stage: IStageDefinition) {
    this.stageDefinitions[stage.stage] = stage;
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

    // Validate the entire configuration
    validateConfig(this.props, this.stageDefinitions, this._region!);

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

    Object.entries(this.stageDefinitions).forEach(([stage, providedDefinition]) => {
      const region = providedDefinition.region || this._region!;
      const account = providedDefinition.account!;

      definitions[stage] = {
        env: {
          account,
          region,
        },
        stacksProviders: [...(stage != Stage.RES ? this.stacksCommon : []), ...(this.stacksByStage[stage] || [])],
        manualApprovalRequired:
          providedDefinition.manualApprovalRequired ?? !(stage === Stage.DEV || stage === Stage.RES),
        complianceLogBucketName: this.generateComplianceLogBucketName(providedDefinition, account, region),
        vpc: providedDefinition.vpc,
      };
    });

    if (!definitions.RES) {
      throw new Error('At least RES stage is required');
    }

    return definitions as RequiredRESStage<DeploymentDefinition>;
  }

  private generateComplianceLogBucketName(
    providedDefinition: Partial<IStageDefinition>,
    account: string,
    region: string,
  ) {
    if (this.props.resourceProviders![GlobalResources.COMPLIANCE_BUCKET] instanceof DisabledProvider) {
      return undefined;
    }

    return providedDefinition.complianceLogBucketName ?? `compliance-log-${account}-${region}`;
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
