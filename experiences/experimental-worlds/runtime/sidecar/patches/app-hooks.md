# Horde Studio 16.7 application hooks

The integration adapter is intentionally thin. The first hooks are:

1. normalize `world.sidecarConfig` during world creation, load and validation;
2. normalize `timeline.sidecar` during session/timeline creation and lookup;
3. dispatch `executeWorldTurn` by protocol mode once the Sidecar turn loop is
   introduced;
4. preserve `validateWorldTurnReceipt → commitWorldTurnReceipt →
   processStructuredActions` as the only canonical Sidecar write path.

Future hooks must target named symbols in `manifest.json`, not copied line
offsets from a custom runtime.
