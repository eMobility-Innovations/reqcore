import { createServer } from 'node:http'
import type { AddressInfo, Server } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Behavioural pin for the OpenTelemetry log-shipping pipeline in
 * server/utils/logger.ts.
 *
 * The exporter chain (@opentelemetry/sdk-logs -> exporter-logs-otlp-http ->
 * @opentelemetry/core) is the app's only observability rail, and every one of
 * its emit paths swallows its own exceptions so "logging must never break the
 * primary operation". That means a version bump can break log delivery
 * SILENTLY: nothing throws, nothing fails, logs just stop arriving.
 *
 * So this asserts the EFFECT — an OTLP request actually reaching an endpoint
 * with the record in it — rather than that the imports resolve.
 */
describe('OTLP log export', () => {
  let server: Server
  let received: Array<{ auth: string | undefined; body: string }>

  beforeEach(async () => {
    received = []
    server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => {
        received.push({
          auth: req.headers.authorization,
          body: Buffer.concat(chunks).toString('utf8'),
        })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{}')
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

    const { port } = server.address() as AddressInfo
    process.env.POSTHOG_PUBLIC_KEY = 'probe-token'
    process.env.POSTHOG_HOST = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    delete process.env.POSTHOG_PUBLIC_KEY
    delete process.env.POSTHOG_HOST
  })

  it('delivers an emitted record to the OTLP endpoint', async () => {
    // Imported per-test: the module holds the provider in module scope, and
    // initLoggerProvider() reads the env vars set above at call time.
    const { initLoggerProvider, logInfo, shutdownLoggerProvider } = await import('../../server/utils/logger')

    initLoggerProvider()
    logInfo('otlp-probe-record', { org_id: 'probe-org' })
    // shutdown() force-flushes, so the request is on the wire before we assert.
    await shutdownLoggerProvider()

    expect(received).toHaveLength(1)
    expect(received[0]!.auth).toBe('Bearer probe-token')
    expect(received[0]!.body).toContain('otlp-probe-record')
    expect(received[0]!.body).toContain('probe-org')
    expect(received[0]!.body).toContain('reqcore')
  })
})
