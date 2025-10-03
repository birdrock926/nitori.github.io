module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  extends: ['eslint:recommended', 'plugin:astro/recommended', 'plugin:react/recommended', 'plugin:jsx-a11y/recommended', 'prettier'],
  plugins: ['@typescript-eslint', 'react', 'jsx-a11y', 'react-hooks'],
  settings: {
    react: {
      version: '18.2',
    },
  },
  overrides: [
    {
      files: ['*.astro'],
      parser: 'astro-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
        extraFileExtensions: ['.astro'],
      },
    },
    {
      files: ['*.ts', '*.tsx'],
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  ],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
  },
};
