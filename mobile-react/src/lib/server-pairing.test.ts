import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const { connectionLink } = createRequire(resolve('package.json'))('../server/npm/agentsdock/pair.cjs')
import { parseServerConnectionLink, serverConnectionLink } from './server-connection-link'
import { serverConnectionLink as desktopLink } from '../../../electron/src/shared/server-connection-link'
import { connectPairedServer, type PairingActions } from './server-pairing'
import type { ServerProfileListItem } from './server-profile-ui'

const details = { name: '工作电脑 & test', serverUrl: 'http://192.168.1.3:7851', accessToken: 'synthetic+&?#=', serverIdentity: 'server-one' }
assert.equal(connectionLink(details), desktopLink(details))
assert.equal(connectionLink(details), serverConnectionLink(details))
assert.deepEqual(parseServerConnectionLink(connectionLink(details)), details)
// Exercise the URL implementation installed by Expo's native runtime, too.
const localRequire = createRequire(resolve('package.json'))
const nativeURL = createRequire(localRequire.resolve('expo/package.json'))('whatwg-url-minimum')
const originalURL = globalThis.URL, originalParams = globalThis.URLSearchParams
try {
  globalThis.URL = nativeURL.URL
  globalThis.URLSearchParams = nativeURL.URLSearchParams
  assert.deepEqual(parseServerConnectionLink(connectionLink(details)), details)
} finally { globalThis.URL = originalURL; globalThis.URLSearchParams = originalParams }
for (const link of ['agentsdock://connect#v=2', 'agentsdock://connect#v=1&token=a&token=b&url=http://host',
  'agentsdock://connect?token=x#v=1', 'agentsdock://terminal#v=1',
  'agentsdock://connect#v=1&url=http://host&token=', `agentsdock://connect#${'x'.repeat(2000)}`]) {
  assert.throws(() => parseServerConnectionLink(link))
}
function fixture(profiles: ServerProfileListItem[] = []) {
  const calls: string[] = []
  const actions: PairingActions = {
    profiles,
    onTestConnection: async input => { assert.equal(input.accessToken, details.accessToken); calls.push('health'); return { ok: true, server_identity: 'server-one' } },
    onCreateProfile: async input => { assert.equal(input.serverIdentity, 'server-one'); calls.push('create'); return 'new-profile' },
    onUpdateProfile: async (id, patch) => { assert.equal(patch.serverIdentity, 'server-one'); calls.push(`update:${id}`) },
    onSwitchProfile: async id => { calls.push(`switch:${id}`); return true },
  }
  return { calls, actions }
}
const fresh = fixture()
await connectPairedServer(details, fresh.actions)
assert.deepEqual(fresh.calls, ['health', 'create', 'switch:new-profile'])
const existing = { id: 'saved', serverUrl: 'http://100.64.0.3:7851', serverIdentity: 'server-one' } as ServerProfileListItem
const repeated = fixture([existing])
await connectPairedServer(details, repeated.actions)
assert.deepEqual(repeated.calls, ['health', 'update:saved', 'switch:saved'])
const wrongQR = fixture()
await assert.rejects(connectPairedServer({ ...details, serverIdentity: 'wrong' }, wrongQR.actions), /identity/)
assert.deepEqual(wrongQR.calls, ['health'])
const sameURLWrongIdentity = fixture([{ ...existing, serverUrl: details.serverUrl, serverIdentity: 'other-server' }])
await assert.rejects(connectPairedServer(details, sameURLWrongIdentity.actions), /different saved server/)
assert.deepEqual(sameURLWrongIdentity.calls, ['health'])
const canceled = fixture()
await assert.rejects(connectPairedServer(details, canceled.actions, () => false), /canceled/)
assert.deepEqual(canceled.calls, ['health'])
const denied = fixture()
denied.actions.onTestConnection = async () => { throw new Error('401') }
await assert.rejects(connectPairedServer(details, denied.actions))
assert.deepEqual(denied.calls, [])
console.log('Pairing contract, verification, deduplication, cancellation and rejection tests passed.')
