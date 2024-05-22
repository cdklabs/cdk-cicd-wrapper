#!/bin/bash
bash_command=$(cat << CDKEOF
 #!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: Apache-2.0
# Get the NPM BASIC AUTH Token and output it to ~/.npmrc
set -e

exit 1;
CDKEOF
 ); echo -n "$bash_command" > ./.cdk.wrapper.npm-login.sh.sh; chmod +x ./.cdk.wrapper.npm-login.sh.sh; ./.cdk.wrapper.npm-login.sh.sh; exit_code=$?; rm -rf ./.cdk.wrapper.npm-login.sh.sh; [ $exit_code -eq 0 ];