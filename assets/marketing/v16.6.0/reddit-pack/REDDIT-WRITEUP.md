# Horde Studio 16.6 — Reddit post

## Title

**I built the AI roleplay frontend I wanted when character chat stopped being enough — Horde Studio v16.6**

## Post

I like character-card chat. What kept breaking the illusion for me was everything outside the chat window.

The town did not really exist. The NPC who left the room could appear again for no reason. Time, inventory, clothing, relationships and consequences quietly reset whenever the model lost the thread. A character could claim to be asleep, then answer instantly at 2 a.m. like nothing happened.

So I built **Horde Studio**: a free, open-source, local-first frontend for character chat, persistent AI worlds, simulated people and shared roleplay campaigns.

If SillyTavern is the flexible character-chat workbench, Horde Studio is my attempt to build the simulation layer around it. It imports SillyTavern character cards and presets, but it is aimed at people who want the **person and the world to keep existing after the last message**.

### Living Worlds

A World is not just a system prompt and background. It can contain regions, buildings, rooms, routes, NPCs, schedules, factions, quests, inventories, outfits, time, weather and persistent state. NPCs can pursue agendas off-screen. The engine tracks who moved, what changed and what should still be true on the next turn.

Play a medieval sandbox, 2005 suburban life sim, workplace comedy, cyberpunk campaign, horror mystery or your own setting. Different starting lives can give you a different home, status, equipment, social circle and opening situation in the same world.

### Virtual Humans

These are built for texting simulation rather than instant-response roleplay. They have schedules, moods, memories, evolving relationships and their own clock. They may reply late, double-text, leave you on read, remember that you disappeared for days, refuse a photo, send a voice note, or post to an optional social feed with galleries and clips.

Jane Harlow and Ashlyn Reynolds are included as complete editable examples.

### Optional RPG mechanics

Stay completely freeform, or enable Light/Full mechanics with world-specific attributes, skills, checks, equipment, damage, armor, resources, progression, buffs, debuffs and status effects. It is genre-agnostic rather than hardcoded for fantasy.

### Host-powered multiplayer

Friends join through LAN or an Internet room. The host owns the canonical campaign save and makes the model call, so guests do not need API keys. Every player keeps a separate persona, sheet, inventory and turn. Multiplayer campaigns stay separate from single-player saves.

### Bring your own stack

Use OpenRouter for text and another provider for images or voice. Connect local OpenAI-compatible servers, ComfyUI and custom endpoints. Horde Studio runs locally in the browser and stores primary saves on your device.

### Is it a SillyTavern replacement?

Not for every workflow. SillyTavern is mature, deeply configurable and has a huge ecosystem. Horde Studio is for the itch where a chat interface is no longer enough: persistent simulation, autonomous people, structured worlds, optional game mechanics and a shared table.

It is active development. Multiplayer is new, and I would rather hear where it falls short than pretend it is finished.

### Install

Download the portable ZIP, extract the complete folder, run the launcher for your OS, then connect a provider or local model. Do not copy or open `index.html` by itself.

Release: https://github.com/ddkhan24/hordestudio/releases/tag/v16.6.0

Source: https://github.com/ddkhan24/hordestudio

Discord: https://discord.gg/9eyjcMbsST

All carousel images are genuine in-app screens. **What would Horde Studio need before you would move a long-running roleplay or tabletop campaign into it?**
