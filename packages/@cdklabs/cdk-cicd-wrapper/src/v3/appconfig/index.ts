// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Application configuration management: resolve, layer, and validate the per-environment config file
// for the stage being synthesized. `getByPath`/`isMissing` stay out of this barrel on purpose — they
// are internals, importable directly from `./validation` where needed.
export { AppConfig, AppConfigOptions } from './accessor';
export { ConfigError, ConfigErrorKind } from './error';
export { DeepPartial, applyDerivedDefaults, deepMerge, getDefaultConfig } from './defaults';
export { ConfigLoadOptions, ConfigLoader } from './loader';
export { AwsEnvironment, BaseConfig, RemovalPolicies, RemovalPolicyValue } from './schema';
export { ConditionalFieldGroup, ConfigSchema, FieldKind, RequiredField, validateConfig } from './validation';
