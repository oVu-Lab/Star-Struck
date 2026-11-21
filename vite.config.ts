import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

function copyStaticDirectory(srcRelative: string, destRelative: string) {
  return {
    name: `copy-static-${srcRelative}`,
    apply: 'build' as const,
    closeBundle(error?: Error): void {
      if (error) return;
      const distDir = path.resolve(__dirname, 'dist');
      const srcDir = path.resolve(__dirname, srcRelative);
      const targetDir = path.resolve(distDir, destRelative);
      if (fs.existsSync(distDir) && fs.existsSync(srcDir)) {
        fs.cpSync(srcDir, targetDir, { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      copyStaticDirectory('data', 'data'),
      copyStaticDirectory('assets', 'assets'),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
