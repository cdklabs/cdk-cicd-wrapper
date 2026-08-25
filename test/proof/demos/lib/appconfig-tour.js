// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Tiny driver used by the `where-we-are` demo to exercise the compiled M1 config
// layer through its PUBLIC surface (the AppConfig class, from the package entry
// point lib/index.js) exactly the way a real consumer would -- ConfigLoader and the
// bare helpers are deliberately internal, so a consumer only ever sees AppConfig.
// It is NOT a test -- the jest suite under test/v3 is -- it just makes the demo show
// real behaviour rather than narrated claims. No account ids: the placeholders here
// are the same obvious fakes used across the fixtures.
//
//   node appconfig-tour.js <scenario>
const os = require('os');
const fs = require('fs');
const path = require('path');

const wrapper = require(process.env.WRAPPER_MAIN || '../../../../packages/@cdklabs/cdk-cicd-wrapper/lib/index.js');
const { AppConfig, ConfigErrorKind, FieldKind } = wrapper;

// An EXAMPLE schema -- the wrapper ships none of its own; the caller supplies it.
const SCHEMA = {
  requiredKeys: [{ path: 'aws.accountId', kind: FieldKind.STRING }],
  requiredAttributes: [{ path: 'application', kind: FieldKind.STRING }],
};

function write(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appconfig-tour-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents, 'utf-8');
  return file;
}

const scenario = process.argv[2];

if (scenario === 'json-yaml-identical') {
  // The same config, once as JSON and once as YAML, must load to the same object.
  const json = write('config.json', JSON.stringify({ application: 'shop', aws: { accountId: '111111111111', region: 'us-west-2' } }));
  const yaml = write('config.yaml', "application: shop\naws:\n  accountId: '111111111111'\n  region: us-west-2\n");
  const fromJson = AppConfig.load({ configFile: json, schema: SCHEMA });
  const fromYaml = AppConfig.load({ configFile: yaml, schema: SCHEMA });
  console.log('from JSON:', JSON.stringify(fromJson));
  console.log('from YAML:', JSON.stringify(fromYaml));
  console.log('identical:', JSON.stringify(fromJson) === JSON.stringify(fromYaml));
} else if (scenario === 'derived-account') {
  // A blank aws block plus CDK's ambient environment: the account/region are derived,
  // and the base defaults RETAIN stateful resources so the wrapper never widens blast radius.
  const file = write('config.yaml', 'application: shop\naws:\n');
  process.env.CDK_DEFAULT_ACCOUNT = '111111111111';
  process.env.CDK_DEFAULT_REGION = 'eu-west-1';
  console.log(JSON.stringify(AppConfig.load({ configFile: file, schema: SCHEMA }), null, 2));
} else if (scenario === 'missing-key') {
  // A required key is absent: load throws a typed ConfigError. At a CDK entry point this
  // makes `cdk synth` exit non-zero and emit no templates, rather than deploying a half-config.
  const file = write('config.json', JSON.stringify({ application: 'shop' }));
  try {
    AppConfig.load({ configFile: file, schema: SCHEMA });
    console.log('ERROR: expected a throw');
    process.exit(1);
  } catch (e) {
    console.log('threw:', e.constructor.name);
    console.log('kind: ', e.kind, '(ConfigErrorKind.MISSING_KEY =', ConfigErrorKind.MISSING_KEY + ')');
    console.log('message:', e.message);
  }
} else if (scenario === 'numeric-account') {
  // An unquoted 12-digit account id in YAML parses to a NUMBER. Coercing it would corrupt a
  // leading-zero account, so it is rejected exactly like an absent key.
  const file = write('config.yaml', 'application: shop\naws:\n  accountId: 111111111111\n');
  try {
    AppConfig.load({ configFile: file, schema: SCHEMA });
    console.log('ERROR: expected a throw');
    process.exit(1);
  } catch (e) {
    console.log('threw:', e.constructor.name, '/', e.kind);
    console.log('message:', e.message);
  }
} else {
  console.error('unknown scenario:', scenario);
  process.exit(2);
}
