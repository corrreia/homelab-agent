import { createFileRoute, redirect } from '@tanstack/react-router'

// Hosts moved onto the home page alongside services; keep the old link working.
export const Route = createFileRoute('/hosts')({
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})
