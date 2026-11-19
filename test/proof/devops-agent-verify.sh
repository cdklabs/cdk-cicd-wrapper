#!/usr/bin/env bash
# =============================================================================
# devops-agent-verify -- prove the `devopsAgent` investigations and knowledge levels against real AWS:
#
#   1. an Agent Space (CloudFormation AWS::DevOpsAgent::AgentSpace), tagged and disposable;
#   2. a versioned S3 source bucket, with source.zip uploaded BEFORE the pipeline exists, so the pipeline's
#      first execution gets past Source and the only failure is the one forced below;
#   3. a flat CodePipeline from this checkout's wrapper (test/proof/devops-agent-app/app.js) whose Build
#      fails on purpose, with devopsAgent pointing at (1);
#   4. assert: the `knowledge` level published its two skills into the Agent Space; the Build action FAILS;
#      the `investigations` level opens exactly the investigation it should ("Pipeline <name> failed at
#      Build / Build", INVESTIGATION, HIGH); and the forwarder's dead-letter queue is empty;
#   5. cancel that investigation (it only exists to be observed), then destroy all three stacks through the
#      harness teardown guard, and the log groups their functions and build projects left behind.
#
# usage: devops-agent-verify.sh            run the proof (CDK_CICD_KEEP=1 leaves it deployed)
#        devops-agent-verify.sh teardown   tear down a kept run (needs CDK_CICD_TEST_RUN_ID)
#
# CDK_CICD_DEVOPS_AGENT_WATCH=1 makes it a run to watch: the Agent Space also gets the operator web app
# (IAM), this account as its monitored account (so the agent can read the build log and the stacks), and
# the pipeline's own skills (the `knowledge` level). The investigation is left to finish and the run
# is kept; tear it down with `teardown` when done. The resources follow AWS's CloudFormation
# getting-started guide for DevOps Agent, with run-scoped role names (devops-agent-app/agentspace_template.py).
#
# Region: CDK_CICD_TEST_REGION_PRIMARY from .env (DevOps Agent must be available there). Costs: one
# DevOps Agent investigation (billed per agent-second until it is cancelled), one short CodeBuild run, and
# the pipeline's KMS key, which AWS deletes after its 7-day waiting period. Compile the wrapper first
# (`npx projen compile` in packages/@cdklabs/cdk-cicd-wrapper): the app loads its lib/.
# =============================================================================
set -euo pipefail
DA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./harness.sh
. "$DA_DIR/harness.sh"

readonly POLL_INTERVAL=15
readonly BUILD_POLL_MAX=60   # 15 min for the pipeline to reach a failed Build
readonly TASK_POLL_MAX=40    # 10 min for the investigation to appear after that
readonly CDK_CLI_VERSION="${CDK_CLI_VERSION:-2.1149.0}"
readonly FINISHED_TASK_STATES='COMPLETED FAILED TIMED_OUT CANCELED SKIPPED'

load_env
ensure_run_id
readonly REGION="$CDK_CICD_TEST_REGION_PRIMARY"
readonly RUN="$CDK_CICD_TEST_RUN_ID"
readonly SPACE_STACK="cdkcicdtest-$RUN-agentspace"
readonly SRC_STACK="cdkcicdtest-$RUN-devopssrc"
readonly PIPE_STACK="cdkcicdtest-$RUN-devopspipeline"
readonly PIPELINE="cdkcicdtest-$RUN-devops"
readonly BUCKET="cdkcicdtest-$RUN-devopssrc-$CDK_CICD_TEST_ACCOUNT"
readonly TITLE="Pipeline $PIPELINE failed at Build / Build"
readonly APP="node '$DA_DIR/devops-agent-app/app.js'"
readonly CDK=(npx -y "aws-cdk@$CDK_CLI_VERSION")
readonly WATCH="${CDK_CICD_DEVOPS_AGENT_WATCH:-0}"
if [ "$WATCH" = 1 ]; then export CDK_CICD_KEEP=1; fi
WORK="$(mktemp -d "${TMPDIR:-/tmp}/cdkcicdtest-$RUN-devops.XXXX")"
readonly WORK
CREDS_OK=0

stack_exists() { aws cloudformation describe-stacks --stack-name "$1" --region "$REGION" >/dev/null 2>&1; }

# The log groups Lambda and CodeBuild create on first use are not stack resources, so deleting the stack
# leaves them. Their names come from the stack's own functions and projects, read before the stack goes, so
# only groups this run's stacks produced are ever removed -- and only after the guard let that stack go.
stack_log_groups() {
  { aws_masked cloudformation list-stack-resources --region "$REGION" --stack-name "$1" --output text \
      --query "StackResourceSummaries[?ResourceType=='AWS::Lambda::Function' || ResourceType=='AWS::CodeBuild::Project'].[ResourceType, PhysicalResourceId]" \
      || true; printf '\n'; } | while read -r type id; do
    [ -n "${id:-}" ] && [ "$id" != None ] || continue
    case "$type" in
      AWS::Lambda::Function) printf '/aws/lambda/%s\n' "$id" ;;
      AWS::CodeBuild::Project) printf '/aws/codebuild/%s\n' "$id" ;;
    esac
  done
}

# Cancel every investigation this run's failure opened that is still running, so a run that dies after
# the forwarder fired does not keep billing agent time. (Both loops here end their input with a newline:
# aws_masked prints none, and `while read` silently drops an unterminated last line -- which, for a run
# with one investigation, is the only one.)
cancel_open_tasks() {
  local space task_id state
  stack_exists "$SPACE_STACK" || return 0
  space="$(aws_masked cloudformation describe-stacks --region "$REGION" --stack-name "$SPACE_STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='AgentSpaceId'].OutputValue" --output text || true)"
  [ -n "$space" ] && [ "$space" != None ] || return 0
  { aws_masked devops-agent list-backlog-tasks --region "$REGION" --agent-space-id "$space" --output text \
      --query "tasks[?title=='$TITLE'].[taskId, status]" || true; printf '\n'; } | while read -r task_id state; do
    [ -n "${task_id:-}" ] || continue
    case " $FINISHED_TASK_STATES " in *" $state "*) continue ;; esac
    if aws_masked devops-agent update-backlog-task --region "$REGION" --agent-space-id "$space" \
      --task-id "$task_id" --task-status CANCELED >/dev/null; then
      info "cancelled investigation $task_id (was $state)"
    else
      info "could not cancel investigation $task_id ($state)"
    fi
  done
}

# Called by keep_or_destroy (harness.sh) and by `teardown`.
destroy_all() {
  local status=0 stack groups group
  cancel_open_tasks
  for stack in "$PIPE_STACK" "$SRC_STACK" "$SPACE_STACK"; do
    stack_exists "$stack" || continue
    groups="$(stack_log_groups "$stack")"
    if ( destroy_stack "$stack" "$REGION" ); then
      while read -r group; do
        [ -n "$group" ] || continue
        if aws_masked logs delete-log-group --region "$REGION" --log-group-name "$group" 2>/dev/null; then
          info "deleted log group $group"
        fi
      done <<<"$groups"
    else
      status=1
    fi
  done
  return "$status"
}

on_exit() {
  local status=$?
  set +e
  # Nothing to tear down, and no AWS call worth making, until the credentials are proven to be the test
  # account's.
  if [ "$CREDS_OK" = 1 ]; then keep_or_destroy || status=1; fi
  rm -rf "${WORK:?}"
  exit "$status"
}
trap on_exit EXIT

log "creds and bootstrap"
cmd_creds
CREDS_OK=1

if [ "${1:-}" = teardown ]; then
  export CDK_CICD_KEEP=0
  exit 0 # the EXIT trap tears the run down
fi

cmd_check_bootstrap

# The app loads the wrapper's compiled lib/: a source file newer than it means the proof would test stale code.
wrapper="$(repo_root)/packages/@cdklabs/cdk-cicd-wrapper"
marker="$wrapper/lib/engine/devops-agent/DevOpsAgentIntegration.js"
[ -f "$marker" ] || die "no compiled wrapper at $marker -- run 'npx projen compile' in $wrapper"
if [ -n "$(find "$wrapper/src" -name '*.ts' -newer "$marker" -print -quit)" ]; then
  die "the wrapper's lib/ is older than its src/ -- run 'npx projen compile' in $wrapper"
fi

if [ "$WATCH" = 1 ]; then
  log "1. Agent Space ($SPACE_STACK) with web app, account association and skill"
else
  log "1. Agent Space ($SPACE_STACK)"
fi
# The template is written as JSON by python, so the skill's Markdown needs no YAML escaping.
python3 -I "$DA_DIR/devops-agent-app/agentspace_template.py" "$WATCH" "$RUN" >"$WORK/agentspace.json"
aws cloudformation deploy --region "$REGION" --stack-name "$SPACE_STACK" --template-file "$WORK/agentspace.json" \
  --tags "$TAG_KEY=$RUN" --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset 2>&1 | redact
AGENT_SPACE_ID="$(aws_masked cloudformation describe-stacks --region "$REGION" --stack-name "$SPACE_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='AgentSpaceId'].OutputValue" --output text)"
[ -n "$AGENT_SPACE_ID" ] && [ "$AGENT_SPACE_ID" != None ] || die 'no AgentSpaceId output'
info "agent space $AGENT_SPACE_ID"
export PROOF_REGION="$REGION" PROOF_AGENT_SPACE_ID="$AGENT_SPACE_ID" CDK_CICD_TEST_RUN_ID CDK_CICD_TEST_ACCOUNT

log "2. source bucket ($SRC_STACK) and source.zip"
"${CDK[@]}" deploy "$SRC_STACK" --app "$APP" --output "$WORK/cdk.out" --require-approval never 2>&1 | redact | tail -5
printf 'cdk-cicd-wrapper devopsAgent proof %s\n' "$RUN" >"$WORK/README.md"
( cd "$WORK" && zip -q source.zip README.md )
aws s3 cp --region "$REGION" "$WORK/source.zip" "s3://$BUCKET/source.zip" --only-show-errors 2>&1 | redact

log "3. pipeline ($PIPE_STACK), Build fails on purpose"
"${CDK[@]}" deploy "$PIPE_STACK" --app "$APP" --output "$WORK/cdk.out" --require-approval never 2>&1 | redact | tail -5
resource() {
  aws_masked cloudformation list-stack-resources --region "$REGION" --stack-name "$PIPE_STACK" --output text \
    --query "StackResourceSummaries[?ResourceType=='$1' && contains(LogicalResourceId, '$2')].PhysicalResourceId | [0]"
}
FUNCTION="$(resource AWS::Lambda::Function DevOpsAgentForwarder)"
QUEUE_URL="$(resource AWS::SQS::Queue DevOpsAgentDeadLetters)"
[ -n "$FUNCTION" ] && [ "$FUNCTION" != None ] || die 'the pipeline stack has no DevOps Agent forwarder function'
[ -n "$QUEUE_URL" ] && [ "$QUEUE_URL" != None ] || die 'the pipeline stack has no forwarder dead-letter queue'
info "forwarder function $FUNCTION"

log "4a. the knowledge level published its skills"
skills="$(aws_masked devops-agent list-assets --region "$REGION" --agent-space-id "$AGENT_SPACE_ID" --asset-type skill \
  --query 'length(items[?starts_with(metadata.name, `cdk-cicd-`)])' --output text || true)"
[ "$skills" = 2 ] || die "expected the 2 cdk-cicd skills in the Agent Space, found ${skills:-none}"
info "skills: cdk-cicd-pipeline-failure-investigation + cdk-cicd-pipeline-map-cdkcicdtest-$RUN"

log "4b. wait for the Build action to fail"
build_state=''
for _ in $(seq "$BUILD_POLL_MAX"); do
  build_state="$(aws_masked codepipeline list-action-executions --region "$REGION" --pipeline-name "$PIPELINE" \
    --query "actionExecutionDetails[?stageName=='Build' && actionName=='Build'] | [0].status" --output text || true)"
  case "$build_state" in Failed) break ;; Succeeded) die 'Build succeeded -- the forced failure did not happen' ;; esac
  sleep "$POLL_INTERVAL"
done
[ "$build_state" = Failed ] || die "Build did not fail in time (last status: ${build_state:-none})"
info "Build: Failed"

log "4c. wait for the forwarder's investigation"
task=''
for _ in $(seq "$TASK_POLL_MAX"); do
  task="$(aws_masked devops-agent list-backlog-tasks --region "$REGION" --agent-space-id "$AGENT_SPACE_ID" \
    --query "tasks[?title=='$TITLE'] | [0].[taskId, taskType, priority, status]" --output text || true)"
  [ -n "$task" ] && [ "$task" != None ] && break
  sleep "$POLL_INTERVAL"
done
[ -n "$task" ] && [ "$task" != None ] || die "no investigation titled '$TITLE' appeared"
read -r TASK_ID TASK_TYPE TASK_PRIORITY TASK_STATUS <<<"$task"
info "task $TASK_ID: $TASK_TYPE $TASK_PRIORITY $TASK_STATUS"
[ "$TASK_TYPE" = INVESTIGATION ] || die "task type is $TASK_TYPE, expected INVESTIGATION"
[ "$TASK_PRIORITY" = HIGH ] || die "task priority is $TASK_PRIORITY, expected HIGH"
count="$(aws_masked devops-agent list-backlog-tasks --region "$REGION" --agent-space-id "$AGENT_SPACE_ID" \
  --query "length(tasks[?title=='$TITLE'])" --output text)"
[ "$count" = 1 ] || die "expected exactly one investigation for the failure, found $count"

log "4d. nothing in the dead-letter queue"
dead="$(aws_masked sqs get-queue-attributes --region "$REGION" --queue-url "$QUEUE_URL" \
  --attribute-names ApproximateNumberOfMessages --query 'Attributes.ApproximateNumberOfMessages' --output text)"
[ "$dead" = 0 ] || die "the forwarder dead-letter queue holds $dead message(s)"
info "dead-letter queue: empty"

log "PASS: a failed pipeline action opened one DevOps Agent investigation ($TASK_ID)"
if [ "$WATCH" = 1 ]; then
  log "watch it: AWS console -> DevOps Agent ($REGION) -> Agent Space cdkcicdtest-$RUN -> Launch web app -> Incidents"
  info "investigation: \"$TITLE\" ($TASK_ID)"
  info "or: aws devops-agent get-backlog-task --region $REGION --agent-space-id $AGENT_SPACE_ID --task-id $TASK_ID"
fi
# Step 5 (cancel the investigation, tear down) is the EXIT trap, so it also runs when an assertion fails.
