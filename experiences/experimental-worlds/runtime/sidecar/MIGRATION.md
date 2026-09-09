# Legacy to Sidecar migration contract

Migration is a selected-world, user-triggered operation exposed by the World
Studio migration wizard. The wizard lists Inline Legacy timelines with their
history/receipt counts and warnings, lets the author select a subset, creates a
per-world rollback backup, and migrates only those timelines. Raw history and
canonical receipts remain in place; message embeddings and derived episodic
material are cleared and rebuilt under Sidecar. The latest five backups remain
available for explicit restore. Other worlds and unselected timelines are not
changed.

Migration does not advance time, reinterpret history, convert relationships,
promote locations or change canonical world state.
