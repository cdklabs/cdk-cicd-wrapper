#!/usr/bin/env bash
# Empirical proof of the migration-continuity claim: matching v2's stack name makes a v3 deploy an
# in-place UPDATE (stateful resource PRESERVED); a mismatched name is a new stack (resource RECREATED).
# Uses the real stageStackName helper to generate the names. Sandbox only; every stack is cdkcicdtest-
# prefixed + tagged and torn down. No account id is printed.
set -uo pipefail
export PATH=/home/gyalai/.nvm/versions/node/v24.19.0/bin:/usr/bin:/bin:$PATH
cd /home/gyalai/.workspace/src/cdk-cicd-wrapper; set -a; . ./.env; set +a
R=us-west-2; RUN="r$(date -u +%Y%m%d%H%M%S)"; TAG="cdk-cicd-wrapper-test"
redact(){ sed -E "s/${CDK_CICD_TEST_ACCOUNT}/<account>/g"; }
NAMING=./packages/@cdklabs/cdk-cicd-wrapper/lib/v3/config/naming.js

# The two names the helper produces for base `cdkcicdtest-<run>-mig`, stage dev:
V2NAME=$(CDK_STAGE=dev node -e "console.log(require('$NAMING').stageStackName('cdkcicdtest-${RUN}-mig',{stageFirst:true,uppercaseStage:true}))")
V3NAME=$(CDK_STAGE=dev node -e "console.log(require('$NAMING').stageStackName('cdkcicdtest-${RUN}-mig'))")
echo "v2-match name : $V2NAME"
echo "v3-default name: $V3NAME"

TA=$(mktemp --suffix=.json); TB=$(mktemp --suffix=.json)
echo '{"Resources":{"Data":{"Type":"AWS::S3::Bucket","Properties":{}}}}' > "$TA"
echo '{"Resources":{"Data":{"Type":"AWS::S3::Bucket","Properties":{}},"Marker":{"Type":"AWS::SSM::Parameter","Properties":{"Type":"String","Value":"migrated"}}}}' > "$TB"

phys(){ aws cloudformation describe-stack-resources --stack-name "$1" --region "$R" --query "StackResources[?LogicalResourceId=='Data'].PhysicalResourceId" --output text 2>/dev/null; }
status(){ aws cloudformation describe-stacks --stack-name "$1" --region "$R" --query 'Stacks[0].StackStatus' --output text 2>/dev/null; }

echo "== step 1: deploy the 'v2' stack ($V2NAME) with a stateful bucket"
aws cloudformation deploy --stack-name "$V2NAME" --template-file "$TA" --region "$R" --tags "$TAG=$RUN" >/dev/null 2>&1
B1=$(phys "$V2NAME"); echo "   bucket physical id: $B1  (status $(status "$V2NAME"))"

echo "== step 2: 'migrate' -- SAME name, changed template (adds a param)"
aws cloudformation deploy --stack-name "$V2NAME" --template-file "$TB" --region "$R" --tags "$TAG=$RUN" >/dev/null 2>&1
B2=$(phys "$V2NAME"); echo "   bucket physical id: $B2  (status $(status "$V2NAME"))"

echo "== step 3: NEGATIVE -- deploy under the mismatched v3-default name ($V3NAME)"
aws cloudformation deploy --stack-name "$V3NAME" --template-file "$TA" --region "$R" --tags "$TAG=$RUN" >/dev/null 2>&1
B3=$(phys "$V3NAME"); echo "   bucket physical id: $B3  (status $(status "$V3NAME"))"

echo "== verdict"
[ -n "$B1" ] && [ "$B1" = "$B2" ] && echo "   PRESERVED: same-name migrate kept the bucket ($B1 == $B2)" || echo "   FAIL: bucket changed on same-name migrate ($B1 -> $B2)"
[ -n "$B3" ] && [ "$B3" != "$B1" ] && echo "   RECREATED: mismatched name made a NEW bucket ($B3 != $B1)" || echo "   unexpected: mismatched name reused the bucket"

echo "== teardown (guarded on the cdkcicdtest- prefix + our tag)"
for S in "$V2NAME" "$V3NAME"; do
  case "$S" in cdkcicdtest-*|DEV-cdkcicdtest-*) ;; *) echo "   guard: refusing $S"; continue ;; esac
  t=$(aws cloudformation describe-stacks --stack-name "$S" --region "$R" --query "Stacks[0].Tags[?Key=='$TAG']|[0].Value" --output text 2>/dev/null)
  [ "$t" = "$RUN" ] || { echo "   guard: $S not tagged for this run ($t) -- leaving"; continue; }
  b=$(phys "$S"); [ -n "$b" ] && aws s3 rb "s3://$b" --force --region "$R" >/dev/null 2>&1
  aws cloudformation delete-stack --stack-name "$S" --region "$R" >/dev/null 2>&1
  aws cloudformation wait stack-delete-complete --stack-name "$S" --region "$R" >/dev/null 2>&1 && echo "   deleted $S" || echo "   delete issued for $S"
done
rm -f "$TA" "$TB"
echo "== done"
