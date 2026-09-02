# Legacy to Sidecar migration contract

Migration is selected-world and user-triggered by selecting Sidecar in World
Studio and saving. The current integration creates a per-timeline migration
record with source counts and compatibility warnings, preserves the canonical
history/receipts in place, clears message embeddings and derived episodic
material, and starts Sidecar from that unchanged canonical source.

The migration record is an audit/compatibility backup, not yet a full rollback
wizard. Legacy worlds remain Inline Legacy unless their author deliberately
switches and saves the world. A later UI increment must add confirmation,
backup export/restore and selected-timeline controls before this is presented
as a complete migration wizard.

Migration does not advance time, reinterpret history, convert relationships,
promote locations or change canonical world state.
