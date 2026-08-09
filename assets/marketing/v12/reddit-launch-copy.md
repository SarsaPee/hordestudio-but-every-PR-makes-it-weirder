# Horde Studio 12 — Reddit launch kit

## Recommended title

I built the LLM roleplay frontend I always wanted: persistent worlds, Virtual Humans, and optional local cognition — Horde Studio 12

## Alternate titles

- Horde Studio 12: the chat frontend where worlds keep moving after you stop typing
- What if an LLM frontend treated chat as the surface of a simulation? Horde Studio 12
- I turned my LLM chat frontend into a living-world and Virtual Human engine

## Post

I have been building Horde Studio around one question:

**What if chat was only the surface of the experience—and there was an actual persistent simulation underneath it?**

SillyTavern set an incredibly high bar for flexible character chat. Horde Studio takes a different route: it is trying to become the most complete *simulation-first* frontend for LLM roleplay—one app for traditional chats, ongoing virtual people, and worlds that remember what happened.

Version 12 is the biggest step toward that idea so far.

### Three ways to play

**Chat Library** is the familiar mode: characters, group rooms, lore, memory, personas, regex, rerolls, branching sessions, and per-character model configuration. V12 also adds optional right-hand HUDs, status text, and custom meters, so a normal chat can track trust, suspicion, health, investigation progress, or anything else without exposing raw model markup.

**Virtual Humans** are designed to feel like people who exist between messages. They have their own timezone, schedule, mood, memories, availability, private life, and evolving relationship with you. They can notice when you texted, recognize that you disappeared for days, reply late because they were busy, double-text, refuse a request, send a situation-aware photo or voice note, and continue across persistent or forked timelines.

**Worlds** are persistent sandbox simulations. The engine tracks locations, characters, schedules, agendas, factions, law, reputation, quests, shops, clocks, weather, clothing, dice mechanics, and world state per timeline. Starting Lives let the same world begin from radically different positions, while procedural growth can introduce grounded people, places, and consequences as play expands.

### New in V12: Horde Labs

Horde Labs is an optional local cognition layer for Chat, Worlds, and Virtual Humans.

It can connect to a tiny local model through Ollama, LM Studio, llama.cpp, KoboldCpp, or another localhost OpenAI-compatible server—or install an **Embedded Tiny Brain** directly inside Horde Studio. The small model is not expected to write the story. It handles narrow support jobs such as continuity hints, actor-scoped intent, state proposals, social cues, and memory salience.

The important part is the architecture: **the tiny model proposes; Horde Studio validates; the existing engine stays in control.** You can begin in Shadow mode, inspect receipts and validity, and only enable Assist when you trust the results. If the model times out, fails, or returns malformed data, Horde Studio silently falls back to its normal behavior.

That means your main creative model can stay on OpenRouter, GPTProto, or a local server while a much smaller private model helps maintain the illusion underneath it.

### Media and provider freedom

Text, images, and voice are configured separately. You can keep OpenRouter for text and use GPTProto, ComfyUI workflows, compatible local image servers, or connected MCP media tools for visuals. Virtual Humans support distinct profile and generation-reference images, context-aware camera logic, photo styles, voice previews, calls, and voice notes.

Horde Studio is local-first and portable. Your projects live in your browser profile, can be exported and backed up, and cloud requests only go to the providers you choose. A local OpenAI-compatible endpoint can keep text generation on your own machine as well.

### Why I think this is special

Most frontends are excellent at presenting an AI response. Horde Studio is trying to make the response part of a system that remembers **who is where, what changed, who witnessed it, what time it happened, and what should still matter later**.

It is ambitious, experimental, and still evolving—but I genuinely think it is becoming one of the most capable LLM roleplay frontends available if you care about persistent simulation instead of disposable chats.

I would love hard feedback from experienced SillyTavern users, especially on long-session continuity, provider compatibility, the creator flow, and whether the local cognition layer improves immersion on lower-end hardware.

**GitHub:** https://github.com/ddkhan24/hordestudio

**Horde Studio 12 release:** https://github.com/ddkhan24/hordestudio/releases/tag/v12.0.1

**Discord:** https://discord.gg/9eyjcMbsST

## Suggested first comment

A few honest caveats before people ask:

- Horde Labs is optional and experimental. The Embedded Tiny Brain is a support model, not a replacement for a capable main writer.
- “Local-first” does not mean cloud providers become local. If you select OpenRouter, GPTProto, or another cloud service, that provider still receives the content needed for its request.
- Large Worlds benefit from a strong main model and sensible context settings.
- I am actively fixing provider-specific image and voice edge cases, so useful logs and reproducible reports are genuinely welcome.
- The app is a portable local web app; the release includes launchers for macOS, Windows, and Linux/Chromebook.

## Carousel order and captions

1. **Hero poster** — Horde Studio 12: The World Thinks Back.
2. **Living Worlds** — Persistent timelines, autonomous society systems, and starting lives that actually change who you are.
3. **Virtual Humans** — They track time, silence, relationships, routines, photos, voice notes, and diverging timelines.
4. **Horde Labs** — Optional tiny local cognition, validated fallbacks, and custom HUD meters without replacing your main model.

## Short version

Horde Studio 12 is a local-first LLM roleplay frontend built around persistent simulation. It combines traditional character chat, time-aware Virtual Humans, and living sandbox Worlds with tracked locations, NPC routines, factions, quests, law, dice, and evolving state. V12 adds Horde Labs: an optional tiny local cognition layer—connected or embedded—that proposes continuity and state hints while Horde Studio validates them and safely falls back to the existing engine. Bring OpenRouter, GPTProto, local models, ComfyUI workflows, image providers, and TTS; configure text, images, and voice independently.
