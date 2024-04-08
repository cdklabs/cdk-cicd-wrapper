#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: Apache-2.0
# Get the NPM BASIC AUTH Token and output it to ~/.npmrc
set -e

if [[ -z "${NPM_BASIC_AUTH_ID}" || -z "${NPM_REGISTRY}" ]]; then
    echo "--- No NPM Basic Auth detected ---";
else
    NODE_AUTH_TOKEN=`aws secretsmanager get-secret-value --region ${AWS_REGION} --secret-id ${NPM_BASIC_AUTH_ID} --output text --query SecretString`;

    SCOPE="";
    if [[ ! -z "${NPM_SCOPE}" ]]; then
        if [[ "${NPM_SCOPE}" != "@"* ]]; then
            SCOPE="@${NPM_SCOPE}:";
        else
            SCOPE="${NPM_SCOPE}:";
        fi
    fi
    echo "${SCOPE#*://}registry=${NPM_REGISTRY}" > ./.npmrc;
    echo "//${NPM_REGISTRY#*://}:_authToken=${NODE_AUTH_TOKEN}" >> ./.npmrc;
fi