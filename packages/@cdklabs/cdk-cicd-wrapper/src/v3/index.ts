// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// The v3 **public** surface. This barrel is re-exported from the package entry point, so everything
// named here lands in the jsii assembly and ships to Python/Java/.NET as well as npm. It is curated
// rather than a `export *` on purpose — several members of `./appconfig` cannot cross the jsii
// boundary and are internal-only:
//
//   ConfigLoader / ConfigLoadOptions  generic methods (`load<T>`) and `NodeJS.ProcessEnv`; `AppConfig`
//                                     is the jsii-safe front door for both.
//   ConfigError                       jsii cannot model a custom exception type. The `kind` enum is
//                                     exported so callers can still discriminate; the class itself is
//                                     an implementation detail of how the failure surfaces in JS.
//   deepMerge / getDefaultConfig /    bare functions and a mapped type; jsii only models types.
//   applyDerivedDefaults / DeepPartial
//   validateConfig / getByPath        bare functions, internal to validation.
//
// Anything in this repo that needs the unrestricted API imports from `./appconfig` directly.
export { AppConfig, AppConfigOptions } from './appconfig/accessor';
export { ConfigErrorKind } from './appconfig/error';
export { AwsEnvironment, BaseConfig, RemovalPolicies, RemovalPolicyValue } from './appconfig/schema';
export { ConditionalFieldGroup, ConfigSchema, FieldKind, RequiredField } from './appconfig/validation';
