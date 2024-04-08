#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: Apache-2.0
set -e

##
# Make sure to add a new path to the requirements.txt in case you add a new path
#
##
ROOT_DIR=$(pwd)

echo "Scanning for vulnerabilities in dependencies in Python"

PYTHON_EXECUTABLE="python";
if [[ "$(python3 -V)" =~ "Python 3" ]]; then
    PYTHON_EXECUTABLE="python3";
fi

WORK_DIR=`mktemp -d`;

# check if tmp dir was created
if [[ ! "$WORK_DIR" || ! -d "$WORK_DIR" ]]; then
    echo "Could not create temp dir";
    exit 1;
fi

# deletes the temp directory
function cleanup {
    if [[ "$VIRTUAL_ENV" == "$WORK_DIR*" ]]; then
        deactivate
    fi

    rm -rf "$WORK_DIR";
}

trap cleanup EXIT;

# CREATE a virtual env
$PYTHON_EXECUTABLE -m venv "$WORK_DIR/venv" > /dev/null;

. $WORK_DIR/venv/bin/activate;
pip install pip-audit pipenv > /dev/null;

REQUIREMENTS=($(find "${ROOT_DIR}" -type f -name 'Pipfile' -not -path "*/node_modules/*" -not -path "*/cdk.out/*"))
echo "Matching requirements found : ${#REQUIREMENTS[@]}"

if [ -z "$REQUIREMENTS" ]; then
    echo "No Pipfiles found."
    exit 0;
fi

for pythonModule in "${REQUIREMENTS[@]}"; do
    pythonModuleFolder=`dirname $pythonModule`;
    pushd "${pythonModuleFolder}" || exit 1;
    pipenv requirements --exclude-markers --hash > requirements.txt && pip-audit -r requirements.txt --disable-pip && rm -rf requirements.txt || exit 1;
    popd || exit 1;
done
