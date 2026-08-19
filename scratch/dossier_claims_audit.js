// Standalone functional check for dossier-claims.js: create/resolve/mature/
// suppress/approve claims, and confirm branch-fork on reroll discards the
// abandoned take without losing it as provenance. No world content needed —
// this exercises the generic engine only.
const assert = require('assert');
const HordeDossiers = require('../dossier-claims.js');

function pass(label) { console.log(`PASS: ${label}`); }

const world = { mechanicsProfile: 'dossier_claims_v1' };
const disabledWorld = { mechanicsProfile: '' };

assert.strictEqual(HordeDossiers.isEnabled(world), true);
assert.strictEqual(HordeDossiers.isEnabled(disabledWorld), false);
pass('isEnabled gates strictly on the opted-in profile id');

function freshSession() {
    return { id: 's1', turnCount: 1, worldStateVersion: 0, worldTime: '' };
}

// --- basic claim lifecycle ---
{
    const sess = freshSession();
    const entity = { id: 'npc_1', type: 'npc', name: 'Test NPC' };
    HordeDossiers.ensureCharacter(world, sess, entity);

    // Automatic (model-authored) claims require evidence + a reason.
    const noEvidence = HordeDossiers.createClaim(world, sess, {
        characterId: 'npc_1', fieldPath: 'persona', value: 'guarded', origin: 'main_model', reason: 'observed'
    });
    assert.strictEqual(noEvidence.accepted, false);
    assert.strictEqual(noEvidence.error, 'automatic_claim_requires_evidence');
    pass('automatic claim without evidence is rejected');

    const withEvidence = HordeDossiers.createClaim(world, sess, {
        characterId: 'npc_1', fieldPath: 'persona', value: 'guarded but curious',
        origin: 'main_model', evidenceIds: ['event:e1'], reason: 'observed across two scenes'
    });
    assert.strictEqual(withEvidence.accepted, true);
    pass('automatic claim with evidence is accepted');

    const resolved = HordeDossiers.resolveDossier(world, sess, entity);
    assert.strictEqual(resolved.value.persona, 'guarded but curious');
    pass('resolveDossier layers the accepted claim over the authored base');

    // User-authored claims never need evidence and immediately reach 'authored'.
    const userClaim = HordeDossiers.createAuthoredClaim(world, sess, 'npc_1', 'persona', 'warm and direct');
    assert.strictEqual(userClaim.accepted, true);
    assert.strictEqual(userClaim.claim.maturity, 'authored');
    const resolvedAfterUser = HordeDossiers.resolveDossier(world, sess, entity);
    assert.strictEqual(resolvedAfterUser.value.persona, 'warm and direct');
    pass('user-authored claim supersedes the automatic one and needs no evidence');
}

// --- core-identity soft lock: an automatic replacement on an authored field needs approval ---
{
    const sess = freshSession();
    const entity = { id: 'npc_2', type: 'npc', name: 'Locked NPC' };
    HordeDossiers.ensureCharacter(world, sess, entity);
    HordeDossiers.createAuthoredClaim(world, sess, 'npc_2', 'name', 'Original Name');

    const challenge = HordeDossiers.createClaim(world, sess, {
        characterId: 'npc_2', fieldPath: 'name', value: 'New Name', mode: 'replacement',
        origin: 'main_model', evidenceIds: ['event:e2'], reason: 'model tried to rename them'
    });
    assert.strictEqual(challenge.accepted, true);
    assert.strictEqual(challenge.claim.status, 'pending_approval');
    assert.strictEqual(challenge.claim.softLockConflict, true);
    const resolvedLocked = HordeDossiers.resolveDossier(world, sess, entity);
    assert.strictEqual(resolvedLocked.value.name, 'Original Name');
    pass('a pending core-identity challenge does not affect resolution until approved');

    const approved = HordeDossiers.approveClaim(world, sess, challenge.claim.claimId);
    assert.strictEqual(approved, true);
    const resolvedApproved = HordeDossiers.resolveDossier(world, sess, entity);
    assert.strictEqual(resolvedApproved.value.name, 'New Name');
    pass('approving a pending claim makes it active and authored');
}

// --- suppression is reversible ---
{
    const sess = freshSession();
    const entity = { id: 'npc_3', type: 'npc', name: 'Suppress Me' };
    HordeDossiers.ensureCharacter(world, sess, entity);
    const claim = HordeDossiers.createAuthoredClaim(world, sess, 'npc_3', 'routines', ['runs at dawn']);
    HordeDossiers.suppressClaim(world, sess, claim.claim.claimId, 'user disagreed');
    let resolved = HordeDossiers.resolveDossier(world, sess, entity);
    assert.strictEqual(resolved.value.routines, undefined);
    HordeDossiers.restoreSuppressedClaim(world, sess, claim.claim.claimId);
    resolved = HordeDossiers.resolveDossier(world, sess, entity);
    assert.deepStrictEqual(resolved.value.routines, ['runs at dawn']);
    pass('suppress/restore round-trips a claim without losing it');
}

// --- maturation needs turns, scenes AND corroboration ---
{
    const sess = freshSession();
    const entity = { id: 'npc_4', type: 'npc', name: 'Slow Burn' };
    HordeDossiers.ensureCharacter(world, sess, entity);
    const claim = HordeDossiers.createClaim(world, sess, {
        characterId: 'npc_4', fieldPath: 'goals.current', value: { text: 'find the ledger' },
        origin: 'agent', evidenceIds: ['event:e3'], reason: 'inferred from repeated searching'
    }).claim;
    assert.strictEqual(claim.maturity, 'ephemeral');
    for (let i = 0; i < 5; i++) {
        HordeDossiers.matureClaims(world, sess, { revision: i + 1, sceneChanged: false });
    }
    const stillEphemeral = sess.dossierState.dossierClaims.find(c => c.claimId === claim.claimId);
    assert.strictEqual(stillEphemeral.maturity, 'ephemeral');
    pass('maturation does not advance on turns alone without corroborating evidence');
}

// --- prepareCommit / applyPreparedCommit end-to-end from a receipt-shaped validation object ---
{
    const sess = freshSession();
    const entity = { id: 'npc_5', type: 'npc', name: 'Receipt NPC' };
    HordeDossiers.ensureCharacter(world, sess, entity);
    const validation = {
        receipt: { turn_id: 'turn_1' },
        acceptedEvents: [{ id: 'ev_1', actor_id: 'npc_5', type: 'outfit', outfit: 'rain jacket' }],
        receipt_state_updates: {}
    };
    validation.receipt.state_updates = {
        dossier_claim_updates: [{
            character_id: 'npc_5', field_path: 'affiliations', mode: 'additive',
            value: ['dockworkers union'], evidence_ids: ['event:ev_1'], reason: 'mentioned their union'
        }]
    };
    const prepared = HordeDossiers.prepareCommit(world, sess, validation);
    assert.strictEqual(prepared.enabled, true);
    assert.strictEqual(prepared.accepted, true);
    // one from state_updates.dossier_claim_updates + two derived from the outfit event
    assert.strictEqual(prepared.claims.length, 3);
    const applied = HordeDossiers.applyPreparedCommit(world, sess, prepared);
    assert.strictEqual(applied.applied, true);
    const resolved = HordeDossiers.resolveDossier(world, sess, entity);
    assert.deepStrictEqual(resolved.value.affiliations, ['dockworkers union']);
    assert.strictEqual(resolved.value.outfits.current, 'rain jacket');
    pass('prepareCommit + applyPreparedCommit derive and apply claims from a receipt');

    const disabledPrepared = HordeDossiers.prepareCommit(disabledWorld, sess, validation);
    assert.strictEqual(disabledPrepared.enabled, false);
    assert.strictEqual(disabledPrepared.accepted, true);
    pass('prepareCommit is a safe no-op for a world that has not opted in');
}

// --- fork-after-restore: a reroll discards the abandoned take as inactive provenance ---
{
    const sess = freshSession();
    const entity = { id: 'npc_6', type: 'npc', name: 'Reroll NPC' };
    HordeDossiers.ensureCharacter(world, sess, entity);
    const original = HordeDossiers.createAuthoredClaim(world, sess, 'npc_6', 'persona', 'take one').claim;
    const discarded = HordeDossiers.captureDiscardedState(world, sess);
    // Simulate a reroll clobbering dossierState with a snapshot missing this claim.
    sess.dossierState = { activeLineage: [sess.dossierState.activeBranchId] };
    HordeDossiers.forkAfterRestore(world, sess, discarded);
    const state = HordeDossiers.ensureSession(world, sess);
    const invalidated = state.dossierClaims.find(c => c.claimId === original.claimId);
    assert.ok(invalidated, 'the discarded claim is retained, not deleted');
    assert.strictEqual(invalidated.status, 'branch_invalid');
    const resolvedAfterFork = HordeDossiers.resolveDossier(world, sess, entity);
    assert.notStrictEqual(resolvedAfterFork.value.persona, 'take one');
    pass('forkAfterRestore retains the discarded claim as inactive provenance, not live state');
}

console.log('\ndossier claims engine audit passed.');
