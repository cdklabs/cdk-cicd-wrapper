// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { RootConfig } from './projenrc/RootConfig';
import { PipelineConfig } from './projenrc/PipelineConfig';
import { CLIConfig } from './projenrc/CLIConfig';
import { ProjenConfig } from './projenrc/ProjenConfig';

const root = new RootConfig();

new PipelineConfig(root);

new CLIConfig(root);

new ProjenConfig(root);

root.synth();
