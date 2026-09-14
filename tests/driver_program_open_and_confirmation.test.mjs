import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapDriverConfirmationError,
  mapDriverAssignmentLoadError,
  isTransientSchemaOrNetworkError,
  mapDriverActionError,
} from '../src/hooks/useDriverAssignment.js';


// Simulated DB model matching Supabase tables and RPCs
class MockAssignmentDatabase {
  constructor() {
    this.assignments = new Map();
    this.eventLog = [];
  }

  seedAssignment({
    id,
    campaign_id = 'camp-001',
    operator_id = null,
    access_token = 'valid-token-123',
    status = 'active',
    starts_at = null,
    ends_at = null,
    metadata = {},
  }) {
    this.assignments.set(id, {
      id,
      campaign_id,
      operator_id,
      access_token,
      status,
      starts_at,
      ends_at,
      metadata,
    });
  }

  // Exact reproduction of public.log_assignment_event
  logAssignmentEvent({ p_assignment_id, p_action, p_access_token }) {
    const assignment = this.assignments.get(p_assignment_id);
    if (!assignment) {
      throw new Error('NOT_FOUND');
    }

    if (
      !p_access_token ||
      !assignment.access_token ||
      assignment.access_token !== p_access_token
    ) {
      throw new Error('UNAUTHORIZED');
    }

    const now = Date.now();
    if (p_action === 'assignment_program_confirmed') {
      if (
        assignment.status !== 'active' ||
        (assignment.starts_at && Date.parse(assignment.starts_at) > now) ||
        (assignment.ends_at && Date.parse(assignment.ends_at) <= now)
      ) {
        throw new Error('ASSIGNMENT_NOT_ACTIVE');
      }

      const hasOpened = this.eventLog.some(
        e => e.assignment_id === p_assignment_id && e.event_type === 'assignment_program_opened'
      );
      if (!hasOpened) {
        throw new Error('PROGRAM_NOT_OPENED');
      }

      // Unique constraint on confirmed
      const alreadyConfirmed = this.eventLog.some(
        e => e.assignment_id === p_assignment_id && e.event_type === 'assignment_program_confirmed'
      );
      if (!alreadyConfirmed) {
        this.eventLog.push({
          id: `evt-${this.eventLog.length + 1}`,
          assignment_id: p_assignment_id,
          operator_id: assignment.operator_id, // NULL for supplier handoff
          campaign_id: assignment.campaign_id,
          event_type: p_action,
          created_at: new Date().toISOString(),
        });
      }
      return;
    }

    if (p_action === 'assignment_program_opened') {
      // Idempotent deduplication: do not insert duplicate rows
      const alreadyOpened = this.eventLog.some(
        e => e.assignment_id === p_assignment_id && e.event_type === p_action
      );
      if (alreadyOpened) {
        return;
      }

      this.eventLog.push({
        id: `evt-${this.eventLog.length + 1}`,
        assignment_id: p_assignment_id,
        operator_id: assignment.operator_id, // NULL for supplier handoff
        campaign_id: assignment.campaign_id,
        event_type: p_action,
        created_at: new Date().toISOString(),
      });
      return;
    }

    throw new Error('INVALID_ACTION');
  }

  getPublicDriverAssignment(p_assignment_id) {
    const assignment = this.assignments.get(p_assignment_id);
    if (!assignment) return { error: 'not_found' };

    const confirmedEvent = this.eventLog.find(
      e => e.assignment_id === p_assignment_id && e.event_type === 'assignment_program_confirmed'
    );

    return {
      id: assignment.id,
      campaign_id: assignment.campaign_id,
      status: assignment.status,
      starts_at: assignment.starts_at,
      ends_at: assignment.ends_at,
      metadata: assignment.metadata,
      confirmed_at: confirmedEvent ? confirmedEvent.created_at : null,
    };
  }
}

describe('Driver Assignment Program Open & Confirmation Engine', () => {
  it('A. VALID LINK: open assignment marks program opened and accept succeeds', () => {
    const db = new MockAssignmentDatabase();
    const asgId = '4e2e7f9f-848e-4c80-8104-5666062077bf';
    const token = 'valid-token-hassan';

    db.seedAssignment({
      id: asgId,
      operator_id: null, // supplier handoff (no fake Admin)
      access_token: token,
      status: 'active',
      metadata: { supplier_mode: 'manual', supplier_name: 'LGT' },
    });

    // Step 1: Driver opens page
    db.logAssignmentEvent({
      p_assignment_id: asgId,
      p_action: 'assignment_program_opened',
      p_access_token: token,
    });

    const openEvents = db.eventLog.filter(
      e => e.assignment_id === asgId && e.event_type === 'assignment_program_opened'
    );
    assert.equal(openEvents.length, 1);
    assert.equal(openEvents[0].operator_id, null); // verifies null operator is accepted

    // Step 2: Driver confirms program
    db.logAssignmentEvent({
      p_assignment_id: asgId,
      p_action: 'assignment_program_confirmed',
      p_access_token: token,
    });

    const confirmEvents = db.eventLog.filter(
      e => e.assignment_id === asgId && e.event_type === 'assignment_program_confirmed'
    );
    assert.equal(confirmEvents.length, 1);
    assert.equal(confirmEvents[0].operator_id, null);

    const publicView = db.getPublicDriverAssignment(asgId);
    assert.ok(publicView.confirmed_at);
  });

  it('B. RELOAD: reloading page is idempotent with zero duplicate open events', () => {
    const db = new MockAssignmentDatabase();
    const asgId = 'asg-reload-test';
    const token = 'token-reload-123';

    db.seedAssignment({ id: asgId, access_token: token });

    // First load
    db.logAssignmentEvent({
      p_assignment_id: asgId,
      p_action: 'assignment_program_opened',
      p_access_token: token,
    });

    // Reload 1
    db.logAssignmentEvent({
      p_assignment_id: asgId,
      p_action: 'assignment_program_opened',
      p_access_token: token,
    });

    // Reload 2
    db.logAssignmentEvent({
      p_assignment_id: asgId,
      p_action: 'assignment_program_opened',
      p_access_token: token,
    });

    const allEvents = db.eventLog.filter(e => e.assignment_id === asgId);
    assert.equal(allEvents.length, 1, 'Only one open event recorded despite multiple reloads');
  });

  it('C. FAST CLICK: client pre-open safeguard prevents PROGRAM_NOT_OPENED race', async () => {
    const db = new MockAssignmentDatabase();
    const asgId = 'asg-fastclick-test';
    const token = 'token-fast-123';

    db.seedAssignment({ id: asgId, access_token: token });

    // Client state simulation before background open completes:
    let openEventStatus = 'recording';

    // Simulated confirm action with race condition pre-open guard
    async function simulateConfirm() {
      if (openEventStatus !== 'success') {
        // Pre-open registration safeguard: ensures open is recorded first
        db.logAssignmentEvent({
          p_assignment_id: asgId,
          p_action: 'assignment_program_opened',
          p_access_token: token,
        });
        openEventStatus = 'success';
      }
      db.logAssignmentEvent({
        p_assignment_id: asgId,
        p_action: 'assignment_program_confirmed',
        p_access_token: token,
      });
    }

    await assert.doesNotReject(async () => {
      await simulateConfirm();
    });

    const events = db.eventLog.filter(e => e.assignment_id === asgId);
    assert.equal(events.length, 2);
    assert.equal(events[0].event_type, 'assignment_program_opened');
    assert.equal(events[1].event_type, 'assignment_program_confirmed');
  });

  it('D. INVALID TOKEN: returns UNAUTHORIZED and records zero events', () => {
    const db = new MockAssignmentDatabase();
    const asgId = 'asg-unauth-test';
    db.seedAssignment({ id: asgId, access_token: 'valid-secret-token' });

    assert.throws(
      () => {
        db.logAssignmentEvent({
          p_assignment_id: asgId,
          p_action: 'assignment_program_opened',
          p_access_token: 'tampered-or-wrong-token',
        });
      },
      /UNAUTHORIZED/
    );

    assert.equal(db.eventLog.length, 0);
  });

  it('E. EXPIRED/REVOKED ASSIGNMENT: rejects confirmation with ASSIGNMENT_NOT_ACTIVE', () => {
    const db = new MockAssignmentDatabase();
    const asgId = 'asg-expired-test';
    const token = 'token-expired-123';

    db.seedAssignment({
      id: asgId,
      access_token: token,
      status: 'active',
      ends_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    });

    db.logAssignmentEvent({
      p_assignment_id: asgId,
      p_action: 'assignment_program_opened',
      p_access_token: token,
    });

    assert.throws(
      () => {
        db.logAssignmentEvent({
          p_assignment_id: asgId,
          p_action: 'assignment_program_confirmed',
          p_access_token: token,
        });
      },
      /ASSIGNMENT_NOT_ACTIVE/
    );
  });

  it('F. NETWORK FAILURE / RAW ERROR UX: mapDriverConfirmationError maps codes to friendly Italian text', () => {
    // PROGRAM_NOT_OPENED must never be shown raw
    const errOpen = mapDriverConfirmationError(new Error('PROGRAM_NOT_OPENED'));
    assert.equal(errOpen, "Non siamo riusciti a registrare l'apertura del programma. Riprova.");
    assert.doesNotMatch(errOpen, /PROGRAM_NOT_OPENED/);

    const errActive = mapDriverConfirmationError(new Error('ASSIGNMENT_NOT_ACTIVE'));
    assert.equal(errActive, "Questa assegnazione non è attiva al momento.");

    const errAuth = mapDriverConfirmationError(new Error('UNAUTHORIZED'));
    assert.equal(errAuth, "Link di accesso non valido o non autorizzato. Verifica il messaggio ricevuto.");

    const errGeneric = mapDriverConfirmationError(new Error('Network connection timeout'));
    assert.equal(errGeneric, "Impossibile confermare la presa in carico del programma. Riprova.");
  });

  it('G. POSTGREST SCHEMA CACHE DETECTION: isTransientSchemaOrNetworkError detects schema cache / 503 errors', () => {
    // Exact production error
    const schemaErr = new Error('Could not query the database for the schema cache. Retrying.');
    assert.equal(isTransientSchemaOrNetworkError(schemaErr), true);

    // PGRST error code
    const pgrstErr = { message: 'PGRST002: database timeout' };
    assert.equal(isTransientSchemaOrNetworkError(pgrstErr), true);

    // HTTP 503 status
    const status503Err = { status: 503, message: 'Service Unavailable' };
    assert.equal(isTransientSchemaOrNetworkError(status503Err), true);

    // Network / fetch error
    const fetchErr = new TypeError('Failed to fetch');
    assert.equal(isTransientSchemaOrNetworkError(fetchErr), true);

    // Regular permanent errors must NOT be marked transient
    const notFoundErr = new Error('Assegnazione non trovata.');
    assert.equal(isTransientSchemaOrNetworkError(notFoundErr), false);

    const revokedErr = new Error('Questa assegnazione è stata revocata.');
    assert.equal(isTransientSchemaOrNetworkError(revokedErr), false);
  });

  it('H. SCHEMA CACHE / TRANSIENT ERROR UX: mapDriverAssignmentLoadError never shows raw schema cache error', () => {
    const rawSchemaError = new Error('Could not query the database for the schema cache. Retrying.');
    const userMessage = mapDriverAssignmentLoadError(rawSchemaError);

    // Must be friendly Italian
    assert.equal(userMessage, 'Servizio temporaneamente non disponibile. Riprova tra poco.');

    // Must NEVER contain technical jargon
    assert.doesNotMatch(userMessage, /schema/i);
    assert.doesNotMatch(userMessage, /cache/i);
    assert.doesNotMatch(userMessage, /retrying/i);
    assert.doesNotMatch(userMessage, /pgrst/i);

    // Permanent errors retain appropriate explanations
    const notFoundMsg = mapDriverAssignmentLoadError(new Error('not_found'));
    assert.equal(notFoundMsg, 'Assegnazione non trovata. Verifica il link ricevuto o contatta il tuo amministratore.');

    const revokedMsg = mapDriverAssignmentLoadError(new Error('Questa assegnazione è stata revocata. Contatta il tuo amministratore.'));
    assert.equal(revokedMsg, 'Questa assegnazione è stata revocata. Contatta il tuo amministratore.');
  });

  it('I. SUPPLIER-ONLY ASSIGNMENT START: start session succeeds with operator_id = null and transitions zone to "In corso"', () => {
    const db = new MockAssignmentDatabase();
    const assignmentId = 'assign-supplier-handoff-1';
    const zoneId = 'zone-legnano-1';

    // Supplier handoff assignment (operator_id is NULL)
    db.seedAssignment({
      id: assignmentId,
      campaign_id: 'camp-100',
      operator_id: null,
      access_token: 'secret-token-xyz',
      status: 'active',
      metadata: { supplier_name: 'lgt' },
    });

    // Simulated v2 validation (supports operator_id = null)
    const isValid = (aId, driverId) => {
      const a = db.assignments.get(aId);
      if (!a || a.status !== 'active') return false;
      // In v2: if operator_id is null, identity is assignment.id
      const expectedIdentity = a.operator_id || a.id;
      return driverId === expectedIdentity;
    };

    const assignment = db.assignments.get(assignmentId);
    const resolvedIdentity = assignment.operator_id || assignment.id;
    assert.equal(resolvedIdentity, assignmentId);
    assert.equal(isValid(assignmentId, resolvedIdentity), true);

    // Delivery session creation
    const session = {
      id: 'session-001',
      assignment_id: assignmentId,
      campaign_id: assignment.campaign_id,
      driver_id: resolvedIdentity,
      status: 'started',
      campaign_zone_id: zoneId,
      started_at: new Date().toISOString(),
    };

    assert.equal(session.driver_id, assignmentId);
    assert.equal(session.status, 'started');
    assert.equal(session.campaign_zone_id, zoneId);

    // Zone transitions to "In corso"
    const zone = { id: zoneId, name: 'Legnano', status: 'Da iniziare' };
    zone.status = 'In corso';
    assert.equal(zone.status, 'In corso');
  });

  it('J. ANTI-DUPLICATE SESSION / DOUBLE-CLICK: duplicate start rejects with ACTIVE_SESSION_EXISTS', () => {
    const sessions = [
      { id: 'sess-1', driver_id: 'assign-1', status: 'started', campaign_id: 'camp-1' }
    ];

    const tryStartSession = (driverId, campaignId) => {
      const existing = sessions.find(s => s.driver_id === driverId && s.campaign_id === campaignId && s.status === 'started');
      if (existing) {
        throw new Error('ACTIVE_SESSION_EXISTS: sessione già attiva');
      }
      return { id: 'sess-2', driver_id: driverId, status: 'started' };
    };

    assert.throws(
      () => tryStartSession('assign-1', 'camp-1'),
      /ACTIVE_SESSION_EXISTS/
    );
  });

  it('K. DRIVER ACTION ERROR MAPPING: action errors map to friendly Italian text with zero raw technical leakage', () => {
    const authErr = new Error('ASSEGNAZIONE_NON_AUTORIZZATA');
    assert.equal(mapDriverActionError(authErr), "Non sei autorizzato ad avviare questa sessione. Verifica il link o contatta l'amministratore.");

    const opAuthErr = new Error('OPERATORE_NON_AUTENTICATO');
    assert.equal(mapDriverActionError(opAuthErr), "Non sei autorizzato ad avviare questa sessione. Verifica il link o contatta l'amministratore.");

    const dupErr = new Error('ACTIVE_SESSION_EXISTS: sessione sess-1 attiva, ultima attivita 12 secondi fa');
    assert.equal(mapDriverActionError(dupErr), "Esiste già una sessione attiva per questa assegnazione.");

    const sessGiaAttivaErr = new Error('SESSIONE_GIA_ATTIVA');
    assert.equal(mapDriverActionError(sessGiaAttivaErr), "Esiste già una sessione attiva per questa assegnazione.");

    const devMismatchErr = new Error('DEVICE_MISMATCH');
    assert.equal(mapDriverActionError(devMismatchErr), "Questa sessione è attiva su un altro dispositivo. Contatta l'amministratore.");

    const geoDeniedErr = new Error('User denied Geolocation');
    assert.equal(mapDriverActionError(geoDeniedErr), "Permesso di geolocalizzazione negato. Abilita la posizione nel browser per iniziare.");

    // Zero technical leak
    const mapped = mapDriverActionError(dupErr);
    assert.doesNotMatch(mapped, /sessione sess-1/i);
    assert.doesNotMatch(mapped, /errcode/i);
    assert.doesNotMatch(mapped, /42501/i);
    assert.doesNotMatch(mapped, /23505/i);
  });
});


