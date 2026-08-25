import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: true,
  }),
  {
    ignores: [
      'node_modules/**/*',
      'cdk.out/**/*',
      '**/*.js',
      '**/*.d.ts',
    ],
  },
  {
    rules: {
      '@stylistic/eol-last': ['off'], // workshop code removes the tailing spaces, that is why this rule disabled
      '@typescript-eslint/no-useless-constructor': ['warn'], // AWS CDK example code has useless constructor
    },
  },
);