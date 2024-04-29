#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: Apache-2.0
set -e


CMD='npm run cdk';
if [[ $(jq -r '.scripts.cdk' package.json) == null ]]; then
    CMD='npm exec -- cdk';
fi

$CMD context
$CMD synth