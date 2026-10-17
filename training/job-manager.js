// Job execution is deliberately not implemented as successful training
// until a real, tested training backend is selected.

const { spawn } = require('child_process');
const path = require('path');
const { PROJECT_ROOT } = require('../config/app-config');

function runWorker(args, options = {}) {
  if (
    !Array.isArray(args) ||
    args.some(value => typeof value !== 'string')
  ) {
    throw new TypeError(
      'Worker arguments must be an array of strings.'
    );
  }

  const python =
    options.pythonExecutable ||
    process.env.PYTHON_EXECUTABLE ||
    'python';

  const workerPath = path.join(
    PROJECT_ROOT,
    'training',
    'train_worker.py'
  );

  return spawn(
    python,
    [workerPath, ...args],
    {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        ...(options.env || {})
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  );
}

module.exports = {
  runWorker
};