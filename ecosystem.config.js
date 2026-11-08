module.exports = {
  apps: [
    {
      name: 'evss-web',
      script: '.next/standalone/server.js',
      env: { PORT: 3000, NODE_ENV: 'production' },
      interpreter: 'node',
      instances: 1,
      autorestart: true,
    },
    {
      name: 'evss-worker',
      script: 'src/scripts/worker.ts',
      interpreter: 'node_modules/.bin/tsx',
      instances: 1,
      autorestart: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
