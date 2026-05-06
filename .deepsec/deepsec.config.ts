import { defineConfig } from 'deepsec/config'

export default defineConfig({
  defaultAgent: 'codex',
  projects: [
    { id: 'homelab-agent', root: '..' },
    // <deepsec:projects-insert-above>
  ],
})
