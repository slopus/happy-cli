/**
 * Stream utility for Gemini SDK messages
 * Provides async iteration over messages with proper error handling
 */

export class Stream<T> implements AsyncIterable<T> {
    private queue: T[] = [];
    private resolvers: Array<{
        resolve: (result: IteratorResult<T>) => void;
        reject: (error: Error) => void;
    }> = [];
    private isDone = false;
    private errorValue: Error | null = null;

    /**
     * Add a message to the stream
     */
    enqueue(item: T): void {
        if (this.isDone) {
            return;
        }

        if (this.resolvers.length > 0) {
            const resolver = this.resolvers.shift()!;
            resolver.resolve({ value: item, done: false });
        } else {
            this.queue.push(item);
        }
    }

    /**
     * Mark the stream as complete
     */
    done(): void {
        this.isDone = true;
        for (const resolver of this.resolvers) {
            resolver.resolve({ value: undefined as any, done: true });
        }
        this.resolvers = [];
    }

    /**
     * Set an error on the stream
     */
    error(err: Error): void {
        this.errorValue = err;
        this.isDone = true;
        for (const resolver of this.resolvers) {
            resolver.reject(err);
        }
        this.resolvers = [];
    }

    /**
     * Async iterator implementation
     */
    async *[Symbol.asyncIterator](): AsyncGenerator<T, void, unknown> {
        while (true) {
            if (this.errorValue) {
                throw this.errorValue;
            }

            if (this.queue.length > 0) {
                yield this.queue.shift()!;
                continue;
            }

            if (this.isDone) {
                return;
            }

            // Wait for next item
            const item = await new Promise<IteratorResult<T>>((resolve, reject) => {
                this.resolvers.push({ resolve, reject });
            });

            if (item.done) {
                return;
            }

            yield item.value;
        }
    }
}
