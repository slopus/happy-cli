import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Box, Text, useStdout, useInput } from 'ink'
import { MessageBuffer, type BufferedMessage } from './messageBuffer'
import { getTheme } from '@/ui/theme'

interface RemoteModeDisplayProps {
    messageBuffer: MessageBuffer
    logPath?: string
    onExit?: () => void
    onSwitchToLocal?: () => void
}

export const RemoteModeDisplay: React.FC<RemoteModeDisplayProps> = ({ messageBuffer, logPath, onExit, onSwitchToLocal }) => {
    const [messages, setMessages] = useState<BufferedMessage[]>([])
    const [confirmationMode, setConfirmationMode] = useState<'exit' | 'switch' | null>(null)
    const [actionInProgress, setActionInProgress] = useState<'exiting' | 'switching' | null>(null)
    const confirmationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const { stdout } = useStdout()
    const terminalWidth = stdout.columns || 80
    const terminalHeight = stdout.rows || 24

    useEffect(() => {
        setMessages(messageBuffer.getMessages())
        
        const unsubscribe = messageBuffer.onUpdate((newMessages) => {
            setMessages(newMessages)
        })

        return () => {
            unsubscribe()
            if (confirmationTimeoutRef.current) {
                clearTimeout(confirmationTimeoutRef.current)
            }
        }
    }, [messageBuffer])

    const resetConfirmation = useCallback(() => {
        setConfirmationMode(null)
        if (confirmationTimeoutRef.current) {
            clearTimeout(confirmationTimeoutRef.current)
            confirmationTimeoutRef.current = null
        }
    }, [])

    const setConfirmationWithTimeout = useCallback((mode: 'exit' | 'switch') => {
        setConfirmationMode(mode)
        if (confirmationTimeoutRef.current) {
            clearTimeout(confirmationTimeoutRef.current)
        }
        confirmationTimeoutRef.current = setTimeout(() => {
            resetConfirmation()
        }, 15000) // 15 seconds timeout
    }, [resetConfirmation])

    useInput(useCallback(async (input, key) => {
        // Don't process input if action is in progress
        if (actionInProgress) return
        
        // Handle Ctrl-C
        if (key.ctrl && input === 'c') {
            if (confirmationMode === 'exit') {
                // Second Ctrl-C, exit
                resetConfirmation()
                setActionInProgress('exiting')
                // Small delay to show the status message
                await new Promise(resolve => setTimeout(resolve, 100))
                onExit?.()
            } else {
                // First Ctrl-C, show confirmation
                setConfirmationWithTimeout('exit')
            }
            return
        }

        // Handle double space
        if (input === ' ') {
            if (confirmationMode === 'switch') {
                // Second space, switch to local
                resetConfirmation()
                setActionInProgress('switching')
                // Small delay to show the status message
                await new Promise(resolve => setTimeout(resolve, 100))
                onSwitchToLocal?.()
            } else {
                // First space, show confirmation
                setConfirmationWithTimeout('switch')
            }
            return
        }

        // Any other key cancels confirmation
        if (confirmationMode) {
            resetConfirmation()
        }
    }, [confirmationMode, actionInProgress, onExit, onSwitchToLocal, setConfirmationWithTimeout, resetConfirmation]))

    const theme = getTheme()

    const formatMessage = (msg: BufferedMessage): string => {
        const lines = msg.content.split('\n')
        const maxLineLength = terminalWidth - 10 // Account for borders and padding
        return lines.map(line => {
            if (line.length <= maxLineLength) return line
            const chunks: string[] = []
            for (let i = 0; i < line.length; i += maxLineLength) {
                chunks.push(line.slice(i, i + maxLineLength))
            }
            return chunks.join('\n')
        }).join('\n')
    }

    return (
        <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
            {/* Main content area with logs */}
            <Box 
                flexDirection="column" 
                width={terminalWidth}
                height={terminalHeight - 4}
                borderStyle="round"
                borderColor={theme.colors.border}
                paddingX={1}
                overflow="hidden"
            >
                <Box flexDirection="column" marginBottom={1}>
                    <Text color={theme.colors.header} bold>📡 Remote Mode - Claude Messages</Text>
                    <Text color={theme.colors.separator} dimColor={theme.dimMessages}>{'─'.repeat(Math.min(terminalWidth - 4, 60))}</Text>
                </Box>

                <Box flexDirection="column" height={terminalHeight - 10} overflow="hidden">
                    {messages.length === 0 ? (
                        <Text color={theme.colors.muted} dimColor={theme.dimMessages}>Waiting for messages...</Text>
                    ) : (
                        // Show only the last messages that fit in the available space
                        messages.slice(-Math.max(1, terminalHeight - 10)).map((msg) => (
                            <Box key={msg.id} flexDirection="column" marginBottom={1}>
                                <Text color={theme.colors.message(msg.type)} dimColor={theme.dimMessages}>
                                    {formatMessage(msg)}
                                </Text>
                            </Box>
                        ))
                    )}
                </Box>
            </Box>

            {/* Modal overlay at the bottom */}
            <Box 
                width={terminalWidth}
                borderStyle="round"
                borderColor={
                    actionInProgress ? theme.colors.muted :
                    confirmationMode === 'exit' ? "red" :
                    confirmationMode === 'switch' ? "yellow" :
                    "green"
                }
                paddingX={2}
                justifyContent="center"
                alignItems="center"
                flexDirection="column"
            >
                <Box flexDirection="column" alignItems="center">
                    {actionInProgress === 'exiting' ? (
                        <Text color={theme.colors.muted} bold>
                            Exiting...
                        </Text>
                    ) : actionInProgress === 'switching' ? (
                        <Text color={theme.colors.muted} bold>
                            Switching to local mode...
                        </Text>
                    ) : confirmationMode === 'exit' ? (
                        <Text color="red" bold>
                            ⚠️  Press Ctrl-C again to exit completely
                        </Text>
                    ) : confirmationMode === 'switch' ? (
                        <Text color="yellow" bold>
                            ⏸️  Press space again to switch to local mode
                        </Text>
                    ) : (
                        <>
                            <Text color="green" bold>
                                📱 Press space to switch to local mode • Ctrl-C to exit
                            </Text>
                        </>
                    )}
                    {process.env.DEBUG && logPath && (
                        <Text color={theme.colors.muted} dimColor={theme.dimMessages}>
                            Debug logs: {logPath}
                        </Text>
                    )}
                </Box>
            </Box>
        </Box>
    )
}