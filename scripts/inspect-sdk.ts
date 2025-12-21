#!/usr/bin/env tsx
/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { createOpencode } from '@opencode-ai/sdk'

async function test() {
  console.log('🧪 Testing OpenCode SDK promptAsync...\n')

  const opencode = await createOpencode({
    hostname: '127.0.0.1',
    port: 4097,
    config: {
      model: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
      region: process.env.AWS_REGION || 'eu-central-1',
    },
  })

  const client = opencode.client

  try {
    // Create session
    const sessionResponse = await client.session.create({
      body: { title: 'Test Session' },
    })
    const sessionId = sessionResponse.data.id
    console.log('✅ Session created:', sessionId)

    // Try promptAsync
    console.log('\nSending prompt with promptAsync...')
    const promptResponse = await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [
          {
            type: 'text',
            text: 'Extract the movie title from: "The Matrix | Free Full Movie". Reply with ONLY the movie title, nothing else.',
          },
        ],
      },
    })
    console.log('PromptAsync response:', JSON.stringify(promptResponse, null, 2))
  } catch (error: any) {
    console.error('Error:', error.message || error)
    if (error.data) {
      console.error('Error data:', JSON.stringify(error.data, null, 2))
    }
  } finally {
    opencode.server.close()
  }
}

test().catch(console.error)
