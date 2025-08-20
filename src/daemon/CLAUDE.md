# Daemon Architecture

## Core Purpose
HTTP server (64875) that manages Claude sessions and communicates with Happy Server.

## Key Components

### 1. DaemonHappyServerSession (`serverSession.ts`)
- WebSocket connection to Happy Server on `/v1/updates` path
- Registers machine with server on connect
- Implements RPC handler: `{machineId}:spawn-happy-session`
- Sends `machine-alive` heartbeat every 20 seconds
- Auth: Bearer token in socket.io auth field

### 2. DaemonHttpServer (`httpServer.ts`)
- Listens on localhost:64875
- Routes:
  - `POST /sessions` - Create new Claude session
  - `GET /sessions` - List active sessions
  - `DELETE /sessions/:id` - Stop session
  - `GET /health` - Health check
- Calls `sessionManager` to spawn actual processes

### 3. TrackedSessionManager (`trackedSessionManager.ts`)
- Manages Claude process lifecycle
- Spawns `claude` with flags: `--print --output-format stream-json --verbose`
- Monitors stdout/stderr via file watchers
- Maintains session state in memory
- Handles process cleanup on exit

### 4. Run Loop (`run.ts`)
- Entry point from CLI
- Creates daemon metadata file with PID/port
- Establishes server connection if credentials exist
- Starts HTTP server
- Graceful shutdown handling

## Control Flow

### Session Creation
1. Mobile/CLI → POST /sessions → Daemon HTTP server
2. Daemon spawns `claude` process with working directory
3. Daemon starts watching output files
4. Returns session ID to caller

### Remote Session Spawn (via RPC)
1. Server → WebSocket RPC `spawn-happy-session` → Daemon
2. Daemon spawns Claude in specified directory
3. Returns success/failure via RPC callback

### Machine Registration
1. On connect: Daemon → `machine-register` event → Server
2. Server updates machine in database
3. Mobile clients receive machine status updates

## Key Files
- `~/.happy-dev/daemon-metadata.json` - PID, port, start time
- `~/.happy-dev/logs/*-daemon.log` - Daemon logs
- `~/.happy-dev/settings.json` - Machine ID, host
- `~/.happy-dev/access.key` - Auth credentials

## Environment Variables
- `HAPPY_SERVER_URL` - Server URL (default: production)
- `HAPPY_HOME_DIR` - Home directory (default: ~/.happy-dev for local)

## Running Commands

### Start daemon (detached):
```bash
yarn dev:local-server daemon start
# OR
HAPPY_HOME_DIR=~/.happy-dev ./bin/happy.mjs daemon start
```

### Start daemon (synchronous - for debugging):
```bash
yarn dev:local-server daemon start-sync
# OR  
HAPPY_HOME_DIR=~/.happy-dev ./bin/happy.mjs daemon start-sync
```

### Stop daemon:
```bash
yarn dev:local-server daemon stop
# OR
HAPPY_HOME_DIR=~/.happy-dev ./bin/happy.mjs daemon stop
```

## Debugging

### Check running daemons:
```bash
ps aux | grep "happy.mjs daemon" | grep -v grep
```

### Read daemon logs:
```bash
# Latest daemon log
ls -lt ~/.happy-dev/logs/*daemon.log | head -1 | xargs cat

# All recent logs
ls -lt ~/.happy-dev/logs/*.log | head -5
```

### Check daemon state:
```bash
cat ~/.happy-dev/daemon.state.json | jq .
```

# Sync machines

# Machine Sync Architecture - Separated Metadata & Daemon State

## Data Structure (Similar to Session's metadata + agentState)

```typescript
// Static machine information (rarely changes)
interface MachineMetadata {
  host: string;              // hostname
  platform: string;          // darwin, linux, win32
  happyCliVersion: string;   
  homeDir: string;           
  happyHomeDir: string;
}

// Dynamic daemon state (frequently updated)
interface DaemonState {
  status: 'running' | 'shutting-down' | 'offline';
  pid?: number;
  httpPort?: number;
  startedAt?: number;
  shutdownRequestedAt?: number;
  shutdownSource?: 'mobile-app' | 'cli' | 'os-signal' | 'unknown';
}
```

## 1. CLI Startup Phase

Checks if machine ID exists in settings:
- If not: creates ID locally only (so sessions can reference it)
- Does NOT create machine on server - that's daemon's job
- CLI doesn't manage machine details - all API & schema live in daemon subpackage

## 2. Daemon Startup - Initial Registration

### REST Request: `POST /v1/machines`
```json
{
  "id": "machine-uuid-123",
  "metadata": "base64(encrypted({
    'host': 'MacBook-Pro.local',
    'platform': 'darwin',
    'happyCliVersion': '1.0.0',
    'homeDir': '/Users/john',
    'happyHomeDir': '/Users/john/.happy'
  }))",
  "daemonState": "base64(encrypted({
    'status': 'running',
    'pid': 12345,
    'httpPort': 8080,
    'startedAt': 1703001234567
  }))"
}
```

### Server Response:
```json
{
  "machine": {
    "id": "machine-uuid-123",
    "metadata": "base64(encrypted(...))",  // echoed back
    "metadataVersion": 1,
    "daemonState": "base64(encrypted(...))",  // echoed back
    "daemonStateVersion": 1,
    "active": true,
    "lastActiveAt": 1703001234567,
    "createdAt": 1703001234567,
    "updatedAt": 1703001234567
  }
}
```

## 3. WebSocket Connection & Real-time Updates

### Connection Handshake:
```javascript
io(serverUrl, {
  auth: {
    token: "auth-token",
    clientType: "machine-scoped",
    machineId: "machine-uuid-123"
  }
})
```

### Heartbeat (every 20s):
```json
// Client -> Server
socket.emit('machine-alive', {
  "machineId": "machine-uuid-123",
  "time": 1703001234567
})
```

## 4. Daemon State Updates (via WebSocket)

### When daemon status changes:
```json
// Client -> Server
socket.emit('machine-update-state', {
  "machineId": "machine-uuid-123",
  "daemonState": "base64(encrypted({
    'status': 'shutting-down',
    'pid': 12345,
    'httpPort': 8080,
    'startedAt': 1703001234567,
    'shutdownRequestedAt': 1703001244567,
    'shutdownSource': 'mobile-app'
  }))",
  "expectedVersion": 1
}, callback)

// Server -> Client (callback)
// Success:
{
  "result": "success",
  "version": 2,
  "daemonState": "base64(encrypted(...))"
}

// Version mismatch:
{
  "result": "version-mismatch",
  "version": 3,
  "daemonState": "base64(encrypted(current_state))"
}
```

### Machine metadata update (rare):
```json
// Client -> Server
socket.emit('machine-update-metadata', {
  "machineId": "machine-uuid-123",
  "metadata": "base64(encrypted({
    'host': 'MacBook-Pro.local',
    'platform': 'darwin',
    'happyCliVersion': '1.0.1',  // version updated
    'homeDir': '/Users/john',
    'happyHomeDir': '/Users/john/.happy'
  }))",
  "expectedVersion": 1
}, callback)
```

## 5. Mobile App RPC Calls

### Stop Daemon Request:
```json
// Mobile -> Server
socket.emit('rpc-call', {
  "method": "machine-uuid-123:stop-daemon",
  "params": "base64(encrypted({
    'reason': 'user-requested',
    'force': false
  }))"
}, callback)

// Server forwards to Daemon
// Daemon -> Server (response)
callback("base64(encrypted({
  'message': 'Daemon shutdown initiated',
  'shutdownAt': 1703001244567
}))")
```

### Flow when daemon receives stop request:
1. Daemon receives RPC `stop-daemon`
2. Updates daemon state immediately:
```json
socket.emit('machine-update-state', {
  "machineId": "machine-uuid-123",
  "daemonState": "base64(encrypted({
    'status': 'shutting-down',
    'shutdownRequestedAt': 1703001244567,
    'shutdownSource': 'mobile-app'
  }))",
  "expectedVersion": 2
})
```
3. Sends acknowledgment back via RPC callback
4. Performs cleanup
5. Final state update before exit:
```json
socket.emit('machine-update-state', {
  "machineId": "machine-uuid-123", 
  "daemonState": "base64(encrypted({
    'status': 'offline'
  }))",
  "expectedVersion": 3
})
```

## 6. Server Broadcasts to Clients

### When daemon state changes:
```json
// Server -> Mobile/Web clients
socket.emit('update', {
  "id": "update-id-xyz",
  "seq": 456,
  "body": {
    "t": "update-machine",
    "id": "machine-uuid-123",
    "daemonState": {
      "value": "base64(encrypted(...))",
      "version": 2
    }
  },
  "createdAt": 1703001244567
})
```

### When metadata changes:
```json
socket.emit('update', {
  "id": "update-id-abc",
  "seq": 457,
  "body": {
    "t": "update-machine",
    "id": "machine-uuid-123",
    "metadata": {
      "value": "base64(encrypted(...))",
      "version": 2
    }
  },
  "createdAt": 1703001244567
})
```

## 7. GET Machine Status (REST)

### Request: `GET /v1/machines/machine-uuid-123`
```http
Authorization: Bearer <token>
```

### Response:
```json
{
  "machine": {
    "id": "machine-uuid-123",
    "metadata": "base64(encrypted(...))",
    "metadataVersion": 2,
    "daemonState": "base64(encrypted(...))",
    "daemonStateVersion": 3,
    "active": true,
    "lastActiveAt": 1703001244567,
    "createdAt": 1703001234567,
    "updatedAt": 1703001244567
  }
}
```

## Key Design Decisions

1. **Separation of Concerns**: 
   - `metadata`: Static machine info (host, platform, versions)
   - `daemonState`: Dynamic runtime state (status, pid, ports)

2. **Independent Versioning**:
   - `metadataVersion`: For machine metadata updates
   - `daemonStateVersion`: For daemon state updates
   - Allows concurrent updates without conflicts

3. **Encryption**: Both metadata and daemonState are encrypted separately

4. **Update Events**: Server broadcasts use same pattern as sessions:
   - `t: 'update-machine'` with optional metadata and/or daemonState fields
   - Clients only receive updates for fields that changed

5. **RPC Pattern**: Machine-scoped RPC methods prefixed with machineId (like sessions)




