import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {(phase: string) => import('next').NextConfig} */
export default function nextConfig(phase) {
  return {
    // Keep production builds from overwriting chunks used by the dev server.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
    outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  };
}
