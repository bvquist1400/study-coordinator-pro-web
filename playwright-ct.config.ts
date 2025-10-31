import { defineConfig } from '@playwright/experimental-ct-react'
import { devices } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: './tests/visual',
  snapshotDir: './tests/visual/__screenshots__',
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      scale: 'css',
      maxDiffPixelRatio: 0.02
    }
  },
  use: {
    viewport: { width: 1024, height: 640 },
    ctViteConfig: {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src')
        }
      }
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
