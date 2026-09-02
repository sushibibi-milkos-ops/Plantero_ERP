import tseslint from 'typescript-eslint';

/**
 * Ortak ESLint 9 flat config temeli (Node/TS paketleri için).
 * Her paket kendi `eslint.config.mjs` dosyasında bunu içe aktarır.
 */
export const baseIgnores = { ignores: ['node_modules/**', 'dist/**', '.turbo/**', 'coverage/**'] };

export const baseRules = {
  '@typescript-eslint/no-unused-vars': [
    'warn',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/consistent-type-imports': ['warn', { fixStyle: 'inline-type-imports' }],
  '@typescript-eslint/no-namespace': 'off',
};

export default tseslint.config(baseIgnores, ...tseslint.configs.recommended, {
  files: ['**/*.{ts,tsx,js,mjs}'],
  rules: baseRules,
});
