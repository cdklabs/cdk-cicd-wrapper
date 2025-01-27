// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import * as pipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as nag from 'cdk-nag';
import { Construct } from 'constructs';

export interface S3RepositoryConstructProps {
  /**
   * The name of the S3 bucket.
   */
  readonly bucketName: string;

  /**
   * The branch of the repository.
   */
  readonly branch?: string;

  /**
   * The prefix of the S3 bucket.
   */
  readonly prefix?: string;

  /**
   * The encryption key for the S3 bucket.
   */
  readonly encryptionKey: kms.IKey;

  /**
   * The removal policy for the S3 bucket.
   */
  readonly removalPolicy?: cdk.RemovalPolicy;

  /**
   * The roles that have access to the S3 bucket.
   */
  readonly roles?: string[];

  /**
   * Whether to auto-delete objects from the S3 bucket.
   * @default true
   */
  readonly autoDeleteObjects?: boolean;
}

export class S3RepositoryConstruct extends Construct {
  readonly bucket: s3.Bucket;
  readonly repositoryBranch: string;
  readonly prefix: string;
  readonly encryptionKey: kms.IKey;
  readonly removalPolicy: cdk.RemovalPolicy;
  readonly pipelineInput: pipelines.IFileSetProducer;

  /**
   * The environment variables for the pipeline.
   */
  readonly pipelineEnvVars: { [key: string]: string } = {};

  constructor(scope: Construct, id: string, props: S3RepositoryConstructProps) {
    super(scope, id);
    this.encryptionKey = props.encryptionKey;
    this.removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;
    this.repositoryBranch = props.branch ?? 'main';
    this.prefix = props.prefix ?? '';

    this.bucket = new s3.Bucket(this, 'GitRepoBucket', {
      bucketName: props.bucketName,
      versioned: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: props.encryptionKey,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.autoDeleteObjects ?? true,
      eventBridgeEnabled: true,
      enforceSSL: true,
    });

    const pipelineRole = new iam.Role(this, 'PipelineRole', {
      assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
    });
    this.bucket.grantRead(pipelineRole, `${this.prefix}/refs/heads/${this.repositoryBranch}/*`);

    props.roles?.forEach((roleArn, index) => {
      const role = iam.Role.fromRoleArn(this, `GitRole-${index}`, roleArn);
      this.bucket.grantReadWrite(role, `${this.prefix}`);

      nag.NagSuppressions.addResourceSuppressions(
        role,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'This resource permission is applied to the minimal required resources.',
          },
        ],
        true,
      );
    });

    this.pipelineInput = pipelines.CodePipelineSource.s3(
      this.bucket,
      `${this.prefix}/refs/heads/${this.repositoryBranch}/repo.zip`,
      {
        trigger: pipelineActions.S3Trigger.EVENTS,
      },
    );
    this.pipelineInput = pipelines.CodePipelineSource.s3(
      this.bucket,
      `${this.prefix}/refs/heads/${this.repositoryBranch}/repo.zip`,
      {
        trigger: pipelineActions.S3Trigger.EVENTS,
      },
    );

    // override the onCloudTrailWriteObject method as https://github.com/aws/aws-cdk/issues/26894
    // eslint-disable-next-line dot-notation
    this.bucket['onCloudTrailWriteObject'] = (ruleId: string, options?: s3.OnCloudTrailBucketEventOptions) => {
      const rule = new events.Rule(options?.crossStackScope ?? this, ruleId, options);

      rule.addTarget(options?.target);
      rule.addEventPattern({
        source: ['aws.s3'],
        detailType: ['Object Created', 'Object Restore Completed'],
        detail: {
          bucket: {
            name: [this.bucket.bucketName],
          },
          object: {
            key: [`${this.prefix}/refs/heads/${this.repositoryBranch}/repo.zip`],
          },
        },
      });

      return rule;
    };

    nag.NagSuppressions.addResourceSuppressions(
      pipelineRole,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'This resource permission is applied to the minimal required resources.',
        },
      ],
      true,
    );
  }
}
