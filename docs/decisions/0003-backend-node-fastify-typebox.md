# ADR-0003: Backend on Node LTS with Fastify + TypeBox

- Status: accepted

## Context

Goals: TypeScript everywhere, high performance on cheap low-resource servers, a
framework that does not invade the hexagonal architecture (ADR-0004). Finalists were
Fastify + TypeBox and Hono + Zod.

## Decision

Node LTS + pnpm, **Fastify** as HTTP adapter, **TypeBox** for schemas.

## Rationale

- On Node, Fastify is native (built on Node's HTTP); Hono runs through the
  `@hono/node-server` adapter translating Web-Standard Request/Response per request.
  Hono's headline wins are on Bun/edge — irrelevant for a self-hosted long-running
  container next to Postgres (serverless is actively counterproductive here).
- TypeBox schemas are JSON Schema, so one schema drives Fastify's whole pipeline:
  compiled Ajv validation (input), compiled `fast-json-stringify` serialization
  (output, 2-3x `JSON.stringify`), and OpenAPI via `@fastify/swagger`. Hono only
  validates input.
- Official plugin ecosystem the project will need: multipart (photos), rate-limit,
  CORS, integrated Pino logging, under-pressure.

## Alternatives rejected

- **NestJS / AdonisJS**: opinionated frameworks whose structure competes with our own
  hexagonal architecture; heaviest footprint.
- **Elysia**: Bun-first, Node second-class. **Encore.ts**: platform gravity.
- **Zod**: better refinements DX and huge ecosystem, but validation-only integration
  and slower; TypeBox preferred for the compiled pipeline. Not a hard rejection.
- **Bun/Deno runtimes**: not drop-in (node:* API gaps, native addons); would narrow the
  OSS deployer/contributor base. Recent Node runs TS natively via type stripping,
  removing most of their DX edge. Code stays runtime-agnostic; Bun may be re-tested as
  an experiment anytime.
