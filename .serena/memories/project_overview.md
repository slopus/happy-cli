# Happy CLI - Project Overview

## Purpose
Happy CLI (`happy-coder`) is a command-line tool that wraps Claude Code to enable remote control and session sharing from mobile devices. It allows developers to code on the go by controlling Claude Code sessions from their phone.

Free. Open source. Code anywhere.

## System Architecture
Three-component system:
1. **handy-cli** (this project) - CLI wrapper for Claude Code
2. **handy** - React Native mobile client  
3. **handy-server** - Node.js server with Prisma (hosted at https://api.happy-servers.com/)

## Key Features
- Remote control of Claude Code from mobile app
- Real-time session sharing between desktop and mobile
- QR code authentication for easy mobile connection
- Background daemon mode for persistent sessions
- End-to-end encryption for all communications
- MCP (Model Context Protocol) integration
- Dual mode operation:
  - **Local mode**: Interactive terminal sessions
  - **Remote mode**: Mobile app control via SDK

## Target Users
Developers who want to:
- Code on the go using their mobile device
- Continue coding sessions while away from desk
- Collaborate remotely through Claude Code
- Control AI coding assistant from anywhere
