// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * This module imports and exports various security and optimization plugins for use within the project.
 */

import { DestroyEncryptionKeysOnDeletePlugin } from './optimization/DestroyEncryptionKeysOnDeletePlugin';
import { AccessLogsForBucketPlugin } from './security/AccessLogsForBucketPlugin';
import { DisablePublicIPAssignmentForEC2Plugin } from './security/DisablePublicIPAssignmentForEC2Plugin';
import { EncryptBucketOnTransitPlugin } from './security/EncryptBucketOnTransitPlugin';
import { EncryptCloudWatchLogGroupsPlugin } from './security/EncryptCloudWatchLogGroupsPlugin';
import { EncryptSNSTopicOnTransitPlugin } from './security/EncryptSNSTopicOnTransitPlugin';
import { RotateEncryptionKeysPlugin } from './security/RotateEncryptionKeysPlugin';

/**
 * Re-exporting all imports from the respective files for ease of access.
 */
export * from './optimization/DestroyEncryptionKeysOnDeletePlugin';
export * from './security/AccessLogsForBucketPlugin';
export * from './security/DisablePublicIPAssignmentForEC2Plugin';
export * from './security/EncryptBucketOnTransitPlugin';
export * from './security/EncryptCloudWatchLogGroupsPlugin';
export * from './security/EncryptSNSTopicOnTransitPlugin';
export * from './security/RotateEncryptionKeysPlugin';
export * from './security/LambdaDLQPlugin';
export * from './utils/CodeArtifactBucketPlugin';
/**
 * Class containing static instances of various security and optimization plugins.
 */
export class Plugins {
  /**
   * Static instance of the DestroyEncryptionKeysOnDeletePlugin.
   */
  static readonly DestroyEncryptionKeysOnDeletePlugin = new DestroyEncryptionKeysOnDeletePlugin();

  /**
   * Static instance of the AccessLogsForBucketPlugin.
   */
  static readonly AccessLogsForBucketPlugin = new AccessLogsForBucketPlugin();

  /**
   * Static instance of the DisablePublicIPAssignmentForEC2Plugin.
   */
  static readonly DisablePublicIPAssignmentForEC2Plugin = new DisablePublicIPAssignmentForEC2Plugin();

  /**
   * Static instance of the EncryptBucketOnTransitPlugin.
   */
  static readonly EncryptBucketOnTransitPlugin = new EncryptBucketOnTransitPlugin();

  /**
   * Static instance of the EncryptCloudWatchLogGroupsPlugin.
   */
  static readonly EncryptCloudWatchLogGroupsPlugin = new EncryptCloudWatchLogGroupsPlugin();

  /**
   * Static instance of the EncryptSNSTopicOnTransitPlugin.
   */
  static readonly EncryptSNSTopicOnTransitPlugin = new EncryptSNSTopicOnTransitPlugin();

  /**
   * Static instance of the RotateEncryptionKeysPlugin.
   */
  static readonly RotateEncryptionKeysPlugin = new RotateEncryptionKeysPlugin();
}
