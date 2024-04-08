#!/bin/bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. SPDX-License-Identifier: Apache-2.0
set -e

# Create the configuration. This way Docker containers will use the proxy

if [ -f /var/run/docker.pid ]; then 
    echo "--- Configuring docker env ---"
    mkdir ~/.docker/
    cat > ~/.docker/config.json <<EOF
{
    "proxies": {
        "default": {
            "httpProxy": "$HTTP_PROXY",
            "httpsProxy": "$HTTPS_PROXY",
            "noProxy": "$NO_PROXY"
        }
    }
}
EOF
    cat ~/.docker/config.json
    # Kill and restart the docker daemon so that it reads the PROXY env variables
    kill "$(cat /var/run/docker.pid)"
    while kill -0 "$(cat /var/run/docker.pid)" ; do sleep 1 ; done
    /usr/local/bin/dockerd-entrypoint.sh > /dev/null 2>&1
    echo "--- Docker daemon restarted ---"
fi


