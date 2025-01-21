// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Component, javascript } from 'projen';

/**
 * Options interface for the CDKCommands component.
 */
export interface CDKCommandsOptions {
  /**
   * Whether to use environment variables from a .env file.
   * @default false
   */
  dotenv?: boolean;

  /**
   * List of stages to include in the deployment.
   * @default ['DEV', 'INT']
   */
  stages?: string[];

  /**
   * Whether to enable workbench mode.
   * @default true
   */
  workbench?: boolean;

  /**
   * The stage to use for workbench mode.
   * @default 'DEV'
   */
  workbenchStage?: string;

  /**
   * The CDK qualifier to use for deployment.
   */
  cdkQualifier: string;
}

/**
 * A component that manages CDK commands for a project.
 */
export class CDKCommands extends Component {
  /**
   * Whether to use environment variables from a .env file.
   */
  readonly dotenv: boolean;

  /**
   * Whether to enable workbench mode.
   */
  readonly workbench: boolean;

  /**
   * The stage to use for workbench mode.
   */
  readonly workbenchStage: string;

  /**
   * The CDK qualifier to use for deployment.
   */
  readonly cdkQualifier: string;

  /**
   * List of stages to include in the deployment.
   */
  readonly stages: string[];

  constructor(project: javascript.NodeProject, options: CDKCommandsOptions) {
    super(project);

    this.dotenv = options.dotenv ?? false;
    this.workbench = options.workbench ?? true;
    this.workbenchStage = options.workbenchStage ?? 'DEV';
    this.cdkQualifier = options.cdkQualifier;
    this.stages = options.stages ?? ['DEV', 'INT'];

    if (!options.dotenv) {
      if (this.workbench) {
        project
          .addTask('workbench')
          .spawn(project.tasks.tryFind('deploy')!, { receiveArgs: true, args: ['-c', 'workbench=true'] });

        const synthTask = project.tasks.tryFind('synth')!;
        synthTask.reset('cdk synth', { receiveArgs: true });

        project.addTask('workbench:synth').spawn(synthTask, { receiveArgs: true, args: ['-c', 'workbench=true'] });

        project
          .addTask('workbench:destroy')
          .spawn(project.tasks.tryFind('destroy')!, { receiveArgs: true, args: ['-c', 'workbench=true'] });
      }

      project.addTask('cdkls').exec('cdk ls', { receiveArgs: true });
    } else {
      project.addDevDeps('cross-env', 'dotenv-cli');

      // Manage CDK tasks - Ensure env variables are read from .env file
      const deployTask = project.tasks.tryFind('deploy')!;
      deployTask.reset('dotenv -- npm run _deploy', { receiveArgs: true });
      project
        .addTask('_deploy')
        .exec('cross-env cdk deploy --all --profile $RES_ACCOUNT_AWS_PROFILE', { receiveArgs: true });

      project.addTask('workbench').exec('dotenv -- npm run _workbench', { receiveArgs: true });
      project
        .addTask('_workbench')
        .exec(`cross-env cdk deploy --profile $${this.workbenchStage}_ACCOUNT_AWS_PROFILE -c "workbench=true"`, {
          receiveArgs: true,
        });

        project.addTask('workbenchAll').exec('dotenv -- npm run _workbench', { receiveArgs: true });
        project
          .addTask('_workbenchAll')
          .exec(`cross-env cdk deploy --all --profile $${this.workbenchStage}_ACCOUNT_AWS_PROFILE -c "workbench=true"`, {
            receiveArgs: true,
          });

      project.addTask('workbench:synth').exec('dotenv -- npm run _workbench:synth', { receiveArgs: true });
      project
        .addTask('_workbench:synth')
        .exec(`cross-env cdk synth --profile $${this.workbenchStage}_ACCOUNT_AWS_PROFILE -c "workbench=true"`, {
          receiveArgs: true,
        });

      project.addTask('workbench:destroy').exec('dotenv -- npm run _workbench:destroy', { receiveArgs: true });
      project
        .addTask('_workbench:destroy')
        .exec(`cross-env cdk destroy --all --profile $${this.workbenchStage}_ACCOUNT_AWS_PROFILE -c "workbench=true"`, {
          receiveArgs: true,
        });

      project
        .addTask('bootstrap', {
          description: 'Command to bootstrap your account',
          condition: '[ ! -n "$CI" ]',
        })
        .exec('dotenv -- npm run _bootstrap:$@', { receiveArgs: true });

      const bootstrapResTask = project.addTask('_bootstrap:RES', {
        description: 'Command to bootstrap your RES account',
        condition: '[ ! -n "$CI" ]',
      });
      bootstrapResTask.say('Bootstrapping your RES account...');
      bootstrapResTask.exec(
        'cross-env cdk bootstrap --profile $RES_ACCOUNT_AWS_PROFILE --qualifier $CDK_QUALIFIER\
        aws://${ACCOUNT_RES}/${AWS_REGION}',
        {
          receiveArgs: false,
          env: { CDK_QUALIFIER: this.cdkQualifier },
        },
      );

      this.stages.forEach((stage) => {
        const stageBootstrapTask = project.addTask(`_bootstrap:${stage}`, {
          description: `Command to bootstrap your ${stage} account`,
          condition: '[ ! -n "$CI" ]',
        });
        stageBootstrapTask.say(`Bootstrapping your ${stage} account...`);
        stageBootstrapTask.exec(
          `cross-env cdk bootstrap --profile $${stage}_ACCOUNT_AWS_PROFILE --qualifier $CDK_QUALIFIER \
          --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
          --trust \${ACCOUNT_RES} aws://\${ACCOUNT_${stage}}/\${AWS_REGION}`,
          {
            receiveArgs: false,
            env: { CDK_QUALIFIER: this.cdkQualifier },
          },
        );
      });

      const cdklsTask = project.addTask('cdkls');
      cdklsTask.exec('dotenv -- cross-env cdk ls');

      project.tasks.tryFind('destroy')?.reset('dotenv -- npm run _destroy', { receiveArgs: true });
      project
        .addTask('_destroy')
        .exec('cross-env cdk destroy --all --profile $RES_ACCOUNT_AWS_PROFILE', { receiveArgs: true });
      project.tasks.tryFind('synth')?.reset('dotenv -- npm run _synth', { receiveArgs: true });
      project.addTask('_synth').exec('cross-env cdk synth --profile $RES_ACCOUNT_AWS_PROFILE', { receiveArgs: true });
      project.tasks.tryFind('diff')?.reset('dotenv -- npm run _diff', { receiveArgs: true });
      project.addTask('_diff').exec('cross-env cdk diff --profile $RES_ACCOUNT_AWS_PROFILE', { receiveArgs: true });

      const infoTask = project.addTask('info', {});
      infoTask.say('Information:');
      infoTask.exec('cross-env echo "AWS Region : $(dotenv -p AWS_REGION)"');
      infoTask.exec('cross-env echo "RES Account: $(dotenv -p ACCOUNT_RES)"');
      infoTask.exec('cross-env echo "AWS Profile: $(dotenv -p RES_ACCOUNT_AWS_PROFILE)"');
      infoTask.exec('cross-env echo "Workbench stage": $WORKBENCH_STAGE');
      infoTask.exec('cross-env echo "Workbench profile": $WORKBENCH_AWS_PROFILE');
      infoTask.exec('cross-env echo "CDK Qualifier: ${CDK_QUALIFIER}"', {
        env: { CDK_QUALIFIER: this.cdkQualifier },
      });
      infoTask.say('Accounts:');

      this.stages.forEach((stage) => {
        infoTask.exec(
          'cross-env echo "  - ${stage}: $(dotenv -p ACCOUNT_${stage}) -- profile: $(dotenv -p ${stage}_ACCOUNT_AWS_PROFILE)"',
          {
            env: { stage },
          },
        );
      });
      infoTask.spawn(cdklsTask);
    }
  }
}
