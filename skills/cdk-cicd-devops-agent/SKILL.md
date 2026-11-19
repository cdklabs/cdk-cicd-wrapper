---
name: cdk-cicd-devops-agent
description: Connect a cdk-cicd-wrapper pipeline (a project with cicd.config.ts or deploy.config.ts) to AWS DevOps Agent, and work with the investigations it opens. Use when the user wants failed pipeline runs investigated automatically, wants to add `devopsAgent` to cicd.config.ts, or asks about a failed run of such a pipeline while `devopsAgent` is set or DevOps Agent, an Agent Space or a backlog task is mentioned. For a failed run without DevOps Agent, use cdk-cicd-pipeline-failure-investigation.
---

# cdk-cicd-wrapper and AWS DevOps Agent

`devopsAgent: { agentSpaceId }` in `cicd.config.ts` (or Repo 2's `deploy.config.ts`) makes the pipeline open
one AWS DevOps Agent investigation for every failed action, approvals excluded. This skill covers turning it
on and reading what comes back. Background: the
[DevOps Agent guide](https://cdklabs.github.io/cdk-cicd-wrapper/developer_guides/devops_agent.html).

## Ground rules

- Read before you change. Creating an Agent Space, associating accounts, editing `cicd.config.ts`
  and deploying the pipeline all change the user's AWS accounts. Ask before each one, and never run
  `cdk-cicd deploy-ci` or a deploy without an explicit yes.
- Investigations cost money: DevOps Agent bills per agent-second, and with the forwarder on every failed
  action opens one. Say so before you turn it on.
- Never write a DevOps Agent token into any project file, asked or not. Project MCP configs such as
  `.mcp.json` are usually committed; the token belongs in a user-scope MCP config or an environment
  variable. Write account IDs and Agent Space IDs into project files only with the user's yes.

## Tools to use

- **cdk-cicd MCP server** (`npx --no cdk-cicd mcp`, if the project's MCP client has it): `check_config`
  validates and summarizes the config, including the stages with their accounts and whether `devopsAgent`
  is set. `describe_pipeline` lists the rendered stages and actions. Without MCP, read `cicd.config.ts` and
  run `npx cdk-cicd synth-ci` / `npx cdk-cicd list-ci`.
- **DevOps Agent**: its MCP server (`https://connect.aidevops.<region>.api.aws/mcp`; in Claude Code via the
  `aws-agents-for-devsecops` plugin), or the AWS CLI `aws devops-agent ...`.
- **Live pipeline state**: the AWS MCP Server or the AWS CLI (`codepipeline`, `codebuild`, `logs`,
  `cloudformation`).

## Workflow A: turn the forwarder on

1. **Read the pipeline.** Run `check_config` (or read `cicd.config.ts`). Note the engine, the pipeline
   account and Region, and each stage's account and Regions. If the engine is `github-actions`
   (`EngineType.GITHUB_ACTIONS` in the config), stop: the
   forwarder needs CodePipeline. Tell the user that DevOps Agent's own GitHub integration links deployments
   to investigations instead.
2. **Find or create the Agent Space** in the **pipeline account**, in a Region DevOps Agent supports.
   Ask whether one exists: `aws devops-agent list-agent-spaces --region <region>` (Agent Spaces are regional). Creating one (console, or CloudFormation
   `AWS::DevOpsAgent::AgentSpace`) is the user's decision. Record its ID, the last segment of its ARN.
3. **Associate the accounts** the agent must read: the pipeline account (CodeBuild logs, pipeline state)
   and every stage account from step 1 (CloudFormation stacks). Without these, investigations run but
   find no evidence. This is an IAM decision for the user; point them to "Connecting multiple AWS
   accounts" in the DevOps Agent guide rather than writing trust policies yourself.
4. **Edit the config.** Add `devopsAgent: { agentSpaceId: '<id>' }` to `defineCICD({...})`. Add `region`
   only when the Agent Space is in another Region than the pipeline. For container mode, add it to
   `deploy.config.ts` as well (Repo 2 deploys; Repo 1 only builds images).
5. **Check it.** `check_config` must show `devopsAgent`, and `describe_pipeline` must show
   `devopsAgentForwarder`. Without MCP, `npx cdk-cicd synth-ci` must succeed.
6. **Deploy, with the user's yes.** For the `codepipeline` and `cdk-pipelines` engines, pushing the change
   runs the whole pipeline, application stages included, and its `SelfMutate` step adds the forwarder. A
   container-mode pipeline (Repo 1 or Repo 2) has no self-update stage, so there the user re-runs
   `npx --no cdk-cicd deploy-ci`. That also works for the other engines when the user does not want a full
   run.
7. **Offer the investigation skill to DevOps Agent.** In the Agent Space operator web app, under Knowledge →
   Skills → Add skill → Import from repository, the user can import
   `https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/skills/cdk-cicd-pipeline-failure-investigation`.
   That needs a GitHub account connected to the Agent Space. Alternatively, zip that directory and upload it.
   It teaches DevOps Agent the pipeline's layout, so its investigations start in the right log or stack.

## Workflow B: a pipeline run failed

1. **Find the investigation.** Its title is `Pipeline <pipeline> failed at <stage> / <action>`. List recent
   ones: `aws devops-agent list-backlog-tasks --agent-space-id <id> --region <region>`, or ask the DevOps
   Agent MCP server.
   Read its findings and mitigation plan before you look anywhere else.
2. **No investigation?** The forwarder may be off (`check_config`) or the action may be an approval. If
   neither, check the forwarder's dead-letter queue in the pipeline stack: anything there was not handed to
   DevOps Agent, and the message shows why.
3. **Investigate yourself when needed.** Follow the `cdk-cicd-pipeline-failure-investigation` skill. Go
   from the failed action to its CodeBuild log (pipeline account), or to the stack events (stage account),
   using the live-state tools above.
4. **Propose the fix in the project.** Most fixes land in the application code, its `cicd.config.ts`, or the
   stage account's bootstrap. Show the change and let the user decide whether to retry the stage or push a fix.
