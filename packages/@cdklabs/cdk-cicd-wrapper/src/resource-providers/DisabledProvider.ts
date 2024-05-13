// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ResourceContext, IResourceProvider } from '../common';

export class DisabledProvider implements IResourceProvider {
  constructor(readonly name: string) {}

  provide(_: ResourceContext): any {
    console.warn(`The resource provider ${this.name} is disabled.`);

    return undefined;
  }
}
