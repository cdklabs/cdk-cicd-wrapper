// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { IResourceProvider, ResourceContext } from '../common';

export interface ILogger {
  info(message: string, on?: IConstruct): void;

  warning(message: string, on?: IConstruct): void;

  error(message: string, on?: IConstruct): void;
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

  info(message: string, on?: IConstruct) {
    if (!on && !this.scope) {
      this.messages.info.push(message);
    } else {
      cdk.Annotations.of(on || this.scope!).addInfo(message);
    }
  }

  warning(message: string, on?: IConstruct) {
    if (!on && !this.scope) {
      this.messages.warning.push(message);
    } else {
      cdk.Annotations.of(on || this.scope!).addWarning(message);
    }
  }

  error(message: string, on?: IConstruct) {
    if (!this.scope) {
      this.messages.error.push(message);
    } else {
      cdk.Annotations.of(on || this.scope!).addError(message);
    }
  }
}

const logger = new Logger();

export { logger };

export class LoggingProvider implements IResourceProvider {
  provide(_: ResourceContext): any {
    return logger;
  }
}
