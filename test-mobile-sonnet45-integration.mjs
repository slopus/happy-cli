#!/usr/bin/env node

/**
 * Mobile Integration Test for Sonnet 4.5
 *
 * Purpose: Simulate mobile app sending Sonnet 4.5 request to LOCAL happy-cli
 * This validates that the mobile changes (model = 'claude-sonnet-4-5-20250929')
 * work correctly with the local CLI's v0.11.0 implementation.
 *
 * Test Flow:
 * 1. Read credentials from ~/.happy/access.key
 * 2. Create API session
 * 3. Send message with meta.model = 'claude-sonnet-4-5-20250929'
 * 4. Verify response comes from Sonnet 4.5
 */

import { ApiClient, ApiSessionClient } from './dist/lib.mjs'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

async function readCredentials() {
    const credPath = join(homedir(), '.happy', 'access.key')
    if (!existsSync(credPath)) {
        throw new Error('No credentials found at ~/.happy/access.key - run `happy daemon start` first')
    }

    const content = await readFile(credPath, 'utf8')
    const parsed = JSON.parse(content)

    if (parsed.encryption && parsed.encryption.publicKey && parsed.encryption.machineKey) {
        return {
            token: parsed.token,
            encryption: {
                publicKey: Buffer.from(parsed.encryption.publicKey, 'base64'),
                machineKey: Buffer.from(parsed.encryption.machineKey, 'base64')
            }
        }
    } else if (parsed.secret) {
        return {
            token: parsed.token,
            encryption: {
                secret: Buffer.from(parsed.secret, 'base64')
            }
        }
    }

    throw new Error('Invalid credentials format')
}

async function test() {
    console.log('🧪 Mobile Sonnet 4.5 Integration Test\n')
    console.log('Testing: Mobile app → Local CLI v0.11.0 → Claude Sonnet 4.5\n')

    try {
        // Step 1: Read credentials
        console.log('📖 Reading credentials...')
        const credentials = await readCredentials()
        console.log('✅ Credentials loaded\n')

        // Step 2: Create API client
        console.log('🔌 Creating API client...')
        const apiClient = await ApiClient.create(credentials)
        console.log('✅ API client created\n')

        // Step 3: Create session
        console.log('🎯 Creating test session...')
        const session = await apiClient.getOrCreateSession({
            tag: 'mobile-integration-test',
            metadata: {
                workingDirectory: process.cwd(),
                name: 'Mobile Sonnet 4.5 Test'
            },
            state: null
        })
        console.log(`✅ Session created: ${session.id}\n`)

        // Step 4: Create session client (connects automatically)
        console.log('🔗 Creating session client...')
        const sessionClient = new ApiSessionClient(credentials.token, session)

        console.log('⏳ Waiting for connection...')
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Session connection timeout'))
            }, 10000)

            // Listen to socket events directly
            sessionClient.socket.once('connect', () => {
                clearTimeout(timeout)
                resolve()
            })

            sessionClient.socket.once('connect_error', (error) => {
                clearTimeout(timeout)
                reject(error)
            })
        })
        console.log('✅ Session client connected\n')

        // Step 5: Send message with Sonnet 4.5 model (as mobile app does)
        console.log('📤 Sending message with Sonnet 4.5 model...')
        console.log('   Model: claude-sonnet-4-5-20250929')
        console.log('   (Simulating mobile app modelMode: "sonnet")\n')

        const testMessage = {
            role: 'user',
            content: {
                type: 'text',
                text: "Say 'Hello from mobile integration test' and confirm your exact model name."
            },
            meta: {
                sentFrom: 'mobile-integration-test',
                permissionMode: 'bypassPermissions',
                model: 'claude-sonnet-4-5-20250929',
                fallbackModel: null
            }
        }

        sessionClient.sendMessage(testMessage)

        // Step 6: Wait for response
        console.log('⏳ Waiting for Claude response...\n')

        let modelConfirmed = false
        let responseReceived = false
        let actualModel = null
        let responseText = null

        const responsePromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Response timeout after 60 seconds'))
            }, 60000)

            sessionClient.on('message', (message) => {
                console.log('📨 Received message:', message.type)

                // Look for init message with model name
                if (message.type === 'system' && message.subtype === 'init') {
                    actualModel = message.model
                    console.log('   Model initialized:', actualModel)

                    if (actualModel === 'claude-sonnet-4-5-20250929') {
                        modelConfirmed = true
                    }
                }

                // Look for assistant response
                if (message.type === 'assistant') {
                    responseReceived = true
                    const content = message.message.content.find(c => c.type === 'text')
                    if (content) {
                        responseText = content.text
                        console.log('   Response:', responseText.substring(0, 100))
                    }
                }

                // Look for result message
                if (message.type === 'result') {
                    clearTimeout(timeout)
                    console.log('   Duration:', message.duration_ms, 'ms')
                    if (message.usage) {
                        console.log('   Tokens:', message.usage.input_tokens, 'in,', message.usage.output_tokens, 'out')
                    }
                    resolve()
                }
            })

            sessionClient.on('error', (error) => {
                clearTimeout(timeout)
                reject(error)
            })
        })

        await responsePromise

        // Step 7: Verify results
        console.log('\n📊 Test Results:')
        console.log('─'.repeat(60))

        if (!modelConfirmed) {
            console.log('❌ FAIL: Model was not Sonnet 4.5')
            console.log('   Expected: claude-sonnet-4-5-20250929')
            console.log('   Actual:', actualModel || 'unknown')
            process.exit(1)
        }

        if (!responseReceived) {
            console.log('❌ FAIL: No response received')
            process.exit(1)
        }

        console.log('✅ Model confirmed: claude-sonnet-4-5-20250929')
        console.log('✅ Response received successfully')
        console.log('✅ Integration test PASSED')
        console.log('\n🎉 Mobile → CLI → Sonnet 4.5 integration working!')

        // Cleanup
        sessionClient.disconnect()
        process.exit(0)

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message)
        if (error.stack) {
            console.error('\nStack trace:')
            console.error(error.stack)
        }
        process.exit(1)
    }
}

test()