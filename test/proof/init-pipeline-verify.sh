#!/usr/bin/env bash
# =============================================================================
# init-pipeline-verify -- proves the onboarding path on real AWS: an app straight from the current
# `cdk init app --language typescript` (TypeScript 7, a NodeNext tsconfig, the stack's env line
# commented out), with NO TypeScript pin and NO tsconfig edit, goes to a green pipeline through
# `cdk-cicd init` -> `cdk-cicd deploy-ci` -> git push.
#
#   1. cdk init; install the wrapper + CLI.
#   2. cdk-cicd init --existing writes cicd.config.ts and points cdk.json at `cdk-cicd exec`, warning
#      about the commented env line. The proof adds the CodeArtifact block the pre-release packages need.
#      With no --qualifier, init derives the bootstrap qualifier from the application (never the CDK
#      default) and writes it into cdk.json's @aws-cdk/core:bootstrapQualifier; the proof reads it back
#      there and checks that qualifier's bootstrap in every Region involved before anything is deployed.
#      The test account must carry it: `cdkcicdtes` for this proof's application names.
#   3. On the stock, account-agnostic stack, cdk-cicd synth --all warns (as before), and with
#      --require-account (what the pipeline Build passes) fails, naming the env line to add.
#   4. Uncomment that line and name the stack per stage with stageStackName (under the proof prefix, for the
#      teardown guard): synth passes, and the pipeline (synth-ci) and every stage template ask for the
#      configured qualifier's bootstrap and no other.
#   5. deploy-ci, push, and the pipeline runs Source -> Build -> UpdatePipeline -> every stage to Succeeded,
#      approving each gated stage; every stage's stack exists, side by side, in the one test account.
#   6. Tear everything down: the stage stacks, the pipeline stack, the CodeCommit repo.
#
# CDK_CICD_INIT_PROOF_STAGES (default `dev`) is what `cdk-cicd init --stages` gets; `dev,prod` deploys both
# stages into the same account and Region, as the README quick start does.
#
# CDK_CICD_INIT_PROOF_ENVS=explicit (with STAGES=dev,prod) follows the cdk-cicd-pipeline skill's "another Region
# or another account" path: `prod` gets the skill's `env: { account, region }` block, pointing at the secondary
# Region of the one test account, behind its manual approval, which the proof gives and then checks. A leg 0
# first checks CodeCommit, as the skill does. A stage in a different ACCOUNT is not exercised: the proof runs
# in one account.
#
#   bash test/proof/init-pipeline-verify.sh
#
# CDK_CICD_INIT_PROOF_PACKAGES picks where the wrapper and CLI come from:
#   codeartifact  (default) the CodeArtifact repo `cdk-cicd-wrapper/cdk-cicd-wrapper`, for unreleased changes;
#                 the proof adds the codeArtifact block the pipeline's builds then need, and creates the
#                 CodeCommit repository itself (`init --existing`).
#   npm           the public npm registry, exactly as the README quick start installs them: no codeArtifact
#                 block, and `deploy-ci` creates the repository. npm runs with its own empty config and cache.
#
# Uses the gitignored .env + ambient credentials, same as harness.sh; every AWS call is redacted.
# =============================================================================
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./harness.sh
. "$HERE/harness.sh"

# The Region comes from .env (CDK_CICD_TEST_REGION_PRIMARY), so load it before anything reads it.
load_env
readonly REGION="$CDK_CICD_TEST_REGION_PRIMARY"
readonly CA_DOMAIN='cdk-cicd-wrapper'
readonly CA_REPO='cdk-cicd-wrapper'
readonly POLL_INTERVAL=20
readonly POLL_MAX=90             # 30 min ceiling per wait
readonly PACKAGES="${CDK_CICD_INIT_PROOF_PACKAGES:-codeartifact}"
readonly STAGES="${CDK_CICD_INIT_PROOF_STAGES:-dev}"
# CDK_CICD_INIT_PROOF_AUDIT=check points the app's `audit` script at `cdk-cicd check` and approves a license and
# lock baseline first (license --fix, validate --fix), as the Audit guide recommends, so the Build runs every check.
readonly AUDIT="${CDK_CICD_INIT_PROOF_AUDIT:-}"
readonly ENVS="${CDK_CICD_INIT_PROOF_ENVS:-}"
case "$PACKAGES" in codeartifact|npm) ;; *) die "CDK_CICD_INIT_PROOF_PACKAGES must be codeartifact or npm, not '$PACKAGES'" ;; esac
case "$ENVS" in '') ;; explicit) [ "$STAGES" = dev,prod ] || die 'CDK_CICD_INIT_PROOF_ENVS=explicit needs CDK_CICD_INIT_PROOF_STAGES=dev,prod' ;;
  *) die "CDK_CICD_INIT_PROOF_ENVS must be empty or explicit, not '$ENVS'" ;; esac

app_name()       { printf 'cdkcicdtest-%s-init\n' "$CDK_CICD_TEST_RUN_ID"; }
pipeline_stack() { printf '%s-pipeline\n' "$(app_name)"; }   # defineCICD's `${application}-pipeline`
app_stack()      { printf 'cdkcicdtest-%s-initapp\n' "$CDK_CICD_TEST_RUN_ID"; }  # stageStackName base
stage_stack()    { printf '%s-%s\n' "$(app_stack)" "$1"; }                        # what stageStackName makes of it
stage_list()     { printf '%s\n' "${STAGES//,/ }"; }
# The bootstrap qualifiers the templates under $1 check for (/cdk-bootstrap/<q>/version), space-separated.
bootstrap_versions_in() {
  find "$1" -name '*.template.json' -exec grep -hoE '/cdk-bootstrap/[A-Za-z0-9_-]+/version' {} + 2>/dev/null \
    | sed -E 's#/cdk-bootstrap/([^/]+)/version#\1#' | sort -u | paste -sd' ' -
}
# Where a stage deploys: the pipeline's Region, or with ENVS=explicit the secondary Region for `prod`.
stage_region()   { if [ "$ENVS" = explicit ] && [ "$1" = prod ]; then printf '%s\n' "$CDK_CICD_TEST_REGION_SECONDARY"; else printf '%s\n' "$REGION"; fi; }

# Install packages from CodeArtifact (the @cdklabs scope only) through a throwaway npmrc.
npm_install_ca() {
  local dir="$1"; shift
  local npmrc
  npmrc="$(mktemp)"
  [ -n "$npmrc" ] || die 'mktemp failed'
  NPM_CONFIG_USERCONFIG="$npmrc" aws codeartifact login --tool npm --domain "$CA_DOMAIN" \
    --domain-owner "$CDK_CICD_TEST_ACCOUNT" --region "$REGION" --repository "$CA_REPO" --namespace cdklabs >/dev/null 2>&1 \
    || { rm -f "$npmrc"; die 'codeartifact login failed'; }
  ( cd "$dir" && NPM_CONFIG_USERCONFIG="$npmrc" npm install --no-audit --no-fund --prefer-online "$@" >/dev/null 2>&1 ) \
    || { rm -f "$npmrc"; die "npm install $* failed in $dir"; }
  rm -f "$npmrc"
}

# Install from the public npm registry with an empty npm config and a cache of this run's own, so nothing
# from the machine (a CodeArtifact login, a mirror, a warm cache) takes part.
npm_install_public() {
  local dir="$1"; shift
  printf 'registry=https://registry.npmjs.org/\n' >"$WORK/npmrc"
  ( cd "$dir" && NPM_CONFIG_USERCONFIG="$WORK/npmrc" npm_config_cache="$WORK/npm-cache" \
      npm install --no-audit --no-fund "$@" >/dev/null 2>&1 ) || die "npm install $* failed in $dir"
}

in_app() {
  ( cd "$APP_DIR" && CDK_DEFAULT_ACCOUNT="$CDK_CICD_TEST_ACCOUNT" CDK_DEFAULT_REGION="$REGION" \
      AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION" "$@" 2>&1 ) | redact
  return "${PIPESTATUS[0]}"
}

tag_stack() {
  local stack="$1" region="${2:-$REGION}"
  aws cloudformation describe-stacks --stack-name "$stack" --region "$region" >/dev/null 2>&1 || return 0
  aws cloudformation update-stack --stack-name "$stack" --region "$region" --use-previous-template \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --tags "Key=$TAG_KEY,Value=$CDK_CICD_TEST_RUN_ID" >/dev/null 2>&1 || true
  aws cloudformation wait stack-update-complete --stack-name "$stack" --region "$region" >/dev/null 2>&1 || true
}

# Print the log tail of every failed CodeBuild action of the pipeline.
dump_failed_logs() {
  local build grp stream
  for build in $(aws_masked codepipeline list-action-executions --pipeline-name "$(pipeline_stack)" --region "$REGION" \
      --query "actionExecutionDetails[?status=='Failed'].output.executionResult.externalExecutionId" --output text 2>/dev/null); do
    [ -n "$build" ] && [ "$build" != 'None' ] || continue
    read -r grp stream < <(aws_masked codebuild batch-get-builds --ids "$build" --region "$REGION" \
      --query 'builds[0].logs.[groupName,streamName]' --output text 2>/dev/null) || continue
    [ -n "$grp" ] && [ "$grp" != 'None' ] || continue
    aws_masked logs get-log-events --log-group-name "$grp" --log-stream-name "$stream" --region "$REGION" \
      --limit 60 --query 'events[].message' --output text 2>/dev/null | redact | sed 's/^/    | /' || true
  done
}

# Print the Build action's log lines that match $2, for the execution of commit $1.
build_log_lines() {
  local id build grp stream
  read -r id < <(aws_masked codepipeline list-pipeline-executions --pipeline-name "$(pipeline_stack)" --region "$REGION" \
    --query "pipelineExecutionSummaries[?sourceRevisions[0].revisionId=='$1'] | [0].pipelineExecutionId" --output text 2>/dev/null) || true
  read -r build < <(aws_masked codepipeline list-action-executions --pipeline-name "$(pipeline_stack)" --region "$REGION" \
    --filter "pipelineExecutionId=${id:-none}" \
    --query "actionExecutionDetails[?actionName=='Build'] | [0].output.executionResult.externalExecutionId" --output text 2>/dev/null) || true
  read -r grp stream < <(aws_masked codebuild batch-get-builds --ids "${build:-none}" --region "$REGION" \
    --query 'builds[0].logs.[groupName,streamName]' --output text 2>/dev/null) || true
  [ -n "${grp:-}" ] && [ "$grp" != None ] || { log 'no Build log found'; return 0; }
  info "Build log lines matching the checks:"
  aws_masked logs get-log-events --log-group-name "$grp" --log-stream-name "$stream" --region "$REGION" \
    --start-from-head --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' | grep -i "$2" | redact \
    | head -40 | sed 's/^/    | /' || true
}

# Approve every gated stage that is waiting (Approve-<stage> in progress), as a person would.
approve_waiting() {
  local stage state token
  for stage in $(stage_list); do
    state=''; token=''
    read -r state token < <(aws_masked codepipeline get-pipeline-state --name "$(pipeline_stack)" --region "$REGION" \
      --query "stageStates[?stageName=='$stage'] | [0].actionStates[?actionName=='Approve-$stage'] | [0].latestExecution.[status,token]" \
      --output text 2>/dev/null) || true   # aws_masked prints no trailing newline, so read returns 1 at EOF
    [ "${state:-}" = InProgress ] && [ -n "${token:-}" ] && [ "$token" != None ] || continue
    aws codepipeline put-approval-result --pipeline-name "$(pipeline_stack)" --region "$REGION" --stage-name "$stage" \
      --action-name "Approve-$stage" --token "$token" --result "summary=init proof $CDK_CICD_TEST_RUN_ID,status=Approved" \
      >/dev/null 2>&1 && info "approved Approve-$stage"
  done
}

# Wait for the pipeline execution of commit $1 to finish; print each stage's result.
wait_for_commit() {
  local sha="$1" i id status
  for (( i=0; i<POLL_MAX; i++ )); do
    approve_waiting
    read -r id status < <(aws_masked codepipeline list-pipeline-executions --pipeline-name "$(pipeline_stack)" --region "$REGION" \
      --query "pipelineExecutionSummaries[?sourceRevisions[0].revisionId=='$sha'] | [0].[pipelineExecutionId,status]" \
      --output text 2>/dev/null) || true
    case "${status:-}" in
      Succeeded|Failed|Stopped|Superseded) break ;;
    esac
    sleep "$POLL_INTERVAL"
  done
  aws_masked codepipeline list-action-executions --pipeline-name "$(pipeline_stack)" --region "$REGION" \
    --filter "pipelineExecutionId=${id:-none}" --query 'reverse(actionExecutionDetails)[].[stageName,status]' \
    --output text 2>/dev/null | sed 's/^/   /'
  [ "${status:-}" = 'Succeeded' ] && return 0
  log "pipeline execution for $sha ended '${status:-not started}'"; dump_failed_logs; return 1
}

destroy_all() {
  local rc=0 stack
  log 'teardown: app stack, pipeline stack, CodeCommit repo'
  local stage region entry entries=()
  for stage in $(stage_list); do entries+=("$(stage_stack "$stage") $(stage_region "$stage")"); done
  for entry in "${entries[@]}" "$(pipeline_stack) $REGION"; do
    stack="${entry% *}"; region="${entry##* }"
    tag_stack "$stack" "$region"
    if aws cloudformation describe-stacks --stack-name "$stack" --region "$region" >/dev/null 2>&1; then
      ( destroy_stack "$stack" "$region" ) || { log "teardown of $stack incomplete -- run harness.sh sweep"; rc=1; }
    fi
  done
  destroy_cc_repo "$(app_name)" "$REGION" || rc=1
  return "$rc"
}

# keep_or_destroy's hint names only the run id; this teardown also needs the stage options to find every stack.
on_exit() {
  keep_or_destroy
  [ "${CDK_CICD_KEEP:-}" = 1 ] && info "with CDK_CICD_INIT_PROOF_STAGES='$STAGES' CDK_CICD_INIT_PROOF_ENVS='$ENVS' set as for this run"
  rm -rf "${WORK:-}"
}

main() {
  load_env; ensure_run_id
  log "init-pipeline-verify (run $CDK_CICD_TEST_RUN_ID) region $REGION"
  local actual; actual="$(caller_account)" || die 'no caller identity'
  [ "$actual" = "$CDK_CICD_TEST_ACCOUNT" ] || die 'caller is not the test account'
  command -v git >/dev/null 2>&1 || die 'git is not on PATH'

  local rc=0 ts sha out
  WORK="$(mktemp -d)"; [ -n "$WORK" ] || die 'mktemp failed'
  APP_DIR="$WORK/$(app_name)"; mkdir -p "$APP_DIR"
  trap on_exit EXIT

  if [ "$ENVS" = explicit ]; then
    log "leg 0: the skill's prerequisite checks"
    aws_masked codecommit list-repositories --region "$REGION" >/dev/null && info "CodeCommit answers in $REGION" \
      || die "CodeCommit does not answer in $REGION"
  fi

  log 'leg 1: a fresh cdk init app, plus the wrapper and the CLI'
  ( cd "$APP_DIR" && npx -y aws-cdk@latest init app --language typescript >/dev/null 2>&1 ) || die 'cdk init failed'
  ts="$(node -p "require('$APP_DIR/node_modules/typescript/package.json').version")"
  info "cdk init installed TypeScript $ts; tsconfig module resolution: $(node -p "require('$APP_DIR/tsconfig.json').compilerOptions.moduleResolution")"
  if [ "$PACKAGES" = npm ]; then
    npm_install_public "$APP_DIR" @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli
  else
    npm_install_ca "$APP_DIR" @cdklabs/cdk-cicd-wrapper @cdklabs/cdk-cicd-wrapper-cli
  fi
  info "installed from $PACKAGES: wrapper $(node -p "require('$APP_DIR/node_modules/@cdklabs/cdk-cicd-wrapper/package.json').version"), CLI $(node -p "require('$APP_DIR/node_modules/@cdklabs/cdk-cicd-wrapper-cli/package.json').version"); node $(node --version)"

  log 'leg 2: cdk-cicd init'
  local existing=(--existing); [ "$PACKAGES" = npm ] && existing=()
  out="$(in_app npx cdk-cicd init --stages "$STAGES" ${existing[@]+"${existing[@]}"} --application "$(app_name)")" || { printf '%s\n' "$out" | redact; die 'cdk-cicd init failed'; }
  printf '%s\n' "$out" | grep -q "env line commented out" && info 'init warned about the commented env line' \
    || { log 'init did not warn about the commented env line'; rc=1; }
  [ "$(node -p "require('$APP_DIR/cdk.json').app")" = "npx cdk-cicd exec bin/$(app_name).ts" ] \
    && info 'cdk.json app now runs cdk-cicd exec' || { log 'cdk.json app was not rewritten'; rc=1; }
  # CodeArtifact-installed packages need the pipeline's builds to log in to it as well; npm ones do not.
  [ "$PACKAGES" = npm ] || node -e 'const f=process.argv[1];const fs=require("fs");const s=fs.readFileSync(f,"utf8");
    fs.writeFileSync(f,s.replace("  stages:", "  codeArtifact: { domain: \"" + process.argv[2] + "\", repository: \"" + process.argv[3] + "\", npmScope: \"cdklabs\" },\n  stages:"));' \
    "$APP_DIR/cicd.config.ts" "$CA_DOMAIN" "$CA_REPO"

  if [ "$ENVS" = explicit ]; then
    # The skill's "Plan the stages" block for a stage in another Region (or account), verbatim apart from values.
    node -e 'const f=process.argv[1];const fs=require("fs");const s=fs.readFileSync(f,"utf8");
      const from="  stages: [\x27dev\x27, \x27prod\x27],";
      if(!s.includes(from)) { console.error("stages line not found"); process.exit(1); }
      fs.writeFileSync(f,s.replace(from, "  stages: [\n    \x27dev\x27,\n    { name: \x27prod\x27, env: { account: \x27" + process.argv[2] + "\x27, region: \x27" + process.argv[3] + "\x27 } }, // manual approval by default\n  ],"));' \
      "$APP_DIR/cicd.config.ts" "$CDK_CICD_TEST_ACCOUNT" "$CDK_CICD_TEST_REGION_SECONDARY" || die 'could not give prod its env'
    info "prod gets env { account, region: $CDK_CICD_TEST_REGION_SECONDARY } in cicd.config.ts, as the skill shows"
  fi

  log "leg 2b: the configured bootstrap qualifier, and its bootstrap in every Region involved"
  # The skill's rule: read the qualifier that is configured, never assume one. init must have written the
  # application-derived one (lowercased letters and digits, at most 10) into cdk.json, not the CDK default.
  QUALIFIER="$(node -p "(require('$APP_DIR/cdk.json').context || {})['@aws-cdk/core:bootstrapQualifier'] || ''")"
  local expected; expected="$(printf '%s' "$(app_name)" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9' | cut -c1-10)"
  [ -n "$QUALIFIER" ] || die 'init wrote no @aws-cdk/core:bootstrapQualifier into cdk.json'
  [ "$QUALIFIER" = "$expected" ] || die "cdk.json qualifier '$QUALIFIER' is not the one derived from the application ('$expected')"
  info "cdk.json @aws-cdk/core:bootstrapQualifier is '$QUALIFIER', derived from the application"
  # A `cdk bootstrap` run in the project must target the project's own bootstrap stack, never `CDKToolkit`.
  local toolkit; toolkit="$(node -p "require('$APP_DIR/cdk.json').toolkitStackName || ''")"
  [ "$toolkit" = "CDKToolkit-$QUALIFIER" ] || die "cdk.json toolkitStackName is '$toolkit', not CDKToolkit-$QUALIFIER"
  info "cdk.json toolkitStackName is $toolkit"
  local r version row stage checked=""
  for r in $(for stage in $(stage_list); do stage_region "$stage"; done; printf '%s\n' "$REGION"); do
    case " $checked " in *" $r "*) continue ;; esac; checked="$checked $r"
    version="$(aws_masked ssm get-parameter --name "/cdk-bootstrap/$QUALIFIER/version" --region "$r" \
      --query Parameter.Value --output text)" || version=''
    # The skill's lookup: the bootstrap stack by its Qualifier parameter, since its name varies. Trust as a count.
    row="$(aws_masked cloudformation describe-stacks --region "$r" --output text --query \
      "Stacks[?Parameters[?ParameterKey=='Qualifier' && ParameterValue=='$QUALIFIER']] | [0].[StackName, Parameters[?ParameterKey=='TrustedAccounts'] | [0].ParameterValue]")" || row=''
    [ -n "$version" ] && [ "$version" != None ] && [ -n "$row" ] && [ "$row" != None ] \
      || die "no $QUALIFIER bootstrap in $r: bootstrap it before running this proof"
    info "bootstrap $QUALIFIER in $r: version $version, stack ${row%%$'\t'*}, trusting $(printf '%s' "${row#*$'\t'}" | tr ',' '\n' | grep -vc '^None$\|^$') other account(s)"
  done

  log 'leg 3: the stock, account-agnostic stack -- synth warns, and fails as the pipeline Build does'
  if out="$(in_app npx cdk-cicd synth --all)" && printf '%s\n' "$out" | grep -q 'bind no AWS account'; then
    info 'plain synth passed and warned, as it always has'
  else
    printf '%s\n' "$out" | tail -20 | redact; log 'plain synth did not pass with a warning'; rc=1
  fi
  if out="$(in_app npx cdk-cicd synth --all --require-account)"; then
    log 'synth --require-account passed on an account-agnostic stack'; rc=1
  elif printf '%s\n' "$out" | grep -q 'bind no AWS account'; then
    info "synth --require-account failed with: $(printf '%s\n' "$out" | grep -o 'bind no AWS account.*' | head -1 | cut -c1-100)"
  else
    printf '%s\n' "$out" | tail -20 | redact; log 'synth --require-account failed for another reason'; rc=1
  fi

  log 'leg 4: uncomment the env line and name the stack per stage; synth passes on TypeScript 7 with no pin'
  # The README's edit: the env line, plus stageStackName so stages that share an account get their own stacks.
  node -e 'const f=process.argv[1];const fs=require("fs");let s=fs.readFileSync(f,"utf8");
    const line="  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },";
    if(!s.includes(line)) { console.error("env line not found"); process.exit(1); }
    s=s.replace(line, line.replace("// ","") + "\n  stackName: stageStackName(\"" + process.argv[2] + "\"),");
    s=s.replace(/^import /m, "import { stageStackName } from \x27@cdklabs/cdk-cicd-wrapper\x27;\nimport ");
    if(!s.includes("stageStackName }")) { console.error("import not added"); process.exit(1); }
    fs.writeFileSync(f,s);' \
    "$APP_DIR/bin/$(app_name).ts" "$(app_stack)" || die 'could not edit bin/'
  out="$(in_app npx cdk-cicd synth --all --require-account)" && info 'synth --all --require-account passed' \
    || { printf '%s\n' "$out" | tail -20 | redact; die 'synth failed after binding the env'; }
  # Each stage synthesizes into cdk.out/<stage>/<region>/, the layout the skill describes, and asks only for the
  # configured qualifier's bootstrap.
  local dir asked
  for stage in $(stage_list); do
    dir="cdk.out/$stage/$(stage_region "$stage")"
    if ls "$APP_DIR/$dir/"*.template.json >/dev/null 2>&1; then info "stage $stage synthesized into $dir/"
    else log "no template for stage $stage in $dir/"; rc=1; fi
    asked="$(bootstrap_versions_in "$APP_DIR/$dir")"
    [ "$asked" = "$QUALIFIER" ] && info "stage $stage templates ask for the $QUALIFIER bootstrap only" \
      || { log "stage $stage templates ask for: '${asked}'"; rc=1; }
  done
  # The pipeline stack reads its qualifier only from the cdk.json context: synth it as deploy-ci would.
  rm -rf "$APP_DIR/cdk.out"
  out="$(in_app npx cdk-cicd synth-ci 2>&1)" || { printf '%s\n' "$out" | tail -20 | redact; die 'synth-ci failed'; }
  asked="$(bootstrap_versions_in "$APP_DIR/cdk.out")"
  [ "$asked" = "$QUALIFIER" ] && info "the pipeline template asks for the $QUALIFIER bootstrap only" \
    || { log "the pipeline template asks for: '${asked}'"; rc=1; }

  if [ "$AUDIT" = check ]; then
    log 'leg 4b: "audit": "cdk-cicd check", with an approved license and lock baseline'
    in_app npm pkg set scripts.audit='cdk-cicd check' || die 'could not set the audit script'
    in_app npx cdk-cicd license --fix >/dev/null || die 'license --fix failed'
    in_app npx cdk-cicd validate --fix >/dev/null || die 'validate --fix failed'
    out="$(in_app npm run audit 2>&1)" && info 'npm run audit passes locally' || { printf '%s\n' "$out" | tail -20 | redact; die 'npm run audit failed locally'; }
  fi

  log 'leg 5: deploy-ci, push, and a green pipeline'
  # codeartifact mode imports a repository the proof creates; npm mode lets deploy-ci create it, as the README does.
  [ "$PACKAGES" = npm ] || ensure_cc_repo "$(app_name)" "$REGION"
  in_app npx cdk-cicd deploy-ci --disposable >/dev/null || die 'deploy-ci failed'
  info "pipeline stack $(pipeline_stack) deployed"
  tag_stack "$(pipeline_stack)"
  ( cc_push "$APP_DIR" "$(app_name)" "$REGION" "init proof $CDK_CICD_TEST_RUN_ID" ) || die 'push failed'
  sha="$(git -C "$APP_DIR" rev-parse HEAD)"
  if wait_for_commit "$sha"; then
    info "the pipeline ran commit ${sha:0:7} to Succeeded"
  else
    rc=1
  fi
  [ "$AUDIT" = check ] && build_log_lines "$sha" 'cdk-cicd check\|validate\|licen\|audit\|security\|skip'
  local stack region
  for stage in $(stage_list); do
    stack="$(stage_stack "$stage")"; region="$(stage_region "$stage")"
    if [ "$(aws cloudformation describe-stacks --stack-name "$stack" --region "$region" \
          --query 'Stacks[0].StackStatus' --output text 2>/dev/null)" = 'CREATE_COMPLETE' ]; then
      info "stage $stage: the pipeline deployed $stack (CREATE_COMPLETE) in $region"
      tag_stack "$stack" "$region"   # now, so harness.sh sweep finds it even when CDK_CICD_KEEP=1 skips teardown
    else
      log "stage $stage: $stack is not deployed in $region"; rc=1
    fi
    # Every stage except dev and res is gated: its Approve-<stage> must have run, not been skipped.
    case "$stage" in dev|res) continue ;; esac
    if [ "$(aws_masked codepipeline get-pipeline-state --name "$(pipeline_stack)" --region "$REGION" \
          --query "stageStates[?stageName=='$stage'] | [0].actionStates[?actionName=='Approve-$stage'] | [0].latestExecution.status" \
          --output text)" = Succeeded ]; then
      info "stage $stage: deployed only after Approve-$stage Succeeded"
    else
      log "stage $stage: Approve-$stage did not run"; rc=1
    fi
  done

  [ "$rc" = 0 ] && log 'init-pipeline-verify PASSED: a fresh cdk init app reached a green pipeline, then torn down'
  return "$rc"
}

# `teardown` reclaims an interrupted run: CDK_CICD_TEST_RUN_ID=<id> bash init-pipeline-verify.sh teardown
if [ "${1:-}" = 'teardown' ]; then
  [ -n "${CDK_CICD_TEST_RUN_ID:-}" ] || die 'teardown needs CDK_CICD_TEST_RUN_ID'
  destroy_all
  exit $?
fi
main "$@"
