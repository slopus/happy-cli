import { query } from './dist/index.mjs'

async function test() {
    console.log('🧪 Testing Claude Sonnet 4.5 integration...\n')
    
    try {
        const result = query({
            prompt: "Say 'Hello from Sonnet 4.5' and tell me your model name in one sentence.",
            options: {
                model: 'claude-sonnet-4-5-20250929',
                cwd: process.cwd(),
                maxTurns: 1,
                permissionMode: 'bypassPermissions'
            }
        })

        let modelName = null
        let responseText = null
        
        for await (const message of result) {
            if (message.type === 'system' && message.subtype === 'init') {
                modelName = message.model
                console.log('✅ Model Initialized:', modelName)
            }
            if (message.type === 'assistant') {
                const content = message.message.content.find(c => c.type === 'text')
                if (content) {
                    responseText = content.text
                    console.log('✅ Assistant Response:', responseText)
                }
            }
            if (message.type === 'result') {
                console.log('✅ Tokens Used:', message.usage)
                console.log('✅ Duration:', message.duration_ms, 'ms')
                console.log('✅ Cost: $' + message.total_cost_usd.toFixed(4))
            }
        }
        
        console.log('\n🎉 SUCCESS: Claude Sonnet 4.5 is fully operational!')
        process.exit(0)
    } catch (error) {
        console.error('❌ TEST FAILED:', error.message)
        process.exit(1)
    }
}

test()
