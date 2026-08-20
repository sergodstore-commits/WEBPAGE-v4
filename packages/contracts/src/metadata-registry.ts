import { z } from 'zod';

import { ContractRegistry, metadataEnvelope } from './registry.js';

const code = z.string().min(1).max(80);
const safeText = z.string().min(1).max(512);
const nonNegativeInteger = z.number().int().nonnegative();

export const metadataRegistry = new ContractRegistry([
  {
    contract: 'BootstrapDiagnosticContext.v1',
    maximumBytes: 4 * 1024,
    owner: 'IdentityAccess',
    schema: metadataEnvelope('BootstrapDiagnosticContext.v1', {
      command_version: safeText,
      deployment_id: safeText,
      error_code: code,
      failure_stage: safeText,
    }),
  },
  {
    contract: 'LegalEvidenceContext.v1',
    maximumBytes: 4 * 1024,
    owner: 'IdentityAccess',
    schema: metadataEnvelope('LegalEvidenceContext.v1', {
      capture_channel: code,
      ip_prefix_hash: safeText,
      session_id: safeText,
      user_agent_hash: safeText,
    }),
  },
  {
    contract: 'ProviderResponseDiagnostics.v1',
    maximumBytes: 8 * 1024,
    owner: 'Payments',
    schema: metadataEnvelope('ProviderResponseDiagnostics.v1', {
      http_status: z.number().int().min(100).max(599),
      provider_code: safeText,
      provider_request_id: safeText,
      received_at: z.iso.datetime(),
      response_hash: safeText,
    }),
  },
  {
    contract: 'ProviderVerificationDiagnostics.v1',
    maximumBytes: 8 * 1024,
    owner: 'Payments',
    schema: metadataEnvelope('ProviderVerificationDiagnostics.v1', {
      provider_code: safeText,
      provider_request_id: safeText,
      response_hash: safeText,
      verified_at: z.iso.datetime(),
    }),
  },
  {
    contract: 'AuditDiagnosticContext.v1',
    maximumBytes: 8 * 1024,
    owner: 'Foundation',
    schema: metadataEnvelope('AuditDiagnosticContext.v1', {
      error_code: code,
      failure_stage: safeText,
      field_names: z.array(z.string().min(1).max(100)).max(100),
      result_reference: safeText.optional(),
    }),
  },
  {
    contract: 'SafeInboundHeaders.v1',
    maximumBytes: 4 * 1024,
    owner: 'Foundation',
    schema: metadataEnvelope('SafeInboundHeaders.v1', {
      content_type: safeText.optional(),
      provider_signature_key_id: safeText.optional(),
      request_id: safeText.optional(),
      user_agent_hash: safeText.optional(),
    }),
  },
  {
    contract: 'ScheduledJobResultSummary.v1',
    maximumBytes: 2 * 1024,
    owner: 'Foundation',
    schema: metadataEnvelope('ScheduledJobResultSummary.v1', {
      error_code: code.optional(),
      failed: nonNegativeInteger,
      scanned: nonNegativeInteger,
      skipped: nonNegativeInteger,
      succeeded: nonNegativeInteger,
    }),
  },
]);
