# Queue recovery and emergency acknowledgement acceptance

This matrix covers failed queue restoration, emergency receipt scans, and their
interaction with desktop connection/update status. It does not establish the
cause of an individual remote installation's failure.

## Test cases

| Case | Action | Expected result | Coverage |
| --- | --- | --- | --- |
| Healthy startup | Connect, send, follow up, refresh and reopen a disposable chat | Chat admission is ready; messages and history work | Native Electron and real provider; automated HTTP |
| Pending recovery | Hold restoration while several callers send | Bounded 503 responses; shared recovery keeps running | Automated async admission |
| Recovery fails | Finish restoration with TimeoutError or OSError; repeat Send and Refresh | Health stays accessible but chat readiness is failed; clear error, no false progress or lost draft/history | Automated HTTP; native Electron against isolated failing server |
| Caller cancels | Cancel a waiting HTTP/admission task | Shared restoration is not cancelled | Automated admission |
| Recovery owner | Queue work from the restoration task itself | No self-deadlock | Automated admission |
| Restored work ordering | Restore durable messages before allowing new work | No lost messages or new work jumping ahead | Queue and split gateway/worker integration |
| Large text event | Put a generated 256 MiB event after a synthetic alert, then acknowledge over loopback HTTP | Exactly one acknowledgement within the client deadline | Real HTTP performance fixture |
| Large structured event | Put more than 250,000 irrelevant JSON values after an alert | Acknowledgement succeeds without applying native-import budgets to the journal | Automated server regression |
| Metadata projection | Scan large discarded object keys and nested payloads | Bounded retained metadata; native import defaults remain unchanged | Parser and import compatibility |
| Duplicate clicks | Eight concurrent authenticated acknowledgements and a later retry | One durable receipt; retries report no new acknowledgement | Automated HTTP; sequential native UI/HTTP retry |
| Wrong authority or target | Omit token, change alert ID or chat | Request rejected; original journal unchanged | Automated HTTP |
| Concurrent projection | Append/ack while projection scans; fail persistence | No global-store lock held through scan, stale resurrection or false committed success | Emergency lifecycle regressions |
| Desktop update status | Report matching versions with recovering/failed chat admission | Pending/failed rather than complete; recovery can clear status | Desktop coordinator and service tests |
| Older server | Omit the new readiness field | Existing connection/update behavior retained | Desktop compatibility tests |
| Update activation | Exercise preparation, held gateway, failed activation and recovery | Existing work/state preserved; exact hold released; safe retry/rollback | Isolated worker/gateway processes and installer regression fixtures |

## Recorded results

On macOS, the following targeted groups passed:

- 195 recovery, emergency, transcript and authority checks.
- 203 preparation, durability, gateway/worker startup and rollback checks.
- 99 import/history compatibility and admission checks (overlaps the first group).
- 487 desktop coordinator/service checks.
- Earlier validation of the desktop changes passed TypeScript checking,
  production compilation, bundle audit and strict local ad-hoc signing, plus
  the complete desktop suite: 5,142 passed and five skipped.

The expanded tests exposed a genuine regression in the initial streaming fix:
large structured tool output still hit the native transcript import value-count
budget. The added test failed before the correction and passed afterward.
Journal projections now have separate structural limits; native imports retain
their original default limits.

The repeat 256 MiB synthetic HTTP acknowledgement completed in 1.58 seconds.
The original stable implementation exceeded a 30-second client deadline for
that fixture. Timing is local evidence, not a latency promise for arbitrary
hardware or history.

An isolated native Electron window used the production client transport against
a real HTTP server with an injected recovery failure. Send showed the explicit
failure and preserved its draft. Refresh remained truthful, and server
selection stayed accessible. Provider execution was disabled for this failure
fixture. The healthy path was separately exercised with a real Codex request
and a provider-created synthetic alert; one UI acknowledgement cleared the
alert, and a repeated request did not create another receipt. The additional
server fix was installed on the designated idle test instance from commit
`fd4cb2ed`; its identity, token and all existing chat IDs/titles were preserved.
The native test app was then closed and reopened. The acknowledged state stayed
cleared, the earlier history was visible, and a contextual follow-up returned
the code supplied in the first turn. Disposable chat and client credentials
were removed after validation.

## Repeating automated checks

Use an isolated HOME, state/config directories and native temporary storage;
never inject recovery errors into a working user's state. From `server/`, use
the project's Python environment:

```sh
python -m unittest \
  tests.test_emergency_alerts tests.test_transcript_reader \
  tests.test_queue_steer tests.test_consumed_queue_recovery \
  tests.test_durable_team_mail_grants_isolated \
  tests.test_provider_chat_pairs_isolated

python -m unittest \
  tests.test_execution_preparation tests.test_execution_durability \
  tests.test_execution_startup_integration tests.test_execution_gateway_integration \
  tests.test_execution_recovery tests.test_execution_recovery_status \
  tests.test_update_recovery tests.test_activation_transaction \
  tests.test_installer_activation_recovery tests.test_installer_preparation

python -m unittest tests.test_transcript_reader \
  tests.test_large_transcript_import tests.test_provider_history_sync \
  tests.test_queue_steer.StartupQueueRecoveryAdmissionTests
```

From `electron/`:

```sh
pnpm exec vitest run src/main/coordinated-updates.test.ts src/main/service.test.ts
```

## Boundaries

- Do not interpret an accessible health endpoint as permission to admit chat
  work after restoration fails. Preserving saved work takes priority.
- Failure classification does not repair an unknown disk, state or provider
  failure. Repeated real failures still need their server logs.
- Real worker/gateway tests cover isolated processes. Several activation tests
  use native-service fixtures; they are not a public release/update journey.
- macOS testing cannot establish Linux systemd or Windows native restart
  behavior. No Linux-native claim is made by this test run.
- Only the designated local test server was updated. These changes are not a
  published desktop/server release.
