// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// The preload hook: `node -r <this> bin/app.js`. It subclasses aws-cdk-lib's App so that
// an UNTOUCHED `cdk init` app gets the wrapper's synthesizer, Aspects and tags with zero
// edits to bin/. `cdk-cicd exec` (m2-exec) is what puts this on the command line via the
// wrapper-owned `cdk.json` `app` key.
//
// Loaded for its side effect (the App patch) -- it exports nothing to a jsii consumer and
// is never referenced from src/index.ts, so it stays out of the assembly and is free to
// use dynamic require / module state. See docs/design/v3-devops-experience.md
// "Seam mechanics" for the spike that verified every assumption below.

import * as path from 'path';
import type { App, AppProps } from 'aws-cdk-lib';
import {
  applyWrapper,
  assertAppModuleLayout,
  markAppConstructed,
  readInjectedConfig,
  resolveSynthesizer,
} from './inject';

// Marks a class this hook has already wrapped, so a second load is a no-op.
const WRAPPED = Symbol.for('@cdklabs/cdk-cicd-wrapper.WrappedApp');

/**
 * Patch one aws-cdk-lib copy's `App` at its leaf module. Patching the leaf propagates to
 * `aws-cdk-lib` and `aws-cdk-lib/core`, which re-read it lazily -- one assignment covers
 * every import path into this copy. Idempotent and safe to call for a copy already patched.
 */
function patchCopy(cdkRoot: string, cdkVersion: string): void {
  // `require('aws-cdk-lib/core/lib/app')` is blocked by the package `exports` map
  // (ERR_PACKAGE_PATH_NOT_EXPORTED). Resolving the file path directly bypasses the map.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const appModule: { App: (new (props?: AppProps) => App) & { [WRAPPED]?: boolean } } = require(
    path.join(cdkRoot, 'core', 'lib', 'app.js'),
  );
  assertAppModuleLayout(appModule, cdkVersion);

  const OriginalApp = appModule.App;
  if (OriginalApp[WRAPPED] === true) {
    return;
  }

  class WrappedApp extends OriginalApp {
    constructor(props?: AppProps) {
      // Config must be read BEFORE super(): the synthesizer is a constructor-only App prop,
      // and there is no App node to call tryGetContext on until super() has run.
      const config = readInjectedConfig(props);

      // A synthesizer the user set explicitly wins -- the wrapper never overrides an
      // intentional choice.
      super({
        ...props,
        defaultStackSynthesizer: props?.defaultStackSynthesizer ?? resolveSynthesizer(config),
      });

      markAppConstructed();
      applyWrapper(this, config);
    }
  }
  Object.defineProperty(WrappedApp, WRAPPED, { value: true });

  appModule.App = WrappedApp;
}

/**
 * The distinct aws-cdk-lib copies reachable from the app entry, the cwd, and this hook's own
 * location. A published install has exactly one (aws-cdk-lib is a peer dep), but a monorepo or
 * workspace can have a copy next to this hook AND one next to the app -- and Node caches modules
 * by resolved path, so patching only one would silently miss the copy the app actually loads.
 * Patching every distinct copy is what makes the hook robust to that; same-version copies share
 * aws-cdk-lib's internal metadata keys, so cross-copy Aspects/Tags still apply.
 */
function distinctCdkCopies(): Array<{ cdkRoot: string; cdkVersion: string }> {
  const searchFrom = [process.argv[1] ? path.dirname(process.argv[1]) : undefined, process.cwd(), __dirname].filter(
    (p): p is string => p !== undefined,
  );

  const seen = new Set<string>();
  const copies: Array<{ cdkRoot: string; cdkVersion: string }> = [];
  for (const from of searchFrom) {
    let pkgJson: string;
    try {
      pkgJson = require.resolve('aws-cdk-lib/package.json', { paths: [from] });
    } catch {
      continue;
    }
    const cdkRoot = path.dirname(pkgJson);
    if (seen.has(cdkRoot)) {
      continue;
    }
    seen.add(cdkRoot);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    copies.push({ cdkRoot, cdkVersion: require(pkgJson).version });
  }
  return copies;
}

const copies = distinctCdkCopies();
if (copies.length === 0) {
  throw new Error(
    'cdk-cicd-wrapper: the App injection hook is loaded but cannot resolve aws-cdk-lib from the ' +
      'app entry, the working directory, or the wrapper itself. Install aws-cdk-lib, or use the ' +
      'explicit escape hatch CdkCicd.attach(app) in bin/.',
  );
}
for (const { cdkRoot, cdkVersion } of copies) {
  patchCopy(cdkRoot, cdkVersion);
}
