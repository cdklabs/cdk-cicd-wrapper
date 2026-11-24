# Agent skills

The repository's [`skills/`](https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/skills) directory holds
agent skills in the open `SKILL.md` format: Markdown instructions that teach an AI agent how to work with a
{{ project_name }} project. Each skill is a directory with a `SKILL.md` and, optionally, a `references/`
directory. Nothing in them runs code.

| Skill | For | What it does |
| --- | --- | --- |
| [`cdk-cicd-pipeline`](https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/skills/cdk-cicd-pipeline) | coding agents | Launches a pipeline for a CDK app (also from a fresh `cdk init` app) into one or more accounts and Regions, and adds stacks and stages to it. Hands a failed run to the failure-investigation or DevOps Agent skill. |
| [`cdk-cicd-devops-agent`](https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/skills/cdk-cicd-devops-agent) | coding agents | Turns on the [DevOps Agent levels](../developer_guides/devops_agent.md) a pipeline needs, and works with the investigations they open. |
| [`cdk-cicd-pipeline-failure-investigation`](https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/skills/cdk-cicd-pipeline-failure-investigation) | AWS DevOps Agent and coding agents | Investigates a failed run: what each stage and action runs, where its log or stack lives (pipeline account vs stage account), and the usual root causes. |

## Install for a coding agent

With the [`skills`](https://www.npmjs.com/package/skills) installer, from your project:

```bash
npx skills add cdklabs/cdk-cicd-wrapper
```

It lists the skills and asks which to install, and for which agents. `--skill <name>` installs one. Or copy a
skill's directory into your agent's skills directory yourself (for Claude Code, `.claude/skills/<name>/` in the
project or `~/.claude/skills/<name>/`).

The skills work best next to the [MCP server](../mcp/index.md), which gives the agent `check_config` and
`describe_pipeline`.

## Add to AWS DevOps Agent

DevOps Agent [accepts skills](https://docs.aws.amazon.com/devopsagent/latest/userguide/about-aws-devops-agent-devops-agent-skills-index.html)
in the same format. The pipeline's `devopsAgent.knowledge` level publishes `cdk-cicd-pipeline-failure-investigation`
for you, next to a map of that pipeline. To add a skill by hand, open **Knowledge** → **Skills** → **Add skill** in
the Agent Space's operator web app:

- **Import from repository** with the skill's GitHub directory URL, for example
  `https://github.com/cdklabs/cdk-cicd-wrapper/tree/main/skills/cdk-cicd-pipeline-failure-investigation`.
  This needs a GitHub account connected to the Agent Space, and **Sync** pulls later changes.
- **Upload skill** with a zip of the skill directory (`SKILL.md` at the root of the zip).

Select the agent types that should use it: **On-demand** and **Incident RCA** for failed-pipeline
investigations, or keep **Generic** to make it available to all of them.
