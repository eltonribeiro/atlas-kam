// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@lovable.dev/email-js', () => ({
  sendLovableEmail: send,
  EmailAPIError: class extends Error { code = 'recipient_suppressed' },
}))
vi.mock('@react-email/render', () => ({ render: vi.fn().mockResolvedValue('Rendered email') }))
vi.mock('../lib/email-templates/registry', () => ({
  TEMPLATES: { fixture: { component: () => null, subject: 'Fixture' } },
}))
import { sendTemplateEmail } from '../lib/email-templates/send-email'

describe('Atlas email configuration', () => {
  beforeEach(() => {
    vi.stubEnv('LOVABLE_API_KEY', 'test-only')
    send.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => vi.unstubAllEnvs())
  it('uses the chosen sender domain', async () => {
    await sendTemplateEmail('fixture', 'fixture@example.test', { idempotencyKey: 'fixture-1' })
    expect(send.mock.calls[0][0].sender_domain).toBe('notify.intralog.log.br')
  })
  it('defaults replies to the address approved by Elton', async () => {
    await sendTemplateEmail('fixture', 'fixture@example.test')
    expect(send.mock.calls[0][0].reply_to).toBe('elton.ribeiro@grupotpc.com')
  })
  it('keeps event deduplication keys', async () => {
    await sendTemplateEmail('fixture', 'fixture@example.test', { idempotencyKey: 'occurrence-event-1' })
    expect(send.mock.calls[0][0].idempotency_key).toBe('occurrence-event-1')
  })
  it('does not retry a suppressed recipient', async () => {
    const { EmailAPIError } = await import('@lovable.dev/email-js')
    send.mockRejectedValue(new EmailAPIError('Suppressed', { code: 'recipient_suppressed', status: 422 }))
    expect(await sendTemplateEmail('fixture', 'fixture@example.test')).toEqual({ sent: false, reason: 'recipient_suppressed' })
    expect(send).toHaveBeenCalledTimes(1)
  })
})