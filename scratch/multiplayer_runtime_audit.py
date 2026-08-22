#!/usr/bin/env python3
"""Deterministic checks for host-authoritative Chat and World room state."""

from __future__ import annotations

import unittest
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import horde_mcp_bridge as bridge


class MultiplayerRuntimeAudit(unittest.TestCase):
    def setUp(self) -> None:
        self.runtime = bridge.MultiplayerRuntime()
        self.runtime.port = 49999
        self.runtime.ensure_server = lambda: None
        created = self.runtime.create_room({
            "worldName": "Audit World", "sessionName": "Timeline",
            "displayName": "Host",
            "persona": {"name": "Mara", "pronouns": "she/her", "publicIdentity": "Town medic",
                        "secret": "must-not-leak"},
            "snapshot": {"worldName": "Audit World", "sessionName": "Timeline",
                         "location": "Square", "turn": 3,
                         "history": [{"role": "dm", "text": "Opening"}],
                         "apiKey": "must-not-leak"},
        })
        self.host = {
            "roomCode": created["roomCode"], "inviteToken": created["inviteToken"],
            "playerId": created["hostPlayerId"], "playerToken": created["playerToken"],
        }
        joined = self.runtime.join({**self.host, "displayName": "Guest",
                                    "persona": {"name": "Rowan", "reputation": "Known courier"}})
        self.guest = {**self.host, "playerId": joined["playerId"],
                      "playerToken": joined["playerToken"]}

    def test_sequential_round_and_host_commit(self) -> None:
        self.runtime.submit({**self.host, "text": "Host acts"})
        with self.assertRaises(ValueError):
            self.runtime.submit({**self.host, "text": "Host acts twice"})
        self.runtime.submit({**self.guest, "text": "Guest acts"})
        ready = self.runtime.state(self.host)
        self.assertEqual(ready["round"]["status"], "ready")
        self.runtime.commit({**self.host, "snapshot": {"worldName": "Audit World",
            "sessionName": "Timeline", "location": "Bridge", "turn": 4,
            "history": [{"role": "dm", "text": "Resolved"}]}})
        following = self.runtime.state(self.guest)
        self.assertEqual(following["round"]["number"], 2)
        self.assertEqual(following["round"]["activePlayerId"], self.host["playerId"])

    def test_guest_cannot_commit_or_apply_vote(self) -> None:
        self.runtime.submit({**self.host, "text": "Host acts"})
        self.runtime.submit({**self.guest, "text": "Guest acts"})
        with self.assertRaises(PermissionError):
            self.runtime.commit(self.guest)
        proposed = self.runtime.propose({**self.guest, "type": "reroll", "label": "Reroll"})
        self.runtime.vote({**self.host, "proposalId": proposed["proposalId"], "approve": True})
        with self.assertRaises(PermissionError):
            self.runtime.resolve_proposal(self.guest)
        self.runtime.resolve_proposal(self.host)

    def test_snapshot_is_allow_listed(self) -> None:
        state = self.runtime.state(self.guest)
        self.assertNotIn("apiKey", state["snapshot"])
        self.assertEqual(set(state["snapshot"]),
                         {"experienceType", "experienceName", "worldName", "sessionName", "location", "turn", "history"})

    def test_players_have_distinct_public_personas_and_permissions(self) -> None:
        host_state = self.runtime.state(self.host)
        guest_state = self.runtime.state(self.guest)
        self.assertIn("commit", host_state["permissions"])
        self.assertNotIn("commit", guest_state["permissions"])
        self.assertEqual(host_state["players"][0]["persona"]["publicIdentity"], "Town medic")
        self.assertEqual(host_state["players"][1]["persona"]["reputation"], "Known courier")
        self.assertNotIn("secret", host_state["players"][0]["persona"])

    def test_chat_room_metadata_is_preserved(self) -> None:
        runtime = bridge.MultiplayerRuntime()
        runtime.port = 49998
        runtime.ensure_server = lambda: None
        created = runtime.create_room({
            "experienceType": "chat", "experienceName": "Campfire Cast",
            "sessionName": "Friday", "displayName": "Host",
            "snapshot": {"experienceType": "chat", "experienceName": "Campfire Cast",
                         "sessionName": "Friday", "history": [{"role": "dm", "text": "Hi"}]},
        })
        auth = {"roomCode": created["roomCode"], "inviteToken": created["inviteToken"],
                "playerId": created["hostPlayerId"], "playerToken": created["playerToken"]}
        state = runtime.state(auth)
        self.assertEqual(state["experienceType"], "chat")
        self.assertEqual(state["experienceName"], "Campfire Cast")
        self.assertEqual(state["snapshot"]["experienceType"], "chat")


if __name__ == "__main__":
    unittest.main(verbosity=2)
