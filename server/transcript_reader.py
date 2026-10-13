"""Bounded-memory projection of native JSONL, with exact raw-byte receipts.

Opaque media/tool fields stay in the provider-owned file. This reader validates
all JSON, including skipped strings, but only materializes history metadata and
text. Bounds apply to retained JSON/work, never to opaque payload/file bytes.
"""
from __future__ import annotations

import codecs
import json
import re
import time
from dataclasses import dataclass
from typing import BinaryIO, Callable

CHUNK_BYTES = 64 * 1024
MAX_RETAINED_BYTES = 32 * 1024 * 1024
MAX_DEPTH = 96
MAX_NODES = 250_000
SCAN_SECONDS = 60.0
_SPECIAL = re.compile(rb'["\\\x00-\x1f]')
_NUMBER = re.compile(rb'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\Z')
_HEX = frozenset(b'0123456789abcdefABCDEF')


class TranscriptBudgetExceeded(ValueError):
    """Never treat exhausted work/memory as an ignorable malformed record."""


class InvalidRecord(ValueError):
    pass


def scan_check(deadline: float, cancelled: Callable[[], bool] | None = None):
    if cancelled is not None and cancelled():
        raise TranscriptBudgetExceeded('transcript scan cancelled')
    if time.monotonic() >= deadline:
        raise TranscriptBudgetExceeded('transcript scan exceeded its processing time budget')


def opaque_path(path: tuple) -> bool:
    # These fields never feed text_from_content, native user/assistant matching,
    # ownership/turn metadata or goal/wake classification. Do not skip arbitrary
    # `content`, `text`, `message`, thinking or unknown fields.
    if path == ('payload', 'output'):
        return True  # Codex function/custom tool output, not assistant text.
    for prefix in (('message', 'content'), ('payload', 'content')):
        if len(path) > 3 and path[:2] == prefix and isinstance(path[2], int):
            tail = path[3:]
            if prefix == ('message', 'content') and tail in (('content',), ('input',)):
                return True  # Claude tool result/body and tool invocation arguments.
            if tail in (('source', 'data'), ('image_url',), ('image_url', 'url')):
                return True
    return False


@dataclass(frozen=True)
class RawRecord:
    stream: BinaryIO
    start: int
    end: int
    complete: bool
    blank: bool
    malformed: bool
    deadline: float
    cancelled: Callable[[], bool] | None = None

    def __len__(self):
        return self.end - self.start

    def update_hash(self, digest):
        # Restore the parser's stream position; this also works on Windows,
        # where pread is unavailable. Each iterator owns this file handle.
        saved = self.stream.tell()
        try:
            self.stream.seek(self.start)
            remaining = len(self)
            while remaining:
                scan_check(self.deadline, self.cancelled)
                chunk = self.stream.read(min(CHUNK_BYTES, remaining))
                if not chunk:
                    raise ValueError('transcript was truncated during record hashing')
                digest.update(chunk)
                remaining -= len(chunk)
        finally:
            self.stream.seek(saved)



class _RecordParser:
    def __init__(self, stream, end, deadline, cancelled, project, maximum):
        self.stream, self.end = stream, end
        self.deadline, self.cancelled, self.project = deadline, cancelled, project
        self.buffer, self.index, self.final, self.complete = b'', 0, False, False
        self.retained, self.nodes, self.maximum = 0, 0, maximum

    def fill(self):
        if self.index < len(self.buffer):
            return True
        if self.final:
            return False
        scan_check(self.deadline, self.cancelled)
        remaining = self.end - self.stream.tell()
        self.buffer = self.stream.readline(min(CHUNK_BYTES, remaining)) if remaining > 0 else b''
        self.index = 0
        self.complete = self.buffer.endswith(b'\n')
        self.final = self.complete or not self.buffer or self.stream.tell() >= self.end
        return bool(self.buffer)

    def peek(self):
        return self.buffer[self.index] if self.fill() else None

    def take(self):
        value = self.peek()
        if value is None:
            raise InvalidRecord('incomplete JSON record')
        self.index += 1
        return value

    def space(self):
        while self.peek() in (9, 10, 13, 32):
            self.index += 1

    def reserve(self, size):
        self.retained += size
        if self.retained > self.maximum:
            raise TranscriptBudgetExceeded(f'transcript retained text/metadata exceeds the {self.maximum / (1024 * 1024):g} MiB memory budget')

    def string(self, retain, key=False):
        if self.take() != 34:
            raise InvalidRecord('JSON string expected')
        parts = bytearray(b'"') if retain else None
        decoder = codecs.getincrementaldecoder('utf-8')()
        size = 0
        while self.fill():
            match = _SPECIAL.search(self.buffer, self.index)
            stop = match.start() if match else len(self.buffer)
            piece = self.buffer[self.index:stop]
            decoder.decode(piece, final=False)
            if retain:
                self.reserve(len(piece)); parts.extend(piece)
                size += len(piece)
                if key and size > 4096:
                    raise TranscriptBudgetExceeded('transcript JSON key exceeds metadata budget')
            self.index = stop
            if match is None:
                continue
            special = self.take()
            if special == 34:
                decoder.decode(b'', final=True)
                if retain:
                    parts.append(34)
                    return json.loads(parts)
                return None
            if special != 92:
                raise InvalidRecord('control character in JSON string')
            # Escapes are ASCII boundaries: a partial UTF-8 codepoint here is
            # invalid, including in a discarded field.
            decoder.decode(b'', final=True)
            decoder = codecs.getincrementaldecoder('utf-8')()
            escape = self.take()
            raw = bytes((92, escape))
            if escape == 117:
                suffix = bytes(self.take() for _ in range(4))
                if any(value not in _HEX for value in suffix):
                    raise InvalidRecord('invalid JSON Unicode escape')
                raw += suffix
            elif escape not in b'"\\/bfnrt':
                raise InvalidRecord('invalid JSON escape')
            if retain:
                self.reserve(len(raw)); parts.extend(raw)
                size += len(raw)
                if key and size > 4096:
                    raise TranscriptBudgetExceeded('transcript JSON key exceeds metadata budget')
        raise InvalidRecord('unterminated JSON string')

    def value(self, path=(), retain=True, depth=0):
        self.nodes += 1
        if depth > MAX_DEPTH or self.nodes > MAX_NODES:
            raise TranscriptBudgetExceeded('transcript JSON structure exceeds processing budget')
        self.space()
        if self.project and opaque_path(path):
            retain = False
        if retain:
            self.reserve(64)  # Bound object overhead as well as string bytes.
        first = self.peek()
        if first == 34:
            return self.string(retain)
        if first in (123, 91):
            self.take()
            obj = first == 123
            result = ({} if obj else []) if retain else None
            close = 125 if obj else 93
            self.space()
            if self.peek() == close:
                self.take(); return result
            index = 0
            while True:
                if obj:
                    self.space()
                    key = self.string(True, key=True)
                    self.space()
                    if self.take() != 58:
                        raise InvalidRecord('JSON colon expected')
                else:
                    key = index
                value = self.value(path+(key,), retain, depth+1)
                if retain:
                    if obj: result[key] = value
                    else: result.append(value)
                self.space()
                delimiter = self.take()
                if delimiter == close:
                    return result
                if delimiter != 44:
                    raise InvalidRecord('JSON comma expected')
                index += 1
        token = bytearray()
        while self.peek() is not None and self.peek() not in b' \r\n\t,]}':
            token.append(self.take())
            if len(token) > 1024:
                raise TranscriptBudgetExceeded('transcript JSON scalar exceeds metadata budget')
        raw = bytes(token)
        if raw not in (b'true', b'false', b'null', b'NaN', b'Infinity', b'-Infinity') and not _NUMBER.fullmatch(raw):
            raise InvalidRecord('invalid JSON scalar')
        return json.loads(raw) if retain else None

    def drain(self):
        while self.fill():
            self.index = len(self.buffer)


def jsonl_records(stream: BinaryIO, *, end: int, project=True, strict=False,
                  require_newline=True, max_records=250_000, deadline=None,
                  cancelled=None, max_retained_bytes=MAX_RETAINED_BYTES):
    """Yield (projected object or None, ending offset, RawRecord).

    Malformed provider lines may be represented by None, as before. Resource
    exhaustion always raises, so callers never commit a partial-success cursor.
    A fixed end excludes concurrent appends; callers own file identity checks.
    """
    deadline = time.monotonic() + SCAN_SECONDS if deadline is None else deadline
    count = 0
    while stream.tell() < end:
        count += 1
        if count > max_records:
            raise TranscriptBudgetExceeded('transcript record count exceeds processing budget')
        start = stream.tell()
        parser = _RecordParser(stream, end, deadline, cancelled, project, max_retained_bytes)
        blank = False
        malformed = False
        try:
            parser.space()
            blank = parser.peek() is None
            value = None if blank else parser.value()
            parser.space()
            if parser.peek() is not None:
                raise InvalidRecord('trailing JSON content')
        except (InvalidRecord, UnicodeDecodeError, json.JSONDecodeError) as error:
            if strict:
                raise ValueError('malformed transcript record') from error
            parser.drain()
            malformed = True
            value = None
        stop = stream.tell()
        if stop <= start:
            raise ValueError('transcript was truncated during reading')
        if require_newline and not parser.complete:
            raise ValueError('transcript cursor does not end on a complete line')
        raw = RawRecord(stream, start, stop, parser.complete, blank, malformed or blank, deadline, cancelled)
        if strict and not isinstance(value, dict):
            raise ValueError('transcript object expected')
        yield value if isinstance(value, dict) else None, stop, raw
