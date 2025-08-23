/**
 * Library exports for slopus package
 * 
 * This file provides the main API classes and types for external consumption
 * without the CLI-specific functionality.
 */

// These exports allow me to use this package a library in dev-environment cli helper programs
export { RestApiClient as ApiClient, SessionApiClient as ApiSessionClient } from '@happy-engineering/happy-api-client'

export { logger } from '@/ui/logger'
export { configuration } from '@/configuration'

export { RawJSONLinesSchema, type RawJSONLines } from '@/claude/types'