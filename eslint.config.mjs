import securityRules from '@firebase/eslint-plugin-security-rules';
import * as parser from '@firebase/eslint-plugin-security-rules/parser';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*'],
  },
  {
    files: ['firestore.rules'],
    languageOptions: {
      parser,
    },
    plugins: {
      '@firebase/security-rules': securityRules,
    },
    rules: {
      ...securityRules.configs.recommended.rules,
    },
  },
];
