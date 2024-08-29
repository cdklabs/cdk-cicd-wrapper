// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IResourceProvider, ResourceContext } from '../common';

export interface ILogger {
  info(message: string): void;

  warning(message: string): void;

  error(message: string): void;
}

class Logger implements ILogger {
  private scope?: Construct;
  private messages: { [key: string]: string[] } = {
    info: [],
    warning: [],
    error: [],
  };

  constructor() {}

  setScope(scope: Construct) {
    this.scope = scope;

    this.messages.info.forEach((message) => this.info(message));
    this.messages.warning.forEach((message) => this.warning(message));
    this.messages.error.forEach((message) => this.error(message));

    this.messages = {
      info: [],
      warning: [],
      error: [],
    };
  }

  info(message: string) {
    if (!this.scope) {
      this.messages.info.push(message);
    } else {
      cdk.Annotations.of(this.scope).addInfo(message);
    }
  }

  warning(message: string) {
    if (!this.scope) {
      this.messages.warning.push(message);
    } else {
      cdk.Annotations.of(this.scope).addWarning(message);
    }
  }

  error(message: string) {
    if (!this.scope) {
      this.messages.error.push(message);
    } else {
      cdk.Annotations.of(this.scope).addError(message);
    }
  }
}

const logger = new Logger();

export { logger };

export class LoggingProvider implements IResourceProvider {
  provide(context: ResourceContext): any {
    logger.setScope(context.scope);
    return logger;
  }
}
