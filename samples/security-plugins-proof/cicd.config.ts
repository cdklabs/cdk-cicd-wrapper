// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Demonstrates the configurable plugin list (issue #241). This `plugins` list COMPLETELY overrides
// the default-on set: only the plugins named here apply. It keeps four built-ins and adds one custom
// plugin (`RequireOwnerTag`), whose instance is registered in bin/app.ts via CdkCicd.addPlugin.
//
// Omit `plugins` entirely to get the default-on set unchanged; set it to `[]` to opt out of all.
import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper';

export default defineCICD({
  application: 'security-plugins-proof',
  repository: Repository.codecommit('security-plugins-proof'),
  stages: ['dev', 'prod'],
  plugins: [
    { name: 'AwsSolutionsChecks', version: '1' },
    { name: 'LogRetention', version: '1' },
    { name: 'EncryptBucketOnTransit', version: '1' },
    { name: 'EncryptSNSTopicOnTransit', version: '1' },
    // A custom plugin: its IAspect instance is supplied in bin/ via CdkCicd.addPlugin.
    { name: 'RequireOwnerTag', version: '1.0.0' },
  ],
});
