// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ResourceContext, IResourceProvider } from '../common';

/**
 * Backward compatibility settings for proxy
 */
const defaultProxy = {
  proxySecretArn: process.env.PROXY_SECRET_ARN || '',
  noProxy: [],
  proxyTestUrl: 'https://volkswagen.de',
};

/**
 * HTTP(s) Proxy configuration
 */
export interface IProxyConfig {
  proxySecretArn: string;
  noProxy: string[];
  proxyTestUrl: string;
}

/**
 * Provides HTTPProxy settings for the pipeline.
 */
export class HttpProxyProvider implements IResourceProvider {
  constructor(readonly proxy: IProxyConfig = defaultProxy) {}

  provide(context: ResourceContext): any {
    const { environment } = context;

    if (this.proxy.noProxy.length == 0) {
      this.proxy.noProxy.push(`${environment.region}.amazonaws.com`);
    }

    return this.proxy;
  }
}
