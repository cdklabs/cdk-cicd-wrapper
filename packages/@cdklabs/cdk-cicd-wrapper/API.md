# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### AppStage <a name="AppStage" id="@cdklabs/cdk-cicd-wrapper.AppStage"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.AppStage.Initializer"></a>

```typescript
import { AppStage } from '@cdklabs/cdk-cicd-wrapper'

new AppStage(scope: Construct, id: string, props: AppStageProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStageProps">AppStageProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.AppStage.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.AppStage.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.AppStage.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.AppStageProps">AppStageProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.synth">synth</a></code> | Synthesize this stage into a cloud assembly. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.AppStage.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `synth` <a name="synth" id="@cdklabs/cdk-cicd-wrapper.AppStage.synth"></a>

```typescript
public synth(options?: StageSynthesisOptions): CloudAssembly
```

Synthesize this stage into a cloud assembly.

Once an assembly has been synthesized, it cannot be modified. Subsequent
calls will return the same assembly.

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.AppStage.synth.parameter.options"></a>

- *Type:* aws-cdk-lib.StageSynthesisOptions

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.isStage">isStage</a></code> | Test whether the given construct is a stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.of">of</a></code> | Return the stage this construct is contained with, if available. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.AppStage.isConstruct"></a>

```typescript
import { AppStage } from '@cdklabs/cdk-cicd-wrapper'

AppStage.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.AppStage.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `isStage` <a name="isStage" id="@cdklabs/cdk-cicd-wrapper.AppStage.isStage"></a>

```typescript
import { AppStage } from '@cdklabs/cdk-cicd-wrapper'

AppStage.isStage(x: any)
```

Test whether the given construct is a stage.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.AppStage.isStage.parameter.x"></a>

- *Type:* any

---

##### `of` <a name="of" id="@cdklabs/cdk-cicd-wrapper.AppStage.of"></a>

```typescript
import { AppStage } from '@cdklabs/cdk-cicd-wrapper'

AppStage.of(construct: IConstruct)
```

Return the stage this construct is contained with, if available.

If called
on a nested stage, returns its parent.

###### `construct`<sup>Required</sup> <a name="construct" id="@cdklabs/cdk-cicd-wrapper.AppStage.of.parameter.construct"></a>

- *Type:* constructs.IConstruct

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.property.artifactId">artifactId</a></code> | <code>string</code> | Artifact ID of the assembly if it is a nested stage. The root stage (app) will return an empty string. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.property.assetOutdir">assetOutdir</a></code> | <code>string</code> | The cloud assembly asset output directory. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.property.outdir">outdir</a></code> | <code>string</code> | The cloud assembly output directory. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.property.policyValidationBeta1">policyValidationBeta1</a></code> | <code>aws-cdk-lib.IPolicyValidationPluginBeta1[]</code> | Validation plugins to run during synthesis. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.property.stageName">stageName</a></code> | <code>string</code> | The name of the stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.property.account">account</a></code> | <code>string</code> | The default account for all resources defined within this stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.property.parentStage">parentStage</a></code> | <code>aws-cdk-lib.Stage</code> | The parent stage or `undefined` if this is the app. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.property.region">region</a></code> | <code>string</code> | The default region for all resources defined within this stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStage.property.logRetentionRoleArn">logRetentionRoleArn</a></code> | <code>string</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.AppStage.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `artifactId`<sup>Required</sup> <a name="artifactId" id="@cdklabs/cdk-cicd-wrapper.AppStage.property.artifactId"></a>

```typescript
public readonly artifactId: string;
```

- *Type:* string

Artifact ID of the assembly if it is a nested stage. The root stage (app) will return an empty string.

Derived from the construct path.

---

##### `assetOutdir`<sup>Required</sup> <a name="assetOutdir" id="@cdklabs/cdk-cicd-wrapper.AppStage.property.assetOutdir"></a>

```typescript
public readonly assetOutdir: string;
```

- *Type:* string

The cloud assembly asset output directory.

---

##### `outdir`<sup>Required</sup> <a name="outdir" id="@cdklabs/cdk-cicd-wrapper.AppStage.property.outdir"></a>

```typescript
public readonly outdir: string;
```

- *Type:* string

The cloud assembly output directory.

---

##### `policyValidationBeta1`<sup>Required</sup> <a name="policyValidationBeta1" id="@cdklabs/cdk-cicd-wrapper.AppStage.property.policyValidationBeta1"></a>

```typescript
public readonly policyValidationBeta1: IPolicyValidationPluginBeta1[];
```

- *Type:* aws-cdk-lib.IPolicyValidationPluginBeta1[]
- *Default:* no validation plugins are used

Validation plugins to run during synthesis.

If any plugin reports any violation,
synthesis will be interrupted and the report displayed to the user.

---

##### `stageName`<sup>Required</sup> <a name="stageName" id="@cdklabs/cdk-cicd-wrapper.AppStage.property.stageName"></a>

```typescript
public readonly stageName: string;
```

- *Type:* string

The name of the stage.

Based on names of the parent stages separated by
hypens.

---

##### `account`<sup>Optional</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.AppStage.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

The default account for all resources defined within this stage.

---

##### `parentStage`<sup>Optional</sup> <a name="parentStage" id="@cdklabs/cdk-cicd-wrapper.AppStage.property.parentStage"></a>

```typescript
public readonly parentStage: Stage;
```

- *Type:* aws-cdk-lib.Stage

The parent stage or `undefined` if this is the app.

*

---

##### `region`<sup>Optional</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.AppStage.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

The default region for all resources defined within this stage.

---

##### `logRetentionRoleArn`<sup>Required</sup> <a name="logRetentionRoleArn" id="@cdklabs/cdk-cicd-wrapper.AppStage.property.logRetentionRoleArn"></a>

```typescript
public readonly logRetentionRoleArn: string;
```

- *Type:* string

---


### CDKPipeline <a name="CDKPipeline" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.Initializer"></a>

```typescript
import { CDKPipeline } from '@cdklabs/cdk-cicd-wrapper'

new CDKPipeline(scope: Construct, id: string, props: CDKPipelineProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps">CDKPipelineProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps">CDKPipelineProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.addStage">addStage</a></code> | Deploy a single Stage by itself. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.addWave">addWave</a></code> | Add a Wave to the pipeline, for deploying multiple Stages in parallel. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.buildPipeline">buildPipeline</a></code> | Send the current pipeline definition to the engine, and construct the pipeline. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addStage` <a name="addStage" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.addStage"></a>

```typescript
public addStage(stage: Stage, options?: AddStageOpts): StageDeployment
```

Deploy a single Stage by itself.

Add a Stage to the pipeline, to be deployed in sequence with other
Stages added to the pipeline. All Stacks in the stage will be deployed
in an order automatically determined by their relative dependencies.

###### `stage`<sup>Required</sup> <a name="stage" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.addStage.parameter.stage"></a>

- *Type:* aws-cdk-lib.Stage

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.addStage.parameter.options"></a>

- *Type:* aws-cdk-lib.pipelines.AddStageOpts

---

##### `addWave` <a name="addWave" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.addWave"></a>

```typescript
public addWave(id: string, options?: WaveOptions): Wave
```

Add a Wave to the pipeline, for deploying multiple Stages in parallel.

Use the return object of this method to deploy multiple stages in parallel.

Example:

```ts
declare const pipeline: pipelines.CodePipeline;

const wave = pipeline.addWave('MyWave');
wave.addStage(new MyApplicationStage(this, 'Stage1'));
wave.addStage(new MyApplicationStage(this, 'Stage2'));
```

###### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.addWave.parameter.id"></a>

- *Type:* string

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.addWave.parameter.options"></a>

- *Type:* aws-cdk-lib.pipelines.WaveOptions

---

##### `buildPipeline` <a name="buildPipeline" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.buildPipeline"></a>

```typescript
public buildPipeline(): void
```

Send the current pipeline definition to the engine, and construct the pipeline.

It is not possible to modify the pipeline after calling this method.

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.isPipeline">isPipeline</a></code> | Return whether the given object extends `PipelineBase`. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.isConstruct"></a>

```typescript
import { CDKPipeline } from '@cdklabs/cdk-cicd-wrapper'

CDKPipeline.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `isPipeline` <a name="isPipeline" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.isPipeline"></a>

```typescript
import { CDKPipeline } from '@cdklabs/cdk-cicd-wrapper'

CDKPipeline.isPipeline(x: any)
```

Return whether the given object extends `PipelineBase`.

We do attribute detection since we can't reliably use 'instanceof'.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.isPipeline.parameter.x"></a>

- *Type:* any

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.cloudAssemblyFileSet">cloudAssemblyFileSet</a></code> | <code>aws-cdk-lib.pipelines.FileSet</code> | The FileSet tha contains the cloud assembly. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.synth">synth</a></code> | <code>aws-cdk-lib.pipelines.IFileSetProducer</code> | The build step that produces the CDK Cloud Assembly. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.waves">waves</a></code> | <code>aws-cdk-lib.pipelines.Wave[]</code> | The waves in this pipeline. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.pipeline">pipeline</a></code> | <code>aws-cdk-lib.aws_codepipeline.Pipeline</code> | The CodePipeline pipeline that deploys the CDK app. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.selfMutationEnabled">selfMutationEnabled</a></code> | <code>boolean</code> | Whether SelfMutation is enabled for this CDK Pipeline. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.selfMutationProject">selfMutationProject</a></code> | <code>aws-cdk-lib.aws_codebuild.IProject</code> | The CodeBuild project that performs the SelfMutation. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.synthProject">synthProject</a></code> | <code>aws-cdk-lib.aws_codebuild.IProject</code> | The CodeBuild project that performs the Synth. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `cloudAssemblyFileSet`<sup>Required</sup> <a name="cloudAssemblyFileSet" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.cloudAssemblyFileSet"></a>

```typescript
public readonly cloudAssemblyFileSet: FileSet;
```

- *Type:* aws-cdk-lib.pipelines.FileSet

The FileSet tha contains the cloud assembly.

This is the primary output of the synth step.

---

##### `synth`<sup>Required</sup> <a name="synth" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.synth"></a>

```typescript
public readonly synth: IFileSetProducer;
```

- *Type:* aws-cdk-lib.pipelines.IFileSetProducer

The build step that produces the CDK Cloud Assembly.

---

##### `waves`<sup>Required</sup> <a name="waves" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.waves"></a>

```typescript
public readonly waves: Wave[];
```

- *Type:* aws-cdk-lib.pipelines.Wave[]

The waves in this pipeline.

---

##### `pipeline`<sup>Required</sup> <a name="pipeline" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.pipeline"></a>

```typescript
public readonly pipeline: Pipeline;
```

- *Type:* aws-cdk-lib.aws_codepipeline.Pipeline

The CodePipeline pipeline that deploys the CDK app.

Only available after the pipeline has been built.

---

##### `selfMutationEnabled`<sup>Required</sup> <a name="selfMutationEnabled" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.selfMutationEnabled"></a>

```typescript
public readonly selfMutationEnabled: boolean;
```

- *Type:* boolean

Whether SelfMutation is enabled for this CDK Pipeline.

---

##### `selfMutationProject`<sup>Required</sup> <a name="selfMutationProject" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.selfMutationProject"></a>

```typescript
public readonly selfMutationProject: IProject;
```

- *Type:* aws-cdk-lib.aws_codebuild.IProject

The CodeBuild project that performs the SelfMutation.

Will throw an error if this is accessed before `buildPipeline()`
is called, or if selfMutation has been disabled.

---

##### `synthProject`<sup>Required</sup> <a name="synthProject" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.synthProject"></a>

```typescript
public readonly synthProject: IProject;
```

- *Type:* aws-cdk-lib.aws_codebuild.IProject

The CodeBuild project that performs the Synth.

Only available after the pipeline has been built.

---

#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.installCommands">installCommands</a></code> | <code>string[]</code> | *No description.* |

---

##### `installCommands`<sup>Required</sup> <a name="installCommands" id="@cdklabs/cdk-cicd-wrapper.CDKPipeline.property.installCommands"></a>

```typescript
public readonly installCommands: string[];
```

- *Type:* string[]

---

### CodeCommitRepositoryConstruct <a name="CodeCommitRepositoryConstruct" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.Initializer"></a>

```typescript
import { CodeCommitRepositoryConstruct } from '@cdklabs/cdk-cicd-wrapper'

new CodeCommitRepositoryConstruct(scope: Construct, id: string, props: CodeCommitRepositoryConstructProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps">CodeCommitRepositoryConstructProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps">CodeCommitRepositoryConstructProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.toString">toString</a></code> | Returns a string representation of this construct. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.isConstruct"></a>

```typescript
import { CodeCommitRepositoryConstruct } from '@cdklabs/cdk-cicd-wrapper'

CodeCommitRepositoryConstruct.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.property.pipelineInput">pipelineInput</a></code> | <code>aws-cdk-lib.pipelines.IFileSetProducer</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `pipelineInput`<sup>Required</sup> <a name="pipelineInput" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstruct.property.pipelineInput"></a>

```typescript
public readonly pipelineInput: IFileSetProducer;
```

- *Type:* aws-cdk-lib.pipelines.IFileSetProducer

---


### CodeStarConnectionConstruct <a name="CodeStarConnectionConstruct" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.Initializer"></a>

```typescript
import { CodeStarConnectionConstruct } from '@cdklabs/cdk-cicd-wrapper'

new CodeStarConnectionConstruct(scope: Construct, id: string, props: CodeStarConfig)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConfig">CodeStarConfig</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConfig">CodeStarConfig</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.toString">toString</a></code> | Returns a string representation of this construct. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.isConstruct"></a>

```typescript
import { CodeStarConnectionConstruct } from '@cdklabs/cdk-cicd-wrapper'

CodeStarConnectionConstruct.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.property.codeStarConnectionArn">codeStarConnectionArn</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.property.pipelineInput">pipelineInput</a></code> | <code>aws-cdk-lib.pipelines.IFileSetProducer</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `codeStarConnectionArn`<sup>Required</sup> <a name="codeStarConnectionArn" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.property.codeStarConnectionArn"></a>

```typescript
public readonly codeStarConnectionArn: string;
```

- *Type:* string

---

##### `pipelineInput`<sup>Required</sup> <a name="pipelineInput" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectionConstruct.property.pipelineInput"></a>

```typescript
public readonly pipelineInput: IFileSetProducer;
```

- *Type:* aws-cdk-lib.pipelines.IFileSetProducer

---


### CodeStarConnectRepositoryStack <a name="CodeStarConnectRepositoryStack" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IRepositoryStack">IRepositoryStack</a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.Initializer"></a>

```typescript
import { CodeStarConnectRepositoryStack } from '@cdklabs/cdk-cicd-wrapper'

new CodeStarConnectRepositoryStack(scope: Construct, id: string, props: CodeStarConnectRepositoryStackProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps">CodeStarConnectRepositoryStackProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps">CodeStarConnectRepositoryStackProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.addDependency">addDependency</a></code> | Add a dependency between this stack and another stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.addMetadata">addMetadata</a></code> | Adds an arbitary key-value pair, with information you want to record about the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.addTransform">addTransform</a></code> | Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.exportStringListValue">exportStringListValue</a></code> | Create a CloudFormation Export for a string list value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.exportValue">exportValue</a></code> | Create a CloudFormation Export for a string value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.formatArn">formatArn</a></code> | Creates an ARN from components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.getLogicalId">getLogicalId</a></code> | Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.regionalFact">regionalFact</a></code> | Look up a fact value for the given fact for the region of this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.renameLogicalId">renameLogicalId</a></code> | Rename a generated logical identities. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.reportMissingContextKey">reportMissingContextKey</a></code> | Indicate that a context key was expected. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.resolve">resolve</a></code> | Resolve a tokenized value in the context of the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.splitArn">splitArn</a></code> | Splits the provided ARN into its components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.toJsonString">toJsonString</a></code> | Convert an object, potentially containing tokens, to a JSON string. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.toYamlString">toYamlString</a></code> | Convert an object, potentially containing tokens, to a YAML string. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addDependency` <a name="addDependency" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.addDependency"></a>

```typescript
public addDependency(target: Stack, reason?: string): void
```

Add a dependency between this stack and another stack.

This can be used to define dependencies between any two stacks within an
app, and also supports nested stacks.

###### `target`<sup>Required</sup> <a name="target" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.addDependency.parameter.target"></a>

- *Type:* aws-cdk-lib.Stack

---

###### `reason`<sup>Optional</sup> <a name="reason" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.addDependency.parameter.reason"></a>

- *Type:* string

---

##### `addMetadata` <a name="addMetadata" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.addMetadata"></a>

```typescript
public addMetadata(key: string, value: any): void
```

Adds an arbitary key-value pair, with information you want to record about the stack.

These get translated to the Metadata section of the generated template.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html)

###### `key`<sup>Required</sup> <a name="key" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.addMetadata.parameter.key"></a>

- *Type:* string

---

###### `value`<sup>Required</sup> <a name="value" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.addMetadata.parameter.value"></a>

- *Type:* any

---

##### `addTransform` <a name="addTransform" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.addTransform"></a>

```typescript
public addTransform(transform: string): void
```

Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template.

Duplicate values are removed when stack is synthesized.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html)

*Example*

```typescript
declare const stack: Stack;

stack.addTransform('AWS::Serverless-2016-10-31')
```


###### `transform`<sup>Required</sup> <a name="transform" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.addTransform.parameter.transform"></a>

- *Type:* string

The transform to add.

---

##### `exportStringListValue` <a name="exportStringListValue" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.exportStringListValue"></a>

```typescript
public exportStringListValue(exportedValue: any, options?: ExportValueOptions): string[]
```

Create a CloudFormation Export for a string list value.

Returns a string list representing the corresponding `Fn.importValue()`
expression for this Export. The export expression is automatically wrapped with an
`Fn::Join` and the import value with an `Fn::Split`, since CloudFormation can only
export strings. You can control the name for the export by passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

See `exportValue` for an example of this process.

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.exportStringListValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.exportStringListValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `exportValue` <a name="exportValue" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.exportValue"></a>

```typescript
public exportValue(exportedValue: any, options?: ExportValueOptions): string
```

Create a CloudFormation Export for a string value.

Returns a string representing the corresponding `Fn.importValue()`
expression for this Export. You can control the name for the export by
passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

## Example

Here is how the process works. Let's say there are two stacks,
`producerStack` and `consumerStack`, and `producerStack` has a bucket
called `bucket`, which is referenced by `consumerStack` (perhaps because
an AWS Lambda Function writes into it, or something like that).

It is not safe to remove `producerStack.bucket` because as the bucket is being
deleted, `consumerStack` might still be using it.

Instead, the process takes two deployments:

### Deployment 1: break the relationship

- Make sure `consumerStack` no longer references `bucket.bucketName` (maybe the consumer
  stack now uses its own bucket, or it writes to an AWS DynamoDB table, or maybe you just
  remove the Lambda Function altogether).
- In the `ProducerStack` class, call `this.exportValue(this.bucket.bucketName)`. This
  will make sure the CloudFormation Export continues to exist while the relationship
  between the two stacks is being broken.
- Deploy (this will effectively only change the `consumerStack`, but it's safe to deploy both).

### Deployment 2: remove the bucket resource

- You are now free to remove the `bucket` resource from `producerStack`.
- Don't forget to remove the `exportValue()` call as well.
- Deploy again (this time only the `producerStack` will be changed -- the bucket will be deleted).

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.exportValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.exportValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `formatArn` <a name="formatArn" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.formatArn"></a>

```typescript
public formatArn(components: ArnComponents): string
```

Creates an ARN from components.

If `partition`, `region` or `account` are not specified, the stack's
partition, region and account will be used.

If any component is the empty string, an empty string will be inserted
into the generated ARN at the location that component corresponds to.

The ARN will be formatted as follows:

  arn:{partition}:{service}:{region}:{account}:{resource}{sep}{resource-name}

The required ARN pieces that are omitted will be taken from the stack that
the 'scope' is attached to. If all ARN pieces are supplied, the supplied scope
can be 'undefined'.

###### `components`<sup>Required</sup> <a name="components" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.formatArn.parameter.components"></a>

- *Type:* aws-cdk-lib.ArnComponents

---

##### `getLogicalId` <a name="getLogicalId" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.getLogicalId"></a>

```typescript
public getLogicalId(element: CfnElement): string
```

Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource.

This method is called when a `CfnElement` is created and used to render the
initial logical identity of resources. Logical ID renames are applied at
this stage.

This method uses the protected method `allocateLogicalId` to render the
logical ID for an element. To modify the naming scheme, extend the `Stack`
class and override this method.

###### `element`<sup>Required</sup> <a name="element" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.getLogicalId.parameter.element"></a>

- *Type:* aws-cdk-lib.CfnElement

The CloudFormation element for which a logical identity is needed.

---

##### `regionalFact` <a name="regionalFact" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.regionalFact"></a>

```typescript
public regionalFact(factName: string, defaultValue?: string): string
```

Look up a fact value for the given fact for the region of this stack.

Will return a definite value only if the region of the current stack is resolved.
If not, a lookup map will be added to the stack and the lookup will be done at
CDK deployment time.

What regions will be included in the lookup map is controlled by the
`@aws-cdk/core:target-partitions` context value: it must be set to a list
of partitions, and only regions from the given partitions will be included.
If no such context key is set, all regions will be included.

This function is intended to be used by construct library authors. Application
builders can rely on the abstractions offered by construct libraries and do
not have to worry about regional facts.

If `defaultValue` is not given, it is an error if the fact is unknown for
the given region.

###### `factName`<sup>Required</sup> <a name="factName" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.regionalFact.parameter.factName"></a>

- *Type:* string

---

###### `defaultValue`<sup>Optional</sup> <a name="defaultValue" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.regionalFact.parameter.defaultValue"></a>

- *Type:* string

---

##### `renameLogicalId` <a name="renameLogicalId" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.renameLogicalId"></a>

```typescript
public renameLogicalId(oldId: string, newId: string): void
```

Rename a generated logical identities.

To modify the naming scheme strategy, extend the `Stack` class and
override the `allocateLogicalId` method.

###### `oldId`<sup>Required</sup> <a name="oldId" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.renameLogicalId.parameter.oldId"></a>

- *Type:* string

---

###### `newId`<sup>Required</sup> <a name="newId" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.renameLogicalId.parameter.newId"></a>

- *Type:* string

---

##### `reportMissingContextKey` <a name="reportMissingContextKey" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.reportMissingContextKey"></a>

```typescript
public reportMissingContextKey(report: MissingContext): void
```

Indicate that a context key was expected.

Contains instructions which will be emitted into the cloud assembly on how
the key should be supplied.

###### `report`<sup>Required</sup> <a name="report" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.reportMissingContextKey.parameter.report"></a>

- *Type:* aws-cdk-lib.cloud_assembly_schema.MissingContext

The set of parameters needed to obtain the context.

---

##### `resolve` <a name="resolve" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.resolve"></a>

```typescript
public resolve(obj: any): any
```

Resolve a tokenized value in the context of the current stack.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.resolve.parameter.obj"></a>

- *Type:* any

---

##### `splitArn` <a name="splitArn" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.splitArn"></a>

```typescript
public splitArn(arn: string, arnFormat: ArnFormat): ArnComponents
```

Splits the provided ARN into its components.

Works both if 'arn' is a string like 'arn:aws:s3:::bucket',
and a Token representing a dynamic CloudFormation expression
(in which case the returned components will also be dynamic CloudFormation expressions,
encoded as Tokens).

###### `arn`<sup>Required</sup> <a name="arn" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.splitArn.parameter.arn"></a>

- *Type:* string

the ARN to split into its components.

---

###### `arnFormat`<sup>Required</sup> <a name="arnFormat" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.splitArn.parameter.arnFormat"></a>

- *Type:* aws-cdk-lib.ArnFormat

the expected format of 'arn' - depends on what format the service 'arn' represents uses.

---

##### `toJsonString` <a name="toJsonString" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.toJsonString"></a>

```typescript
public toJsonString(obj: any, space?: number): string
```

Convert an object, potentially containing tokens, to a JSON string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.toJsonString.parameter.obj"></a>

- *Type:* any

---

###### `space`<sup>Optional</sup> <a name="space" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.toJsonString.parameter.space"></a>

- *Type:* number

---

##### `toYamlString` <a name="toYamlString" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.toYamlString"></a>

```typescript
public toYamlString(obj: any): string
```

Convert an object, potentially containing tokens, to a YAML string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.toYamlString.parameter.obj"></a>

- *Type:* any

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.isStack">isStack</a></code> | Return whether the given object is a Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.of">of</a></code> | Looks up the first stack scope in which `construct` is defined. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.isConstruct"></a>

```typescript
import { CodeStarConnectRepositoryStack } from '@cdklabs/cdk-cicd-wrapper'

CodeStarConnectRepositoryStack.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `isStack` <a name="isStack" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.isStack"></a>

```typescript
import { CodeStarConnectRepositoryStack } from '@cdklabs/cdk-cicd-wrapper'

CodeStarConnectRepositoryStack.isStack(x: any)
```

Return whether the given object is a Stack.

We do attribute detection since we can't reliably use 'instanceof'.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.isStack.parameter.x"></a>

- *Type:* any

---

##### `of` <a name="of" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.of"></a>

```typescript
import { CodeStarConnectRepositoryStack } from '@cdklabs/cdk-cicd-wrapper'

CodeStarConnectRepositoryStack.of(construct: IConstruct)
```

Looks up the first stack scope in which `construct` is defined.

Fails if there is no stack up the tree.

###### `construct`<sup>Required</sup> <a name="construct" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.of.parameter.construct"></a>

- *Type:* constructs.IConstruct

The construct to start the search from.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.account">account</a></code> | <code>string</code> | The AWS account into which this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.artifactId">artifactId</a></code> | <code>string</code> | The ID of the cloud assembly artifact for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.availabilityZones">availabilityZones</a></code> | <code>string[]</code> | Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.bundlingRequired">bundlingRequired</a></code> | <code>boolean</code> | Indicates whether the stack requires bundling or not. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.dependencies">dependencies</a></code> | <code>aws-cdk-lib.Stack[]</code> | Return the stacks this stack depends on. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.environment">environment</a></code> | <code>string</code> | The environment coordinates in which this stack is deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.nested">nested</a></code> | <code>boolean</code> | Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.notificationArns">notificationArns</a></code> | <code>string[]</code> | Returns the list of notification Amazon Resource Names (ARNs) for the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.partition">partition</a></code> | <code>string</code> | The partition in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.region">region</a></code> | <code>string</code> | The AWS region into which this stack will be deployed (e.g. `us-west-2`). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.stackId">stackId</a></code> | <code>string</code> | The ID of the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.stackName">stackName</a></code> | <code>string</code> | The concrete CloudFormation physical stack name. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.tags">tags</a></code> | <code>aws-cdk-lib.TagManager</code> | Tags to be applied to the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.templateFile">templateFile</a></code> | <code>string</code> | The name of the CloudFormation template file emitted to the output directory during synthesis. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.templateOptions">templateOptions</a></code> | <code>aws-cdk-lib.ITemplateOptions</code> | Options for CloudFormation template (like version, transform, description). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.urlSuffix">urlSuffix</a></code> | <code>string</code> | The Amazon domain suffix for the region in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.nestedStackParent">nestedStackParent</a></code> | <code>aws-cdk-lib.Stack</code> | If this is a nested stack, returns it's parent stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.nestedStackResource">nestedStackResource</a></code> | <code>aws-cdk-lib.CfnResource</code> | If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether termination protection is enabled for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.pipelineEnvVars">pipelineEnvVars</a></code> | <code>{[ key: string ]: string}</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.pipelineInput">pipelineInput</a></code> | <code>aws-cdk-lib.pipelines.IFileSetProducer</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.repositoryBranch">repositoryBranch</a></code> | <code>string</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `account`<sup>Required</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

The AWS account into which this stack will be deployed.

This value is resolved according to the following rules:

1. The value provided to `env.account` when the stack is defined. This can
   either be a concrete account (e.g. `585695031111`) or the
   `Aws.ACCOUNT_ID` token.
3. `Aws.ACCOUNT_ID`, which represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::AccountId" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.account)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **account-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `artifactId`<sup>Required</sup> <a name="artifactId" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.artifactId"></a>

```typescript
public readonly artifactId: string;
```

- *Type:* string

The ID of the cloud assembly artifact for this stack.

---

##### `availabilityZones`<sup>Required</sup> <a name="availabilityZones" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.availabilityZones"></a>

```typescript
public readonly availabilityZones: string[];
```

- *Type:* string[]

Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack.

If the stack is environment-agnostic (either account and/or region are
tokens), this property will return an array with 2 tokens that will resolve
at deploy-time to the first two availability zones returned from CloudFormation's
`Fn::GetAZs` intrinsic function.

If they are not available in the context, returns a set of dummy values and
reports them as missing, and let the CLI resolve them by calling EC2
`DescribeAvailabilityZones` on the target environment.

To specify a different strategy for selecting availability zones override this method.

---

##### `bundlingRequired`<sup>Required</sup> <a name="bundlingRequired" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.bundlingRequired"></a>

```typescript
public readonly bundlingRequired: boolean;
```

- *Type:* boolean

Indicates whether the stack requires bundling or not.

---

##### `dependencies`<sup>Required</sup> <a name="dependencies" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.dependencies"></a>

```typescript
public readonly dependencies: Stack[];
```

- *Type:* aws-cdk-lib.Stack[]

Return the stacks this stack depends on.

---

##### `environment`<sup>Required</sup> <a name="environment" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.environment"></a>

```typescript
public readonly environment: string;
```

- *Type:* string

The environment coordinates in which this stack is deployed.

In the form
`aws://account/region`. Use `stack.account` and `stack.region` to obtain
the specific values, no need to parse.

You can use this value to determine if two stacks are targeting the same
environment.

If either `stack.account` or `stack.region` are not concrete values (e.g.
`Aws.ACCOUNT_ID` or `Aws.REGION`) the special strings `unknown-account` and/or
`unknown-region` will be used respectively to indicate this stack is
region/account-agnostic.

---

##### `nested`<sup>Required</sup> <a name="nested" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.nested"></a>

```typescript
public readonly nested: boolean;
```

- *Type:* boolean

Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent.

---

##### `notificationArns`<sup>Required</sup> <a name="notificationArns" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.notificationArns"></a>

```typescript
public readonly notificationArns: string[];
```

- *Type:* string[]

Returns the list of notification Amazon Resource Names (ARNs) for the current stack.

---

##### `partition`<sup>Required</sup> <a name="partition" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.partition"></a>

```typescript
public readonly partition: string;
```

- *Type:* string

The partition in which this stack is defined.

---

##### `region`<sup>Required</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

The AWS region into which this stack will be deployed (e.g. `us-west-2`).

This value is resolved according to the following rules:

1. The value provided to `env.region` when the stack is defined. This can
   either be a concrete region (e.g. `us-west-2`) or the `Aws.REGION`
   token.
3. `Aws.REGION`, which is represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::Region" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.region)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **region-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `stackId`<sup>Required</sup> <a name="stackId" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.stackId"></a>

```typescript
public readonly stackId: string;
```

- *Type:* string

The ID of the stack.

---

*Example*

```typescript
// After resolving, looks like
'arn:aws:cloudformation:us-west-2:123456789012:stack/teststack/51af3dc0-da77-11e4-872e-1234567db123'
```


##### `stackName`<sup>Required</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string

The concrete CloudFormation physical stack name.

This is either the name defined explicitly in the `stackName` prop or
allocated based on the stack's location in the construct tree. Stacks that
are directly defined under the app use their construct `id` as their stack
name. Stacks that are defined deeper within the tree will use a hashed naming
scheme based on the construct path to ensure uniqueness.

If you wish to obtain the deploy-time AWS::StackName intrinsic,
you can use `Aws.STACK_NAME` directly.

---

##### `synthesizer`<sup>Required</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer

Synthesis method for this stack.

---

##### `tags`<sup>Required</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.tags"></a>

```typescript
public readonly tags: TagManager;
```

- *Type:* aws-cdk-lib.TagManager

Tags to be applied to the stack.

---

##### `templateFile`<sup>Required</sup> <a name="templateFile" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.templateFile"></a>

```typescript
public readonly templateFile: string;
```

- *Type:* string

The name of the CloudFormation template file emitted to the output directory during synthesis.

Example value: `MyStack.template.json`

---

##### `templateOptions`<sup>Required</sup> <a name="templateOptions" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.templateOptions"></a>

```typescript
public readonly templateOptions: ITemplateOptions;
```

- *Type:* aws-cdk-lib.ITemplateOptions

Options for CloudFormation template (like version, transform, description).

---

##### `urlSuffix`<sup>Required</sup> <a name="urlSuffix" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.urlSuffix"></a>

```typescript
public readonly urlSuffix: string;
```

- *Type:* string

The Amazon domain suffix for the region in which this stack is defined.

---

##### `nestedStackParent`<sup>Optional</sup> <a name="nestedStackParent" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.nestedStackParent"></a>

```typescript
public readonly nestedStackParent: Stack;
```

- *Type:* aws-cdk-lib.Stack

If this is a nested stack, returns it's parent stack.

---

##### `nestedStackResource`<sup>Optional</sup> <a name="nestedStackResource" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.nestedStackResource"></a>

```typescript
public readonly nestedStackResource: CfnResource;
```

- *Type:* aws-cdk-lib.CfnResource

If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource.

`undefined` for top-level (non-nested) stacks.

---

##### `terminationProtection`<sup>Required</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean

Whether termination protection is enabled for this stack.

---

##### `pipelineEnvVars`<sup>Required</sup> <a name="pipelineEnvVars" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.pipelineEnvVars"></a>

```typescript
public readonly pipelineEnvVars: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}

---

##### `pipelineInput`<sup>Required</sup> <a name="pipelineInput" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.pipelineInput"></a>

```typescript
public readonly pipelineInput: IFileSetProducer;
```

- *Type:* aws-cdk-lib.pipelines.IFileSetProducer

---

##### `repositoryBranch`<sup>Required</sup> <a name="repositoryBranch" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack.property.repositoryBranch"></a>

```typescript
public readonly repositoryBranch: string;
```

- *Type:* string

---


### ComplianceLogBucketStack <a name="ComplianceLogBucketStack" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IComplianceBucketConfig">IComplianceBucketConfig</a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.Initializer"></a>

```typescript
import { ComplianceLogBucketStack } from '@cdklabs/cdk-cicd-wrapper'

new ComplianceLogBucketStack(scope: Construct, id: string, props: ComplianceLogBucketStackProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps">ComplianceLogBucketStackProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps">ComplianceLogBucketStackProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.addDependency">addDependency</a></code> | Add a dependency between this stack and another stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.addMetadata">addMetadata</a></code> | Adds an arbitary key-value pair, with information you want to record about the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.addTransform">addTransform</a></code> | Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.exportStringListValue">exportStringListValue</a></code> | Create a CloudFormation Export for a string list value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.exportValue">exportValue</a></code> | Create a CloudFormation Export for a string value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.formatArn">formatArn</a></code> | Creates an ARN from components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.getLogicalId">getLogicalId</a></code> | Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.regionalFact">regionalFact</a></code> | Look up a fact value for the given fact for the region of this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.renameLogicalId">renameLogicalId</a></code> | Rename a generated logical identities. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.reportMissingContextKey">reportMissingContextKey</a></code> | Indicate that a context key was expected. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.resolve">resolve</a></code> | Resolve a tokenized value in the context of the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.splitArn">splitArn</a></code> | Splits the provided ARN into its components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.toJsonString">toJsonString</a></code> | Convert an object, potentially containing tokens, to a JSON string. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.toYamlString">toYamlString</a></code> | Convert an object, potentially containing tokens, to a YAML string. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addDependency` <a name="addDependency" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.addDependency"></a>

```typescript
public addDependency(target: Stack, reason?: string): void
```

Add a dependency between this stack and another stack.

This can be used to define dependencies between any two stacks within an
app, and also supports nested stacks.

###### `target`<sup>Required</sup> <a name="target" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.addDependency.parameter.target"></a>

- *Type:* aws-cdk-lib.Stack

---

###### `reason`<sup>Optional</sup> <a name="reason" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.addDependency.parameter.reason"></a>

- *Type:* string

---

##### `addMetadata` <a name="addMetadata" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.addMetadata"></a>

```typescript
public addMetadata(key: string, value: any): void
```

Adds an arbitary key-value pair, with information you want to record about the stack.

These get translated to the Metadata section of the generated template.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html)

###### `key`<sup>Required</sup> <a name="key" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.addMetadata.parameter.key"></a>

- *Type:* string

---

###### `value`<sup>Required</sup> <a name="value" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.addMetadata.parameter.value"></a>

- *Type:* any

---

##### `addTransform` <a name="addTransform" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.addTransform"></a>

```typescript
public addTransform(transform: string): void
```

Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template.

Duplicate values are removed when stack is synthesized.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html)

*Example*

```typescript
declare const stack: Stack;

stack.addTransform('AWS::Serverless-2016-10-31')
```


###### `transform`<sup>Required</sup> <a name="transform" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.addTransform.parameter.transform"></a>

- *Type:* string

The transform to add.

---

##### `exportStringListValue` <a name="exportStringListValue" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.exportStringListValue"></a>

```typescript
public exportStringListValue(exportedValue: any, options?: ExportValueOptions): string[]
```

Create a CloudFormation Export for a string list value.

Returns a string list representing the corresponding `Fn.importValue()`
expression for this Export. The export expression is automatically wrapped with an
`Fn::Join` and the import value with an `Fn::Split`, since CloudFormation can only
export strings. You can control the name for the export by passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

See `exportValue` for an example of this process.

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.exportStringListValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.exportStringListValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `exportValue` <a name="exportValue" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.exportValue"></a>

```typescript
public exportValue(exportedValue: any, options?: ExportValueOptions): string
```

Create a CloudFormation Export for a string value.

Returns a string representing the corresponding `Fn.importValue()`
expression for this Export. You can control the name for the export by
passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

## Example

Here is how the process works. Let's say there are two stacks,
`producerStack` and `consumerStack`, and `producerStack` has a bucket
called `bucket`, which is referenced by `consumerStack` (perhaps because
an AWS Lambda Function writes into it, or something like that).

It is not safe to remove `producerStack.bucket` because as the bucket is being
deleted, `consumerStack` might still be using it.

Instead, the process takes two deployments:

### Deployment 1: break the relationship

- Make sure `consumerStack` no longer references `bucket.bucketName` (maybe the consumer
  stack now uses its own bucket, or it writes to an AWS DynamoDB table, or maybe you just
  remove the Lambda Function altogether).
- In the `ProducerStack` class, call `this.exportValue(this.bucket.bucketName)`. This
  will make sure the CloudFormation Export continues to exist while the relationship
  between the two stacks is being broken.
- Deploy (this will effectively only change the `consumerStack`, but it's safe to deploy both).

### Deployment 2: remove the bucket resource

- You are now free to remove the `bucket` resource from `producerStack`.
- Don't forget to remove the `exportValue()` call as well.
- Deploy again (this time only the `producerStack` will be changed -- the bucket will be deleted).

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.exportValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.exportValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `formatArn` <a name="formatArn" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.formatArn"></a>

```typescript
public formatArn(components: ArnComponents): string
```

Creates an ARN from components.

If `partition`, `region` or `account` are not specified, the stack's
partition, region and account will be used.

If any component is the empty string, an empty string will be inserted
into the generated ARN at the location that component corresponds to.

The ARN will be formatted as follows:

  arn:{partition}:{service}:{region}:{account}:{resource}{sep}{resource-name}

The required ARN pieces that are omitted will be taken from the stack that
the 'scope' is attached to. If all ARN pieces are supplied, the supplied scope
can be 'undefined'.

###### `components`<sup>Required</sup> <a name="components" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.formatArn.parameter.components"></a>

- *Type:* aws-cdk-lib.ArnComponents

---

##### `getLogicalId` <a name="getLogicalId" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.getLogicalId"></a>

```typescript
public getLogicalId(element: CfnElement): string
```

Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource.

This method is called when a `CfnElement` is created and used to render the
initial logical identity of resources. Logical ID renames are applied at
this stage.

This method uses the protected method `allocateLogicalId` to render the
logical ID for an element. To modify the naming scheme, extend the `Stack`
class and override this method.

###### `element`<sup>Required</sup> <a name="element" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.getLogicalId.parameter.element"></a>

- *Type:* aws-cdk-lib.CfnElement

The CloudFormation element for which a logical identity is needed.

---

##### `regionalFact` <a name="regionalFact" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.regionalFact"></a>

```typescript
public regionalFact(factName: string, defaultValue?: string): string
```

Look up a fact value for the given fact for the region of this stack.

Will return a definite value only if the region of the current stack is resolved.
If not, a lookup map will be added to the stack and the lookup will be done at
CDK deployment time.

What regions will be included in the lookup map is controlled by the
`@aws-cdk/core:target-partitions` context value: it must be set to a list
of partitions, and only regions from the given partitions will be included.
If no such context key is set, all regions will be included.

This function is intended to be used by construct library authors. Application
builders can rely on the abstractions offered by construct libraries and do
not have to worry about regional facts.

If `defaultValue` is not given, it is an error if the fact is unknown for
the given region.

###### `factName`<sup>Required</sup> <a name="factName" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.regionalFact.parameter.factName"></a>

- *Type:* string

---

###### `defaultValue`<sup>Optional</sup> <a name="defaultValue" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.regionalFact.parameter.defaultValue"></a>

- *Type:* string

---

##### `renameLogicalId` <a name="renameLogicalId" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.renameLogicalId"></a>

```typescript
public renameLogicalId(oldId: string, newId: string): void
```

Rename a generated logical identities.

To modify the naming scheme strategy, extend the `Stack` class and
override the `allocateLogicalId` method.

###### `oldId`<sup>Required</sup> <a name="oldId" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.renameLogicalId.parameter.oldId"></a>

- *Type:* string

---

###### `newId`<sup>Required</sup> <a name="newId" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.renameLogicalId.parameter.newId"></a>

- *Type:* string

---

##### `reportMissingContextKey` <a name="reportMissingContextKey" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.reportMissingContextKey"></a>

```typescript
public reportMissingContextKey(report: MissingContext): void
```

Indicate that a context key was expected.

Contains instructions which will be emitted into the cloud assembly on how
the key should be supplied.

###### `report`<sup>Required</sup> <a name="report" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.reportMissingContextKey.parameter.report"></a>

- *Type:* aws-cdk-lib.cloud_assembly_schema.MissingContext

The set of parameters needed to obtain the context.

---

##### `resolve` <a name="resolve" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.resolve"></a>

```typescript
public resolve(obj: any): any
```

Resolve a tokenized value in the context of the current stack.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.resolve.parameter.obj"></a>

- *Type:* any

---

##### `splitArn` <a name="splitArn" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.splitArn"></a>

```typescript
public splitArn(arn: string, arnFormat: ArnFormat): ArnComponents
```

Splits the provided ARN into its components.

Works both if 'arn' is a string like 'arn:aws:s3:::bucket',
and a Token representing a dynamic CloudFormation expression
(in which case the returned components will also be dynamic CloudFormation expressions,
encoded as Tokens).

###### `arn`<sup>Required</sup> <a name="arn" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.splitArn.parameter.arn"></a>

- *Type:* string

the ARN to split into its components.

---

###### `arnFormat`<sup>Required</sup> <a name="arnFormat" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.splitArn.parameter.arnFormat"></a>

- *Type:* aws-cdk-lib.ArnFormat

the expected format of 'arn' - depends on what format the service 'arn' represents uses.

---

##### `toJsonString` <a name="toJsonString" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.toJsonString"></a>

```typescript
public toJsonString(obj: any, space?: number): string
```

Convert an object, potentially containing tokens, to a JSON string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.toJsonString.parameter.obj"></a>

- *Type:* any

---

###### `space`<sup>Optional</sup> <a name="space" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.toJsonString.parameter.space"></a>

- *Type:* number

---

##### `toYamlString` <a name="toYamlString" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.toYamlString"></a>

```typescript
public toYamlString(obj: any): string
```

Convert an object, potentially containing tokens, to a YAML string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.toYamlString.parameter.obj"></a>

- *Type:* any

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.isStack">isStack</a></code> | Return whether the given object is a Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.of">of</a></code> | Looks up the first stack scope in which `construct` is defined. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.isConstruct"></a>

```typescript
import { ComplianceLogBucketStack } from '@cdklabs/cdk-cicd-wrapper'

ComplianceLogBucketStack.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `isStack` <a name="isStack" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.isStack"></a>

```typescript
import { ComplianceLogBucketStack } from '@cdklabs/cdk-cicd-wrapper'

ComplianceLogBucketStack.isStack(x: any)
```

Return whether the given object is a Stack.

We do attribute detection since we can't reliably use 'instanceof'.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.isStack.parameter.x"></a>

- *Type:* any

---

##### `of` <a name="of" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.of"></a>

```typescript
import { ComplianceLogBucketStack } from '@cdklabs/cdk-cicd-wrapper'

ComplianceLogBucketStack.of(construct: IConstruct)
```

Looks up the first stack scope in which `construct` is defined.

Fails if there is no stack up the tree.

###### `construct`<sup>Required</sup> <a name="construct" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.of.parameter.construct"></a>

- *Type:* constructs.IConstruct

The construct to start the search from.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.account">account</a></code> | <code>string</code> | The AWS account into which this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.artifactId">artifactId</a></code> | <code>string</code> | The ID of the cloud assembly artifact for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.availabilityZones">availabilityZones</a></code> | <code>string[]</code> | Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.bundlingRequired">bundlingRequired</a></code> | <code>boolean</code> | Indicates whether the stack requires bundling or not. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.dependencies">dependencies</a></code> | <code>aws-cdk-lib.Stack[]</code> | Return the stacks this stack depends on. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.environment">environment</a></code> | <code>string</code> | The environment coordinates in which this stack is deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.nested">nested</a></code> | <code>boolean</code> | Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.notificationArns">notificationArns</a></code> | <code>string[]</code> | Returns the list of notification Amazon Resource Names (ARNs) for the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.partition">partition</a></code> | <code>string</code> | The partition in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.region">region</a></code> | <code>string</code> | The AWS region into which this stack will be deployed (e.g. `us-west-2`). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.stackId">stackId</a></code> | <code>string</code> | The ID of the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.stackName">stackName</a></code> | <code>string</code> | The concrete CloudFormation physical stack name. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.tags">tags</a></code> | <code>aws-cdk-lib.TagManager</code> | Tags to be applied to the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.templateFile">templateFile</a></code> | <code>string</code> | The name of the CloudFormation template file emitted to the output directory during synthesis. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.templateOptions">templateOptions</a></code> | <code>aws-cdk-lib.ITemplateOptions</code> | Options for CloudFormation template (like version, transform, description). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.urlSuffix">urlSuffix</a></code> | <code>string</code> | The Amazon domain suffix for the region in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.nestedStackParent">nestedStackParent</a></code> | <code>aws-cdk-lib.Stack</code> | If this is a nested stack, returns it's parent stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.nestedStackResource">nestedStackResource</a></code> | <code>aws-cdk-lib.CfnResource</code> | If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether termination protection is enabled for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.bucketName">bucketName</a></code> | <code>string</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `account`<sup>Required</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

The AWS account into which this stack will be deployed.

This value is resolved according to the following rules:

1. The value provided to `env.account` when the stack is defined. This can
   either be a concrete account (e.g. `585695031111`) or the
   `Aws.ACCOUNT_ID` token.
3. `Aws.ACCOUNT_ID`, which represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::AccountId" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.account)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **account-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `artifactId`<sup>Required</sup> <a name="artifactId" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.artifactId"></a>

```typescript
public readonly artifactId: string;
```

- *Type:* string

The ID of the cloud assembly artifact for this stack.

---

##### `availabilityZones`<sup>Required</sup> <a name="availabilityZones" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.availabilityZones"></a>

```typescript
public readonly availabilityZones: string[];
```

- *Type:* string[]

Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack.

If the stack is environment-agnostic (either account and/or region are
tokens), this property will return an array with 2 tokens that will resolve
at deploy-time to the first two availability zones returned from CloudFormation's
`Fn::GetAZs` intrinsic function.

If they are not available in the context, returns a set of dummy values and
reports them as missing, and let the CLI resolve them by calling EC2
`DescribeAvailabilityZones` on the target environment.

To specify a different strategy for selecting availability zones override this method.

---

##### `bundlingRequired`<sup>Required</sup> <a name="bundlingRequired" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.bundlingRequired"></a>

```typescript
public readonly bundlingRequired: boolean;
```

- *Type:* boolean

Indicates whether the stack requires bundling or not.

---

##### `dependencies`<sup>Required</sup> <a name="dependencies" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.dependencies"></a>

```typescript
public readonly dependencies: Stack[];
```

- *Type:* aws-cdk-lib.Stack[]

Return the stacks this stack depends on.

---

##### `environment`<sup>Required</sup> <a name="environment" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.environment"></a>

```typescript
public readonly environment: string;
```

- *Type:* string

The environment coordinates in which this stack is deployed.

In the form
`aws://account/region`. Use `stack.account` and `stack.region` to obtain
the specific values, no need to parse.

You can use this value to determine if two stacks are targeting the same
environment.

If either `stack.account` or `stack.region` are not concrete values (e.g.
`Aws.ACCOUNT_ID` or `Aws.REGION`) the special strings `unknown-account` and/or
`unknown-region` will be used respectively to indicate this stack is
region/account-agnostic.

---

##### `nested`<sup>Required</sup> <a name="nested" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.nested"></a>

```typescript
public readonly nested: boolean;
```

- *Type:* boolean

Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent.

---

##### `notificationArns`<sup>Required</sup> <a name="notificationArns" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.notificationArns"></a>

```typescript
public readonly notificationArns: string[];
```

- *Type:* string[]

Returns the list of notification Amazon Resource Names (ARNs) for the current stack.

---

##### `partition`<sup>Required</sup> <a name="partition" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.partition"></a>

```typescript
public readonly partition: string;
```

- *Type:* string

The partition in which this stack is defined.

---

##### `region`<sup>Required</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

The AWS region into which this stack will be deployed (e.g. `us-west-2`).

This value is resolved according to the following rules:

1. The value provided to `env.region` when the stack is defined. This can
   either be a concrete region (e.g. `us-west-2`) or the `Aws.REGION`
   token.
3. `Aws.REGION`, which is represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::Region" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.region)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **region-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `stackId`<sup>Required</sup> <a name="stackId" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.stackId"></a>

```typescript
public readonly stackId: string;
```

- *Type:* string

The ID of the stack.

---

*Example*

```typescript
// After resolving, looks like
'arn:aws:cloudformation:us-west-2:123456789012:stack/teststack/51af3dc0-da77-11e4-872e-1234567db123'
```


##### `stackName`<sup>Required</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string

The concrete CloudFormation physical stack name.

This is either the name defined explicitly in the `stackName` prop or
allocated based on the stack's location in the construct tree. Stacks that
are directly defined under the app use their construct `id` as their stack
name. Stacks that are defined deeper within the tree will use a hashed naming
scheme based on the construct path to ensure uniqueness.

If you wish to obtain the deploy-time AWS::StackName intrinsic,
you can use `Aws.STACK_NAME` directly.

---

##### `synthesizer`<sup>Required</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer

Synthesis method for this stack.

---

##### `tags`<sup>Required</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.tags"></a>

```typescript
public readonly tags: TagManager;
```

- *Type:* aws-cdk-lib.TagManager

Tags to be applied to the stack.

---

##### `templateFile`<sup>Required</sup> <a name="templateFile" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.templateFile"></a>

```typescript
public readonly templateFile: string;
```

- *Type:* string

The name of the CloudFormation template file emitted to the output directory during synthesis.

Example value: `MyStack.template.json`

---

##### `templateOptions`<sup>Required</sup> <a name="templateOptions" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.templateOptions"></a>

```typescript
public readonly templateOptions: ITemplateOptions;
```

- *Type:* aws-cdk-lib.ITemplateOptions

Options for CloudFormation template (like version, transform, description).

---

##### `urlSuffix`<sup>Required</sup> <a name="urlSuffix" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.urlSuffix"></a>

```typescript
public readonly urlSuffix: string;
```

- *Type:* string

The Amazon domain suffix for the region in which this stack is defined.

---

##### `nestedStackParent`<sup>Optional</sup> <a name="nestedStackParent" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.nestedStackParent"></a>

```typescript
public readonly nestedStackParent: Stack;
```

- *Type:* aws-cdk-lib.Stack

If this is a nested stack, returns it's parent stack.

---

##### `nestedStackResource`<sup>Optional</sup> <a name="nestedStackResource" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.nestedStackResource"></a>

```typescript
public readonly nestedStackResource: CfnResource;
```

- *Type:* aws-cdk-lib.CfnResource

If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource.

`undefined` for top-level (non-nested) stacks.

---

##### `terminationProtection`<sup>Required</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean

Whether termination protection is enabled for this stack.

---

##### `bucketName`<sup>Required</sup> <a name="bucketName" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack.property.bucketName"></a>

```typescript
public readonly bucketName: string;
```

- *Type:* string

---


### EncryptionStack <a name="EncryptionStack" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.Initializer"></a>

```typescript
import { EncryptionStack } from '@cdklabs/cdk-cicd-wrapper'

new EncryptionStack(scope: Construct, id: string, props: EncryptionStackProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps">EncryptionStackProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps">EncryptionStackProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.addDependency">addDependency</a></code> | Add a dependency between this stack and another stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.addMetadata">addMetadata</a></code> | Adds an arbitary key-value pair, with information you want to record about the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.addTransform">addTransform</a></code> | Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.exportStringListValue">exportStringListValue</a></code> | Create a CloudFormation Export for a string list value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.exportValue">exportValue</a></code> | Create a CloudFormation Export for a string value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.formatArn">formatArn</a></code> | Creates an ARN from components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.getLogicalId">getLogicalId</a></code> | Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.regionalFact">regionalFact</a></code> | Look up a fact value for the given fact for the region of this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.renameLogicalId">renameLogicalId</a></code> | Rename a generated logical identities. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.reportMissingContextKey">reportMissingContextKey</a></code> | Indicate that a context key was expected. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.resolve">resolve</a></code> | Resolve a tokenized value in the context of the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.splitArn">splitArn</a></code> | Splits the provided ARN into its components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.toJsonString">toJsonString</a></code> | Convert an object, potentially containing tokens, to a JSON string. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.toYamlString">toYamlString</a></code> | Convert an object, potentially containing tokens, to a YAML string. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addDependency` <a name="addDependency" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.addDependency"></a>

```typescript
public addDependency(target: Stack, reason?: string): void
```

Add a dependency between this stack and another stack.

This can be used to define dependencies between any two stacks within an
app, and also supports nested stacks.

###### `target`<sup>Required</sup> <a name="target" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.addDependency.parameter.target"></a>

- *Type:* aws-cdk-lib.Stack

---

###### `reason`<sup>Optional</sup> <a name="reason" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.addDependency.parameter.reason"></a>

- *Type:* string

---

##### `addMetadata` <a name="addMetadata" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.addMetadata"></a>

```typescript
public addMetadata(key: string, value: any): void
```

Adds an arbitary key-value pair, with information you want to record about the stack.

These get translated to the Metadata section of the generated template.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html)

###### `key`<sup>Required</sup> <a name="key" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.addMetadata.parameter.key"></a>

- *Type:* string

---

###### `value`<sup>Required</sup> <a name="value" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.addMetadata.parameter.value"></a>

- *Type:* any

---

##### `addTransform` <a name="addTransform" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.addTransform"></a>

```typescript
public addTransform(transform: string): void
```

Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template.

Duplicate values are removed when stack is synthesized.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html)

*Example*

```typescript
declare const stack: Stack;

stack.addTransform('AWS::Serverless-2016-10-31')
```


###### `transform`<sup>Required</sup> <a name="transform" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.addTransform.parameter.transform"></a>

- *Type:* string

The transform to add.

---

##### `exportStringListValue` <a name="exportStringListValue" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.exportStringListValue"></a>

```typescript
public exportStringListValue(exportedValue: any, options?: ExportValueOptions): string[]
```

Create a CloudFormation Export for a string list value.

Returns a string list representing the corresponding `Fn.importValue()`
expression for this Export. The export expression is automatically wrapped with an
`Fn::Join` and the import value with an `Fn::Split`, since CloudFormation can only
export strings. You can control the name for the export by passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

See `exportValue` for an example of this process.

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.exportStringListValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.exportStringListValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `exportValue` <a name="exportValue" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.exportValue"></a>

```typescript
public exportValue(exportedValue: any, options?: ExportValueOptions): string
```

Create a CloudFormation Export for a string value.

Returns a string representing the corresponding `Fn.importValue()`
expression for this Export. You can control the name for the export by
passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

## Example

Here is how the process works. Let's say there are two stacks,
`producerStack` and `consumerStack`, and `producerStack` has a bucket
called `bucket`, which is referenced by `consumerStack` (perhaps because
an AWS Lambda Function writes into it, or something like that).

It is not safe to remove `producerStack.bucket` because as the bucket is being
deleted, `consumerStack` might still be using it.

Instead, the process takes two deployments:

### Deployment 1: break the relationship

- Make sure `consumerStack` no longer references `bucket.bucketName` (maybe the consumer
  stack now uses its own bucket, or it writes to an AWS DynamoDB table, or maybe you just
  remove the Lambda Function altogether).
- In the `ProducerStack` class, call `this.exportValue(this.bucket.bucketName)`. This
  will make sure the CloudFormation Export continues to exist while the relationship
  between the two stacks is being broken.
- Deploy (this will effectively only change the `consumerStack`, but it's safe to deploy both).

### Deployment 2: remove the bucket resource

- You are now free to remove the `bucket` resource from `producerStack`.
- Don't forget to remove the `exportValue()` call as well.
- Deploy again (this time only the `producerStack` will be changed -- the bucket will be deleted).

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.exportValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.exportValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `formatArn` <a name="formatArn" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.formatArn"></a>

```typescript
public formatArn(components: ArnComponents): string
```

Creates an ARN from components.

If `partition`, `region` or `account` are not specified, the stack's
partition, region and account will be used.

If any component is the empty string, an empty string will be inserted
into the generated ARN at the location that component corresponds to.

The ARN will be formatted as follows:

  arn:{partition}:{service}:{region}:{account}:{resource}{sep}{resource-name}

The required ARN pieces that are omitted will be taken from the stack that
the 'scope' is attached to. If all ARN pieces are supplied, the supplied scope
can be 'undefined'.

###### `components`<sup>Required</sup> <a name="components" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.formatArn.parameter.components"></a>

- *Type:* aws-cdk-lib.ArnComponents

---

##### `getLogicalId` <a name="getLogicalId" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.getLogicalId"></a>

```typescript
public getLogicalId(element: CfnElement): string
```

Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource.

This method is called when a `CfnElement` is created and used to render the
initial logical identity of resources. Logical ID renames are applied at
this stage.

This method uses the protected method `allocateLogicalId` to render the
logical ID for an element. To modify the naming scheme, extend the `Stack`
class and override this method.

###### `element`<sup>Required</sup> <a name="element" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.getLogicalId.parameter.element"></a>

- *Type:* aws-cdk-lib.CfnElement

The CloudFormation element for which a logical identity is needed.

---

##### `regionalFact` <a name="regionalFact" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.regionalFact"></a>

```typescript
public regionalFact(factName: string, defaultValue?: string): string
```

Look up a fact value for the given fact for the region of this stack.

Will return a definite value only if the region of the current stack is resolved.
If not, a lookup map will be added to the stack and the lookup will be done at
CDK deployment time.

What regions will be included in the lookup map is controlled by the
`@aws-cdk/core:target-partitions` context value: it must be set to a list
of partitions, and only regions from the given partitions will be included.
If no such context key is set, all regions will be included.

This function is intended to be used by construct library authors. Application
builders can rely on the abstractions offered by construct libraries and do
not have to worry about regional facts.

If `defaultValue` is not given, it is an error if the fact is unknown for
the given region.

###### `factName`<sup>Required</sup> <a name="factName" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.regionalFact.parameter.factName"></a>

- *Type:* string

---

###### `defaultValue`<sup>Optional</sup> <a name="defaultValue" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.regionalFact.parameter.defaultValue"></a>

- *Type:* string

---

##### `renameLogicalId` <a name="renameLogicalId" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.renameLogicalId"></a>

```typescript
public renameLogicalId(oldId: string, newId: string): void
```

Rename a generated logical identities.

To modify the naming scheme strategy, extend the `Stack` class and
override the `allocateLogicalId` method.

###### `oldId`<sup>Required</sup> <a name="oldId" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.renameLogicalId.parameter.oldId"></a>

- *Type:* string

---

###### `newId`<sup>Required</sup> <a name="newId" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.renameLogicalId.parameter.newId"></a>

- *Type:* string

---

##### `reportMissingContextKey` <a name="reportMissingContextKey" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.reportMissingContextKey"></a>

```typescript
public reportMissingContextKey(report: MissingContext): void
```

Indicate that a context key was expected.

Contains instructions which will be emitted into the cloud assembly on how
the key should be supplied.

###### `report`<sup>Required</sup> <a name="report" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.reportMissingContextKey.parameter.report"></a>

- *Type:* aws-cdk-lib.cloud_assembly_schema.MissingContext

The set of parameters needed to obtain the context.

---

##### `resolve` <a name="resolve" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.resolve"></a>

```typescript
public resolve(obj: any): any
```

Resolve a tokenized value in the context of the current stack.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.resolve.parameter.obj"></a>

- *Type:* any

---

##### `splitArn` <a name="splitArn" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.splitArn"></a>

```typescript
public splitArn(arn: string, arnFormat: ArnFormat): ArnComponents
```

Splits the provided ARN into its components.

Works both if 'arn' is a string like 'arn:aws:s3:::bucket',
and a Token representing a dynamic CloudFormation expression
(in which case the returned components will also be dynamic CloudFormation expressions,
encoded as Tokens).

###### `arn`<sup>Required</sup> <a name="arn" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.splitArn.parameter.arn"></a>

- *Type:* string

the ARN to split into its components.

---

###### `arnFormat`<sup>Required</sup> <a name="arnFormat" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.splitArn.parameter.arnFormat"></a>

- *Type:* aws-cdk-lib.ArnFormat

the expected format of 'arn' - depends on what format the service 'arn' represents uses.

---

##### `toJsonString` <a name="toJsonString" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.toJsonString"></a>

```typescript
public toJsonString(obj: any, space?: number): string
```

Convert an object, potentially containing tokens, to a JSON string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.toJsonString.parameter.obj"></a>

- *Type:* any

---

###### `space`<sup>Optional</sup> <a name="space" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.toJsonString.parameter.space"></a>

- *Type:* number

---

##### `toYamlString` <a name="toYamlString" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.toYamlString"></a>

```typescript
public toYamlString(obj: any): string
```

Convert an object, potentially containing tokens, to a YAML string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.toYamlString.parameter.obj"></a>

- *Type:* any

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.isStack">isStack</a></code> | Return whether the given object is a Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.of">of</a></code> | Looks up the first stack scope in which `construct` is defined. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.isConstruct"></a>

```typescript
import { EncryptionStack } from '@cdklabs/cdk-cicd-wrapper'

EncryptionStack.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `isStack` <a name="isStack" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.isStack"></a>

```typescript
import { EncryptionStack } from '@cdklabs/cdk-cicd-wrapper'

EncryptionStack.isStack(x: any)
```

Return whether the given object is a Stack.

We do attribute detection since we can't reliably use 'instanceof'.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.isStack.parameter.x"></a>

- *Type:* any

---

##### `of` <a name="of" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.of"></a>

```typescript
import { EncryptionStack } from '@cdklabs/cdk-cicd-wrapper'

EncryptionStack.of(construct: IConstruct)
```

Looks up the first stack scope in which `construct` is defined.

Fails if there is no stack up the tree.

###### `construct`<sup>Required</sup> <a name="construct" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.of.parameter.construct"></a>

- *Type:* constructs.IConstruct

The construct to start the search from.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.account">account</a></code> | <code>string</code> | The AWS account into which this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.artifactId">artifactId</a></code> | <code>string</code> | The ID of the cloud assembly artifact for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.availabilityZones">availabilityZones</a></code> | <code>string[]</code> | Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.bundlingRequired">bundlingRequired</a></code> | <code>boolean</code> | Indicates whether the stack requires bundling or not. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.dependencies">dependencies</a></code> | <code>aws-cdk-lib.Stack[]</code> | Return the stacks this stack depends on. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.environment">environment</a></code> | <code>string</code> | The environment coordinates in which this stack is deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.nested">nested</a></code> | <code>boolean</code> | Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.notificationArns">notificationArns</a></code> | <code>string[]</code> | Returns the list of notification Amazon Resource Names (ARNs) for the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.partition">partition</a></code> | <code>string</code> | The partition in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.region">region</a></code> | <code>string</code> | The AWS region into which this stack will be deployed (e.g. `us-west-2`). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.stackId">stackId</a></code> | <code>string</code> | The ID of the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.stackName">stackName</a></code> | <code>string</code> | The concrete CloudFormation physical stack name. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.tags">tags</a></code> | <code>aws-cdk-lib.TagManager</code> | Tags to be applied to the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.templateFile">templateFile</a></code> | <code>string</code> | The name of the CloudFormation template file emitted to the output directory during synthesis. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.templateOptions">templateOptions</a></code> | <code>aws-cdk-lib.ITemplateOptions</code> | Options for CloudFormation template (like version, transform, description). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.urlSuffix">urlSuffix</a></code> | <code>string</code> | The Amazon domain suffix for the region in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.nestedStackParent">nestedStackParent</a></code> | <code>aws-cdk-lib.Stack</code> | If this is a nested stack, returns it's parent stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.nestedStackResource">nestedStackResource</a></code> | <code>aws-cdk-lib.CfnResource</code> | If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether termination protection is enabled for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.kmsKey">kmsKey</a></code> | <code>aws-cdk-lib.aws_kms.Key</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `account`<sup>Required</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

The AWS account into which this stack will be deployed.

This value is resolved according to the following rules:

1. The value provided to `env.account` when the stack is defined. This can
   either be a concrete account (e.g. `585695031111`) or the
   `Aws.ACCOUNT_ID` token.
3. `Aws.ACCOUNT_ID`, which represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::AccountId" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.account)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **account-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `artifactId`<sup>Required</sup> <a name="artifactId" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.artifactId"></a>

```typescript
public readonly artifactId: string;
```

- *Type:* string

The ID of the cloud assembly artifact for this stack.

---

##### `availabilityZones`<sup>Required</sup> <a name="availabilityZones" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.availabilityZones"></a>

```typescript
public readonly availabilityZones: string[];
```

- *Type:* string[]

Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack.

If the stack is environment-agnostic (either account and/or region are
tokens), this property will return an array with 2 tokens that will resolve
at deploy-time to the first two availability zones returned from CloudFormation's
`Fn::GetAZs` intrinsic function.

If they are not available in the context, returns a set of dummy values and
reports them as missing, and let the CLI resolve them by calling EC2
`DescribeAvailabilityZones` on the target environment.

To specify a different strategy for selecting availability zones override this method.

---

##### `bundlingRequired`<sup>Required</sup> <a name="bundlingRequired" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.bundlingRequired"></a>

```typescript
public readonly bundlingRequired: boolean;
```

- *Type:* boolean

Indicates whether the stack requires bundling or not.

---

##### `dependencies`<sup>Required</sup> <a name="dependencies" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.dependencies"></a>

```typescript
public readonly dependencies: Stack[];
```

- *Type:* aws-cdk-lib.Stack[]

Return the stacks this stack depends on.

---

##### `environment`<sup>Required</sup> <a name="environment" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.environment"></a>

```typescript
public readonly environment: string;
```

- *Type:* string

The environment coordinates in which this stack is deployed.

In the form
`aws://account/region`. Use `stack.account` and `stack.region` to obtain
the specific values, no need to parse.

You can use this value to determine if two stacks are targeting the same
environment.

If either `stack.account` or `stack.region` are not concrete values (e.g.
`Aws.ACCOUNT_ID` or `Aws.REGION`) the special strings `unknown-account` and/or
`unknown-region` will be used respectively to indicate this stack is
region/account-agnostic.

---

##### `nested`<sup>Required</sup> <a name="nested" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.nested"></a>

```typescript
public readonly nested: boolean;
```

- *Type:* boolean

Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent.

---

##### `notificationArns`<sup>Required</sup> <a name="notificationArns" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.notificationArns"></a>

```typescript
public readonly notificationArns: string[];
```

- *Type:* string[]

Returns the list of notification Amazon Resource Names (ARNs) for the current stack.

---

##### `partition`<sup>Required</sup> <a name="partition" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.partition"></a>

```typescript
public readonly partition: string;
```

- *Type:* string

The partition in which this stack is defined.

---

##### `region`<sup>Required</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

The AWS region into which this stack will be deployed (e.g. `us-west-2`).

This value is resolved according to the following rules:

1. The value provided to `env.region` when the stack is defined. This can
   either be a concrete region (e.g. `us-west-2`) or the `Aws.REGION`
   token.
3. `Aws.REGION`, which is represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::Region" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.region)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **region-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `stackId`<sup>Required</sup> <a name="stackId" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.stackId"></a>

```typescript
public readonly stackId: string;
```

- *Type:* string

The ID of the stack.

---

*Example*

```typescript
// After resolving, looks like
'arn:aws:cloudformation:us-west-2:123456789012:stack/teststack/51af3dc0-da77-11e4-872e-1234567db123'
```


##### `stackName`<sup>Required</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string

The concrete CloudFormation physical stack name.

This is either the name defined explicitly in the `stackName` prop or
allocated based on the stack's location in the construct tree. Stacks that
are directly defined under the app use their construct `id` as their stack
name. Stacks that are defined deeper within the tree will use a hashed naming
scheme based on the construct path to ensure uniqueness.

If you wish to obtain the deploy-time AWS::StackName intrinsic,
you can use `Aws.STACK_NAME` directly.

---

##### `synthesizer`<sup>Required</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer

Synthesis method for this stack.

---

##### `tags`<sup>Required</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.tags"></a>

```typescript
public readonly tags: TagManager;
```

- *Type:* aws-cdk-lib.TagManager

Tags to be applied to the stack.

---

##### `templateFile`<sup>Required</sup> <a name="templateFile" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.templateFile"></a>

```typescript
public readonly templateFile: string;
```

- *Type:* string

The name of the CloudFormation template file emitted to the output directory during synthesis.

Example value: `MyStack.template.json`

---

##### `templateOptions`<sup>Required</sup> <a name="templateOptions" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.templateOptions"></a>

```typescript
public readonly templateOptions: ITemplateOptions;
```

- *Type:* aws-cdk-lib.ITemplateOptions

Options for CloudFormation template (like version, transform, description).

---

##### `urlSuffix`<sup>Required</sup> <a name="urlSuffix" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.urlSuffix"></a>

```typescript
public readonly urlSuffix: string;
```

- *Type:* string

The Amazon domain suffix for the region in which this stack is defined.

---

##### `nestedStackParent`<sup>Optional</sup> <a name="nestedStackParent" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.nestedStackParent"></a>

```typescript
public readonly nestedStackParent: Stack;
```

- *Type:* aws-cdk-lib.Stack

If this is a nested stack, returns it's parent stack.

---

##### `nestedStackResource`<sup>Optional</sup> <a name="nestedStackResource" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.nestedStackResource"></a>

```typescript
public readonly nestedStackResource: CfnResource;
```

- *Type:* aws-cdk-lib.CfnResource

If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource.

`undefined` for top-level (non-nested) stacks.

---

##### `terminationProtection`<sup>Required</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean

Whether termination protection is enabled for this stack.

---

##### `kmsKey`<sup>Required</sup> <a name="kmsKey" id="@cdklabs/cdk-cicd-wrapper.EncryptionStack.property.kmsKey"></a>

```typescript
public readonly kmsKey: Key;
```

- *Type:* aws-cdk-lib.aws_kms.Key

---


### LogRetentionRoleStack <a name="LogRetentionRoleStack" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.Initializer"></a>

```typescript
import { LogRetentionRoleStack } from '@cdklabs/cdk-cicd-wrapper'

new LogRetentionRoleStack(scope: Construct, id: string, props: LogRetentionRoleStackProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps">LogRetentionRoleStackProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps">LogRetentionRoleStackProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.addDependency">addDependency</a></code> | Add a dependency between this stack and another stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.addMetadata">addMetadata</a></code> | Adds an arbitary key-value pair, with information you want to record about the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.addTransform">addTransform</a></code> | Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.exportStringListValue">exportStringListValue</a></code> | Create a CloudFormation Export for a string list value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.exportValue">exportValue</a></code> | Create a CloudFormation Export for a string value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.formatArn">formatArn</a></code> | Creates an ARN from components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getLogicalId">getLogicalId</a></code> | Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.regionalFact">regionalFact</a></code> | Look up a fact value for the given fact for the region of this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.renameLogicalId">renameLogicalId</a></code> | Rename a generated logical identities. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.reportMissingContextKey">reportMissingContextKey</a></code> | Indicate that a context key was expected. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.resolve">resolve</a></code> | Resolve a tokenized value in the context of the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.splitArn">splitArn</a></code> | Splits the provided ARN into its components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.toJsonString">toJsonString</a></code> | Convert an object, potentially containing tokens, to a JSON string. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.toYamlString">toYamlString</a></code> | Convert an object, potentially containing tokens, to a YAML string. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addDependency` <a name="addDependency" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.addDependency"></a>

```typescript
public addDependency(target: Stack, reason?: string): void
```

Add a dependency between this stack and another stack.

This can be used to define dependencies between any two stacks within an
app, and also supports nested stacks.

###### `target`<sup>Required</sup> <a name="target" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.addDependency.parameter.target"></a>

- *Type:* aws-cdk-lib.Stack

---

###### `reason`<sup>Optional</sup> <a name="reason" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.addDependency.parameter.reason"></a>

- *Type:* string

---

##### `addMetadata` <a name="addMetadata" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.addMetadata"></a>

```typescript
public addMetadata(key: string, value: any): void
```

Adds an arbitary key-value pair, with information you want to record about the stack.

These get translated to the Metadata section of the generated template.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html)

###### `key`<sup>Required</sup> <a name="key" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.addMetadata.parameter.key"></a>

- *Type:* string

---

###### `value`<sup>Required</sup> <a name="value" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.addMetadata.parameter.value"></a>

- *Type:* any

---

##### `addTransform` <a name="addTransform" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.addTransform"></a>

```typescript
public addTransform(transform: string): void
```

Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template.

Duplicate values are removed when stack is synthesized.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html)

*Example*

```typescript
declare const stack: Stack;

stack.addTransform('AWS::Serverless-2016-10-31')
```


###### `transform`<sup>Required</sup> <a name="transform" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.addTransform.parameter.transform"></a>

- *Type:* string

The transform to add.

---

##### `exportStringListValue` <a name="exportStringListValue" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.exportStringListValue"></a>

```typescript
public exportStringListValue(exportedValue: any, options?: ExportValueOptions): string[]
```

Create a CloudFormation Export for a string list value.

Returns a string list representing the corresponding `Fn.importValue()`
expression for this Export. The export expression is automatically wrapped with an
`Fn::Join` and the import value with an `Fn::Split`, since CloudFormation can only
export strings. You can control the name for the export by passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

See `exportValue` for an example of this process.

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.exportStringListValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.exportStringListValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `exportValue` <a name="exportValue" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.exportValue"></a>

```typescript
public exportValue(exportedValue: any, options?: ExportValueOptions): string
```

Create a CloudFormation Export for a string value.

Returns a string representing the corresponding `Fn.importValue()`
expression for this Export. You can control the name for the export by
passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

## Example

Here is how the process works. Let's say there are two stacks,
`producerStack` and `consumerStack`, and `producerStack` has a bucket
called `bucket`, which is referenced by `consumerStack` (perhaps because
an AWS Lambda Function writes into it, or something like that).

It is not safe to remove `producerStack.bucket` because as the bucket is being
deleted, `consumerStack` might still be using it.

Instead, the process takes two deployments:

### Deployment 1: break the relationship

- Make sure `consumerStack` no longer references `bucket.bucketName` (maybe the consumer
  stack now uses its own bucket, or it writes to an AWS DynamoDB table, or maybe you just
  remove the Lambda Function altogether).
- In the `ProducerStack` class, call `this.exportValue(this.bucket.bucketName)`. This
  will make sure the CloudFormation Export continues to exist while the relationship
  between the two stacks is being broken.
- Deploy (this will effectively only change the `consumerStack`, but it's safe to deploy both).

### Deployment 2: remove the bucket resource

- You are now free to remove the `bucket` resource from `producerStack`.
- Don't forget to remove the `exportValue()` call as well.
- Deploy again (this time only the `producerStack` will be changed -- the bucket will be deleted).

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.exportValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.exportValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `formatArn` <a name="formatArn" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.formatArn"></a>

```typescript
public formatArn(components: ArnComponents): string
```

Creates an ARN from components.

If `partition`, `region` or `account` are not specified, the stack's
partition, region and account will be used.

If any component is the empty string, an empty string will be inserted
into the generated ARN at the location that component corresponds to.

The ARN will be formatted as follows:

  arn:{partition}:{service}:{region}:{account}:{resource}{sep}{resource-name}

The required ARN pieces that are omitted will be taken from the stack that
the 'scope' is attached to. If all ARN pieces are supplied, the supplied scope
can be 'undefined'.

###### `components`<sup>Required</sup> <a name="components" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.formatArn.parameter.components"></a>

- *Type:* aws-cdk-lib.ArnComponents

---

##### `getLogicalId` <a name="getLogicalId" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getLogicalId"></a>

```typescript
public getLogicalId(element: CfnElement): string
```

Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource.

This method is called when a `CfnElement` is created and used to render the
initial logical identity of resources. Logical ID renames are applied at
this stage.

This method uses the protected method `allocateLogicalId` to render the
logical ID for an element. To modify the naming scheme, extend the `Stack`
class and override this method.

###### `element`<sup>Required</sup> <a name="element" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getLogicalId.parameter.element"></a>

- *Type:* aws-cdk-lib.CfnElement

The CloudFormation element for which a logical identity is needed.

---

##### `regionalFact` <a name="regionalFact" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.regionalFact"></a>

```typescript
public regionalFact(factName: string, defaultValue?: string): string
```

Look up a fact value for the given fact for the region of this stack.

Will return a definite value only if the region of the current stack is resolved.
If not, a lookup map will be added to the stack and the lookup will be done at
CDK deployment time.

What regions will be included in the lookup map is controlled by the
`@aws-cdk/core:target-partitions` context value: it must be set to a list
of partitions, and only regions from the given partitions will be included.
If no such context key is set, all regions will be included.

This function is intended to be used by construct library authors. Application
builders can rely on the abstractions offered by construct libraries and do
not have to worry about regional facts.

If `defaultValue` is not given, it is an error if the fact is unknown for
the given region.

###### `factName`<sup>Required</sup> <a name="factName" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.regionalFact.parameter.factName"></a>

- *Type:* string

---

###### `defaultValue`<sup>Optional</sup> <a name="defaultValue" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.regionalFact.parameter.defaultValue"></a>

- *Type:* string

---

##### `renameLogicalId` <a name="renameLogicalId" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.renameLogicalId"></a>

```typescript
public renameLogicalId(oldId: string, newId: string): void
```

Rename a generated logical identities.

To modify the naming scheme strategy, extend the `Stack` class and
override the `allocateLogicalId` method.

###### `oldId`<sup>Required</sup> <a name="oldId" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.renameLogicalId.parameter.oldId"></a>

- *Type:* string

---

###### `newId`<sup>Required</sup> <a name="newId" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.renameLogicalId.parameter.newId"></a>

- *Type:* string

---

##### `reportMissingContextKey` <a name="reportMissingContextKey" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.reportMissingContextKey"></a>

```typescript
public reportMissingContextKey(report: MissingContext): void
```

Indicate that a context key was expected.

Contains instructions which will be emitted into the cloud assembly on how
the key should be supplied.

###### `report`<sup>Required</sup> <a name="report" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.reportMissingContextKey.parameter.report"></a>

- *Type:* aws-cdk-lib.cloud_assembly_schema.MissingContext

The set of parameters needed to obtain the context.

---

##### `resolve` <a name="resolve" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.resolve"></a>

```typescript
public resolve(obj: any): any
```

Resolve a tokenized value in the context of the current stack.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.resolve.parameter.obj"></a>

- *Type:* any

---

##### `splitArn` <a name="splitArn" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.splitArn"></a>

```typescript
public splitArn(arn: string, arnFormat: ArnFormat): ArnComponents
```

Splits the provided ARN into its components.

Works both if 'arn' is a string like 'arn:aws:s3:::bucket',
and a Token representing a dynamic CloudFormation expression
(in which case the returned components will also be dynamic CloudFormation expressions,
encoded as Tokens).

###### `arn`<sup>Required</sup> <a name="arn" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.splitArn.parameter.arn"></a>

- *Type:* string

the ARN to split into its components.

---

###### `arnFormat`<sup>Required</sup> <a name="arnFormat" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.splitArn.parameter.arnFormat"></a>

- *Type:* aws-cdk-lib.ArnFormat

the expected format of 'arn' - depends on what format the service 'arn' represents uses.

---

##### `toJsonString` <a name="toJsonString" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.toJsonString"></a>

```typescript
public toJsonString(obj: any, space?: number): string
```

Convert an object, potentially containing tokens, to a JSON string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.toJsonString.parameter.obj"></a>

- *Type:* any

---

###### `space`<sup>Optional</sup> <a name="space" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.toJsonString.parameter.space"></a>

- *Type:* number

---

##### `toYamlString` <a name="toYamlString" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.toYamlString"></a>

```typescript
public toYamlString(obj: any): string
```

Convert an object, potentially containing tokens, to a YAML string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.toYamlString.parameter.obj"></a>

- *Type:* any

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.isStack">isStack</a></code> | Return whether the given object is a Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.of">of</a></code> | Looks up the first stack scope in which `construct` is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getRoleArn">getRoleArn</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getRoleName">getRoleName</a></code> | *No description.* |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.isConstruct"></a>

```typescript
import { LogRetentionRoleStack } from '@cdklabs/cdk-cicd-wrapper'

LogRetentionRoleStack.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `isStack` <a name="isStack" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.isStack"></a>

```typescript
import { LogRetentionRoleStack } from '@cdklabs/cdk-cicd-wrapper'

LogRetentionRoleStack.isStack(x: any)
```

Return whether the given object is a Stack.

We do attribute detection since we can't reliably use 'instanceof'.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.isStack.parameter.x"></a>

- *Type:* any

---

##### `of` <a name="of" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.of"></a>

```typescript
import { LogRetentionRoleStack } from '@cdklabs/cdk-cicd-wrapper'

LogRetentionRoleStack.of(construct: IConstruct)
```

Looks up the first stack scope in which `construct` is defined.

Fails if there is no stack up the tree.

###### `construct`<sup>Required</sup> <a name="construct" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.of.parameter.construct"></a>

- *Type:* constructs.IConstruct

The construct to start the search from.

---

##### `getRoleArn` <a name="getRoleArn" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getRoleArn"></a>

```typescript
import { LogRetentionRoleStack } from '@cdklabs/cdk-cicd-wrapper'

LogRetentionRoleStack.getRoleArn(account: string, region: string, stageName: Stage, applicationName: string)
```

###### `account`<sup>Required</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getRoleArn.parameter.account"></a>

- *Type:* string

---

###### `region`<sup>Required</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getRoleArn.parameter.region"></a>

- *Type:* string

---

###### `stageName`<sup>Required</sup> <a name="stageName" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getRoleArn.parameter.stageName"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.Stage">Stage</a>

---

###### `applicationName`<sup>Required</sup> <a name="applicationName" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getRoleArn.parameter.applicationName"></a>

- *Type:* string

---

##### `getRoleName` <a name="getRoleName" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getRoleName"></a>

```typescript
import { LogRetentionRoleStack } from '@cdklabs/cdk-cicd-wrapper'

LogRetentionRoleStack.getRoleName(account: string, region: string, stageName: Stage, applicationName: string)
```

###### `account`<sup>Required</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getRoleName.parameter.account"></a>

- *Type:* string

---

###### `region`<sup>Required</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getRoleName.parameter.region"></a>

- *Type:* string

---

###### `stageName`<sup>Required</sup> <a name="stageName" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getRoleName.parameter.stageName"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.Stage">Stage</a>

---

###### `applicationName`<sup>Required</sup> <a name="applicationName" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.getRoleName.parameter.applicationName"></a>

- *Type:* string

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.account">account</a></code> | <code>string</code> | The AWS account into which this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.artifactId">artifactId</a></code> | <code>string</code> | The ID of the cloud assembly artifact for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.availabilityZones">availabilityZones</a></code> | <code>string[]</code> | Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.bundlingRequired">bundlingRequired</a></code> | <code>boolean</code> | Indicates whether the stack requires bundling or not. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.dependencies">dependencies</a></code> | <code>aws-cdk-lib.Stack[]</code> | Return the stacks this stack depends on. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.environment">environment</a></code> | <code>string</code> | The environment coordinates in which this stack is deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.nested">nested</a></code> | <code>boolean</code> | Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.notificationArns">notificationArns</a></code> | <code>string[]</code> | Returns the list of notification Amazon Resource Names (ARNs) for the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.partition">partition</a></code> | <code>string</code> | The partition in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.region">region</a></code> | <code>string</code> | The AWS region into which this stack will be deployed (e.g. `us-west-2`). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.stackId">stackId</a></code> | <code>string</code> | The ID of the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.stackName">stackName</a></code> | <code>string</code> | The concrete CloudFormation physical stack name. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.tags">tags</a></code> | <code>aws-cdk-lib.TagManager</code> | Tags to be applied to the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.templateFile">templateFile</a></code> | <code>string</code> | The name of the CloudFormation template file emitted to the output directory during synthesis. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.templateOptions">templateOptions</a></code> | <code>aws-cdk-lib.ITemplateOptions</code> | Options for CloudFormation template (like version, transform, description). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.urlSuffix">urlSuffix</a></code> | <code>string</code> | The Amazon domain suffix for the region in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.nestedStackParent">nestedStackParent</a></code> | <code>aws-cdk-lib.Stack</code> | If this is a nested stack, returns it's parent stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.nestedStackResource">nestedStackResource</a></code> | <code>aws-cdk-lib.CfnResource</code> | If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether termination protection is enabled for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.roleArn">roleArn</a></code> | <code>string</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `account`<sup>Required</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

The AWS account into which this stack will be deployed.

This value is resolved according to the following rules:

1. The value provided to `env.account` when the stack is defined. This can
   either be a concrete account (e.g. `585695031111`) or the
   `Aws.ACCOUNT_ID` token.
3. `Aws.ACCOUNT_ID`, which represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::AccountId" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.account)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **account-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `artifactId`<sup>Required</sup> <a name="artifactId" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.artifactId"></a>

```typescript
public readonly artifactId: string;
```

- *Type:* string

The ID of the cloud assembly artifact for this stack.

---

##### `availabilityZones`<sup>Required</sup> <a name="availabilityZones" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.availabilityZones"></a>

```typescript
public readonly availabilityZones: string[];
```

- *Type:* string[]

Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack.

If the stack is environment-agnostic (either account and/or region are
tokens), this property will return an array with 2 tokens that will resolve
at deploy-time to the first two availability zones returned from CloudFormation's
`Fn::GetAZs` intrinsic function.

If they are not available in the context, returns a set of dummy values and
reports them as missing, and let the CLI resolve them by calling EC2
`DescribeAvailabilityZones` on the target environment.

To specify a different strategy for selecting availability zones override this method.

---

##### `bundlingRequired`<sup>Required</sup> <a name="bundlingRequired" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.bundlingRequired"></a>

```typescript
public readonly bundlingRequired: boolean;
```

- *Type:* boolean

Indicates whether the stack requires bundling or not.

---

##### `dependencies`<sup>Required</sup> <a name="dependencies" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.dependencies"></a>

```typescript
public readonly dependencies: Stack[];
```

- *Type:* aws-cdk-lib.Stack[]

Return the stacks this stack depends on.

---

##### `environment`<sup>Required</sup> <a name="environment" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.environment"></a>

```typescript
public readonly environment: string;
```

- *Type:* string

The environment coordinates in which this stack is deployed.

In the form
`aws://account/region`. Use `stack.account` and `stack.region` to obtain
the specific values, no need to parse.

You can use this value to determine if two stacks are targeting the same
environment.

If either `stack.account` or `stack.region` are not concrete values (e.g.
`Aws.ACCOUNT_ID` or `Aws.REGION`) the special strings `unknown-account` and/or
`unknown-region` will be used respectively to indicate this stack is
region/account-agnostic.

---

##### `nested`<sup>Required</sup> <a name="nested" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.nested"></a>

```typescript
public readonly nested: boolean;
```

- *Type:* boolean

Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent.

---

##### `notificationArns`<sup>Required</sup> <a name="notificationArns" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.notificationArns"></a>

```typescript
public readonly notificationArns: string[];
```

- *Type:* string[]

Returns the list of notification Amazon Resource Names (ARNs) for the current stack.

---

##### `partition`<sup>Required</sup> <a name="partition" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.partition"></a>

```typescript
public readonly partition: string;
```

- *Type:* string

The partition in which this stack is defined.

---

##### `region`<sup>Required</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

The AWS region into which this stack will be deployed (e.g. `us-west-2`).

This value is resolved according to the following rules:

1. The value provided to `env.region` when the stack is defined. This can
   either be a concrete region (e.g. `us-west-2`) or the `Aws.REGION`
   token.
3. `Aws.REGION`, which is represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::Region" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.region)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **region-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `stackId`<sup>Required</sup> <a name="stackId" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.stackId"></a>

```typescript
public readonly stackId: string;
```

- *Type:* string

The ID of the stack.

---

*Example*

```typescript
// After resolving, looks like
'arn:aws:cloudformation:us-west-2:123456789012:stack/teststack/51af3dc0-da77-11e4-872e-1234567db123'
```


##### `stackName`<sup>Required</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string

The concrete CloudFormation physical stack name.

This is either the name defined explicitly in the `stackName` prop or
allocated based on the stack's location in the construct tree. Stacks that
are directly defined under the app use their construct `id` as their stack
name. Stacks that are defined deeper within the tree will use a hashed naming
scheme based on the construct path to ensure uniqueness.

If you wish to obtain the deploy-time AWS::StackName intrinsic,
you can use `Aws.STACK_NAME` directly.

---

##### `synthesizer`<sup>Required</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer

Synthesis method for this stack.

---

##### `tags`<sup>Required</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.tags"></a>

```typescript
public readonly tags: TagManager;
```

- *Type:* aws-cdk-lib.TagManager

Tags to be applied to the stack.

---

##### `templateFile`<sup>Required</sup> <a name="templateFile" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.templateFile"></a>

```typescript
public readonly templateFile: string;
```

- *Type:* string

The name of the CloudFormation template file emitted to the output directory during synthesis.

Example value: `MyStack.template.json`

---

##### `templateOptions`<sup>Required</sup> <a name="templateOptions" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.templateOptions"></a>

```typescript
public readonly templateOptions: ITemplateOptions;
```

- *Type:* aws-cdk-lib.ITemplateOptions

Options for CloudFormation template (like version, transform, description).

---

##### `urlSuffix`<sup>Required</sup> <a name="urlSuffix" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.urlSuffix"></a>

```typescript
public readonly urlSuffix: string;
```

- *Type:* string

The Amazon domain suffix for the region in which this stack is defined.

---

##### `nestedStackParent`<sup>Optional</sup> <a name="nestedStackParent" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.nestedStackParent"></a>

```typescript
public readonly nestedStackParent: Stack;
```

- *Type:* aws-cdk-lib.Stack

If this is a nested stack, returns it's parent stack.

---

##### `nestedStackResource`<sup>Optional</sup> <a name="nestedStackResource" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.nestedStackResource"></a>

```typescript
public readonly nestedStackResource: CfnResource;
```

- *Type:* aws-cdk-lib.CfnResource

If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource.

`undefined` for top-level (non-nested) stacks.

---

##### `terminationProtection`<sup>Required</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean

Whether termination protection is enabled for this stack.

---

##### `roleArn`<sup>Required</sup> <a name="roleArn" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStack.property.roleArn"></a>

```typescript
public readonly roleArn: string;
```

- *Type:* string

---


### SSMParameterStack <a name="SSMParameterStack" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.Initializer"></a>

```typescript
import { SSMParameterStack } from '@cdklabs/cdk-cicd-wrapper'

new SSMParameterStack(scope: Construct, id: string, props: SSMParameterStackProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps">SSMParameterStackProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps">SSMParameterStackProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.addDependency">addDependency</a></code> | Add a dependency between this stack and another stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.addMetadata">addMetadata</a></code> | Adds an arbitary key-value pair, with information you want to record about the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.addTransform">addTransform</a></code> | Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.exportStringListValue">exportStringListValue</a></code> | Create a CloudFormation Export for a string list value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.exportValue">exportValue</a></code> | Create a CloudFormation Export for a string value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.formatArn">formatArn</a></code> | Creates an ARN from components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.getLogicalId">getLogicalId</a></code> | Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.regionalFact">regionalFact</a></code> | Look up a fact value for the given fact for the region of this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.renameLogicalId">renameLogicalId</a></code> | Rename a generated logical identities. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.reportMissingContextKey">reportMissingContextKey</a></code> | Indicate that a context key was expected. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.resolve">resolve</a></code> | Resolve a tokenized value in the context of the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.splitArn">splitArn</a></code> | Splits the provided ARN into its components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.toJsonString">toJsonString</a></code> | Convert an object, potentially containing tokens, to a JSON string. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.toYamlString">toYamlString</a></code> | Convert an object, potentially containing tokens, to a YAML string. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.createParameter">createParameter</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.createParameterInSSMParameterStack">createParameterInSSMParameterStack</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.provideParameterPolicyStatement">provideParameterPolicyStatement</a></code> | *No description.* |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addDependency` <a name="addDependency" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.addDependency"></a>

```typescript
public addDependency(target: Stack, reason?: string): void
```

Add a dependency between this stack and another stack.

This can be used to define dependencies between any two stacks within an
app, and also supports nested stacks.

###### `target`<sup>Required</sup> <a name="target" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.addDependency.parameter.target"></a>

- *Type:* aws-cdk-lib.Stack

---

###### `reason`<sup>Optional</sup> <a name="reason" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.addDependency.parameter.reason"></a>

- *Type:* string

---

##### `addMetadata` <a name="addMetadata" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.addMetadata"></a>

```typescript
public addMetadata(key: string, value: any): void
```

Adds an arbitary key-value pair, with information you want to record about the stack.

These get translated to the Metadata section of the generated template.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html)

###### `key`<sup>Required</sup> <a name="key" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.addMetadata.parameter.key"></a>

- *Type:* string

---

###### `value`<sup>Required</sup> <a name="value" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.addMetadata.parameter.value"></a>

- *Type:* any

---

##### `addTransform` <a name="addTransform" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.addTransform"></a>

```typescript
public addTransform(transform: string): void
```

Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template.

Duplicate values are removed when stack is synthesized.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html)

*Example*

```typescript
declare const stack: Stack;

stack.addTransform('AWS::Serverless-2016-10-31')
```


###### `transform`<sup>Required</sup> <a name="transform" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.addTransform.parameter.transform"></a>

- *Type:* string

The transform to add.

---

##### `exportStringListValue` <a name="exportStringListValue" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.exportStringListValue"></a>

```typescript
public exportStringListValue(exportedValue: any, options?: ExportValueOptions): string[]
```

Create a CloudFormation Export for a string list value.

Returns a string list representing the corresponding `Fn.importValue()`
expression for this Export. The export expression is automatically wrapped with an
`Fn::Join` and the import value with an `Fn::Split`, since CloudFormation can only
export strings. You can control the name for the export by passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

See `exportValue` for an example of this process.

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.exportStringListValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.exportStringListValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `exportValue` <a name="exportValue" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.exportValue"></a>

```typescript
public exportValue(exportedValue: any, options?: ExportValueOptions): string
```

Create a CloudFormation Export for a string value.

Returns a string representing the corresponding `Fn.importValue()`
expression for this Export. You can control the name for the export by
passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

## Example

Here is how the process works. Let's say there are two stacks,
`producerStack` and `consumerStack`, and `producerStack` has a bucket
called `bucket`, which is referenced by `consumerStack` (perhaps because
an AWS Lambda Function writes into it, or something like that).

It is not safe to remove `producerStack.bucket` because as the bucket is being
deleted, `consumerStack` might still be using it.

Instead, the process takes two deployments:

### Deployment 1: break the relationship

- Make sure `consumerStack` no longer references `bucket.bucketName` (maybe the consumer
  stack now uses its own bucket, or it writes to an AWS DynamoDB table, or maybe you just
  remove the Lambda Function altogether).
- In the `ProducerStack` class, call `this.exportValue(this.bucket.bucketName)`. This
  will make sure the CloudFormation Export continues to exist while the relationship
  between the two stacks is being broken.
- Deploy (this will effectively only change the `consumerStack`, but it's safe to deploy both).

### Deployment 2: remove the bucket resource

- You are now free to remove the `bucket` resource from `producerStack`.
- Don't forget to remove the `exportValue()` call as well.
- Deploy again (this time only the `producerStack` will be changed -- the bucket will be deleted).

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.exportValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.exportValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `formatArn` <a name="formatArn" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.formatArn"></a>

```typescript
public formatArn(components: ArnComponents): string
```

Creates an ARN from components.

If `partition`, `region` or `account` are not specified, the stack's
partition, region and account will be used.

If any component is the empty string, an empty string will be inserted
into the generated ARN at the location that component corresponds to.

The ARN will be formatted as follows:

  arn:{partition}:{service}:{region}:{account}:{resource}{sep}{resource-name}

The required ARN pieces that are omitted will be taken from the stack that
the 'scope' is attached to. If all ARN pieces are supplied, the supplied scope
can be 'undefined'.

###### `components`<sup>Required</sup> <a name="components" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.formatArn.parameter.components"></a>

- *Type:* aws-cdk-lib.ArnComponents

---

##### `getLogicalId` <a name="getLogicalId" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.getLogicalId"></a>

```typescript
public getLogicalId(element: CfnElement): string
```

Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource.

This method is called when a `CfnElement` is created and used to render the
initial logical identity of resources. Logical ID renames are applied at
this stage.

This method uses the protected method `allocateLogicalId` to render the
logical ID for an element. To modify the naming scheme, extend the `Stack`
class and override this method.

###### `element`<sup>Required</sup> <a name="element" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.getLogicalId.parameter.element"></a>

- *Type:* aws-cdk-lib.CfnElement

The CloudFormation element for which a logical identity is needed.

---

##### `regionalFact` <a name="regionalFact" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.regionalFact"></a>

```typescript
public regionalFact(factName: string, defaultValue?: string): string
```

Look up a fact value for the given fact for the region of this stack.

Will return a definite value only if the region of the current stack is resolved.
If not, a lookup map will be added to the stack and the lookup will be done at
CDK deployment time.

What regions will be included in the lookup map is controlled by the
`@aws-cdk/core:target-partitions` context value: it must be set to a list
of partitions, and only regions from the given partitions will be included.
If no such context key is set, all regions will be included.

This function is intended to be used by construct library authors. Application
builders can rely on the abstractions offered by construct libraries and do
not have to worry about regional facts.

If `defaultValue` is not given, it is an error if the fact is unknown for
the given region.

###### `factName`<sup>Required</sup> <a name="factName" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.regionalFact.parameter.factName"></a>

- *Type:* string

---

###### `defaultValue`<sup>Optional</sup> <a name="defaultValue" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.regionalFact.parameter.defaultValue"></a>

- *Type:* string

---

##### `renameLogicalId` <a name="renameLogicalId" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.renameLogicalId"></a>

```typescript
public renameLogicalId(oldId: string, newId: string): void
```

Rename a generated logical identities.

To modify the naming scheme strategy, extend the `Stack` class and
override the `allocateLogicalId` method.

###### `oldId`<sup>Required</sup> <a name="oldId" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.renameLogicalId.parameter.oldId"></a>

- *Type:* string

---

###### `newId`<sup>Required</sup> <a name="newId" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.renameLogicalId.parameter.newId"></a>

- *Type:* string

---

##### `reportMissingContextKey` <a name="reportMissingContextKey" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.reportMissingContextKey"></a>

```typescript
public reportMissingContextKey(report: MissingContext): void
```

Indicate that a context key was expected.

Contains instructions which will be emitted into the cloud assembly on how
the key should be supplied.

###### `report`<sup>Required</sup> <a name="report" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.reportMissingContextKey.parameter.report"></a>

- *Type:* aws-cdk-lib.cloud_assembly_schema.MissingContext

The set of parameters needed to obtain the context.

---

##### `resolve` <a name="resolve" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.resolve"></a>

```typescript
public resolve(obj: any): any
```

Resolve a tokenized value in the context of the current stack.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.resolve.parameter.obj"></a>

- *Type:* any

---

##### `splitArn` <a name="splitArn" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.splitArn"></a>

```typescript
public splitArn(arn: string, arnFormat: ArnFormat): ArnComponents
```

Splits the provided ARN into its components.

Works both if 'arn' is a string like 'arn:aws:s3:::bucket',
and a Token representing a dynamic CloudFormation expression
(in which case the returned components will also be dynamic CloudFormation expressions,
encoded as Tokens).

###### `arn`<sup>Required</sup> <a name="arn" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.splitArn.parameter.arn"></a>

- *Type:* string

the ARN to split into its components.

---

###### `arnFormat`<sup>Required</sup> <a name="arnFormat" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.splitArn.parameter.arnFormat"></a>

- *Type:* aws-cdk-lib.ArnFormat

the expected format of 'arn' - depends on what format the service 'arn' represents uses.

---

##### `toJsonString` <a name="toJsonString" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.toJsonString"></a>

```typescript
public toJsonString(obj: any, space?: number): string
```

Convert an object, potentially containing tokens, to a JSON string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.toJsonString.parameter.obj"></a>

- *Type:* any

---

###### `space`<sup>Optional</sup> <a name="space" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.toJsonString.parameter.space"></a>

- *Type:* number

---

##### `toYamlString` <a name="toYamlString" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.toYamlString"></a>

```typescript
public toYamlString(obj: any): string
```

Convert an object, potentially containing tokens, to a YAML string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.toYamlString.parameter.obj"></a>

- *Type:* any

---

##### `createParameter` <a name="createParameter" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.createParameter"></a>

```typescript
public createParameter(scope: Construct, parameterName: string, parameterValue: string): StringParameter
```

###### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.createParameter.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `parameterName`<sup>Required</sup> <a name="parameterName" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.createParameter.parameter.parameterName"></a>

- *Type:* string

---

###### `parameterValue`<sup>Required</sup> <a name="parameterValue" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.createParameter.parameter.parameterValue"></a>

- *Type:* string

---

##### `createParameterInSSMParameterStack` <a name="createParameterInSSMParameterStack" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.createParameterInSSMParameterStack"></a>

```typescript
public createParameterInSSMParameterStack(parameterName: string, parameterValue: string): StringParameter
```

###### `parameterName`<sup>Required</sup> <a name="parameterName" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.createParameterInSSMParameterStack.parameter.parameterName"></a>

- *Type:* string

---

###### `parameterValue`<sup>Required</sup> <a name="parameterValue" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.createParameterInSSMParameterStack.parameter.parameterValue"></a>

- *Type:* string

---

##### `provideParameterPolicyStatement` <a name="provideParameterPolicyStatement" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.provideParameterPolicyStatement"></a>

```typescript
public provideParameterPolicyStatement(): PolicyStatement
```

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.isStack">isStack</a></code> | Return whether the given object is a Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.of">of</a></code> | Looks up the first stack scope in which `construct` is defined. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.isConstruct"></a>

```typescript
import { SSMParameterStack } from '@cdklabs/cdk-cicd-wrapper'

SSMParameterStack.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `isStack` <a name="isStack" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.isStack"></a>

```typescript
import { SSMParameterStack } from '@cdklabs/cdk-cicd-wrapper'

SSMParameterStack.isStack(x: any)
```

Return whether the given object is a Stack.

We do attribute detection since we can't reliably use 'instanceof'.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.isStack.parameter.x"></a>

- *Type:* any

---

##### `of` <a name="of" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.of"></a>

```typescript
import { SSMParameterStack } from '@cdklabs/cdk-cicd-wrapper'

SSMParameterStack.of(construct: IConstruct)
```

Looks up the first stack scope in which `construct` is defined.

Fails if there is no stack up the tree.

###### `construct`<sup>Required</sup> <a name="construct" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.of.parameter.construct"></a>

- *Type:* constructs.IConstruct

The construct to start the search from.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.account">account</a></code> | <code>string</code> | The AWS account into which this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.artifactId">artifactId</a></code> | <code>string</code> | The ID of the cloud assembly artifact for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.availabilityZones">availabilityZones</a></code> | <code>string[]</code> | Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.bundlingRequired">bundlingRequired</a></code> | <code>boolean</code> | Indicates whether the stack requires bundling or not. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.dependencies">dependencies</a></code> | <code>aws-cdk-lib.Stack[]</code> | Return the stacks this stack depends on. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.environment">environment</a></code> | <code>string</code> | The environment coordinates in which this stack is deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.nested">nested</a></code> | <code>boolean</code> | Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.notificationArns">notificationArns</a></code> | <code>string[]</code> | Returns the list of notification Amazon Resource Names (ARNs) for the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.partition">partition</a></code> | <code>string</code> | The partition in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.region">region</a></code> | <code>string</code> | The AWS region into which this stack will be deployed (e.g. `us-west-2`). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.stackId">stackId</a></code> | <code>string</code> | The ID of the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.stackName">stackName</a></code> | <code>string</code> | The concrete CloudFormation physical stack name. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.tags">tags</a></code> | <code>aws-cdk-lib.TagManager</code> | Tags to be applied to the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.templateFile">templateFile</a></code> | <code>string</code> | The name of the CloudFormation template file emitted to the output directory during synthesis. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.templateOptions">templateOptions</a></code> | <code>aws-cdk-lib.ITemplateOptions</code> | Options for CloudFormation template (like version, transform, description). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.urlSuffix">urlSuffix</a></code> | <code>string</code> | The Amazon domain suffix for the region in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.nestedStackParent">nestedStackParent</a></code> | <code>aws-cdk-lib.Stack</code> | If this is a nested stack, returns it's parent stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.nestedStackResource">nestedStackResource</a></code> | <code>aws-cdk-lib.CfnResource</code> | If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether termination protection is enabled for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.applicationQualifier">applicationQualifier</a></code> | <code>string</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `account`<sup>Required</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

The AWS account into which this stack will be deployed.

This value is resolved according to the following rules:

1. The value provided to `env.account` when the stack is defined. This can
   either be a concrete account (e.g. `585695031111`) or the
   `Aws.ACCOUNT_ID` token.
3. `Aws.ACCOUNT_ID`, which represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::AccountId" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.account)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **account-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `artifactId`<sup>Required</sup> <a name="artifactId" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.artifactId"></a>

```typescript
public readonly artifactId: string;
```

- *Type:* string

The ID of the cloud assembly artifact for this stack.

---

##### `availabilityZones`<sup>Required</sup> <a name="availabilityZones" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.availabilityZones"></a>

```typescript
public readonly availabilityZones: string[];
```

- *Type:* string[]

Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack.

If the stack is environment-agnostic (either account and/or region are
tokens), this property will return an array with 2 tokens that will resolve
at deploy-time to the first two availability zones returned from CloudFormation's
`Fn::GetAZs` intrinsic function.

If they are not available in the context, returns a set of dummy values and
reports them as missing, and let the CLI resolve them by calling EC2
`DescribeAvailabilityZones` on the target environment.

To specify a different strategy for selecting availability zones override this method.

---

##### `bundlingRequired`<sup>Required</sup> <a name="bundlingRequired" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.bundlingRequired"></a>

```typescript
public readonly bundlingRequired: boolean;
```

- *Type:* boolean

Indicates whether the stack requires bundling or not.

---

##### `dependencies`<sup>Required</sup> <a name="dependencies" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.dependencies"></a>

```typescript
public readonly dependencies: Stack[];
```

- *Type:* aws-cdk-lib.Stack[]

Return the stacks this stack depends on.

---

##### `environment`<sup>Required</sup> <a name="environment" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.environment"></a>

```typescript
public readonly environment: string;
```

- *Type:* string

The environment coordinates in which this stack is deployed.

In the form
`aws://account/region`. Use `stack.account` and `stack.region` to obtain
the specific values, no need to parse.

You can use this value to determine if two stacks are targeting the same
environment.

If either `stack.account` or `stack.region` are not concrete values (e.g.
`Aws.ACCOUNT_ID` or `Aws.REGION`) the special strings `unknown-account` and/or
`unknown-region` will be used respectively to indicate this stack is
region/account-agnostic.

---

##### `nested`<sup>Required</sup> <a name="nested" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.nested"></a>

```typescript
public readonly nested: boolean;
```

- *Type:* boolean

Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent.

---

##### `notificationArns`<sup>Required</sup> <a name="notificationArns" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.notificationArns"></a>

```typescript
public readonly notificationArns: string[];
```

- *Type:* string[]

Returns the list of notification Amazon Resource Names (ARNs) for the current stack.

---

##### `partition`<sup>Required</sup> <a name="partition" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.partition"></a>

```typescript
public readonly partition: string;
```

- *Type:* string

The partition in which this stack is defined.

---

##### `region`<sup>Required</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

The AWS region into which this stack will be deployed (e.g. `us-west-2`).

This value is resolved according to the following rules:

1. The value provided to `env.region` when the stack is defined. This can
   either be a concrete region (e.g. `us-west-2`) or the `Aws.REGION`
   token.
3. `Aws.REGION`, which is represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::Region" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.region)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **region-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `stackId`<sup>Required</sup> <a name="stackId" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.stackId"></a>

```typescript
public readonly stackId: string;
```

- *Type:* string

The ID of the stack.

---

*Example*

```typescript
// After resolving, looks like
'arn:aws:cloudformation:us-west-2:123456789012:stack/teststack/51af3dc0-da77-11e4-872e-1234567db123'
```


##### `stackName`<sup>Required</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string

The concrete CloudFormation physical stack name.

This is either the name defined explicitly in the `stackName` prop or
allocated based on the stack's location in the construct tree. Stacks that
are directly defined under the app use their construct `id` as their stack
name. Stacks that are defined deeper within the tree will use a hashed naming
scheme based on the construct path to ensure uniqueness.

If you wish to obtain the deploy-time AWS::StackName intrinsic,
you can use `Aws.STACK_NAME` directly.

---

##### `synthesizer`<sup>Required</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer

Synthesis method for this stack.

---

##### `tags`<sup>Required</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.tags"></a>

```typescript
public readonly tags: TagManager;
```

- *Type:* aws-cdk-lib.TagManager

Tags to be applied to the stack.

---

##### `templateFile`<sup>Required</sup> <a name="templateFile" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.templateFile"></a>

```typescript
public readonly templateFile: string;
```

- *Type:* string

The name of the CloudFormation template file emitted to the output directory during synthesis.

Example value: `MyStack.template.json`

---

##### `templateOptions`<sup>Required</sup> <a name="templateOptions" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.templateOptions"></a>

```typescript
public readonly templateOptions: ITemplateOptions;
```

- *Type:* aws-cdk-lib.ITemplateOptions

Options for CloudFormation template (like version, transform, description).

---

##### `urlSuffix`<sup>Required</sup> <a name="urlSuffix" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.urlSuffix"></a>

```typescript
public readonly urlSuffix: string;
```

- *Type:* string

The Amazon domain suffix for the region in which this stack is defined.

---

##### `nestedStackParent`<sup>Optional</sup> <a name="nestedStackParent" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.nestedStackParent"></a>

```typescript
public readonly nestedStackParent: Stack;
```

- *Type:* aws-cdk-lib.Stack

If this is a nested stack, returns it's parent stack.

---

##### `nestedStackResource`<sup>Optional</sup> <a name="nestedStackResource" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.nestedStackResource"></a>

```typescript
public readonly nestedStackResource: CfnResource;
```

- *Type:* aws-cdk-lib.CfnResource

If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource.

`undefined` for top-level (non-nested) stacks.

---

##### `terminationProtection`<sup>Required</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean

Whether termination protection is enabled for this stack.

---

##### `applicationQualifier`<sup>Required</sup> <a name="applicationQualifier" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStack.property.applicationQualifier"></a>

```typescript
public readonly applicationQualifier: string;
```

- *Type:* string

---


### VanillaPipelineBlueprint <a name="VanillaPipelineBlueprint" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.Initializer"></a>

```typescript
import { VanillaPipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper'

new VanillaPipelineBlueprint(scope: Construct, id: string, config: IVanillaPipelineBlueprintProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.Initializer.parameter.config">config</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps">IVanillaPipelineBlueprintProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.Initializer.parameter.id"></a>

- *Type:* string

---

##### `config`<sup>Required</sup> <a name="config" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.Initializer.parameter.config"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps">IVanillaPipelineBlueprintProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.addDependency">addDependency</a></code> | Add a dependency between this stack and another stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.addMetadata">addMetadata</a></code> | Adds an arbitary key-value pair, with information you want to record about the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.addTransform">addTransform</a></code> | Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.exportStringListValue">exportStringListValue</a></code> | Create a CloudFormation Export for a string list value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.exportValue">exportValue</a></code> | Create a CloudFormation Export for a string value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.formatArn">formatArn</a></code> | Creates an ARN from components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.getLogicalId">getLogicalId</a></code> | Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.regionalFact">regionalFact</a></code> | Look up a fact value for the given fact for the region of this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.renameLogicalId">renameLogicalId</a></code> | Rename a generated logical identities. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.reportMissingContextKey">reportMissingContextKey</a></code> | Indicate that a context key was expected. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.resolve">resolve</a></code> | Resolve a tokenized value in the context of the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.splitArn">splitArn</a></code> | Splits the provided ARN into its components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.toJsonString">toJsonString</a></code> | Convert an object, potentially containing tokens, to a JSON string. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.toYamlString">toYamlString</a></code> | Convert an object, potentially containing tokens, to a YAML string. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addDependency` <a name="addDependency" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.addDependency"></a>

```typescript
public addDependency(target: Stack, reason?: string): void
```

Add a dependency between this stack and another stack.

This can be used to define dependencies between any two stacks within an
app, and also supports nested stacks.

###### `target`<sup>Required</sup> <a name="target" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.addDependency.parameter.target"></a>

- *Type:* aws-cdk-lib.Stack

---

###### `reason`<sup>Optional</sup> <a name="reason" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.addDependency.parameter.reason"></a>

- *Type:* string

---

##### `addMetadata` <a name="addMetadata" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.addMetadata"></a>

```typescript
public addMetadata(key: string, value: any): void
```

Adds an arbitary key-value pair, with information you want to record about the stack.

These get translated to the Metadata section of the generated template.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html)

###### `key`<sup>Required</sup> <a name="key" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.addMetadata.parameter.key"></a>

- *Type:* string

---

###### `value`<sup>Required</sup> <a name="value" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.addMetadata.parameter.value"></a>

- *Type:* any

---

##### `addTransform` <a name="addTransform" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.addTransform"></a>

```typescript
public addTransform(transform: string): void
```

Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template.

Duplicate values are removed when stack is synthesized.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html)

*Example*

```typescript
declare const stack: Stack;

stack.addTransform('AWS::Serverless-2016-10-31')
```


###### `transform`<sup>Required</sup> <a name="transform" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.addTransform.parameter.transform"></a>

- *Type:* string

The transform to add.

---

##### `exportStringListValue` <a name="exportStringListValue" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.exportStringListValue"></a>

```typescript
public exportStringListValue(exportedValue: any, options?: ExportValueOptions): string[]
```

Create a CloudFormation Export for a string list value.

Returns a string list representing the corresponding `Fn.importValue()`
expression for this Export. The export expression is automatically wrapped with an
`Fn::Join` and the import value with an `Fn::Split`, since CloudFormation can only
export strings. You can control the name for the export by passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

See `exportValue` for an example of this process.

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.exportStringListValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.exportStringListValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `exportValue` <a name="exportValue" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.exportValue"></a>

```typescript
public exportValue(exportedValue: any, options?: ExportValueOptions): string
```

Create a CloudFormation Export for a string value.

Returns a string representing the corresponding `Fn.importValue()`
expression for this Export. You can control the name for the export by
passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

## Example

Here is how the process works. Let's say there are two stacks,
`producerStack` and `consumerStack`, and `producerStack` has a bucket
called `bucket`, which is referenced by `consumerStack` (perhaps because
an AWS Lambda Function writes into it, or something like that).

It is not safe to remove `producerStack.bucket` because as the bucket is being
deleted, `consumerStack` might still be using it.

Instead, the process takes two deployments:

### Deployment 1: break the relationship

- Make sure `consumerStack` no longer references `bucket.bucketName` (maybe the consumer
  stack now uses its own bucket, or it writes to an AWS DynamoDB table, or maybe you just
  remove the Lambda Function altogether).
- In the `ProducerStack` class, call `this.exportValue(this.bucket.bucketName)`. This
  will make sure the CloudFormation Export continues to exist while the relationship
  between the two stacks is being broken.
- Deploy (this will effectively only change the `consumerStack`, but it's safe to deploy both).

### Deployment 2: remove the bucket resource

- You are now free to remove the `bucket` resource from `producerStack`.
- Don't forget to remove the `exportValue()` call as well.
- Deploy again (this time only the `producerStack` will be changed -- the bucket will be deleted).

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.exportValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.exportValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `formatArn` <a name="formatArn" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.formatArn"></a>

```typescript
public formatArn(components: ArnComponents): string
```

Creates an ARN from components.

If `partition`, `region` or `account` are not specified, the stack's
partition, region and account will be used.

If any component is the empty string, an empty string will be inserted
into the generated ARN at the location that component corresponds to.

The ARN will be formatted as follows:

  arn:{partition}:{service}:{region}:{account}:{resource}{sep}{resource-name}

The required ARN pieces that are omitted will be taken from the stack that
the 'scope' is attached to. If all ARN pieces are supplied, the supplied scope
can be 'undefined'.

###### `components`<sup>Required</sup> <a name="components" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.formatArn.parameter.components"></a>

- *Type:* aws-cdk-lib.ArnComponents

---

##### `getLogicalId` <a name="getLogicalId" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.getLogicalId"></a>

```typescript
public getLogicalId(element: CfnElement): string
```

Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource.

This method is called when a `CfnElement` is created and used to render the
initial logical identity of resources. Logical ID renames are applied at
this stage.

This method uses the protected method `allocateLogicalId` to render the
logical ID for an element. To modify the naming scheme, extend the `Stack`
class and override this method.

###### `element`<sup>Required</sup> <a name="element" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.getLogicalId.parameter.element"></a>

- *Type:* aws-cdk-lib.CfnElement

The CloudFormation element for which a logical identity is needed.

---

##### `regionalFact` <a name="regionalFact" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.regionalFact"></a>

```typescript
public regionalFact(factName: string, defaultValue?: string): string
```

Look up a fact value for the given fact for the region of this stack.

Will return a definite value only if the region of the current stack is resolved.
If not, a lookup map will be added to the stack and the lookup will be done at
CDK deployment time.

What regions will be included in the lookup map is controlled by the
`@aws-cdk/core:target-partitions` context value: it must be set to a list
of partitions, and only regions from the given partitions will be included.
If no such context key is set, all regions will be included.

This function is intended to be used by construct library authors. Application
builders can rely on the abstractions offered by construct libraries and do
not have to worry about regional facts.

If `defaultValue` is not given, it is an error if the fact is unknown for
the given region.

###### `factName`<sup>Required</sup> <a name="factName" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.regionalFact.parameter.factName"></a>

- *Type:* string

---

###### `defaultValue`<sup>Optional</sup> <a name="defaultValue" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.regionalFact.parameter.defaultValue"></a>

- *Type:* string

---

##### `renameLogicalId` <a name="renameLogicalId" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.renameLogicalId"></a>

```typescript
public renameLogicalId(oldId: string, newId: string): void
```

Rename a generated logical identities.

To modify the naming scheme strategy, extend the `Stack` class and
override the `allocateLogicalId` method.

###### `oldId`<sup>Required</sup> <a name="oldId" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.renameLogicalId.parameter.oldId"></a>

- *Type:* string

---

###### `newId`<sup>Required</sup> <a name="newId" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.renameLogicalId.parameter.newId"></a>

- *Type:* string

---

##### `reportMissingContextKey` <a name="reportMissingContextKey" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.reportMissingContextKey"></a>

```typescript
public reportMissingContextKey(report: MissingContext): void
```

Indicate that a context key was expected.

Contains instructions which will be emitted into the cloud assembly on how
the key should be supplied.

###### `report`<sup>Required</sup> <a name="report" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.reportMissingContextKey.parameter.report"></a>

- *Type:* aws-cdk-lib.cloud_assembly_schema.MissingContext

The set of parameters needed to obtain the context.

---

##### `resolve` <a name="resolve" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.resolve"></a>

```typescript
public resolve(obj: any): any
```

Resolve a tokenized value in the context of the current stack.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.resolve.parameter.obj"></a>

- *Type:* any

---

##### `splitArn` <a name="splitArn" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.splitArn"></a>

```typescript
public splitArn(arn: string, arnFormat: ArnFormat): ArnComponents
```

Splits the provided ARN into its components.

Works both if 'arn' is a string like 'arn:aws:s3:::bucket',
and a Token representing a dynamic CloudFormation expression
(in which case the returned components will also be dynamic CloudFormation expressions,
encoded as Tokens).

###### `arn`<sup>Required</sup> <a name="arn" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.splitArn.parameter.arn"></a>

- *Type:* string

the ARN to split into its components.

---

###### `arnFormat`<sup>Required</sup> <a name="arnFormat" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.splitArn.parameter.arnFormat"></a>

- *Type:* aws-cdk-lib.ArnFormat

the expected format of 'arn' - depends on what format the service 'arn' represents uses.

---

##### `toJsonString` <a name="toJsonString" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.toJsonString"></a>

```typescript
public toJsonString(obj: any, space?: number): string
```

Convert an object, potentially containing tokens, to a JSON string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.toJsonString.parameter.obj"></a>

- *Type:* any

---

###### `space`<sup>Optional</sup> <a name="space" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.toJsonString.parameter.space"></a>

- *Type:* number

---

##### `toYamlString` <a name="toYamlString" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.toYamlString"></a>

```typescript
public toYamlString(obj: any): string
```

Convert an object, potentially containing tokens, to a YAML string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.toYamlString.parameter.obj"></a>

- *Type:* any

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.isStack">isStack</a></code> | Return whether the given object is a Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.of">of</a></code> | Looks up the first stack scope in which `construct` is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.builder">builder</a></code> | *No description.* |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.isConstruct"></a>

```typescript
import { VanillaPipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper'

VanillaPipelineBlueprint.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `isStack` <a name="isStack" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.isStack"></a>

```typescript
import { VanillaPipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper'

VanillaPipelineBlueprint.isStack(x: any)
```

Return whether the given object is a Stack.

We do attribute detection since we can't reliably use 'instanceof'.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.isStack.parameter.x"></a>

- *Type:* any

---

##### `of` <a name="of" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.of"></a>

```typescript
import { VanillaPipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper'

VanillaPipelineBlueprint.of(construct: IConstruct)
```

Looks up the first stack scope in which `construct` is defined.

Fails if there is no stack up the tree.

###### `construct`<sup>Required</sup> <a name="construct" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.of.parameter.construct"></a>

- *Type:* constructs.IConstruct

The construct to start the search from.

---

##### `builder` <a name="builder" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.builder"></a>

```typescript
import { VanillaPipelineBlueprint } from '@cdklabs/cdk-cicd-wrapper'

VanillaPipelineBlueprint.builder()
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.account">account</a></code> | <code>string</code> | The AWS account into which this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.artifactId">artifactId</a></code> | <code>string</code> | The ID of the cloud assembly artifact for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.availabilityZones">availabilityZones</a></code> | <code>string[]</code> | Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.bundlingRequired">bundlingRequired</a></code> | <code>boolean</code> | Indicates whether the stack requires bundling or not. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.dependencies">dependencies</a></code> | <code>aws-cdk-lib.Stack[]</code> | Return the stacks this stack depends on. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.environment">environment</a></code> | <code>string</code> | The environment coordinates in which this stack is deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.nested">nested</a></code> | <code>boolean</code> | Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.notificationArns">notificationArns</a></code> | <code>string[]</code> | Returns the list of notification Amazon Resource Names (ARNs) for the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.partition">partition</a></code> | <code>string</code> | The partition in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.region">region</a></code> | <code>string</code> | The AWS region into which this stack will be deployed (e.g. `us-west-2`). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.stackId">stackId</a></code> | <code>string</code> | The ID of the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.stackName">stackName</a></code> | <code>string</code> | The concrete CloudFormation physical stack name. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.tags">tags</a></code> | <code>aws-cdk-lib.TagManager</code> | Tags to be applied to the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.templateFile">templateFile</a></code> | <code>string</code> | The name of the CloudFormation template file emitted to the output directory during synthesis. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.templateOptions">templateOptions</a></code> | <code>aws-cdk-lib.ITemplateOptions</code> | Options for CloudFormation template (like version, transform, description). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.urlSuffix">urlSuffix</a></code> | <code>string</code> | The Amazon domain suffix for the region in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.nestedStackParent">nestedStackParent</a></code> | <code>aws-cdk-lib.Stack</code> | If this is a nested stack, returns it's parent stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.nestedStackResource">nestedStackResource</a></code> | <code>aws-cdk-lib.CfnResource</code> | If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether termination protection is enabled for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.config">config</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps">IVanillaPipelineBlueprintProps</a></code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `account`<sup>Required</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

The AWS account into which this stack will be deployed.

This value is resolved according to the following rules:

1. The value provided to `env.account` when the stack is defined. This can
   either be a concrete account (e.g. `585695031111`) or the
   `Aws.ACCOUNT_ID` token.
3. `Aws.ACCOUNT_ID`, which represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::AccountId" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.account)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **account-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `artifactId`<sup>Required</sup> <a name="artifactId" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.artifactId"></a>

```typescript
public readonly artifactId: string;
```

- *Type:* string

The ID of the cloud assembly artifact for this stack.

---

##### `availabilityZones`<sup>Required</sup> <a name="availabilityZones" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.availabilityZones"></a>

```typescript
public readonly availabilityZones: string[];
```

- *Type:* string[]

Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack.

If the stack is environment-agnostic (either account and/or region are
tokens), this property will return an array with 2 tokens that will resolve
at deploy-time to the first two availability zones returned from CloudFormation's
`Fn::GetAZs` intrinsic function.

If they are not available in the context, returns a set of dummy values and
reports them as missing, and let the CLI resolve them by calling EC2
`DescribeAvailabilityZones` on the target environment.

To specify a different strategy for selecting availability zones override this method.

---

##### `bundlingRequired`<sup>Required</sup> <a name="bundlingRequired" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.bundlingRequired"></a>

```typescript
public readonly bundlingRequired: boolean;
```

- *Type:* boolean

Indicates whether the stack requires bundling or not.

---

##### `dependencies`<sup>Required</sup> <a name="dependencies" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.dependencies"></a>

```typescript
public readonly dependencies: Stack[];
```

- *Type:* aws-cdk-lib.Stack[]

Return the stacks this stack depends on.

---

##### `environment`<sup>Required</sup> <a name="environment" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.environment"></a>

```typescript
public readonly environment: string;
```

- *Type:* string

The environment coordinates in which this stack is deployed.

In the form
`aws://account/region`. Use `stack.account` and `stack.region` to obtain
the specific values, no need to parse.

You can use this value to determine if two stacks are targeting the same
environment.

If either `stack.account` or `stack.region` are not concrete values (e.g.
`Aws.ACCOUNT_ID` or `Aws.REGION`) the special strings `unknown-account` and/or
`unknown-region` will be used respectively to indicate this stack is
region/account-agnostic.

---

##### `nested`<sup>Required</sup> <a name="nested" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.nested"></a>

```typescript
public readonly nested: boolean;
```

- *Type:* boolean

Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent.

---

##### `notificationArns`<sup>Required</sup> <a name="notificationArns" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.notificationArns"></a>

```typescript
public readonly notificationArns: string[];
```

- *Type:* string[]

Returns the list of notification Amazon Resource Names (ARNs) for the current stack.

---

##### `partition`<sup>Required</sup> <a name="partition" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.partition"></a>

```typescript
public readonly partition: string;
```

- *Type:* string

The partition in which this stack is defined.

---

##### `region`<sup>Required</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

The AWS region into which this stack will be deployed (e.g. `us-west-2`).

This value is resolved according to the following rules:

1. The value provided to `env.region` when the stack is defined. This can
   either be a concrete region (e.g. `us-west-2`) or the `Aws.REGION`
   token.
3. `Aws.REGION`, which is represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::Region" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.region)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **region-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `stackId`<sup>Required</sup> <a name="stackId" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.stackId"></a>

```typescript
public readonly stackId: string;
```

- *Type:* string

The ID of the stack.

---

*Example*

```typescript
// After resolving, looks like
'arn:aws:cloudformation:us-west-2:123456789012:stack/teststack/51af3dc0-da77-11e4-872e-1234567db123'
```


##### `stackName`<sup>Required</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string

The concrete CloudFormation physical stack name.

This is either the name defined explicitly in the `stackName` prop or
allocated based on the stack's location in the construct tree. Stacks that
are directly defined under the app use their construct `id` as their stack
name. Stacks that are defined deeper within the tree will use a hashed naming
scheme based on the construct path to ensure uniqueness.

If you wish to obtain the deploy-time AWS::StackName intrinsic,
you can use `Aws.STACK_NAME` directly.

---

##### `synthesizer`<sup>Required</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer

Synthesis method for this stack.

---

##### `tags`<sup>Required</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.tags"></a>

```typescript
public readonly tags: TagManager;
```

- *Type:* aws-cdk-lib.TagManager

Tags to be applied to the stack.

---

##### `templateFile`<sup>Required</sup> <a name="templateFile" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.templateFile"></a>

```typescript
public readonly templateFile: string;
```

- *Type:* string

The name of the CloudFormation template file emitted to the output directory during synthesis.

Example value: `MyStack.template.json`

---

##### `templateOptions`<sup>Required</sup> <a name="templateOptions" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.templateOptions"></a>

```typescript
public readonly templateOptions: ITemplateOptions;
```

- *Type:* aws-cdk-lib.ITemplateOptions

Options for CloudFormation template (like version, transform, description).

---

##### `urlSuffix`<sup>Required</sup> <a name="urlSuffix" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.urlSuffix"></a>

```typescript
public readonly urlSuffix: string;
```

- *Type:* string

The Amazon domain suffix for the region in which this stack is defined.

---

##### `nestedStackParent`<sup>Optional</sup> <a name="nestedStackParent" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.nestedStackParent"></a>

```typescript
public readonly nestedStackParent: Stack;
```

- *Type:* aws-cdk-lib.Stack

If this is a nested stack, returns it's parent stack.

---

##### `nestedStackResource`<sup>Optional</sup> <a name="nestedStackResource" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.nestedStackResource"></a>

```typescript
public readonly nestedStackResource: CfnResource;
```

- *Type:* aws-cdk-lib.CfnResource

If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource.

`undefined` for top-level (non-nested) stacks.

---

##### `terminationProtection`<sup>Required</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean

Whether termination protection is enabled for this stack.

---

##### `config`<sup>Required</sup> <a name="config" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprint.property.config"></a>

```typescript
public readonly config: IVanillaPipelineBlueprintProps;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps">IVanillaPipelineBlueprintProps</a>

---


### VPCStack <a name="VPCStack" id="@cdklabs/cdk-cicd-wrapper.VPCStack"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.VPCStack.Initializer"></a>

```typescript
import { VPCStack } from '@cdklabs/cdk-cicd-wrapper'

new VPCStack(scope: Construct, id: string, props: VPCStackProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps">VPCStackProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.VPCStack.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.VPCStack.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.VPCStack.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps">VPCStackProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.addDependency">addDependency</a></code> | Add a dependency between this stack and another stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.addMetadata">addMetadata</a></code> | Adds an arbitary key-value pair, with information you want to record about the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.addTransform">addTransform</a></code> | Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.exportStringListValue">exportStringListValue</a></code> | Create a CloudFormation Export for a string list value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.exportValue">exportValue</a></code> | Create a CloudFormation Export for a string value. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.formatArn">formatArn</a></code> | Creates an ARN from components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.getLogicalId">getLogicalId</a></code> | Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.regionalFact">regionalFact</a></code> | Look up a fact value for the given fact for the region of this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.renameLogicalId">renameLogicalId</a></code> | Rename a generated logical identities. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.reportMissingContextKey">reportMissingContextKey</a></code> | Indicate that a context key was expected. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.resolve">resolve</a></code> | Resolve a tokenized value in the context of the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.splitArn">splitArn</a></code> | Splits the provided ARN into its components. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.toJsonString">toJsonString</a></code> | Convert an object, potentially containing tokens, to a JSON string. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.toYamlString">toYamlString</a></code> | Convert an object, potentially containing tokens, to a YAML string. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.VPCStack.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `addDependency` <a name="addDependency" id="@cdklabs/cdk-cicd-wrapper.VPCStack.addDependency"></a>

```typescript
public addDependency(target: Stack, reason?: string): void
```

Add a dependency between this stack and another stack.

This can be used to define dependencies between any two stacks within an
app, and also supports nested stacks.

###### `target`<sup>Required</sup> <a name="target" id="@cdklabs/cdk-cicd-wrapper.VPCStack.addDependency.parameter.target"></a>

- *Type:* aws-cdk-lib.Stack

---

###### `reason`<sup>Optional</sup> <a name="reason" id="@cdklabs/cdk-cicd-wrapper.VPCStack.addDependency.parameter.reason"></a>

- *Type:* string

---

##### `addMetadata` <a name="addMetadata" id="@cdklabs/cdk-cicd-wrapper.VPCStack.addMetadata"></a>

```typescript
public addMetadata(key: string, value: any): void
```

Adds an arbitary key-value pair, with information you want to record about the stack.

These get translated to the Metadata section of the generated template.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/metadata-section-structure.html)

###### `key`<sup>Required</sup> <a name="key" id="@cdklabs/cdk-cicd-wrapper.VPCStack.addMetadata.parameter.key"></a>

- *Type:* string

---

###### `value`<sup>Required</sup> <a name="value" id="@cdklabs/cdk-cicd-wrapper.VPCStack.addMetadata.parameter.value"></a>

- *Type:* any

---

##### `addTransform` <a name="addTransform" id="@cdklabs/cdk-cicd-wrapper.VPCStack.addTransform"></a>

```typescript
public addTransform(transform: string): void
```

Add a Transform to this stack. A Transform is a macro that AWS CloudFormation uses to process your template.

Duplicate values are removed when stack is synthesized.

> [https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-section-structure.html)

*Example*

```typescript
declare const stack: Stack;

stack.addTransform('AWS::Serverless-2016-10-31')
```


###### `transform`<sup>Required</sup> <a name="transform" id="@cdklabs/cdk-cicd-wrapper.VPCStack.addTransform.parameter.transform"></a>

- *Type:* string

The transform to add.

---

##### `exportStringListValue` <a name="exportStringListValue" id="@cdklabs/cdk-cicd-wrapper.VPCStack.exportStringListValue"></a>

```typescript
public exportStringListValue(exportedValue: any, options?: ExportValueOptions): string[]
```

Create a CloudFormation Export for a string list value.

Returns a string list representing the corresponding `Fn.importValue()`
expression for this Export. The export expression is automatically wrapped with an
`Fn::Join` and the import value with an `Fn::Split`, since CloudFormation can only
export strings. You can control the name for the export by passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

See `exportValue` for an example of this process.

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.VPCStack.exportStringListValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.VPCStack.exportStringListValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `exportValue` <a name="exportValue" id="@cdklabs/cdk-cicd-wrapper.VPCStack.exportValue"></a>

```typescript
public exportValue(exportedValue: any, options?: ExportValueOptions): string
```

Create a CloudFormation Export for a string value.

Returns a string representing the corresponding `Fn.importValue()`
expression for this Export. You can control the name for the export by
passing the `name` option.

If you don't supply a value for `name`, the value you're exporting must be
a Resource attribute (for example: `bucket.bucketName`) and it will be
given the same name as the automatic cross-stack reference that would be created
if you used the attribute in another Stack.

One of the uses for this method is to *remove* the relationship between
two Stacks established by automatic cross-stack references. It will
temporarily ensure that the CloudFormation Export still exists while you
remove the reference from the consuming stack. After that, you can remove
the resource and the manual export.

## Example

Here is how the process works. Let's say there are two stacks,
`producerStack` and `consumerStack`, and `producerStack` has a bucket
called `bucket`, which is referenced by `consumerStack` (perhaps because
an AWS Lambda Function writes into it, or something like that).

It is not safe to remove `producerStack.bucket` because as the bucket is being
deleted, `consumerStack` might still be using it.

Instead, the process takes two deployments:

### Deployment 1: break the relationship

- Make sure `consumerStack` no longer references `bucket.bucketName` (maybe the consumer
  stack now uses its own bucket, or it writes to an AWS DynamoDB table, or maybe you just
  remove the Lambda Function altogether).
- In the `ProducerStack` class, call `this.exportValue(this.bucket.bucketName)`. This
  will make sure the CloudFormation Export continues to exist while the relationship
  between the two stacks is being broken.
- Deploy (this will effectively only change the `consumerStack`, but it's safe to deploy both).

### Deployment 2: remove the bucket resource

- You are now free to remove the `bucket` resource from `producerStack`.
- Don't forget to remove the `exportValue()` call as well.
- Deploy again (this time only the `producerStack` will be changed -- the bucket will be deleted).

###### `exportedValue`<sup>Required</sup> <a name="exportedValue" id="@cdklabs/cdk-cicd-wrapper.VPCStack.exportValue.parameter.exportedValue"></a>

- *Type:* any

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.VPCStack.exportValue.parameter.options"></a>

- *Type:* aws-cdk-lib.ExportValueOptions

---

##### `formatArn` <a name="formatArn" id="@cdklabs/cdk-cicd-wrapper.VPCStack.formatArn"></a>

```typescript
public formatArn(components: ArnComponents): string
```

Creates an ARN from components.

If `partition`, `region` or `account` are not specified, the stack's
partition, region and account will be used.

If any component is the empty string, an empty string will be inserted
into the generated ARN at the location that component corresponds to.

The ARN will be formatted as follows:

  arn:{partition}:{service}:{region}:{account}:{resource}{sep}{resource-name}

The required ARN pieces that are omitted will be taken from the stack that
the 'scope' is attached to. If all ARN pieces are supplied, the supplied scope
can be 'undefined'.

###### `components`<sup>Required</sup> <a name="components" id="@cdklabs/cdk-cicd-wrapper.VPCStack.formatArn.parameter.components"></a>

- *Type:* aws-cdk-lib.ArnComponents

---

##### `getLogicalId` <a name="getLogicalId" id="@cdklabs/cdk-cicd-wrapper.VPCStack.getLogicalId"></a>

```typescript
public getLogicalId(element: CfnElement): string
```

Allocates a stack-unique CloudFormation-compatible logical identity for a specific resource.

This method is called when a `CfnElement` is created and used to render the
initial logical identity of resources. Logical ID renames are applied at
this stage.

This method uses the protected method `allocateLogicalId` to render the
logical ID for an element. To modify the naming scheme, extend the `Stack`
class and override this method.

###### `element`<sup>Required</sup> <a name="element" id="@cdklabs/cdk-cicd-wrapper.VPCStack.getLogicalId.parameter.element"></a>

- *Type:* aws-cdk-lib.CfnElement

The CloudFormation element for which a logical identity is needed.

---

##### `regionalFact` <a name="regionalFact" id="@cdklabs/cdk-cicd-wrapper.VPCStack.regionalFact"></a>

```typescript
public regionalFact(factName: string, defaultValue?: string): string
```

Look up a fact value for the given fact for the region of this stack.

Will return a definite value only if the region of the current stack is resolved.
If not, a lookup map will be added to the stack and the lookup will be done at
CDK deployment time.

What regions will be included in the lookup map is controlled by the
`@aws-cdk/core:target-partitions` context value: it must be set to a list
of partitions, and only regions from the given partitions will be included.
If no such context key is set, all regions will be included.

This function is intended to be used by construct library authors. Application
builders can rely on the abstractions offered by construct libraries and do
not have to worry about regional facts.

If `defaultValue` is not given, it is an error if the fact is unknown for
the given region.

###### `factName`<sup>Required</sup> <a name="factName" id="@cdklabs/cdk-cicd-wrapper.VPCStack.regionalFact.parameter.factName"></a>

- *Type:* string

---

###### `defaultValue`<sup>Optional</sup> <a name="defaultValue" id="@cdklabs/cdk-cicd-wrapper.VPCStack.regionalFact.parameter.defaultValue"></a>

- *Type:* string

---

##### `renameLogicalId` <a name="renameLogicalId" id="@cdklabs/cdk-cicd-wrapper.VPCStack.renameLogicalId"></a>

```typescript
public renameLogicalId(oldId: string, newId: string): void
```

Rename a generated logical identities.

To modify the naming scheme strategy, extend the `Stack` class and
override the `allocateLogicalId` method.

###### `oldId`<sup>Required</sup> <a name="oldId" id="@cdklabs/cdk-cicd-wrapper.VPCStack.renameLogicalId.parameter.oldId"></a>

- *Type:* string

---

###### `newId`<sup>Required</sup> <a name="newId" id="@cdklabs/cdk-cicd-wrapper.VPCStack.renameLogicalId.parameter.newId"></a>

- *Type:* string

---

##### `reportMissingContextKey` <a name="reportMissingContextKey" id="@cdklabs/cdk-cicd-wrapper.VPCStack.reportMissingContextKey"></a>

```typescript
public reportMissingContextKey(report: MissingContext): void
```

Indicate that a context key was expected.

Contains instructions which will be emitted into the cloud assembly on how
the key should be supplied.

###### `report`<sup>Required</sup> <a name="report" id="@cdklabs/cdk-cicd-wrapper.VPCStack.reportMissingContextKey.parameter.report"></a>

- *Type:* aws-cdk-lib.cloud_assembly_schema.MissingContext

The set of parameters needed to obtain the context.

---

##### `resolve` <a name="resolve" id="@cdklabs/cdk-cicd-wrapper.VPCStack.resolve"></a>

```typescript
public resolve(obj: any): any
```

Resolve a tokenized value in the context of the current stack.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.VPCStack.resolve.parameter.obj"></a>

- *Type:* any

---

##### `splitArn` <a name="splitArn" id="@cdklabs/cdk-cicd-wrapper.VPCStack.splitArn"></a>

```typescript
public splitArn(arn: string, arnFormat: ArnFormat): ArnComponents
```

Splits the provided ARN into its components.

Works both if 'arn' is a string like 'arn:aws:s3:::bucket',
and a Token representing a dynamic CloudFormation expression
(in which case the returned components will also be dynamic CloudFormation expressions,
encoded as Tokens).

###### `arn`<sup>Required</sup> <a name="arn" id="@cdklabs/cdk-cicd-wrapper.VPCStack.splitArn.parameter.arn"></a>

- *Type:* string

the ARN to split into its components.

---

###### `arnFormat`<sup>Required</sup> <a name="arnFormat" id="@cdklabs/cdk-cicd-wrapper.VPCStack.splitArn.parameter.arnFormat"></a>

- *Type:* aws-cdk-lib.ArnFormat

the expected format of 'arn' - depends on what format the service 'arn' represents uses.

---

##### `toJsonString` <a name="toJsonString" id="@cdklabs/cdk-cicd-wrapper.VPCStack.toJsonString"></a>

```typescript
public toJsonString(obj: any, space?: number): string
```

Convert an object, potentially containing tokens, to a JSON string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.VPCStack.toJsonString.parameter.obj"></a>

- *Type:* any

---

###### `space`<sup>Optional</sup> <a name="space" id="@cdklabs/cdk-cicd-wrapper.VPCStack.toJsonString.parameter.space"></a>

- *Type:* number

---

##### `toYamlString` <a name="toYamlString" id="@cdklabs/cdk-cicd-wrapper.VPCStack.toYamlString"></a>

```typescript
public toYamlString(obj: any): string
```

Convert an object, potentially containing tokens, to a YAML string.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.VPCStack.toYamlString.parameter.obj"></a>

- *Type:* any

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.isStack">isStack</a></code> | Return whether the given object is a Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.of">of</a></code> | Looks up the first stack scope in which `construct` is defined. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.VPCStack.isConstruct"></a>

```typescript
import { VPCStack } from '@cdklabs/cdk-cicd-wrapper'

VPCStack.isConstruct(x: any)
```

Checks if `x` is a construct.

Use this method instead of `instanceof` to properly detect `Construct`
instances, even when the construct library is symlinked.

Explanation: in JavaScript, multiple copies of the `constructs` library on
disk are seen as independent, completely different libraries. As a
consequence, the class `Construct` in each copy of the `constructs` library
is seen as a different class, and an instance of one class will not test as
`instanceof` the other class. `npm install` will not create installations
like this, but users may manually symlink construct libraries together or
use a monorepo tool: in those cases, multiple copies of the `constructs`
library can be accidentally installed, and `instanceof` will behave
unpredictably. It is safest to avoid using `instanceof`, and using
this type-testing method instead.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.VPCStack.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `isStack` <a name="isStack" id="@cdklabs/cdk-cicd-wrapper.VPCStack.isStack"></a>

```typescript
import { VPCStack } from '@cdklabs/cdk-cicd-wrapper'

VPCStack.isStack(x: any)
```

Return whether the given object is a Stack.

We do attribute detection since we can't reliably use 'instanceof'.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.VPCStack.isStack.parameter.x"></a>

- *Type:* any

---

##### `of` <a name="of" id="@cdklabs/cdk-cicd-wrapper.VPCStack.of"></a>

```typescript
import { VPCStack } from '@cdklabs/cdk-cicd-wrapper'

VPCStack.of(construct: IConstruct)
```

Looks up the first stack scope in which `construct` is defined.

Fails if there is no stack up the tree.

###### `construct`<sup>Required</sup> <a name="construct" id="@cdklabs/cdk-cicd-wrapper.VPCStack.of.parameter.construct"></a>

- *Type:* constructs.IConstruct

The construct to start the search from.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.account">account</a></code> | <code>string</code> | The AWS account into which this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.artifactId">artifactId</a></code> | <code>string</code> | The ID of the cloud assembly artifact for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.availabilityZones">availabilityZones</a></code> | <code>string[]</code> | Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.bundlingRequired">bundlingRequired</a></code> | <code>boolean</code> | Indicates whether the stack requires bundling or not. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.dependencies">dependencies</a></code> | <code>aws-cdk-lib.Stack[]</code> | Return the stacks this stack depends on. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.environment">environment</a></code> | <code>string</code> | The environment coordinates in which this stack is deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.nested">nested</a></code> | <code>boolean</code> | Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.notificationArns">notificationArns</a></code> | <code>string[]</code> | Returns the list of notification Amazon Resource Names (ARNs) for the current stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.partition">partition</a></code> | <code>string</code> | The partition in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.region">region</a></code> | <code>string</code> | The AWS region into which this stack will be deployed (e.g. `us-west-2`). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.stackId">stackId</a></code> | <code>string</code> | The ID of the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.stackName">stackName</a></code> | <code>string</code> | The concrete CloudFormation physical stack name. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.tags">tags</a></code> | <code>aws-cdk-lib.TagManager</code> | Tags to be applied to the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.templateFile">templateFile</a></code> | <code>string</code> | The name of the CloudFormation template file emitted to the output directory during synthesis. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.templateOptions">templateOptions</a></code> | <code>aws-cdk-lib.ITemplateOptions</code> | Options for CloudFormation template (like version, transform, description). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.urlSuffix">urlSuffix</a></code> | <code>string</code> | The Amazon domain suffix for the region in which this stack is defined. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.nestedStackParent">nestedStackParent</a></code> | <code>aws-cdk-lib.Stack</code> | If this is a nested stack, returns it's parent stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.nestedStackResource">nestedStackResource</a></code> | <code>aws-cdk-lib.CfnResource</code> | If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether termination protection is enabled for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStack.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `account`<sup>Required</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

The AWS account into which this stack will be deployed.

This value is resolved according to the following rules:

1. The value provided to `env.account` when the stack is defined. This can
   either be a concrete account (e.g. `585695031111`) or the
   `Aws.ACCOUNT_ID` token.
3. `Aws.ACCOUNT_ID`, which represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::AccountId" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.account)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **account-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `artifactId`<sup>Required</sup> <a name="artifactId" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.artifactId"></a>

```typescript
public readonly artifactId: string;
```

- *Type:* string

The ID of the cloud assembly artifact for this stack.

---

##### `availabilityZones`<sup>Required</sup> <a name="availabilityZones" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.availabilityZones"></a>

```typescript
public readonly availabilityZones: string[];
```

- *Type:* string[]

Returns the list of AZs that are available in the AWS environment (account/region) associated with this stack.

If the stack is environment-agnostic (either account and/or region are
tokens), this property will return an array with 2 tokens that will resolve
at deploy-time to the first two availability zones returned from CloudFormation's
`Fn::GetAZs` intrinsic function.

If they are not available in the context, returns a set of dummy values and
reports them as missing, and let the CLI resolve them by calling EC2
`DescribeAvailabilityZones` on the target environment.

To specify a different strategy for selecting availability zones override this method.

---

##### `bundlingRequired`<sup>Required</sup> <a name="bundlingRequired" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.bundlingRequired"></a>

```typescript
public readonly bundlingRequired: boolean;
```

- *Type:* boolean

Indicates whether the stack requires bundling or not.

---

##### `dependencies`<sup>Required</sup> <a name="dependencies" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.dependencies"></a>

```typescript
public readonly dependencies: Stack[];
```

- *Type:* aws-cdk-lib.Stack[]

Return the stacks this stack depends on.

---

##### `environment`<sup>Required</sup> <a name="environment" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.environment"></a>

```typescript
public readonly environment: string;
```

- *Type:* string

The environment coordinates in which this stack is deployed.

In the form
`aws://account/region`. Use `stack.account` and `stack.region` to obtain
the specific values, no need to parse.

You can use this value to determine if two stacks are targeting the same
environment.

If either `stack.account` or `stack.region` are not concrete values (e.g.
`Aws.ACCOUNT_ID` or `Aws.REGION`) the special strings `unknown-account` and/or
`unknown-region` will be used respectively to indicate this stack is
region/account-agnostic.

---

##### `nested`<sup>Required</sup> <a name="nested" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.nested"></a>

```typescript
public readonly nested: boolean;
```

- *Type:* boolean

Indicates if this is a nested stack, in which case `parentStack` will include a reference to it's parent.

---

##### `notificationArns`<sup>Required</sup> <a name="notificationArns" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.notificationArns"></a>

```typescript
public readonly notificationArns: string[];
```

- *Type:* string[]

Returns the list of notification Amazon Resource Names (ARNs) for the current stack.

---

##### `partition`<sup>Required</sup> <a name="partition" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.partition"></a>

```typescript
public readonly partition: string;
```

- *Type:* string

The partition in which this stack is defined.

---

##### `region`<sup>Required</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

The AWS region into which this stack will be deployed (e.g. `us-west-2`).

This value is resolved according to the following rules:

1. The value provided to `env.region` when the stack is defined. This can
   either be a concrete region (e.g. `us-west-2`) or the `Aws.REGION`
   token.
3. `Aws.REGION`, which is represents the CloudFormation intrinsic reference
   `{ "Ref": "AWS::Region" }` encoded as a string token.

Preferably, you should use the return value as an opaque string and not
attempt to parse it to implement your logic. If you do, you must first
check that it is a concrete value an not an unresolved token. If this
value is an unresolved token (`Token.isUnresolved(stack.region)` returns
`true`), this implies that the user wishes that this stack will synthesize
into a **region-agnostic template**. In this case, your code should either
fail (throw an error, emit a synth error using `Annotations.of(construct).addError()`) or
implement some other region-agnostic behavior.

---

##### `stackId`<sup>Required</sup> <a name="stackId" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.stackId"></a>

```typescript
public readonly stackId: string;
```

- *Type:* string

The ID of the stack.

---

*Example*

```typescript
// After resolving, looks like
'arn:aws:cloudformation:us-west-2:123456789012:stack/teststack/51af3dc0-da77-11e4-872e-1234567db123'
```


##### `stackName`<sup>Required</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string

The concrete CloudFormation physical stack name.

This is either the name defined explicitly in the `stackName` prop or
allocated based on the stack's location in the construct tree. Stacks that
are directly defined under the app use their construct `id` as their stack
name. Stacks that are defined deeper within the tree will use a hashed naming
scheme based on the construct path to ensure uniqueness.

If you wish to obtain the deploy-time AWS::StackName intrinsic,
you can use `Aws.STACK_NAME` directly.

---

##### `synthesizer`<sup>Required</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer

Synthesis method for this stack.

---

##### `tags`<sup>Required</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.tags"></a>

```typescript
public readonly tags: TagManager;
```

- *Type:* aws-cdk-lib.TagManager

Tags to be applied to the stack.

---

##### `templateFile`<sup>Required</sup> <a name="templateFile" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.templateFile"></a>

```typescript
public readonly templateFile: string;
```

- *Type:* string

The name of the CloudFormation template file emitted to the output directory during synthesis.

Example value: `MyStack.template.json`

---

##### `templateOptions`<sup>Required</sup> <a name="templateOptions" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.templateOptions"></a>

```typescript
public readonly templateOptions: ITemplateOptions;
```

- *Type:* aws-cdk-lib.ITemplateOptions

Options for CloudFormation template (like version, transform, description).

---

##### `urlSuffix`<sup>Required</sup> <a name="urlSuffix" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.urlSuffix"></a>

```typescript
public readonly urlSuffix: string;
```

- *Type:* string

The Amazon domain suffix for the region in which this stack is defined.

---

##### `nestedStackParent`<sup>Optional</sup> <a name="nestedStackParent" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.nestedStackParent"></a>

```typescript
public readonly nestedStackParent: Stack;
```

- *Type:* aws-cdk-lib.Stack

If this is a nested stack, returns it's parent stack.

---

##### `nestedStackResource`<sup>Optional</sup> <a name="nestedStackResource" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.nestedStackResource"></a>

```typescript
public readonly nestedStackResource: CfnResource;
```

- *Type:* aws-cdk-lib.CfnResource

If this is a nested stack, this represents its `AWS::CloudFormation::Stack` resource.

`undefined` for top-level (non-nested) stacks.

---

##### `terminationProtection`<sup>Required</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean

Whether termination protection is enabled for this stack.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cdklabs/cdk-cicd-wrapper.VPCStack.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc

---


## Structs <a name="Structs" id="Structs"></a>

### AppStageProps <a name="AppStageProps" id="@cdklabs/cdk-cicd-wrapper.AppStageProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.AppStageProps.Initializer"></a>

```typescript
import { AppStageProps } from '@cdklabs/cdk-cicd-wrapper'

const appStageProps: AppStageProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStageProps.property.env">env</a></code> | <code>aws-cdk-lib.Environment</code> | Default AWS environment (account/region) for `Stack`s in this `Stage`. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStageProps.property.outdir">outdir</a></code> | <code>string</code> | The output directory into which to emit synthesized artifacts. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStageProps.property.permissionsBoundary">permissionsBoundary</a></code> | <code>aws-cdk-lib.PermissionsBoundary</code> | Options for applying a permissions boundary to all IAM Roles and Users created within this Stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStageProps.property.policyValidationBeta1">policyValidationBeta1</a></code> | <code>aws-cdk-lib.IPolicyValidationPluginBeta1[]</code> | Validation plugins to run during synthesis. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStageProps.property.stageName">stageName</a></code> | <code>string</code> | Name of this stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppStageProps.property.context">context</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext">ResourceContext</a></code> | *No description.* |

---

##### `env`<sup>Optional</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.AppStageProps.property.env"></a>

```typescript
public readonly env: Environment;
```

- *Type:* aws-cdk-lib.Environment
- *Default:* The environments should be configured on the `Stack`s.

Default AWS environment (account/region) for `Stack`s in this `Stage`.

Stacks defined inside this `Stage` with either `region` or `account` missing
from its env will use the corresponding field given here.

If either `region` or `account`is is not configured for `Stack` (either on
the `Stack` itself or on the containing `Stage`), the Stack will be
*environment-agnostic*.

Environment-agnostic stacks can be deployed to any environment, may not be
able to take advantage of all features of the CDK. For example, they will
not be able to use environmental context lookups, will not automatically
translate Service Principals to the right format based on the environment's
AWS partition, and other such enhancements.

---

*Example*

```typescript
// Use a concrete account and region to deploy this Stage to
new Stage(app, 'Stage1', {
  env: { account: '123456789012', region: 'us-east-1' },
});

// Use the CLI's current credentials to determine the target environment
new Stage(app, 'Stage2', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
```


##### `outdir`<sup>Optional</sup> <a name="outdir" id="@cdklabs/cdk-cicd-wrapper.AppStageProps.property.outdir"></a>

```typescript
public readonly outdir: string;
```

- *Type:* string
- *Default:* for nested stages, outdir will be determined as a relative directory to the outdir of the app. For apps, if outdir is not specified, a temporary directory will be created.

The output directory into which to emit synthesized artifacts.

Can only be specified if this stage is the root stage (the app). If this is
specified and this stage is nested within another stage, an error will be
thrown.

---

##### `permissionsBoundary`<sup>Optional</sup> <a name="permissionsBoundary" id="@cdklabs/cdk-cicd-wrapper.AppStageProps.property.permissionsBoundary"></a>

```typescript
public readonly permissionsBoundary: PermissionsBoundary;
```

- *Type:* aws-cdk-lib.PermissionsBoundary
- *Default:* no permissions boundary is applied

Options for applying a permissions boundary to all IAM Roles and Users created within this Stage.

---

##### `policyValidationBeta1`<sup>Optional</sup> <a name="policyValidationBeta1" id="@cdklabs/cdk-cicd-wrapper.AppStageProps.property.policyValidationBeta1"></a>

```typescript
public readonly policyValidationBeta1: IPolicyValidationPluginBeta1[];
```

- *Type:* aws-cdk-lib.IPolicyValidationPluginBeta1[]
- *Default:* no validation plugins are used

Validation plugins to run during synthesis.

If any plugin reports any violation,
synthesis will be interrupted and the report displayed to the user.

---

##### `stageName`<sup>Optional</sup> <a name="stageName" id="@cdklabs/cdk-cicd-wrapper.AppStageProps.property.stageName"></a>

```typescript
public readonly stageName: string;
```

- *Type:* string
- *Default:* Derived from the id.

Name of this stage.

---

##### `context`<sup>Required</sup> <a name="context" id="@cdklabs/cdk-cicd-wrapper.AppStageProps.property.context"></a>

```typescript
public readonly context: ResourceContext;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext">ResourceContext</a>

---

### BaseRepositoryProviderProps <a name="BaseRepositoryProviderProps" id="@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.Initializer"></a>

```typescript
import { BaseRepositoryProviderProps } from '@cdklabs/cdk-cicd-wrapper'

const baseRepositoryProviderProps: BaseRepositoryProviderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.property.branch">branch</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.property.name">name</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.property.repositoryType">repositoryType</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.property.description">description</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.property.codeGuruReviewer">codeGuruReviewer</a></code> | <code>boolean</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.property.codeStarConnectionArn">codeStarConnectionArn</a></code> | <code>string</code> | *No description.* |

---

##### `branch`<sup>Required</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.property.branch"></a>

```typescript
public readonly branch: string;
```

- *Type:* string

---

##### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.property.name"></a>

```typescript
public readonly name: string;
```

- *Type:* string

---

##### `repositoryType`<sup>Required</sup> <a name="repositoryType" id="@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.property.repositoryType"></a>

```typescript
public readonly repositoryType: string;
```

- *Type:* string

---

##### `description`<sup>Optional</sup> <a name="description" id="@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string

---

##### `codeGuruReviewer`<sup>Optional</sup> <a name="codeGuruReviewer" id="@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.property.codeGuruReviewer"></a>

```typescript
public readonly codeGuruReviewer: boolean;
```

- *Type:* boolean

---

##### `codeStarConnectionArn`<sup>Optional</sup> <a name="codeStarConnectionArn" id="@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps.property.codeStarConnectionArn"></a>

```typescript
public readonly codeStarConnectionArn: string;
```

- *Type:* string

---

### CDKPipelineProps <a name="CDKPipelineProps" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.Initializer"></a>

```typescript
import { CDKPipelineProps } from '@cdklabs/cdk-cicd-wrapper'

const cDKPipelineProps: CDKPipelineProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.branch">branch</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.codeBuildDefaults">codeBuildDefaults</a></code> | <code>aws-cdk-lib.pipelines.CodeBuildOptions</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.pipelineCommands">pipelineCommands</a></code> | <code>string[]</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.primaryOutputDirectory">primaryOutputDirectory</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.repositoryInput">repositoryInput</a></code> | <code>aws-cdk-lib.pipelines.IFileSetProducer</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.buildImage">buildImage</a></code> | <code>aws-cdk-lib.aws_codebuild.IBuildImage</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.codeGuruScanThreshold">codeGuruScanThreshold</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold">CodeGuruSeverityThreshold</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.installCommands">installCommands</a></code> | <code>string[]</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.isDockerEnabledForSynth">isDockerEnabledForSynth</a></code> | <code>boolean</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.pipelineVariables">pipelineVariables</a></code> | <code>{[ key: string ]: string}</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.vpcProps">vpcProps</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.VpcProps">VpcProps</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.applicationQualifier">applicationQualifier</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.pipelineName">pipelineName</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.rolePolicies">rolePolicies</a></code> | <code>aws-cdk-lib.aws_iam.PolicyStatement[]</code> | *No description.* |

---

##### `branch`<sup>Required</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.branch"></a>

```typescript
public readonly branch: string;
```

- *Type:* string

---

##### `codeBuildDefaults`<sup>Required</sup> <a name="codeBuildDefaults" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.codeBuildDefaults"></a>

```typescript
public readonly codeBuildDefaults: CodeBuildOptions;
```

- *Type:* aws-cdk-lib.pipelines.CodeBuildOptions

---

##### `pipelineCommands`<sup>Required</sup> <a name="pipelineCommands" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.pipelineCommands"></a>

```typescript
public readonly pipelineCommands: string[];
```

- *Type:* string[]

---

##### `primaryOutputDirectory`<sup>Required</sup> <a name="primaryOutputDirectory" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.primaryOutputDirectory"></a>

```typescript
public readonly primaryOutputDirectory: string;
```

- *Type:* string

---

##### `repositoryInput`<sup>Required</sup> <a name="repositoryInput" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.repositoryInput"></a>

```typescript
public readonly repositoryInput: IFileSetProducer;
```

- *Type:* aws-cdk-lib.pipelines.IFileSetProducer

---

##### `buildImage`<sup>Optional</sup> <a name="buildImage" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.buildImage"></a>

```typescript
public readonly buildImage: IBuildImage;
```

- *Type:* aws-cdk-lib.aws_codebuild.IBuildImage

---

##### `codeGuruScanThreshold`<sup>Optional</sup> <a name="codeGuruScanThreshold" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.codeGuruScanThreshold"></a>

```typescript
public readonly codeGuruScanThreshold: CodeGuruSeverityThreshold;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold">CodeGuruSeverityThreshold</a>

---

##### `installCommands`<sup>Optional</sup> <a name="installCommands" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.installCommands"></a>

```typescript
public readonly installCommands: string[];
```

- *Type:* string[]

---

##### `isDockerEnabledForSynth`<sup>Optional</sup> <a name="isDockerEnabledForSynth" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.isDockerEnabledForSynth"></a>

```typescript
public readonly isDockerEnabledForSynth: boolean;
```

- *Type:* boolean

---

##### `pipelineVariables`<sup>Optional</sup> <a name="pipelineVariables" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.pipelineVariables"></a>

```typescript
public readonly pipelineVariables: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}

---

##### `vpcProps`<sup>Optional</sup> <a name="vpcProps" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.vpcProps"></a>

```typescript
public readonly vpcProps: VpcProps;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.VpcProps">VpcProps</a>

---

##### `applicationQualifier`<sup>Required</sup> <a name="applicationQualifier" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.applicationQualifier"></a>

```typescript
public readonly applicationQualifier: string;
```

- *Type:* string

---

##### `pipelineName`<sup>Required</sup> <a name="pipelineName" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.pipelineName"></a>

```typescript
public readonly pipelineName: string;
```

- *Type:* string

---

##### `rolePolicies`<sup>Optional</sup> <a name="rolePolicies" id="@cdklabs/cdk-cicd-wrapper.CDKPipelineProps.property.rolePolicies"></a>

```typescript
public readonly rolePolicies: PolicyStatement[];
```

- *Type:* aws-cdk-lib.aws_iam.PolicyStatement[]

---

### CodeCommitRepositoryConstructProps <a name="CodeCommitRepositoryConstructProps" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.Initializer"></a>

```typescript
import { CodeCommitRepositoryConstructProps } from '@cdklabs/cdk-cicd-wrapper'

const codeCommitRepositoryConstructProps: CodeCommitRepositoryConstructProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.branch">branch</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.name">name</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.repositoryType">repositoryType</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.description">description</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.applicationName">applicationName</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.applicationQualifier">applicationQualifier</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.pr">pr</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.PRCheckConfig">PRCheckConfig</a></code> | *No description.* |

---

##### `branch`<sup>Required</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.branch"></a>

```typescript
public readonly branch: string;
```

- *Type:* string

---

##### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.name"></a>

```typescript
public readonly name: string;
```

- *Type:* string

---

##### `repositoryType`<sup>Required</sup> <a name="repositoryType" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.repositoryType"></a>

```typescript
public readonly repositoryType: string;
```

- *Type:* string

---

##### `description`<sup>Optional</sup> <a name="description" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string

---

##### `applicationName`<sup>Required</sup> <a name="applicationName" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.applicationName"></a>

```typescript
public readonly applicationName: string;
```

- *Type:* string

---

##### `applicationQualifier`<sup>Required</sup> <a name="applicationQualifier" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.applicationQualifier"></a>

```typescript
public readonly applicationQualifier: string;
```

- *Type:* string

---

##### `pr`<sup>Optional</sup> <a name="pr" id="@cdklabs/cdk-cicd-wrapper.CodeCommitRepositoryConstructProps.property.pr"></a>

```typescript
public readonly pr: PRCheckConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.PRCheckConfig">PRCheckConfig</a>

---

### CodeStarConfig <a name="CodeStarConfig" id="@cdklabs/cdk-cicd-wrapper.CodeStarConfig"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.CodeStarConfig.Initializer"></a>

```typescript
import { CodeStarConfig } from '@cdklabs/cdk-cicd-wrapper'

const codeStarConfig: CodeStarConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConfig.property.branch">branch</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConfig.property.name">name</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConfig.property.repositoryType">repositoryType</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConfig.property.description">description</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConfig.property.codeStarConnectionArn">codeStarConnectionArn</a></code> | <code>string</code> | *No description.* |

---

##### `branch`<sup>Required</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.CodeStarConfig.property.branch"></a>

```typescript
public readonly branch: string;
```

- *Type:* string

---

##### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.CodeStarConfig.property.name"></a>

```typescript
public readonly name: string;
```

- *Type:* string

---

##### `repositoryType`<sup>Required</sup> <a name="repositoryType" id="@cdklabs/cdk-cicd-wrapper.CodeStarConfig.property.repositoryType"></a>

```typescript
public readonly repositoryType: string;
```

- *Type:* string

---

##### `description`<sup>Optional</sup> <a name="description" id="@cdklabs/cdk-cicd-wrapper.CodeStarConfig.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string

---

##### `codeStarConnectionArn`<sup>Required</sup> <a name="codeStarConnectionArn" id="@cdklabs/cdk-cicd-wrapper.CodeStarConfig.property.codeStarConnectionArn"></a>

```typescript
public readonly codeStarConnectionArn: string;
```

- *Type:* string

---

### CodeStarConnectRepositoryStackProps <a name="CodeStarConnectRepositoryStackProps" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.Initializer"></a>

```typescript
import { CodeStarConnectRepositoryStackProps } from '@cdklabs/cdk-cicd-wrapper'

const codeStarConnectRepositoryStackProps: CodeStarConnectRepositoryStackProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.analyticsReporting">analyticsReporting</a></code> | <code>boolean</code> | Include runtime versioning information in this Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.crossRegionReferences">crossRegionReferences</a></code> | <code>boolean</code> | Enable this flag to allow native cross region stack references. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.description">description</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.env">env</a></code> | <code>aws-cdk-lib.Environment</code> | The AWS environment (account/region) where this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.permissionsBoundary">permissionsBoundary</a></code> | <code>aws-cdk-lib.PermissionsBoundary</code> | Options for applying a permissions boundary to all IAM Roles and Users created within this Stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.stackName">stackName</a></code> | <code>string</code> | Name to deploy the stack with. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.suppressTemplateIndentation">suppressTemplateIndentation</a></code> | <code>boolean</code> | Enable this flag to suppress indentation in generated CloudFormation templates. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method to use while deploying this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.tags">tags</a></code> | <code>{[ key: string ]: string}</code> | Stack tags that will be applied to all the taggable resources and the stack itself. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether to enable termination protection for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.branch">branch</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.name">name</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.repositoryType">repositoryType</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.codeStarConnectionArn">codeStarConnectionArn</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.applicationName">applicationName</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.applicationQualifier">applicationQualifier</a></code> | <code>string</code> | *No description.* |

---

##### `analyticsReporting`<sup>Optional</sup> <a name="analyticsReporting" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.analyticsReporting"></a>

```typescript
public readonly analyticsReporting: boolean;
```

- *Type:* boolean
- *Default:* `analyticsReporting` setting of containing `App`, or value of 'aws:cdk:version-reporting' context key

Include runtime versioning information in this Stack.

---

##### `crossRegionReferences`<sup>Optional</sup> <a name="crossRegionReferences" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.crossRegionReferences"></a>

```typescript
public readonly crossRegionReferences: boolean;
```

- *Type:* boolean
- *Default:* false

Enable this flag to allow native cross region stack references.

Enabling this will create a CloudFormation custom resource
in both the producing stack and consuming stack in order to perform the export/import

This feature is currently experimental

---

##### `description`<sup>Optional</sup> <a name="description" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string

---

##### `env`<sup>Optional</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.env"></a>

```typescript
public readonly env: Environment;
```

- *Type:* aws-cdk-lib.Environment
- *Default:* The environment of the containing `Stage` if available, otherwise create the stack will be environment-agnostic.

The AWS environment (account/region) where this stack will be deployed.

Set the `region`/`account` fields of `env` to either a concrete value to
select the indicated environment (recommended for production stacks), or to
the values of environment variables
`CDK_DEFAULT_REGION`/`CDK_DEFAULT_ACCOUNT` to let the target environment
depend on the AWS credentials/configuration that the CDK CLI is executed
under (recommended for development stacks).

If the `Stack` is instantiated inside a `Stage`, any undefined
`region`/`account` fields from `env` will default to the same field on the
encompassing `Stage`, if configured there.

If either `region` or `account` are not set nor inherited from `Stage`, the
Stack will be considered "*environment-agnostic*"". Environment-agnostic
stacks can be deployed to any environment but may not be able to take
advantage of all features of the CDK. For example, they will not be able to
use environmental context lookups such as `ec2.Vpc.fromLookup` and will not
automatically translate Service Principals to the right format based on the
environment's AWS partition, and other such enhancements.

---

*Example*

```typescript
// Use a concrete account and region to deploy this stack to:
// `.account` and `.region` will simply return these values.
new Stack(app, 'Stack1', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  },
});

// Use the CLI's current credentials to determine the target environment:
// `.account` and `.region` will reflect the account+region the CLI
// is configured to use (based on the user CLI credentials)
new Stack(app, 'Stack2', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
});

// Define multiple stacks stage associated with an environment
const myStage = new Stage(app, 'MyStage', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  }
});

// both of these stacks will use the stage's account/region:
// `.account` and `.region` will resolve to the concrete values as above
new MyStack(myStage, 'Stack1');
new YourStack(myStage, 'Stack2');

// Define an environment-agnostic stack:
// `.account` and `.region` will resolve to `{ "Ref": "AWS::AccountId" }` and `{ "Ref": "AWS::Region" }` respectively.
// which will only resolve to actual values by CloudFormation during deployment.
new MyStack(app, 'Stack1');
```


##### `permissionsBoundary`<sup>Optional</sup> <a name="permissionsBoundary" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.permissionsBoundary"></a>

```typescript
public readonly permissionsBoundary: PermissionsBoundary;
```

- *Type:* aws-cdk-lib.PermissionsBoundary
- *Default:* no permissions boundary is applied

Options for applying a permissions boundary to all IAM Roles and Users created within this Stage.

---

##### `stackName`<sup>Optional</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string
- *Default:* Derived from construct path.

Name to deploy the stack with.

---

##### `suppressTemplateIndentation`<sup>Optional</sup> <a name="suppressTemplateIndentation" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.suppressTemplateIndentation"></a>

```typescript
public readonly suppressTemplateIndentation: boolean;
```

- *Type:* boolean
- *Default:* the value of `@aws-cdk/core:suppressTemplateIndentation`, or `false` if that is not set.

Enable this flag to suppress indentation in generated CloudFormation templates.

If not specified, the value of the `@aws-cdk/core:suppressTemplateIndentation`
context key will be used. If that is not specified, then the
default value `false` will be used.

---

##### `synthesizer`<sup>Optional</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer
- *Default:* The synthesizer specified on `App`, or `DefaultStackSynthesizer` otherwise.

Synthesis method to use while deploying this stack.

The Stack Synthesizer controls aspects of synthesis and deployment,
like how assets are referenced and what IAM roles to use. For more
information, see the README of the main CDK package.

If not specified, the `defaultStackSynthesizer` from `App` will be used.
If that is not specified, `DefaultStackSynthesizer` is used if
`@aws-cdk/core:newStyleStackSynthesis` is set to `true` or the CDK major
version is v2. In CDK v1 `LegacyStackSynthesizer` is the default if no
other synthesizer is specified.

---

##### `tags`<sup>Optional</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.tags"></a>

```typescript
public readonly tags: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}
- *Default:* {}

Stack tags that will be applied to all the taggable resources and the stack itself.

---

##### `terminationProtection`<sup>Optional</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean
- *Default:* false

Whether to enable termination protection for this stack.

---

##### `branch`<sup>Required</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.branch"></a>

```typescript
public readonly branch: string;
```

- *Type:* string

---

##### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.name"></a>

```typescript
public readonly name: string;
```

- *Type:* string

---

##### `repositoryType`<sup>Required</sup> <a name="repositoryType" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.repositoryType"></a>

```typescript
public readonly repositoryType: string;
```

- *Type:* string

---

##### `codeStarConnectionArn`<sup>Required</sup> <a name="codeStarConnectionArn" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.codeStarConnectionArn"></a>

```typescript
public readonly codeStarConnectionArn: string;
```

- *Type:* string

---

##### `applicationName`<sup>Required</sup> <a name="applicationName" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.applicationName"></a>

```typescript
public readonly applicationName: string;
```

- *Type:* string

---

##### `applicationQualifier`<sup>Required</sup> <a name="applicationQualifier" id="@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStackProps.property.applicationQualifier"></a>

```typescript
public readonly applicationQualifier: string;
```

- *Type:* string

---

### ComplianceLogBucketStackProps <a name="ComplianceLogBucketStackProps" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.Initializer"></a>

```typescript
import { ComplianceLogBucketStackProps } from '@cdklabs/cdk-cicd-wrapper'

const complianceLogBucketStackProps: ComplianceLogBucketStackProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.analyticsReporting">analyticsReporting</a></code> | <code>boolean</code> | Include runtime versioning information in this Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.crossRegionReferences">crossRegionReferences</a></code> | <code>boolean</code> | Enable this flag to allow native cross region stack references. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.description">description</a></code> | <code>string</code> | A description of the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.env">env</a></code> | <code>aws-cdk-lib.Environment</code> | The AWS environment (account/region) where this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.permissionsBoundary">permissionsBoundary</a></code> | <code>aws-cdk-lib.PermissionsBoundary</code> | Options for applying a permissions boundary to all IAM Roles and Users created within this Stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.stackName">stackName</a></code> | <code>string</code> | Name to deploy the stack with. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.suppressTemplateIndentation">suppressTemplateIndentation</a></code> | <code>boolean</code> | Enable this flag to suppress indentation in generated CloudFormation templates. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method to use while deploying this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.tags">tags</a></code> | <code>{[ key: string ]: string}</code> | Stack tags that will be applied to all the taggable resources and the stack itself. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether to enable termination protection for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.complianceLogBucketName">complianceLogBucketName</a></code> | <code>string</code> | *No description.* |

---

##### `analyticsReporting`<sup>Optional</sup> <a name="analyticsReporting" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.analyticsReporting"></a>

```typescript
public readonly analyticsReporting: boolean;
```

- *Type:* boolean
- *Default:* `analyticsReporting` setting of containing `App`, or value of 'aws:cdk:version-reporting' context key

Include runtime versioning information in this Stack.

---

##### `crossRegionReferences`<sup>Optional</sup> <a name="crossRegionReferences" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.crossRegionReferences"></a>

```typescript
public readonly crossRegionReferences: boolean;
```

- *Type:* boolean
- *Default:* false

Enable this flag to allow native cross region stack references.

Enabling this will create a CloudFormation custom resource
in both the producing stack and consuming stack in order to perform the export/import

This feature is currently experimental

---

##### `description`<sup>Optional</sup> <a name="description" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string
- *Default:* No description.

A description of the stack.

---

##### `env`<sup>Optional</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.env"></a>

```typescript
public readonly env: Environment;
```

- *Type:* aws-cdk-lib.Environment
- *Default:* The environment of the containing `Stage` if available, otherwise create the stack will be environment-agnostic.

The AWS environment (account/region) where this stack will be deployed.

Set the `region`/`account` fields of `env` to either a concrete value to
select the indicated environment (recommended for production stacks), or to
the values of environment variables
`CDK_DEFAULT_REGION`/`CDK_DEFAULT_ACCOUNT` to let the target environment
depend on the AWS credentials/configuration that the CDK CLI is executed
under (recommended for development stacks).

If the `Stack` is instantiated inside a `Stage`, any undefined
`region`/`account` fields from `env` will default to the same field on the
encompassing `Stage`, if configured there.

If either `region` or `account` are not set nor inherited from `Stage`, the
Stack will be considered "*environment-agnostic*"". Environment-agnostic
stacks can be deployed to any environment but may not be able to take
advantage of all features of the CDK. For example, they will not be able to
use environmental context lookups such as `ec2.Vpc.fromLookup` and will not
automatically translate Service Principals to the right format based on the
environment's AWS partition, and other such enhancements.

---

*Example*

```typescript
// Use a concrete account and region to deploy this stack to:
// `.account` and `.region` will simply return these values.
new Stack(app, 'Stack1', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  },
});

// Use the CLI's current credentials to determine the target environment:
// `.account` and `.region` will reflect the account+region the CLI
// is configured to use (based on the user CLI credentials)
new Stack(app, 'Stack2', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
});

// Define multiple stacks stage associated with an environment
const myStage = new Stage(app, 'MyStage', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  }
});

// both of these stacks will use the stage's account/region:
// `.account` and `.region` will resolve to the concrete values as above
new MyStack(myStage, 'Stack1');
new YourStack(myStage, 'Stack2');

// Define an environment-agnostic stack:
// `.account` and `.region` will resolve to `{ "Ref": "AWS::AccountId" }` and `{ "Ref": "AWS::Region" }` respectively.
// which will only resolve to actual values by CloudFormation during deployment.
new MyStack(app, 'Stack1');
```


##### `permissionsBoundary`<sup>Optional</sup> <a name="permissionsBoundary" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.permissionsBoundary"></a>

```typescript
public readonly permissionsBoundary: PermissionsBoundary;
```

- *Type:* aws-cdk-lib.PermissionsBoundary
- *Default:* no permissions boundary is applied

Options for applying a permissions boundary to all IAM Roles and Users created within this Stage.

---

##### `stackName`<sup>Optional</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string
- *Default:* Derived from construct path.

Name to deploy the stack with.

---

##### `suppressTemplateIndentation`<sup>Optional</sup> <a name="suppressTemplateIndentation" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.suppressTemplateIndentation"></a>

```typescript
public readonly suppressTemplateIndentation: boolean;
```

- *Type:* boolean
- *Default:* the value of `@aws-cdk/core:suppressTemplateIndentation`, or `false` if that is not set.

Enable this flag to suppress indentation in generated CloudFormation templates.

If not specified, the value of the `@aws-cdk/core:suppressTemplateIndentation`
context key will be used. If that is not specified, then the
default value `false` will be used.

---

##### `synthesizer`<sup>Optional</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer
- *Default:* The synthesizer specified on `App`, or `DefaultStackSynthesizer` otherwise.

Synthesis method to use while deploying this stack.

The Stack Synthesizer controls aspects of synthesis and deployment,
like how assets are referenced and what IAM roles to use. For more
information, see the README of the main CDK package.

If not specified, the `defaultStackSynthesizer` from `App` will be used.
If that is not specified, `DefaultStackSynthesizer` is used if
`@aws-cdk/core:newStyleStackSynthesis` is set to `true` or the CDK major
version is v2. In CDK v1 `LegacyStackSynthesizer` is the default if no
other synthesizer is specified.

---

##### `tags`<sup>Optional</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.tags"></a>

```typescript
public readonly tags: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}
- *Default:* {}

Stack tags that will be applied to all the taggable resources and the stack itself.

---

##### `terminationProtection`<sup>Optional</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean
- *Default:* false

Whether to enable termination protection for this stack.

---

##### `complianceLogBucketName`<sup>Required</sup> <a name="complianceLogBucketName" id="@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStackProps.property.complianceLogBucketName"></a>

```typescript
public readonly complianceLogBucketName: string;
```

- *Type:* string

---

### DeploymentDefinition <a name="DeploymentDefinition" id="@cdklabs/cdk-cicd-wrapper.DeploymentDefinition"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.DeploymentDefinition.Initializer"></a>

```typescript
import { DeploymentDefinition } from '@cdklabs/cdk-cicd-wrapper'

const deploymentDefinition: DeploymentDefinition = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentDefinition.property.env">env</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.Environment">Environment</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentDefinition.property.stacksProviders">stacksProviders</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IStackProvider">IStackProvider</a>[]</code> | *No description.* |

---

##### `env`<sup>Required</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.DeploymentDefinition.property.env"></a>

```typescript
public readonly env: Environment;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.Environment">Environment</a>

---

##### `stacksProviders`<sup>Required</sup> <a name="stacksProviders" id="@cdklabs/cdk-cicd-wrapper.DeploymentDefinition.property.stacksProviders"></a>

```typescript
public readonly stacksProviders: IStackProvider[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IStackProvider">IStackProvider</a>[]

---

### EncryptionStackProps <a name="EncryptionStackProps" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.Initializer"></a>

```typescript
import { EncryptionStackProps } from '@cdklabs/cdk-cicd-wrapper'

const encryptionStackProps: EncryptionStackProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.analyticsReporting">analyticsReporting</a></code> | <code>boolean</code> | Include runtime versioning information in this Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.crossRegionReferences">crossRegionReferences</a></code> | <code>boolean</code> | Enable this flag to allow native cross region stack references. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.description">description</a></code> | <code>string</code> | A description of the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.env">env</a></code> | <code>aws-cdk-lib.Environment</code> | The AWS environment (account/region) where this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.permissionsBoundary">permissionsBoundary</a></code> | <code>aws-cdk-lib.PermissionsBoundary</code> | Options for applying a permissions boundary to all IAM Roles and Users created within this Stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.stackName">stackName</a></code> | <code>string</code> | Name to deploy the stack with. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.suppressTemplateIndentation">suppressTemplateIndentation</a></code> | <code>boolean</code> | Enable this flag to suppress indentation in generated CloudFormation templates. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method to use while deploying this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.tags">tags</a></code> | <code>{[ key: string ]: string}</code> | Stack tags that will be applied to all the taggable resources and the stack itself. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether to enable termination protection for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.applicationName">applicationName</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.stageName">stageName</a></code> | <code>string</code> | *No description.* |

---

##### `analyticsReporting`<sup>Optional</sup> <a name="analyticsReporting" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.analyticsReporting"></a>

```typescript
public readonly analyticsReporting: boolean;
```

- *Type:* boolean
- *Default:* `analyticsReporting` setting of containing `App`, or value of 'aws:cdk:version-reporting' context key

Include runtime versioning information in this Stack.

---

##### `crossRegionReferences`<sup>Optional</sup> <a name="crossRegionReferences" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.crossRegionReferences"></a>

```typescript
public readonly crossRegionReferences: boolean;
```

- *Type:* boolean
- *Default:* false

Enable this flag to allow native cross region stack references.

Enabling this will create a CloudFormation custom resource
in both the producing stack and consuming stack in order to perform the export/import

This feature is currently experimental

---

##### `description`<sup>Optional</sup> <a name="description" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string
- *Default:* No description.

A description of the stack.

---

##### `env`<sup>Optional</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.env"></a>

```typescript
public readonly env: Environment;
```

- *Type:* aws-cdk-lib.Environment
- *Default:* The environment of the containing `Stage` if available, otherwise create the stack will be environment-agnostic.

The AWS environment (account/region) where this stack will be deployed.

Set the `region`/`account` fields of `env` to either a concrete value to
select the indicated environment (recommended for production stacks), or to
the values of environment variables
`CDK_DEFAULT_REGION`/`CDK_DEFAULT_ACCOUNT` to let the target environment
depend on the AWS credentials/configuration that the CDK CLI is executed
under (recommended for development stacks).

If the `Stack` is instantiated inside a `Stage`, any undefined
`region`/`account` fields from `env` will default to the same field on the
encompassing `Stage`, if configured there.

If either `region` or `account` are not set nor inherited from `Stage`, the
Stack will be considered "*environment-agnostic*"". Environment-agnostic
stacks can be deployed to any environment but may not be able to take
advantage of all features of the CDK. For example, they will not be able to
use environmental context lookups such as `ec2.Vpc.fromLookup` and will not
automatically translate Service Principals to the right format based on the
environment's AWS partition, and other such enhancements.

---

*Example*

```typescript
// Use a concrete account and region to deploy this stack to:
// `.account` and `.region` will simply return these values.
new Stack(app, 'Stack1', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  },
});

// Use the CLI's current credentials to determine the target environment:
// `.account` and `.region` will reflect the account+region the CLI
// is configured to use (based on the user CLI credentials)
new Stack(app, 'Stack2', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
});

// Define multiple stacks stage associated with an environment
const myStage = new Stage(app, 'MyStage', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  }
});

// both of these stacks will use the stage's account/region:
// `.account` and `.region` will resolve to the concrete values as above
new MyStack(myStage, 'Stack1');
new YourStack(myStage, 'Stack2');

// Define an environment-agnostic stack:
// `.account` and `.region` will resolve to `{ "Ref": "AWS::AccountId" }` and `{ "Ref": "AWS::Region" }` respectively.
// which will only resolve to actual values by CloudFormation during deployment.
new MyStack(app, 'Stack1');
```


##### `permissionsBoundary`<sup>Optional</sup> <a name="permissionsBoundary" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.permissionsBoundary"></a>

```typescript
public readonly permissionsBoundary: PermissionsBoundary;
```

- *Type:* aws-cdk-lib.PermissionsBoundary
- *Default:* no permissions boundary is applied

Options for applying a permissions boundary to all IAM Roles and Users created within this Stage.

---

##### `stackName`<sup>Optional</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string
- *Default:* Derived from construct path.

Name to deploy the stack with.

---

##### `suppressTemplateIndentation`<sup>Optional</sup> <a name="suppressTemplateIndentation" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.suppressTemplateIndentation"></a>

```typescript
public readonly suppressTemplateIndentation: boolean;
```

- *Type:* boolean
- *Default:* the value of `@aws-cdk/core:suppressTemplateIndentation`, or `false` if that is not set.

Enable this flag to suppress indentation in generated CloudFormation templates.

If not specified, the value of the `@aws-cdk/core:suppressTemplateIndentation`
context key will be used. If that is not specified, then the
default value `false` will be used.

---

##### `synthesizer`<sup>Optional</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer
- *Default:* The synthesizer specified on `App`, or `DefaultStackSynthesizer` otherwise.

Synthesis method to use while deploying this stack.

The Stack Synthesizer controls aspects of synthesis and deployment,
like how assets are referenced and what IAM roles to use. For more
information, see the README of the main CDK package.

If not specified, the `defaultStackSynthesizer` from `App` will be used.
If that is not specified, `DefaultStackSynthesizer` is used if
`@aws-cdk/core:newStyleStackSynthesis` is set to `true` or the CDK major
version is v2. In CDK v1 `LegacyStackSynthesizer` is the default if no
other synthesizer is specified.

---

##### `tags`<sup>Optional</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.tags"></a>

```typescript
public readonly tags: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}
- *Default:* {}

Stack tags that will be applied to all the taggable resources and the stack itself.

---

##### `terminationProtection`<sup>Optional</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean
- *Default:* false

Whether to enable termination protection for this stack.

---

##### `applicationName`<sup>Required</sup> <a name="applicationName" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.applicationName"></a>

```typescript
public readonly applicationName: string;
```

- *Type:* string

---

##### `stageName`<sup>Required</sup> <a name="stageName" id="@cdklabs/cdk-cicd-wrapper.EncryptionStackProps.property.stageName"></a>

```typescript
public readonly stageName: string;
```

- *Type:* string

---

### Environment <a name="Environment" id="@cdklabs/cdk-cicd-wrapper.Environment"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.Environment.Initializer"></a>

```typescript
import { Environment } from '@cdklabs/cdk-cicd-wrapper'

const environment: Environment = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Environment.property.account">account</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Environment.property.region">region</a></code> | <code>string</code> | *No description.* |

---

##### `account`<sup>Required</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.Environment.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

---

##### `region`<sup>Required</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.Environment.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

---

### LogRetentionRoleStackProps <a name="LogRetentionRoleStackProps" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.Initializer"></a>

```typescript
import { LogRetentionRoleStackProps } from '@cdklabs/cdk-cicd-wrapper'

const logRetentionRoleStackProps: LogRetentionRoleStackProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.analyticsReporting">analyticsReporting</a></code> | <code>boolean</code> | Include runtime versioning information in this Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.crossRegionReferences">crossRegionReferences</a></code> | <code>boolean</code> | Enable this flag to allow native cross region stack references. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.description">description</a></code> | <code>string</code> | A description of the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.env">env</a></code> | <code>aws-cdk-lib.Environment</code> | The AWS environment (account/region) where this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.permissionsBoundary">permissionsBoundary</a></code> | <code>aws-cdk-lib.PermissionsBoundary</code> | Options for applying a permissions boundary to all IAM Roles and Users created within this Stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.stackName">stackName</a></code> | <code>string</code> | Name to deploy the stack with. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.suppressTemplateIndentation">suppressTemplateIndentation</a></code> | <code>boolean</code> | Enable this flag to suppress indentation in generated CloudFormation templates. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method to use while deploying this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.tags">tags</a></code> | <code>{[ key: string ]: string}</code> | Stack tags that will be applied to all the taggable resources and the stack itself. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether to enable termination protection for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.applicationName">applicationName</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.encryptionKey">encryptionKey</a></code> | <code>aws-cdk-lib.aws_kms.IKey</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.resAccount">resAccount</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.stageName">stageName</a></code> | <code>string</code> | *No description.* |

---

##### `analyticsReporting`<sup>Optional</sup> <a name="analyticsReporting" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.analyticsReporting"></a>

```typescript
public readonly analyticsReporting: boolean;
```

- *Type:* boolean
- *Default:* `analyticsReporting` setting of containing `App`, or value of 'aws:cdk:version-reporting' context key

Include runtime versioning information in this Stack.

---

##### `crossRegionReferences`<sup>Optional</sup> <a name="crossRegionReferences" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.crossRegionReferences"></a>

```typescript
public readonly crossRegionReferences: boolean;
```

- *Type:* boolean
- *Default:* false

Enable this flag to allow native cross region stack references.

Enabling this will create a CloudFormation custom resource
in both the producing stack and consuming stack in order to perform the export/import

This feature is currently experimental

---

##### `description`<sup>Optional</sup> <a name="description" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string
- *Default:* No description.

A description of the stack.

---

##### `env`<sup>Optional</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.env"></a>

```typescript
public readonly env: Environment;
```

- *Type:* aws-cdk-lib.Environment
- *Default:* The environment of the containing `Stage` if available, otherwise create the stack will be environment-agnostic.

The AWS environment (account/region) where this stack will be deployed.

Set the `region`/`account` fields of `env` to either a concrete value to
select the indicated environment (recommended for production stacks), or to
the values of environment variables
`CDK_DEFAULT_REGION`/`CDK_DEFAULT_ACCOUNT` to let the target environment
depend on the AWS credentials/configuration that the CDK CLI is executed
under (recommended for development stacks).

If the `Stack` is instantiated inside a `Stage`, any undefined
`region`/`account` fields from `env` will default to the same field on the
encompassing `Stage`, if configured there.

If either `region` or `account` are not set nor inherited from `Stage`, the
Stack will be considered "*environment-agnostic*"". Environment-agnostic
stacks can be deployed to any environment but may not be able to take
advantage of all features of the CDK. For example, they will not be able to
use environmental context lookups such as `ec2.Vpc.fromLookup` and will not
automatically translate Service Principals to the right format based on the
environment's AWS partition, and other such enhancements.

---

*Example*

```typescript
// Use a concrete account and region to deploy this stack to:
// `.account` and `.region` will simply return these values.
new Stack(app, 'Stack1', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  },
});

// Use the CLI's current credentials to determine the target environment:
// `.account` and `.region` will reflect the account+region the CLI
// is configured to use (based on the user CLI credentials)
new Stack(app, 'Stack2', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
});

// Define multiple stacks stage associated with an environment
const myStage = new Stage(app, 'MyStage', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  }
});

// both of these stacks will use the stage's account/region:
// `.account` and `.region` will resolve to the concrete values as above
new MyStack(myStage, 'Stack1');
new YourStack(myStage, 'Stack2');

// Define an environment-agnostic stack:
// `.account` and `.region` will resolve to `{ "Ref": "AWS::AccountId" }` and `{ "Ref": "AWS::Region" }` respectively.
// which will only resolve to actual values by CloudFormation during deployment.
new MyStack(app, 'Stack1');
```


##### `permissionsBoundary`<sup>Optional</sup> <a name="permissionsBoundary" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.permissionsBoundary"></a>

```typescript
public readonly permissionsBoundary: PermissionsBoundary;
```

- *Type:* aws-cdk-lib.PermissionsBoundary
- *Default:* no permissions boundary is applied

Options for applying a permissions boundary to all IAM Roles and Users created within this Stage.

---

##### `stackName`<sup>Optional</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string
- *Default:* Derived from construct path.

Name to deploy the stack with.

---

##### `suppressTemplateIndentation`<sup>Optional</sup> <a name="suppressTemplateIndentation" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.suppressTemplateIndentation"></a>

```typescript
public readonly suppressTemplateIndentation: boolean;
```

- *Type:* boolean
- *Default:* the value of `@aws-cdk/core:suppressTemplateIndentation`, or `false` if that is not set.

Enable this flag to suppress indentation in generated CloudFormation templates.

If not specified, the value of the `@aws-cdk/core:suppressTemplateIndentation`
context key will be used. If that is not specified, then the
default value `false` will be used.

---

##### `synthesizer`<sup>Optional</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer
- *Default:* The synthesizer specified on `App`, or `DefaultStackSynthesizer` otherwise.

Synthesis method to use while deploying this stack.

The Stack Synthesizer controls aspects of synthesis and deployment,
like how assets are referenced and what IAM roles to use. For more
information, see the README of the main CDK package.

If not specified, the `defaultStackSynthesizer` from `App` will be used.
If that is not specified, `DefaultStackSynthesizer` is used if
`@aws-cdk/core:newStyleStackSynthesis` is set to `true` or the CDK major
version is v2. In CDK v1 `LegacyStackSynthesizer` is the default if no
other synthesizer is specified.

---

##### `tags`<sup>Optional</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.tags"></a>

```typescript
public readonly tags: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}
- *Default:* {}

Stack tags that will be applied to all the taggable resources and the stack itself.

---

##### `terminationProtection`<sup>Optional</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean
- *Default:* false

Whether to enable termination protection for this stack.

---

##### `applicationName`<sup>Required</sup> <a name="applicationName" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.applicationName"></a>

```typescript
public readonly applicationName: string;
```

- *Type:* string

---

##### `encryptionKey`<sup>Required</sup> <a name="encryptionKey" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.encryptionKey"></a>

```typescript
public readonly encryptionKey: IKey;
```

- *Type:* aws-cdk-lib.aws_kms.IKey

---

##### `resAccount`<sup>Required</sup> <a name="resAccount" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.resAccount"></a>

```typescript
public readonly resAccount: string;
```

- *Type:* string

---

##### `stageName`<sup>Required</sup> <a name="stageName" id="@cdklabs/cdk-cicd-wrapper.LogRetentionRoleStackProps.property.stageName"></a>

```typescript
public readonly stageName: string;
```

- *Type:* string

---

### NPMRegistryConfig <a name="NPMRegistryConfig" id="@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig.Initializer"></a>

```typescript
import { NPMRegistryConfig } from '@cdklabs/cdk-cicd-wrapper'

const nPMRegistryConfig: NPMRegistryConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig.property.basicAuthSecretArn">basicAuthSecretArn</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig.property.url">url</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig.property.scope">scope</a></code> | <code>string</code> | *No description.* |

---

##### `basicAuthSecretArn`<sup>Required</sup> <a name="basicAuthSecretArn" id="@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig.property.basicAuthSecretArn"></a>

```typescript
public readonly basicAuthSecretArn: string;
```

- *Type:* string

---

##### `url`<sup>Required</sup> <a name="url" id="@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig.property.url"></a>

```typescript
public readonly url: string;
```

- *Type:* string

---

##### `scope`<sup>Optional</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig.property.scope"></a>

```typescript
public readonly scope: string;
```

- *Type:* string

---

### PipelineProps <a name="PipelineProps" id="@cdklabs/cdk-cicd-wrapper.PipelineProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.PipelineProps.Initializer"></a>

```typescript
import { PipelineProps } from '@cdklabs/cdk-cicd-wrapper'

const pipelineProps: PipelineProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineProps.property.branch">branch</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineProps.property.codeBuildDefaults">codeBuildDefaults</a></code> | <code>aws-cdk-lib.pipelines.CodeBuildOptions</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineProps.property.pipelineCommands">pipelineCommands</a></code> | <code>string[]</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineProps.property.primaryOutputDirectory">primaryOutputDirectory</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineProps.property.repositoryInput">repositoryInput</a></code> | <code>aws-cdk-lib.pipelines.IFileSetProducer</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineProps.property.buildImage">buildImage</a></code> | <code>aws-cdk-lib.aws_codebuild.IBuildImage</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineProps.property.codeGuruScanThreshold">codeGuruScanThreshold</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold">CodeGuruSeverityThreshold</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineProps.property.installCommands">installCommands</a></code> | <code>string[]</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineProps.property.isDockerEnabledForSynth">isDockerEnabledForSynth</a></code> | <code>boolean</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineProps.property.pipelineVariables">pipelineVariables</a></code> | <code>{[ key: string ]: string}</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineProps.property.vpcProps">vpcProps</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.VpcProps">VpcProps</a></code> | *No description.* |

---

##### `branch`<sup>Required</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.PipelineProps.property.branch"></a>

```typescript
public readonly branch: string;
```

- *Type:* string

---

##### `codeBuildDefaults`<sup>Required</sup> <a name="codeBuildDefaults" id="@cdklabs/cdk-cicd-wrapper.PipelineProps.property.codeBuildDefaults"></a>

```typescript
public readonly codeBuildDefaults: CodeBuildOptions;
```

- *Type:* aws-cdk-lib.pipelines.CodeBuildOptions

---

##### `pipelineCommands`<sup>Required</sup> <a name="pipelineCommands" id="@cdklabs/cdk-cicd-wrapper.PipelineProps.property.pipelineCommands"></a>

```typescript
public readonly pipelineCommands: string[];
```

- *Type:* string[]

---

##### `primaryOutputDirectory`<sup>Required</sup> <a name="primaryOutputDirectory" id="@cdklabs/cdk-cicd-wrapper.PipelineProps.property.primaryOutputDirectory"></a>

```typescript
public readonly primaryOutputDirectory: string;
```

- *Type:* string

---

##### `repositoryInput`<sup>Required</sup> <a name="repositoryInput" id="@cdklabs/cdk-cicd-wrapper.PipelineProps.property.repositoryInput"></a>

```typescript
public readonly repositoryInput: IFileSetProducer;
```

- *Type:* aws-cdk-lib.pipelines.IFileSetProducer

---

##### `buildImage`<sup>Optional</sup> <a name="buildImage" id="@cdklabs/cdk-cicd-wrapper.PipelineProps.property.buildImage"></a>

```typescript
public readonly buildImage: IBuildImage;
```

- *Type:* aws-cdk-lib.aws_codebuild.IBuildImage

---

##### `codeGuruScanThreshold`<sup>Optional</sup> <a name="codeGuruScanThreshold" id="@cdklabs/cdk-cicd-wrapper.PipelineProps.property.codeGuruScanThreshold"></a>

```typescript
public readonly codeGuruScanThreshold: CodeGuruSeverityThreshold;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold">CodeGuruSeverityThreshold</a>

---

##### `installCommands`<sup>Optional</sup> <a name="installCommands" id="@cdklabs/cdk-cicd-wrapper.PipelineProps.property.installCommands"></a>

```typescript
public readonly installCommands: string[];
```

- *Type:* string[]

---

##### `isDockerEnabledForSynth`<sup>Optional</sup> <a name="isDockerEnabledForSynth" id="@cdklabs/cdk-cicd-wrapper.PipelineProps.property.isDockerEnabledForSynth"></a>

```typescript
public readonly isDockerEnabledForSynth: boolean;
```

- *Type:* boolean

---

##### `pipelineVariables`<sup>Optional</sup> <a name="pipelineVariables" id="@cdklabs/cdk-cicd-wrapper.PipelineProps.property.pipelineVariables"></a>

```typescript
public readonly pipelineVariables: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}

---

##### `vpcProps`<sup>Optional</sup> <a name="vpcProps" id="@cdklabs/cdk-cicd-wrapper.PipelineProps.property.vpcProps"></a>

```typescript
public readonly vpcProps: VpcProps;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.VpcProps">VpcProps</a>

---

### PRCheckConfig <a name="PRCheckConfig" id="@cdklabs/cdk-cicd-wrapper.PRCheckConfig"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.PRCheckConfig.Initializer"></a>

```typescript
import { PRCheckConfig } from '@cdklabs/cdk-cicd-wrapper'

const pRCheckConfig: PRCheckConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PRCheckConfig.property.buildSpec">buildSpec</a></code> | <code>aws-cdk-lib.aws_codebuild.BuildSpec</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PRCheckConfig.property.codeBuildOptions">codeBuildOptions</a></code> | <code>aws-cdk-lib.pipelines.CodeBuildOptions</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PRCheckConfig.property.codeGuruReviewer">codeGuruReviewer</a></code> | <code>boolean</code> | *No description.* |

---

##### `buildSpec`<sup>Required</sup> <a name="buildSpec" id="@cdklabs/cdk-cicd-wrapper.PRCheckConfig.property.buildSpec"></a>

```typescript
public readonly buildSpec: BuildSpec;
```

- *Type:* aws-cdk-lib.aws_codebuild.BuildSpec

---

##### `codeBuildOptions`<sup>Required</sup> <a name="codeBuildOptions" id="@cdklabs/cdk-cicd-wrapper.PRCheckConfig.property.codeBuildOptions"></a>

```typescript
public readonly codeBuildOptions: CodeBuildOptions;
```

- *Type:* aws-cdk-lib.pipelines.CodeBuildOptions

---

##### `codeGuruReviewer`<sup>Required</sup> <a name="codeGuruReviewer" id="@cdklabs/cdk-cicd-wrapper.PRCheckConfig.property.codeGuruReviewer"></a>

```typescript
public readonly codeGuruReviewer: boolean;
```

- *Type:* boolean

---

### ProxyProps <a name="ProxyProps" id="@cdklabs/cdk-cicd-wrapper.ProxyProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.ProxyProps.Initializer"></a>

```typescript
import { ProxyProps } from '@cdklabs/cdk-cicd-wrapper'

const proxyProps: ProxyProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ProxyProps.property.noProxy">noProxy</a></code> | <code>string[]</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ProxyProps.property.proxySecretArn">proxySecretArn</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ProxyProps.property.proxyTestUrl">proxyTestUrl</a></code> | <code>string</code> | *No description.* |

---

##### `noProxy`<sup>Required</sup> <a name="noProxy" id="@cdklabs/cdk-cicd-wrapper.ProxyProps.property.noProxy"></a>

```typescript
public readonly noProxy: string[];
```

- *Type:* string[]

---

##### `proxySecretArn`<sup>Required</sup> <a name="proxySecretArn" id="@cdklabs/cdk-cicd-wrapper.ProxyProps.property.proxySecretArn"></a>

```typescript
public readonly proxySecretArn: string;
```

- *Type:* string

---

##### `proxyTestUrl`<sup>Required</sup> <a name="proxyTestUrl" id="@cdklabs/cdk-cicd-wrapper.ProxyProps.property.proxyTestUrl"></a>

```typescript
public readonly proxyTestUrl: string;
```

- *Type:* string

---

### RepositoryConfig <a name="RepositoryConfig" id="@cdklabs/cdk-cicd-wrapper.RepositoryConfig"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.RepositoryConfig.Initializer"></a>

```typescript
import { RepositoryConfig } from '@cdklabs/cdk-cicd-wrapper'

const repositoryConfig: RepositoryConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RepositoryConfig.property.branch">branch</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RepositoryConfig.property.name">name</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RepositoryConfig.property.repositoryType">repositoryType</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RepositoryConfig.property.description">description</a></code> | <code>string</code> | *No description.* |

---

##### `branch`<sup>Required</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.RepositoryConfig.property.branch"></a>

```typescript
public readonly branch: string;
```

- *Type:* string

---

##### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.RepositoryConfig.property.name"></a>

```typescript
public readonly name: string;
```

- *Type:* string

---

##### `repositoryType`<sup>Required</sup> <a name="repositoryType" id="@cdklabs/cdk-cicd-wrapper.RepositoryConfig.property.repositoryType"></a>

```typescript
public readonly repositoryType: string;
```

- *Type:* string

---

##### `description`<sup>Optional</sup> <a name="description" id="@cdklabs/cdk-cicd-wrapper.RepositoryConfig.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string

---

### SSMParameterStackProps <a name="SSMParameterStackProps" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.Initializer"></a>

```typescript
import { SSMParameterStackProps } from '@cdklabs/cdk-cicd-wrapper'

const sSMParameterStackProps: SSMParameterStackProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.analyticsReporting">analyticsReporting</a></code> | <code>boolean</code> | Include runtime versioning information in this Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.crossRegionReferences">crossRegionReferences</a></code> | <code>boolean</code> | Enable this flag to allow native cross region stack references. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.description">description</a></code> | <code>string</code> | A description of the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.env">env</a></code> | <code>aws-cdk-lib.Environment</code> | The AWS environment (account/region) where this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.permissionsBoundary">permissionsBoundary</a></code> | <code>aws-cdk-lib.PermissionsBoundary</code> | Options for applying a permissions boundary to all IAM Roles and Users created within this Stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.stackName">stackName</a></code> | <code>string</code> | Name to deploy the stack with. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.suppressTemplateIndentation">suppressTemplateIndentation</a></code> | <code>boolean</code> | Enable this flag to suppress indentation in generated CloudFormation templates. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method to use while deploying this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.tags">tags</a></code> | <code>{[ key: string ]: string}</code> | Stack tags that will be applied to all the taggable resources and the stack itself. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether to enable termination protection for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.applicationQualifier">applicationQualifier</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.parameter">parameter</a></code> | <code>{[ key: string ]: string}</code> | *No description.* |

---

##### `analyticsReporting`<sup>Optional</sup> <a name="analyticsReporting" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.analyticsReporting"></a>

```typescript
public readonly analyticsReporting: boolean;
```

- *Type:* boolean
- *Default:* `analyticsReporting` setting of containing `App`, or value of 'aws:cdk:version-reporting' context key

Include runtime versioning information in this Stack.

---

##### `crossRegionReferences`<sup>Optional</sup> <a name="crossRegionReferences" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.crossRegionReferences"></a>

```typescript
public readonly crossRegionReferences: boolean;
```

- *Type:* boolean
- *Default:* false

Enable this flag to allow native cross region stack references.

Enabling this will create a CloudFormation custom resource
in both the producing stack and consuming stack in order to perform the export/import

This feature is currently experimental

---

##### `description`<sup>Optional</sup> <a name="description" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string
- *Default:* No description.

A description of the stack.

---

##### `env`<sup>Optional</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.env"></a>

```typescript
public readonly env: Environment;
```

- *Type:* aws-cdk-lib.Environment
- *Default:* The environment of the containing `Stage` if available, otherwise create the stack will be environment-agnostic.

The AWS environment (account/region) where this stack will be deployed.

Set the `region`/`account` fields of `env` to either a concrete value to
select the indicated environment (recommended for production stacks), or to
the values of environment variables
`CDK_DEFAULT_REGION`/`CDK_DEFAULT_ACCOUNT` to let the target environment
depend on the AWS credentials/configuration that the CDK CLI is executed
under (recommended for development stacks).

If the `Stack` is instantiated inside a `Stage`, any undefined
`region`/`account` fields from `env` will default to the same field on the
encompassing `Stage`, if configured there.

If either `region` or `account` are not set nor inherited from `Stage`, the
Stack will be considered "*environment-agnostic*"". Environment-agnostic
stacks can be deployed to any environment but may not be able to take
advantage of all features of the CDK. For example, they will not be able to
use environmental context lookups such as `ec2.Vpc.fromLookup` and will not
automatically translate Service Principals to the right format based on the
environment's AWS partition, and other such enhancements.

---

*Example*

```typescript
// Use a concrete account and region to deploy this stack to:
// `.account` and `.region` will simply return these values.
new Stack(app, 'Stack1', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  },
});

// Use the CLI's current credentials to determine the target environment:
// `.account` and `.region` will reflect the account+region the CLI
// is configured to use (based on the user CLI credentials)
new Stack(app, 'Stack2', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
});

// Define multiple stacks stage associated with an environment
const myStage = new Stage(app, 'MyStage', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  }
});

// both of these stacks will use the stage's account/region:
// `.account` and `.region` will resolve to the concrete values as above
new MyStack(myStage, 'Stack1');
new YourStack(myStage, 'Stack2');

// Define an environment-agnostic stack:
// `.account` and `.region` will resolve to `{ "Ref": "AWS::AccountId" }` and `{ "Ref": "AWS::Region" }` respectively.
// which will only resolve to actual values by CloudFormation during deployment.
new MyStack(app, 'Stack1');
```


##### `permissionsBoundary`<sup>Optional</sup> <a name="permissionsBoundary" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.permissionsBoundary"></a>

```typescript
public readonly permissionsBoundary: PermissionsBoundary;
```

- *Type:* aws-cdk-lib.PermissionsBoundary
- *Default:* no permissions boundary is applied

Options for applying a permissions boundary to all IAM Roles and Users created within this Stage.

---

##### `stackName`<sup>Optional</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string
- *Default:* Derived from construct path.

Name to deploy the stack with.

---

##### `suppressTemplateIndentation`<sup>Optional</sup> <a name="suppressTemplateIndentation" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.suppressTemplateIndentation"></a>

```typescript
public readonly suppressTemplateIndentation: boolean;
```

- *Type:* boolean
- *Default:* the value of `@aws-cdk/core:suppressTemplateIndentation`, or `false` if that is not set.

Enable this flag to suppress indentation in generated CloudFormation templates.

If not specified, the value of the `@aws-cdk/core:suppressTemplateIndentation`
context key will be used. If that is not specified, then the
default value `false` will be used.

---

##### `synthesizer`<sup>Optional</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer
- *Default:* The synthesizer specified on `App`, or `DefaultStackSynthesizer` otherwise.

Synthesis method to use while deploying this stack.

The Stack Synthesizer controls aspects of synthesis and deployment,
like how assets are referenced and what IAM roles to use. For more
information, see the README of the main CDK package.

If not specified, the `defaultStackSynthesizer` from `App` will be used.
If that is not specified, `DefaultStackSynthesizer` is used if
`@aws-cdk/core:newStyleStackSynthesis` is set to `true` or the CDK major
version is v2. In CDK v1 `LegacyStackSynthesizer` is the default if no
other synthesizer is specified.

---

##### `tags`<sup>Optional</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.tags"></a>

```typescript
public readonly tags: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}
- *Default:* {}

Stack tags that will be applied to all the taggable resources and the stack itself.

---

##### `terminationProtection`<sup>Optional</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean
- *Default:* false

Whether to enable termination protection for this stack.

---

##### `applicationQualifier`<sup>Required</sup> <a name="applicationQualifier" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.applicationQualifier"></a>

```typescript
public readonly applicationQualifier: string;
```

- *Type:* string

---

##### `parameter`<sup>Optional</sup> <a name="parameter" id="@cdklabs/cdk-cicd-wrapper.SSMParameterStackProps.property.parameter"></a>

```typescript
public readonly parameter: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}

---

### VpcProps <a name="VpcProps" id="@cdklabs/cdk-cicd-wrapper.VpcProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.VpcProps.Initializer"></a>

```typescript
import { VpcProps } from '@cdklabs/cdk-cicd-wrapper'

const vpcProps: VpcProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VpcProps.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VpcProps.property.proxy">proxy</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ProxyProps">ProxyProps</a></code> | *No description.* |

---

##### `vpc`<sup>Required</sup> <a name="vpc" id="@cdklabs/cdk-cicd-wrapper.VpcProps.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc

---

##### `proxy`<sup>Optional</sup> <a name="proxy" id="@cdklabs/cdk-cicd-wrapper.VpcProps.property.proxy"></a>

```typescript
public readonly proxy: ProxyProps;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ProxyProps">ProxyProps</a>

---

### VPCStackProps <a name="VPCStackProps" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps"></a>

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.Initializer"></a>

```typescript
import { VPCStackProps } from '@cdklabs/cdk-cicd-wrapper'

const vPCStackProps: VPCStackProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.analyticsReporting">analyticsReporting</a></code> | <code>boolean</code> | Include runtime versioning information in this Stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.crossRegionReferences">crossRegionReferences</a></code> | <code>boolean</code> | Enable this flag to allow native cross region stack references. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.description">description</a></code> | <code>string</code> | A description of the stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.env">env</a></code> | <code>aws-cdk-lib.Environment</code> | The AWS environment (account/region) where this stack will be deployed. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.permissionsBoundary">permissionsBoundary</a></code> | <code>aws-cdk-lib.PermissionsBoundary</code> | Options for applying a permissions boundary to all IAM Roles and Users created within this Stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.stackName">stackName</a></code> | <code>string</code> | Name to deploy the stack with. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.suppressTemplateIndentation">suppressTemplateIndentation</a></code> | <code>boolean</code> | Enable this flag to suppress indentation in generated CloudFormation templates. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.synthesizer">synthesizer</a></code> | <code>aws-cdk-lib.IStackSynthesizer</code> | Synthesis method to use while deploying this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.tags">tags</a></code> | <code>{[ key: string ]: string}</code> | Stack tags that will be applied to all the taggable resources and the stack itself. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.terminationProtection">terminationProtection</a></code> | <code>boolean</code> | Whether to enable termination protection for this stack. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.flowLogsBucketName">flowLogsBucketName</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.useProxy">useProxy</a></code> | <code>boolean</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.vpcConfig">vpcConfig</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfig">IVpcConfig</a></code> | *No description.* |

---

##### `analyticsReporting`<sup>Optional</sup> <a name="analyticsReporting" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.analyticsReporting"></a>

```typescript
public readonly analyticsReporting: boolean;
```

- *Type:* boolean
- *Default:* `analyticsReporting` setting of containing `App`, or value of 'aws:cdk:version-reporting' context key

Include runtime versioning information in this Stack.

---

##### `crossRegionReferences`<sup>Optional</sup> <a name="crossRegionReferences" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.crossRegionReferences"></a>

```typescript
public readonly crossRegionReferences: boolean;
```

- *Type:* boolean
- *Default:* false

Enable this flag to allow native cross region stack references.

Enabling this will create a CloudFormation custom resource
in both the producing stack and consuming stack in order to perform the export/import

This feature is currently experimental

---

##### `description`<sup>Optional</sup> <a name="description" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string
- *Default:* No description.

A description of the stack.

---

##### `env`<sup>Optional</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.env"></a>

```typescript
public readonly env: Environment;
```

- *Type:* aws-cdk-lib.Environment
- *Default:* The environment of the containing `Stage` if available, otherwise create the stack will be environment-agnostic.

The AWS environment (account/region) where this stack will be deployed.

Set the `region`/`account` fields of `env` to either a concrete value to
select the indicated environment (recommended for production stacks), or to
the values of environment variables
`CDK_DEFAULT_REGION`/`CDK_DEFAULT_ACCOUNT` to let the target environment
depend on the AWS credentials/configuration that the CDK CLI is executed
under (recommended for development stacks).

If the `Stack` is instantiated inside a `Stage`, any undefined
`region`/`account` fields from `env` will default to the same field on the
encompassing `Stage`, if configured there.

If either `region` or `account` are not set nor inherited from `Stage`, the
Stack will be considered "*environment-agnostic*"". Environment-agnostic
stacks can be deployed to any environment but may not be able to take
advantage of all features of the CDK. For example, they will not be able to
use environmental context lookups such as `ec2.Vpc.fromLookup` and will not
automatically translate Service Principals to the right format based on the
environment's AWS partition, and other such enhancements.

---

*Example*

```typescript
// Use a concrete account and region to deploy this stack to:
// `.account` and `.region` will simply return these values.
new Stack(app, 'Stack1', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  },
});

// Use the CLI's current credentials to determine the target environment:
// `.account` and `.region` will reflect the account+region the CLI
// is configured to use (based on the user CLI credentials)
new Stack(app, 'Stack2', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
});

// Define multiple stacks stage associated with an environment
const myStage = new Stage(app, 'MyStage', {
  env: {
    account: '123456789012',
    region: 'us-east-1'
  }
});

// both of these stacks will use the stage's account/region:
// `.account` and `.region` will resolve to the concrete values as above
new MyStack(myStage, 'Stack1');
new YourStack(myStage, 'Stack2');

// Define an environment-agnostic stack:
// `.account` and `.region` will resolve to `{ "Ref": "AWS::AccountId" }` and `{ "Ref": "AWS::Region" }` respectively.
// which will only resolve to actual values by CloudFormation during deployment.
new MyStack(app, 'Stack1');
```


##### `permissionsBoundary`<sup>Optional</sup> <a name="permissionsBoundary" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.permissionsBoundary"></a>

```typescript
public readonly permissionsBoundary: PermissionsBoundary;
```

- *Type:* aws-cdk-lib.PermissionsBoundary
- *Default:* no permissions boundary is applied

Options for applying a permissions boundary to all IAM Roles and Users created within this Stage.

---

##### `stackName`<sup>Optional</sup> <a name="stackName" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.stackName"></a>

```typescript
public readonly stackName: string;
```

- *Type:* string
- *Default:* Derived from construct path.

Name to deploy the stack with.

---

##### `suppressTemplateIndentation`<sup>Optional</sup> <a name="suppressTemplateIndentation" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.suppressTemplateIndentation"></a>

```typescript
public readonly suppressTemplateIndentation: boolean;
```

- *Type:* boolean
- *Default:* the value of `@aws-cdk/core:suppressTemplateIndentation`, or `false` if that is not set.

Enable this flag to suppress indentation in generated CloudFormation templates.

If not specified, the value of the `@aws-cdk/core:suppressTemplateIndentation`
context key will be used. If that is not specified, then the
default value `false` will be used.

---

##### `synthesizer`<sup>Optional</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.synthesizer"></a>

```typescript
public readonly synthesizer: IStackSynthesizer;
```

- *Type:* aws-cdk-lib.IStackSynthesizer
- *Default:* The synthesizer specified on `App`, or `DefaultStackSynthesizer` otherwise.

Synthesis method to use while deploying this stack.

The Stack Synthesizer controls aspects of synthesis and deployment,
like how assets are referenced and what IAM roles to use. For more
information, see the README of the main CDK package.

If not specified, the `defaultStackSynthesizer` from `App` will be used.
If that is not specified, `DefaultStackSynthesizer` is used if
`@aws-cdk/core:newStyleStackSynthesis` is set to `true` or the CDK major
version is v2. In CDK v1 `LegacyStackSynthesizer` is the default if no
other synthesizer is specified.

---

##### `tags`<sup>Optional</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.tags"></a>

```typescript
public readonly tags: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}
- *Default:* {}

Stack tags that will be applied to all the taggable resources and the stack itself.

---

##### `terminationProtection`<sup>Optional</sup> <a name="terminationProtection" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.terminationProtection"></a>

```typescript
public readonly terminationProtection: boolean;
```

- *Type:* boolean
- *Default:* false

Whether to enable termination protection for this stack.

---

##### `flowLogsBucketName`<sup>Required</sup> <a name="flowLogsBucketName" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.flowLogsBucketName"></a>

```typescript
public readonly flowLogsBucketName: string;
```

- *Type:* string

---

##### `useProxy`<sup>Required</sup> <a name="useProxy" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.useProxy"></a>

```typescript
public readonly useProxy: boolean;
```

- *Type:* boolean

---

##### `vpcConfig`<sup>Required</sup> <a name="vpcConfig" id="@cdklabs/cdk-cicd-wrapper.VPCStackProps.property.vpcConfig"></a>

```typescript
public readonly vpcConfig: IVpcConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfig">IVpcConfig</a>

---

## Classes <a name="Classes" id="Classes"></a>

### BasicRepositoryProvider <a name="BasicRepositoryProvider" id="@cdklabs/cdk-cicd-wrapper.BasicRepositoryProvider"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.BasicRepositoryProvider.Initializer"></a>

```typescript
import { BasicRepositoryProvider } from '@cdklabs/cdk-cicd-wrapper'

new BasicRepositoryProvider(config?: BaseRepositoryProviderProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BasicRepositoryProvider.Initializer.parameter.config">config</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps">BaseRepositoryProviderProps</a></code> | *No description.* |

---

##### `config`<sup>Optional</sup> <a name="config" id="@cdklabs/cdk-cicd-wrapper.BasicRepositoryProvider.Initializer.parameter.config"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps">BaseRepositoryProviderProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BasicRepositoryProvider.provide">provide</a></code> | *No description.* |

---

##### `provide` <a name="provide" id="@cdklabs/cdk-cicd-wrapper.BasicRepositoryProvider.provide"></a>

```typescript
public provide(context: ResourceContext): any
```

###### `context`<sup>Required</sup> <a name="context" id="@cdklabs/cdk-cicd-wrapper.BasicRepositoryProvider.provide.parameter.context"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext">ResourceContext</a>

---


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BasicRepositoryProvider.property.config">config</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps">BaseRepositoryProviderProps</a></code> | *No description.* |

---

##### `config`<sup>Required</sup> <a name="config" id="@cdklabs/cdk-cicd-wrapper.BasicRepositoryProvider.property.config"></a>

```typescript
public readonly config: BaseRepositoryProviderProps;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.BaseRepositoryProviderProps">BaseRepositoryProviderProps</a>

---


### ComplianceBucketConfigProvider <a name="ComplianceBucketConfigProvider" id="@cdklabs/cdk-cicd-wrapper.ComplianceBucketConfigProvider"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>

Compliance bucket provider which uses existing previously created buckets.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.ComplianceBucketConfigProvider.Initializer"></a>

```typescript
import { ComplianceBucketConfigProvider } from '@cdklabs/cdk-cicd-wrapper'

new ComplianceBucketConfigProvider()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceBucketConfigProvider.provide">provide</a></code> | *No description.* |

---

##### `provide` <a name="provide" id="@cdklabs/cdk-cicd-wrapper.ComplianceBucketConfigProvider.provide"></a>

```typescript
public provide(context: ResourceContext): any
```

###### `context`<sup>Required</sup> <a name="context" id="@cdklabs/cdk-cicd-wrapper.ComplianceBucketConfigProvider.provide.parameter.context"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext">ResourceContext</a>

---


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ComplianceBucketConfigProvider.property.scope">scope</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.Scope">Scope</a></code> | *No description.* |

---

##### `scope`<sup>Optional</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.ComplianceBucketConfigProvider.property.scope"></a>

```typescript
public readonly scope: Scope;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.Scope">Scope</a>

---


### EncryptionProvider <a name="EncryptionProvider" id="@cdklabs/cdk-cicd-wrapper.EncryptionProvider"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>

Encryption key provider that creates dedicated encryption stacks in each stages.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.EncryptionProvider.Initializer"></a>

```typescript
import { EncryptionProvider } from '@cdklabs/cdk-cicd-wrapper'

new EncryptionProvider()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionProvider.provide">provide</a></code> | *No description.* |

---

##### `provide` <a name="provide" id="@cdklabs/cdk-cicd-wrapper.EncryptionProvider.provide"></a>

```typescript
public provide(context: ResourceContext): any
```

###### `context`<sup>Required</sup> <a name="context" id="@cdklabs/cdk-cicd-wrapper.EncryptionProvider.provide.parameter.context"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext">ResourceContext</a>

---


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptionProvider.property.scope">scope</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.Scope">Scope</a></code> | *No description.* |

---

##### `scope`<sup>Optional</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.EncryptionProvider.property.scope"></a>

```typescript
public readonly scope: Scope;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.Scope">Scope</a>

---


### HttpProxyProvider <a name="HttpProxyProvider" id="@cdklabs/cdk-cicd-wrapper.HttpProxyProvider"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>

Provides HTTPProxy settings for the pipeline.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.HttpProxyProvider.Initializer"></a>

```typescript
import { HttpProxyProvider } from '@cdklabs/cdk-cicd-wrapper'

new HttpProxyProvider(proxy?: IProxyConfig)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.HttpProxyProvider.Initializer.parameter.proxy">proxy</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IProxyConfig">IProxyConfig</a></code> | *No description.* |

---

##### `proxy`<sup>Optional</sup> <a name="proxy" id="@cdklabs/cdk-cicd-wrapper.HttpProxyProvider.Initializer.parameter.proxy"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IProxyConfig">IProxyConfig</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.HttpProxyProvider.provide">provide</a></code> | *No description.* |

---

##### `provide` <a name="provide" id="@cdklabs/cdk-cicd-wrapper.HttpProxyProvider.provide"></a>

```typescript
public provide(context: ResourceContext): any
```

###### `context`<sup>Required</sup> <a name="context" id="@cdklabs/cdk-cicd-wrapper.HttpProxyProvider.provide.parameter.context"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext">ResourceContext</a>

---


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.HttpProxyProvider.property.proxy">proxy</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IProxyConfig">IProxyConfig</a></code> | *No description.* |

---

##### `proxy`<sup>Required</sup> <a name="proxy" id="@cdklabs/cdk-cicd-wrapper.HttpProxyProvider.property.proxy"></a>

```typescript
public readonly proxy: IProxyConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IProxyConfig">IProxyConfig</a>

---


### NPMPhaseCommand <a name="NPMPhaseCommand" id="@cdklabs/cdk-cicd-wrapper.NPMPhaseCommand"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>

Phase command that invokes NPM scripts from project package.json.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.NPMPhaseCommand.Initializer"></a>

```typescript
import { NPMPhaseCommand } from '@cdklabs/cdk-cicd-wrapper'

new NPMPhaseCommand(script: string)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.NPMPhaseCommand.Initializer.parameter.script">script</a></code> | <code>string</code> | *No description.* |

---

##### `script`<sup>Required</sup> <a name="script" id="@cdklabs/cdk-cicd-wrapper.NPMPhaseCommand.Initializer.parameter.script"></a>

- *Type:* string

---



#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.NPMPhaseCommand.property.command">command</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.NPMPhaseCommand.property.script">script</a></code> | <code>string</code> | *No description.* |

---

##### `command`<sup>Required</sup> <a name="command" id="@cdklabs/cdk-cicd-wrapper.NPMPhaseCommand.property.command"></a>

```typescript
public readonly command: string;
```

- *Type:* string

---

##### `script`<sup>Required</sup> <a name="script" id="@cdklabs/cdk-cicd-wrapper.NPMPhaseCommand.property.script"></a>

```typescript
public readonly script: string;
```

- *Type:* string

---


### ParameterProvider <a name="ParameterProvider" id="@cdklabs/cdk-cicd-wrapper.ParameterProvider"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>

Resource provider that creates Parameters in SSM.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.ParameterProvider.Initializer"></a>

```typescript
import { ParameterProvider } from '@cdklabs/cdk-cicd-wrapper'

new ParameterProvider()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ParameterProvider.provide">provide</a></code> | *No description.* |

---

##### `provide` <a name="provide" id="@cdklabs/cdk-cicd-wrapper.ParameterProvider.provide"></a>

```typescript
public provide(context: ResourceContext): any
```

###### `context`<sup>Required</sup> <a name="context" id="@cdklabs/cdk-cicd-wrapper.ParameterProvider.provide.parameter.context"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext">ResourceContext</a>

---




### PhaseCommandProvider <a name="PhaseCommandProvider" id="@cdklabs/cdk-cicd-wrapper.PhaseCommandProvider"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>

Provides the phase commands.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.PhaseCommandProvider.Initializer"></a>

```typescript
import { PhaseCommandProvider } from '@cdklabs/cdk-cicd-wrapper'

new PhaseCommandProvider()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PhaseCommandProvider.provide">provide</a></code> | *No description.* |

---

##### `provide` <a name="provide" id="@cdklabs/cdk-cicd-wrapper.PhaseCommandProvider.provide"></a>

```typescript
public provide(context: ResourceContext): any
```

###### `context`<sup>Required</sup> <a name="context" id="@cdklabs/cdk-cicd-wrapper.PhaseCommandProvider.provide.parameter.context"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext">ResourceContext</a>

---


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PhaseCommandProvider.property.scope">scope</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.Scope">Scope</a></code> | *No description.* |

---

##### `scope`<sup>Optional</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.PhaseCommandProvider.property.scope"></a>

```typescript
public readonly scope: Scope;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.Scope">Scope</a>

---


### PostDeployBuildStep <a name="PostDeployBuildStep" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.Initializer"></a>

```typescript
import { PostDeployBuildStep } from '@cdklabs/cdk-cicd-wrapper'

new PostDeployBuildStep(stage: string, props: CodeBuildStepProps, applicationName: string, logRetentionInDays: string, logRetentionRoleArn: string)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.Initializer.parameter.stage">stage</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.Initializer.parameter.props">props</a></code> | <code>aws-cdk-lib.pipelines.CodeBuildStepProps</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.Initializer.parameter.applicationName">applicationName</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.Initializer.parameter.logRetentionInDays">logRetentionInDays</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.Initializer.parameter.logRetentionRoleArn">logRetentionRoleArn</a></code> | <code>string</code> | *No description.* |

---

##### `stage`<sup>Required</sup> <a name="stage" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.Initializer.parameter.stage"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.Initializer.parameter.props"></a>

- *Type:* aws-cdk-lib.pipelines.CodeBuildStepProps

---

##### `applicationName`<sup>Required</sup> <a name="applicationName" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.Initializer.parameter.applicationName"></a>

- *Type:* string

---

##### `logRetentionInDays`<sup>Required</sup> <a name="logRetentionInDays" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.Initializer.parameter.logRetentionInDays"></a>

- *Type:* string

---

##### `logRetentionRoleArn`<sup>Required</sup> <a name="logRetentionRoleArn" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.Initializer.parameter.logRetentionRoleArn"></a>

- *Type:* string

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.addStepDependency">addStepDependency</a></code> | Add a dependency on another step. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.toString">toString</a></code> | Return a string representation of this Step. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.addOutputDirectory">addOutputDirectory</a></code> | Add an additional output FileSet based on a directory. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.primaryOutputDirectory">primaryOutputDirectory</a></code> | Configure the given output directory as primary output. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.exportedVariable">exportedVariable</a></code> | Reference a CodePipeline variable defined by the CodeBuildStep. |

---

##### `addStepDependency` <a name="addStepDependency" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.addStepDependency"></a>

```typescript
public addStepDependency(step: Step): void
```

Add a dependency on another step.

###### `step`<sup>Required</sup> <a name="step" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.addStepDependency.parameter.step"></a>

- *Type:* aws-cdk-lib.pipelines.Step

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.toString"></a>

```typescript
public toString(): string
```

Return a string representation of this Step.

##### `addOutputDirectory` <a name="addOutputDirectory" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.addOutputDirectory"></a>

```typescript
public addOutputDirectory(directory: string): FileSet
```

Add an additional output FileSet based on a directory.

After running the script, the contents of the given directory
will be exported as a `FileSet`. Use the `FileSet` as the
input to another step.

Multiple calls with the exact same directory name string (not normalized)
will return the same FileSet.

###### `directory`<sup>Required</sup> <a name="directory" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.addOutputDirectory.parameter.directory"></a>

- *Type:* string

---

##### `primaryOutputDirectory` <a name="primaryOutputDirectory" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.primaryOutputDirectory"></a>

```typescript
public primaryOutputDirectory(directory: string): FileSet
```

Configure the given output directory as primary output.

If no primary output has been configured yet, this directory
will become the primary output of this ShellStep, otherwise this
method will throw if the given directory is different than the
currently configured primary output directory.

###### `directory`<sup>Required</sup> <a name="directory" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.primaryOutputDirectory.parameter.directory"></a>

- *Type:* string

---

##### `exportedVariable` <a name="exportedVariable" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.exportedVariable"></a>

```typescript
public exportedVariable(variableName: string): string
```

Reference a CodePipeline variable defined by the CodeBuildStep.

The variable must be set in the shell of the CodeBuild step when
it finishes its `post_build` phase.

*Example*

```typescript
// Access the output of one CodeBuildStep in another CodeBuildStep
declare const pipeline: pipelines.CodePipeline;

const step1 = new pipelines.CodeBuildStep('Step1', {
  commands: ['export MY_VAR=hello'],
});

const step2 = new pipelines.CodeBuildStep('Step2', {
  env: {
    IMPORTED_VAR: step1.exportedVariable('MY_VAR'),
  },
  commands: ['echo $IMPORTED_VAR'],
});
```


###### `variableName`<sup>Required</sup> <a name="variableName" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.exportedVariable.parameter.variableName"></a>

- *Type:* string

the name of the variable for reference.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.sequence">sequence</a></code> | Define a sequence of steps to be executed in order. |

---

##### `sequence` <a name="sequence" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.sequence"></a>

```typescript
import { PostDeployBuildStep } from '@cdklabs/cdk-cicd-wrapper'

PostDeployBuildStep.sequence(steps: Step[])
```

Define a sequence of steps to be executed in order.

If you need more fine-grained step ordering, use the `addStepDependency()`
API. For example, if you want `secondStep` to occur after `firstStep`, call
`secondStep.addStepDependency(firstStep)`.

###### `steps`<sup>Required</sup> <a name="steps" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.sequence.parameter.steps"></a>

- *Type:* aws-cdk-lib.pipelines.Step[]

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.consumedStackOutputs">consumedStackOutputs</a></code> | <code>aws-cdk-lib.pipelines.StackOutputReference[]</code> | StackOutputReferences this step consumes. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.dependencies">dependencies</a></code> | <code>aws-cdk-lib.pipelines.Step[]</code> | Return the steps this step depends on, based on the FileSets it requires. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.dependencyFileSets">dependencyFileSets</a></code> | <code>aws-cdk-lib.pipelines.FileSet[]</code> | The list of FileSets consumed by this Step. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.id">id</a></code> | <code>string</code> | Identifier for this step. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.isSource">isSource</a></code> | <code>boolean</code> | Whether or not this is a Source step. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.primaryOutput">primaryOutput</a></code> | <code>aws-cdk-lib.pipelines.FileSet</code> | The primary FileSet produced by this Step. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.commands">commands</a></code> | <code>string[]</code> | Commands to run. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.env">env</a></code> | <code>{[ key: string ]: string}</code> | Environment variables to set. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.envFromCfnOutputs">envFromCfnOutputs</a></code> | <code>{[ key: string ]: aws-cdk-lib.pipelines.StackOutputReference}</code> | Set environment variables based on Stack Outputs. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.inputs">inputs</a></code> | <code>aws-cdk-lib.pipelines.FileSetLocation[]</code> | Input FileSets. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.installCommands">installCommands</a></code> | <code>string[]</code> | Installation commands to run before the regular commands. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.outputs">outputs</a></code> | <code>aws-cdk-lib.pipelines.FileSetLocation[]</code> | Output FileSets. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | The CodeBuild Project's principal. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.project">project</a></code> | <code>aws-cdk-lib.aws_codebuild.IProject</code> | CodeBuild Project generated for the pipeline. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.actionRole">actionRole</a></code> | <code>aws-cdk-lib.aws_iam.IRole</code> | Custom execution role to be used for the Code Build Action. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.buildEnvironment">buildEnvironment</a></code> | <code>aws-cdk-lib.aws_codebuild.BuildEnvironment</code> | Build environment. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.cache">cache</a></code> | <code>aws-cdk-lib.aws_codebuild.Cache</code> | Caching strategy to use. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.fileSystemLocations">fileSystemLocations</a></code> | <code>aws-cdk-lib.aws_codebuild.IFileSystemLocation[]</code> | ProjectFileSystemLocation objects for CodeBuild build projects. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.logging">logging</a></code> | <code>aws-cdk-lib.aws_codebuild.LoggingOptions</code> | Information about logs for CodeBuild projects. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.partialBuildSpec">partialBuildSpec</a></code> | <code>aws-cdk-lib.aws_codebuild.BuildSpec</code> | Additional configuration that can only be configured via BuildSpec. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.projectName">projectName</a></code> | <code>string</code> | Name for the generated CodeBuild project. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.role">role</a></code> | <code>aws-cdk-lib.aws_iam.IRole</code> | Custom execution role to be used for the CodeBuild project. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.rolePolicyStatements">rolePolicyStatements</a></code> | <code>aws-cdk-lib.aws_iam.PolicyStatement[]</code> | Policy statements to add to role used during the synth. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Which security group to associate with the script's project network interfaces. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Which subnets to use. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.timeout">timeout</a></code> | <code>aws-cdk-lib.Duration</code> | The number of minutes after which AWS CodeBuild stops the build if it's not complete. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | The VPC where to execute the SimpleSynth. |

---

##### `consumedStackOutputs`<sup>Required</sup> <a name="consumedStackOutputs" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.consumedStackOutputs"></a>

```typescript
public readonly consumedStackOutputs: StackOutputReference[];
```

- *Type:* aws-cdk-lib.pipelines.StackOutputReference[]

StackOutputReferences this step consumes.

---

##### `dependencies`<sup>Required</sup> <a name="dependencies" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.dependencies"></a>

```typescript
public readonly dependencies: Step[];
```

- *Type:* aws-cdk-lib.pipelines.Step[]

Return the steps this step depends on, based on the FileSets it requires.

---

##### `dependencyFileSets`<sup>Required</sup> <a name="dependencyFileSets" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.dependencyFileSets"></a>

```typescript
public readonly dependencyFileSets: FileSet[];
```

- *Type:* aws-cdk-lib.pipelines.FileSet[]

The list of FileSets consumed by this Step.

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.id"></a>

```typescript
public readonly id: string;
```

- *Type:* string

Identifier for this step.

---

##### `isSource`<sup>Required</sup> <a name="isSource" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.isSource"></a>

```typescript
public readonly isSource: boolean;
```

- *Type:* boolean

Whether or not this is a Source step.

What it means to be a Source step depends on the engine.

---

##### `primaryOutput`<sup>Optional</sup> <a name="primaryOutput" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.primaryOutput"></a>

```typescript
public readonly primaryOutput: FileSet;
```

- *Type:* aws-cdk-lib.pipelines.FileSet

The primary FileSet produced by this Step.

Not all steps produce an output FileSet--if they do
you can substitute the `Step` object for the `FileSet` object.

---

##### `commands`<sup>Required</sup> <a name="commands" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.commands"></a>

```typescript
public readonly commands: string[];
```

- *Type:* string[]

Commands to run.

---

##### `env`<sup>Required</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.env"></a>

```typescript
public readonly env: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}
- *Default:* No environment variables

Environment variables to set.

---

##### `envFromCfnOutputs`<sup>Required</sup> <a name="envFromCfnOutputs" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.envFromCfnOutputs"></a>

```typescript
public readonly envFromCfnOutputs: {[ key: string ]: StackOutputReference};
```

- *Type:* {[ key: string ]: aws-cdk-lib.pipelines.StackOutputReference}
- *Default:* No environment variables created from stack outputs

Set environment variables based on Stack Outputs.

---

##### `inputs`<sup>Required</sup> <a name="inputs" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.inputs"></a>

```typescript
public readonly inputs: FileSetLocation[];
```

- *Type:* aws-cdk-lib.pipelines.FileSetLocation[]

Input FileSets.

A list of `(FileSet, directory)` pairs, which are a copy of the
input properties. This list should not be modified directly.

---

##### `installCommands`<sup>Required</sup> <a name="installCommands" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.installCommands"></a>

```typescript
public readonly installCommands: string[];
```

- *Type:* string[]
- *Default:* No installation commands

Installation commands to run before the regular commands.

For deployment engines that support it, install commands will be classified
differently in the job history from the regular `commands`.

---

##### `outputs`<sup>Required</sup> <a name="outputs" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.outputs"></a>

```typescript
public readonly outputs: FileSetLocation[];
```

- *Type:* aws-cdk-lib.pipelines.FileSetLocation[]

Output FileSets.

A list of `(FileSet, directory)` pairs, which are a copy of the
input properties. This list should not be modified directly.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

The CodeBuild Project's principal.

---

##### `project`<sup>Required</sup> <a name="project" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.project"></a>

```typescript
public readonly project: IProject;
```

- *Type:* aws-cdk-lib.aws_codebuild.IProject

CodeBuild Project generated for the pipeline.

Will only be available after the pipeline has been built.

---

##### `actionRole`<sup>Optional</sup> <a name="actionRole" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.actionRole"></a>

```typescript
public readonly actionRole: IRole;
```

- *Type:* aws-cdk-lib.aws_iam.IRole
- *Default:* A role is automatically created

Custom execution role to be used for the Code Build Action.

---

##### `buildEnvironment`<sup>Optional</sup> <a name="buildEnvironment" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.buildEnvironment"></a>

```typescript
public readonly buildEnvironment: BuildEnvironment;
```

- *Type:* aws-cdk-lib.aws_codebuild.BuildEnvironment
- *Default:* No value specified at construction time, use defaults

Build environment.

---

##### `cache`<sup>Optional</sup> <a name="cache" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.cache"></a>

```typescript
public readonly cache: Cache;
```

- *Type:* aws-cdk-lib.aws_codebuild.Cache
- *Default:* No cache

Caching strategy to use.

---

##### `fileSystemLocations`<sup>Optional</sup> <a name="fileSystemLocations" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.fileSystemLocations"></a>

```typescript
public readonly fileSystemLocations: IFileSystemLocation[];
```

- *Type:* aws-cdk-lib.aws_codebuild.IFileSystemLocation[]
- *Default:* no file system locations

ProjectFileSystemLocation objects for CodeBuild build projects.

A ProjectFileSystemLocation object specifies the identifier, location, mountOptions, mountPoint,
and type of a file system created using Amazon Elastic File System.

---

##### `logging`<sup>Optional</sup> <a name="logging" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.logging"></a>

```typescript
public readonly logging: LoggingOptions;
```

- *Type:* aws-cdk-lib.aws_codebuild.LoggingOptions
- *Default:* no log configuration is set

Information about logs for CodeBuild projects.

A CodeBuilde project can create logs in Amazon CloudWatch Logs, an S3 bucket, or both.

---

##### `partialBuildSpec`<sup>Optional</sup> <a name="partialBuildSpec" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.partialBuildSpec"></a>

```typescript
public readonly partialBuildSpec: BuildSpec;
```

- *Type:* aws-cdk-lib.aws_codebuild.BuildSpec
- *Default:* Contains the exported variables

Additional configuration that can only be configured via BuildSpec.

Contains exported variables

---

##### `projectName`<sup>Optional</sup> <a name="projectName" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.projectName"></a>

```typescript
public readonly projectName: string;
```

- *Type:* string
- *Default:* No value specified at construction time, use defaults

Name for the generated CodeBuild project.

---

##### `role`<sup>Optional</sup> <a name="role" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.role"></a>

```typescript
public readonly role: IRole;
```

- *Type:* aws-cdk-lib.aws_iam.IRole
- *Default:* No value specified at construction time, use defaults

Custom execution role to be used for the CodeBuild project.

---

##### `rolePolicyStatements`<sup>Optional</sup> <a name="rolePolicyStatements" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.rolePolicyStatements"></a>

```typescript
public readonly rolePolicyStatements: PolicyStatement[];
```

- *Type:* aws-cdk-lib.aws_iam.PolicyStatement[]
- *Default:* No value specified at construction time, use defaults

Policy statements to add to role used during the synth.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* No value specified at construction time, use defaults

Which security group to associate with the script's project network interfaces.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* No value specified at construction time, use defaults

Which subnets to use.

---

##### `timeout`<sup>Optional</sup> <a name="timeout" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.timeout"></a>

```typescript
public readonly timeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.hours(1)

The number of minutes after which AWS CodeBuild stops the build if it's not complete.

For valid values, see the timeoutInMinutes field in the AWS
CodeBuild User Guide.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cdklabs/cdk-cicd-wrapper.PostDeployBuildStep.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* No value specified at construction time, use defaults

The VPC where to execute the SimpleSynth.

---


### PreDeployBuildStep <a name="PreDeployBuildStep" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.Initializer"></a>

```typescript
import { PreDeployBuildStep } from '@cdklabs/cdk-cicd-wrapper'

new PreDeployBuildStep(stage: string, props: CodeBuildStepProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.Initializer.parameter.stage">stage</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.Initializer.parameter.props">props</a></code> | <code>aws-cdk-lib.pipelines.CodeBuildStepProps</code> | *No description.* |

---

##### `stage`<sup>Required</sup> <a name="stage" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.Initializer.parameter.stage"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.Initializer.parameter.props"></a>

- *Type:* aws-cdk-lib.pipelines.CodeBuildStepProps

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.addStepDependency">addStepDependency</a></code> | Add a dependency on another step. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.toString">toString</a></code> | Return a string representation of this Step. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.addOutputDirectory">addOutputDirectory</a></code> | Add an additional output FileSet based on a directory. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.primaryOutputDirectory">primaryOutputDirectory</a></code> | Configure the given output directory as primary output. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.exportedVariable">exportedVariable</a></code> | Reference a CodePipeline variable defined by the CodeBuildStep. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.appendManualApprovalStep">appendManualApprovalStep</a></code> | *No description.* |

---

##### `addStepDependency` <a name="addStepDependency" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.addStepDependency"></a>

```typescript
public addStepDependency(step: Step): void
```

Add a dependency on another step.

###### `step`<sup>Required</sup> <a name="step" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.addStepDependency.parameter.step"></a>

- *Type:* aws-cdk-lib.pipelines.Step

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.toString"></a>

```typescript
public toString(): string
```

Return a string representation of this Step.

##### `addOutputDirectory` <a name="addOutputDirectory" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.addOutputDirectory"></a>

```typescript
public addOutputDirectory(directory: string): FileSet
```

Add an additional output FileSet based on a directory.

After running the script, the contents of the given directory
will be exported as a `FileSet`. Use the `FileSet` as the
input to another step.

Multiple calls with the exact same directory name string (not normalized)
will return the same FileSet.

###### `directory`<sup>Required</sup> <a name="directory" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.addOutputDirectory.parameter.directory"></a>

- *Type:* string

---

##### `primaryOutputDirectory` <a name="primaryOutputDirectory" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.primaryOutputDirectory"></a>

```typescript
public primaryOutputDirectory(directory: string): FileSet
```

Configure the given output directory as primary output.

If no primary output has been configured yet, this directory
will become the primary output of this ShellStep, otherwise this
method will throw if the given directory is different than the
currently configured primary output directory.

###### `directory`<sup>Required</sup> <a name="directory" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.primaryOutputDirectory.parameter.directory"></a>

- *Type:* string

---

##### `exportedVariable` <a name="exportedVariable" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.exportedVariable"></a>

```typescript
public exportedVariable(variableName: string): string
```

Reference a CodePipeline variable defined by the CodeBuildStep.

The variable must be set in the shell of the CodeBuild step when
it finishes its `post_build` phase.

*Example*

```typescript
// Access the output of one CodeBuildStep in another CodeBuildStep
declare const pipeline: pipelines.CodePipeline;

const step1 = new pipelines.CodeBuildStep('Step1', {
  commands: ['export MY_VAR=hello'],
});

const step2 = new pipelines.CodeBuildStep('Step2', {
  env: {
    IMPORTED_VAR: step1.exportedVariable('MY_VAR'),
  },
  commands: ['echo $IMPORTED_VAR'],
});
```


###### `variableName`<sup>Required</sup> <a name="variableName" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.exportedVariable.parameter.variableName"></a>

- *Type:* string

the name of the variable for reference.

---

##### `appendManualApprovalStep` <a name="appendManualApprovalStep" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.appendManualApprovalStep"></a>

```typescript
public appendManualApprovalStep(): ManualApprovalStep
```

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.sequence">sequence</a></code> | Define a sequence of steps to be executed in order. |

---

##### `sequence` <a name="sequence" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.sequence"></a>

```typescript
import { PreDeployBuildStep } from '@cdklabs/cdk-cicd-wrapper'

PreDeployBuildStep.sequence(steps: Step[])
```

Define a sequence of steps to be executed in order.

If you need more fine-grained step ordering, use the `addStepDependency()`
API. For example, if you want `secondStep` to occur after `firstStep`, call
`secondStep.addStepDependency(firstStep)`.

###### `steps`<sup>Required</sup> <a name="steps" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.sequence.parameter.steps"></a>

- *Type:* aws-cdk-lib.pipelines.Step[]

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.consumedStackOutputs">consumedStackOutputs</a></code> | <code>aws-cdk-lib.pipelines.StackOutputReference[]</code> | StackOutputReferences this step consumes. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.dependencies">dependencies</a></code> | <code>aws-cdk-lib.pipelines.Step[]</code> | Return the steps this step depends on, based on the FileSets it requires. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.dependencyFileSets">dependencyFileSets</a></code> | <code>aws-cdk-lib.pipelines.FileSet[]</code> | The list of FileSets consumed by this Step. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.id">id</a></code> | <code>string</code> | Identifier for this step. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.isSource">isSource</a></code> | <code>boolean</code> | Whether or not this is a Source step. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.primaryOutput">primaryOutput</a></code> | <code>aws-cdk-lib.pipelines.FileSet</code> | The primary FileSet produced by this Step. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.commands">commands</a></code> | <code>string[]</code> | Commands to run. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.env">env</a></code> | <code>{[ key: string ]: string}</code> | Environment variables to set. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.envFromCfnOutputs">envFromCfnOutputs</a></code> | <code>{[ key: string ]: aws-cdk-lib.pipelines.StackOutputReference}</code> | Set environment variables based on Stack Outputs. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.inputs">inputs</a></code> | <code>aws-cdk-lib.pipelines.FileSetLocation[]</code> | Input FileSets. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.installCommands">installCommands</a></code> | <code>string[]</code> | Installation commands to run before the regular commands. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.outputs">outputs</a></code> | <code>aws-cdk-lib.pipelines.FileSetLocation[]</code> | Output FileSets. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.grantPrincipal">grantPrincipal</a></code> | <code>aws-cdk-lib.aws_iam.IPrincipal</code> | The CodeBuild Project's principal. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.project">project</a></code> | <code>aws-cdk-lib.aws_codebuild.IProject</code> | CodeBuild Project generated for the pipeline. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.actionRole">actionRole</a></code> | <code>aws-cdk-lib.aws_iam.IRole</code> | Custom execution role to be used for the Code Build Action. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.buildEnvironment">buildEnvironment</a></code> | <code>aws-cdk-lib.aws_codebuild.BuildEnvironment</code> | Build environment. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.cache">cache</a></code> | <code>aws-cdk-lib.aws_codebuild.Cache</code> | Caching strategy to use. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.fileSystemLocations">fileSystemLocations</a></code> | <code>aws-cdk-lib.aws_codebuild.IFileSystemLocation[]</code> | ProjectFileSystemLocation objects for CodeBuild build projects. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.logging">logging</a></code> | <code>aws-cdk-lib.aws_codebuild.LoggingOptions</code> | Information about logs for CodeBuild projects. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.partialBuildSpec">partialBuildSpec</a></code> | <code>aws-cdk-lib.aws_codebuild.BuildSpec</code> | Additional configuration that can only be configured via BuildSpec. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.projectName">projectName</a></code> | <code>string</code> | Name for the generated CodeBuild project. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.role">role</a></code> | <code>aws-cdk-lib.aws_iam.IRole</code> | Custom execution role to be used for the CodeBuild project. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.rolePolicyStatements">rolePolicyStatements</a></code> | <code>aws-cdk-lib.aws_iam.PolicyStatement[]</code> | Policy statements to add to role used during the synth. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Which security group to associate with the script's project network interfaces. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Which subnets to use. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.timeout">timeout</a></code> | <code>aws-cdk-lib.Duration</code> | The number of minutes after which AWS CodeBuild stops the build if it's not complete. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | The VPC where to execute the SimpleSynth. |

---

##### `consumedStackOutputs`<sup>Required</sup> <a name="consumedStackOutputs" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.consumedStackOutputs"></a>

```typescript
public readonly consumedStackOutputs: StackOutputReference[];
```

- *Type:* aws-cdk-lib.pipelines.StackOutputReference[]

StackOutputReferences this step consumes.

---

##### `dependencies`<sup>Required</sup> <a name="dependencies" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.dependencies"></a>

```typescript
public readonly dependencies: Step[];
```

- *Type:* aws-cdk-lib.pipelines.Step[]

Return the steps this step depends on, based on the FileSets it requires.

---

##### `dependencyFileSets`<sup>Required</sup> <a name="dependencyFileSets" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.dependencyFileSets"></a>

```typescript
public readonly dependencyFileSets: FileSet[];
```

- *Type:* aws-cdk-lib.pipelines.FileSet[]

The list of FileSets consumed by this Step.

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.id"></a>

```typescript
public readonly id: string;
```

- *Type:* string

Identifier for this step.

---

##### `isSource`<sup>Required</sup> <a name="isSource" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.isSource"></a>

```typescript
public readonly isSource: boolean;
```

- *Type:* boolean

Whether or not this is a Source step.

What it means to be a Source step depends on the engine.

---

##### `primaryOutput`<sup>Optional</sup> <a name="primaryOutput" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.primaryOutput"></a>

```typescript
public readonly primaryOutput: FileSet;
```

- *Type:* aws-cdk-lib.pipelines.FileSet

The primary FileSet produced by this Step.

Not all steps produce an output FileSet--if they do
you can substitute the `Step` object for the `FileSet` object.

---

##### `commands`<sup>Required</sup> <a name="commands" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.commands"></a>

```typescript
public readonly commands: string[];
```

- *Type:* string[]

Commands to run.

---

##### `env`<sup>Required</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.env"></a>

```typescript
public readonly env: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}
- *Default:* No environment variables

Environment variables to set.

---

##### `envFromCfnOutputs`<sup>Required</sup> <a name="envFromCfnOutputs" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.envFromCfnOutputs"></a>

```typescript
public readonly envFromCfnOutputs: {[ key: string ]: StackOutputReference};
```

- *Type:* {[ key: string ]: aws-cdk-lib.pipelines.StackOutputReference}
- *Default:* No environment variables created from stack outputs

Set environment variables based on Stack Outputs.

---

##### `inputs`<sup>Required</sup> <a name="inputs" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.inputs"></a>

```typescript
public readonly inputs: FileSetLocation[];
```

- *Type:* aws-cdk-lib.pipelines.FileSetLocation[]

Input FileSets.

A list of `(FileSet, directory)` pairs, which are a copy of the
input properties. This list should not be modified directly.

---

##### `installCommands`<sup>Required</sup> <a name="installCommands" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.installCommands"></a>

```typescript
public readonly installCommands: string[];
```

- *Type:* string[]
- *Default:* No installation commands

Installation commands to run before the regular commands.

For deployment engines that support it, install commands will be classified
differently in the job history from the regular `commands`.

---

##### `outputs`<sup>Required</sup> <a name="outputs" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.outputs"></a>

```typescript
public readonly outputs: FileSetLocation[];
```

- *Type:* aws-cdk-lib.pipelines.FileSetLocation[]

Output FileSets.

A list of `(FileSet, directory)` pairs, which are a copy of the
input properties. This list should not be modified directly.

---

##### `grantPrincipal`<sup>Required</sup> <a name="grantPrincipal" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.grantPrincipal"></a>

```typescript
public readonly grantPrincipal: IPrincipal;
```

- *Type:* aws-cdk-lib.aws_iam.IPrincipal

The CodeBuild Project's principal.

---

##### `project`<sup>Required</sup> <a name="project" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.project"></a>

```typescript
public readonly project: IProject;
```

- *Type:* aws-cdk-lib.aws_codebuild.IProject

CodeBuild Project generated for the pipeline.

Will only be available after the pipeline has been built.

---

##### `actionRole`<sup>Optional</sup> <a name="actionRole" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.actionRole"></a>

```typescript
public readonly actionRole: IRole;
```

- *Type:* aws-cdk-lib.aws_iam.IRole
- *Default:* A role is automatically created

Custom execution role to be used for the Code Build Action.

---

##### `buildEnvironment`<sup>Optional</sup> <a name="buildEnvironment" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.buildEnvironment"></a>

```typescript
public readonly buildEnvironment: BuildEnvironment;
```

- *Type:* aws-cdk-lib.aws_codebuild.BuildEnvironment
- *Default:* No value specified at construction time, use defaults

Build environment.

---

##### `cache`<sup>Optional</sup> <a name="cache" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.cache"></a>

```typescript
public readonly cache: Cache;
```

- *Type:* aws-cdk-lib.aws_codebuild.Cache
- *Default:* No cache

Caching strategy to use.

---

##### `fileSystemLocations`<sup>Optional</sup> <a name="fileSystemLocations" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.fileSystemLocations"></a>

```typescript
public readonly fileSystemLocations: IFileSystemLocation[];
```

- *Type:* aws-cdk-lib.aws_codebuild.IFileSystemLocation[]
- *Default:* no file system locations

ProjectFileSystemLocation objects for CodeBuild build projects.

A ProjectFileSystemLocation object specifies the identifier, location, mountOptions, mountPoint,
and type of a file system created using Amazon Elastic File System.

---

##### `logging`<sup>Optional</sup> <a name="logging" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.logging"></a>

```typescript
public readonly logging: LoggingOptions;
```

- *Type:* aws-cdk-lib.aws_codebuild.LoggingOptions
- *Default:* no log configuration is set

Information about logs for CodeBuild projects.

A CodeBuilde project can create logs in Amazon CloudWatch Logs, an S3 bucket, or both.

---

##### `partialBuildSpec`<sup>Optional</sup> <a name="partialBuildSpec" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.partialBuildSpec"></a>

```typescript
public readonly partialBuildSpec: BuildSpec;
```

- *Type:* aws-cdk-lib.aws_codebuild.BuildSpec
- *Default:* Contains the exported variables

Additional configuration that can only be configured via BuildSpec.

Contains exported variables

---

##### `projectName`<sup>Optional</sup> <a name="projectName" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.projectName"></a>

```typescript
public readonly projectName: string;
```

- *Type:* string
- *Default:* No value specified at construction time, use defaults

Name for the generated CodeBuild project.

---

##### `role`<sup>Optional</sup> <a name="role" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.role"></a>

```typescript
public readonly role: IRole;
```

- *Type:* aws-cdk-lib.aws_iam.IRole
- *Default:* No value specified at construction time, use defaults

Custom execution role to be used for the CodeBuild project.

---

##### `rolePolicyStatements`<sup>Optional</sup> <a name="rolePolicyStatements" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.rolePolicyStatements"></a>

```typescript
public readonly rolePolicyStatements: PolicyStatement[];
```

- *Type:* aws-cdk-lib.aws_iam.PolicyStatement[]
- *Default:* No value specified at construction time, use defaults

Policy statements to add to role used during the synth.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]
- *Default:* No value specified at construction time, use defaults

Which security group to associate with the script's project network interfaces.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection
- *Default:* No value specified at construction time, use defaults

Which subnets to use.

---

##### `timeout`<sup>Optional</sup> <a name="timeout" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.timeout"></a>

```typescript
public readonly timeout: Duration;
```

- *Type:* aws-cdk-lib.Duration
- *Default:* Duration.hours(1)

The number of minutes after which AWS CodeBuild stops the build if it's not complete.

For valid values, see the timeoutInMinutes field in the AWS
CodeBuild User Guide.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cdklabs/cdk-cicd-wrapper.PreDeployBuildStep.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc
- *Default:* No value specified at construction time, use defaults

The VPC where to execute the SimpleSynth.

---


### PythonPhaseCommand <a name="PythonPhaseCommand" id="@cdklabs/cdk-cicd-wrapper.PythonPhaseCommand"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>

Phase Command that invokes Python scripts from project folder.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.PythonPhaseCommand.Initializer"></a>

```typescript
import { PythonPhaseCommand } from '@cdklabs/cdk-cicd-wrapper'

new PythonPhaseCommand(script: string)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PythonPhaseCommand.Initializer.parameter.script">script</a></code> | <code>string</code> | *No description.* |

---

##### `script`<sup>Required</sup> <a name="script" id="@cdklabs/cdk-cicd-wrapper.PythonPhaseCommand.Initializer.parameter.script"></a>

- *Type:* string

---



#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PythonPhaseCommand.property.command">command</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PythonPhaseCommand.property.script">script</a></code> | <code>string</code> | *No description.* |

---

##### `command`<sup>Required</sup> <a name="command" id="@cdklabs/cdk-cicd-wrapper.PythonPhaseCommand.property.command"></a>

```typescript
public readonly command: string;
```

- *Type:* string

---

##### `script`<sup>Required</sup> <a name="script" id="@cdklabs/cdk-cicd-wrapper.PythonPhaseCommand.property.script"></a>

```typescript
public readonly script: string;
```

- *Type:* string

---


### ResourceContext <a name="ResourceContext" id="@cdklabs/cdk-cicd-wrapper.ResourceContext"></a>

Provides API to register resource providers and get access to the provided resources.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.Initializer"></a>

```typescript
import { ResourceContext } from '@cdklabs/cdk-cicd-wrapper'

new ResourceContext(_scope: Construct, pipelineStack: Construct, blueprintProps: IVanillaPipelineBlueprintProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext.Initializer.parameter._scope">_scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext.Initializer.parameter.pipelineStack">pipelineStack</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext.Initializer.parameter.blueprintProps">blueprintProps</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps">IVanillaPipelineBlueprintProps</a></code> | *No description.* |

---

##### `_scope`<sup>Required</sup> <a name="_scope" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.Initializer.parameter._scope"></a>

- *Type:* constructs.Construct

---

##### `pipelineStack`<sup>Required</sup> <a name="pipelineStack" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.Initializer.parameter.pipelineStack"></a>

- *Type:* constructs.Construct

---

##### `blueprintProps`<sup>Required</sup> <a name="blueprintProps" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.Initializer.parameter.blueprintProps"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps">IVanillaPipelineBlueprintProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext.get">get</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext.has">has</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext.initStage">initStage</a></code> | *No description.* |

---

##### `get` <a name="get" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.get"></a>

```typescript
public get(name: string): any
```

###### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.get.parameter.name"></a>

- *Type:* string

---

##### `has` <a name="has" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.has"></a>

```typescript
public has(name: string): boolean
```

###### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.has.parameter.name"></a>

- *Type:* string

---

##### `initStage` <a name="initStage" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.initStage"></a>

```typescript
public initStage(stage: string): void
```

###### `stage`<sup>Required</sup> <a name="stage" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.initStage.parameter.stage"></a>

- *Type:* string

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext.instance">instance</a></code> | *No description.* |

---

##### `instance` <a name="instance" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.instance"></a>

```typescript
import { ResourceContext } from '@cdklabs/cdk-cicd-wrapper'

ResourceContext.instance()
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext.property.blueprintProps">blueprintProps</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps">IVanillaPipelineBlueprintProps</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext.property.environment">environment</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.Environment">Environment</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext.property.pipelineStack">pipelineStack</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext.property.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext.property.stage">stage</a></code> | <code>string</code> | *No description.* |

---

##### `blueprintProps`<sup>Required</sup> <a name="blueprintProps" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.property.blueprintProps"></a>

```typescript
public readonly blueprintProps: IVanillaPipelineBlueprintProps;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps">IVanillaPipelineBlueprintProps</a>

---

##### `environment`<sup>Required</sup> <a name="environment" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.property.environment"></a>

```typescript
public readonly environment: Environment;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.Environment">Environment</a>

---

##### `pipelineStack`<sup>Required</sup> <a name="pipelineStack" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.property.pipelineStack"></a>

```typescript
public readonly pipelineStack: Construct;
```

- *Type:* constructs.Construct

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.property.scope"></a>

```typescript
public readonly scope: Construct;
```

- *Type:* constructs.Construct

---

##### `stage`<sup>Required</sup> <a name="stage" id="@cdklabs/cdk-cicd-wrapper.ResourceContext.property.stage"></a>

```typescript
public readonly stage: string;
```

- *Type:* string

---


### SecurityControls <a name="SecurityControls" id="@cdklabs/cdk-cicd-wrapper.SecurityControls"></a>

- *Implements:* aws-cdk-lib.IAspect

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.SecurityControls.Initializer"></a>

```typescript
import { SecurityControls } from '@cdklabs/cdk-cicd-wrapper'

new SecurityControls(kmsKey: Key, stage: string, logRetentionInDays: string, complianceLogBucketName: string)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SecurityControls.Initializer.parameter.kmsKey">kmsKey</a></code> | <code>aws-cdk-lib.aws_kms.Key</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SecurityControls.Initializer.parameter.stage">stage</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SecurityControls.Initializer.parameter.logRetentionInDays">logRetentionInDays</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SecurityControls.Initializer.parameter.complianceLogBucketName">complianceLogBucketName</a></code> | <code>string</code> | *No description.* |

---

##### `kmsKey`<sup>Required</sup> <a name="kmsKey" id="@cdklabs/cdk-cicd-wrapper.SecurityControls.Initializer.parameter.kmsKey"></a>

- *Type:* aws-cdk-lib.aws_kms.Key

---

##### `stage`<sup>Required</sup> <a name="stage" id="@cdklabs/cdk-cicd-wrapper.SecurityControls.Initializer.parameter.stage"></a>

- *Type:* string

---

##### `logRetentionInDays`<sup>Required</sup> <a name="logRetentionInDays" id="@cdklabs/cdk-cicd-wrapper.SecurityControls.Initializer.parameter.logRetentionInDays"></a>

- *Type:* string

---

##### `complianceLogBucketName`<sup>Required</sup> <a name="complianceLogBucketName" id="@cdklabs/cdk-cicd-wrapper.SecurityControls.Initializer.parameter.complianceLogBucketName"></a>

- *Type:* string

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SecurityControls.visit">visit</a></code> | All aspects can visit an IConstruct. |

---

##### `visit` <a name="visit" id="@cdklabs/cdk-cicd-wrapper.SecurityControls.visit"></a>

```typescript
public visit(node: IConstruct): void
```

All aspects can visit an IConstruct.

###### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.SecurityControls.visit.parameter.node"></a>

- *Type:* constructs.IConstruct

---




### ShellCommandPhaseCommand <a name="ShellCommandPhaseCommand" id="@cdklabs/cdk-cicd-wrapper.ShellCommandPhaseCommand"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>

Phase Command that invokes a simple shell command.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.ShellCommandPhaseCommand.Initializer"></a>

```typescript
import { ShellCommandPhaseCommand } from '@cdklabs/cdk-cicd-wrapper'

new ShellCommandPhaseCommand(command: string)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ShellCommandPhaseCommand.Initializer.parameter.command">command</a></code> | <code>string</code> | *No description.* |

---

##### `command`<sup>Required</sup> <a name="command" id="@cdklabs/cdk-cicd-wrapper.ShellCommandPhaseCommand.Initializer.parameter.command"></a>

- *Type:* string

---



#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ShellCommandPhaseCommand.property.command">command</a></code> | <code>string</code> | *No description.* |

---

##### `command`<sup>Required</sup> <a name="command" id="@cdklabs/cdk-cicd-wrapper.ShellCommandPhaseCommand.property.command"></a>

```typescript
public readonly command: string;
```

- *Type:* string

---


### ShellScriptPhaseCommand <a name="ShellScriptPhaseCommand" id="@cdklabs/cdk-cicd-wrapper.ShellScriptPhaseCommand"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>

Phase Command that invokes shell scripts from project folder.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.ShellScriptPhaseCommand.Initializer"></a>

```typescript
import { ShellScriptPhaseCommand } from '@cdklabs/cdk-cicd-wrapper'

new ShellScriptPhaseCommand(script: string)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ShellScriptPhaseCommand.Initializer.parameter.script">script</a></code> | <code>string</code> | *No description.* |

---

##### `script`<sup>Required</sup> <a name="script" id="@cdklabs/cdk-cicd-wrapper.ShellScriptPhaseCommand.Initializer.parameter.script"></a>

- *Type:* string

---



#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ShellScriptPhaseCommand.property.command">command</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ShellScriptPhaseCommand.property.script">script</a></code> | <code>string</code> | *No description.* |

---

##### `command`<sup>Required</sup> <a name="command" id="@cdklabs/cdk-cicd-wrapper.ShellScriptPhaseCommand.property.command"></a>

```typescript
public readonly command: string;
```

- *Type:* string

---

##### `script`<sup>Required</sup> <a name="script" id="@cdklabs/cdk-cicd-wrapper.ShellScriptPhaseCommand.property.script"></a>

```typescript
public readonly script: string;
```

- *Type:* string

---


### Stage <a name="Stage" id="@cdklabs/cdk-cicd-wrapper.Stage"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.Stage.Initializer"></a>

```typescript
import { Stage } from '@cdklabs/cdk-cicd-wrapper'

new Stage()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---




#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Stage.property.DEV">DEV</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Stage.property.INT">INT</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Stage.property.PROD">PROD</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Stage.property.RES">RES</a></code> | <code>string</code> | *No description.* |

---

##### `DEV`<sup>Required</sup> <a name="DEV" id="@cdklabs/cdk-cicd-wrapper.Stage.property.DEV"></a>

```typescript
public readonly DEV: string;
```

- *Type:* string

---

##### `INT`<sup>Required</sup> <a name="INT" id="@cdklabs/cdk-cicd-wrapper.Stage.property.INT"></a>

```typescript
public readonly INT: string;
```

- *Type:* string

---

##### `PROD`<sup>Required</sup> <a name="PROD" id="@cdklabs/cdk-cicd-wrapper.Stage.property.PROD"></a>

```typescript
public readonly PROD: string;
```

- *Type:* string

---

##### `RES`<sup>Required</sup> <a name="RES" id="@cdklabs/cdk-cicd-wrapper.Stage.property.RES"></a>

```typescript
public readonly RES: string;
```

- *Type:* string

---

### StageProvider <a name="StageProvider" id="@cdklabs/cdk-cicd-wrapper.StageProvider"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>

Provides AppStage definitions.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.StageProvider.Initializer"></a>

```typescript
import { StageProvider } from '@cdklabs/cdk-cicd-wrapper'

new StageProvider()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.StageProvider.provide">provide</a></code> | *No description.* |

---

##### `provide` <a name="provide" id="@cdklabs/cdk-cicd-wrapper.StageProvider.provide"></a>

```typescript
public provide(context: ResourceContext): any
```

###### `context`<sup>Required</sup> <a name="context" id="@cdklabs/cdk-cicd-wrapper.StageProvider.provide.parameter.context"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext">ResourceContext</a>

---


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.StageProvider.property.scope">scope</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.Scope">Scope</a></code> | *No description.* |

---

##### `scope`<sup>Optional</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.StageProvider.property.scope"></a>

```typescript
public readonly scope: Scope;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.Scope">Scope</a>

---


### VanillaPipelineBlueprintBuilder <a name="VanillaPipelineBlueprintBuilder" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder"></a>

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.Initializer"></a>

```typescript
import { VanillaPipelineBlueprintBuilder } from '@cdklabs/cdk-cicd-wrapper'

new VanillaPipelineBlueprintBuilder(props?: IVanillaPipelineBlueprintProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps">IVanillaPipelineBlueprintProps</a></code> | *No description.* |

---

##### `props`<sup>Optional</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps">IVanillaPipelineBlueprintProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.addStack">addStack</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.applicationName">applicationName</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.applicationQualifier">applicationQualifier</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.codeBuildEnvSettings">codeBuildEnvSettings</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.codeGuruScanThreshold">codeGuruScanThreshold</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.definePhase">definePhase</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.defineStages">defineStages</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.id">id</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.logRetentionInDays">logRetentionInDays</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.npmRegistry">npmRegistry</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.proxy">proxy</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.region">region</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.repositoryProvider">repositoryProvider</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.resourceProvider">resourceProvider</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.synth">synth</a></code> | *No description.* |

---

##### `addStack` <a name="addStack" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.addStack"></a>

```typescript
public addStack(stackProvider: IStackProvider, stages: string): VanillaPipelineBlueprintBuilder
```

###### `stackProvider`<sup>Required</sup> <a name="stackProvider" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.addStack.parameter.stackProvider"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IStackProvider">IStackProvider</a>

---

###### `stages`<sup>Required</sup> <a name="stages" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.addStack.parameter.stages"></a>

- *Type:* string

---

##### `applicationName` <a name="applicationName" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.applicationName"></a>

```typescript
public applicationName(applicationName: string): VanillaPipelineBlueprintBuilder
```

###### `applicationName`<sup>Required</sup> <a name="applicationName" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.applicationName.parameter.applicationName"></a>

- *Type:* string

---

##### `applicationQualifier` <a name="applicationQualifier" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.applicationQualifier"></a>

```typescript
public applicationQualifier(applicationQualifier: string): VanillaPipelineBlueprintBuilder
```

###### `applicationQualifier`<sup>Required</sup> <a name="applicationQualifier" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.applicationQualifier.parameter.applicationQualifier"></a>

- *Type:* string

---

##### `codeBuildEnvSettings` <a name="codeBuildEnvSettings" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.codeBuildEnvSettings"></a>

```typescript
public codeBuildEnvSettings(codeBuildEnvSettings: BuildEnvironment): VanillaPipelineBlueprintBuilder
```

###### `codeBuildEnvSettings`<sup>Required</sup> <a name="codeBuildEnvSettings" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.codeBuildEnvSettings.parameter.codeBuildEnvSettings"></a>

- *Type:* aws-cdk-lib.aws_codebuild.BuildEnvironment

---

##### `codeGuruScanThreshold` <a name="codeGuruScanThreshold" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.codeGuruScanThreshold"></a>

```typescript
public codeGuruScanThreshold(codeGuruScanThreshold: CodeGuruSeverityThreshold): VanillaPipelineBlueprintBuilder
```

###### `codeGuruScanThreshold`<sup>Required</sup> <a name="codeGuruScanThreshold" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.codeGuruScanThreshold.parameter.codeGuruScanThreshold"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold">CodeGuruSeverityThreshold</a>

---

##### `definePhase` <a name="definePhase" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.definePhase"></a>

```typescript
public definePhase(phase: PipelinePhases, commandsToExecute: IPhaseCommand[]): VanillaPipelineBlueprintBuilder
```

###### `phase`<sup>Required</sup> <a name="phase" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.definePhase.parameter.phase"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.PipelinePhases">PipelinePhases</a>

---

###### `commandsToExecute`<sup>Required</sup> <a name="commandsToExecute" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.definePhase.parameter.commandsToExecute"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]

---

##### `defineStages` <a name="defineStages" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.defineStages"></a>

```typescript
public defineStages(stageDefinition: string | IStageDefinition[]): VanillaPipelineBlueprintBuilder
```

###### `stageDefinition`<sup>Required</sup> <a name="stageDefinition" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.defineStages.parameter.stageDefinition"></a>

- *Type:* string | <a href="#@cdklabs/cdk-cicd-wrapper.IStageDefinition">IStageDefinition</a>[]

---

##### `id` <a name="id" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.id"></a>

```typescript
public id(id: string): VanillaPipelineBlueprintBuilder
```

###### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.id.parameter.id"></a>

- *Type:* string

---

##### `logRetentionInDays` <a name="logRetentionInDays" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.logRetentionInDays"></a>

```typescript
public logRetentionInDays(logRetentionInDays: string): VanillaPipelineBlueprintBuilder
```

###### `logRetentionInDays`<sup>Required</sup> <a name="logRetentionInDays" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.logRetentionInDays.parameter.logRetentionInDays"></a>

- *Type:* string

---

##### `npmRegistry` <a name="npmRegistry" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.npmRegistry"></a>

```typescript
public npmRegistry(npmRegistry: NPMRegistryConfig): VanillaPipelineBlueprintBuilder
```

###### `npmRegistry`<sup>Required</sup> <a name="npmRegistry" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.npmRegistry.parameter.npmRegistry"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig">NPMRegistryConfig</a>

---

##### `proxy` <a name="proxy" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.proxy"></a>

```typescript
public proxy(proxy?: IProxyConfig): VanillaPipelineBlueprintBuilder
```

###### `proxy`<sup>Optional</sup> <a name="proxy" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.proxy.parameter.proxy"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IProxyConfig">IProxyConfig</a>

---

##### `region` <a name="region" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.region"></a>

```typescript
public region(region: string): VanillaPipelineBlueprintBuilder
```

###### `region`<sup>Required</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.region.parameter.region"></a>

- *Type:* string

---

##### `repositoryProvider` <a name="repositoryProvider" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.repositoryProvider"></a>

```typescript
public repositoryProvider(repositoryProvider: IResourceProvider): VanillaPipelineBlueprintBuilder
```

###### `repositoryProvider`<sup>Required</sup> <a name="repositoryProvider" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.repositoryProvider.parameter.repositoryProvider"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>

---

##### `resourceProvider` <a name="resourceProvider" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.resourceProvider"></a>

```typescript
public resourceProvider(name: string, provider: IResourceProvider): VanillaPipelineBlueprintBuilder
```

###### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.resourceProvider.parameter.name"></a>

- *Type:* string

---

###### `provider`<sup>Required</sup> <a name="provider" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.resourceProvider.parameter.provider"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>

---

##### `synth` <a name="synth" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.synth"></a>

```typescript
public synth(app: App): VanillaPipelineBlueprint
```

###### `app`<sup>Required</sup> <a name="app" id="@cdklabs/cdk-cicd-wrapper.VanillaPipelineBlueprintBuilder.synth.parameter.app"></a>

- *Type:* aws-cdk-lib.App

---




### VPCProvider <a name="VPCProvider" id="@cdklabs/cdk-cicd-wrapper.VPCProvider"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>

Legacy VPC Provider that defines the VPC used by the CI/CD process.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.VPCProvider.Initializer"></a>

```typescript
import { VPCProvider } from '@cdklabs/cdk-cicd-wrapper'

new VPCProvider(vpc?: IVpcConfig)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCProvider.Initializer.parameter.vpc">vpc</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfig">IVpcConfig</a></code> | *No description.* |

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cdklabs/cdk-cicd-wrapper.VPCProvider.Initializer.parameter.vpc"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfig">IVpcConfig</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCProvider.provide">provide</a></code> | *No description.* |

---

##### `provide` <a name="provide" id="@cdklabs/cdk-cicd-wrapper.VPCProvider.provide"></a>

```typescript
public provide(context: ResourceContext): any
```

###### `context`<sup>Required</sup> <a name="context" id="@cdklabs/cdk-cicd-wrapper.VPCProvider.provide.parameter.context"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext">ResourceContext</a>

---


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VPCProvider.property.vpc">vpc</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfig">IVpcConfig</a></code> | *No description.* |

---

##### `vpc`<sup>Required</sup> <a name="vpc" id="@cdklabs/cdk-cicd-wrapper.VPCProvider.property.vpc"></a>

```typescript
public readonly vpc: IVpcConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfig">IVpcConfig</a>

---


## Protocols <a name="Protocols" id="Protocols"></a>

### ICodeCommitConfig <a name="ICodeCommitConfig" id="@cdklabs/cdk-cicd-wrapper.ICodeCommitConfig"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.ICodeCommitConfig">ICodeCommitConfig</a>


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ICodeCommitConfig.property.branch">branch</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ICodeCommitConfig.property.codeGuruReviewer">codeGuruReviewer</a></code> | <code>boolean</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ICodeCommitConfig.property.description">description</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ICodeCommitConfig.property.name">name</a></code> | <code>string</code> | *No description.* |

---

##### `branch`<sup>Required</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.ICodeCommitConfig.property.branch"></a>

```typescript
public readonly branch: string;
```

- *Type:* string

---

##### `codeGuruReviewer`<sup>Required</sup> <a name="codeGuruReviewer" id="@cdklabs/cdk-cicd-wrapper.ICodeCommitConfig.property.codeGuruReviewer"></a>

```typescript
public readonly codeGuruReviewer: boolean;
```

- *Type:* boolean

---

##### `description`<sup>Required</sup> <a name="description" id="@cdklabs/cdk-cicd-wrapper.ICodeCommitConfig.property.description"></a>

```typescript
public readonly description: string;
```

- *Type:* string

---

##### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.ICodeCommitConfig.property.name"></a>

```typescript
public readonly name: string;
```

- *Type:* string

---

### IComplianceBucketConfig <a name="IComplianceBucketConfig" id="@cdklabs/cdk-cicd-wrapper.IComplianceBucketConfig"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.ComplianceLogBucketStack">ComplianceLogBucketStack</a>, <a href="#@cdklabs/cdk-cicd-wrapper.IComplianceBucketConfig">IComplianceBucketConfig</a>

Compliance Bucket configuration.


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IComplianceBucketConfig.property.bucketName">bucketName</a></code> | <code>string</code> | *No description.* |

---

##### `bucketName`<sup>Required</sup> <a name="bucketName" id="@cdklabs/cdk-cicd-wrapper.IComplianceBucketConfig.property.bucketName"></a>

```typescript
public readonly bucketName: string;
```

- *Type:* string

---

### IEncryptionKey <a name="IEncryptionKey" id="@cdklabs/cdk-cicd-wrapper.IEncryptionKey"></a>

- *Extends:* constructs.IConstruct

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IEncryptionKey">IEncryptionKey</a>

Construct for supplying encryption key.


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IEncryptionKey.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IEncryptionKey.property.kmsKey">kmsKey</a></code> | <code>aws-cdk-lib.aws_kms.Key</code> | KMS Key. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.IEncryptionKey.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `kmsKey`<sup>Required</sup> <a name="kmsKey" id="@cdklabs/cdk-cicd-wrapper.IEncryptionKey.property.kmsKey"></a>

```typescript
public readonly kmsKey: Key;
```

- *Type:* aws-cdk-lib.aws_kms.Key

KMS Key.

---

### IParameterConstruct <a name="IParameterConstruct" id="@cdklabs/cdk-cicd-wrapper.IParameterConstruct"></a>

- *Extends:* constructs.IConstruct

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IParameterConstruct">IParameterConstruct</a>

Construct to supply persistent parameters for IaaC code.

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IParameterConstruct.createParameter">createParameter</a></code> | Create  parameter that is accessible through the pipeline. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IParameterConstruct.provideParameterPolicyStatement">provideParameterPolicyStatement</a></code> | Returns with a policy that allows to access the parameters. |

---

##### `createParameter` <a name="createParameter" id="@cdklabs/cdk-cicd-wrapper.IParameterConstruct.createParameter"></a>

```typescript
public createParameter(parameterName: string, parameterValue: string): IStringParameter
```

Create  parameter that is accessible through the pipeline.

###### `parameterName`<sup>Required</sup> <a name="parameterName" id="@cdklabs/cdk-cicd-wrapper.IParameterConstruct.createParameter.parameter.parameterName"></a>

- *Type:* string

name of the parameter.

---

###### `parameterValue`<sup>Required</sup> <a name="parameterValue" id="@cdklabs/cdk-cicd-wrapper.IParameterConstruct.createParameter.parameter.parameterValue"></a>

- *Type:* string

value of the parameter.

---

##### `provideParameterPolicyStatement` <a name="provideParameterPolicyStatement" id="@cdklabs/cdk-cicd-wrapper.IParameterConstruct.provideParameterPolicyStatement"></a>

```typescript
public provideParameterPolicyStatement(): PolicyStatement
```

Returns with a policy that allows to access the parameters.

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IParameterConstruct.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.IParameterConstruct.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

### IPhaseCommand <a name="IPhaseCommand" id="@cdklabs/cdk-cicd-wrapper.IPhaseCommand"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.NPMPhaseCommand">NPMPhaseCommand</a>, <a href="#@cdklabs/cdk-cicd-wrapper.PythonPhaseCommand">PythonPhaseCommand</a>, <a href="#@cdklabs/cdk-cicd-wrapper.ShellCommandPhaseCommand">ShellCommandPhaseCommand</a>, <a href="#@cdklabs/cdk-cicd-wrapper.ShellScriptPhaseCommand">ShellScriptPhaseCommand</a>, <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand.property.command">command</a></code> | <code>string</code> | *No description.* |

---

##### `command`<sup>Required</sup> <a name="command" id="@cdklabs/cdk-cicd-wrapper.IPhaseCommand.property.command"></a>

```typescript
public readonly command: string;
```

- *Type:* string

---

### IPhaseCommandSettings <a name="IPhaseCommandSettings" id="@cdklabs/cdk-cicd-wrapper.IPhaseCommandSettings"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommandSettings">IPhaseCommandSettings</a>

Setting the list of commands for the phases.

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommandSettings.getCommands">getCommands</a></code> | the list of commands for the phases. |

---

##### `getCommands` <a name="getCommands" id="@cdklabs/cdk-cicd-wrapper.IPhaseCommandSettings.getCommands"></a>

```typescript
public getCommands(phases: PipelinePhases): string[]
```

the list of commands for the phases.

###### `phases`<sup>Required</sup> <a name="phases" id="@cdklabs/cdk-cicd-wrapper.IPhaseCommandSettings.getCommands.parameter.phases"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.PipelinePhases">PipelinePhases</a>

list of phases.

---


### IPipelinePhases <a name="IPipelinePhases" id="@cdklabs/cdk-cicd-wrapper.IPipelinePhases"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IPipelinePhases">IPipelinePhases</a>


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IPipelinePhases.property.initialize">initialize</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IPipelinePhases.property.postDeploy">postDeploy</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IPipelinePhases.property.preBuild">preBuild</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IPipelinePhases.property.preDeploy">preDeploy</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IPipelinePhases.property.runBuild">runBuild</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IPipelinePhases.property.testing">testing</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]</code> | *No description.* |

---

##### `initialize`<sup>Optional</sup> <a name="initialize" id="@cdklabs/cdk-cicd-wrapper.IPipelinePhases.property.initialize"></a>

```typescript
public readonly initialize: IPhaseCommand[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]

---

##### `postDeploy`<sup>Optional</sup> <a name="postDeploy" id="@cdklabs/cdk-cicd-wrapper.IPipelinePhases.property.postDeploy"></a>

```typescript
public readonly postDeploy: IPhaseCommand[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]

---

##### `preBuild`<sup>Optional</sup> <a name="preBuild" id="@cdklabs/cdk-cicd-wrapper.IPipelinePhases.property.preBuild"></a>

```typescript
public readonly preBuild: IPhaseCommand[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]

---

##### `preDeploy`<sup>Optional</sup> <a name="preDeploy" id="@cdklabs/cdk-cicd-wrapper.IPipelinePhases.property.preDeploy"></a>

```typescript
public readonly preDeploy: IPhaseCommand[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]

---

##### `runBuild`<sup>Optional</sup> <a name="runBuild" id="@cdklabs/cdk-cicd-wrapper.IPipelinePhases.property.runBuild"></a>

```typescript
public readonly runBuild: IPhaseCommand[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]

---

##### `testing`<sup>Optional</sup> <a name="testing" id="@cdklabs/cdk-cicd-wrapper.IPipelinePhases.property.testing"></a>

```typescript
public readonly testing: IPhaseCommand[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IPhaseCommand">IPhaseCommand</a>[]

---

### IProxyConfig <a name="IProxyConfig" id="@cdklabs/cdk-cicd-wrapper.IProxyConfig"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IProxyConfig">IProxyConfig</a>

HTTP(s) Proxy configuration.


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IProxyConfig.property.noProxy">noProxy</a></code> | <code>string[]</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IProxyConfig.property.proxySecretArn">proxySecretArn</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IProxyConfig.property.proxyTestUrl">proxyTestUrl</a></code> | <code>string</code> | *No description.* |

---

##### `noProxy`<sup>Required</sup> <a name="noProxy" id="@cdklabs/cdk-cicd-wrapper.IProxyConfig.property.noProxy"></a>

```typescript
public readonly noProxy: string[];
```

- *Type:* string[]

---

##### `proxySecretArn`<sup>Required</sup> <a name="proxySecretArn" id="@cdklabs/cdk-cicd-wrapper.IProxyConfig.property.proxySecretArn"></a>

```typescript
public readonly proxySecretArn: string;
```

- *Type:* string

---

##### `proxyTestUrl`<sup>Required</sup> <a name="proxyTestUrl" id="@cdklabs/cdk-cicd-wrapper.IProxyConfig.property.proxyTestUrl"></a>

```typescript
public readonly proxyTestUrl: string;
```

- *Type:* string

---

### IRepositoryStack <a name="IRepositoryStack" id="@cdklabs/cdk-cicd-wrapper.IRepositoryStack"></a>

- *Extends:* constructs.IConstruct

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.CodeStarConnectRepositoryStack">CodeStarConnectRepositoryStack</a>, <a href="#@cdklabs/cdk-cicd-wrapper.IRepositoryStack">IRepositoryStack</a>


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IRepositoryStack.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IRepositoryStack.property.pipelineEnvVars">pipelineEnvVars</a></code> | <code>{[ key: string ]: string}</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IRepositoryStack.property.pipelineInput">pipelineInput</a></code> | <code>aws-cdk-lib.pipelines.IFileSetProducer</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IRepositoryStack.property.repositoryBranch">repositoryBranch</a></code> | <code>string</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.IRepositoryStack.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `pipelineEnvVars`<sup>Required</sup> <a name="pipelineEnvVars" id="@cdklabs/cdk-cicd-wrapper.IRepositoryStack.property.pipelineEnvVars"></a>

```typescript
public readonly pipelineEnvVars: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}

---

##### `pipelineInput`<sup>Required</sup> <a name="pipelineInput" id="@cdklabs/cdk-cicd-wrapper.IRepositoryStack.property.pipelineInput"></a>

```typescript
public readonly pipelineInput: IFileSetProducer;
```

- *Type:* aws-cdk-lib.pipelines.IFileSetProducer

---

##### `repositoryBranch`<sup>Required</sup> <a name="repositoryBranch" id="@cdklabs/cdk-cicd-wrapper.IRepositoryStack.property.repositoryBranch"></a>

```typescript
public readonly repositoryBranch: string;
```

- *Type:* string

---

### IResourceProvider <a name="IResourceProvider" id="@cdklabs/cdk-cicd-wrapper.IResourceProvider"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.BasicRepositoryProvider">BasicRepositoryProvider</a>, <a href="#@cdklabs/cdk-cicd-wrapper.ComplianceBucketConfigProvider">ComplianceBucketConfigProvider</a>, <a href="#@cdklabs/cdk-cicd-wrapper.EncryptionProvider">EncryptionProvider</a>, <a href="#@cdklabs/cdk-cicd-wrapper.HttpProxyProvider">HttpProxyProvider</a>, <a href="#@cdklabs/cdk-cicd-wrapper.ParameterProvider">ParameterProvider</a>, <a href="#@cdklabs/cdk-cicd-wrapper.PhaseCommandProvider">PhaseCommandProvider</a>, <a href="#@cdklabs/cdk-cicd-wrapper.StageProvider">StageProvider</a>, <a href="#@cdklabs/cdk-cicd-wrapper.VPCProvider">VPCProvider</a>, <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>

Generic resource provider interface.

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider.provide">provide</a></code> | *No description.* |

---

##### `provide` <a name="provide" id="@cdklabs/cdk-cicd-wrapper.IResourceProvider.provide"></a>

```typescript
public provide(context: ResourceContext): any
```

###### `context`<sup>Required</sup> <a name="context" id="@cdklabs/cdk-cicd-wrapper.IResourceProvider.provide.parameter.context"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext">ResourceContext</a>

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider.property.scope">scope</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.Scope">Scope</a></code> | *No description.* |

---

##### `scope`<sup>Optional</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.IResourceProvider.property.scope"></a>

```typescript
public readonly scope: Scope;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.Scope">Scope</a>

---

### IStackProvider <a name="IStackProvider" id="@cdklabs/cdk-cicd-wrapper.IStackProvider"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IStackProvider">IStackProvider</a>

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IStackProvider.provide">provide</a></code> | *No description.* |

---

##### `provide` <a name="provide" id="@cdklabs/cdk-cicd-wrapper.IStackProvider.provide"></a>

```typescript
public provide(context: ResourceContext): void
```

###### `context`<sup>Required</sup> <a name="context" id="@cdklabs/cdk-cicd-wrapper.IStackProvider.provide.parameter.context"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResourceContext">ResourceContext</a>

---


### IStageDefinition <a name="IStageDefinition" id="@cdklabs/cdk-cicd-wrapper.IStageDefinition"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IStageDefinition">IStageDefinition</a>


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IStageDefinition.property.stage">stage</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IStageDefinition.property.account">account</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IStageDefinition.property.region">region</a></code> | <code>string</code> | *No description.* |

---

##### `stage`<sup>Required</sup> <a name="stage" id="@cdklabs/cdk-cicd-wrapper.IStageDefinition.property.stage"></a>

```typescript
public readonly stage: string;
```

- *Type:* string

---

##### `account`<sup>Optional</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.IStageDefinition.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

---

##### `region`<sup>Optional</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.IStageDefinition.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

---

### IVanillaPipelineBlueprintProps <a name="IVanillaPipelineBlueprintProps" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps"></a>

- *Extends:* <a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig">IVanillaPipelineConfig</a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps">IVanillaPipelineBlueprintProps</a>


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.applicationName">applicationName</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.applicationQualifier">applicationQualifier</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.codeBuildEnvSettings">codeBuildEnvSettings</a></code> | <code>aws-cdk-lib.aws_codebuild.BuildEnvironment</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.deploymentDefinition">deploymentDefinition</a></code> | <code>{[ key: string ]: <a href="#@cdklabs/cdk-cicd-wrapper.DeploymentDefinition">DeploymentDefinition</a>}</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.logRetentionInDays">logRetentionInDays</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.phases">phases</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IPipelinePhases">IPipelinePhases</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.primaryOutputDirectory">primaryOutputDirectory</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.codeGuruScanThreshold">codeGuruScanThreshold</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold">CodeGuruSeverityThreshold</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.npmRegistry">npmRegistry</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig">NPMRegistryConfig</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.resourceProviders">resourceProviders</a></code> | <code>{[ key: string ]: <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>}</code> | Named resource providers to leverage for cluster resources. |

---

##### `applicationName`<sup>Required</sup> <a name="applicationName" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.applicationName"></a>

```typescript
public readonly applicationName: string;
```

- *Type:* string

---

##### `applicationQualifier`<sup>Required</sup> <a name="applicationQualifier" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.applicationQualifier"></a>

```typescript
public readonly applicationQualifier: string;
```

- *Type:* string

---

##### `codeBuildEnvSettings`<sup>Required</sup> <a name="codeBuildEnvSettings" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.codeBuildEnvSettings"></a>

```typescript
public readonly codeBuildEnvSettings: BuildEnvironment;
```

- *Type:* aws-cdk-lib.aws_codebuild.BuildEnvironment

---

##### `deploymentDefinition`<sup>Required</sup> <a name="deploymentDefinition" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.deploymentDefinition"></a>

```typescript
public readonly deploymentDefinition: {[ key: string ]: DeploymentDefinition};
```

- *Type:* {[ key: string ]: <a href="#@cdklabs/cdk-cicd-wrapper.DeploymentDefinition">DeploymentDefinition</a>}

---

##### `logRetentionInDays`<sup>Required</sup> <a name="logRetentionInDays" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.logRetentionInDays"></a>

```typescript
public readonly logRetentionInDays: string;
```

- *Type:* string

---

##### `phases`<sup>Required</sup> <a name="phases" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.phases"></a>

```typescript
public readonly phases: IPipelinePhases;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IPipelinePhases">IPipelinePhases</a>

---

##### `primaryOutputDirectory`<sup>Required</sup> <a name="primaryOutputDirectory" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.primaryOutputDirectory"></a>

```typescript
public readonly primaryOutputDirectory: string;
```

- *Type:* string

---

##### `codeGuruScanThreshold`<sup>Optional</sup> <a name="codeGuruScanThreshold" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.codeGuruScanThreshold"></a>

```typescript
public readonly codeGuruScanThreshold: CodeGuruSeverityThreshold;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold">CodeGuruSeverityThreshold</a>

---

##### `npmRegistry`<sup>Optional</sup> <a name="npmRegistry" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.npmRegistry"></a>

```typescript
public readonly npmRegistry: NPMRegistryConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig">NPMRegistryConfig</a>

---

##### `resourceProviders`<sup>Required</sup> <a name="resourceProviders" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps.property.resourceProviders"></a>

```typescript
public readonly resourceProviders: {[ key: string ]: IResourceProvider};
```

- *Type:* {[ key: string ]: <a href="#@cdklabs/cdk-cicd-wrapper.IResourceProvider">IResourceProvider</a>}

Named resource providers to leverage for cluster resources.

The resource can represent Vpc, Hosting Zones or other resources, see {@link spi.ResourceType }.
VPC for the cluster can be registered under the name of 'vpc' or as a single provider of type

---

### IVanillaPipelineConfig <a name="IVanillaPipelineConfig" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineBlueprintProps">IVanillaPipelineBlueprintProps</a>, <a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig">IVanillaPipelineConfig</a>


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.applicationName">applicationName</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.applicationQualifier">applicationQualifier</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.codeBuildEnvSettings">codeBuildEnvSettings</a></code> | <code>aws-cdk-lib.aws_codebuild.BuildEnvironment</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.deploymentDefinition">deploymentDefinition</a></code> | <code>{[ key: string ]: <a href="#@cdklabs/cdk-cicd-wrapper.DeploymentDefinition">DeploymentDefinition</a>}</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.logRetentionInDays">logRetentionInDays</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.phases">phases</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IPipelinePhases">IPipelinePhases</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.primaryOutputDirectory">primaryOutputDirectory</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.codeGuruScanThreshold">codeGuruScanThreshold</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold">CodeGuruSeverityThreshold</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.npmRegistry">npmRegistry</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig">NPMRegistryConfig</a></code> | *No description.* |

---

##### `applicationName`<sup>Required</sup> <a name="applicationName" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.applicationName"></a>

```typescript
public readonly applicationName: string;
```

- *Type:* string

---

##### `applicationQualifier`<sup>Required</sup> <a name="applicationQualifier" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.applicationQualifier"></a>

```typescript
public readonly applicationQualifier: string;
```

- *Type:* string

---

##### `codeBuildEnvSettings`<sup>Required</sup> <a name="codeBuildEnvSettings" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.codeBuildEnvSettings"></a>

```typescript
public readonly codeBuildEnvSettings: BuildEnvironment;
```

- *Type:* aws-cdk-lib.aws_codebuild.BuildEnvironment

---

##### `deploymentDefinition`<sup>Required</sup> <a name="deploymentDefinition" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.deploymentDefinition"></a>

```typescript
public readonly deploymentDefinition: {[ key: string ]: DeploymentDefinition};
```

- *Type:* {[ key: string ]: <a href="#@cdklabs/cdk-cicd-wrapper.DeploymentDefinition">DeploymentDefinition</a>}

---

##### `logRetentionInDays`<sup>Required</sup> <a name="logRetentionInDays" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.logRetentionInDays"></a>

```typescript
public readonly logRetentionInDays: string;
```

- *Type:* string

---

##### `phases`<sup>Required</sup> <a name="phases" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.phases"></a>

```typescript
public readonly phases: IPipelinePhases;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IPipelinePhases">IPipelinePhases</a>

---

##### `primaryOutputDirectory`<sup>Required</sup> <a name="primaryOutputDirectory" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.primaryOutputDirectory"></a>

```typescript
public readonly primaryOutputDirectory: string;
```

- *Type:* string

---

##### `codeGuruScanThreshold`<sup>Optional</sup> <a name="codeGuruScanThreshold" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.codeGuruScanThreshold"></a>

```typescript
public readonly codeGuruScanThreshold: CodeGuruSeverityThreshold;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold">CodeGuruSeverityThreshold</a>

---

##### `npmRegistry`<sup>Optional</sup> <a name="npmRegistry" id="@cdklabs/cdk-cicd-wrapper.IVanillaPipelineConfig.property.npmRegistry"></a>

```typescript
public readonly npmRegistry: NPMRegistryConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.NPMRegistryConfig">NPMRegistryConfig</a>

---

### IVpcConfig <a name="IVpcConfig" id="@cdklabs/cdk-cicd-wrapper.IVpcConfig"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfig">IVpcConfig</a>


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfig.property.type">type</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfig.property.vpc">vpc</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfigNewVpc">IVpcConfigNewVpc</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfig.property.vpcFromLookUp">vpcFromLookUp</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfigFromLookUp">IVpcConfigFromLookUp</a></code> | *No description.* |

---

##### `type`<sup>Required</sup> <a name="type" id="@cdklabs/cdk-cicd-wrapper.IVpcConfig.property.type"></a>

```typescript
public readonly type: string;
```

- *Type:* string

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cdklabs/cdk-cicd-wrapper.IVpcConfig.property.vpc"></a>

```typescript
public readonly vpc: IVpcConfigNewVpc;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfigNewVpc">IVpcConfigNewVpc</a>

---

##### `vpcFromLookUp`<sup>Optional</sup> <a name="vpcFromLookUp" id="@cdklabs/cdk-cicd-wrapper.IVpcConfig.property.vpcFromLookUp"></a>

```typescript
public readonly vpcFromLookUp: IVpcConfigFromLookUp;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfigFromLookUp">IVpcConfigFromLookUp</a>

---

### IVpcConfigFromLookUp <a name="IVpcConfigFromLookUp" id="@cdklabs/cdk-cicd-wrapper.IVpcConfigFromLookUp"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfigFromLookUp">IVpcConfigFromLookUp</a>

VPC Configuration for VPC id lookup.


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfigFromLookUp.property.vpcId">vpcId</a></code> | <code>string</code> | VPC id to lookup. |

---

##### `vpcId`<sup>Required</sup> <a name="vpcId" id="@cdklabs/cdk-cicd-wrapper.IVpcConfigFromLookUp.property.vpcId"></a>

```typescript
public readonly vpcId: string;
```

- *Type:* string

VPC id to lookup.

---

### IVpcConfigNewVpc <a name="IVpcConfigNewVpc" id="@cdklabs/cdk-cicd-wrapper.IVpcConfigNewVpc"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfigNewVpc">IVpcConfigNewVpc</a>

VPC Configuration for new VPC.


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfigNewVpc.property.cidrBlock">cidrBlock</a></code> | <code>string</code> | CIDR block for the VPC. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfigNewVpc.property.maxAzs">maxAzs</a></code> | <code>number</code> | Max AZs. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConfigNewVpc.property.subnetCidrMask">subnetCidrMask</a></code> | <code>number</code> | Subnets CIDR masks. |

---

##### `cidrBlock`<sup>Required</sup> <a name="cidrBlock" id="@cdklabs/cdk-cicd-wrapper.IVpcConfigNewVpc.property.cidrBlock"></a>

```typescript
public readonly cidrBlock: string;
```

- *Type:* string

CIDR block for the VPC.

default is: 172.31.0.0/20

---

##### `maxAzs`<sup>Required</sup> <a name="maxAzs" id="@cdklabs/cdk-cicd-wrapper.IVpcConfigNewVpc.property.maxAzs"></a>

```typescript
public readonly maxAzs: number;
```

- *Type:* number

Max AZs.

default is: 2

---

##### `subnetCidrMask`<sup>Required</sup> <a name="subnetCidrMask" id="@cdklabs/cdk-cicd-wrapper.IVpcConfigNewVpc.property.subnetCidrMask"></a>

```typescript
public readonly subnetCidrMask: number;
```

- *Type:* number

Subnets CIDR masks.

default is: 24

---

### IVpcConstruct <a name="IVpcConstruct" id="@cdklabs/cdk-cicd-wrapper.IVpcConstruct"></a>

- *Extends:* constructs.IConstruct

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IVpcConstruct">IVpcConstruct</a>

VPC construct that provides the VPC and HTTP proxy settings.


#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConstruct.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IVpcConstruct.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.IVpcConstruct.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cdklabs/cdk-cicd-wrapper.IVpcConstruct.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc

---

## Enums <a name="Enums" id="Enums"></a>

### CodeGuruSeverityThreshold <a name="CodeGuruSeverityThreshold" id="@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold"></a>

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold.INFO">INFO</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold.LOW">LOW</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold.MEDIUM">MEDIUM</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold.HIGH">HIGH</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold.CRITICAL">CRITICAL</a></code> | *No description.* |

---

##### `INFO` <a name="INFO" id="@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold.INFO"></a>

---


##### `LOW` <a name="LOW" id="@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold.LOW"></a>

---


##### `MEDIUM` <a name="MEDIUM" id="@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold.MEDIUM"></a>

---


##### `HIGH` <a name="HIGH" id="@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold.HIGH"></a>

---


##### `CRITICAL` <a name="CRITICAL" id="@cdklabs/cdk-cicd-wrapper.CodeGuruSeverityThreshold.CRITICAL"></a>

---


### GlobalResources <a name="GlobalResources" id="@cdklabs/cdk-cicd-wrapper.GlobalResources"></a>

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GlobalResources.REPOSITORY">REPOSITORY</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GlobalResources.VPC">VPC</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GlobalResources.PROXY">PROXY</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GlobalResources.ENCRYPTION">ENCRYPTION</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GlobalResources.PARAMETER_STORE">PARAMETER_STORE</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GlobalResources.STAGE_PROVIDER">STAGE_PROVIDER</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GlobalResources.CODEBUILD_FACTORY">CODEBUILD_FACTORY</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GlobalResources.COMPLIANCE_BUCKET">COMPLIANCE_BUCKET</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GlobalResources.PIPELINE">PIPELINE</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GlobalResources.PHASE">PHASE</a></code> | *No description.* |

---

##### `REPOSITORY` <a name="REPOSITORY" id="@cdklabs/cdk-cicd-wrapper.GlobalResources.REPOSITORY"></a>

---


##### `VPC` <a name="VPC" id="@cdklabs/cdk-cicd-wrapper.GlobalResources.VPC"></a>

---


##### `PROXY` <a name="PROXY" id="@cdklabs/cdk-cicd-wrapper.GlobalResources.PROXY"></a>

---


##### `ENCRYPTION` <a name="ENCRYPTION" id="@cdklabs/cdk-cicd-wrapper.GlobalResources.ENCRYPTION"></a>

---


##### `PARAMETER_STORE` <a name="PARAMETER_STORE" id="@cdklabs/cdk-cicd-wrapper.GlobalResources.PARAMETER_STORE"></a>

---


##### `STAGE_PROVIDER` <a name="STAGE_PROVIDER" id="@cdklabs/cdk-cicd-wrapper.GlobalResources.STAGE_PROVIDER"></a>

---


##### `CODEBUILD_FACTORY` <a name="CODEBUILD_FACTORY" id="@cdklabs/cdk-cicd-wrapper.GlobalResources.CODEBUILD_FACTORY"></a>

---


##### `COMPLIANCE_BUCKET` <a name="COMPLIANCE_BUCKET" id="@cdklabs/cdk-cicd-wrapper.GlobalResources.COMPLIANCE_BUCKET"></a>

---


##### `PIPELINE` <a name="PIPELINE" id="@cdklabs/cdk-cicd-wrapper.GlobalResources.PIPELINE"></a>

---


##### `PHASE` <a name="PHASE" id="@cdklabs/cdk-cicd-wrapper.GlobalResources.PHASE"></a>

---


### PipelinePhases <a name="PipelinePhases" id="@cdklabs/cdk-cicd-wrapper.PipelinePhases"></a>

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelinePhases.INITIALIZE">INITIALIZE</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelinePhases.PRE_BUILD">PRE_BUILD</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelinePhases.BUILD">BUILD</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelinePhases.TESTING">TESTING</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelinePhases.PRE_DEPLOY">PRE_DEPLOY</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelinePhases.POST_DEPLOY">POST_DEPLOY</a></code> | *No description.* |

---

##### `INITIALIZE` <a name="INITIALIZE" id="@cdklabs/cdk-cicd-wrapper.PipelinePhases.INITIALIZE"></a>

---


##### `PRE_BUILD` <a name="PRE_BUILD" id="@cdklabs/cdk-cicd-wrapper.PipelinePhases.PRE_BUILD"></a>

---


##### `BUILD` <a name="BUILD" id="@cdklabs/cdk-cicd-wrapper.PipelinePhases.BUILD"></a>

---


##### `TESTING` <a name="TESTING" id="@cdklabs/cdk-cicd-wrapper.PipelinePhases.TESTING"></a>

---


##### `PRE_DEPLOY` <a name="PRE_DEPLOY" id="@cdklabs/cdk-cicd-wrapper.PipelinePhases.PRE_DEPLOY"></a>

---


##### `POST_DEPLOY` <a name="POST_DEPLOY" id="@cdklabs/cdk-cicd-wrapper.PipelinePhases.POST_DEPLOY"></a>

---


### Scope <a name="Scope" id="@cdklabs/cdk-cicd-wrapper.Scope"></a>

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Scope.GLOBAL">GLOBAL</a></code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Scope.PER_STAGE">PER_STAGE</a></code> | *No description.* |

---

##### `GLOBAL` <a name="GLOBAL" id="@cdklabs/cdk-cicd-wrapper.Scope.GLOBAL"></a>

---


##### `PER_STAGE` <a name="PER_STAGE" id="@cdklabs/cdk-cicd-wrapper.Scope.PER_STAGE"></a>

---

