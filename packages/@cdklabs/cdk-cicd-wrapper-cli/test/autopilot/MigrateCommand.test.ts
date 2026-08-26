// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for the Blueprint->Autopilot migration analyzer. Pure over source text -- no filesystem, no spawn.

import { analyzeV2Source, renderCicdConfig } from '../../src/cmds/autopilot/MigrateCommand';

describe('m5-codemod: analyzeV2Source', () => {
  test('extracts an explicit string-array defineStages', () => {
    const plan = analyzeV2Source(`
      PipelineBlueprint.builder().defineStages(['RES', 'DEV', 'PROD']).synth(app);
    `);
    expect(plan.foundBuilder).toBe(true);
    expect(plan.stages).toEqual(['res', 'dev', 'prod']); // lowercased for Autopilot
  });

  test('reads Stage.X enum refs and { stage: "INT" } object forms', () => {
    const plan = analyzeV2Source(`
      PipelineBlueprint.builder()
        .defineStages([Stage.RES, { stage: 'INT', env: { account: '1' } }, 'prod'])
        .synth(app);
    `);
    expect(plan.stages).toEqual(['res', 'int', 'prod']);
  });

  test('falls back to Blueprint default stages (with a warning) when defineStages is absent', () => {
    const plan = analyzeV2Source(`PipelineBlueprint.builder().addStack({ provide(c){} }).synth(app);`);
    expect(plan.stages).toEqual(['res', 'dev', 'int']);
    expect(plan.warnings.join(' ')).toMatch(/default/);
  });

  test('does NOT guess an unreadable defineStages -- it warns instead of emitting a wrong list', () => {
    // A computed stage array must not be silently mis-migrated.
    const plan = analyzeV2Source(`PipelineBlueprint.builder().defineStages(myStages).synth(app);`);
    expect(plan.stages).toEqual(['res', 'dev', 'int']); // fell back
    expect(plan.warnings.join(' ')).toMatch(/could not read defineStages/);
  });

  test('flags repositoryProvider, workbench and phases/hooks as manual follow-ups', () => {
    const plan = analyzeV2Source(`
      PipelineBlueprint.builder()
        .repositoryProvider(new BasicRepositoryProvider())
        .workbench({ provide(c){} })
        .definePhase(PipelinePhases.POST_DEPLOY, [])
        .synth(app);
    `);
    const w = plan.warnings.join(' | ');
    expect(w).toMatch(/repositoryProvider/);
    expect(w).toMatch(/workbench/);
    expect(w).toMatch(/phases\/hooks/);
  });

  test('a file with no builder chain is reported as nothing-to-migrate', () => {
    expect(analyzeV2Source(`const app = new App(); new MyStack(app, 'x'); app.synth();`).foundBuilder).toBe(false);
  });

  test('works on a real-world-shaped Blueprint app (workbench + addStack, no defineStages)', () => {
    // Verbatim shape of the retired samples/cdk-ts-example/src/main.ts (deleted alongside the Blueprint
    // sample + the projen product, m8-remove-v2) -- kept inline so the analyzer is still exercised
    // against genuine Blueprint source, not just synthetic snippets.
    const sample = `
      import { PipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper';
      import { App, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
      import { Construct } from 'constructs';

      interface Props extends StackProps {
        value?: string;
      }

      export class MyStack extends Stack {
        constructor(scope: Construct, id: string, props: Props = {}) {
          super(scope, id, props);

          new CfnOutput(this, 'hello', { value: props.value || 'world' });
        }
      }

      const app = new App();

      PipelineBlueprint.builder()
        .workbench({
          provide(context) {
            new MyStack(context.scope, 'cdk-ts-example-workbench', { value: 'workbench' });
          },
        })
        .addStack({
          provide(context) {
            new MyStack(context.scope, 'cdk-ts-example');
          },
        })
        .synth(app);

      app.synth();
    `;
    const plan = analyzeV2Source(sample);
    expect(plan.foundBuilder).toBe(true);
    // The sample has workbench + addStack and NO defineStages -> default stages + a workbench warning.
    expect(plan.stages).toEqual(['res', 'dev', 'int']);
    expect(plan.warnings.join(' ')).toMatch(/workbench/);
  });
});

describe('m5-codemod: renderCicdConfig', () => {
  test('emits a valid-looking defineCICD with the stages, and TODOs for the warnings', () => {
    const out = renderCicdConfig(
      { stages: ['dev', 'prod'], repository: "Repository.github('org/app')", warnings: ['do X'], foundBuilder: true },
      'shop',
    );
    expect(out).toContain("import { defineCICD, Repository } from '@cdklabs/cdk-cicd-wrapper'");
    expect(out).toContain("application: 'shop'");
    expect(out).toContain("stages: ['dev', 'prod']");
    expect(out).toContain("repository: Repository.github('org/app')");
    expect(out).toContain('TODO: do X');
  });

  test('when no repository was found, leaves a clearly-marked placeholder rather than a wrong guess', () => {
    const out = renderCicdConfig({ stages: ['dev'], warnings: [], foundBuilder: true }, 'shop');
    expect(out).toMatch(/Repository\.codecommit\('TODO/);
  });
});
