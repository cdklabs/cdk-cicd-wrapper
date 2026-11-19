# AWS DevOps Agent

[AWS DevOps Agent](https://docs.aws.amazon.com/devopsagent/latest/userguide/about-aws-devops-agent.html)
investigates operational problems in your AWS accounts and reports a root cause and a mitigation plan.
DevOps Agent has no CodePipeline connector, so it does not see a failed CodePipeline run on its own. With
`devopsAgent` set, {{ project_name }} opens an investigation for you every time an action of your pipeline
fails.

## What it deploys

Everything goes into the pipeline stack, in the pipeline's account and Region:

- an EventBridge rule that matches `CodePipeline Action Execution State Change` events in state `FAILED`,
  for this stack's pipelines only (the rule matches their ARNs). A rejected or timed-out manual approval
  also ends `FAILED`, but it is a decision, not an incident, so the rule leaves approvals out;
- a Lambda function that turns each matching event into one
  [`CreateBacklogTask`](https://docs.aws.amazon.com/devopsagent/latest/APIReference/API_CreateBacklogTask.html)
  call with task type `INVESTIGATION` and priority `HIGH`;
- an IAM policy on that function that allows `aidevops:CreateBacklogTask` on your one Agent Space and
  nothing else;
- an SQS dead-letter queue (SQS-managed encryption, TLS only, 14 days retention) for failures the
  function could not hand over.

The function has no inbound endpoint and signs its calls with its own IAM role. There is no webhook and no
shared secret to store or rotate. A failed hand-over is retried: EventBridge retries delivery to the
function, and the function retries a failing call (for example a throttled one) twice more within six
hours. What still fails ends up in the dead-letter queue, so a missed investigation is visible there rather
than lost. Each request carries an idempotency token derived from the action execution, so a redelivered
event asks for the same investigation again instead of a new one.

The investigation names the pipeline, stage, action, execution ID and attempt, the action's error code and
summary, and links to the action's details and the execution in the console.

## Before you start

1. **Create an Agent Space in the pipeline account**, in a
   [Region DevOps Agent supports](https://docs.aws.amazon.com/devopsagent/latest/userguide/about-aws-devops-agent-supported-regions.html).
   Use the console, or CloudFormation (`AWS::DevOpsAgent::AgentSpace`; see
   [Getting started using CloudFormation](https://docs.aws.amazon.com/devopsagent/latest/userguide/getting-started-with-aws-devops-agent-getting-started-with-aws-devops-agent-using-aws-cloudformation.html)).
   Note its ID, which is the last segment of its ARN (`…:agentspace/<id>`).
2. **Associate the accounts it may investigate**: the pipeline account, where the CodeBuild logs and
   pipeline state live, and each stage account the pipeline deploys to, where the CloudFormation stacks
   live. See
   [Connecting multiple AWS accounts](https://docs.aws.amazon.com/devopsagent/latest/userguide/configuring-integrations-and-knowledge-connecting-multiple-aws-accounts.html).
   Without these associations an investigation runs but cannot read the evidence.

3. **Optional: teach DevOps Agent the pipeline's layout.** Import the
   [`cdk-cicd-pipeline-failure-investigation` skill](../skills/index.md#add-to-aws-devops-agent) into the Agent
   Space. It tells the agent what each stage and action runs and where its log or stack lives, so an
   investigation starts in the right place.

The wrapper does not create the Agent Space or the account associations. Both are long-lived and shared
between pipelines, and access to the operator web app is decided by people. The wrapper only forwards
failures.

## Configuration

```typescript
// cicd.config.ts
export default defineCICD({
  application: 'my-app',
  repository: Repository.codecommit('my-app'),
  stages: ['dev', 'prod'],
  devopsAgent: { agentSpaceId: 'a1b2c3d4-EXAMPLE' },
});
```

| Field          | Type     | Default                  | Purpose                                                   |
| -------------- | -------- | ------------------------ | --------------------------------------------------------- |
| `agentSpaceId` | `string` | — (required)             | The Agent Space that receives the investigations. Pass the ID, not the ARN. |
| `region`       | `string` | the pipeline's Region    | The Agent Space's Region, when it differs from the pipeline's. |

The same field works in container mode, in Repo 2's `deploy.config.ts`. There it covers the CD pipeline
and every target's auto-deploy pipeline:

```typescript
// deploy.config.ts
export default defineDeployment({
  image: '111111111111.dkr.ecr.eu-west-1.amazonaws.com/my-app-deployer:1.4.2',
  repository: Repository.codecommit('my-app-deploy-config'),
  targets: [{ stage: 'prod', env: { account: '222222222222', region: 'eu-west-1' } }],
  devopsAgent: { agentSpaceId: 'a1b2c3d4-EXAMPLE' },
});
```

Set in Repo 1's `cicd.config.ts`, it forwards failures of the image-build pipeline.

To deploy it, push the change: the `codepipeline` and `cdk-pipelines` engines run the whole pipeline and their
self-update step adds the forwarder. A container-mode pipeline (Repo 1 or Repo 2) has no self-update stage, so
run `npx --no cdk-cicd deploy-ci` there. That also works for the other engines without a full run. Changing
`agentSpaceId` or `region` later updates the function in place. Removing `devopsAgent` removes the rule and
the function.

## Cost

DevOps Agent bills investigations by the agent-second
([pricing](https://aws.amazon.com/devops-agent/pricing/)). With this feature on, every failed action opens
one investigation, including failures you would have recognised at a glance. The Lambda and the
EventBridge rule cost next to nothing.

## Limits

- **CodePipeline only.** `defineCICD` rejects `devopsAgent` with `engine: EngineType.GITHUB_ACTIONS`, which
  emits no CodePipeline events. DevOps Agent's GitHub integration links deployments to its investigations,
  but does not open one per failed workflow run; see
  [Connecting to CI/CD pipelines](https://docs.aws.amazon.com/devopsagent/latest/userguide/configuring-integrations-and-knowledge-connecting-to-cicd-pipelines-index.html).
- **The Agent Space must be in the pipeline account.** The function's policy and its calls target the
  pipeline stack's own account.
- **Failed actions only.** A stopped or superseded execution is not a failure and opens nothing, and
  neither does a rejected or timed-out manual approval.
