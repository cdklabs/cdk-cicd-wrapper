// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { defineCICD } from '../../../src/v3/config/define';
import { Repository } from '../../../src/v3/config/repository';
import { EngineRenderProps, IEngine } from '../../../src/v3/engine/types';

// A trivial engine proving the interface is implementable and side-effecting: it renders a marker
// construct into the given scope from the resolved config.
class MarkerEngine implements IEngine {
  public rendered?: EngineRenderProps;
  public render(scope: Construct, props: EngineRenderProps): void {
    this.rendered = props;
    new Construct(scope, `marker-${props.pipelineName}`);
  }
}

describe('m4-iengine: IEngine', () => {
  test('an engine renders into the scope and receives the resolved config', () => {
    const stack = new Stack(new App(), 'Stack');
    const engine: IEngine = new MarkerEngine();
    const config = defineCICD({ application: 'shop', repository: Repository.github('org/shop'), stages: ['dev'] });

    engine.render(stack, { config, pipelineName: 'shop-pipeline' });

    expect((engine as MarkerEngine).rendered?.config.application).toBe('shop');
    expect(stack.node.tryFindChild('marker-shop-pipeline')).toBeDefined();
  });
});
