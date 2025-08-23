import { Logger } from 'happy-api-client';
import { logger as cliLogger } from '@/ui/logger';

/**
 * Adapter that bridges the API client Logger interface 
 * with the CLI's file-based logger
 */
export class CliLogger implements Logger {
    debug(message: string, ...args: unknown[]): void {
        cliLogger.debug(message, ...args);
    }

    info(message: string, ...args: unknown[]): void {
        // CLI logger doesn't have info level, use debug
        cliLogger.debug(message, ...args);
    }

    debugLargeJson(label: string, data: unknown): void {
        cliLogger.debugLargeJson(label, data);
    }
}