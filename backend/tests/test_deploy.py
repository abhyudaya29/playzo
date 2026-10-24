"""Exercise deployment command routing with fake Docker/Git, without external changes."""
import os
import pty
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class DeployTests(unittest.TestCase):
    def test_release_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['deploy.sh', 'evolve.sh']:
                shutil.copy(ROOT / name, root / name)
            (root / '.env.release').write_text('')
            binary = root / 'bin'
            binary.mkdir()
            for command in ['git', 'docker']:
                path = binary / command
                path.write_text(
                    '#!/usr/bin/env bash\n'
                    'printf "%s\\n" "' + command + ' $*" >> "$TEST_LOG"\n'
                    'if [[ "' + command + '" == git ]]; then\n'
                    '  case "$*" in\n'
                    '    "rev-parse --abbrev-ref @{upstream}") echo origin/main ;;\n'
                    '    "rev-parse HEAD") echo old ;;\n'
                    '    "rev-parse origin/main") echo new ;;\n'
                    '  esac\n'
                    'fi\n'
                    'if [[ "' + command + '" == docker && "$*" == *"app.evolve --check"* && "${PENDING:-0}" == 1 ]]; then exit 1; fi\n'
                    'if [[ "' + command + '" == docker && "$*" == *"app.check_routes"* && "${MISSING_ROUTES:-0}" == 1 ]]; then exit 1; fi\n'
                )
                path.chmod(0o755)
            log = root / 'calls'
            env = {**os.environ, 'PATH': f'{binary}:{os.environ["PATH"]}', 'TEST_LOG': str(log)}
            def run(*args, pending='0', answer=None, missing_routes='0'):
                log.write_text('')
                command = [str(root / 'deploy.sh'), *args]
                if answer is None:
                    result = subprocess.run(command, env={**env, 'PENDING': pending, 'MISSING_ROUTES': missing_routes}, capture_output=True, text=True)
                else:
                    master, slave = pty.openpty()
                    try:
                        process = subprocess.Popen(command, env={**env, 'PENDING': pending, 'MISSING_ROUTES': missing_routes}, stdin=slave, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                        os.write(master, answer.encode())
                        stdout, stderr = process.communicate(timeout=10)
                        result = subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
                    finally:
                        os.close(master)
                        os.close(slave)
                return result, log.read_text()
            result, calls = run('--check')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn('git pull', calls)
            self.assertNotIn('build', calls)
            result, calls = run('--apply-evolutions')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('git pull --ff-only', calls)
            self.assertIn('app.evolve', calls)
            self.assertNotIn('app.evolve --check', calls)
            self.assertLess(calls.index('app.evolve'), calls.index('--remove-orphans'))
            self.assertIn('app.check_routes --url http://api:8000', calls)
            self.assertLess(calls.index('--remove-orphans'), calls.index('app.check_routes'))
            result, calls = run('--skip-pull', '--apply-evolutions', missing_routes='1')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('app.check_routes', calls)
            self.assertNotIn('ps --format', calls)
            result, calls = run('--skip-pull', '--skip-evolutions', pending='1')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('app.evolve --check', calls)
            self.assertNotIn('--remove-orphans', calls)
            result, calls = run('--skip-pull')
            self.assertEqual(result.returncode, 2)
            self.assertNotIn('build', calls)
            result, calls = run('--skip-pull', answer='invalid\nY\n')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('app.evolve', calls)
            self.assertNotIn('app.evolve --check', calls)
            result, calls = run('--skip-pull', answer='n\n')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('app.evolve --check', calls)
            result, _ = run('--apply-evolutions', '--skip-evolutions')
            self.assertEqual(result.returncode, 2)


if __name__ == '__main__':
    unittest.main()
