import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
const require = createRequire(import.meta.url)
const React = require('react')
const { act, create } = require('react-test-renderer')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pairing-ui-'))
const outfile = path.join(work, 'component.cjs')
await build({ entryPoints: ['src/components/ServerPairing.tsx'], outfile, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  plugins: [{ name: 'native-fixtures', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime)$/ }, args => ({ path: require.resolve(args.path), external: true }))
    builder.onResolve({ filter: /^(react-native|expo-camera|expo-image-picker)$|\/theme$|\/AppText$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents:
      args.path === 'react-native' ? `exports.ActivityIndicator='Spinner'; exports.Pressable='Button'; exports.ScrollView='Scroll'; exports.View='View'; exports.StyleSheet={create:x=>x}; exports.AppState={currentState:'active',addEventListener:()=>({remove(){}})}; exports.Linking={openSettings:async()=>{}};`
      : args.path === 'expo-camera' ? `exports.CameraView='Camera'; exports.useCameraPermissions=()=>[{granted:true},async()=>{}]; exports.scanFromURLAsync=async()=>[{data:globalThis.pairingFixtureLink}];`
      : args.path === 'expo-image-picker' ? `exports.launchImageLibraryAsync=async()=>({canceled:false,assets:[{uri:'file:///fixture.png'}]});`
      : args.path.endsWith('/theme') ? `exports.usePalette=()=>({text:'#111',muted:'#666',border:'#ccc'});`
      : `exports.Text='Text';`, loader: 'js' }))
  } }], logLevel: 'silent' })
const { ServerPairing } = require(outfile)
fs.rmSync(work, { recursive: true, force: true })
const token = 'synthetic-ui-credential'
const link = `agentsdock://connect#${new URLSearchParams({ v: '1', url: 'http://192.168.1.2:7851', token, identity: 'fixture', name: 'Work' })}`
const press = (tree, label) => tree.root.findAllByType('Button').find(button => button.props.accessibilityLabel === label).props.onPress()

test('incoming link shows confirmation without network or plaintext token, then connects once', async () => {
  let tree, health = 0, saved = 0, switched = 0
  const props = { initialLink: link, profiles: [], onClose() {}, onConnected() {},
    onTestConnection: async () => { health++; return { ok: true, server_identity: 'fixture' } },
    onCreateProfile: async input => { assert.equal(input.accessToken, token); saved++; return 'profile' },
    onUpdateProfile: async () => { throw new Error('must not update') },
    onSwitchProfile: async () => { switched++; return true },
  }
  await act(async () => { tree = create(React.createElement(ServerPairing, props)) })
  assert.equal(health, 0)
  assert.ok(JSON.stringify(tree.toJSON()).includes('192.168.1.2'))
  assert.ok(!JSON.stringify(tree.toJSON()).includes(token))
  await act(async () => { press(tree, 'Connect and save'); press(tree, 'Connect and save') })
  assert.deepEqual([health, saved, switched], [1, 1, 1])
  await act(async () => tree.unmount())
})

test('camera callbacks and imported QR images require confirmation; rejected health does not save', async () => {
  let tree, health = 0, saved = 0
  const props = { profiles: [], onClose() {}, onConnected() {},
    onTestConnection: async () => { health++; throw new Error(token) },
    onCreateProfile: async () => { saved++; return 'profile' }, onUpdateProfile: async () => {}, onSwitchProfile: async () => true }
  await act(async () => { tree = create(React.createElement(ServerPairing, props)) })
  await act(async () => tree.root.findByType('Camera').props.onBarcodeScanned({ data: link }))
  assert.equal(health, 0)
  await act(async () => press(tree, 'Connect and save'))
  assert.equal(health, 1); assert.equal(saved, 0)
  assert.ok(!JSON.stringify(tree.toJSON()).includes(token))
  await act(async () => press(tree, 'Scan another QR'))
  globalThis.pairingFixtureLink = link
  await act(async () => press(tree, 'Choose QR image'))
  assert.equal(health, 1)
  assert.ok(JSON.stringify(tree.toJSON()).includes('Connect and save'))
  await act(async () => tree.unmount())
  delete globalThis.pairingFixtureLink
})
