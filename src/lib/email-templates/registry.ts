import type { ComponentType } from 'react'
import { template as occurrenceRegistered } from './occurrence-registered'
import { template as customerUpdate } from './customer-update'
import { template as customerQuestion } from './customer-question'
import { template as solutionEvaluation } from './solution-evaluation'
import { template as evaluationReminder } from './evaluation-reminder'
import { template as unfoundedNotice } from './unfounded-notice'
import { template as kamCopy } from './kam-copy'
import { template as internalAlert } from './internal-alert'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Each name matches the template recorded by the database when an app email is scheduled.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'occurrence-registered': occurrenceRegistered,
  'customer-update': customerUpdate,
  'customer-question': customerQuestion,
  'solution-evaluation': solutionEvaluation,
  'evaluation-reminder': evaluationReminder,
  'unfounded-notice': unfoundedNotice,
  'kam-copy': kamCopy,
  'internal-alert': internalAlert,
}
