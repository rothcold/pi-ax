import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', '**/node_modules/**', '.cache/**', 'src/ax/generated/**', 'dist/**'] },
  ...tseslint.configs.recommended,
);
