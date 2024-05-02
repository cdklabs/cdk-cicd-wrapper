// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ResourceContext, IResourceProvider } from '../common';

/**
 * Backward compatibility settings for proxy
 */
const defaultProxy = {
  /**
   * The ARN of the Secrets Manager secret that contains the proxy credentials.
   * Default value is an empty string.
   */
  proxySecretArn: process.env.PROXY_SECRET_ARN || '',

  /**
   * A list of URLs or IP addresses that should bypass the proxy.
   * Default value is an empty array.
   */
  noProxy: [],

  /**
   * A URL to test the proxy configuration.
   * Default value is 'https://aws.amazon.com'.
   */
  proxyTestUrl: 'https://aws.amazon.com',
};

/**
 * HTTP(s) Proxy configuration
 */
export interface IProxyConfig {
  /**
   * The ARN of the Secrets Manager secret that contains the proxy credentials.
   */
  proxySecretArn: string;

  /**
   * A list of URLs or IP addresses that should bypass the proxy.
   */
  noProxy: string[];

  /**
   * A URL to test the proxy configuration.
   */
  proxyTestUrl: string;
}

/**
 * Provides HTTPProxy settings for the pipeline.
 */
export class HttpProxyProvider implements IResourceProvider {
  /**
   * Creates a new instance of the HttpProxyProvider class.
   * @param proxy The proxy configuration. If not provided, the default configuration will be used.
   */
  constructor(readonly proxy: IProxyConfig = defaultProxy) {}

  /**
   * Provides the proxy configuration for the pipeline.
   * @param context The resource context.
   * @returns The proxy configuration.
   */
  provide(context: ResourceContext): any {
    const { environment } = context;

    if (this.proxy.noProxy.length === 0) {
      this.proxy.noProxy.push(`${environment.region}.amazonaws.com`);
    }

    return this.proxy;
  }
}
