# API Reference <a name="API Reference" id="api-reference"></a>

## Constructs <a name="Constructs" id="Constructs"></a>

### CdkPipelinesEngine <a name="CdkPipelinesEngine" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine"></a>

A CDK Pipelines pipeline rendered from an Autopilot config + a stage factory.

Reproduces the Blueprint shape:
Source -> Synth (self-mutating) -> Assets -> one wave per stage (with a pre-approval when the stage is
gated). Cross-account keys are on (Blueprint default) so multi-account stages work.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.Initializer"></a>

```typescript
import { CdkPipelinesEngine } from '@cdklabs/cdk-cicd-wrapper'

new CdkPipelinesEngine(scope: Construct, id: string, props: CdkPipelinesEngineProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngineProps">CdkPipelinesEngineProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngineProps">CdkPipelinesEngineProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.with">with</a></code> | Applies one or more mixins to this construct. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `with` <a name="with" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.with"></a>

```typescript
public with(mixins: ...IMixin[]): IConstruct
```

Applies one or more mixins to this construct.

Mixins are applied in order. The list of constructs is captured at the
start of the call, so constructs added by a mixin will not be visited.
Use multiple `with()` calls if subsequent mixins should apply to added
constructs.

###### `mixins`<sup>Required</sup> <a name="mixins" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.with.parameter.mixins"></a>

- *Type:* ...constructs.IMixin[]

The mixins to apply.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.isConstruct"></a>

```typescript
import { CdkPipelinesEngine } from '@cdklabs/cdk-cicd-wrapper'

CdkPipelinesEngine.isConstruct(x: any)
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

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.property.pipeline">pipeline</a></code> | <code>aws-cdk-lib.pipelines.CodePipeline</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `pipeline`<sup>Required</sup> <a name="pipeline" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngine.property.pipeline"></a>

```typescript
public readonly pipeline: CodePipeline;
```

- *Type:* aws-cdk-lib.pipelines.CodePipeline

---


### DeploymentPipeline <a name="DeploymentPipeline" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipeline"></a>

Renders the CD CodePipeline into `scope` (a Stack): Source (the config repo) -> a "Deploy" stage with one privileged-CodeBuild action per ungated target (parallel), then a "DeployGated" stage with the gated targets, each behind its own manual approval.

Each action runs `cdk-cicd deploy --from-image --target
<stage>` -- pulling that target's own image version, read from deploy.config at run time. The CLI is
installed from the source repo's `package.json` (`npm ci`), so the config repo carries no CDK code.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.Initializer"></a>

```typescript
import { DeploymentPipeline } from '@cdklabs/cdk-cicd-wrapper'

new DeploymentPipeline(scope: Construct, id: string, props: DeploymentPipelineProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineProps">DeploymentPipelineProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineProps">DeploymentPipelineProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.with">with</a></code> | Applies one or more mixins to this construct. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `with` <a name="with" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.with"></a>

```typescript
public with(mixins: ...IMixin[]): IConstruct
```

Applies one or more mixins to this construct.

Mixins are applied in order. The list of constructs is captured at the
start of the call, so constructs added by a mixin will not be visited.
Use multiple `with()` calls if subsequent mixins should apply to added
constructs.

###### `mixins`<sup>Required</sup> <a name="mixins" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.with.parameter.mixins"></a>

- *Type:* ...constructs.IMixin[]

The mixins to apply.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.isConstruct"></a>

```typescript
import { DeploymentPipeline } from '@cdklabs/cdk-cicd-wrapper'

DeploymentPipeline.isConstruct(x: any)
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

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.property.pipeline">pipeline</a></code> | <code>aws-cdk-lib.aws_codepipeline.Pipeline</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `pipeline`<sup>Required</sup> <a name="pipeline" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipeline.property.pipeline"></a>

```typescript
public readonly pipeline: Pipeline;
```

- *Type:* aws-cdk-lib.aws_codepipeline.Pipeline

---


### DeploymentPipelineApp <a name="DeploymentPipelineApp" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp"></a>

A CDK app containing exactly one stack: the CD pipeline.

Its environment comes from the ambient
credentials (the account/region `deploy-ci` is run against), matching PipelineApp -- one place to say
"which account", the credentials in use.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.Initializer"></a>

```typescript
import { DeploymentPipelineApp } from '@cdklabs/cdk-cicd-wrapper'

new DeploymentPipelineApp(props: DeploymentPipelineAppProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineAppProps">DeploymentPipelineAppProps</a></code> | *No description.* |

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineAppProps">DeploymentPipelineAppProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.with">with</a></code> | Applies one or more mixins to this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.synth">synth</a></code> | Synthesize this stage into a cloud assembly. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `with` <a name="with" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.with"></a>

```typescript
public with(mixins: ...IMixin[]): IConstruct
```

Applies one or more mixins to this construct.

Mixins are applied in order. The list of constructs is captured at the
start of the call, so constructs added by a mixin will not be visited.
Use multiple `with()` calls if subsequent mixins should apply to added
constructs.

###### `mixins`<sup>Required</sup> <a name="mixins" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.with.parameter.mixins"></a>

- *Type:* ...constructs.IMixin[]

The mixins to apply.

---

##### `synth` <a name="synth" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.synth"></a>

```typescript
public synth(options?: StageSynthesisOptions): CloudAssembly
```

Synthesize this stage into a cloud assembly.

Once an assembly has been synthesized, it cannot be modified. Subsequent
calls will return the same assembly.

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.synth.parameter.options"></a>

- *Type:* aws-cdk-lib.StageSynthesisOptions

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.isStage">isStage</a></code> | Test whether the given construct is a stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.of">of</a></code> | Return the stage this construct is contained with, if available. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.isApp">isApp</a></code> | Checks if an object is an instance of the `App` class. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.isConstruct"></a>

```typescript
import { DeploymentPipelineApp } from '@cdklabs/cdk-cicd-wrapper'

DeploymentPipelineApp.isConstruct(x: any)
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

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `isStage` <a name="isStage" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.isStage"></a>

```typescript
import { DeploymentPipelineApp } from '@cdklabs/cdk-cicd-wrapper'

DeploymentPipelineApp.isStage(x: any)
```

Test whether the given construct is a stage.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.isStage.parameter.x"></a>

- *Type:* any

---

##### `of` <a name="of" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.of"></a>

```typescript
import { DeploymentPipelineApp } from '@cdklabs/cdk-cicd-wrapper'

DeploymentPipelineApp.of(construct: IConstruct)
```

Return the stage this construct is contained with, if available.

If called
on a nested stage, returns its parent.

###### `construct`<sup>Required</sup> <a name="construct" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.of.parameter.construct"></a>

- *Type:* constructs.IConstruct

---

##### `isApp` <a name="isApp" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.isApp"></a>

```typescript
import { DeploymentPipelineApp } from '@cdklabs/cdk-cicd-wrapper'

DeploymentPipelineApp.isApp(obj: any)
```

Checks if an object is an instance of the `App` class.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.isApp.parameter.obj"></a>

- *Type:* any

The object to evaluate.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.artifactId">artifactId</a></code> | <code>string</code> | Artifact ID of the assembly if it is a nested stage. The root stage (app) will return an empty string. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.assetOutdir">assetOutdir</a></code> | <code>string</code> | The cloud assembly asset output directory. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.outdir">outdir</a></code> | <code>string</code> | The cloud assembly output directory. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.policyValidationBeta1">policyValidationBeta1</a></code> | <code>aws-cdk-lib.IPolicyValidationPluginBeta1[]</code> | Validation plugins to run during synthesis. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.stageName">stageName</a></code> | <code>string</code> | The name of the stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.account">account</a></code> | <code>string</code> | The default account for all resources defined within this stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.parentStage">parentStage</a></code> | <code>aws-cdk-lib.Stage</code> | The parent stage or `undefined` if this is the app. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.region">region</a></code> | <code>string</code> | The default region for all resources defined within this stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.pipelineStack">pipelineStack</a></code> | <code>aws-cdk-lib.Stack</code> | The stack holding the CD pipeline. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `artifactId`<sup>Required</sup> <a name="artifactId" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.artifactId"></a>

```typescript
public readonly artifactId: string;
```

- *Type:* string

Artifact ID of the assembly if it is a nested stage. The root stage (app) will return an empty string.

Derived from the construct path.

---

##### `assetOutdir`<sup>Required</sup> <a name="assetOutdir" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.assetOutdir"></a>

```typescript
public readonly assetOutdir: string;
```

- *Type:* string

The cloud assembly asset output directory.

---

##### `outdir`<sup>Required</sup> <a name="outdir" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.outdir"></a>

```typescript
public readonly outdir: string;
```

- *Type:* string

The cloud assembly output directory.

---

##### `policyValidationBeta1`<sup>Required</sup> <a name="policyValidationBeta1" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.policyValidationBeta1"></a>

```typescript
public readonly policyValidationBeta1: IPolicyValidationPluginBeta1[];
```

- *Type:* aws-cdk-lib.IPolicyValidationPluginBeta1[]
- *Default:* no validation plugins are used

Validation plugins to run during synthesis.

If any plugin reports any violation,
synthesis will be interrupted and the report displayed to the user.

---

##### `stageName`<sup>Required</sup> <a name="stageName" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.stageName"></a>

```typescript
public readonly stageName: string;
```

- *Type:* string

The name of the stage.

Based on names of the parent stages separated by
hypens.

---

##### `account`<sup>Optional</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

The default account for all resources defined within this stage.

---

##### `parentStage`<sup>Optional</sup> <a name="parentStage" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.parentStage"></a>

```typescript
public readonly parentStage: Stage;
```

- *Type:* aws-cdk-lib.Stage

The parent stage or `undefined` if this is the app.

*

---

##### `region`<sup>Optional</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

The default region for all resources defined within this stage.

---

##### `pipelineStack`<sup>Required</sup> <a name="pipelineStack" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineApp.property.pipelineStack"></a>

```typescript
public readonly pipelineStack: Stack;
```

- *Type:* aws-cdk-lib.Stack

The stack holding the CD pipeline.

Exposed so a test or an opt-in `bin/` can reach it.

---


### GitHubActionsEngine <a name="GitHubActionsEngine" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine"></a>

A GitHub Actions workflow rendered from an Autopilot config + a stage factory.

Reproduces the Blueprint shape: a
`GitHubActionRole` the workflow assumes over OIDC, a Synth job, and one job (with a GitHub Environment,
so an environment protection rule set up on GitHub's side gates it) per deployment stage. Manual-approval
config is NOT translated into a CDK step here -- as in Blueprint, GitHub Environments are the gate; every stage
gets its own environment regardless of `manualApproval`, and gating is configured in the GitHub UI.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.Initializer"></a>

```typescript
import { GitHubActionsEngine } from '@cdklabs/cdk-cicd-wrapper'

new GitHubActionsEngine(scope: Construct, id: string, props: GitHubActionsEngineProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngineProps">GitHubActionsEngineProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngineProps">GitHubActionsEngineProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.with">with</a></code> | Applies one or more mixins to this construct. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `with` <a name="with" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.with"></a>

```typescript
public with(mixins: ...IMixin[]): IConstruct
```

Applies one or more mixins to this construct.

Mixins are applied in order. The list of constructs is captured at the
start of the call, so constructs added by a mixin will not be visited.
Use multiple `with()` calls if subsequent mixins should apply to added
constructs.

###### `mixins`<sup>Required</sup> <a name="mixins" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.with.parameter.mixins"></a>

- *Type:* ...constructs.IMixin[]

The mixins to apply.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.isConstruct"></a>

```typescript
import { GitHubActionsEngine } from '@cdklabs/cdk-cicd-wrapper'

GitHubActionsEngine.isConstruct(x: any)
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

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.property.gitHubActionRole">gitHubActionRole</a></code> | <code>cdk-pipelines-github.GitHubActionRole</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.property.pipeline">pipeline</a></code> | <code>cdk-pipelines-github.GitHubWorkflow</code> | *No description.* |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `gitHubActionRole`<sup>Required</sup> <a name="gitHubActionRole" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.property.gitHubActionRole"></a>

```typescript
public readonly gitHubActionRole: GitHubActionRole;
```

- *Type:* cdk-pipelines-github.GitHubActionRole

---

##### `pipeline`<sup>Required</sup> <a name="pipeline" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngine.property.pipeline"></a>

```typescript
public readonly pipeline: GitHubWorkflow;
```

- *Type:* cdk-pipelines-github.GitHubWorkflow

---


### PipelineApp <a name="PipelineApp" id="@cdklabs/cdk-cicd-wrapper.PipelineApp"></a>

A CDK app containing exactly one stack: the pipeline.

The stack's environment comes from the
ambient credentials (`CDK_DEFAULT_ACCOUNT`/`CDK_DEFAULT_REGION`, which the CDK CLI resolves before
running the app), so the pipeline lands in whichever account `deploy-ci` is run against -- the
hub/RES account. There is deliberately no config field for it: a second place to say "which
account" is a second place for it to disagree with the credentials actually in use.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.Initializer"></a>

```typescript
import { PipelineApp } from '@cdklabs/cdk-cicd-wrapper'

new PipelineApp(props: PipelineAppProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineAppProps">PipelineAppProps</a></code> | *No description.* |

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.PipelineAppProps">PipelineAppProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.with">with</a></code> | Applies one or more mixins to this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.synth">synth</a></code> | Synthesize this stage into a cloud assembly. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `with` <a name="with" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.with"></a>

```typescript
public with(mixins: ...IMixin[]): IConstruct
```

Applies one or more mixins to this construct.

Mixins are applied in order. The list of constructs is captured at the
start of the call, so constructs added by a mixin will not be visited.
Use multiple `with()` calls if subsequent mixins should apply to added
constructs.

###### `mixins`<sup>Required</sup> <a name="mixins" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.with.parameter.mixins"></a>

- *Type:* ...constructs.IMixin[]

The mixins to apply.

---

##### `synth` <a name="synth" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.synth"></a>

```typescript
public synth(options?: StageSynthesisOptions): CloudAssembly
```

Synthesize this stage into a cloud assembly.

Once an assembly has been synthesized, it cannot be modified. Subsequent
calls will return the same assembly.

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.synth.parameter.options"></a>

- *Type:* aws-cdk-lib.StageSynthesisOptions

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.isStage">isStage</a></code> | Test whether the given construct is a stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.of">of</a></code> | Return the stage this construct is contained with, if available. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.isApp">isApp</a></code> | Checks if an object is an instance of the `App` class. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.isConstruct"></a>

```typescript
import { PipelineApp } from '@cdklabs/cdk-cicd-wrapper'

PipelineApp.isConstruct(x: any)
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

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

##### `isStage` <a name="isStage" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.isStage"></a>

```typescript
import { PipelineApp } from '@cdklabs/cdk-cicd-wrapper'

PipelineApp.isStage(x: any)
```

Test whether the given construct is a stage.

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.isStage.parameter.x"></a>

- *Type:* any

---

##### `of` <a name="of" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.of"></a>

```typescript
import { PipelineApp } from '@cdklabs/cdk-cicd-wrapper'

PipelineApp.of(construct: IConstruct)
```

Return the stage this construct is contained with, if available.

If called
on a nested stage, returns its parent.

###### `construct`<sup>Required</sup> <a name="construct" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.of.parameter.construct"></a>

- *Type:* constructs.IConstruct

---

##### `isApp` <a name="isApp" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.isApp"></a>

```typescript
import { PipelineApp } from '@cdklabs/cdk-cicd-wrapper'

PipelineApp.isApp(obj: any)
```

Checks if an object is an instance of the `App` class.

###### `obj`<sup>Required</sup> <a name="obj" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.isApp.parameter.obj"></a>

- *Type:* any

The object to evaluate.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.property.artifactId">artifactId</a></code> | <code>string</code> | Artifact ID of the assembly if it is a nested stage. The root stage (app) will return an empty string. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.property.assetOutdir">assetOutdir</a></code> | <code>string</code> | The cloud assembly asset output directory. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.property.outdir">outdir</a></code> | <code>string</code> | The cloud assembly output directory. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.property.policyValidationBeta1">policyValidationBeta1</a></code> | <code>aws-cdk-lib.IPolicyValidationPluginBeta1[]</code> | Validation plugins to run during synthesis. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.property.stageName">stageName</a></code> | <code>string</code> | The name of the stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.property.account">account</a></code> | <code>string</code> | The default account for all resources defined within this stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.property.parentStage">parentStage</a></code> | <code>aws-cdk-lib.Stage</code> | The parent stage or `undefined` if this is the app. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.property.region">region</a></code> | <code>string</code> | The default region for all resources defined within this stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineApp.property.pipelineStack">pipelineStack</a></code> | <code>aws-cdk-lib.Stack</code> | The stack holding the pipeline. |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `artifactId`<sup>Required</sup> <a name="artifactId" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.property.artifactId"></a>

```typescript
public readonly artifactId: string;
```

- *Type:* string

Artifact ID of the assembly if it is a nested stage. The root stage (app) will return an empty string.

Derived from the construct path.

---

##### `assetOutdir`<sup>Required</sup> <a name="assetOutdir" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.property.assetOutdir"></a>

```typescript
public readonly assetOutdir: string;
```

- *Type:* string

The cloud assembly asset output directory.

---

##### `outdir`<sup>Required</sup> <a name="outdir" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.property.outdir"></a>

```typescript
public readonly outdir: string;
```

- *Type:* string

The cloud assembly output directory.

---

##### `policyValidationBeta1`<sup>Required</sup> <a name="policyValidationBeta1" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.property.policyValidationBeta1"></a>

```typescript
public readonly policyValidationBeta1: IPolicyValidationPluginBeta1[];
```

- *Type:* aws-cdk-lib.IPolicyValidationPluginBeta1[]
- *Default:* no validation plugins are used

Validation plugins to run during synthesis.

If any plugin reports any violation,
synthesis will be interrupted and the report displayed to the user.

---

##### `stageName`<sup>Required</sup> <a name="stageName" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.property.stageName"></a>

```typescript
public readonly stageName: string;
```

- *Type:* string

The name of the stage.

Based on names of the parent stages separated by
hypens.

---

##### `account`<sup>Optional</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

The default account for all resources defined within this stage.

---

##### `parentStage`<sup>Optional</sup> <a name="parentStage" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.property.parentStage"></a>

```typescript
public readonly parentStage: Stage;
```

- *Type:* aws-cdk-lib.Stage

The parent stage or `undefined` if this is the app.

*

---

##### `region`<sup>Optional</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

The default region for all resources defined within this stage.

---

##### `pipelineStack`<sup>Required</sup> <a name="pipelineStack" id="@cdklabs/cdk-cicd-wrapper.PipelineApp.property.pipelineStack"></a>

```typescript
public readonly pipelineStack: Stack;
```

- *Type:* aws-cdk-lib.Stack

The stack holding the pipeline.

Exposed so a test or an opt-in `bin/` can reach it.

---


### SupportResources <a name="SupportResources" id="@cdklabs/cdk-cicd-wrapper.SupportResources"></a>

Lazily provisioned support resources for a pipeline.

Reading a property creates the resource on
first access and returns the same instance afterwards; a `SupportResources` nobody reads adds
nothing to the template.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.SupportResources.Initializer"></a>

```typescript
import { SupportResources } from '@cdklabs/cdk-cicd-wrapper'

new SupportResources(scope: Construct, id: string, props?: SupportResourcesProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResources.Initializer.parameter.scope">scope</a></code> | <code>constructs.Construct</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResources.Initializer.parameter.id">id</a></code> | <code>string</code> | *No description.* |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResources.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResourcesProps">SupportResourcesProps</a></code> | *No description.* |

---

##### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.SupportResources.Initializer.parameter.scope"></a>

- *Type:* constructs.Construct

---

##### `id`<sup>Required</sup> <a name="id" id="@cdklabs/cdk-cicd-wrapper.SupportResources.Initializer.parameter.id"></a>

- *Type:* string

---

##### `props`<sup>Optional</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.SupportResources.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.SupportResourcesProps">SupportResourcesProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResources.toString">toString</a></code> | Returns a string representation of this construct. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResources.with">with</a></code> | Applies one or more mixins to this construct. |

---

##### `toString` <a name="toString" id="@cdklabs/cdk-cicd-wrapper.SupportResources.toString"></a>

```typescript
public toString(): string
```

Returns a string representation of this construct.

##### `with` <a name="with" id="@cdklabs/cdk-cicd-wrapper.SupportResources.with"></a>

```typescript
public with(mixins: ...IMixin[]): IConstruct
```

Applies one or more mixins to this construct.

Mixins are applied in order. The list of constructs is captured at the
start of the call, so constructs added by a mixin will not be visited.
Use multiple `with()` calls if subsequent mixins should apply to added
constructs.

###### `mixins`<sup>Required</sup> <a name="mixins" id="@cdklabs/cdk-cicd-wrapper.SupportResources.with.parameter.mixins"></a>

- *Type:* ...constructs.IMixin[]

The mixins to apply.

---

#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResources.isConstruct">isConstruct</a></code> | Checks if `x` is a construct. |

---

##### `isConstruct` <a name="isConstruct" id="@cdklabs/cdk-cicd-wrapper.SupportResources.isConstruct"></a>

```typescript
import { SupportResources } from '@cdklabs/cdk-cicd-wrapper'

SupportResources.isConstruct(x: any)
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

###### `x`<sup>Required</sup> <a name="x" id="@cdklabs/cdk-cicd-wrapper.SupportResources.isConstruct.parameter.x"></a>

- *Type:* any

Any object.

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResources.property.node">node</a></code> | <code>constructs.Node</code> | The tree node. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResources.property.artifactBucket">artifactBucket</a></code> | <code>aws-cdk-lib.aws_s3.IBucket</code> | The pipeline's artifact store, encrypted with `encryptionKey`. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResources.property.complianceLogBucket">complianceLogBucket</a></code> | <code>aws-cdk-lib.aws_s3.IBucket</code> | The compliance/access-log destination bucket (Blueprint `ComplianceBucketProvider` + `ComplianceLogBucketStack`) -- other buckets' S3 server access logs land here. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResources.property.encryptionKey">encryptionKey</a></code> | <code>aws-cdk-lib.aws_kms.IKey</code> | The customer-managed key the wrapper encrypts its own artifacts with. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResources.property.vpcNetworking">vpcNetworking</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.VpcNetworking">VpcNetworking</a></code> | VPC + security groups + subnet selection for the pipeline's own CodeBuild projects, if `vpc` was configured (Blueprint `VPCProvider`, migrated). |

---

##### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.SupportResources.property.node"></a>

```typescript
public readonly node: Node;
```

- *Type:* constructs.Node

The tree node.

---

##### `artifactBucket`<sup>Required</sup> <a name="artifactBucket" id="@cdklabs/cdk-cicd-wrapper.SupportResources.property.artifactBucket"></a>

```typescript
public readonly artifactBucket: IBucket;
```

- *Type:* aws-cdk-lib.aws_s3.IBucket

The pipeline's artifact store, encrypted with `encryptionKey`.

Created on first read.

---

##### `complianceLogBucket`<sup>Required</sup> <a name="complianceLogBucket" id="@cdklabs/cdk-cicd-wrapper.SupportResources.property.complianceLogBucket"></a>

```typescript
public readonly complianceLogBucket: IBucket;
```

- *Type:* aws-cdk-lib.aws_s3.IBucket

The compliance/access-log destination bucket (Blueprint `ComplianceBucketProvider` + `ComplianceLogBucketStack`) -- other buckets' S3 server access logs land here.

Created on first
read, same as every other property here. Requires `complianceLogBucketName`: unlike
`artifactBucket`, this bucket's name must be explicit and predictable so other buckets' logging
configuration (and, cross-region, Blueprint's name-substitution convention) can reference it.

Blueprint provisioned this bucket via a custom-resource Lambda so a redeploy could tolerate the bucket
already existing (`BucketAlreadyOwnedByYou`); Autopilot provisions it as a plain, CloudFormation-managed
`Bucket` instead -- simpler, and the "already exists" case Blueprint tolerated doesn't arise here since
this construct's stack owns the bucket for the life of the pipeline.

Folds in the TLS/SSE policy fix Blueprint's Stage-1 change (`0b7ae02`) made and Autopilot must not regress:
enforcing encryption-in-transit works with a plain `Bool` condition on `aws:SecureTransport`
(`enforceSSL`, below) because that key is always present on every request. Enforcing encryption
*at rest* does not: `s3:x-amz-server-side-encryption` is only present in the request context when
the caller actually sets the header, so a `Bool` check against `"false"` never matches a request
that omits the header entirely -- exactly the unencrypted upload this statement exists to block.
The `Null` operator below checks for the header's *absence*, which a `Bool` check cannot.

---

##### `encryptionKey`<sup>Required</sup> <a name="encryptionKey" id="@cdklabs/cdk-cicd-wrapper.SupportResources.property.encryptionKey"></a>

```typescript
public readonly encryptionKey: IKey;
```

- *Type:* aws-cdk-lib.aws_kms.IKey

The customer-managed key the wrapper encrypts its own artifacts with.

Created on first read.

---

##### `vpcNetworking`<sup>Optional</sup> <a name="vpcNetworking" id="@cdklabs/cdk-cicd-wrapper.SupportResources.property.vpcNetworking"></a>

```typescript
public readonly vpcNetworking: VpcNetworking;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.VpcNetworking">VpcNetworking</a>

VPC + security groups + subnet selection for the pipeline's own CodeBuild projects, if `vpc` was configured (Blueprint `VPCProvider`, migrated).

`undefined` when not configured. Resolved on first read,
same as every other property here -- a pipeline that never reads this creates no VPC.

---


## Structs <a name="Structs" id="Structs"></a>

### AccessLogsForBucketAspectProps <a name="AccessLogsForBucketAspectProps" id="@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspectProps"></a>

Constructor props for {@link AccessLogsForBucketAspect}.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspectProps.Initializer"></a>

```typescript
import { AccessLogsForBucketAspectProps } from '@cdklabs/cdk-cicd-wrapper'

const accessLogsForBucketAspectProps: AccessLogsForBucketAspectProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspectProps.property.complianceLogBucketName">complianceLogBucketName</a></code> | <code>string</code> | The name of the bucket every visited bucket's access logs are delivered to. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspectProps.property.mainRegion">mainRegion</a></code> | <code>string</code> | The region the compliance log bucket lives in. |

---

##### `complianceLogBucketName`<sup>Required</sup> <a name="complianceLogBucketName" id="@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspectProps.property.complianceLogBucketName"></a>

```typescript
public readonly complianceLogBucketName: string;
```

- *Type:* string

The name of the bucket every visited bucket's access logs are delivered to.

---

##### `mainRegion`<sup>Required</sup> <a name="mainRegion" id="@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspectProps.property.mainRegion"></a>

```typescript
public readonly mainRegion: string;
```

- *Type:* string

The region the compliance log bucket lives in.

When a visited bucket's stack is deployed to a
different region, `complianceLogBucketName` is rewritten by substituting `mainRegion` for that
stack's region -- same cross-region name convention as Blueprint.

---

### AppConfigOptions <a name="AppConfigOptions" id="@cdklabs/cdk-cicd-wrapper.AppConfigOptions"></a>

How to resolve the application's configuration.

Deliberately free of `NodeJS.ProcessEnv`: this struct crosses the jsii boundary into Python/Java/
.NET, so the two environment variables that actually matter are surfaced as named properties and
everything else is read from the ambient process environment.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.AppConfigOptions.Initializer"></a>

```typescript
import { AppConfigOptions } from '@cdklabs/cdk-cicd-wrapper'

const appConfigOptions: AppConfigOptions = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppConfigOptions.property.configFile">configFile</a></code> | <code>string</code> | Exact config file to read, overriding stage resolution (the `CONFIG_FILE` escape hatch). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppConfigOptions.property.schema">schema</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ConfigSchema">ConfigSchema</a></code> | What the config file must contain. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppConfigOptions.property.stage">stage</a></code> | <code>string</code> | Stage whose config file to read, overriding `CDK_STAGE`. |

---

##### `configFile`<sup>Optional</sup> <a name="configFile" id="@cdklabs/cdk-cicd-wrapper.AppConfigOptions.property.configFile"></a>

```typescript
public readonly configFile: string;
```

- *Type:* string

Exact config file to read, overriding stage resolution (the `CONFIG_FILE` escape hatch).

---

##### `schema`<sup>Optional</sup> <a name="schema" id="@cdklabs/cdk-cicd-wrapper.AppConfigOptions.property.schema"></a>

```typescript
public readonly schema: ConfigSchema;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ConfigSchema">ConfigSchema</a>

What the config file must contain.

Omitted means any shape is accepted.

---

##### `stage`<sup>Optional</sup> <a name="stage" id="@cdklabs/cdk-cicd-wrapper.AppConfigOptions.property.stage"></a>

```typescript
public readonly stage: string;
```

- *Type:* string

Stage whose config file to read, overriding `CDK_STAGE`.

Defaults to `local`.

---

### AwsEnvironment <a name="AwsEnvironment" id="@cdklabs/cdk-cicd-wrapper.AwsEnvironment"></a>

AWS account / region routing for the active stage.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.AwsEnvironment.Initializer"></a>

```typescript
import { AwsEnvironment } from '@cdklabs/cdk-cicd-wrapper'

const awsEnvironment: AwsEnvironment = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AwsEnvironment.property.accountId">accountId</a></code> | <code>string</code> | Target account id. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AwsEnvironment.property.region">region</a></code> | <code>string</code> | Target region. |

---

##### `accountId`<sup>Optional</sup> <a name="accountId" id="@cdklabs/cdk-cicd-wrapper.AwsEnvironment.property.accountId"></a>

```typescript
public readonly accountId: string;
```

- *Type:* string

Target account id.

Derived from `CDK_DEFAULT_ACCOUNT` when the config file omits it.

---

##### `region`<sup>Optional</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.AwsEnvironment.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

Target region.

Derived from `CDK_DEFAULT_REGION` (or `AWS_REGION`) when the config file omits it.

---

### BaseConfig <a name="BaseConfig" id="@cdklabs/cdk-cicd-wrapper.BaseConfig"></a>

The wrapper's opinionated base schema for an application config file.

Deliberately tiny — an
application extends it with its own per-environment shape, or ignores it entirely.

Networking is intentionally NOT part of the base schema: VPC/subnet/hosted-zone shapes are too
application-specific, so they live in the user's own schema.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.BaseConfig.Initializer"></a>

```typescript
import { BaseConfig } from '@cdklabs/cdk-cicd-wrapper'

const baseConfig: BaseConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseConfig.property.aws">aws</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.AwsEnvironment">AwsEnvironment</a></code> | Account / region routing. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseConfig.property.logRetentionInDays">logRetentionInDays</a></code> | <code>number</code> | CloudWatch Logs retention, in days, the wrapper forces on any log group that does not already set one explicitly (applied tree-wide as an Aspect by the runtime injection hook). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseConfig.property.removalPolicies">removalPolicies</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.RemovalPolicies">RemovalPolicies</a></code> | Stateful-resource retention. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseConfig.property.tags">tags</a></code> | <code>{[ key: string ]: string}</code> | Free-form cost-allocation/compliance tags. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BaseConfig.property.application">application</a></code> | <code>string</code> | Application name used for resource naming. |

---

##### `aws`<sup>Required</sup> <a name="aws" id="@cdklabs/cdk-cicd-wrapper.BaseConfig.property.aws"></a>

```typescript
public readonly aws: AwsEnvironment;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.AwsEnvironment">AwsEnvironment</a>

Account / region routing.

---

##### `logRetentionInDays`<sup>Required</sup> <a name="logRetentionInDays" id="@cdklabs/cdk-cicd-wrapper.BaseConfig.property.logRetentionInDays"></a>

```typescript
public readonly logRetentionInDays: number;
```

- *Type:* number

CloudWatch Logs retention, in days, the wrapper forces on any log group that does not already set one explicitly (applied tree-wide as an Aspect by the runtime injection hook).

Defaults to 365,
matching Blueprint's `PipelineBlueprint.logRetentionInDays`.

---

##### `removalPolicies`<sup>Required</sup> <a name="removalPolicies" id="@cdklabs/cdk-cicd-wrapper.BaseConfig.property.removalPolicies"></a>

```typescript
public readonly removalPolicies: RemovalPolicies;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.RemovalPolicies">RemovalPolicies</a>

Stateful-resource retention.

---

##### `tags`<sup>Required</sup> <a name="tags" id="@cdklabs/cdk-cicd-wrapper.BaseConfig.property.tags"></a>

```typescript
public readonly tags: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}

Free-form cost-allocation/compliance tags.

Base defaults may be added to or overridden.

---

##### `application`<sup>Optional</sup> <a name="application" id="@cdklabs/cdk-cicd-wrapper.BaseConfig.property.application"></a>

```typescript
public readonly application: string;
```

- *Type:* string

Application name used for resource naming.

---

### CdkPipelinesEngineProps <a name="CdkPipelinesEngineProps" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngineProps"></a>

Props for the CDK Pipelines (Blueprint-compatible) engine.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngineProps.Initializer"></a>

```typescript
import { CdkPipelinesEngineProps } from '@cdklabs/cdk-cicd-wrapper'

const cdkPipelinesEngineProps: CdkPipelinesEngineProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngineProps.property.config">config</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig">ResolvedCicdConfig</a></code> | The resolved pipeline configuration (`defineCICD`). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngineProps.property.stages">stages</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IStageProvider">IStageProvider</a></code> | Builds the app's stacks per stage (the Blueprint-compat opt-in — CDK Pipelines needs the stacks in-synth). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngineProps.property.pipelineName">pipelineName</a></code> | <code>string</code> | Pipeline name; |

---

##### `config`<sup>Required</sup> <a name="config" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngineProps.property.config"></a>

```typescript
public readonly config: ResolvedCicdConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig">ResolvedCicdConfig</a>

The resolved pipeline configuration (`defineCICD`).

---

##### `stages`<sup>Required</sup> <a name="stages" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngineProps.property.stages"></a>

```typescript
public readonly stages: IStageProvider;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IStageProvider">IStageProvider</a>

Builds the app's stacks per stage (the Blueprint-compat opt-in — CDK Pipelines needs the stacks in-synth).

---

##### `pipelineName`<sup>Optional</sup> <a name="pipelineName" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesEngineProps.property.pipelineName"></a>

```typescript
public readonly pipelineName: string;
```

- *Type:* string

Pipeline name;

defaults to `<application>-pipeline`.

---

### CdkPipelinesStageContext <a name="CdkPipelinesStageContext" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesStageContext"></a>

Context passed to the stage factory for one deployment stage.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesStageContext.Initializer"></a>

```typescript
import { CdkPipelinesStageContext } from '@cdklabs/cdk-cicd-wrapper'

const cdkPipelinesStageContext: CdkPipelinesStageContext = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesStageContext.property.env">env</a></code> | <code>aws-cdk-lib.Environment</code> | The stage's target environment (account + primary region). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesStageContext.property.stageName">stageName</a></code> | <code>string</code> | The stage name from the config (e.g. `DEVFRA`). |

---

##### `env`<sup>Required</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesStageContext.property.env"></a>

```typescript
public readonly env: Environment;
```

- *Type:* aws-cdk-lib.Environment

The stage's target environment (account + primary region).

---

##### `stageName`<sup>Required</sup> <a name="stageName" id="@cdklabs/cdk-cicd-wrapper.CdkPipelinesStageContext.property.stageName"></a>

```typescript
public readonly stageName: string;
```

- *Type:* string

The stage name from the config (e.g. `DEVFRA`).

---

### CiConfig <a name="CiConfig" id="@cdklabs/cdk-cicd-wrapper.CiConfig"></a>

Resolved CI configuration: the checks/build steps and which stages CI synthesizes for validation.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.CiConfig.Initializer"></a>

```typescript
import { CiConfig } from '@cdklabs/cdk-cicd-wrapper'

const ciConfig: CiConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CiConfig.property.steps">steps</a></code> | <code>{[ key: string ]: string}</code> | Named build steps as shell commands, e.g. `{ lint: 'npx cdk-cicd validate' }`. Empty means the engine applies its built-in default set. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CiConfig.property.synthStages">synthStages</a></code> | <code>string[]</code> | Which stages CI synthesizes. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CiConfig.property.image">image</a></code> | <code>string</code> | Optional CodeBuild image override. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CiConfig.property.partialBuildSpec">partialBuildSpec</a></code> | <code>aws-cdk-lib.aws_codebuild.BuildSpec</code> | Escape hatch (Blueprint `CDKPipelineProps.ciBuildSpec`, migrated): deep-merged into the CI build project's generated buildspec via `codebuild.mergeBuildSpecs`, augmenting rather than replacing the engine's own phases. Scoped the same way Blueprint scoped it -- the CI build project only, not self-update or per-stage deploy projects. |

---

##### `steps`<sup>Required</sup> <a name="steps" id="@cdklabs/cdk-cicd-wrapper.CiConfig.property.steps"></a>

```typescript
public readonly steps: {[ key: string ]: string};
```

- *Type:* {[ key: string ]: string}

Named build steps as shell commands, e.g. `{ lint: 'npx cdk-cicd validate' }`. Empty means the engine applies its built-in default set.

---

##### `synthStages`<sup>Required</sup> <a name="synthStages" id="@cdklabs/cdk-cicd-wrapper.CiConfig.property.synthStages"></a>

```typescript
public readonly synthStages: string[];
```

- *Type:* string[]

Which stages CI synthesizes.

Empty means the engine's default -- every stage under
`ASSEMBLY_PROMOTION`, one env under `DEPLOY_TIME_SYNTH`. A non-empty list names the stages
explicitly; `defineCICD`'s `'all'` shorthand resolves to the full stage list here.

---

##### `image`<sup>Optional</sup> <a name="image" id="@cdklabs/cdk-cicd-wrapper.CiConfig.property.image"></a>

```typescript
public readonly image: string;
```

- *Type:* string

Optional CodeBuild image override.

---

##### `partialBuildSpec`<sup>Optional</sup> <a name="partialBuildSpec" id="@cdklabs/cdk-cicd-wrapper.CiConfig.property.partialBuildSpec"></a>

```typescript
public readonly partialBuildSpec: BuildSpec;
```

- *Type:* aws-cdk-lib.aws_codebuild.BuildSpec

Escape hatch (Blueprint `CDKPipelineProps.ciBuildSpec`, migrated): deep-merged into the CI build project's generated buildspec via `codebuild.mergeBuildSpecs`, augmenting rather than replacing the engine's own phases. Scoped the same way Blueprint scoped it -- the CI build project only, not self-update or per-stage deploy projects.

---

### CodeArtifactConfig <a name="CodeArtifactConfig" id="@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig"></a>

A private CodeArtifact npm repository the pipeline's builds authenticate against.

When set, every
build project runs `aws codeartifact login` before `npm ci` and is granted read access to the
repository -- which is how a pipeline installs private packages (including the wrapper itself before
it is published to the public npm registry).

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig.Initializer"></a>

```typescript
import { CodeArtifactConfig } from '@cdklabs/cdk-cicd-wrapper'

const codeArtifactConfig: CodeArtifactConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig.property.domain">domain</a></code> | <code>string</code> | The CodeArtifact domain. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig.property.repository">repository</a></code> | <code>string</code> | The repository within the domain. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig.property.account">account</a></code> | <code>string</code> | Domain-owning account. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig.property.npmScope">npmScope</a></code> | <code>string</code> | npm scope to bind to the repository, e.g. `cdklabs` for `@cdklabs/*`. Omit for the default scope. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig.property.region">region</a></code> | <code>string</code> | Region the domain lives in. |

---

##### `domain`<sup>Required</sup> <a name="domain" id="@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig.property.domain"></a>

```typescript
public readonly domain: string;
```

- *Type:* string

The CodeArtifact domain.

---

##### `repository`<sup>Required</sup> <a name="repository" id="@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig.property.repository"></a>

```typescript
public readonly repository: string;
```

- *Type:* string

The repository within the domain.

---

##### `account`<sup>Optional</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

Domain-owning account.

Defaults to the pipeline's own account.

---

##### `npmScope`<sup>Optional</sup> <a name="npmScope" id="@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig.property.npmScope"></a>

```typescript
public readonly npmScope: string;
```

- *Type:* string

npm scope to bind to the repository, e.g. `cdklabs` for `@cdklabs/*`. Omit for the default scope.

---

##### `region`<sup>Optional</sup> <a name="region" id="@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig.property.region"></a>

```typescript
public readonly region: string;
```

- *Type:* string

Region the domain lives in.

Defaults to the pipeline's own region.

---

### CodePipelineEngineProps <a name="CodePipelineEngineProps" id="@cdklabs/cdk-cicd-wrapper.CodePipelineEngineProps"></a>

Options for the CodePipeline engine.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.CodePipelineEngineProps.Initializer"></a>

```typescript
import { CodePipelineEngineProps } from '@cdklabs/cdk-cicd-wrapper'

const codePipelineEngineProps: CodePipelineEngineProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodePipelineEngineProps.property.buildImage">buildImage</a></code> | <code>string</code> | CodeBuild image for the CI and deploy projects. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodePipelineEngineProps.property.removalPolicy">removalPolicy</a></code> | <code>aws-cdk-lib.RemovalPolicy</code> | Removal policy for the pipeline's own support resources (artifact bucket, encryption key). |

---

##### `buildImage`<sup>Optional</sup> <a name="buildImage" id="@cdklabs/cdk-cicd-wrapper.CodePipelineEngineProps.property.buildImage"></a>

```typescript
public readonly buildImage: string;
```

- *Type:* string

CodeBuild image for the CI and deploy projects.

Defaults to the standard Amazon Linux image.

---

##### `removalPolicy`<sup>Optional</sup> <a name="removalPolicy" id="@cdklabs/cdk-cicd-wrapper.CodePipelineEngineProps.property.removalPolicy"></a>

```typescript
public readonly removalPolicy: RemovalPolicy;
```

- *Type:* aws-cdk-lib.RemovalPolicy

Removal policy for the pipeline's own support resources (artifact bucket, encryption key).

`RETAIN` by default; a disposable pipeline sets `DESTROY` so a stack delete leaves nothing.

---

### ConditionalFieldGroup <a name="ConditionalFieldGroup" id="@cdklabs/cdk-cicd-wrapper.ConditionalFieldGroup"></a>

A group of fields that becomes required only when `when` resolves to a present value.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.ConditionalFieldGroup.Initializer"></a>

```typescript
import { ConditionalFieldGroup } from '@cdklabs/cdk-cicd-wrapper'

const conditionalFieldGroup: ConditionalFieldGroup = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ConditionalFieldGroup.property.fields">fields</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.RequiredField">RequiredField</a>[]</code> | Fields required once the group is active. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ConditionalFieldGroup.property.when">when</a></code> | <code>string</code> | Dot-path whose presence activates the group. |

---

##### `fields`<sup>Required</sup> <a name="fields" id="@cdklabs/cdk-cicd-wrapper.ConditionalFieldGroup.property.fields"></a>

```typescript
public readonly fields: RequiredField[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.RequiredField">RequiredField</a>[]

Fields required once the group is active.

---

##### `when`<sup>Required</sup> <a name="when" id="@cdklabs/cdk-cicd-wrapper.ConditionalFieldGroup.property.when"></a>

```typescript
public readonly when: string;
```

- *Type:* string

Dot-path whose presence activates the group.

---

### ConfigSchema <a name="ConfigSchema" id="@cdklabs/cdk-cicd-wrapper.ConfigSchema"></a>

Caller-supplied description of what an application's config file must contain.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.ConfigSchema.Initializer"></a>

```typescript
import { ConfigSchema } from '@cdklabs/cdk-cicd-wrapper'

const configSchema: ConfigSchema = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ConfigSchema.property.conditionalGroups">conditionalGroups</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ConditionalFieldGroup">ConditionalFieldGroup</a>[]</code> | Conditionally required fields; |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ConfigSchema.property.requiredAttributes">requiredAttributes</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.RequiredField">RequiredField</a>[]</code> | Fields whose absence is reported as `MISSING_ATTRIBUTE`. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ConfigSchema.property.requiredKeys">requiredKeys</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.RequiredField">RequiredField</a>[]</code> | Fields whose absence is reported as `MISSING_KEY`. |

---

##### `conditionalGroups`<sup>Optional</sup> <a name="conditionalGroups" id="@cdklabs/cdk-cicd-wrapper.ConfigSchema.property.conditionalGroups"></a>

```typescript
public readonly conditionalGroups: ConditionalFieldGroup[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ConditionalFieldGroup">ConditionalFieldGroup</a>[]

Conditionally required fields;

absence is reported as `MISSING_ATTRIBUTE`.

---

##### `requiredAttributes`<sup>Optional</sup> <a name="requiredAttributes" id="@cdklabs/cdk-cicd-wrapper.ConfigSchema.property.requiredAttributes"></a>

```typescript
public readonly requiredAttributes: RequiredField[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.RequiredField">RequiredField</a>[]

Fields whose absence is reported as `MISSING_ATTRIBUTE`.

---

##### `requiredKeys`<sup>Optional</sup> <a name="requiredKeys" id="@cdklabs/cdk-cicd-wrapper.ConfigSchema.property.requiredKeys"></a>

```typescript
public readonly requiredKeys: RequiredField[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.RequiredField">RequiredField</a>[]

Fields whose absence is reported as `MISSING_KEY`.

---

### DeploymentConfig <a name="DeploymentConfig" id="@cdklabs/cdk-cicd-wrapper.DeploymentConfig"></a>

Forced deployer / CloudFormation-execution roles for a stage.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.DeploymentConfig.Initializer"></a>

```typescript
import { DeploymentConfig } from '@cdklabs/cdk-cicd-wrapper'

const deploymentConfig: DeploymentConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentConfig.property.cfnExecutionRole">cfnExecutionRole</a></code> | <code>string</code> | ARN CloudFormation assumes to execute the change set. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentConfig.property.deployRole">deployRole</a></code> | <code>string</code> | ARN the CLI assumes to deploy (passed as `cdk deploy --role-arn`). |

---

##### `cfnExecutionRole`<sup>Optional</sup> <a name="cfnExecutionRole" id="@cdklabs/cdk-cicd-wrapper.DeploymentConfig.property.cfnExecutionRole"></a>

```typescript
public readonly cfnExecutionRole: string;
```

- *Type:* string

ARN CloudFormation assumes to execute the change set.

---

##### `deployRole`<sup>Optional</sup> <a name="deployRole" id="@cdklabs/cdk-cicd-wrapper.DeploymentConfig.property.deployRole"></a>

```typescript
public readonly deployRole: string;
```

- *Type:* string

ARN the CLI assumes to deploy (passed as `cdk deploy --role-arn`).

---

### DeploymentPipelineAppProps <a name="DeploymentPipelineAppProps" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineAppProps"></a>

Options for the CD pipeline app.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineAppProps.Initializer"></a>

```typescript
import { DeploymentPipelineAppProps } from '@cdklabs/cdk-cicd-wrapper'

const deploymentPipelineAppProps: DeploymentPipelineAppProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineAppProps.property.config">config</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig">ResolvedDeploymentConfig</a></code> | The resolved deployment configuration, as produced by `defineDeployment`. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineAppProps.property.disposable">disposable</a></code> | <code>boolean</code> | Delete the pipeline's own support resources with the stack, for throwaway pipelines. |

---

##### `config`<sup>Required</sup> <a name="config" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineAppProps.property.config"></a>

```typescript
public readonly config: ResolvedDeploymentConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig">ResolvedDeploymentConfig</a>

The resolved deployment configuration, as produced by `defineDeployment`.

---

##### `disposable`<sup>Optional</sup> <a name="disposable" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineAppProps.property.disposable"></a>

```typescript
public readonly disposable: boolean;
```

- *Type:* boolean

Delete the pipeline's own support resources with the stack, for throwaway pipelines.

Off by default.

---

### DeploymentPipelineProps <a name="DeploymentPipelineProps" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineProps"></a>

Options for the CD deployment pipeline.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineProps.Initializer"></a>

```typescript
import { DeploymentPipelineProps } from '@cdklabs/cdk-cicd-wrapper'

const deploymentPipelineProps: DeploymentPipelineProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineProps.property.config">config</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig">ResolvedDeploymentConfig</a></code> | The resolved deployment configuration (`defineDeployment`); |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineProps.property.buildImage">buildImage</a></code> | <code>string</code> | Optional custom CodeBuild image for the deploy project (must have docker + the AWS CLI). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentPipelineProps.property.removalPolicy">removalPolicy</a></code> | <code>aws-cdk-lib.RemovalPolicy</code> | Removal policy for the pipeline's own support resources. |

---

##### `config`<sup>Required</sup> <a name="config" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineProps.property.config"></a>

```typescript
public readonly config: ResolvedDeploymentConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig">ResolvedDeploymentConfig</a>

The resolved deployment configuration (`defineDeployment`);

its `repository` is the pipeline source.

---

##### `buildImage`<sup>Optional</sup> <a name="buildImage" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineProps.property.buildImage"></a>

```typescript
public readonly buildImage: string;
```

- *Type:* string

Optional custom CodeBuild image for the deploy project (must have docker + the AWS CLI).

---

##### `removalPolicy`<sup>Optional</sup> <a name="removalPolicy" id="@cdklabs/cdk-cicd-wrapper.DeploymentPipelineProps.property.removalPolicy"></a>

```typescript
public readonly removalPolicy: RemovalPolicy;
```

- *Type:* aws-cdk-lib.RemovalPolicy

Removal policy for the pipeline's own support resources.

`DESTROY` for a disposable pipeline.

---

### DockerBuildProps <a name="DockerBuildProps" id="@cdklabs/cdk-cicd-wrapper.DockerBuildProps"></a>

Props for {@link BuildImage.docker}.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.DockerBuildProps.Initializer"></a>

```typescript
import { DockerBuildProps } from '@cdklabs/cdk-cicd-wrapper'

const dockerBuildProps: DockerBuildProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DockerBuildProps.property.dockerfile">dockerfile</a></code> | <code>string</code> | Path to the Dockerfile in the source, relative to its root. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DockerBuildProps.property.repositoryName">repositoryName</a></code> | <code>string</code> | Name of the ECR repository to push to. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DockerBuildProps.property.tagStrategy">tagStrategy</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ImageTagStrategy">ImageTagStrategy</a></code> | How the image is tagged. |

---

##### `dockerfile`<sup>Optional</sup> <a name="dockerfile" id="@cdklabs/cdk-cicd-wrapper.DockerBuildProps.property.dockerfile"></a>

```typescript
public readonly dockerfile: string;
```

- *Type:* string

Path to the Dockerfile in the source, relative to its root.

Defaults to `Dockerfile`.

---

##### `repositoryName`<sup>Optional</sup> <a name="repositoryName" id="@cdklabs/cdk-cicd-wrapper.DockerBuildProps.property.repositoryName"></a>

```typescript
public readonly repositoryName: string;
```

- *Type:* string

Name of the ECR repository to push to.

When omitted the pipeline PROVISIONS one named
`<application>-deployer`; when set to an existing repo name the pipeline references it and only needs
push permission. (A full registry URI is derived at deploy time from the pipeline's own account.)

---

##### `tagStrategy`<sup>Optional</sup> <a name="tagStrategy" id="@cdklabs/cdk-cicd-wrapper.DockerBuildProps.property.tagStrategy"></a>

```typescript
public readonly tagStrategy: ImageTagStrategy;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ImageTagStrategy">ImageTagStrategy</a>

How the image is tagged.

Defaults to {@link ImageTagStrategy.GIT_SHA}.

---

### EncryptCloudWatchLogGroupsAspectProps <a name="EncryptCloudWatchLogGroupsAspectProps" id="@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspectProps"></a>

Constructor props for {@link EncryptCloudWatchLogGroupsAspect}.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspectProps.Initializer"></a>

```typescript
import { EncryptCloudWatchLogGroupsAspectProps } from '@cdklabs/cdk-cicd-wrapper'

const encryptCloudWatchLogGroupsAspectProps: EncryptCloudWatchLogGroupsAspectProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspectProps.property.encryptionKey">encryptionKey</a></code> | <code>aws-cdk-lib.aws_kms.IKey</code> | The KMS key used to encrypt every CloudWatch Log Group this aspect visits. |

---

##### `encryptionKey`<sup>Required</sup> <a name="encryptionKey" id="@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspectProps.property.encryptionKey"></a>

```typescript
public readonly encryptionKey: IKey;
```

- *Type:* aws-cdk-lib.aws_kms.IKey

The KMS key used to encrypt every CloudWatch Log Group this aspect visits.

---

### EngineRenderProps <a name="EngineRenderProps" id="@cdklabs/cdk-cicd-wrapper.EngineRenderProps"></a>

Inputs an engine needs to render a pipeline.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.EngineRenderProps.Initializer"></a>

```typescript
import { EngineRenderProps } from '@cdklabs/cdk-cicd-wrapper'

const engineRenderProps: EngineRenderProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EngineRenderProps.property.config">config</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig">ResolvedCicdConfig</a></code> | The fully resolved pipeline configuration. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EngineRenderProps.property.pipelineName">pipelineName</a></code> | <code>string</code> | The pipeline's name (also drives the stack/resource naming an engine chooses). |

---

##### `config`<sup>Required</sup> <a name="config" id="@cdklabs/cdk-cicd-wrapper.EngineRenderProps.property.config"></a>

```typescript
public readonly config: ResolvedCicdConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig">ResolvedCicdConfig</a>

The fully resolved pipeline configuration.

---

##### `pipelineName`<sup>Required</sup> <a name="pipelineName" id="@cdklabs/cdk-cicd-wrapper.EngineRenderProps.property.pipelineName"></a>

```typescript
public readonly pipelineName: string;
```

- *Type:* string

The pipeline's name (also drives the stack/resource naming an engine chooses).

---

### GitHubActionsConfig <a name="GitHubActionsConfig" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig"></a>

GitHub Actions engine configuration: the OIDC role the workflow assumes plus the workflow file's own identity (Blueprint `GitHubPipelinePluginOptions`, migrated).

Only read when `engine` is `GITHUB_ACTIONS`;
`repository` must be `Repository.github(...)` in that case (the workflow runs where GitHub already
checked the source out, so there is no CodeStar-connection source action to build).

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.Initializer"></a>

```typescript
import { GitHubActionsConfig } from '@cdklabs/cdk-cicd-wrapper'

const gitHubActionsConfig: GitHubActionsConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.openIdConnectProviderArn">openIdConnectProviderArn</a></code> | <code>string</code> | An existing GitHub OIDC provider's ARN. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.publishAssetsAuthRegion">publishAssetsAuthRegion</a></code> | <code>string</code> | Region the workflow assumes the OIDC role in when publishing assets (NOT the region assets publish to). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.roleName">roleName</a></code> | <code>string</code> | Name of the OIDC role the workflow assumes to deploy. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.subjectClaims">subjectClaims</a></code> | <code>string[]</code> | Subject claims allowed to assume the role, e.g. `['repo:owner/repo:ref:refs/heads/main']`. Defaults to every ref/environment of `repository`'s `owner/repo` when omitted. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.thumbprints">thumbprints</a></code> | <code>string[]</code> | GitHub certificate thumbprints. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.workflowName">workflowName</a></code> | <code>string</code> | Name of the generated workflow. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.workflowPath">workflowPath</a></code> | <code>string</code> | File path for the generated workflow. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.workflowTriggers">workflowTriggers</a></code> | <code>cdk-pipelines-github.WorkflowTriggers</code> | GitHub workflow triggers. |

---

##### `openIdConnectProviderArn`<sup>Optional</sup> <a name="openIdConnectProviderArn" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.openIdConnectProviderArn"></a>

```typescript
public readonly openIdConnectProviderArn: string;
```

- *Type:* string

An existing GitHub OIDC provider's ARN.

Omit to have one created (one per account/provider URL).

---

##### `publishAssetsAuthRegion`<sup>Optional</sup> <a name="publishAssetsAuthRegion" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.publishAssetsAuthRegion"></a>

```typescript
public readonly publishAssetsAuthRegion: string;
```

- *Type:* string
- *Default:* "us-west-2"

Region the workflow assumes the OIDC role in when publishing assets (NOT the region assets publish to).

---

##### `roleName`<sup>Optional</sup> <a name="roleName" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.roleName"></a>

```typescript
public readonly roleName: string;
```

- *Type:* string
- *Default:* `<application>-github-role`

Name of the OIDC role the workflow assumes to deploy.

Must be a literal (not CDK-generated): the
workflow YAML embeds its ARN as plain text, which only works for a name known before synth.

---

##### `subjectClaims`<sup>Optional</sup> <a name="subjectClaims" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.subjectClaims"></a>

```typescript
public readonly subjectClaims: string[];
```

- *Type:* string[]

Subject claims allowed to assume the role, e.g. `['repo:owner/repo:ref:refs/heads/main']`. Defaults to every ref/environment of `repository`'s `owner/repo` when omitted.

---

##### `thumbprints`<sup>Optional</sup> <a name="thumbprints" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.thumbprints"></a>

```typescript
public readonly thumbprints: string[];
```

- *Type:* string[]
- *Default:* the built-in, currently-valid set

GitHub certificate thumbprints.

---

##### `workflowName`<sup>Optional</sup> <a name="workflowName" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.workflowName"></a>

```typescript
public readonly workflowName: string;
```

- *Type:* string
- *Default:* "deploy"

Name of the generated workflow.

---

##### `workflowPath`<sup>Optional</sup> <a name="workflowPath" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.workflowPath"></a>

```typescript
public readonly workflowPath: string;
```

- *Type:* string
- *Default:* ".github/workflows/deploy.yml"

File path for the generated workflow.

---

##### `workflowTriggers`<sup>Optional</sup> <a name="workflowTriggers" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig.property.workflowTriggers"></a>

```typescript
public readonly workflowTriggers: WorkflowTriggers;
```

- *Type:* cdk-pipelines-github.WorkflowTriggers
- *Default:* push to the tracked branch, plus manual dispatch

GitHub workflow triggers.

---

### GitHubActionsEngineProps <a name="GitHubActionsEngineProps" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngineProps"></a>

Props for the GitHub Actions engine.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngineProps.Initializer"></a>

```typescript
import { GitHubActionsEngineProps } from '@cdklabs/cdk-cicd-wrapper'

const gitHubActionsEngineProps: GitHubActionsEngineProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngineProps.property.config">config</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig">ResolvedCicdConfig</a></code> | The resolved pipeline configuration (`defineCICD`); |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngineProps.property.stages">stages</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.IStageProvider">IStageProvider</a></code> | Builds the app's stacks per stage -- the same `IStageProvider` `CdkPipelinesEngine` takes. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsEngineProps.property.pipelineName">pipelineName</a></code> | <code>string</code> | Falls back to `githubActions.workflowName` when set; otherwise `cdk-pipelines-github` defaults the workflow to "deploy". Named `pipelineName`, not `workflowName`, to keep this prop uniform with `CdkPipelinesEngineProps` -- there is no separate AWS-side "pipeline" resource to name here. |

---

##### `config`<sup>Required</sup> <a name="config" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngineProps.property.config"></a>

```typescript
public readonly config: ResolvedCicdConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig">ResolvedCicdConfig</a>

The resolved pipeline configuration (`defineCICD`);

`repository` must be `Repository.github(...)`.

---

##### `stages`<sup>Required</sup> <a name="stages" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngineProps.property.stages"></a>

```typescript
public readonly stages: IStageProvider;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.IStageProvider">IStageProvider</a>

Builds the app's stacks per stage -- the same `IStageProvider` `CdkPipelinesEngine` takes.

---

##### `pipelineName`<sup>Optional</sup> <a name="pipelineName" id="@cdklabs/cdk-cicd-wrapper.GitHubActionsEngineProps.property.pipelineName"></a>

```typescript
public readonly pipelineName: string;
```

- *Type:* string

Falls back to `githubActions.workflowName` when set; otherwise `cdk-pipelines-github` defaults the workflow to "deploy". Named `pipelineName`, not `workflowName`, to keep this prop uniform with `CdkPipelinesEngineProps` -- there is no separate AWS-side "pipeline" resource to name here.

---

### LambdaDLQAspectProps <a name="LambdaDLQAspectProps" id="@cdklabs/cdk-cicd-wrapper.LambdaDLQAspectProps"></a>

Constructor props for {@link LambdaDLQAspect}.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.LambdaDLQAspectProps.Initializer"></a>

```typescript
import { LambdaDLQAspectProps } from '@cdklabs/cdk-cicd-wrapper'

const lambdaDLQAspectProps: LambdaDLQAspectProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LambdaDLQAspectProps.property.deadLetterQueue">deadLetterQueue</a></code> | <code>aws-cdk-lib.aws_sqs.IQueue</code> | The dead-letter queue every visited function without one is wired to. |

---

##### `deadLetterQueue`<sup>Required</sup> <a name="deadLetterQueue" id="@cdklabs/cdk-cicd-wrapper.LambdaDLQAspectProps.property.deadLetterQueue"></a>

```typescript
public readonly deadLetterQueue: IQueue;
```

- *Type:* aws-cdk-lib.aws_sqs.IQueue

The dead-letter queue every visited function without one is wired to.

---

### LogRetentionAspectProps <a name="LogRetentionAspectProps" id="@cdklabs/cdk-cicd-wrapper.LogRetentionAspectProps"></a>

Options for {@link LogRetentionAspect}.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.LogRetentionAspectProps.Initializer"></a>

```typescript
import { LogRetentionAspectProps } from '@cdklabs/cdk-cicd-wrapper'

const logRetentionAspectProps: LogRetentionAspectProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionAspectProps.property.retentionInDays">retentionInDays</a></code> | <code>number</code> | Retention period, in days, applied to every CloudWatch Log Group the aspect visits that does not already have an explicit retention set. |

---

##### `retentionInDays`<sup>Optional</sup> <a name="retentionInDays" id="@cdklabs/cdk-cicd-wrapper.LogRetentionAspectProps.property.retentionInDays"></a>

```typescript
public readonly retentionInDays: number;
```

- *Type:* number

Retention period, in days, applied to every CloudWatch Log Group the aspect visits that does not already have an explicit retention set.

Defaults to 365 (matching Blueprint).

---

### ManagedVpcConfig <a name="ManagedVpcConfig" id="@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig"></a>

VPC configuration for a wrapper-managed VPC (Blueprint `IManagedVpcConfig`, migrated from `VPCProvider`).

Every field is optional; an unset field takes Blueprint's original default.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.Initializer"></a>

```typescript
import { ManagedVpcConfig } from '@cdklabs/cdk-cicd-wrapper'

const managedVpcConfig: ManagedVpcConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.allowAllOutbound">allowAllOutbound</a></code> | <code>boolean</code> | Allow all outbound traffic by default from the security group the wrapper creates. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.cidrBlock">cidrBlock</a></code> | <code>string</code> | CIDR block for the VPC. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.codeBuildVpcInterfaces">codeBuildVpcInterfaces</a></code> | <code>aws-cdk-lib.aws_ec2.InterfaceVpcEndpointAwsService[]</code> | Extra CodeBuild VPC interface endpoints beyond the default set (SSM, STS, CloudWatch Logs, CloudFormation, Secrets Manager, KMS). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.flowLogsBucketName">flowLogsBucketName</a></code> | <code>string</code> | S3 bucket to send VPC flow logs to. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.maxAzs">maxAzs</a></code> | <code>number</code> | Max AZs. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.restrictDefaultSecurityGroup">restrictDefaultSecurityGroup</a></code> | <code>boolean</code> | Remove the default inbound/outbound rules from the VPC's default security group. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.subnetCidrMask">subnetCidrMask</a></code> | <code>number</code> | Subnet CIDR mask. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.subnetType">subnetType</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetType</code> | The subnets the VPC's CodeBuild projects run in. |

---

##### `allowAllOutbound`<sup>Optional</sup> <a name="allowAllOutbound" id="@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.allowAllOutbound"></a>

```typescript
public readonly allowAllOutbound: boolean;
```

- *Type:* boolean
- *Default:* true

Allow all outbound traffic by default from the security group the wrapper creates.

---

##### `cidrBlock`<sup>Optional</sup> <a name="cidrBlock" id="@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.cidrBlock"></a>

```typescript
public readonly cidrBlock: string;
```

- *Type:* string
- *Default:* '172.31.0.0/20'

CIDR block for the VPC.

---

##### `codeBuildVpcInterfaces`<sup>Optional</sup> <a name="codeBuildVpcInterfaces" id="@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.codeBuildVpcInterfaces"></a>

```typescript
public readonly codeBuildVpcInterfaces: InterfaceVpcEndpointAwsService[];
```

- *Type:* aws-cdk-lib.aws_ec2.InterfaceVpcEndpointAwsService[]

Extra CodeBuild VPC interface endpoints beyond the default set (SSM, STS, CloudWatch Logs, CloudFormation, Secrets Manager, KMS).

Only used for the isolated-subnet case (see `subnetType`).

---

##### `flowLogsBucketName`<sup>Optional</sup> <a name="flowLogsBucketName" id="@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.flowLogsBucketName"></a>

```typescript
public readonly flowLogsBucketName: string;
```

- *Type:* string

S3 bucket to send VPC flow logs to.

Blueprint always used the RES stage's compliance-log bucket
implicitly; Autopilot has not migrated that bucket yet (`m9-migrate-compliance-bucket`), so this is an
explicit prop instead -- omit to skip flow logs.

---

##### `maxAzs`<sup>Optional</sup> <a name="maxAzs" id="@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.maxAzs"></a>

```typescript
public readonly maxAzs: number;
```

- *Type:* number
- *Default:* 2

Max AZs.

---

##### `restrictDefaultSecurityGroup`<sup>Optional</sup> <a name="restrictDefaultSecurityGroup" id="@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.restrictDefaultSecurityGroup"></a>

```typescript
public readonly restrictDefaultSecurityGroup: boolean;
```

- *Type:* boolean
- *Default:* true

Remove the default inbound/outbound rules from the VPC's default security group.

---

##### `subnetCidrMask`<sup>Optional</sup> <a name="subnetCidrMask" id="@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.subnetCidrMask"></a>

```typescript
public readonly subnetCidrMask: number;
```

- *Type:* number
- *Default:* 24

Subnet CIDR mask.

---

##### `subnetType`<sup>Optional</sup> <a name="subnetType" id="@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig.property.subnetType"></a>

```typescript
public readonly subnetType: SubnetType;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetType

The subnets the VPC's CodeBuild projects run in.

Defaults to `PRIVATE_ISOLATED` when a `proxy`
is configured (no NAT egress; the CodeBuild VPC endpoints below cover AWS API calls instead) and
`PRIVATE_WITH_EGRESS` otherwise -- the rule Blueprint's `VPCProvider` applied.

---

### NpmRegistryConfig <a name="NpmRegistryConfig" id="@cdklabs/cdk-cicd-wrapper.NpmRegistryConfig"></a>

A generic private npm registry the pipeline's builds authenticate against with a bearer token (Blueprint `NPMRegistryConfig`, migrated).

Unlike `CodeArtifactConfig` (an `aws codeartifact login`), this covers
any npm-compatible registry: when set, every build project writes a `.npmrc` -- scoped to `scope` when
given, otherwise overriding the default registry -- with an auth token read from Secrets Manager.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.NpmRegistryConfig.Initializer"></a>

```typescript
import { NpmRegistryConfig } from '@cdklabs/cdk-cicd-wrapper'

const npmRegistryConfig: NpmRegistryConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.NpmRegistryConfig.property.basicAuthSecretArn">basicAuthSecretArn</a></code> | <code>string</code> | ARN of the Secrets Manager secret holding the bearer token (the secret's plain `SecretString`). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.NpmRegistryConfig.property.url">url</a></code> | <code>string</code> | The registry URL, e.g. `https://npm.example.com/`. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.NpmRegistryConfig.property.scope">scope</a></code> | <code>string</code> | npm scope to bind to the registry, e.g. `cdklabs` for `@cdklabs/*`. Omit to override the default registry. |

---

##### `basicAuthSecretArn`<sup>Required</sup> <a name="basicAuthSecretArn" id="@cdklabs/cdk-cicd-wrapper.NpmRegistryConfig.property.basicAuthSecretArn"></a>

```typescript
public readonly basicAuthSecretArn: string;
```

- *Type:* string

ARN of the Secrets Manager secret holding the bearer token (the secret's plain `SecretString`).

---

##### `url`<sup>Required</sup> <a name="url" id="@cdklabs/cdk-cicd-wrapper.NpmRegistryConfig.property.url"></a>

```typescript
public readonly url: string;
```

- *Type:* string

The registry URL, e.g. `https://npm.example.com/`.

---

##### `scope`<sup>Optional</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.NpmRegistryConfig.property.scope"></a>

```typescript
public readonly scope: string;
```

- *Type:* string

npm scope to bind to the registry, e.g. `cdklabs` for `@cdklabs/*`. Omit to override the default registry.

---

### PipelineAppProps <a name="PipelineAppProps" id="@cdklabs/cdk-cicd-wrapper.PipelineAppProps"></a>

Options for the pipeline app.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.PipelineAppProps.Initializer"></a>

```typescript
import { PipelineAppProps } from '@cdklabs/cdk-cicd-wrapper'

const pipelineAppProps: PipelineAppProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineAppProps.property.config">config</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig">ResolvedCicdConfig</a></code> | The resolved pipeline configuration, as produced by `defineCICD`. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.PipelineAppProps.property.disposable">disposable</a></code> | <code>boolean</code> | Treat this pipeline as disposable: its own support resources (artifact bucket, encryption key) are deleted with the stack instead of retained. |

---

##### `config`<sup>Required</sup> <a name="config" id="@cdklabs/cdk-cicd-wrapper.PipelineAppProps.property.config"></a>

```typescript
public readonly config: ResolvedCicdConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig">ResolvedCicdConfig</a>

The resolved pipeline configuration, as produced by `defineCICD`.

---

##### `disposable`<sup>Optional</sup> <a name="disposable" id="@cdklabs/cdk-cicd-wrapper.PipelineAppProps.property.disposable"></a>

```typescript
public readonly disposable: boolean;
```

- *Type:* boolean

Treat this pipeline as disposable: its own support resources (artifact bucket, encryption key) are deleted with the stack instead of retained.

Off by default, because losing a real pipeline's
artifact history to a `cdk destroy` is not a default anyone should get by accident.

---

### ProxyConfig <a name="ProxyConfig" id="@cdklabs/cdk-cicd-wrapper.ProxyConfig"></a>

HTTP(S) proxy configuration for the pipeline's CodeBuild projects (Blueprint `IProxyConfig`, migrated).

When set, every build project reads proxy credentials from Secrets Manager, exports
`HTTP(S)_PROXY` before running its install commands, and curls `proxyTestUrl` to prove the tunnel
works before the real install runs.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.ProxyConfig.Initializer"></a>

```typescript
import { ProxyConfig } from '@cdklabs/cdk-cicd-wrapper'

const proxyConfig: ProxyConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ProxyConfig.property.noProxy">noProxy</a></code> | <code>string[]</code> | Hosts that bypass the proxy. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ProxyConfig.property.proxySecretArn">proxySecretArn</a></code> | <code>string</code> | ARN of the Secrets Manager secret holding the proxy credentials, as the keys `username`, `password`, `http_proxy_port`, `https_proxy_port` and `proxy_domain`. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ProxyConfig.property.proxyTestUrl">proxyTestUrl</a></code> | <code>string</code> | URL curl'd (through the proxy) to confirm it works before the install phase's real commands run. |

---

##### `noProxy`<sup>Required</sup> <a name="noProxy" id="@cdklabs/cdk-cicd-wrapper.ProxyConfig.property.noProxy"></a>

```typescript
public readonly noProxy: string[];
```

- *Type:* string[]

Hosts that bypass the proxy.

Empty means the engine adds its own region's `amazonaws.com`
endpoint, so calls to AWS APIs (e.g. a private-registry `codeartifact login`) skip the proxy.

---

##### `proxySecretArn`<sup>Required</sup> <a name="proxySecretArn" id="@cdklabs/cdk-cicd-wrapper.ProxyConfig.property.proxySecretArn"></a>

```typescript
public readonly proxySecretArn: string;
```

- *Type:* string

ARN of the Secrets Manager secret holding the proxy credentials, as the keys `username`, `password`, `http_proxy_port`, `https_proxy_port` and `proxy_domain`.

---

##### `proxyTestUrl`<sup>Required</sup> <a name="proxyTestUrl" id="@cdklabs/cdk-cicd-wrapper.ProxyConfig.property.proxyTestUrl"></a>

```typescript
public readonly proxyTestUrl: string;
```

- *Type:* string

URL curl'd (through the proxy) to confirm it works before the install phase's real commands run.

---

### RemovalPolicies <a name="RemovalPolicies" id="@cdklabs/cdk-cicd-wrapper.RemovalPolicies"></a>

Retention of stateful resources.

Both default to `RETAIN`.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.RemovalPolicies.Initializer"></a>

```typescript
import { RemovalPolicies } from '@cdklabs/cdk-cicd-wrapper'

const removalPolicies: RemovalPolicies = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RemovalPolicies.property.dynamoDBTable">dynamoDBTable</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.RemovalPolicyValue">RemovalPolicyValue</a></code> | Retention for DynamoDB tables. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RemovalPolicies.property.s3Bucket">s3Bucket</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.RemovalPolicyValue">RemovalPolicyValue</a></code> | Retention for S3 buckets. |

---

##### `dynamoDBTable`<sup>Optional</sup> <a name="dynamoDBTable" id="@cdklabs/cdk-cicd-wrapper.RemovalPolicies.property.dynamoDBTable"></a>

```typescript
public readonly dynamoDBTable: RemovalPolicyValue;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.RemovalPolicyValue">RemovalPolicyValue</a>

Retention for DynamoDB tables.

---

##### `s3Bucket`<sup>Optional</sup> <a name="s3Bucket" id="@cdklabs/cdk-cicd-wrapper.RemovalPolicies.property.s3Bucket"></a>

```typescript
public readonly s3Bucket: RemovalPolicyValue;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.RemovalPolicyValue">RemovalPolicyValue</a>

Retention for S3 buckets.

---

### RequiredField <a name="RequiredField" id="@cdklabs/cdk-cicd-wrapper.RequiredField"></a>

A required field addressed by dot-path, plus the shape it must satisfy.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.RequiredField.Initializer"></a>

```typescript
import { RequiredField } from '@cdklabs/cdk-cicd-wrapper'

const requiredField: RequiredField = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RequiredField.property.kind">kind</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.FieldKind">FieldKind</a></code> | The shape the value must have. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RequiredField.property.path">path</a></code> | <code>string</code> | Dot-path into the nested config, e.g. `aws.accountId`. |

---

##### `kind`<sup>Required</sup> <a name="kind" id="@cdklabs/cdk-cicd-wrapper.RequiredField.property.kind"></a>

```typescript
public readonly kind: FieldKind;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.FieldKind">FieldKind</a>

The shape the value must have.

---

##### `path`<sup>Required</sup> <a name="path" id="@cdklabs/cdk-cicd-wrapper.RequiredField.property.path"></a>

```typescript
public readonly path: string;
```

- *Type:* string

Dot-path into the nested config, e.g. `aws.accountId`.

---

### ResolvedCicdConfig <a name="ResolvedCicdConfig" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig"></a>

The fully resolved pipeline configuration `defineCICD` produces.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.Initializer"></a>

```typescript
import { ResolvedCicdConfig } from '@cdklabs/cdk-cicd-wrapper'

const resolvedCicdConfig: ResolvedCicdConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.asyncDeploy">asyncDeploy</a></code> | <code>boolean</code> | Hand the CloudFormation wait to a Lambda instead of holding CodeBuild compute for it (D-deploy-wait). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.ci">ci</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CiConfig">CiConfig</a></code> | Resolved CI configuration. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.deployModel">deployModel</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.DeployModel">DeployModel</a></code> | How the deployed cloud assembly is produced. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.engine">engine</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.EngineType">EngineType</a></code> | Which engine renders the pipeline. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.repository">repository</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.Repository">Repository</a></code> | The source repository. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.stages">stages</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedStage">ResolvedStage</a>[]</code> | The deployment stages, in order. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.synthesizer">synthesizer</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.SynthesizerConfig">SynthesizerConfig</a></code> | The synthesizer configuration. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.application">application</a></code> | <code>string</code> | Application name; |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.codeArtifact">codeArtifact</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig">CodeArtifactConfig</a></code> | Private CodeArtifact npm repository the builds authenticate against, if any. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.codeBuildEnvSettings">codeBuildEnvSettings</a></code> | <code>aws-cdk-lib.aws_codebuild.BuildEnvironment</code> | CodeBuild environment overrides -- privileged mode, compute type, environment variables -- applied to every CodeBuild project the pipeline creates (Blueprint `codeBuildEnvSettings`, migrated from `CodeBuildFactoryProvider`/`PipelineBlueprint.codeBuildEnvSettings(...)`). Reuses CDK's own `BuildEnvironment` rather than a bespoke type, so it stays a drop-in for Blueprint callers. `buildImage` here is a full `IBuildImage` (e.g. an ARM or GPU managed image); it is distinct from the engines' own `buildImage` constructor prop, which takes a Docker-registry image string -- that prop wins when both are set. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.complianceLogBucketName">complianceLogBucketName</a></code> | <code>string</code> | The name of the compliance/access-log destination bucket, if configured (Blueprint `ComplianceBucketProvider`/`ComplianceLogBucketStack`, migrated). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.deployerImage">deployerImage</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.BuildImage">BuildImage</a></code> | Container mode (Repo 1): when set, the pipeline runs CI then builds & pushes a config-agnostic deployer image to ECR instead of deploying stages. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.express">express</a></code> | <code>boolean</code> | Deploy with **CloudFormation express mode** (`cdk deploy --express`). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.githubActions">githubActions</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig">GitHubActionsConfig</a></code> | GitHub Actions engine configuration. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.npmRegistry">npmRegistry</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.NpmRegistryConfig">NpmRegistryConfig</a></code> | Generic private npm registry the builds authenticate against with a bearer token, if any. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.proxy">proxy</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ProxyConfig">ProxyConfig</a></code> | HTTP(S) proxy every build project routes through, if any. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.qualifier">qualifier</a></code> | <code>string</code> | Bootstrap qualifier (≤10 chars), derived from `application` when not given. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.vpc">vpc</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.VpcConfig">VpcConfig</a></code> | VPC every CodeBuild project the pipeline creates runs in, if configured (Blueprint `VPCProvider`, migrated). |

---

##### `asyncDeploy`<sup>Required</sup> <a name="asyncDeploy" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.asyncDeploy"></a>

```typescript
public readonly asyncDeploy: boolean;
```

- *Type:* boolean

Hand the CloudFormation wait to a Lambda instead of holding CodeBuild compute for it (D-deploy-wait).

Off by default: the build-compute path is what `m4-verify` proves end to end, and this one replaces
how deployment actually executes -- change sets prepared by the build, then executed and polled by a
Lambda -- so it is opt-in until a real run validates it. When on, a deploy stage stops billing build
minutes for the (usually dominant) stretch where CloudFormation is working.

---

##### `ci`<sup>Required</sup> <a name="ci" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.ci"></a>

```typescript
public readonly ci: CiConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CiConfig">CiConfig</a>

Resolved CI configuration.

---

##### `deployModel`<sup>Required</sup> <a name="deployModel" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.deployModel"></a>

```typescript
public readonly deployModel: DeployModel;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.DeployModel">DeployModel</a>

How the deployed cloud assembly is produced.

Defaults to `ASSEMBLY_PROMOTION`.

---

##### `engine`<sup>Required</sup> <a name="engine" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.engine"></a>

```typescript
public readonly engine: EngineType;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.EngineType">EngineType</a>

Which engine renders the pipeline.

Defaults to CodePipeline.

---

##### `repository`<sup>Required</sup> <a name="repository" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.repository"></a>

```typescript
public readonly repository: Repository;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.Repository">Repository</a>

The source repository.

---

##### `stages`<sup>Required</sup> <a name="stages" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.stages"></a>

```typescript
public readonly stages: ResolvedStage[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResolvedStage">ResolvedStage</a>[]

The deployment stages, in order.

---

##### `synthesizer`<sup>Required</sup> <a name="synthesizer" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.synthesizer"></a>

```typescript
public readonly synthesizer: SynthesizerConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.SynthesizerConfig">SynthesizerConfig</a>

The synthesizer configuration.

---

##### `application`<sup>Optional</sup> <a name="application" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.application"></a>

```typescript
public readonly application: string;
```

- *Type:* string

Application name;

drives the bootstrap qualifier and asset naming.

---

##### `codeArtifact`<sup>Optional</sup> <a name="codeArtifact" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.codeArtifact"></a>

```typescript
public readonly codeArtifact: CodeArtifactConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig">CodeArtifactConfig</a>

Private CodeArtifact npm repository the builds authenticate against, if any.

---

##### `codeBuildEnvSettings`<sup>Optional</sup> <a name="codeBuildEnvSettings" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.codeBuildEnvSettings"></a>

```typescript
public readonly codeBuildEnvSettings: BuildEnvironment;
```

- *Type:* aws-cdk-lib.aws_codebuild.BuildEnvironment

CodeBuild environment overrides -- privileged mode, compute type, environment variables -- applied to every CodeBuild project the pipeline creates (Blueprint `codeBuildEnvSettings`, migrated from `CodeBuildFactoryProvider`/`PipelineBlueprint.codeBuildEnvSettings(...)`). Reuses CDK's own `BuildEnvironment` rather than a bespoke type, so it stays a drop-in for Blueprint callers. `buildImage` here is a full `IBuildImage` (e.g. an ARM or GPU managed image); it is distinct from the engines' own `buildImage` constructor prop, which takes a Docker-registry image string -- that prop wins when both are set.

---

##### `complianceLogBucketName`<sup>Optional</sup> <a name="complianceLogBucketName" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.complianceLogBucketName"></a>

```typescript
public readonly complianceLogBucketName: string;
```

- *Type:* string

The name of the compliance/access-log destination bucket, if configured (Blueprint `ComplianceBucketProvider`/`ComplianceLogBucketStack`, migrated).

Threaded into
`SupportResources.complianceLogBucket`; see there for the bucket's shape.

---

##### `deployerImage`<sup>Optional</sup> <a name="deployerImage" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.deployerImage"></a>

```typescript
public readonly deployerImage: BuildImage;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.BuildImage">BuildImage</a>

Container mode (Repo 1): when set, the pipeline runs CI then builds & pushes a config-agnostic deployer image to ECR instead of deploying stages.

Undefined = the normal deploy pipeline. (Named
`deployerImage`, not `build` -- jsii reserves `build` as a struct member name.)

---

##### `express`<sup>Optional</sup> <a name="express" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.express"></a>

```typescript
public readonly express: boolean;
```

- *Type:* boolean

Deploy with **CloudFormation express mode** (`cdk deploy --express`).

CloudFormation reports each
stack operation complete as soon as it applies the resource configuration, *without* waiting for
resources to stabilize -- materially faster for stacks whose resources are slow to stabilize.
Express runs with **rollback disabled** (a failed deploy is left in a failed state for inspection);
forcing `--rollback` conflicts with the change-set path for nested stacks, so the CLI does not add
it. AWS does **not** recommend express mode for production -- it targets fast iterative
deployments. Off by default.

---

##### `githubActions`<sup>Optional</sup> <a name="githubActions" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.githubActions"></a>

```typescript
public readonly githubActions: GitHubActionsConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.GitHubActionsConfig">GitHubActionsConfig</a>

GitHub Actions engine configuration.

Only read when `engine` is `EngineType.GITHUB_ACTIONS`.

---

##### `npmRegistry`<sup>Optional</sup> <a name="npmRegistry" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.npmRegistry"></a>

```typescript
public readonly npmRegistry: NpmRegistryConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.NpmRegistryConfig">NpmRegistryConfig</a>

Generic private npm registry the builds authenticate against with a bearer token, if any.

---

##### `proxy`<sup>Optional</sup> <a name="proxy" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.proxy"></a>

```typescript
public readonly proxy: ProxyConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ProxyConfig">ProxyConfig</a>

HTTP(S) proxy every build project routes through, if any.

---

##### `qualifier`<sup>Optional</sup> <a name="qualifier" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.qualifier"></a>

```typescript
public readonly qualifier: string;
```

- *Type:* string

Bootstrap qualifier (≤10 chars), derived from `application` when not given.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cdklabs/cdk-cicd-wrapper.ResolvedCicdConfig.property.vpc"></a>

```typescript
public readonly vpc: VpcConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.VpcConfig">VpcConfig</a>

VPC every CodeBuild project the pipeline creates runs in, if configured (Blueprint `VPCProvider`, migrated).

---

### ResolvedDeploymentConfig <a name="ResolvedDeploymentConfig" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig"></a>

The fully resolved container-mode deployment configuration `defineDeployment` produces (Repo 2 of the two-repo split).

It pins one config-agnostic deployer image and lists the targets to run it against;
`cdk-cicd deploy --from-image` runs the image per target, synthesizing and deploying in-container.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig.Initializer"></a>

```typescript
import { ResolvedDeploymentConfig } from '@cdklabs/cdk-cicd-wrapper'

const resolvedDeploymentConfig: ResolvedDeploymentConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig.property.targets">targets</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget">ResolvedDeploymentTarget</a>[]</code> | The deployment targets, in order. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig.property.codeArtifact">codeArtifact</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig">CodeArtifactConfig</a></code> | Private CodeArtifact repo the CD build authenticates against before `npm ci` (to install the wrapper CLI when it is pre-release / not on public npm). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig.property.image">image</a></code> | <code>string</code> | The default deployer image to run targets against (an ECR/OCI reference, tag or digest). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig.property.npmRegistry">npmRegistry</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.NpmRegistryConfig">NpmRegistryConfig</a></code> | Generic private npm registry the CD build authenticates against before `npm ci`. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig.property.repository">repository</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.Repository">Repository</a></code> | The config-only source repository the CD pipeline watches (where `deploy.config.ts` lives -- no CDK code). Optional: when omitted, the config drives only the local `cdk-cicd deploy --from-image` executor; set it to provision a CD CodePipeline (`cdk-cicd deploy-ci`) whose CodeBuild pulls the image and deploys each target. This is the deploy-side twin of `ResolvedCicdConfig.repository`. |

---

##### `targets`<sup>Required</sup> <a name="targets" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig.property.targets"></a>

```typescript
public readonly targets: ResolvedDeploymentTarget[];
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget">ResolvedDeploymentTarget</a>[]

The deployment targets, in order.

---

##### `codeArtifact`<sup>Optional</sup> <a name="codeArtifact" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig.property.codeArtifact"></a>

```typescript
public readonly codeArtifact: CodeArtifactConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CodeArtifactConfig">CodeArtifactConfig</a>

Private CodeArtifact repo the CD build authenticates against before `npm ci` (to install the wrapper CLI when it is pre-release / not on public npm).

Same shape as the pipeline-config `codeArtifact`.

---

##### `image`<sup>Optional</sup> <a name="image" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig.property.image"></a>

```typescript
public readonly image: string;
```

- *Type:* string

The default deployer image to run targets against (an ECR/OCI reference, tag or digest).

A target's
own `image` overrides this, so per-stage versions live on the targets; this is the shared fallback.
Optional only because every target may pin its own `image` -- each target must resolve to one or the other.

---

##### `npmRegistry`<sup>Optional</sup> <a name="npmRegistry" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig.property.npmRegistry"></a>

```typescript
public readonly npmRegistry: NpmRegistryConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.NpmRegistryConfig">NpmRegistryConfig</a>

Generic private npm registry the CD build authenticates against before `npm ci`.

Same shape as the
pipeline-config `npmRegistry`.

---

##### `repository`<sup>Optional</sup> <a name="repository" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentConfig.property.repository"></a>

```typescript
public readonly repository: Repository;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.Repository">Repository</a>

The config-only source repository the CD pipeline watches (where `deploy.config.ts` lives -- no CDK code). Optional: when omitted, the config drives only the local `cdk-cicd deploy --from-image` executor; set it to provision a CD CodePipeline (`cdk-cicd deploy-ci`) whose CodeBuild pulls the image and deploys each target. This is the deploy-side twin of `ResolvedCicdConfig.repository`.

---

### ResolvedDeploymentTarget <a name="ResolvedDeploymentTarget" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget"></a>

A resolved deployment target for container mode (Repo 2): a stage to deploy the pinned image against, with its own environment and optional forced roles.

`env` mirrors a `ResolvedStage`'s environment, but a
target names the stage it maps to rather than defining it -- the stage's stacks live in the image, not
here. `manualApproval` defaults the same way stages do (gated unless `dev`/`res`).

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget.Initializer"></a>

```typescript
import { ResolvedDeploymentTarget } from '@cdklabs/cdk-cicd-wrapper'

const resolvedDeploymentTarget: ResolvedDeploymentTarget = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget.property.env">env</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.StageEnvironment">StageEnvironment</a></code> | Where this target deploys. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget.property.manualApproval">manualApproval</a></code> | <code>boolean</code> | Whether a manual approval gates this target. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget.property.stage">stage</a></code> | <code>string</code> | The stage in the image's app to deploy (passed to the in-container `cdk-cicd deploy --stage`). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget.property.deployment">deployment</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentConfig">DeploymentConfig</a></code> | Forced roles for this target, if any. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget.property.image">image</a></code> | <code>string</code> | The deployer image (tag/digest) to run for THIS target, overriding the config-level `image`. |

---

##### `env`<sup>Required</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget.property.env"></a>

```typescript
public readonly env: StageEnvironment;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.StageEnvironment">StageEnvironment</a>

Where this target deploys.

---

##### `manualApproval`<sup>Required</sup> <a name="manualApproval" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget.property.manualApproval"></a>

```typescript
public readonly manualApproval: boolean;
```

- *Type:* boolean

Whether a manual approval gates this target.

---

##### `stage`<sup>Required</sup> <a name="stage" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget.property.stage"></a>

```typescript
public readonly stage: string;
```

- *Type:* string

The stage in the image's app to deploy (passed to the in-container `cdk-cicd deploy --stage`).

---

##### `deployment`<sup>Optional</sup> <a name="deployment" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget.property.deployment"></a>

```typescript
public readonly deployment: DeploymentConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.DeploymentConfig">DeploymentConfig</a>

Forced roles for this target, if any.

---

##### `image`<sup>Optional</sup> <a name="image" id="@cdklabs/cdk-cicd-wrapper.ResolvedDeploymentTarget.property.image"></a>

```typescript
public readonly image: string;
```

- *Type:* string

The deployer image (tag/digest) to run for THIS target, overriding the config-level `image`.

This is
how a stage pins its own application version -- bump `dev`'s tag to ship a new version to dev alone,
or set `int`/`prod` to the same tag to promote. When unset, the target uses the config-level `image`.

---

### ResolvedStage <a name="ResolvedStage" id="@cdklabs/cdk-cicd-wrapper.ResolvedStage"></a>

A fully resolved deployment stage.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.ResolvedStage.Initializer"></a>

```typescript
import { ResolvedStage } from '@cdklabs/cdk-cicd-wrapper'

const resolvedStage: ResolvedStage = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedStage.property.env">env</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.StageEnvironment">StageEnvironment</a></code> | Where this stage deploys. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedStage.property.manualApproval">manualApproval</a></code> | <code>boolean</code> | Whether a manual approval gates this stage. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedStage.property.name">name</a></code> | <code>string</code> | Stage name, e.g. `dev`, `prod`. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ResolvedStage.property.deployment">deployment</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.DeploymentConfig">DeploymentConfig</a></code> | Forced roles for this stage, if any. |

---

##### `env`<sup>Required</sup> <a name="env" id="@cdklabs/cdk-cicd-wrapper.ResolvedStage.property.env"></a>

```typescript
public readonly env: StageEnvironment;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.StageEnvironment">StageEnvironment</a>

Where this stage deploys.

---

##### `manualApproval`<sup>Required</sup> <a name="manualApproval" id="@cdklabs/cdk-cicd-wrapper.ResolvedStage.property.manualApproval"></a>

```typescript
public readonly manualApproval: boolean;
```

- *Type:* boolean

Whether a manual approval gates this stage.

---

##### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.ResolvedStage.property.name"></a>

```typescript
public readonly name: string;
```

- *Type:* string

Stage name, e.g. `dev`, `prod`.

---

##### `deployment`<sup>Optional</sup> <a name="deployment" id="@cdklabs/cdk-cicd-wrapper.ResolvedStage.property.deployment"></a>

```typescript
public readonly deployment: DeploymentConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.DeploymentConfig">DeploymentConfig</a>

Forced roles for this stage, if any.

---

### StageEnvironment <a name="StageEnvironment" id="@cdklabs/cdk-cicd-wrapper.StageEnvironment"></a>

A resolved stage's target environment.

`regions` is always a list, even for a single region.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.StageEnvironment.Initializer"></a>

```typescript
import { StageEnvironment } from '@cdklabs/cdk-cicd-wrapper'

const stageEnvironment: StageEnvironment = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.StageEnvironment.property.regionOrder">regionOrder</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.RegionOrder">RegionOrder</a></code> | How the regions roll out. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.StageEnvironment.property.regions">regions</a></code> | <code>string[]</code> | Target regions, in order. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.StageEnvironment.property.account">account</a></code> | <code>string</code> | Target account. |

---

##### `regionOrder`<sup>Required</sup> <a name="regionOrder" id="@cdklabs/cdk-cicd-wrapper.StageEnvironment.property.regionOrder"></a>

```typescript
public readonly regionOrder: RegionOrder;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.RegionOrder">RegionOrder</a>

How the regions roll out.

---

##### `regions`<sup>Required</sup> <a name="regions" id="@cdklabs/cdk-cicd-wrapper.StageEnvironment.property.regions"></a>

```typescript
public readonly regions: string[];
```

- *Type:* string[]

Target regions, in order.

Never empty for an environment-specific stage.

---

##### `account`<sup>Optional</sup> <a name="account" id="@cdklabs/cdk-cicd-wrapper.StageEnvironment.property.account"></a>

```typescript
public readonly account: string;
```

- *Type:* string

Target account.

Omitted means environment-agnostic (resolved from ambient creds at deploy).

---

### StageStackNameOptions <a name="StageStackNameOptions" id="@cdklabs/cdk-cicd-wrapper.StageStackNameOptions"></a>

Options for {@link stageStackName}.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.StageStackNameOptions.Initializer"></a>

```typescript
import { StageStackNameOptions } from '@cdklabs/cdk-cicd-wrapper'

const stageStackNameOptions: StageStackNameOptions = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.StageStackNameOptions.property.stage">stage</a></code> | <code>string</code> | The stage to fold into the name. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.StageStackNameOptions.property.stageFirst">stageFirst</a></code> | <code>boolean</code> | Put the stage BEFORE the base (`<stage>-<base>`) instead of after. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.StageStackNameOptions.property.uppercaseStage">uppercaseStage</a></code> | <code>boolean</code> | Uppercase the stage segment. |

---

##### `stage`<sup>Optional</sup> <a name="stage" id="@cdklabs/cdk-cicd-wrapper.StageStackNameOptions.property.stage"></a>

```typescript
public readonly stage: string;
```

- *Type:* string

The stage to fold into the name.

Defaults to `process.env.CDK_STAGE`, which `cdk-cicd exec` sets to
the stage being deployed. When neither is available (e.g. a bare `cdk synth`), the base is returned
unchanged rather than a `myapp-undefined`.

---

##### `stageFirst`<sup>Optional</sup> <a name="stageFirst" id="@cdklabs/cdk-cicd-wrapper.StageStackNameOptions.property.stageFirst"></a>

```typescript
public readonly stageFirst: boolean;
```

- *Type:* boolean

Put the stage BEFORE the base (`<stage>-<base>`) instead of after.

Blueprint put the stage first.

---

##### `uppercaseStage`<sup>Optional</sup> <a name="uppercaseStage" id="@cdklabs/cdk-cicd-wrapper.StageStackNameOptions.property.uppercaseStage"></a>

```typescript
public readonly uppercaseStage: boolean;
```

- *Type:* boolean

Uppercase the stage segment.

Convenience for matching Blueprint's DEFAULT stage ids (`RES`/`DEV`/`INT`/
`PROD`), which were uppercase. If your Blueprint stages were lowercase or custom-case, leave this off and
pass the stage verbatim so the name matches exactly -- cdk.Stage prefixed with the id as-is, it did
not uppercase.

---

### SupportResourcesProps <a name="SupportResourcesProps" id="@cdklabs/cdk-cicd-wrapper.SupportResourcesProps"></a>

Options for the wrapper's support resources.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.SupportResourcesProps.Initializer"></a>

```typescript
import { SupportResourcesProps } from '@cdklabs/cdk-cicd-wrapper'

const supportResourcesProps: SupportResourcesProps = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResourcesProps.property.complianceLogBucketName">complianceLogBucketName</a></code> | <code>string</code> | The name of the compliance/access-log bucket -- Blueprint's `IComplianceBucket.bucketName` (`ComplianceBucketProvider`). Required only if `complianceLogBucket` is read; an explicit, predictable name is what lets other buckets' S3 server-access-logging destination (and Blueprint's cross-region name-substitution convention for multi-region deployments) point at it. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResourcesProps.property.removalPolicy">removalPolicy</a></code> | <code>aws-cdk-lib.RemovalPolicy</code> | Removal policy for the support resources. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResourcesProps.property.useProxy">useProxy</a></code> | <code>boolean</code> | Whether an HTTP(S) proxy is configured (`ResolvedCicdConfig.proxy`). A managed VPC uses isolated subnets when true, matching Blueprint's `VPCProvider`. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SupportResourcesProps.property.vpc">vpc</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.VpcConfig">VpcConfig</a></code> | VPC every CodeBuild project the pipeline creates runs in, if configured. |

---

##### `complianceLogBucketName`<sup>Optional</sup> <a name="complianceLogBucketName" id="@cdklabs/cdk-cicd-wrapper.SupportResourcesProps.property.complianceLogBucketName"></a>

```typescript
public readonly complianceLogBucketName: string;
```

- *Type:* string

The name of the compliance/access-log bucket -- Blueprint's `IComplianceBucket.bucketName` (`ComplianceBucketProvider`). Required only if `complianceLogBucket` is read; an explicit, predictable name is what lets other buckets' S3 server-access-logging destination (and Blueprint's cross-region name-substitution convention for multi-region deployments) point at it.

---

##### `removalPolicy`<sup>Optional</sup> <a name="removalPolicy" id="@cdklabs/cdk-cicd-wrapper.SupportResourcesProps.property.removalPolicy"></a>

```typescript
public readonly removalPolicy: RemovalPolicy;
```

- *Type:* aws-cdk-lib.RemovalPolicy

Removal policy for the support resources.

`RETAIN` by default, because the artifact bucket and
the key that encrypts it outlive a pipeline redeploy; a disposable pipeline (test fixtures,
ephemeral environments) sets `DESTROY` so a stack delete leaves nothing behind.

---

##### `useProxy`<sup>Optional</sup> <a name="useProxy" id="@cdklabs/cdk-cicd-wrapper.SupportResourcesProps.property.useProxy"></a>

```typescript
public readonly useProxy: boolean;
```

- *Type:* boolean

Whether an HTTP(S) proxy is configured (`ResolvedCicdConfig.proxy`). A managed VPC uses isolated subnets when true, matching Blueprint's `VPCProvider`.

---

##### `vpc`<sup>Optional</sup> <a name="vpc" id="@cdklabs/cdk-cicd-wrapper.SupportResourcesProps.property.vpc"></a>

```typescript
public readonly vpc: VpcConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.VpcConfig">VpcConfig</a>

VPC every CodeBuild project the pipeline creates runs in, if configured.

See `vpcNetworking`.

---

### SynthesizerConfig <a name="SynthesizerConfig" id="@cdklabs/cdk-cicd-wrapper.SynthesizerConfig"></a>

The resolved synthesizer choice.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.SynthesizerConfig.Initializer"></a>

```typescript
import { SynthesizerConfig } from '@cdklabs/cdk-cicd-wrapper'

const synthesizerConfig: SynthesizerConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SynthesizerConfig.property.type">type</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.SynthesizerType">SynthesizerType</a></code> | The synthesizer to install. |

---

##### `type`<sup>Required</sup> <a name="type" id="@cdklabs/cdk-cicd-wrapper.SynthesizerConfig.property.type"></a>

```typescript
public readonly type: SynthesizerType;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.SynthesizerType">SynthesizerType</a>

The synthesizer to install.

---

### VpcConfig <a name="VpcConfig" id="@cdklabs/cdk-cicd-wrapper.VpcConfig"></a>

VPC configuration for the pipeline's own CodeBuild projects (Blueprint `IVpcConfig`, migrated from `VPCProvider`).

Set `managedVpc` to have the wrapper create a VPC, or `vpcId` to look up an
existing one; setting neither -- the default -- runs every CodeBuild project without a VPC.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.VpcConfig.Initializer"></a>

```typescript
import { VpcConfig } from '@cdklabs/cdk-cicd-wrapper'

const vpcConfig: VpcConfig = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VpcConfig.property.managedVpc">managedVpc</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig">ManagedVpcConfig</a></code> | Create a new VPC with these settings. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VpcConfig.property.vpcId">vpcId</a></code> | <code>string</code> | Look up an existing VPC by id. |

---

##### `managedVpc`<sup>Optional</sup> <a name="managedVpc" id="@cdklabs/cdk-cicd-wrapper.VpcConfig.property.managedVpc"></a>

```typescript
public readonly managedVpc: ManagedVpcConfig;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ManagedVpcConfig">ManagedVpcConfig</a>

Create a new VPC with these settings.

---

##### `vpcId`<sup>Optional</sup> <a name="vpcId" id="@cdklabs/cdk-cicd-wrapper.VpcConfig.property.vpcId"></a>

```typescript
public readonly vpcId: string;
```

- *Type:* string

Look up an existing VPC by id.

A value starting with `resolve:ssm:` is resolved from the named
SSM parameter at synth time instead of being used literally (Blueprint `VPCFromLookUpStack` parity).

---

### VpcNetworking <a name="VpcNetworking" id="@cdklabs/cdk-cicd-wrapper.VpcNetworking"></a>

VPC + security groups + subnet selection an engine attaches to every CodeBuild project it creates.

#### Initializer <a name="Initializer" id="@cdklabs/cdk-cicd-wrapper.VpcNetworking.Initializer"></a>

```typescript
import { VpcNetworking } from '@cdklabs/cdk-cicd-wrapper'

const vpcNetworking: VpcNetworking = { ... }
```

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VpcNetworking.property.vpc">vpc</a></code> | <code>aws-cdk-lib.aws_ec2.IVpc</code> | The VPC to run CodeBuild's network interfaces in. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VpcNetworking.property.securityGroups">securityGroups</a></code> | <code>aws-cdk-lib.aws_ec2.ISecurityGroup[]</code> | Security group(s) to associate with those network interfaces. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.VpcNetworking.property.subnetSelection">subnetSelection</a></code> | <code>aws-cdk-lib.aws_ec2.SubnetSelection</code> | Which subnets to use. |

---

##### `vpc`<sup>Required</sup> <a name="vpc" id="@cdklabs/cdk-cicd-wrapper.VpcNetworking.property.vpc"></a>

```typescript
public readonly vpc: IVpc;
```

- *Type:* aws-cdk-lib.aws_ec2.IVpc

The VPC to run CodeBuild's network interfaces in.

---

##### `securityGroups`<sup>Optional</sup> <a name="securityGroups" id="@cdklabs/cdk-cicd-wrapper.VpcNetworking.property.securityGroups"></a>

```typescript
public readonly securityGroups: ISecurityGroup[];
```

- *Type:* aws-cdk-lib.aws_ec2.ISecurityGroup[]

Security group(s) to associate with those network interfaces.

Undefined for a looked-up VPC.

---

##### `subnetSelection`<sup>Optional</sup> <a name="subnetSelection" id="@cdklabs/cdk-cicd-wrapper.VpcNetworking.property.subnetSelection"></a>

```typescript
public readonly subnetSelection: SubnetSelection;
```

- *Type:* aws-cdk-lib.aws_ec2.SubnetSelection

Which subnets to use.

Undefined for a looked-up VPC (CodeBuild then selects private subnets).

---

## Classes <a name="Classes" id="Classes"></a>

### AccessLogsForBucketAspect <a name="AccessLogsForBucketAspect" id="@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspect"></a>

- *Implements:* aws-cdk-lib.IAspect

Configures S3 server access logging (destination + prefix) on every L1 `CfnBucket` it visits that does not already set a logging destination, matching Blueprint's default-on `AccessLogsForBucketPlugin`.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspect.Initializer"></a>

```typescript
import { AccessLogsForBucketAspect } from '@cdklabs/cdk-cicd-wrapper'

new AccessLogsForBucketAspect(props: AccessLogsForBucketAspectProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspect.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspectProps">AccessLogsForBucketAspectProps</a></code> | *No description.* |

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspect.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspectProps">AccessLogsForBucketAspectProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspect.visit">visit</a></code> | All aspects can visit an IConstruct. |

---

##### `visit` <a name="visit" id="@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspect.visit"></a>

```typescript
public visit(node: IConstruct): void
```

All aspects can visit an IConstruct.

###### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.AccessLogsForBucketAspect.visit.parameter.node"></a>

- *Type:* constructs.IConstruct

---




### AppConfig <a name="AppConfig" id="@cdklabs/cdk-cicd-wrapper.AppConfig"></a>

Reads the application configuration for the stage being synthesized.

Two ways in, in precedence order:

1. **Injected context.** When the app runs under `cdk-cicd exec`, the wrapper has already resolved
   the config for the active stage and put it in construct context under `cicd:config`.
   `AppConfig.of(scope)` reads that, so the app does no file I/O and cannot disagree with the
   stage it was deployed as.
2. **The config file.** With no injected context — a plain `cdk deploy` in the inner loop —
   resolution falls back to `config/<stage>.(json|yaml|yml)`, defaulting to `config/local.*`.

The returned value is intentionally untyped (`any`, i.e. `Object`/`dict`/`Map` in the other jsii
languages). The config shape belongs to the *application*, not to the wrapper, and jsii cannot
express a generic. TypeScript callers get zero-friction typing by annotating the target:

```ts
interface MyConfig { readonly application: string }
const config: MyConfig = AppConfig.of(this);
```


#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppConfig.load">load</a></code> | Read, merge and validate the config file directly, ignoring any injected context. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppConfig.of">of</a></code> | Resolve the configuration for the active stage: injected context first, config file second. |

---

##### `load` <a name="load" id="@cdklabs/cdk-cicd-wrapper.AppConfig.load"></a>

```typescript
import { AppConfig } from '@cdklabs/cdk-cicd-wrapper'

AppConfig.load(options?: AppConfigOptions)
```

Read, merge and validate the config file directly, ignoring any injected context.

Prefer `of(scope)`; reach for this only where there is no construct to read context from.

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.AppConfig.load.parameter.options"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.AppConfigOptions">AppConfigOptions</a>

---

##### `of` <a name="of" id="@cdklabs/cdk-cicd-wrapper.AppConfig.of"></a>

```typescript
import { AppConfig } from '@cdklabs/cdk-cicd-wrapper'

AppConfig.of(scope: IConstruct, options?: AppConfigOptions)
```

Resolve the configuration for the active stage: injected context first, config file second.

Throws a `ConfigError` when neither is available, or when what is found does not satisfy
`options.schema`. Left uncaught in a CDK app, that makes `cdk synth` exit non-zero and emit no
templates — the config is wrong, so no template built from it should exist.

###### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.AppConfig.of.parameter.scope"></a>

- *Type:* constructs.IConstruct

---

###### `options`<sup>Optional</sup> <a name="options" id="@cdklabs/cdk-cicd-wrapper.AppConfig.of.parameter.options"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.AppConfigOptions">AppConfigOptions</a>

---


#### Constants <a name="Constants" id="Constants"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.AppConfig.property.CONTEXT_KEY">CONTEXT_KEY</a></code> | <code>string</code> | Construct-context key the wrapper writes the resolved stage config under. |

---

##### `CONTEXT_KEY`<sup>Required</sup> <a name="CONTEXT_KEY" id="@cdklabs/cdk-cicd-wrapper.AppConfig.property.CONTEXT_KEY"></a>

```typescript
public readonly CONTEXT_KEY: string;
```

- *Type:* string

Construct-context key the wrapper writes the resolved stage config under.

---

### BuildImage <a name="BuildImage" id="@cdklabs/cdk-cicd-wrapper.BuildImage"></a>

A deployer-image build.

Constructed through the static factory (`BuildImage.docker({...})`) so the
shape a caller writes reads cleanly in every jsii language, mirroring {@link Repository }.


#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BuildImage.docker">docker</a></code> | Build and push a Docker deployer image to ECR. |

---

##### `docker` <a name="docker" id="@cdklabs/cdk-cicd-wrapper.BuildImage.docker"></a>

```typescript
import { BuildImage } from '@cdklabs/cdk-cicd-wrapper'

BuildImage.docker(props?: DockerBuildProps)
```

Build and push a Docker deployer image to ECR.

###### `props`<sup>Optional</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.BuildImage.docker.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.DockerBuildProps">DockerBuildProps</a>

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BuildImage.property.dockerfile">dockerfile</a></code> | <code>string</code> | Dockerfile path relative to the source root. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BuildImage.property.kind">kind</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.BuildImageKind">BuildImageKind</a></code> | The artifact kind. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BuildImage.property.tagStrategy">tagStrategy</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.ImageTagStrategy">ImageTagStrategy</a></code> | Image tag strategy. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BuildImage.property.repositoryName">repositoryName</a></code> | <code>string</code> | ECR repository name to push to; |

---

##### `dockerfile`<sup>Required</sup> <a name="dockerfile" id="@cdklabs/cdk-cicd-wrapper.BuildImage.property.dockerfile"></a>

```typescript
public readonly dockerfile: string;
```

- *Type:* string

Dockerfile path relative to the source root.

---

##### `kind`<sup>Required</sup> <a name="kind" id="@cdklabs/cdk-cicd-wrapper.BuildImage.property.kind"></a>

```typescript
public readonly kind: BuildImageKind;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.BuildImageKind">BuildImageKind</a>

The artifact kind.

---

##### `tagStrategy`<sup>Required</sup> <a name="tagStrategy" id="@cdklabs/cdk-cicd-wrapper.BuildImage.property.tagStrategy"></a>

```typescript
public readonly tagStrategy: ImageTagStrategy;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.ImageTagStrategy">ImageTagStrategy</a>

Image tag strategy.

---

##### `repositoryName`<sup>Optional</sup> <a name="repositoryName" id="@cdklabs/cdk-cicd-wrapper.BuildImage.property.repositoryName"></a>

```typescript
public readonly repositoryName: string;
```

- *Type:* string

ECR repository name to push to;

when undefined the pipeline provisions `<application>-deployer`.

---


### CdkCicd <a name="CdkCicd" id="@cdklabs/cdk-cicd-wrapper.CdkCicd"></a>

Explicit, reliable entry point for applying the wrapper when the `node -r` preload (m2-register) cannot take effect -- bundled apps (esbuild inlines its own `App`), native ESM, or a vendored aws-cdk-lib.

In those cases the preload patches nothing observable and
the app would synthesize silently non-compliant; a single `CdkCicd.attach(app)` in bin/ is
the documented one-liner that restores the wrapper.

It runs the SAME post-construction core as the preload (`applyWrapper`): cdk-nag Aspects and
stack tags, tree-wide. It cannot install the default synthesizer, because
`App.defaultStackSynthesizer` is constructor-only -- an app that needs a forced synthesizer
under a bundler passes it itself via `new App({ defaultStackSynthesizer })` (config-driven
forced roles are threaded in at wave 3).


#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CdkCicd.attach">attach</a></code> | Apply the wrapper's Aspects and tags to an already-constructed `App`, reading the injected `cicd:config` from its (fully-merged) context. |

---

##### `attach` <a name="attach" id="@cdklabs/cdk-cicd-wrapper.CdkCicd.attach"></a>

```typescript
import { CdkCicd } from '@cdklabs/cdk-cicd-wrapper'

CdkCicd.attach(app: App)
```

Apply the wrapper's Aspects and tags to an already-constructed `App`, reading the injected `cicd:config` from its (fully-merged) context.

Call it once: it is an alternative to the
preload, not a supplement, so calling it twice -- or alongside a preload that also ran -- adds
a second cdk-nag Aspect and evaluates the rules twice (tags are idempotent, same key wins).

###### `app`<sup>Required</sup> <a name="app" id="@cdklabs/cdk-cicd-wrapper.CdkCicd.attach.parameter.app"></a>

- *Type:* aws-cdk-lib.App

---



### CodePipelineEngine <a name="CodePipelineEngine" id="@cdklabs/cdk-cicd-wrapper.CodePipelineEngine"></a>

- *Implements:* <a href="#@cdklabs/cdk-cicd-wrapper.IEngine">IEngine</a>

Renders a resolved cicd config into an AWS CodePipeline.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.CodePipelineEngine.Initializer"></a>

```typescript
import { CodePipelineEngine } from '@cdklabs/cdk-cicd-wrapper'

new CodePipelineEngine(props?: CodePipelineEngineProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodePipelineEngine.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.CodePipelineEngineProps">CodePipelineEngineProps</a></code> | *No description.* |

---

##### `props`<sup>Optional</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.CodePipelineEngine.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CodePipelineEngineProps">CodePipelineEngineProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.CodePipelineEngine.render">render</a></code> | Build the pipeline under `scope`. |

---

##### `render` <a name="render" id="@cdklabs/cdk-cicd-wrapper.CodePipelineEngine.render"></a>

```typescript
public render(scope: Construct, props: EngineRenderProps): void
```

Build the pipeline under `scope`.

Side-effecting; returns nothing.

###### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.CodePipelineEngine.render.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.CodePipelineEngine.render.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.EngineRenderProps">EngineRenderProps</a>

---




### DestroyEncryptionKeysOnDeleteAspect <a name="DestroyEncryptionKeysOnDeleteAspect" id="@cdklabs/cdk-cicd-wrapper.DestroyEncryptionKeysOnDeleteAspect"></a>

- *Implements:* aws-cdk-lib.IAspect

Applies `RemovalPolicy.DESTROY` to every L2 KMS `Key` it visits, matching Blueprint's `DestroyEncryptionKeysOnDeletePlugin`. Attach it only to the scope(s) that should retain no orphaned keys after a stack deletion -- typically non-production stages.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.DestroyEncryptionKeysOnDeleteAspect.Initializer"></a>

```typescript
import { DestroyEncryptionKeysOnDeleteAspect } from '@cdklabs/cdk-cicd-wrapper'

new DestroyEncryptionKeysOnDeleteAspect()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DestroyEncryptionKeysOnDeleteAspect.visit">visit</a></code> | All aspects can visit an IConstruct. |

---

##### `visit` <a name="visit" id="@cdklabs/cdk-cicd-wrapper.DestroyEncryptionKeysOnDeleteAspect.visit"></a>

```typescript
public visit(node: IConstruct): void
```

All aspects can visit an IConstruct.

###### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.DestroyEncryptionKeysOnDeleteAspect.visit.parameter.node"></a>

- *Type:* constructs.IConstruct

---




### DisablePublicIPAssignmentForEC2Aspect <a name="DisablePublicIPAssignmentForEC2Aspect" id="@cdklabs/cdk-cicd-wrapper.DisablePublicIPAssignmentForEC2Aspect"></a>

- *Implements:* aws-cdk-lib.IAspect

Forces `MapPublicIpOnLaunch: false` on every VPC subnet it visits, matching Blueprint's default-on `DisablePublicIPAssignmentForEC2Plugin`.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.DisablePublicIPAssignmentForEC2Aspect.Initializer"></a>

```typescript
import { DisablePublicIPAssignmentForEC2Aspect } from '@cdklabs/cdk-cicd-wrapper'

new DisablePublicIPAssignmentForEC2Aspect()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DisablePublicIPAssignmentForEC2Aspect.visit">visit</a></code> | All aspects can visit an IConstruct. |

---

##### `visit` <a name="visit" id="@cdklabs/cdk-cicd-wrapper.DisablePublicIPAssignmentForEC2Aspect.visit"></a>

```typescript
public visit(node: IConstruct): void
```

All aspects can visit an IConstruct.

###### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.DisablePublicIPAssignmentForEC2Aspect.visit.parameter.node"></a>

- *Type:* constructs.IConstruct

---




### EncryptBucketOnTransitAspect <a name="EncryptBucketOnTransitAspect" id="@cdklabs/cdk-cicd-wrapper.EncryptBucketOnTransitAspect"></a>

- *Implements:* aws-cdk-lib.IAspect

Denies non-TLS `s3:PutObject` on every L2 `Bucket` it visits, matching Blueprint's default-on `EncryptBucketOnTransitPlugin`.

Only reaches the L2 `Bucket` construct (not `CfnBucket`), same as
Blueprint, since the resource policy is applied via `addToResourcePolicy`.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.EncryptBucketOnTransitAspect.Initializer"></a>

```typescript
import { EncryptBucketOnTransitAspect } from '@cdklabs/cdk-cicd-wrapper'

new EncryptBucketOnTransitAspect()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptBucketOnTransitAspect.visit">visit</a></code> | All aspects can visit an IConstruct. |

---

##### `visit` <a name="visit" id="@cdklabs/cdk-cicd-wrapper.EncryptBucketOnTransitAspect.visit"></a>

```typescript
public visit(node: IConstruct): void
```

All aspects can visit an IConstruct.

###### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.EncryptBucketOnTransitAspect.visit.parameter.node"></a>

- *Type:* constructs.IConstruct

---




### EncryptCloudWatchLogGroupsAspect <a name="EncryptCloudWatchLogGroupsAspect" id="@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspect"></a>

- *Implements:* aws-cdk-lib.IAspect

Sets the KMS key on every CloudWatch Log Group it visits that does not already have one, matching the encryption half of Blueprint's `EncryptCloudWatchLogGroupsPlugin` (the retention half is `LogRetentionAspect`).

Checks the CloudFormation resource type structurally (`CfnResource.isCfnResource` +
`cfnResourceType`) rather than `instanceof CfnLogGroup`: an `instanceof` check on an L1 CFN class
can silently miss a match when the app resolves a second, physically distinct copy of
`aws-cdk-lib` (the failure mode `m9-migrate-log-retention` hit against a real deploy).

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspect.Initializer"></a>

```typescript
import { EncryptCloudWatchLogGroupsAspect } from '@cdklabs/cdk-cicd-wrapper'

new EncryptCloudWatchLogGroupsAspect(props: EncryptCloudWatchLogGroupsAspectProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspect.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspectProps">EncryptCloudWatchLogGroupsAspectProps</a></code> | *No description.* |

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspect.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspectProps">EncryptCloudWatchLogGroupsAspectProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspect.visit">visit</a></code> | All aspects can visit an IConstruct. |

---

##### `visit` <a name="visit" id="@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspect.visit"></a>

```typescript
public visit(node: IConstruct): void
```

All aspects can visit an IConstruct.

###### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.EncryptCloudWatchLogGroupsAspect.visit.parameter.node"></a>

- *Type:* constructs.IConstruct

---




### EncryptSNSTopicOnTransitAspect <a name="EncryptSNSTopicOnTransitAspect" id="@cdklabs/cdk-cicd-wrapper.EncryptSNSTopicOnTransitAspect"></a>

- *Implements:* aws-cdk-lib.IAspect

Enforces encryption in transit on every L2 `Topic` it visits: denies non-TLS access and denies HTTP subscribe/receive, matching Blueprint's default-on `EncryptSNSTopicOnTransitPlugin`.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.EncryptSNSTopicOnTransitAspect.Initializer"></a>

```typescript
import { EncryptSNSTopicOnTransitAspect } from '@cdklabs/cdk-cicd-wrapper'

new EncryptSNSTopicOnTransitAspect()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EncryptSNSTopicOnTransitAspect.visit">visit</a></code> | All aspects can visit an IConstruct. |

---

##### `visit` <a name="visit" id="@cdklabs/cdk-cicd-wrapper.EncryptSNSTopicOnTransitAspect.visit"></a>

```typescript
public visit(node: IConstruct): void
```

All aspects can visit an IConstruct.

###### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.EncryptSNSTopicOnTransitAspect.visit.parameter.node"></a>

- *Type:* constructs.IConstruct

---




### LambdaDLQAspect <a name="LambdaDLQAspect" id="@cdklabs/cdk-cicd-wrapper.LambdaDLQAspect"></a>

- *Implements:* aws-cdk-lib.IAspect

Wires every L2 Lambda `Function` it visits that has no dead-letter queue/topic already set to a shared dead-letter queue, matching Blueprint's opt-in `LambdaDLQPlugin`.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.LambdaDLQAspect.Initializer"></a>

```typescript
import { LambdaDLQAspect } from '@cdklabs/cdk-cicd-wrapper'

new LambdaDLQAspect(props: LambdaDLQAspectProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LambdaDLQAspect.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.LambdaDLQAspectProps">LambdaDLQAspectProps</a></code> | *No description.* |

---

##### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.LambdaDLQAspect.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.LambdaDLQAspectProps">LambdaDLQAspectProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LambdaDLQAspect.visit">visit</a></code> | All aspects can visit an IConstruct. |

---

##### `visit` <a name="visit" id="@cdklabs/cdk-cicd-wrapper.LambdaDLQAspect.visit"></a>

```typescript
public visit(node: IConstruct): void
```

All aspects can visit an IConstruct.

###### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.LambdaDLQAspect.visit.parameter.node"></a>

- *Type:* constructs.IConstruct

---




### LogRetentionAspect <a name="LogRetentionAspect" id="@cdklabs/cdk-cicd-wrapper.LogRetentionAspect"></a>

- *Implements:* aws-cdk-lib.IAspect

Forces a default CloudWatch Logs retention period tree-wide, without overriding a log group that already sets one explicitly.

The wrapper's runtime injection hook (m2-attach/m2-register) applies
this automatically, driven by the app config's `logRetentionInDays`; add it directly with
`Aspects.of(scope).add(...)` for a narrower scope.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.LogRetentionAspect.Initializer"></a>

```typescript
import { LogRetentionAspect } from '@cdklabs/cdk-cicd-wrapper'

new LogRetentionAspect(props?: LogRetentionAspectProps)
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionAspect.Initializer.parameter.props">props</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionAspectProps">LogRetentionAspectProps</a></code> | *No description.* |

---

##### `props`<sup>Optional</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.LogRetentionAspect.Initializer.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionAspectProps">LogRetentionAspectProps</a>

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.LogRetentionAspect.visit">visit</a></code> | All aspects can visit an IConstruct. |

---

##### `visit` <a name="visit" id="@cdklabs/cdk-cicd-wrapper.LogRetentionAspect.visit"></a>

```typescript
public visit(node: IConstruct): void
```

All aspects can visit an IConstruct.

###### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.LogRetentionAspect.visit.parameter.node"></a>

- *Type:* constructs.IConstruct

---




### Repository <a name="Repository" id="@cdklabs/cdk-cicd-wrapper.Repository"></a>

The source repository for an Autopilot pipeline.

Constructed through the static factories rather than
directly, so the shape a caller writes (`Repository.github('org/repo')`) is the shape that reads
cleanly in every jsii language.


#### Static Functions <a name="Static Functions" id="Static Functions"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Repository.codecommit">codecommit</a></code> | An AWS CodeCommit repository by name. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Repository.codestarConnection">codestarConnection</a></code> | A provider reachable through an existing CodeStar/CodeConnections connection ARN. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Repository.github">github</a></code> | GitHub `owner/name`, deployed through a CodeStar connection. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Repository.s3">s3</a></code> | A versioned S3 object (`bucket/key`) as the source. |

---

##### `codecommit` <a name="codecommit" id="@cdklabs/cdk-cicd-wrapper.Repository.codecommit"></a>

```typescript
import { Repository } from '@cdklabs/cdk-cicd-wrapper'

Repository.codecommit(name: string, branch?: string)
```

An AWS CodeCommit repository by name.

###### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.Repository.codecommit.parameter.name"></a>

- *Type:* string

---

###### `branch`<sup>Optional</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.Repository.codecommit.parameter.branch"></a>

- *Type:* string

---

##### `codestarConnection` <a name="codestarConnection" id="@cdklabs/cdk-cicd-wrapper.Repository.codestarConnection"></a>

```typescript
import { Repository } from '@cdklabs/cdk-cicd-wrapper'

Repository.codestarConnection(name: string, connectionArn: string, branch?: string)
```

A provider reachable through an existing CodeStar/CodeConnections connection ARN.

###### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.Repository.codestarConnection.parameter.name"></a>

- *Type:* string

---

###### `connectionArn`<sup>Required</sup> <a name="connectionArn" id="@cdklabs/cdk-cicd-wrapper.Repository.codestarConnection.parameter.connectionArn"></a>

- *Type:* string

---

###### `branch`<sup>Optional</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.Repository.codestarConnection.parameter.branch"></a>

- *Type:* string

---

##### `github` <a name="github" id="@cdklabs/cdk-cicd-wrapper.Repository.github"></a>

```typescript
import { Repository } from '@cdklabs/cdk-cicd-wrapper'

Repository.github(name: string, branch?: string)
```

GitHub `owner/name`, deployed through a CodeStar connection.

###### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.Repository.github.parameter.name"></a>

- *Type:* string

---

###### `branch`<sup>Optional</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.Repository.github.parameter.branch"></a>

- *Type:* string

---

##### `s3` <a name="s3" id="@cdklabs/cdk-cicd-wrapper.Repository.s3"></a>

```typescript
import { Repository } from '@cdklabs/cdk-cicd-wrapper'

Repository.s3(name: string, branch?: string)
```

A versioned S3 object (`bucket/key`) as the source.

###### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.Repository.s3.parameter.name"></a>

- *Type:* string

---

###### `branch`<sup>Optional</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.Repository.s3.parameter.branch"></a>

- *Type:* string

---

#### Properties <a name="Properties" id="Properties"></a>

| **Name** | **Type** | **Description** |
| --- | --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Repository.property.branch">branch</a></code> | <code>string</code> | Tracked branch. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Repository.property.name">name</a></code> | <code>string</code> | Provider-specific identifier: `owner/repo` for GitHub, the repository/bucket name otherwise. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Repository.property.repositoryType">repositoryType</a></code> | <code><a href="#@cdklabs/cdk-cicd-wrapper.RepositorySourceType">RepositorySourceType</a></code> | The kind of source. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.Repository.property.connectionArn">connectionArn</a></code> | <code>string</code> | The CodeStar/CodeConnections connection ARN, set only for `CODESTAR_CONNECTION`. |

---

##### `branch`<sup>Required</sup> <a name="branch" id="@cdklabs/cdk-cicd-wrapper.Repository.property.branch"></a>

```typescript
public readonly branch: string;
```

- *Type:* string

Tracked branch.

Defaults to `main`.

---

##### `name`<sup>Required</sup> <a name="name" id="@cdklabs/cdk-cicd-wrapper.Repository.property.name"></a>

```typescript
public readonly name: string;
```

- *Type:* string

Provider-specific identifier: `owner/repo` for GitHub, the repository/bucket name otherwise.

---

##### `repositoryType`<sup>Required</sup> <a name="repositoryType" id="@cdklabs/cdk-cicd-wrapper.Repository.property.repositoryType"></a>

```typescript
public readonly repositoryType: RepositorySourceType;
```

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.RepositorySourceType">RepositorySourceType</a>

The kind of source.

---

##### `connectionArn`<sup>Optional</sup> <a name="connectionArn" id="@cdklabs/cdk-cicd-wrapper.Repository.property.connectionArn"></a>

```typescript
public readonly connectionArn: string;
```

- *Type:* string

The CodeStar/CodeConnections connection ARN, set only for `CODESTAR_CONNECTION`.

---


### RotateEncryptionKeysAspect <a name="RotateEncryptionKeysAspect" id="@cdklabs/cdk-cicd-wrapper.RotateEncryptionKeysAspect"></a>

- *Implements:* aws-cdk-lib.IAspect

Enables key rotation on every KMS key it visits, matching Blueprint's default-on `RotateEncryptionKeysPlugin`.

#### Initializers <a name="Initializers" id="@cdklabs/cdk-cicd-wrapper.RotateEncryptionKeysAspect.Initializer"></a>

```typescript
import { RotateEncryptionKeysAspect } from '@cdklabs/cdk-cicd-wrapper'

new RotateEncryptionKeysAspect()
```

| **Name** | **Type** | **Description** |
| --- | --- | --- |

---

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RotateEncryptionKeysAspect.visit">visit</a></code> | All aspects can visit an IConstruct. |

---

##### `visit` <a name="visit" id="@cdklabs/cdk-cicd-wrapper.RotateEncryptionKeysAspect.visit"></a>

```typescript
public visit(node: IConstruct): void
```

All aspects can visit an IConstruct.

###### `node`<sup>Required</sup> <a name="node" id="@cdklabs/cdk-cicd-wrapper.RotateEncryptionKeysAspect.visit.parameter.node"></a>

- *Type:* constructs.IConstruct

---




## Protocols <a name="Protocols" id="Protocols"></a>

### IEngine <a name="IEngine" id="@cdklabs/cdk-cicd-wrapper.IEngine"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.CodePipelineEngine">CodePipelineEngine</a>, <a href="#@cdklabs/cdk-cicd-wrapper.IEngine">IEngine</a>

Renders a resolved cicd config into a concrete pipeline.

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IEngine.render">render</a></code> | Build the pipeline under `scope`. |

---

##### `render` <a name="render" id="@cdklabs/cdk-cicd-wrapper.IEngine.render"></a>

```typescript
public render(scope: Construct, props: EngineRenderProps): void
```

Build the pipeline under `scope`.

Side-effecting; returns nothing.

###### `scope`<sup>Required</sup> <a name="scope" id="@cdklabs/cdk-cicd-wrapper.IEngine.render.parameter.scope"></a>

- *Type:* constructs.Construct

---

###### `props`<sup>Required</sup> <a name="props" id="@cdklabs/cdk-cicd-wrapper.IEngine.render.parameter.props"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.EngineRenderProps">EngineRenderProps</a>

---


### IStageProvider <a name="IStageProvider" id="@cdklabs/cdk-cicd-wrapper.IStageProvider"></a>

- *Implemented By:* <a href="#@cdklabs/cdk-cicd-wrapper.IStageProvider">IStageProvider</a>

Builds the application's stacks for one deployment stage into the given `cdk.Stage`. This is the Blueprint `IStackProvider` equivalent: CDK Pipelines deploys whatever stacks the provider adds to the stage. A behavioural interface (not a bare function) so it crosses the jsii boundary like Blueprint's providers did.

#### Methods <a name="Methods" id="Methods"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.IStageProvider.stacks">stacks</a></code> | Add the app's stacks for `context.stageName` into `stage`. |

---

##### `stacks` <a name="stacks" id="@cdklabs/cdk-cicd-wrapper.IStageProvider.stacks"></a>

```typescript
public stacks(stage: Stage, context: CdkPipelinesStageContext): void
```

Add the app's stacks for `context.stageName` into `stage`.

###### `stage`<sup>Required</sup> <a name="stage" id="@cdklabs/cdk-cicd-wrapper.IStageProvider.stacks.parameter.stage"></a>

- *Type:* aws-cdk-lib.Stage

---

###### `context`<sup>Required</sup> <a name="context" id="@cdklabs/cdk-cicd-wrapper.IStageProvider.stacks.parameter.context"></a>

- *Type:* <a href="#@cdklabs/cdk-cicd-wrapper.CdkPipelinesStageContext">CdkPipelinesStageContext</a>

---


## Enums <a name="Enums" id="Enums"></a>

### BuildImageKind <a name="BuildImageKind" id="@cdklabs/cdk-cicd-wrapper.BuildImageKind"></a>

What kind of artifact the build produces.

Only Docker today; kept an enum so more can slot in.

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.BuildImageKind.DOCKER">DOCKER</a></code> | *No description.* |

---

##### `DOCKER` <a name="DOCKER" id="@cdklabs/cdk-cicd-wrapper.BuildImageKind.DOCKER"></a>

---


### ConfigErrorKind <a name="ConfigErrorKind" id="@cdklabs/cdk-cicd-wrapper.ConfigErrorKind"></a>

Discriminator describing why configuration resolution/validation failed.

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ConfigErrorKind.MISSING_FILE">MISSING_FILE</a></code> | The resolved config file does not exist or cannot be read. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ConfigErrorKind.PARSE_ERROR">PARSE_ERROR</a></code> | The config file exists but is not valid JSON/YAML. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ConfigErrorKind.MISSING_KEY">MISSING_KEY</a></code> | A required config key is absent or blank. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ConfigErrorKind.MISSING_ATTRIBUTE">MISSING_ATTRIBUTE</a></code> | A required attribute (unconditional or within a satisfied conditional group) is absent or blank. |

---

##### `MISSING_FILE` <a name="MISSING_FILE" id="@cdklabs/cdk-cicd-wrapper.ConfigErrorKind.MISSING_FILE"></a>

The resolved config file does not exist or cannot be read.

---


##### `PARSE_ERROR` <a name="PARSE_ERROR" id="@cdklabs/cdk-cicd-wrapper.ConfigErrorKind.PARSE_ERROR"></a>

The config file exists but is not valid JSON/YAML.

---


##### `MISSING_KEY` <a name="MISSING_KEY" id="@cdklabs/cdk-cicd-wrapper.ConfigErrorKind.MISSING_KEY"></a>

A required config key is absent or blank.

---


##### `MISSING_ATTRIBUTE` <a name="MISSING_ATTRIBUTE" id="@cdklabs/cdk-cicd-wrapper.ConfigErrorKind.MISSING_ATTRIBUTE"></a>

A required attribute (unconditional or within a satisfied conditional group) is absent or blank.

---


### DeployModel <a name="DeployModel" id="@cdklabs/cdk-cicd-wrapper.DeployModel"></a>

How the deployed cloud assembly is produced.

See `task.md` D-deploy: two CodePipeline
implementations, efficiency first.

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeployModel.ASSEMBLY_PROMOTION">ASSEMBLY_PROMOTION</a></code> | The default, and what Blueprint did: the CI/build phase synthesizes every stage **once** and keeps `cdk.out`, which is promoted as the pipeline artifact. Each deploy stage consumes that assembly and performs no synth of its own -- one synth per pipeline run. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.DeployModel.DEPLOY_TIME_SYNTH">DEPLOY_TIME_SYNTH</a></code> | Each stage synthesizes at deploy time from code + pinned deps, against that stage's injected config. |

---

##### `ASSEMBLY_PROMOTION` <a name="ASSEMBLY_PROMOTION" id="@cdklabs/cdk-cicd-wrapper.DeployModel.ASSEMBLY_PROMOTION"></a>

The default, and what Blueprint did: the CI/build phase synthesizes every stage **once** and keeps `cdk.out`, which is promoted as the pipeline artifact. Each deploy stage consumes that assembly and performs no synth of its own -- one synth per pipeline run.

---


##### `DEPLOY_TIME_SYNTH` <a name="DEPLOY_TIME_SYNTH" id="@cdklabs/cdk-cicd-wrapper.DeployModel.DEPLOY_TIME_SYNTH"></a>

Each stage synthesizes at deploy time from code + pinned deps, against that stage's injected config.

The promoted unit is the code, not a baked assembly; CI synth is validation only. Costs one synth per
stage, and is the model to pick when a stage's template must be produced with that stage's
credentials (for example a synth-time lookup that only the target account can resolve).

---


### EngineType <a name="EngineType" id="@cdklabs/cdk-cicd-wrapper.EngineType"></a>

Which CI/CD engine renders the pipeline.

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EngineType.CODEPIPELINE">CODEPIPELINE</a></code> | The lightweight flat engine on raw `aws-cdk-lib/aws-codepipeline` -- the Autopilot default. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EngineType.CDK_PIPELINES">CDK_PIPELINES</a></code> | The Blueprint-compatible self-mutating pipeline on `aws-cdk-lib/pipelines` (Source -> Synth -> Assets -> one wave per stage). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.EngineType.GITHUB_ACTIONS">GITHUB_ACTIONS</a></code> | Renders a GitHub Actions workflow (`cdk-pipelines-github`) instead of an AWS-hosted pipeline (Blueprint `GitHubPipelinePlugin`, migrated). |

---

##### `CODEPIPELINE` <a name="CODEPIPELINE" id="@cdklabs/cdk-cicd-wrapper.EngineType.CODEPIPELINE"></a>

The lightweight flat engine on raw `aws-cdk-lib/aws-codepipeline` -- the Autopilot default.

Its deploy
stages re-invoke the app per stage, so the user's `bin` stays a plain single-stage app.

---


##### `CDK_PIPELINES` <a name="CDK_PIPELINES" id="@cdklabs/cdk-cicd-wrapper.EngineType.CDK_PIPELINES"></a>

The Blueprint-compatible self-mutating pipeline on `aws-cdk-lib/pipelines` (Source -> Synth -> Assets -> one wave per stage).

`cdk-cicd exec` assembles it by replaying the plain `bin` once per configured
stage (see runtime/pipeline-assembler), so the user's `bin` still needs no wrapper code.

---


##### `GITHUB_ACTIONS` <a name="GITHUB_ACTIONS" id="@cdklabs/cdk-cicd-wrapper.EngineType.GITHUB_ACTIONS"></a>

Renders a GitHub Actions workflow (`cdk-pipelines-github`) instead of an AWS-hosted pipeline (Blueprint `GitHubPipelinePlugin`, migrated).

Like `CDK_PIPELINES`, it needs every stage built as a `cdk.Stage`
inside one synth, so `cdk-cicd exec` assembles it the same way -- replaying the plain `bin` once per
configured stage.

---


### FieldKind <a name="FieldKind" id="@cdklabs/cdk-cicd-wrapper.FieldKind"></a>

Shape a required field must satisfy.

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.FieldKind.STRING">STRING</a></code> | A non-blank string. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.FieldKind.STRING_LIST">STRING_LIST</a></code> | A non-empty array. |

---

##### `STRING` <a name="STRING" id="@cdklabs/cdk-cicd-wrapper.FieldKind.STRING"></a>

A non-blank string.

---


##### `STRING_LIST` <a name="STRING_LIST" id="@cdklabs/cdk-cicd-wrapper.FieldKind.STRING_LIST"></a>

A non-empty array.

---


### ImageTagStrategy <a name="ImageTagStrategy" id="@cdklabs/cdk-cicd-wrapper.ImageTagStrategy"></a>

How the pushed image is tagged.

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ImageTagStrategy.GIT_SHA">GIT_SHA</a></code> | Tag with the resolved source commit sha (CODEBUILD_RESOLVED_SOURCE_VERSION). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.ImageTagStrategy.LATEST">LATEST</a></code> | Tag `latest` only. |

---

##### `GIT_SHA` <a name="GIT_SHA" id="@cdklabs/cdk-cicd-wrapper.ImageTagStrategy.GIT_SHA"></a>

Tag with the resolved source commit sha (CODEBUILD_RESOLVED_SOURCE_VERSION).

The default.

---


##### `LATEST` <a name="LATEST" id="@cdklabs/cdk-cicd-wrapper.ImageTagStrategy.LATEST"></a>

Tag `latest` only.

Simplest, but not immutable -- prefer GIT_SHA for real pipelines.

---


### RegionOrder <a name="RegionOrder" id="@cdklabs/cdk-cicd-wrapper.RegionOrder"></a>

Order in which a stage's regions are rolled out.

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RegionOrder.SEQUENTIAL">SEQUENTIAL</a></code> | One region after another (default). |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RegionOrder.PARALLEL">PARALLEL</a></code> | All regions at once. |

---

##### `SEQUENTIAL` <a name="SEQUENTIAL" id="@cdklabs/cdk-cicd-wrapper.RegionOrder.SEQUENTIAL"></a>

One region after another (default).

---


##### `PARALLEL` <a name="PARALLEL" id="@cdklabs/cdk-cicd-wrapper.RegionOrder.PARALLEL"></a>

All regions at once.

---


### RemovalPolicyValue <a name="RemovalPolicyValue" id="@cdklabs/cdk-cicd-wrapper.RemovalPolicyValue"></a>

Retention behaviour for a class of stateful resources.

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RemovalPolicyValue.RETAIN">RETAIN</a></code> | Keep the resource when its stack is deleted. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RemovalPolicyValue.DESTROY">DESTROY</a></code> | Delete the resource when its stack is deleted. |

---

##### `RETAIN` <a name="RETAIN" id="@cdklabs/cdk-cicd-wrapper.RemovalPolicyValue.RETAIN"></a>

Keep the resource when its stack is deleted.

---


##### `DESTROY` <a name="DESTROY" id="@cdklabs/cdk-cicd-wrapper.RemovalPolicyValue.DESTROY"></a>

Delete the resource when its stack is deleted.

---


### RepositorySourceType <a name="RepositorySourceType" id="@cdklabs/cdk-cicd-wrapper.RepositorySourceType"></a>

Where an Autopilot pipeline's source lives.

(Named `RepositorySourceType` rather than `RepositoryType`
because the latter is a distinct TS-only union alias already on the published Blueprint surface.)

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RepositorySourceType.GITHUB">GITHUB</a></code> | GitHub, via a CodeStar (CodeConnections) connection. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RepositorySourceType.CODECOMMIT">CODECOMMIT</a></code> | AWS CodeCommit. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RepositorySourceType.CODESTAR_CONNECTION">CODESTAR_CONNECTION</a></code> | Any provider reachable through a CodeStar/CodeConnections connection. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.RepositorySourceType.S3">S3</a></code> | A versioned S3 object as the source. |

---

##### `GITHUB` <a name="GITHUB" id="@cdklabs/cdk-cicd-wrapper.RepositorySourceType.GITHUB"></a>

GitHub, via a CodeStar (CodeConnections) connection.

---


##### `CODECOMMIT` <a name="CODECOMMIT" id="@cdklabs/cdk-cicd-wrapper.RepositorySourceType.CODECOMMIT"></a>

AWS CodeCommit.

---


##### `CODESTAR_CONNECTION` <a name="CODESTAR_CONNECTION" id="@cdklabs/cdk-cicd-wrapper.RepositorySourceType.CODESTAR_CONNECTION"></a>

Any provider reachable through a CodeStar/CodeConnections connection.

---


##### `S3` <a name="S3" id="@cdklabs/cdk-cicd-wrapper.RepositorySourceType.S3"></a>

A versioned S3 object as the source.

---


### SynthesizerType <a name="SynthesizerType" id="@cdklabs/cdk-cicd-wrapper.SynthesizerType"></a>

Which stack synthesizer the wrapper installs.

#### Members <a name="Members" id="Members"></a>

| **Name** | **Description** |
| --- | --- |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SynthesizerType.DEFAULT">DEFAULT</a></code> | `DefaultStackSynthesizer` -- the Autopilot default. |
| <code><a href="#@cdklabs/cdk-cicd-wrapper.SynthesizerType.APP_STAGING">APP_STAGING</a></code> | `AppStagingSynthesizer` -- opt-in, still alpha. |

---

##### `DEFAULT` <a name="DEFAULT" id="@cdklabs/cdk-cicd-wrapper.SynthesizerType.DEFAULT"></a>

`DefaultStackSynthesizer` -- the Autopilot default.

---


##### `APP_STAGING` <a name="APP_STAGING" id="@cdklabs/cdk-cicd-wrapper.SynthesizerType.APP_STAGING"></a>

`AppStagingSynthesizer` -- opt-in, still alpha.

---

