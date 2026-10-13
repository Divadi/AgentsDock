"""Real bounded readers over disposable native transcripts; no provider calls."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import agent_server as server
import claude_history_repair as claude
import codex_history_repair as codex


MIB = 1024 * 1024
PROVIDER = "11111111-2222-3333-4444-555555555555"


def encoded(record):
    return (json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def message(backend, text):
    if backend == "claude":
        return {"type": "user", "message": {"content": [{"type": "text", "text": text}]}}
    return {"type": "event_msg", "payload": {"type": "user_message", "message": text}}


def large_record(backend):
    if backend == "claude":
        return {"type": "user", "message": {"content": [
            {"type": "text", "text": "Image caption 中文"},
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "A" * (5 * MIB)}},
        ]}}
    return {"type": "response_item", "payload": {"type": "function_call_output", "output": "x" * (5 * MIB)}}


class LargeTranscriptImportTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="large-transcript-")
        self.addCleanup(temporary.cleanup)
        self.path = Path(temporary.name) / f"{PROVIDER}.jsonl"

    def stamp(self):
        value = self.path.stat()
        return {name: int(getattr(value, name)) for name in ("st_dev", "st_ino", "st_size", "st_mtime_ns")}

    def test_readers_agree_without_expanding_text_or_total_file_budgets(self):
        self.assertEqual(server.MAX_LOCAL_TRANSCRIPT_LINE_BYTES, 32 * MIB)
        self.assertEqual(claude.MAX_LINE_BYTES, server.MAX_LOCAL_TRANSCRIPT_LINE_BYTES)
        self.assertEqual(codex.NATIVE_PROOF_LINE_BYTES, server.MAX_LOCAL_TRANSCRIPT_LINE_BYTES)
        self.assertEqual(server.MAX_LOCAL_TRANSCRIPT_BYTES, 256 * MIB)
        self.assertEqual(claude.MAX_TEXT_CHARS, 4 * MIB)
        self.assertEqual(codex.NATIVE_PROOF_TEXT_CHARS, 4 * MIB)

    def test_image_and_tool_records_above_old_limit_preserve_surrounding_messages(self):
        for backend in ("claude", "codex"):
            with self.subTest(backend=backend):
                raw = b"".join(encoded(record) for record in (
                    message(backend, "Before"), large_record(backend), message(backend, "After"),
                ))
                self.path.write_bytes(raw)
                parser = server.parse_claude_history if backend == "claude" else server.parse_codex_history
                items = parser(self.path, None)
                self.assertEqual([item["text"] for item in items],
                    ["Before", "Image caption 中文", "After"] if backend == "claude" else ["Before", "After"])
                self.assertEqual(self.path.read_bytes(), raw)

    def test_large_record_survives_serialized_cursor_and_followup_without_replay(self):
        for backend in ("claude", "codex"):
            with self.subTest(backend=backend):
                sess = {"id": f"test-{backend}", "backend": backend,
                    "claude_session_id" if backend == "claude" else "codex_thread_id": PROVIDER}
                self.path.write_bytes(encoded(message(backend, "Before")))
                with patch.object(server, "provider_history_path", return_value=self.path):
                    _, first, cursor, _ = server.load_provider_history_with_cursor(sess, None, None)
                    with self.path.open("ab") as stream:
                        stream.write(encoded(large_record(backend)))
                        stream.write(encoded(message(backend, "After")))
                    _, delta, current, continued = server.load_provider_history_with_cursor(sess, None, json.loads(json.dumps(cursor)))
                    _, repeated, final, _ = server.load_provider_history_with_cursor(sess, None, json.loads(json.dumps(current)))
                self.assertEqual([item["text"] for item in first], ["Before"])
                self.assertEqual([item["text"] for item in delta],
                    ["Image caption 中文", "After"] if backend == "claude" else ["After"])
                self.assertTrue(continued)
                self.assertEqual(repeated, [])
                self.assertEqual(final["source_offset"], self.path.stat().st_size)
                self.assertEqual(final["source_digest"], hashlib.sha256(self.path.read_bytes()).hexdigest())

    def test_partial_large_record_is_consumed_only_when_completed(self):
        raw = encoded(large_record("codex"))
        self.path.write_bytes(raw[:-1])
        incomplete, _ = server.provider_history_source_snapshot(self.path, None)
        self.assertEqual(incomplete["source_offset"], 0)
        with self.path.open("ab") as stream:
            stream.write(b"\n")
        complete, _ = server.provider_history_source_snapshot(self.path, None)
        self.assertEqual(complete["source_offset"], len(raw))
        self.assertEqual(complete["source_digest"], hashlib.sha256(raw).hexdigest())

    def test_exact_32_mib_record_including_newline_is_accepted_by_every_reader(self):
        prefix, suffix = b'{"type":"tool","padding":"', b'"}\n'
        with self.path.open("wb") as stream:
            stream.write(prefix)
            stream.write(b"x" * (32 * MIB - len(prefix) - len(suffix)))
            stream.write(suffix)
        self.assertEqual(sum(1 for _ in server.bounded_jsonl_events(self.path)), 1)
        self.assertEqual(sum(1 for _ in server.bounded_jsonl_records_range(self.path, 0, 32 * MIB, expected_stat=self.stamp())), 1)
        self.assertEqual(sum(1 for _ in claude._records(self.path, claude._stamp(self.path))), 1)
        self.assertEqual(sum(1 for _ in codex._native_records(self.path, codex._native_stamp(self.path), codex._NativeReadBudget())), 1)
        snapshot, _ = server.provider_history_source_snapshot(self.path, None)
        self.assertEqual(snapshot["source_offset"], 32 * MIB)

    def test_one_byte_over_limit_is_rejected_without_hiding_following_records(self):
        with self.path.open("wb") as stream:
            stream.write(b"{}\n" * 90)
            stream.write(b'"' + b"x" * (32 * MIB - 2) + b'"\n')
            stream.write(encoded(message("claude", "Must not report a successful partial import")))
        with self.assertRaisesRegex(ValueError, "line 91 exceeds the 32 MiB per-record import limit"):
            list(server.bounded_jsonl_events(self.path))
        with self.assertRaisesRegex(ValueError, "cursor line 91 exceeds the 32 MiB"):
            list(server.bounded_jsonl_records_range(self.path, 0, self.path.stat().st_size, expected_stat=self.stamp()))
        with self.assertRaises(claude._Unproven):
            list(claude._records(self.path, claude._stamp(self.path)))
        with self.assertRaises(codex._Unproven):
            list(codex._native_records(self.path, codex._native_stamp(self.path), codex._NativeReadBudget()))

    def test_total_file_cap_is_still_enforced_before_reading(self):
        with self.path.open("wb") as stream:
            stream.truncate(256 * MIB + 1)
        with self.assertRaisesRegex(ValueError, "268435456-byte import limit"):
            list(server.bounded_jsonl_events(self.path))

