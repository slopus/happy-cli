# OpenCode Test Suite

This document describes the comprehensive test suite for the OpenCode agent integration.

## Test Coverage Summary

| Category | Tests | Description |
|----------|-------|-------------|
| **Unit Tests** | 25 | ACP backend, Message Queue |
| **Integration Tests** | 49 | Session lifecycle, Message flow, Permission handling |
| **E2E Tests** | 67 | Basic workflows, Options buttons, Git hooks |
| **Performance Tests** | 68 | Large prompts, Streaming, Memory, Concurrency |
| **Resilience Tests** | 147 | Crash recovery, Network failures, Edge cases, Graceful degradation |
| **Existing Tests** | 92 | Other project tests |
| **TOTAL** | **448** | Comprehensive coverage |

## Running Tests

### Run All Tests
```bash
yarn test
```

### Run Specific Test Category
```bash
# Unit tests only
yarn test src/opencode/__tests__/unit

# Integration tests only
yarn test src/opencode/__tests__/integration

# E2E tests only
yarn test src/opencode/__tests__/e2e

# Performance tests only
yarn test src/opencode/__tests__/performance

# Resilience tests only
yarn test src/opencode/__tests__/resilience
```

### Run Tests in CI Mode (non-watch)
```bash
yarn test --run
```

### Run Tests with Coverage
```bash
yarn test --coverage
```

## CI/CD Pipeline

The test suite runs automatically on GitHub Actions:

### On Every Push/PR
- **Unit Tests** - Fast validation of core functionality
- **Integration Tests** - Component integration validation
- **E2E Tests** - End-to-end workflow validation
- **Performance Tests** - Performance regression detection
- **Resilience Tests** - Error handling validation

### Scheduled (Nightly)
- **Full Test Suite** - Complete test run with coverage
- **Performance Baseline** - Track performance over time
- **Coverage Reporting** - Generate detailed coverage reports

### Performance Regression Detection
- Compares current branch performance against main branch
- Warns if tests are 10+ seconds slower
- Blocks PR if significant regression detected

## Test Results

### Current Status
- **Total Tests**: 448
- **Passing**: 448 (100%)
- **Execution Time**: ~60 seconds
- **TypeScript Strict Mode**: Enabled

### Test Breakdown by File

```
src/opencode/__tests__/helpers/
├── testSession.ts       - Session test helpers
├── mockACP.ts            - Mock ACP server
├── memoryMonitor.ts      - Memory tracking utilities
└── index.ts              - Central exports

src/opencode/__tests__/benchmarks/
└── metrics.ts            - Performance measurement utilities

src/opencode/__tests__/unit/
├── acp/
│   ├── acpBackend.test.ts (25 tests) - ACP backend unit tests
│   └── messageQueue.test.ts (13 tests) - Message queue tests
└── (other unit tests)

src/opencode/__tests__/integration/
├── session/
│   ├── lifecycle.test.ts (16 tests) - Session lifecycle
│   └── messageFlow.test.ts (18 tests) - Message flow
└── permissions/
    └── permissionFlow.test.ts (15 tests) - Permission handling

src/opencode/__tests__/e2e/
├── workflows/
│   └── basicWorkflow.test.ts (20 tests) - Core workflows
├── options/
│   └── optionsButtons.test.ts (19 tests) - Options parsing
└── gitHooks/
    └── preCommit.test.ts (28 tests) - Git hooks

src/opencode/__tests__/performance/
├── prompts/
│   └── largePrompts.test.ts (18 tests) - Large prompt handling
├── streaming/
│   └── streaming.test.ts (18 tests) - Streaming performance
├── memory/
│   └── memory.test.ts (16 tests) - Memory efficiency
└── concurrency/
    └── concurrency.test.ts (16 tests) - Concurrent operations

src/opencode/__tests__/resilience/
├── crashRecovery/
│   └── crashRecovery.test.ts (33 tests) - Crash recovery
├── networkFailures/
│   └── networkFailures.test.ts (33 tests) - Network resilience
├── edgeCases/
│   └── edgeCases.test.ts (45 tests) - Edge case handling
└── gracefulDegradation/
    └── gracefulDegradation.test.ts (36 tests) - Degradation strategies
```

## Performance Benchmarks

Key performance metrics tracked:

### Prompt Processing
- 1KB prompt: <100ms processing time
- 10KB prompt: <100ms processing time
- 100KB prompt: <500ms processing time
- 1MB prompt: <2s processing time

### Streaming
- Chunk accumulation: <100ms for 1000 chunks
- Per-chunk latency: <5ms average
- Throughput: >10,000 chunks/second

### Memory
- 10k messages queue: <50MB memory
- Session lifecycle: <10MB growth
- No memory leaks detected

### Concurrency
- Concurrent prompt processing: Supports 10+ concurrent
- Throughput: >1,000 requests/second
- Scaling: Linear improvement with concurrency

## Resilience Guarantees

### Crash Recovery
- ACP process crash: Automatic restart with exponential backoff
- Session state persistence: Automatic recovery
- Message queue preservation: No message loss
- Max restart attempts: 5 with increasing delays

### Network Failures
- Connection timeout: 5 second default
- Retry strategy: Exponential backoff (max 3-5 attempts)
- Request queuing: Automatic queuing during outages
- Fallback: Graceful degradation when service unavailable

### Graceful Degradation
- Load-based feature disabling: Non-essential features disabled under load
- Progressive degradation: Full → Degraded → Minimal → Emergency
- Automatic recovery: Features restored when conditions improve
- User notification: Clear feedback during degraded operation

## Adding New Tests

### Test Structure
Follow the established directory structure:
- Unit tests: `src/opencode/__tests__/unit/`
- Integration tests: `src/opencode/__tests__/integration/`
- E2E tests: `src/opencode/__tests__/e2e/`
- Performance tests: `src/opencode/__tests__/performance/`
- Resilience tests: `src/opencode/__tests__/resilience/`

### Test Naming
- File: `<feature>.test.ts`
- Describe: `'<Feature> <Category> Tests'`
- Test: `'should <expected behavior>'`

### Test Helpers
Import from centralized test helpers:
```typescript
import { createTestSession } from '@/opencode/__tests__/helpers/testSession';
import { createMockACP } from '@/opencode/__tests__/helpers/mockACP';
import { monitorMemory } from '@/opencode/__tests__/helpers/memoryMonitor';
import { measurePerformance } from '@/opencode/__tests__/benchmarks/metrics';
```

## Monitoring

### Performance Trends
Track over time:
- Total test execution time
- Individual test category performance
- Memory usage during tests
- Test flakiness rate

### Quality Gates
- All tests must pass before merge
- Performance regression <10% threshold
- Coverage maintained or improved
- No new TypeScript errors

## Troubleshooting

### Test Timeouts
- Increase timeout in test: `test.setTimeout(10000)`
- Check for async operations not properly awaited
- Verify mocks are cleaning up correctly

### Memory Issues
- Run tests with `--expose-gc --inspect` flags
- Use memory monitor helper to track leaks
- Check for circular references in mocks

### TypeScript Errors
- Ensure all mocks use proper types
- Check for `any` types (avoid when possible)
- Use type guards for runtime type checking
