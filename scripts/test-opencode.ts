#!/usr/bin/env tsx
/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

/**
 * Test OpenCode SDK Polling Pattern with AWS Bedrock
 *
 * This script tests the polling pattern needed for OpenCode SDK.
 * The session.prompt() method is asynchronous and non-blocking - it returns
 * immediately before the AI responds. We must poll session.messages.list()
 * until an assistant message appears.
 */

import { createOpencode } from '@opencode-ai/sdk'

async function test() {
  console.log('🧪 Testing OpenCode SDK with AWS Bedrock polling pattern...\n')

  // Create OpenCode server with AWS Bedrock
  const opencode = await createOpencode({
    hostname: '127.0.0.1',
    port: 4096,
    config: {
      model: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
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

    // Send prompt (non-blocking, returns immediately)
    await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [
          { type: 'text', text: 'Extract the movie title from: "The Matrix | Free Full Movie"' },
        ],
      },
    })
    console.log('✅ Prompt sent, polling for response...')

    // Poll for assistant response
    let assistantMessage = null
    let attempts = 0
    const maxAttempts = 60

    while (!assistantMessage && attempts < maxAttempts) {
      const messagesResponse = await client.session.messages({ path: { id: sessionId } })

      assistantMessage = messagesResponse.data.find((msg: any) => msg.role === 'assistant')

      if (assistantMessage) {
        console.log('\n✅ Assistant response received after', attempts + 1, 'attempts')
        console.log('Full message:', JSON.stringify(assistantMessage, null, 2))

        // Extract text
        const textParts = assistantMessage.content
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text)
          .join(' ')
          .trim()

        console.log('\n📝 Extracted text:', textParts)
      } else {
        process.stdout.write('.') // Progress indicator
        await new Promise(resolve => setTimeout(resolve, 1000))
        attempts++
      }
    }

    if (!assistantMessage) {
      console.log('\n❌ Timeout: No assistant response after', maxAttempts, 'seconds')
    }
  } finally {
    opencode.server.close()
    console.log('\n✅ Test complete, server closed')
  }
}

test().catch(error => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
