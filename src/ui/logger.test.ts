import { describe, it, expect } from 'vitest'

/**
 * Serialize a value for logging, with special handling for Error objects.
 * (Copy of the function from logger.ts for testing)
 */
function serializeForLog(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...value
    })
  }
  return JSON.stringify(value)
}

describe('serializeForLog', () => {
  it('returns strings as-is', () => {
    expect(serializeForLog('hello')).toBe('hello')
  })

  it('serializes plain objects', () => {
    expect(serializeForLog({ foo: 'bar' })).toBe('{"foo":"bar"}')
  })

  it('serializes Error objects with name, message, and stack', () => {
    const error = new Error('test error')
    const serialized = serializeForLog(error)
    const parsed = JSON.parse(serialized)

    expect(parsed.name).toBe('Error')
    expect(parsed.message).toBe('test error')
    expect(parsed.stack).toBeDefined()
    expect(parsed.stack).toContain('test error')
  })

  it('serializes TypeError with correct name', () => {
    const error = new TypeError('invalid type')
    const serialized = serializeForLog(error)
    const parsed = JSON.parse(serialized)

    expect(parsed.name).toBe('TypeError')
    expect(parsed.message).toBe('invalid type')
  })

  it('includes additional enumerable properties on errors', () => {
    const error = new Error('with extra') as Error & { code: string }
    error.code = 'ENOENT'
    const serialized = serializeForLog(error)
    const parsed = JSON.parse(serialized)

    expect(parsed.code).toBe('ENOENT')
  })

  it('handles null and undefined', () => {
    expect(serializeForLog(null)).toBe('null')
    expect(serializeForLog(undefined)).toBe(undefined)
  })

  it('handles numbers and booleans', () => {
    expect(serializeForLog(42)).toBe('42')
    expect(serializeForLog(true)).toBe('true')
  })
})
