# Large native transcript records

Claude and Codex imports accept individual JSONL records up to **32 MiB**,
including the terminating newline. The former 4 MiB bound could reject a chat
containing an embedded image or large tool response even when its visible
conversation was short. A reported `line 91` is a physical transcript record,
not the ninety-first chat message or the model context limit.

Initial import, cursor-based synchronization, native history proof readers and
the existing fork readers use the same record bound. Source files remain
read-only. Oversized records fail explicitly; they are not silently skipped to
produce a successful but incomplete import.

Other limits remain unchanged: the import file cap is 256 MiB, the scan cap is
250,000 records, and existing displayed-text, message and aggregate proof
budgets still apply. Proof text has a separate 4 Mi-character bound. This change
does not increase model context, guarantee that every large transcript is
importable, or remove memory/deadline protections.

After the server containing this fix is installed, retry the original transcript
in **Import chats**. No edit or truncation of the provider's original history is
required for records within the new bound. A record larger than 32 MiB or a file
over 256 MiB still requires a separate investigation.

Regression coverage lives in `tests/test_large_transcript_import.py`, with
additional large-media/tool provenance cases in the Claude and Codex history
repair suites. It covers exact boundaries, partial lines, serialized cursors,
repeated synchronization, surrounding messages and unchanged source bytes.
