# Third-party notices

## Cactus Needle 2 / TinyBrain 2

Horde Studio can optionally download the official Cactus Needle 2 browser runtime and model from `Cactus-Compute/needle2` after the user explicitly chooses **Download & install**. The assets are stored in that browser profile's cache and are not included in Horde Studio backups.

- Project: https://github.com/cactus-compute/needle
- Model/runtime assets: https://huggingface.co/Cactus-Compute/needle2
- Model package license: Apache License 2.0
- Upstream source repository license: see the license included by the upstream repository/revision

Horde Studio does not modify or redistribute the downloaded model weights. TinyBrain 2 output remains advisory and is subject to Horde Studio's confidence gates and deterministic validators.

## SillyTavern-ScenePulse

Scene Intelligence adapts selected presentation, prompt-assembly, delta-merge,
thought-panel, relationship, history and responsive UI structures from the
local upstream `SillyTavern-ScenePulse-main` source. Horde does not ship its
SillyTavern host integration, extension runtime, tracker state, event hooks or
settings persistence; all authority and persistence remain Horde-owned.

- Upstream project: https://github.com/xenofei/SillyTavern-ScenePulse
- License: GPL-3.0
- Local adaptation map: `docs/scene-intelligence-source-port.md`

For any distribution containing substantial reused upstream material, preserve
the upstream GPL-3.0 license/copyright material and verify the repository's
applicable distribution obligations.
