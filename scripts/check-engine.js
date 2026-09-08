// Headless release gate for Worlds and Virtual Humans. No provider calls.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const suites = [
    'vh_photo_pipeline_audit', 'vh_garment_vision_audit', 'vh_immersion_followthrough_audit', 'vh_world_systems_audit', 'vh_spatial_audit', 'vh_project_learning_audit', 'vh_motive_action_audit', 'vh_dialogue_audit', 'photo_continuity_audit', 'mcp_image_contract_audit', 'vh_social_agency_audit', 'vh_procedural_day_audit', 'vh_conversation_context_audit', 'vh_connected_system_audit', 'engine_integrity_audit', 'companion_reply_transaction_audit', 'companion_attention_audit', 'companion_activity_audit', 'companion_overhaul_audit',
    'living_world_audit', 'living_world_stress_test', 'authored_world_audit',
    'companion_audit', 'movement_ledger_stress_test', 'world_turn_transaction_audit',
    'world_graph_consistency_audit', 'narrated_presence_audit', 'immersion_engine_audit',
    'world_map_stress_test', 'rules_engine_stress_test', 'world_intent_reliability_audit',
    'movement_hierarchy_audit', 'world_role_consequence_audit', 'timeline_life_seed_audit',
    'sandbox_world_audit', 'society_audit', 'companion_creation_lifecycle_audit',
    'always_on_vh_audit', 'persistence_hotfix_audit', 'world_schema_migration_audit',
    'settings_persistence_audit'
];
for (const file of ['app.js', 'vh-simulation-core.js', 'vh-activity-engine.js', 'vh-conversation-engine.js', 'vh-world-engine.js', 'vh-host-worker.js']) {
    const syntax = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' });
    if (syntax.status !== 0) process.exit(1);
}
const failed = [];
for (const suite of suites) {
    const result = spawnSync(process.execPath, [`scratch/${suite}.js`], {
        cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024
    });
    if (result.status === 0) {
        console.log(`PASS ${suite}`);
    } else {
        failed.push(suite);
        console.error(`FAIL ${suite}\n${result.stdout || ''}${result.stderr || ''}${result.error || ''}`);
    }
}
console.log(`${suites.length - failed.length}/${suites.length} engine suites passed.`);
process.exitCode = failed.length ? 1 : 0;
