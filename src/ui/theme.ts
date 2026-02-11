/**
 * Theme system for happy-cli terminal display
 *
 * Centralizes color definitions for Ink display components.
 * Supports dark (default) and light themes for different terminal backgrounds.
 *
 * Configuration priority:
 *   1. HAPPY_THEME env var ('dark' | 'light')
 *   2. settings.json theme field
 *   3. Default: 'dark'
 */

import type { BufferedMessage } from '@/ui/ink/messageBuffer'

export type ThemeName = 'dark' | 'light'

type MessageType = BufferedMessage['type']

export interface ThemeColors {
    /** Color for each message type */
    message: (type: MessageType) => string
    /** Border color for Box components */
    border: string
    /** Header/title text color */
    header: string
    /** Separator line color */
    separator: string
    /** Muted text color (debug info, paths) */
    muted: string
}

export interface Theme {
    name: ThemeName
    colors: ThemeColors
    /** Whether to apply dimColor prop to message text */
    dimMessages: boolean
}

function darkMessageColor(type: MessageType): string {
    switch (type) {
        case 'user': return 'magenta'
        case 'assistant': return 'cyan'
        case 'system': return 'blue'
        case 'tool': return 'yellow'
        case 'result': return 'green'
        case 'status': return 'gray'
        default: return 'white'
    }
}

function lightMessageColor(type: MessageType): string {
    switch (type) {
        case 'user': return '#9b006e'
        case 'assistant': return '#006688'
        case 'system': return '#0044aa'
        case 'tool': return '#886600'
        case 'result': return '#006622'
        case 'status': return '#555555'
        default: return '#333333'
    }
}

const darkTheme: Theme = {
    name: 'dark',
    colors: {
        message: darkMessageColor,
        border: 'gray',
        header: 'gray',
        separator: 'gray',
        muted: 'gray',
    },
    dimMessages: true,
}

const lightTheme: Theme = {
    name: 'light',
    colors: {
        message: lightMessageColor,
        border: '#888888',
        header: '#555555',
        separator: '#999999',
        muted: '#777777',
    },
    dimMessages: false,
}

const themes: Record<ThemeName, Theme> = {
    dark: darkTheme,
    light: lightTheme,
}

function resolveThemeFromEnv(): ThemeName | undefined {
    const envValue = process.env.HAPPY_THEME?.toLowerCase()
    if (envValue === 'dark' || envValue === 'light') {
        return envValue
    }
    return undefined
}

let cachedTheme: Theme | undefined

/**
 * Get the current theme. Returns cached instance after first call.
 *
 * Resolution priority:
 *   1. HAPPY_THEME env var
 *   2. Value passed to initTheme() from settings.json
 *   3. Default: 'dark'
 */
export function getTheme(): Theme {
    if (cachedTheme) return cachedTheme
    cachedTheme = themes[resolveThemeFromEnv() ?? 'dark']
    return cachedTheme
}

/**
 * Initialize theme with settings.json value.
 * Call once at app startup after reading settings.
 * Env var always takes priority over settings value.
 */
export function initTheme(settingsTheme?: ThemeName): void {
    const envTheme = resolveThemeFromEnv()
    cachedTheme = themes[envTheme ?? settingsTheme ?? 'dark']
}
