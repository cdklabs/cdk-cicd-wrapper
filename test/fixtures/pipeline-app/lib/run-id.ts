import * as fs from 'fs';
import * as path from 'path';

/**
 * The gate's run id, as seen from inside the deployed bundle.
 *
 * It CANNOT come from `CDK_CICD_TEST_RUN_ID`: this app is synthesized inside the pipeline's own
 * CodeBuild, which knows nothing about the harness that created the pipeline. So `m4-verify.sh` writes
 * `run.json` into the bundle it uploads, and that file is the source of truth. The env var is still
 * honoured as a fallback so a human can `npx cdk synth` the fixture locally, and `local` is the last
 * resort -- a measured lesson: an earlier run deployed `cdkcicdtest-local-app` while the gate asserted
 * on the run-id name, so the deploy looked green and the assertion looked broken.
 */
export function runId(): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'run.json'), 'utf8'));
    if (typeof parsed.runId === 'string' && parsed.runId.length > 0) {
      return parsed.runId;
    }
  } catch {
    // No run.json -- a local synth rather than a pipeline build.
  }
  return process.env.CDK_CICD_TEST_RUN_ID ?? 'local';
}
