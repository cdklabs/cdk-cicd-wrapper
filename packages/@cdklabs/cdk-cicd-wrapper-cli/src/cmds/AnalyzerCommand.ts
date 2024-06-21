// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */
import { readFileSync } from 'fs';
import * as path from 'path';
import { S3, BucketLocationConstraint } from '@aws-sdk/client-s3';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import * as yargs from 'yargs';

/**
 * The default path to the policy JSON file.
 */
const DEFAULT_POLICY_JSON = '../../scripts/compliance-bucket-policy.json';

/**
 * Command class that configures the compliance bucket.
 */
class Command implements yargs.CommandModule {
  /**
   * The command name.
   */
  command = 'analyze';

  /**
   * A description of the command.
   */
  describe = 'Analyzes the environment and pipeline configuration. To spot potential common issues';

  /**
   * Builds the command arguments.
   * @param args The argument parser.
   * @returns The argument parser with defined options.
   */
  builder(args: yargs.Argv) {
    args.option('profile', {
      type: 'string',
      requiresArg: true,
      demandOption: 'AWS profile is required',
      description: 'AWS profile',
    });

    args.option('account', {
      type: 'string',
      requiresArg: true,
      demandOption: 'AWS account id is required',
      description: 'AWS account id',
    });

    args.option('region', {
      type: 'string',
      requiresArg: true,
      demandOption: 'AWS region is required',
      description: 'AWS region',
    });

    args.option('policy-path', {
      type: 'string',
      requiresArg: true,
      description: 'AWS Policy JSON',
    });

    return args;
  }

  /**
   * Handles the command execution.
   * @param args The parsed command arguments.
   */
  handler(args: yargs.Arguments) {
    const account = args.account as string;
    const region = args.region as string;
    const profile = args.profile as string;

    const bucketName = `compliance-log-${account}-${region}`;
    const policyJsonPath: string =
      (args['policy-path'] as string | undefined) || path.join(__dirname, DEFAULT_POLICY_JSON);

    const policyData = readFileSync(policyJsonPath, { encoding: 'utf-8' });

    const policy = JSON.parse(policyData);

    policy.Statement.forEach((statement: { Resource: string }) => {
      statement.Resource = `arn:aws:s3:::${bucketName}/*`;
    });

    const policyString = JSON.stringify(policy);

    void (async function () {
      const s3client = new S3({
        region: region,
        credentials: fromNodeProviderChain({ profile: profile }),
      });

      console.log(`Creating bucket ${bucketName}...`);
      try {
        await s3client.createBucket({
          Bucket: bucketName,
          CreateBucketConfiguration: {
            LocationConstraint: region as BucketLocationConstraint,
          },
        });

        console.log(`Bucket ${bucketName} has been created.`);

        console.log('Set bucket policy.');
        s3client.putBucketPolicy(
          {
            Bucket: bucketName,
            Policy: policyString,
          },
          (err) => {
            if (err) console.log(err, err.stack);
          },
        );

        console.log('Disable public access.');
        await s3client.putPublicAccessBlock({
          Bucket: bucketName,
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            IgnorePublicAcls: true,
            BlockPublicPolicy: true,
            RestrictPublicBuckets: true,
          },
        });
      } catch (err) {
        console.error(err);
      }
    })();
  }
}

export default new Command();
