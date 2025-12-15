import { createOpencodeClient } from '@opencode-ai/sdk'

const client = createOpencodeClient({
  baseUrl: 'http://localhost:4096',
})

// Create and manage sessions
const session = await client.session.create({
  body: { title: 'My session' },
})

// List all sessions (for reference)
const _sessions = await client.session.list()

// Send a prompt message
const _result = await client.session.prompt({
  path: { id: session.id },
  body: {
    model: { providerID: 'anthropic', modelID: 'claude-3-5-sonnet-20241022' },
    parts: [{ type: 'text', text: 'Hello!' }],
  },
})

console.log('OpenCode SDK example completed successfully')
